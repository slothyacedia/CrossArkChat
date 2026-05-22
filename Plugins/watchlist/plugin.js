const path = require("node:path")
const fs = require("node:fs")

// --- CENTRALIZED MESSAGES CONFIGURATION ---
const messageTemplates = {
  noPermission: "You don't have permission to use this command.",
  emptyWatchlist: "Watchlist is empty.",
  setChannel: "Alert channel set to <#{channelId}>",
  missingArgs: "Please provide either a Player Name, Steam ID, Tribe Name, or Tribe ID.",
  allAlreadyWatched: "All specified items are already on the watchlist.",
  noneFound: "None of the specified items were found on the watchlist.",
  somethingWrong: "Something went wrong: {error}",

  // Text Command Usages
  usageAddName: "Usage: {prefix}watchlist addname <Player Name(s)>",
  usageAddSteam: "Usage: {prefix}watchlist addsteam <Steam ID(s)>",
  usageAddTribeName: "Usage: {prefix}watchlist addtribename <Tribe Name(s)>",
  usageAddTribeId: "Usage: {prefix}watchlist addtribeid <Tribe ID(s)>",
  usageRemoveName: "Usage: {prefix}watchlist removename <Player Name(s)>",
  usageRemoveSteam: "Usage: {prefix}watchlist removesteam <Steam ID(s)>",
  usageRemoveTribeName: "Usage: {prefix}watchlist removetribename <Tribe Name(s)>",
  usageRemoveTribeId: "Usage: {prefix}watchlist removetribeid <Tribe ID(s)>",

  // Slash Command Specific Single-Item Statuses
  alreadyWatched: "{type} **{value}** is already on the watchlist.",
  notWatched: "{type} **{value}** is not on the watchlist.",

  // Action Success Responses
  logAdded: "🔎 **{values}** ({type}) added to watchlist by {username}",
  replyAdded: "Added {type} **{values}** to the watchlist.",
  replyRemoved: "Removed {type} **{values}** from the watchlist.",

  // Background Auto-Discovery Announcements
  autoAddedSteam: "🔎 Auto-added Steam ID **{steamId}** for watched Player Name **{ign}**",
  autoAddedTribeId: "🔎 Auto-added Tribe ID **{tribeId}** for watched Tribe Name **{tribeName}**",

  // Live Server Activity Tracking Events
  playerJoined: "⚠️ **{player}** ({steamId}) joined **{server}**",
  playerLeft: "⚠️ **{player}** ({steamId}) left **{server}**",
  playerChat: "⚠️ **{player}** ({server}): {text}",

  // Main Help Menu Format
  helpMenu: [
    "**Watchlist Commands:**\n",
    "`{prefix}{cmd} addname <Player Name(s)>` (supports comma separated values)",
    "`{prefix}{cmd} addsteam <Steam ID(s)>` (supports comma separated values)",
    "`{prefix}{cmd} addtribename <Tribe Name(s)>` (supports comma separated values)",
    "`{prefix}{cmd} addtribeid <Tribe ID(s)>` (supports comma separated values)",
    "`{prefix}{cmd} removename <Player Name(s)>`",
    "`{prefix}{cmd} removesteam <Steam ID(s)>`",
    "`{prefix}{cmd} removetribename <Tribe Name(s)>`",
    "`{prefix}{cmd} removetribeid <Tribe ID(s)>`",
    "`{prefix}{cmd} list`",
    "`{prefix}{cmd} setchannel <channelId>`",
  ].join("\n"),
}

function templateReplace(template, data = {}) {
  return template.replace(/{(\w+)}/g, (match, key) => (data[key] !== undefined ? data[key] : match))
}

let onPacket = null
let pluginCommands = ["watchlist", "wl"]

let batchQueue = []
let batchTimer = null
let lastFlushTime = 0

module.exports = {
  name: "Watchlist",
  version: "v2.1.0",

  async teardown(cacApi) {
    let textCmd = cacApi.discord.commands.text
    textCmd.unregister(pluginCommands)
    if (onPacket) cacApi.events.off("packet", onPacket)
    if (batchTimer) {
      clearTimeout(batchTimer)
      batchTimer = null
    }
  },

  async setup(cacApi) {
    const { EmbedBuilder, SlashCommandBuilder } = cacApi.utils.modules.djs
    let textCmd = cacApi.discord.commands.text
    let slashCmd = cacApi.discord.commands.slash
    const pluginDir = __dirname
    const configPath = path.join(pluginDir, "config.json")

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            channel: "",
            watchlist: {
              playerNames: [],
              steamIds: [],
              tribeNames: [],
              tribeIds: [],
            },
          },
          null,
          2,
        ),
      )
    }

    function loadPluginConfig() {
      delete require.cache[require.resolve(configPath)]
      return JSON.parse(fs.readFileSync(configPath, "utf8"))
    }

    function savePluginConfig(config) {
      config.watchlist.playerNames = config.watchlist.playerNames.map((name) => name.toLowerCase())
      config.watchlist.tribeNames = config.watchlist.tribeNames.map((name) => name.toLowerCase())
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    }

    let pluginConfig = loadPluginConfig()
    pluginConfig.watchlist ??= {}
    pluginConfig.watchlist.playerNames ??= []
    pluginConfig.watchlist.steamIds ??= []
    pluginConfig.watchlist.tribeNames ??= []
    pluginConfig.watchlist.tribeIds ??= []

    function isWatched(packet) {
      if (pluginConfig.watchlist.playerNames.includes(packet.player?.toLowerCase())) return true
      if (pluginConfig.watchlist.steamIds.includes(packet.metadata?.steamId)) return true
      if (packet.metadata?.tribeId && pluginConfig.watchlist.tribeIds.includes(packet.metadata.tribeId.toString())) return true
      if (packet.metadata?.tribeName && pluginConfig.watchlist.tribeNames.includes(packet.metadata.tribeName.toLowerCase())) return true
      return false
    }

    function splitCommas(input) {
      if (!input) return []
      return input
        .split(",")
        .map((val) => val.trim())
        .filter((val) => val.length > 0)
    }

    async function flushBatchLogs(force = false) {
      try {
        if (!force) {
          const now = Date.now()
          if (now - lastFlushTime > 10000) {
            lastFlushTime = now
            setTimeout(() => {
              flushBatchLogs(true).catch(() => {})
            }, 10000)
          }
        }

        if (batchQueue.length === 0) return

        const client = cacApi.discord.getClient()
        if (!client) return

        const targetChannelId = pluginConfig.channel
        const channel = client.channels.cache.get(targetChannelId)
        if (!channel) return

        const currentBatch = batchQueue.splice(0)

        const embeds = currentBatch.map((packet) => {
          const meta = packet.metadata || {}
          const embed = new EmbedBuilder()

          switch (packet.type) {
            case "tribeLogs": {
              embed.setTitle(`⚠️ Watchlist [${packet.origin || packet.server}] ${meta.tribeName ?? "Unknown Tribe"} (ID: ${meta.tribeId ?? "?"})`)
              break
            }
            case "leftovers": {
              embed.setTitle(`⚠️ Watchlist [${packet.origin || packet.server}] Leftover Logs`)
              break
            }
            default: {
              embed.setTitle(`⚠️ Watchlist Alert (${packet.type})`)
              break
            }
          }

          embed
            .setDescription(packet.text || "")
            .setTimestamp()
            .setColor(meta.color ?? "#2f3136")

          return { embed, packet }
        })

        for (let index = 0; index < embeds.length; index += 10) {
          const chunk = embeds.slice(index, index + 10)

          try {
            await channel.send({
              embeds: chunk.map((data) => data.embed),
            })
          } catch (err) {
            batchQueue.unshift(...chunk.map((data) => data.packet))
            break
          }
        }
      } finally {
        batchTimer = null
      }
    }

    cacApi.events.on("playerInfoUpdate", async (data) => {
      let config = cacApi.config.get()
      let cache = cacApi.cache.get()
      const enabledServers = config.servers.filter((server) => server.enabled)

      const serverPlayers = enabledServers.flatMap((server) => {
        return (cache[server.name]?.players || []).map((player) => ({ ...player, server }))
      })

      for (let player of serverPlayers) {
        const steamId = player.steamId
        if (!steamId) continue

        const ign = player.data?.ign || player.ign
        if (!ign) continue

        const isNameWatched = pluginConfig.watchlist.playerNames.includes(ign.toLowerCase())

        if (isNameWatched && !pluginConfig.watchlist.steamIds.includes(steamId)) {
          pluginConfig.watchlist.steamIds.push(steamId)
          savePluginConfig(pluginConfig)
          cacApi.discord.send(pluginConfig.channel, templateReplace(messageTemplates.autoAddedSteam, { steamId, ign }))
        }
      }
    })

    onPacket = async function (packet) {
      if (packet.metadata?.tribeName && packet.metadata?.tribeId) {
        const tribeIdStr = packet.metadata.tribeId.toString()
        const isTribeNameWatched = pluginConfig.watchlist.tribeNames.includes(packet.metadata.tribeName.toLowerCase())

        if (isTribeNameWatched && !pluginConfig.watchlist.tribeIds.includes(tribeIdStr)) {
          pluginConfig.watchlist.tribeIds.push(tribeIdStr)
          savePluginConfig(pluginConfig)
          cacApi.discord.send(
            pluginConfig.channel,
            templateReplace(messageTemplates.autoAddedTribeId, { tribeId: tribeIdStr, tribeName: packet.metadata.tribeName }),
          )
        }
      }

      if (!isWatched(packet)) return

      const steamId = packet.metadata?.steamId

      if (
        steamId &&
        !pluginConfig.watchlist.steamIds.includes(steamId) &&
        packet.player &&
        pluginConfig.watchlist.playerNames.includes(packet.player.toLowerCase())
      ) {
        pluginConfig.watchlist.steamIds.push(steamId)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(pluginConfig.channel, templateReplace(messageTemplates.autoAddedSteam, { steamId, ign: packet.player }))
      }

      switch (packet.type) {
        case "join": {
          cacApi.discord.send(
            pluginConfig.channel,
            templateReplace(messageTemplates.playerJoined, { player: packet.player, steamId: steamId || "No Steam ID", server: packet.server }),
          )
          break
        }

        case "chat": {
          cacApi.discord.send(
            pluginConfig.channel,
            templateReplace(messageTemplates.playerChat, { player: packet.player, server: packet.server, text: packet.text }),
          )
          break
        }

        case "leave": {
          cacApi.discord.send(
            pluginConfig.channel,
            templateReplace(messageTemplates.playerLeft, { player: packet.player, steamId: steamId || "No Steam ID", server: packet.server }),
          )
          break
        }

        case "tribeLogs":
        case "leftovers": {
          batchQueue.push(packet)
          if (!batchTimer) {
            batchTimer = setTimeout(() => {
              flushBatchLogs().catch(() => {})
            }, 2000)
          }
          break
        }
      }
    }

    cacApi.events.on("packet", onPacket)

    // --- TEXT COMMANDS ---
    textCmd.register(pluginCommands, async (message, cmd, args) => {
      if (!(await cacApi.utils.isAdmin(message.author.id))) {
        return message.reply(messageTemplates.noPermission)
      }

      let config = cacApi.config.get()
      let prefix = config.discord.prefix || "cac."
      let actionType = args[0]?.toLowerCase()
      let actionValue = args.slice(1).join(" ")

      // Add Subcommands
      if (["addname", "an"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageAddName, { prefix }))
        const names = splitCommas(actionValue)
        let added = []
        names.forEach((name) => {
          if (!pluginConfig.watchlist.playerNames.includes(name.toLowerCase())) {
            pluginConfig.watchlist.playerNames.push(name)
            added.push(name)
          }
        })
        if (!added.length) return message.reply(messageTemplates.allAlreadyWatched)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(
          pluginConfig.channel,
          templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Player Name", username: message.author.username }),
        )
        return message.reply(templateReplace(messageTemplates.replyAdded, { type: "Player Name", values: added.join(", ") }))
      }

      if (["addsteam", "as"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageAddSteam, { prefix }))
        const ids = splitCommas(actionValue)
        let added = []
        ids.forEach((id) => {
          if (!pluginConfig.watchlist.steamIds.includes(id)) {
            pluginConfig.watchlist.steamIds.push(id)
            added.push(id)
          }
        })
        if (!added.length) return message.reply(messageTemplates.allAlreadyWatched)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(
          pluginConfig.channel,
          templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Steam ID", username: message.author.username }),
        )
        return message.reply(templateReplace(messageTemplates.replyAdded, { type: "Steam ID", values: added.join(", ") }))
      }

      if (["addtribename", "atn"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageAddTribeName, { prefix }))
        const tNames = splitCommas(actionValue)
        let added = []
        tNames.forEach((tName) => {
          if (!pluginConfig.watchlist.tribeNames.includes(tName.toLowerCase())) {
            pluginConfig.watchlist.tribeNames.push(tName)
            added.push(tName)
          }
        })
        if (!added.length) return message.reply(messageTemplates.allAlreadyWatched)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(
          pluginConfig.channel,
          templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Tribe Name", username: message.author.username }),
        )
        return message.reply(templateReplace(messageTemplates.replyAdded, { type: "Tribe Name", values: added.join(", ") }))
      }

      if (["addtribeid", "ati"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageAddTribeId, { prefix }))
        const tIds = splitCommas(actionValue)
        let added = []
        tIds.forEach((tId) => {
          if (!pluginConfig.watchlist.tribeIds.includes(tId)) {
            pluginConfig.watchlist.tribeIds.push(tId)
            added.push(tId)
          }
        })
        if (!added.length) return message.reply(messageTemplates.allAlreadyWatched)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(
          pluginConfig.channel,
          templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Tribe ID", username: message.author.username }),
        )
        return message.reply(templateReplace(messageTemplates.replyAdded, { type: "Tribe ID", values: added.join(", ") }))
      }

      // Remove Subcommands
      if (["removename", "rn"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageRemoveName, { prefix }))
        const names = splitCommas(actionValue)
        let removed = []
        names.forEach((name) => {
          const index = pluginConfig.watchlist.playerNames.indexOf(name.toLowerCase())
          if (index !== -1) {
            pluginConfig.watchlist.playerNames.splice(index, 1)
            removed.push(name)
          }
        })
        if (!removed.length) return message.reply(messageTemplates.noneFound)
        savePluginConfig(pluginConfig)
        return message.reply(templateReplace(messageTemplates.replyRemoved, { type: "Player Name", values: removed.join(", ") }))
      }

      if (["removesteam", "rs"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageRemoveSteam, { prefix }))
        const ids = splitCommas(actionValue)
        let removed = []
        ids.forEach((id) => {
          const index = pluginConfig.watchlist.steamIds.indexOf(id)
          if (index !== -1) {
            pluginConfig.watchlist.steamIds.splice(index, 1)
            removed.push(id)
          }
        })
        if (!removed.length) return message.reply(messageTemplates.noneFound)
        savePluginConfig(pluginConfig)
        return message.reply(templateReplace(messageTemplates.replyRemoved, { type: "Steam ID", values: removed.join(", ") }))
      }

      if (["removetribename", "rtn"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageRemoveTribeName, { prefix }))
        const tNames = splitCommas(actionValue)
        let removed = []
        tNames.forEach((tName) => {
          const index = pluginConfig.watchlist.tribeNames.indexOf(tName.toLowerCase())
          if (index !== -1) {
            pluginConfig.watchlist.tribeNames.splice(index, 1)
            removed.push(tName)
          }
        })
        if (!removed.length) return message.reply(messageTemplates.noneFound)
        savePluginConfig(pluginConfig)
        return message.reply(templateReplace(messageTemplates.replyRemoved, { type: "Tribe Name", values: removed.join(", ") }))
      }

      if (["removetribeid", "rti"].includes(actionType)) {
        if (!actionValue) return message.reply(templateReplace(messageTemplates.usageRemoveTribeId, { prefix }))
        const tIds = splitCommas(actionValue)
        let removed = []
        tIds.forEach((tId) => {
          const index = pluginConfig.watchlist.tribeIds.indexOf(tId)
          if (index !== -1) {
            pluginConfig.watchlist.tribeIds.splice(index, 1)
            removed.push(tId)
          }
        })
        if (!removed.length) return message.reply(messageTemplates.noneFound)
        savePluginConfig(pluginConfig)
        return message.reply(templateReplace(messageTemplates.replyRemoved, { type: "Tribe ID", values: removed.join(", ") }))
      }

      if (["list", "l"].includes(actionType)) {
        const { playerNames, steamIds, tribeNames, tribeIds } = pluginConfig.watchlist
        if (!playerNames.length && !steamIds.length && !tribeNames.length && !tribeIds.length) return message.reply(messageTemplates.emptyWatchlist)

        let response = ""
        if (playerNames.length) response += `**Player Names:**\n${playerNames.map((n) => `- ${n}`).join("\n")}\n`
        if (steamIds.length) response += `**Steam IDs:**\n${steamIds.map((s) => `- ${s}`).join("\n")}\n`
        if (tribeNames.length) response += `**Tribe Names:**\n${tribeNames.map((t) => `- ${t}`).join("\n")}\n`
        if (tribeIds.length) response += `**Tribe IDs:**\n${tribeIds.map((ti) => `- ${ti}`).join("\n")}`

        return message.reply(response.trim())
      }

      if (["setchannel", "sc"].includes(actionType)) {
        const mention = message.mentions.channels.first()
        const channelId = mention?.id || args[1] || message.channel.id
        pluginConfig.channel = channelId
        savePluginConfig(pluginConfig)
        return message.reply(templateReplace(messageTemplates.setChannel, { channelId }))
      }

      return message.reply(templateReplace(messageTemplates.helpMenu, { prefix, cmd }))
    })

    // --- SLASH COMMANDS ---
    slashCmd.register(
      "watchlist",

      new SlashCommandBuilder()
        .setName("watchlist")
        .setDescription("Manage the watchlist")

        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add target(s) to watchlist (supports comma separated values)")
            .addStringOption((option) => option.setName("player_name").setDescription("Player Name(s)").setRequired(false))
            .addStringOption((option) => option.setName("steam_id").setDescription("Steam ID(s)").setRequired(false))
            .addStringOption((option) => option.setName("tribe_name").setDescription("Tribe Name(s)").setRequired(false))
            .addStringOption((option) => option.setName("tribe_id").setDescription("Tribe ID(s)").setRequired(false)),
        )

        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Remove target(s) from watchlist (supports comma separated values)")
            .addStringOption((option) => option.setName("player_name").setDescription("Player Name(s)").setRequired(false))
            .addStringOption((option) => option.setName("steam_id").setDescription("Steam ID(s)").setRequired(false))
            .addStringOption((option) => option.setName("tribe_name").setDescription("Tribe Name(s)").setRequired(false))
            .addStringOption((option) => option.setName("tribe_id").setDescription("Tribe ID(s)").setRequired(false)),
        )

        .addSubcommand((sub) => sub.setName("list").setDescription("View watchlist"))

        .addSubcommand((sub) =>
          sub
            .setName("setchannel")
            .setDescription("Set alert channel")
            .addChannelOption((option) => option.setName("channel").setDescription("Alert channel").setRequired(false)),
        ),

      async (interaction, cmd, args) => {
        try {
          if (!(await cacApi.utils.isAdmin(interaction.user.id))) {
            return interaction.reply({
              content: messageTemplates.noPermission,
              flags: 64,
            })
          }

          const subCommand = args.subCommand

          if (subCommand === "add") {
            let playerNameInput = args.player_name
            let steamIdInput = args.steam_id
            let tribeNameInput = args.tribe_name
            let tribeIdInput = args.tribe_id

            if (!playerNameInput && !steamIdInput && !tribeNameInput && !tribeIdInput) {
              return interaction.reply({
                content: messageTemplates.missingArgs,
                flags: 64,
              })
            }

            let response = []

            if (playerNameInput) {
              const names = splitCommas(playerNameInput)
              let added = []
              names.forEach((name) => {
                const lowerName = name.toLowerCase()
                if (pluginConfig.watchlist.playerNames.includes(lowerName)) {
                  response.push(templateReplace(messageTemplates.alreadyWatched, { type: "Player Name", value: lowerName }))
                } else {
                  pluginConfig.watchlist.playerNames.push(lowerName)
                  added.push(lowerName)
                }
              })
              if (added.length) {
                cacApi.discord.send(
                  pluginConfig.channel,
                  templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Player Name", username: interaction.user.username }),
                )
                response.push(templateReplace(messageTemplates.replyAdded, { type: "Player Name", values: added.join(", ") }))
              }
            }

            if (steamIdInput) {
              const ids = splitCommas(steamIdInput)
              let added = []
              ids.forEach((idInput) => {
                const steamId = idInput.toLowerCase().split(".")[0]
                if (pluginConfig.watchlist.steamIds.includes(steamId)) {
                  response.push(templateReplace(messageTemplates.alreadyWatched, { type: "Steam ID", value: steamId }))
                } else {
                  pluginConfig.watchlist.steamIds.push(steamId)
                  added.push(steamId)
                }
              })
              if (added.length) {
                cacApi.discord.send(
                  pluginConfig.channel,
                  templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Steam ID", username: interaction.user.username }),
                )
                response.push(templateReplace(messageTemplates.replyAdded, { type: "Steam ID", values: added.join(", ") }))
              }
            }

            if (tribeNameInput) {
              const tNames = splitCommas(tribeNameInput)
              let added = []
              tNames.forEach((tNameInput) => {
                const tribeName = tNameInput.toLowerCase()
                if (pluginConfig.watchlist.tribeNames.includes(tribeName)) {
                  response.push(templateReplace(messageTemplates.alreadyWatched, { type: "Tribe Name", value: tribeName }))
                } else {
                  pluginConfig.watchlist.tribeNames.push(tribeName)
                  added.push(tribeName)
                }
              })
              if (added.length) {
                cacApi.discord.send(
                  pluginConfig.channel,
                  templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Tribe Name", username: interaction.user.username }),
                )
                response.push(templateReplace(messageTemplates.replyAdded, { type: "Tribe Name", values: added.join(", ") }))
              }
            }

            if (tribeIdInput) {
              const tIds = splitCommas(tribeIdInput)
              let added = []
              tIds.forEach((tIdInput) => {
                const tribeId = tIdInput.toString()
                if (pluginConfig.watchlist.tribeIds.includes(tribeId)) {
                  response.push(templateReplace(messageTemplates.alreadyWatched, { type: "Tribe ID", value: tribeId }))
                } else {
                  pluginConfig.watchlist.tribeIds.push(tribeId)
                  added.push(tribeId)
                }
              })
              if (added.length) {
                cacApi.discord.send(
                  pluginConfig.channel,
                  templateReplace(messageTemplates.logAdded, { values: added.join(", "), type: "Tribe ID", username: interaction.user.username }),
                )
                response.push(templateReplace(messageTemplates.replyAdded, { type: "Tribe ID", values: added.join(", ") }))
              }
            }

            savePluginConfig(pluginConfig)

            return interaction.reply({
              content: response.join("\n"),
              flags: 64,
            })
          }

          if (subCommand === "remove") {
            let playerNameInput = args.player_name
            let steamIdInput = args.steam_id
            let tribeNameInput = args.tribe_name
            let tribeIdInput = args.tribe_id

            if (!playerNameInput && !steamIdInput && !tribeNameInput && !tribeIdInput) {
              return interaction.reply({
                content: messageTemplates.missingArgs,
                flags: 64,
              })
            }

            let response = []

            if (playerNameInput) {
              const names = splitCommas(playerNameInput)
              let removed = []
              names.forEach((nameInput) => {
                const playerName = nameInput.toLowerCase()
                const index = pluginConfig.watchlist.playerNames.indexOf(playerName)
                if (index === -1) {
                  response.push(templateReplace(messageTemplates.notWatched, { type: "Player Name", value: playerName }))
                } else {
                  pluginConfig.watchlist.playerNames.splice(index, 1)
                  removed.push(playerName)
                }
              })
              if (removed.length) {
                response.push(templateReplace(messageTemplates.replyRemoved, { type: "Player Name", values: removed.join(", ") }))
              }
            }

            if (steamIdInput) {
              const ids = splitCommas(steamIdInput)
              let removed = []
              ids.forEach((idInput) => {
                const steamId = idInput.toLowerCase().split(".")[0]
                const index = pluginConfig.watchlist.steamIds.indexOf(steamId)
                if (index === -1) {
                  response.push(templateReplace(messageTemplates.notWatched, { type: "Steam ID", value: steamId }))
                } else {
                  pluginConfig.watchlist.steamIds.splice(index, 1)
                  removed.push(steamId)
                }
              })
              if (removed.length) {
                response.push(templateReplace(messageTemplates.replyRemoved, { type: "Steam ID", values: removed.join(", ") }))
              }
            }

            if (tribeNameInput) {
              const tNames = splitCommas(tribeNameInput)
              let removed = []
              tNames.forEach((tNameInput) => {
                const tribeName = tNameInput.toLowerCase()
                const index = pluginConfig.watchlist.tribeNames.indexOf(tribeName)
                if (index === -1) {
                  response.push(templateReplace(messageTemplates.notWatched, { type: "Tribe Name", value: tribeName }))
                } else {
                  pluginConfig.watchlist.tribeNames.splice(index, 1)
                  removed.push(tribeName)
                }
              })
              if (removed.length) {
                response.push(templateReplace(messageTemplates.replyRemoved, { type: "Tribe Name", values: removed.join(", ") }))
              }
            }

            if (tribeIdInput) {
              const tIds = splitCommas(tribeIdInput)
              let removed = []
              tIds.forEach((tIdInput) => {
                const tribeId = tIdInput.toString()
                const index = pluginConfig.watchlist.tribeIds.indexOf(tribeId)
                if (index === -1) {
                  response.push(templateReplace(messageTemplates.notWatched, { type: "Tribe ID", value: tribeId }))
                } else {
                  pluginConfig.watchlist.tribeIds.splice(index, 1)
                  removed.push(tribeId)
                }
              })
              if (removed.length) {
                response.push(templateReplace(messageTemplates.replyRemoved, { type: "Tribe ID", values: removed.join(", ") }))
              }
            }

            savePluginConfig(pluginConfig)

            return interaction.reply({
              content: response.join("\n"),
              flags: 64,
            })
          }

          if (subCommand === "list") {
            const { playerNames, steamIds, tribeNames, tribeIds } = pluginConfig.watchlist

            if (!playerNames.length && !steamIds.length && !tribeNames.length && !tribeIds.length) {
              return interaction.reply({
                content: messageTemplates.emptyWatchlist,
                flags: 64,
              })
            }

            let response = ""
            if (playerNames.length) response += `**Player Names:**\n${playerNames.map((n) => `- ${n}`).join("\n")}\n`
            if (steamIds.length) response += `**Steam IDs:**\n${steamIds.map((s) => `- ${s}`).join("\n")}\n`
            if (tribeNames.length) response += `**Tribe Names:**\n${tribeNames.map((t) => `- ${t}`).join("\n")}\n`
            if (tribeIds.length) response += `**Tribe IDs:**\n${tribeIds.map((ti) => `- ${ti}`).join("\n")}`

            return interaction.reply({
              content: response.trim(),
              flags: 64,
            })
          }

          if (subCommand === "setchannel") {
            const channel = interaction.options.getChannel("channel") || interaction.channel
            pluginConfig.channel = channel.id
            savePluginConfig(pluginConfig)

            return interaction.reply({
              content: templateReplace(messageTemplates.setChannel, { channelId: channel.id }),
              flags: 64,
            })
          }
        } catch (err) {
          return interaction.reply({
            content: templateReplace(messageTemplates.somethingWrong, { error: err.message }),
            flags: 64,
          })
        }
      },
    )
  },
}
