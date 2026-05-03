const fs = require("node:fs")
const path = require("node:path")
const childProc = require("node:child_process")
const EventEmitter = require("node:events")
const dotenv = require("dotenv")
const { Rcon } = require("rcon-client")
const { Client, GatewayIntentBits, EmbedBuilder } = require("discord.js")
const { GameDig } = require("gamedig")
const CACJSversion = "v1.1.0-beta17 (plugins)"
const processId = process.pid.toString()
const emitter = new EventEmitter()
process.title = "CrossArkChat.js"

console.log(`CrossArkChat.JS ${CACJSversion}`)
console.log(`(C) Acedia 2026`)
console.log(`PID: ${processId}`)
console.log(``)

// PID
fs.writeFileSync(path.join(__dirname, "PID.txt"), processId)

// Config
function loadConfig() {
  console.log("[CrossArkChat] Loading Config...")

  if (fs.existsSync(path.join(__dirname, "config.js"))) {
    delete require.cache[require.resolve(path.join(__dirname, "config.js"))]
    console.log(`[CrossArkChat] Loaded config.js`)
    return require(path.join(__dirname, "config.js"))
  }

  if (fs.existsSync(path.join(__dirname, "config.json"))) {
    delete require.cache[require.resolve(path.join(__dirname, "config.json"))]
    console.log(`[CrossArkChat] Loaded config.json`)
    return require(path.join(__dirname, "config.json"))
  }

  throw new Error(`[CrossArkChat] Unable To Locate A Config File...`)
}

let config = loadConfig()
dotenv.config()
console.log(``)

// States
let client = null
let clientReady = false
let arkAgents = []

// Message Caches
let cache = {}
let saveCacheTimeout = null
if (fs.existsSync(path.join(__dirname, "cache.json"))) {
  try {
    cache = require(path.join(__dirname, "cache.json"))
  } catch {
    cache = {}
  }
}
let prebuiltCaches = ["TribeLogs", "Discord"]
for (const cacheKey of prebuiltCaches) {
  cache[cacheKey] ??= {}
  cache[cacheKey].messages ??= []
  cache[cacheKey].players ??= []
}

let lastSavedCache = JSON.stringify(cache, null, 2)
function saveCache() {
  if (saveCacheTimeout) return

  saveCacheTimeout = setTimeout(() => {
    let serialized = JSON.stringify(cache, null, 2)

    if (serialized === lastSavedCache) {
      saveCacheTimeout = null
      return
    }

    fs.writeFileSync(path.join(__dirname, "cache.json"), serialized)

    lastSavedCache = serialized
    saveCacheTimeout = null
  }, 1000)
}

setInterval(() => {
  saveCache()
}, 1000)

// Sleep
async function sleep(ms) {
  await new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve()
    }, ms)
  })
}

// Strips Log Entry Starting Portion
function stripLogEntryId(line) {
  return line
    .replace(/^\[.*?\]\d+\]/, "")
    .replace(/^\d{4}\.\d{2}\.\d{2}_\d{2}\.\d{2}\.\d{2}:\s*/, "")
    .trim()
}

// Formatter
function formatMessage(packet) {
  function applyReplacements(text = "", replacements = []) {
    for (const replacement of replacements) {
      if (!replacement) continue

      const from = replacement.from
      const to = replacement.to

      if (!from || to === undefined) continue

      if (from instanceof RegExp) {
        text = text.replace(from, to)
      } else {
        text = text.replaceAll(from, to)
      }
    }

    return text
  }

  function replaceVars(template = "", text) {
    let now = new Date().toLocaleString()
    let associatedServer = config.servers.find((server) => server.name == packet.server)

    const definitions = {
      name: packet.server,
      serverName: packet.server,
      serverId: packet.server,
      map: packet.server,

      player: packet.player,
      user: packet.player,

      tribeName: packet.metadata?.tribeName,

      tribeId: packet.metadata?.tribeId,

      text: text,
      message: text,

      joinLink: associatedServer?.joinLink || "",
      invite: associatedServer?.joinLink || "",

      dateTime: now,
      time: now,
    }

    return template
      .replace(/\{(\w+)\}/g, (match, key) => {
        return definitions[key] ?? match
      })
      .replace(/\s{2,}/g, " ")
  }
  const text = (packet.text || "").replace(/\s+/g, " ").trim()

  const formats = config.formats || {}
  const replacements = config.replacements || {}

  // Template Loading
  let arkTemplate = formats.toServers?.[packet.type] || "[{serverName}] {player}: {text}"
  let discordTemplate = formats.toDiscord?.[packet.type] || "[{serverName}] {player}: {text}"
  let consoleTemplate = formats.toConsole?.[packet.type] || "[{serverName}] {player}: {text}"

  return {
    ark: replaceVars(arkTemplate, applyReplacements(text, replacements.toServers || [])),
    discord: replaceVars(discordTemplate, applyReplacements(text, replacements.toDiscord || [])),
    console: replaceVars(consoleTemplate, applyReplacements(text, replacements.toConsole || [])),
  }
}

function splitMessage(message, max = 250) {
  const words = message.split(/\s+/)
  const chunks = []

  let current = ""

  for (const word of words) {
    const test = current ? `${current} ${word}` : word

    if (test.length <= max) {
      current = test
    } else {
      if (current) chunks.push(current)
      current = word
    }
  }

  if (current) {
    chunks.push(current)
  }

  return chunks
}

// Packet Handler (Relay Layer)
let tribeLogTimer = null
let tribeLogFlushTiming = 0

let chatLogTimer = null
let chatLogFlushTiming = 0

const typeExclusions = ["tribeLogs", "leftovers"]
function cachePacket(packet, cacheKey, prepend = false) {
  cache[cacheKey] ??= {}
  cache[cacheKey].messages ??= []
  if (prepend) cache[cacheKey].messages.unshift(packet)
  else cache[cacheKey].messages.push(packet)
  saveCache()
}

function queuePacket(packet) {
  if (!config.broadcast.toDiscord[packet.type]) return

  if (typeExclusions.includes(packet.type)) {
    cachePacket(packet, "TribeLogs")
    if (!tribeLogTimer) {
      tribeLogTimer = setTimeout(sendTribeLogs, 2000)
    }
    return
  }

  const channelId = config.discord.channels[packet.type] || config.discord.channels.chat
  const channel = client?.channels.cache.get(channelId)

  if (!channel) {
    cachePacket(packet, "Discord")
    if (!chatLogTimer) chatLogTimer = setTimeout(sendChatLogs, 2000)
    return
  }

  const formatted = formatMessage(packet)
  const chunks = splitMessage(formatted.discord, 2000)

  let failed = false
  for (const chunk of chunks) {
    channel.send(chunk).catch(() => {
      if (!failed) {
        failed = true
        cachePacket(packet, "Discord", true)
        if (!chatLogTimer) chatLogTimer = setTimeout(sendChatLogs, 2000)
      }
    })
  }
}

function handlePacket(packet) {
  const formatted = formatMessage(packet)

  // Log to Console
  if (config.broadcast.toConsole[packet.type] || config.broadcast.toConsole.leftovers) {
    console.log(formatted.console)
  }

  // Send to ARK
  arkAgents.forEach((agent) => {
    let isOrigin = agent.name === packet.origin
    if (config.broadcast.toServers[packet.type] === true && isOrigin === false) {
      let chunks = splitMessage(formatted.ark)
      for (let chunk of chunks) {
        agent.send(chunk)
      }
    }
  })

  // Send to Discord
  if (packet.origin !== "discord" && config.discord.enabled === true) {
    if (clientReady) {
      queuePacket(packet)
    } else {
      cachePacket(packet, "Discord")
    }
  }

  emitter.emit("packet", packet)
}

async function sendTribeLogs(force = false) {
  try {
    if (!force) {
      const now = Date.now()

      if (now - tribeLogFlushTiming > 10000) {
        tribeLogFlushTiming = now

        setTimeout(() => {
          sendTribeLogs(true).catch(() => {})
        }, 10000)
      }
    }

    if (cache.TribeLogs.messages?.length == 0) return

    const batch = cache.TribeLogs.messages.splice(0)

    const embeds = batch
      .map((packet) => {
        const channel = client.channels.cache.get(config.discord.channels[packet.type] || config.discord.channels.tribeLogs)

        if (!channel) return null

        const meta = packet.metadata || {}
        const embed = new EmbedBuilder()

        switch (packet.type) {
          case "tribeLogs": {
            embed.setTitle(`[${packet.origin}] ${meta.tribeName ?? "Unknown Tribe"} (ID: ${meta.tribeId ?? "?"})`)
            break
          }

          case "leftovers": {
            embed.setTitle(`[${packet.origin}] Leftover Logs`)
            break
          }
        }

        embed
          .setDescription(packet.text)
          .setTimestamp()
          .setColor(meta.color ?? "#2f3136")

        return {
          embed,
          packet,
          channelId: channel.id,
        }
      })
      .filter((embedData) => embedData !== null)

    const grouped = {}

    for (const item of embeds) {
      grouped[item.channelId] ??= []
      grouped[item.channelId].push(item)
    }

    for (const channelId in grouped) {
      const channel = client.channels.cache.get(channelId)
      if (!channel) continue

      const items = grouped[channelId]

      for (let index = 0; index < items.length; index += 10) {
        const chunk = items.slice(index, index + 10)

        try {
          await channel.send({
            embeds: chunk.map((embedData) => {
              return embedData.embed
            }),
          })
        } catch {
          cache.TribeLogs.messages.unshift(
            ...chunk.map((embedData) => {
              return embedData.packet
            }),
          )

          saveCache()
          break
        }
      }
    }
  } finally {
    tribeLogTimer = null
  }
}

async function sendChatLogs(force = false) {
  try {
    if (!force) {
      const now = Date.now()
      if (now - chatLogFlushTiming > 10000) {
        chatLogFlushTiming = now
        setTimeout(() => {
          sendChatLogs(true).catch(() => {})
        }, 10000)
      }
    }

    if (cache.Discord.messages?.length === 0) return

    const batch = cache.Discord.messages.splice(0)
    const grouped = {}

    for (const packet of batch) {
      const channelId = config.discord.channels[packet.type] || config.discord.channels.chat
      grouped[channelId] ??= []
      grouped[channelId].push(packet)
    }

    for (const channelId in grouped) {
      const channel = client.channels.cache.get(channelId)

      if (!channel) {
        cache.Discord.messages.unshift(...grouped[channelId])
        saveCache()
        continue
      }

      for (const packet of grouped[channelId]) {
        const formatted = formatMessage(packet)
        const chunks = splitMessage(formatted.discord, 2000)

        let failed = false
        for (const chunk of chunks) {
          try {
            await channel.send(chunk)
          } catch {
            if (!failed) {
              cache.Discord.messages.unshift(packet)
              saveCache()
              failed = true
            }
            break
          }
        }
      }
    }
  } finally {
    chatLogTimer = null
  }
}

// Creates Ark RCON Connections
function createArkAgent(server) {
  let rcon = null

  let state = "DISCONNECTED" // DISCONNECTED | CONNECTING | CONNECTED | RECONNECTING

  let chatPoller = null
  let playerPoller = null
  let cachePoller = null
  let heartbeat = null
  let reconnectTimer = null

  let pluginsLoaded = false
  let serverWasDown = false
  let pollingChat = false
  let pollingPlayers = false
  let flushingCache = false

  let pollPlayersFailCount = 0
  let heartbeatFailCount = 0
  let disconnectCount = 0
  let retryDelay = 5000
  const cacheKey = server.name
  let commandTimeout = Number(config.ark.commandTimeout) || 5000

  // -------------------------
  // SAFE SEND WRAPPER
  // -------------------------
  function withTimeout(promise, ms = 5000) {
    let timer

    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error("RCON_TIMEOUT")), ms)
    })

    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
  }

  async function send(command) {
    if (!rcon) return null

    try {
      const res = await withTimeout(rcon.send(command), commandTimeout)

      return res || null
    } catch {
      return null
    }
  }

  async function sendOk(command) {
    return !!(await send(command))
  }

  // -------------------------
  // CACHE
  // -------------------------
  function cacheMessage(packet, prepend = false) {
    cache[cacheKey].messages ??= []

    const queue = cache[cacheKey].messages

    if (prepend) queue.unshift(packet)
    else queue.push(packet)

    saveCache()
  }

  function flushCache() {
    let pollInterval = 1000
    if (cachePoller) clearTimeout(cachePoller)

    async function loop() {
      if (state === "CONNECTED" && !flushingCache) {
        flushingCache = true
        try {
          const queue = cache[cacheKey].messages ?? []
          while (queue.length) {
            const msg = queue[0]
            const ok = await sendOk(`${config.ark.chatCommand || "serverchat"} ${msg}`)
            if (!ok) break
            queue.shift()
            saveCache()
            await sleep(queue.length > 20 ? 150 : 300)
          }
        } finally {
          flushingCache = false
        }
      }

      cachePoller = setTimeout(loop, pollInterval)
    }

    loop()
  }

  // -------------------------
  // CONNECT
  // -------------------------
  async function connect() {
    if (state === "CONNECTING" || state === "CONNECTED") return
    let serverConnectable = await isServerUp()
    if (serverConnectable == false) {
      state = "DISCONNECTED"
      disconnectCount++
      if (disconnectCount >= 5) {
        let previousPlayers = cache[cacheKey].players
        for (const player of previousPlayers) {
          handlePacket({
            id: `${server.name}-leave-${Date.now()}`,
            origin: server.name,
            type: "leave",
            server: server.name,
            player: player.name,
            text: "forced-offline",
            source: "forced-offline",
            metadata: { forced: true },
          })
        }
        cache[cacheKey].players = []
      }
      scheduleReconnect()
      return
    }

    state = "CONNECTING"
    try {
      rcon = new Rcon({
        host: server.ip,
        port: server.rconPort,
        password: server.password,
      })

      if (config.logging.rconStatus) console.log(`[${server.name}] RCON Connecting...`)
      await rcon.connect()

      state = "CONNECTED"
      retryDelay = 5000
      disconnectCount = 0

      if (config.logging.rconStatus) console.log(`[${server.name}] RCON Connected`)

      setupListeners()
      startHeartbeat()
      pollChat()
      pollPlayers()
      flushCache()

      if (!pluginsLoaded || serverWasDown) {
        console.log(`[${server.name}] Fresh Server Boot, Loading Plugins...`)
        await loadArkPlugins()

        pluginsLoaded = true
        serverWasDown = false
      }
    } catch (err) {
      if (config.logging.rconStatus) console.log(`[${server.name}] RCON Connect Failed`)
      scheduleReconnect()
    }
  }

  // -------------------------
  // LISTENERS
  // -------------------------
  function setupListeners() {
    rcon.on("end", () => handleDisconnect("end"))
    rcon.on("error", (err) => handleDisconnect(`error: ${err.message}`))
  }

  function handleDisconnect(reason) {
    if (config.logging.rconStatus) console.log(`[${server.name}] RCON Disconnected (${reason})`)
    state = "DISCONNECTED"
    cleanup()
    scheduleReconnect()
  }

  // -------------------------
  // HEARTBEAT
  // -------------------------
  function startHeartbeat() {
    if (heartbeat) clearInterval(heartbeat)

    heartbeat = setInterval(async () => {
      if (state !== "CONNECTED" || !rcon) return

      const ok = await sendOk("listplayers")

      if (ok) {
        heartbeatFailCount = 0
      } else {
        if (heartbeatFailCount >= 2) {
          handleDisconnect("heartbeat-fail")
        } else {
          heartbeatFailCount++
        }
      }
    }, 30000)
  }

  async function isServerUp() {
    const timeoutAfter = 5000

    const queryPromise = GameDig.query({
      type: "ase",
      host: server.ip,
      port: server.queryPort,
    })

    const timeoutPromise = new Promise((resolve) => {
      setTimeout(() => resolve(null), timeoutAfter)
    })

    try {
      const result = await Promise.race([queryPromise, timeoutPromise])

      if (!result) return false
      return true
    } catch {
      return false
    }
  }

  // -------------------------
  // POLLING
  // -------------------------
  function pollChat() {
    let pollInterval = Number(config.ark.pollChatInterval) || 100
    if (chatPoller) clearTimeout(chatPoller)

    async function loop() {
      if (state !== "CONNECTED") {
        chatPoller = setTimeout(loop, pollInterval)
        return
      }

      if (pollingChat) {
        chatPoller = setTimeout(loop, pollInterval)
        return
      }

      pollingChat = true

      try {
        const response = await send("getchat")
        if (response) {
          const lines = response.split("\n")

          let ignoredLines = config.ark.ignoredResponses || ["Server received, But no response!!"]
          let ignoredPrefixes = config.ark.ignoredResponsePrefixes || ["SERVER: "]

          for (const raw of lines) {
            let line = stripLogEntryId(raw).trim()

            if (!line || ignoredPrefixes.some((prefix) => line.startsWith(prefix)) || ignoredLines.includes(line)) continue

            handleLine(line, "getchat")
          }
        }
      } finally {
        pollingChat = false
        chatPoller = setTimeout(loop, pollInterval)
      }
    }

    loop()
  }

  function pollPlayers() {
    let pollInterval = Number(config.ark.pollPlayersInterval) || 100
    if (playerPoller) clearTimeout(playerPoller)

    async function loop() {
      playerPoller = setTimeout(loop, pollInterval)

      if (pollingPlayers) return
      pollingPlayers = true

      try {
        let previousPlayers = cache[cacheKey].players || []
        let currentPlayers = []

        if (state !== "CONNECTED") {
          pollPlayersFailCount++
        } else {
          const response = await send("listplayers")

          if (!response) {
            pollPlayersFailCount++
          } else {
            pollPlayersFailCount = 0

            const lines = response
              .split("\n")
              .map((line) => stripLogEntryId(line).trim())
              .filter(Boolean)

            for (const line of lines) {
              const match = line.match(/^(\d+)\.\s(.+),\s(\d+)$/)
              if (!match) continue

              let [, index, name, steamId] = match

              let existing = cache[cacheKey].players.find((player) => player.steamId === steamId)

              currentPlayers.push({
                index: Number(index) + 1,
                name,
                steamId,
                joinTime: existing?.joinTime || Date.now(),
              })
            }

            for (const player of currentPlayers) {
              if (!previousPlayers.find((previous) => previous.steamId === player.steamId)) {
                handlePacket({
                  id: `${server.name}-join-${Date.now()}`,
                  origin: server.name,
                  type: "join",
                  server: server.name,
                  player: player.name,
                  text: "normal",
                  source: "listplayers",
                  metadata: {},
                })
              }
            }

            for (const player of previousPlayers) {
              if (!currentPlayers.find((current) => current.steamId === player.steamId)) {
                handlePacket({
                  id: `${server.name}-leave-${Date.now()}`,
                  origin: server.name,
                  type: "leave",
                  server: server.name,
                  player: player.name,
                  text: "normal",
                  source: "listplayers",
                  metadata: {},
                })
              }
            }

            cache[cacheKey].players = currentPlayers
            saveCache()
            return
          }
        }

        if (pollPlayersFailCount >= 5 && previousPlayers.length) {
          for (const player of previousPlayers) {
            handlePacket({
              id: `${server.name}-leave-${Date.now()}`,
              origin: server.name,
              type: "leave",
              server: server.name,
              player: player.name,
              text: "forced-offline",
              source: "forced-offline",
              metadata: { forced: true },
            })
          }

          cache[cacheKey].players = []
          saveCache()
        }
      } finally {
        pollingPlayers = false
      }
    }

    loop()
  }

  let failedChecks = 0

  setInterval(async () => {
    const up = await isServerUp()

    if (!up) {
      failedChecks++
      if (failedChecks >= 3) serverWasDown = true
    } else {
      failedChecks = 0
    }
  }, 10000)

  // -------------------------
  // LINE PARSER
  // -------------------------
  function handleLine(line, source = "") {
    let metadata = {}

    // Chats
    let chat = line.match(/^(.+?) \(([^()]+)\): (.+)$/)
    if (chat) {
      let [, , player, text] = chat
      handlePacket({
        id: `${server.name}-${Date.now()}`,
        origin: server.name,
        type: "chat",
        server: server.name,
        player,
        text,
        source,
        metadata,
      })
      return
    }

    // Tribe logs
    let tribeLogsRegex =
      config.ark.tribeLogsRegex instanceof RegExp
        ? config.ark.tribeLogsRegex
        : /^Tribe\s+(.+?),\s+ID\s+(\d+):\s+Day\s+(\d+),\s+([\d:]+):\s+<RichColor Color="([^"]+)">([\s\S]+?)<\/?>\)?$/
    let tribeLog = line.match(tribeLogsRegex)
    if (tribeLog) {
      let [, tribeName, tribeId, day, time, colorRaw, message] = tribeLog
      let color = null

      if (colorRaw) {
        const parts = colorRaw.split(",").map((n) => Number(n.trim()))

        if (parts.length >= 3) {
          const [r, g, b] = parts

          const toHex = (v) => Math.round(Math.max(0, Math.min(1, v)) * 255)

          color = (toHex(r) << 16) + (toHex(g) << 8) + toHex(b)
        }
      }
      message = message.replace(/<\/?>/g, "").trim()
      handlePacket({
        id: `${server.name}-tribelog-${Date.now()}`,
        origin: server.name,
        type: "tribeLogs",
        server: server.name,
        player: "System",
        text: message,
        source,
        metadata: { color, tribeName, tribeId },
      })
      return
    }

    // Leftovers
    handlePacket({
      id: `${server.name}-tribelog-${Date.now()}`,
      origin: server.name,
      type: "leftovers",
      server: server.name,
      player: "",
      text: line,
      source,
      metadata,
    })
  }

  // -------------------------
  // PLUGINS
  // -------------------------
  async function loadArkPlugins() {
    const plugins = config.ark.essentialPlugins || []

    for (const plugin of plugins) {
      await send(`Plugins.load ${plugin}`)
    }
  }

  // -------------------------
  // RECONNECT
  // -------------------------
  function scheduleReconnect() {
    if (state === "RECONNECTING") return

    state = "RECONNECTING"

    if (reconnectTimer) {
      clearTimeout(reconnectTimer)
      reconnectTimer = null
    }

    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      retryDelay = Math.min(retryDelay * 2, 60000)

      connect()
    }, retryDelay)
  }

  function cleanup() {
    if (chatPoller) clearTimeout(chatPoller)
    if (playerPoller) clearTimeout(playerPoller)
    if (cachePoller) clearTimeout(cachePoller)
    if (heartbeat) clearInterval(heartbeat)

    chatPoller = null
    playerPoller = null
    cachePoller = null
    heartbeat = null
  }

  // -------------------------
  // START
  // -------------------------
  connect()

  return {
    name: server.name,
    send: async (msg) => {
      const ok = await sendOk(`${config.ark.chatCommand || "serverchat"} ${msg}`)
      if (!ok) cacheMessage(msg)
    },
  }
}

let discordCommands = new Map()
let loadedPlugins = new Map()

function registerCommand(names, handler) {
  if (Array.isArray(names)) {
    names.forEach((name) => discordCommands.set(name.toLowerCase(), handler))
  } else {
    discordCommands.set(names.toLowerCase(), handler)
  }
}

async function loadPlugins() {
  const pluginsPath = path.join(__dirname, "plugins")
  if (!fs.existsSync(pluginsPath)) return

  const folders = fs.readdirSync(pluginsPath).filter((f) => {
    return fs.statSync(path.join(pluginsPath, f)).isDirectory()
  })

  for (const folder of folders) {
    const filePath = path.join(pluginsPath, folder, "plugin.js")
    if (!fs.existsSync(filePath)) continue
    await loadPlugin(filePath)
  }
}

async function loadPlugin(filePath) {
  delete require.cache[require.resolve(filePath)]
  const plugin = require(filePath)
  await plugin.setup(cacApi)
  loadedPlugins.set(plugin.name, filePath)
  console.log(`[CrossArkChat] Loaded Plugin: ${plugin.name} ${plugin.version || "v1.0.0"}`)
}

// Authorisation Helper
let botOwnerIds = null

async function isAdmin(userId) {
  if (!client) return false

  const id = String(userId)
  if ((config.discord.admins || []).includes(id)) return true
  else if (!botOwnerIds) {
    const application = await client.application.fetch()
    const owner = application.owner
    botOwnerIds = new Set()

    if (owner?.constructor?.name === "Team") {
      for (const member of owner.members.values()) {
        botOwnerIds.add(member.user.id)
      }
    } else if (owner) {
      botOwnerIds.add(owner.id)
    }
  }
  if (botOwnerIds.has(id)) return true
}

// Starts Discord Bot
async function discordBot() {
  client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent, GatewayIntentBits.GuildMembers],
  })

  client.on("clientReady", async () => {
    if (config.logging.startup) {
      console.log(`[CrossArkChat] Discord Client ${client.user.tag} Is Now Online`)
    }
    clientReady = true
    client.user.setPresence({
      status: "online",
      activities: [
        {
          name: "CrossArkChat.JS",
          type: 0,
        },
      ],
    })

    if (tribeLogTimer) {
      clearTimeout(tribeLogTimer)
      tribeLogTimer = null
    }
    if (chatLogTimer) {
      clearTimeout(chatLogTimer)
      chatLogTimer = null
    }

    const pendingChats = cache.Discord.messages.splice(0)
    const pendingTribeLogs = cache.TribeLogs.messages.splice(0)
    saveCache()

    for (const packet of pendingChats) queuePacket(packet)
    for (const packet of pendingTribeLogs) queuePacket(packet)
  })

  client.on("messageCreate", (message) => {
    let prefix = config.discord.prefix || "cac."
    if (message.channel.id !== config.discord.channels.chat || message.author.bot) return
    if (message.content.toLowerCase().startsWith(prefix.toLowerCase())) return
    let msgContent = message.content
    if (config.discord.stripEmojis) {
      msgContent = msgContent.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, ":$1:")
    }

    const packet = {
      id: `discord-${Date.now()}`,
      origin: "discord",
      type: "chat",
      server: "Discord",
      player: message.member?.nickname || message.member?.user?.globalName || message.author.username,
      text: msgContent,
    }

    handlePacket(packet)
  })

  client.on("messageCreate", async (message) => {
    let prefix = config.discord.prefix || "cac."
    if (message.author.bot) return
    if (!message.content.toLowerCase().startsWith(prefix.toLowerCase())) return

    const raw = message.content.slice(prefix.length).trim()
    const [cmd, ...args] = raw.split(/\s+/)

    const handler = discordCommands.get(cmd.toLowerCase())
    if (!handler) return

    try {
      await handler(message, cmd, args)
    } catch (err) {}
  })

  await client.login(config.discord.token || process.env.botToken)
}

let restartingDiscord = false
if (config.discord.enabled == true) {
  setInterval(async () => {
    if (!client || restartingDiscord) return

    if (!client.isReady()) {
      restartingDiscord = true

      if (config.logging.discordStatus) {
        console.log(`[CrossArkChat] Discord Connection Unhealthy, Attempting Restart...`)
      }

      clientReady = false

      try {
        await client.destroy()
      } catch {}

      discordBot().finally(() => {
        restartingDiscord = false
      })
    }
  }, 30000)
}

// Startup
async function start() {
  config.servers.map((server) => {
    if (!server.enabled) return
    arkAgents.push(createArkAgent(server))
    cache[server.name] ??= {}
    cache[server.name].messages ??= []
    cache[server.name].players ??= []
  })

  if (config.discord.enabled == true) {
    await discordBot()
  }

  if (config.logging.startup) {
    console.log(`[CrossArkChat] CrossArkChat Started`)
  }

  saveCache()
  await loadPlugins()
}

process.on("uncaughtException", (err) => {
  console.log(`[CrossArkChat] Uncaught Exception:`, err)
})

process.on("unhandledRejection", (err) => {
  console.log(`[CrossArkChat] Unhandled Rejection:`, err)
})

const modMan = {
  installModule(moduleName, version) {
    return new Promise((resolve, reject) => {
      try {
        require("child_process").execSync(`npm i ${version ? `${moduleName}@${version}` : moduleName}`, { stdio: "inherit" })

        const mod = require(moduleName)
        resolve(mod)
      } catch (error) {
        console.log(`Failed to install "${moduleName}"`)
        reject(error)
      }
    })
  },

  async require(moduleName, version) {
    try {
      return require(moduleName)
    } catch (e) {
      await this.installModule(moduleName, version)
      return require(moduleName)
    }
  },
}

let cacApi = {
  isAdmin,
  loadConfig,
  loadPlugin,
  loadPlugins,
  handlePacket,
  registerCommand,
  on: (event, handler) => emitter.on(event, handler),
  off: (event, handler) => emitter.off(event, handler),
  getCache: () => cache,
  getConfig: () => config,
  getArkAgents: () => arkAgents,
  getDiscordClient: () => client,
  reloadPlugin: async (name) => {
    const filePath = loadedPlugins.get(name)
    if (!filePath) throw new Error(`Plugin "${name}" not found`)
    await loadPlugin(filePath)
  },
  getLoadedPlugins: () => loadedPlugins,
  sendToServers: (message) => arkAgents.forEach((agent) => agent.send(message)),
  sendToServer: (name, message) => arkAgents.find((agent) => agent.name === name)?.send(message),
  sendToDiscord: (channelId, message) => client?.channels.cache.get(channelId)?.send(message),
  writeConfig: (newConfig) => {
    Object.keys(config).forEach((key) => delete config[key])
    Object.assign(config, newConfig)
  },
  writeCache: (newCache) => {
    Object.keys(cache).forEach((key) => delete cache[key])
    Object.assign(cache, newCache)
  },
  modMan,
}

start()
