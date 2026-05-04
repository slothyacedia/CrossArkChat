const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let pluginCommands = ["watchlist", "wl"]

module.exports = {
  name: "Watchlist",
  version: "v1.2.0",

  teardown(cacApi) {
    cacApi.discord.commands.unregister(pluginCommands)
    if (onPacket) cacApi.events.off("packet", onPacket)
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
      if (pluginConfig.watchlist.steamIds.includes(packet.metadata?.steamId)) return true
      return false
    }

    onPacket = function (packet) {
      if (!isWatched(packet)) return

      if (packet.type === "join") {
        const steamId = packet.metadata?.steamId
        if (
          steamId &&
          !pluginConfig.watchlist.steamIds.includes(steamId) &&
          pluginConfig.watchlist.names.map((name) => name.toLowerCase()).includes(packet.player.toLowerCase())
        ) {
          pluginConfig.watchlist.steamIds.push(steamId)
          savePluginConfig(pluginConfig)
          cacApi.discord.send(pluginConfig.channel, `🔎 Auto-added steamid **${steamId}** for watched name **${packet.player}**`)
        }

        cacApi.discord.send(pluginConfig.channel, `⚠️ **${packet.player}** (${packet.metadata?.steamId}) joined **${packet.server}**`)
      }

      if (packet.type === "chat") {
        const steamId = packet.metadata?.steamId
        if (
          steamId &&
          !pluginConfig.watchlist.steamIds.includes(steamId) &&
          pluginConfig.watchlist.names.map((name) => name.toLowerCase()).includes(packet.player.toLowerCase())
        ) {
          pluginConfig.watchlist.steamIds.push(steamId)
          savePluginConfig(pluginConfig)
          cacApi.discord.send(pluginConfig.channel, `🔎 Auto-added steamid **${steamId}** for watched name **${packet.player}**`)
        }
        cacApi.discord.send(pluginConfig.channel, `⚠️ **${packet.player}** (${packet.server}): ${packet.text}`)
      }

      if (packet.type === "leave") {
        cacApi.discord.send(pluginConfig.channel, `⚠️ **${packet.player}** (${packet.metadata?.steamId}) left **${packet.server}**`)
      }
    }

    cacApi.events.on("packet", onPacket)

    cacApi.discord.commands.register(pluginCommands, async (message, cmd, args) => {
      if (!(await cacApi.utils.isAdmin(message.author.id))) {
        return message.reply("You don't have permission to use this command.")
      }

      let config = cacApi.config.get()
      let prefix = config.discord.prefix || "cac."
      let actionType = args[0]?.toLowerCase()
      let actionValue = args.slice(1).join(" ")

      if (["addname", "an"].includes(actionType)) {
        if (!actionValue) return message.reply(`Usage: ${prefix}watchlist addName <name>`)
        if (pluginConfig.watchlist.names.includes(actionValue)) return message.reply(`**${actionValue}** is already on the watchlist.`)
        pluginConfig.watchlist.names.push(actionValue)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(pluginConfig.channel, `🔎 **${actionValue}** (name) added to watchlist by ${message.author.username}`)
        return message.reply(`Added name **${actionValue}** to the watchlist.`)
      }

      if (["addsteam", "as"].includes(actionType)) {
        if (!actionValue) return message.reply(`Usage: ${prefix}watchlist addSteam <steamId>`)
        if (pluginConfig.watchlist.steamIds.includes(actionValue)) return message.reply(`**${actionValue}** is already on the watchlist.`)
        pluginConfig.watchlist.steamIds.push(actionValue)
        savePluginConfig(pluginConfig)
        cacApi.discord.send(pluginConfig.channel, `🔎 **${actionValue}** (steamid) added to watchlist by ${message.author.username}`)
        return message.reply(`Added steamid **${actionValue}** to the watchlist.`)
      }

      if (["removename", "rn"].includes(actionType)) {
        if (!actionValue) return message.reply(`Usage: ${prefix}watchlist removeName <name>`)
        const index = pluginConfig.watchlist.names.indexOf(actionValue)
        if (index === -1) return message.reply(`**${actionValue}** is not on the watchlist.`)
        pluginConfig.watchlist.names.splice(index, 1)
        savePluginConfig(pluginConfig)
        return message.reply(`Removed name **${actionValue}** from the watchlist.`)
      }

      if (["removesteam", "rs"].includes(actionType)) {
        if (!actionValue) return message.reply(`Usage: ${prefix}watchlist removeSteam <steamId>`)
        const index = pluginConfig.watchlist.steamIds.indexOf(actionValue)
        if (index === -1) return message.reply(`**${actionValue}** is not on the watchlist.`)
        pluginConfig.watchlist.steamIds.splice(index, 1)
        savePluginConfig(pluginConfig)
        return message.reply(`Removed steamid **${actionValue}** from the watchlist.`)
      }

      if (["list", "l"].includes(actionType)) {
        const { names, steamIds } = pluginConfig.watchlist
        if (!names.length && !steamIds.length) return message.reply("Watchlist is empty.")

        let response = ""
        if (names.length) response += `**Names:**\n${names.map((n) => `- ${n}`).join("\n")}\n`
        if (steamIds.length) response += `**Steam IDs:**\n${steamIds.map((s) => `- ${s}`).join("\n")}`

        return message.reply(response.trim())
      }

      if (["setchannel", "sc"].includes(actionType)) {
        const mention = message.mentions.channels.first()
        const channelId = mention?.id || args[1] || message.channel.id
        pluginConfig.channel = channelId
        savePluginConfig(pluginConfig)
        return message.reply(`Alert channel set to <#${channelId}>`)
      }

      return message.reply(
        [
          `**Watchlist Commands:**\n`,
          `\`${prefix}${cmd} addName <name>\``,
          `\`${prefix}${cmd} addSteam <steamId>\``,
          `\`${prefix}${cmd} removeName <name>\``,
          `\`${prefix}${cmd} removeSteam <steamId>\``,
          `\`${prefix}${cmd} list\``,
          `\`${prefix}${cmd} setchannel [channelId]\``,
        ].join("\n"),
      )
    })
  },
}
