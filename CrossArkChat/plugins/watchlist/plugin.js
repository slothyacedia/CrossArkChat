const path = require("node:path")
const fs = require("node:fs")

let onPacket = null

module.exports = {
  name: "Watchlist",
  version: "v1.0.0",

  teardown(cacApi) {
    cacApi.unregisterCommand(["addwatcher", "removewatcher", "watchers", "setalertchannel"])
    if (onPacket) cacApi.off("packet", onPacket)
  },

  setup(cacApi) {
    const pluginDir = __dirname
    const configPath = path.join(pluginDir, "config.json")

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            channel: "",
            watchlist: {
              names: [],
              steamIds: [],
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
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2))
    }

    let pluginConfig = loadPluginConfig()
    pluginConfig.watchlist ??= {}
    pluginConfig.watchlist.names ??= []
    pluginConfig.watchlist.steamIds ??= []

    function isWatched(packet) {
      if (pluginConfig.watchlist.names.includes(packet.player)) return true

      const agents = cacApi.getArkAgents()
      const serverCache = cacApi.getCache()

      for (const agent of agents) {
        const players = serverCache[agent.name]?.players || []
        const match = players.find((p) => p.name === packet.player)
        if (match && pluginConfig.watchlist.steamIds.includes(match.steamId)) return true
      }

      return false
    }

    onPacket = function (packet) {
      if (!isWatched(packet)) return

      if (packet.type === "join") {
        cacApi.sendToDiscord(pluginConfig.channel, `⚠️ Watchlisted player **${packet.player}** joined **${packet.server}**`)
      }
      if (packet.type === "chat") {
        cacApi.sendToDiscord(pluginConfig.channel, `⚠️ **${packet.player}** (${packet.server}): ${packet.text}`)
      }
      if (packet.type === "leave") {
        cacApi.sendToDiscord(pluginConfig.channel, `⚠️ Watchlisted player **${packet.player}** left **${packet.server}**`)
      }
    }

    cacApi.on("packet", onPacket)

    cacApi.registerCommand(["addwatcher", "removewatcher", "watchers", "setalertchannel"], async (message, cmd, args) => {
      if (!(await cacApi.isAdmin(message.author.id))) {
        return message.reply("You don't have permission to use this command.")
      }

      if (cmd === "addwatcher") {
        const type = args[0]?.toLowerCase()
        const value = args.slice(1).join(" ")

        if (!type || !value) return message.reply("Usage: cac.addwatcher <name|steamid> <value>")

        if (type === "name") {
          if (pluginConfig.watchlist.names.includes(value)) return message.reply(`**${value}** is already on the watchlist.`)
          pluginConfig.watchlist.names.push(value)
          savePluginConfig(pluginConfig)
          cacApi.sendToDiscord(pluginConfig.channel, `🔎 **${value}** (name) added to watchlist by ${message.author.username}`)
          return message.reply(`Added name **${value}** to the watchlist.`)
        }

        if (type === "steamid") {
          if (pluginConfig.watchlist.steamIds.includes(value)) return message.reply(`**${value}** is already on the watchlist.`)
          pluginConfig.watchlist.steamIds.push(value)
          savePluginConfig(pluginConfig)
          cacApi.sendToDiscord(pluginConfig.channel, `🔎 **${value}** (steamid) added to watchlist by ${message.author.username}`)
          return message.reply(`Added steamid **${value}** to the watchlist.`)
        }

        return message.reply("Type must be `name` or `steamid`.")
      }

      if (cmd === "removewatcher") {
        const type = args[0]?.toLowerCase()
        const value = args.slice(1).join(" ")

        if (!type || !value) return message.reply("Usage: cac.removewatcher <name|steamid> <value>")

        if (type === "name") {
          const index = pluginConfig.watchlist.names.indexOf(value)
          if (index === -1) return message.reply(`**${value}** is not on the watchlist.`)
          pluginConfig.watchlist.names.splice(index, 1)
          savePluginConfig(pluginConfig)
          return message.reply(`Removed name **${value}** from the watchlist.`)
        }

        if (type === "steamid") {
          const index = pluginConfig.watchlist.steamIds.indexOf(value)
          if (index === -1) return message.reply(`**${value}** is not on the watchlist.`)
          pluginConfig.watchlist.steamIds.splice(index, 1)
          savePluginConfig(pluginConfig)
          return message.reply(`Removed steamid **${value}** from the watchlist.`)
        }

        return message.reply("Type must be `name` or `steamid`.")
      }

      if (cmd === "watchers") {
        const { names, steamIds } = pluginConfig.watchlist
        if (!names.length && !steamIds.length) return message.reply("Watchlist is empty.")

        let response = ""
        if (names.length) response += `**Names:**\n${names.map((n) => `- ${n}`).join("\n")}\n`
        if (steamIds.length) response += `**Steam IDs:**\n${steamIds.map((s) => `- ${s}`).join("\n")}`

        return message.reply(response.trim())
      }

      if (cmd === "setalertchannel") {
        const channelId = args[0] || message.channel.id
        pluginConfig.channel = channelId
        savePluginConfig(pluginConfig)
        return message.reply(`Alert channel set to <#${channelId}>`)
      }
    })
  },
}
