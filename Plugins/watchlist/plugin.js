const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let pluginCommands = ["watchlist", "wl"]

module.exports = {
  name: "Watchlist",
  version: "v2.0.3",

  teardown(cacApi) {
    let textCmd = cacApi.discord.commands.text
    textCmd.unregister(pluginCommands)
    if (onPacket) cacApi.events.off("packet", onPacket)
  },

  setup(cacApi) {
    const { SlashCommandBuilder } = cacApi.utils.modules.djs
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
      config.watchlist.names = config.watchlist.names.map((name) => name.toLowerCase())
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

    textCmd.register(pluginCommands, async (message, cmd, args) => {
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

    slashCmd.register(
      "watchlist",

      new SlashCommandBuilder()
        .setName("watchlist")
        .setDescription("Manage the watchlist")

        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Add to watchlist")
            .addStringOption((option) => option.setName("name").setDescription("Player name").setRequired(false))
            .addStringOption((option) => option.setName("steamid").setDescription("Steam ID").setRequired(false)),
        )

        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Remove from watchlist")
            .addStringOption((option) => option.setName("name").setDescription("Player name").setRequired(false))
            .addStringOption((option) => option.setName("steamid").setDescription("Steam ID").setRequired(false)),
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
              content: "You don't have permission to use this command.",
              flags: 64,
            })
          }

          const subCommand = args.subCommand

          if (subCommand === "add") {
            let name = args.name
            let steamId = args.steamid

            if (!name && !steamId) {
              return interaction.reply({
                content: "Please provide either a name or steamid.",
                flags: 64,
              })
            }

            let response = []

            if (name) {
              name = name.toLowerCase()
              if (pluginConfig.watchlist.names.includes(name)) {
                response.push(`Name **${name}** is already on the watchlist.`)
              } else {
                pluginConfig.watchlist.names.push(name)

                cacApi.discord.send(pluginConfig.channel, `🔎 **${name}** (name) added to watchlist by ${interaction.user.username}`)

                response.push(`Added name **${name}** to the watchlist.`)
              }
            }

            if (steamId) {
              steamId = steamId.toLowerCase().split(".")[0]
              if (pluginConfig.watchlist.steamIds.includes(steamId)) {
                response.push(`SteamID **${steamId}** is already on the watchlist.`)
              } else {
                pluginConfig.watchlist.steamIds.push(steamId)

                cacApi.discord.send(pluginConfig.channel, `🔎 **${steamId}** (steamid) added to watchlist by ${interaction.user.username}`)

                response.push(`Added steamid **${steamId}** to the watchlist.`)
              }
            }

            savePluginConfig(pluginConfig)

            return interaction.reply({
              content: response.join("\n"),
              flags: 64,
            })
          }

          if (subCommand === "remove") {
            let name = args.name
            let steamId = args.steamid

            if (!name && !steamId) {
              return interaction.reply({
                content: "Please provide either a name or steamid.",
                flags: 64,
              })
            }

            let response = []

            if (name) {
              name = name.toLowerCase()
              const index = pluginConfig.watchlist.names.indexOf(name)

              if (index === -1) {
                response.push(`Name **${name}** is not on the watchlist.`)
              } else {
                pluginConfig.watchlist.names.splice(index, 1)
                response.push(`Removed name **${name}** from the watchlist.`)
              }
            }

            if (steamId) {
              steamId = steamId.toLowerCase().split(".")[0]
              const index = pluginConfig.watchlist.steamIds.indexOf(steamId)

              if (index === -1) {
                response.push(`SteamID **${steamId}** is not on the watchlist.`)
              } else {
                pluginConfig.watchlist.steamIds.splice(index, 1)
                response.push(`Removed steamid **${steamId}** from the watchlist.`)
              }
            }

            savePluginConfig(pluginConfig)

            return interaction.reply({
              content: response.join("\n"),
              flags: 64,
            })
          }

          if (subCommand === "list") {
            const { names, steamIds } = pluginConfig.watchlist

            if (!names.length && !steamIds.length) {
              return interaction.reply({
                content: "Watchlist is empty.",
                flags: 64,
              })
            }

            let response = ""

            if (names.length) {
              response += `**Names:**\n${names.map((n) => `- ${n}`).join("\n")}\n`
            }

            if (steamIds.length) {
              response += `**Steam IDs:**\n${steamIds.map((s) => `- ${s}`).join("\n")}`
            }

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
              content: `Alert channel set to <#${channel.id}>`,
              flags: 64,
            })
          }
        } catch (err) {
          return interaction.reply({
            content: `Something went wrong: ${err.message}`,
            flags: 64,
          })
        }
      },
    )
  },
}
