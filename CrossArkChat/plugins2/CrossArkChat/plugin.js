const path = require("node:path")
let pluginCommands = {
  getplayerinfo: ["getPlayerInfo", "gpi"],
  reload: ["reload", "reloadConfig", "reloadPlugins", "reloadCommands"],
  restart: ["restart"],
  rcon: ["rcon", "sendRcon"],
  rconAll: ["rconAll", "sendRconAll"],
}

let commandsList = Object.values(pluginCommands).flat()

module.exports = {
  name: "CrossArkChat",
  version: "v2.0.5",

  async teardown(cacApi) {
    let textCmd = cacApi.discord.commands.text
    textCmd.unregister(commandsList)
  },

  async setup(cacApi) {
    const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = cacApi.utils.modules.djs
    let textCmd = cacApi.discord.commands.text
    let slashCmd = cacApi.discord.commands.slash

    function formatTime(ms) {
      if (!ms) return "Unknown"
      const totalSeconds = Math.floor(ms / 1000)
      const seconds = totalSeconds % 60
      const minutes = Math.floor(totalSeconds / 60) % 60
      const hours = Math.floor(totalSeconds / 3600)
      if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
      if (minutes > 0) return `${minutes}m ${seconds}s`
      return `${seconds}s`
    }

    textCmd.register(pluginCommands.getplayerinfo, async (message, cmd, args) => {
      const config = cacApi.config.get()
      const cache = cacApi.cache.get()

      try {
        const query = args.join(" ").toLowerCase().trim()

        if (!query) return message.reply("Please Provide A Player Name Or Steam ID")

        const enabledServers = config.servers.filter((server) => server.enabled)

        const serverPlayers = enabledServers.flatMap((server) => {
          return (cache[server.name]?.players || []).map((player) => ({ ...player, server }))
        })

        let matches = serverPlayers.filter(
          (player) => player.name.toLowerCase().includes(query) || player.data.ign.toLowerCase().includes(query) || player.steamId.includes(query),
        )

        if (matches.length === 0) return message.reply("No Player Found")

        function formatTime(ms) {
          if (!ms) return "Unknown"
          const totalSeconds = Math.floor(ms / 1000)
          const seconds = totalSeconds % 60
          const minutes = Math.floor(totalSeconds / 60) % 60
          const hours = Math.floor(totalSeconds / 3600)
          if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
          if (minutes > 0) return `${minutes}m ${seconds}s`
          return `${seconds}s`
        }

        let results = matches.map((player) => {
          let name = player.data?.ign ? `${player.name} (${player.data.ign})` : player.name
          let sessionTime = Date.now() - (player.data?.sessionStart ? player.data.sessionStart : player.joinTime)
          let joinTime = Date.now() - player.joinTime

          return {
            name,
            tribe: player.data?.tribeName || null,
            steamId: player.steamId,
            server: player.server.name,
            joinTime,
            sessionTime,
          }
        })

        const truncated = results.length > 5
        if (truncated) results = results.slice(0, 5)

        const fields = {
          player: (r) => `Player: ${r.name}`,
          steam: (r) => `Steam: ${r.steamId}`,
          tribe: (r) => r.tribe && `Tribe: ${r.tribe}`,
          server: (r) => `Server: ${r.server}`,
          join: (r) => `Current Server Time: ${formatTime(r.joinTime)}`,
          session: (r) => `Session Time: ${formatTime(r.sessionTime)}`,
        }

        const layout = ["player", "steam", "tribe", "server", "join", "session"]

        let reply = results
          .map((result) =>
            layout
              .map((key) => fields[key](result))
              .filter(Boolean)
              .join("\n"),
          )
          .join("\n\n")

        if (truncated) reply += `\n\n-# More Than 5 Players Found, Try Limiting The Scope More`

        return message.reply(reply)
      } catch {
        return message.reply("Something Went Wrong...")
      }
    })

    textCmd.register(pluginCommands.reload, async (message, cmd, args) => {
      const config = cacApi.config.get()

      try {
        if (!(await cacApi.utils.isAdmin(message.author.id))) throw new Error("Not An Admin")

        const reloadAliases = {
          config: ["config", "conf", "cfg"],
          plugins: ["plugins", "plugin"],
          commands: ["commands", "command", "cmd", "cmds"],
        }

        function resolveReload(input) {
          input = (input || "").toLowerCase()
          for (const [type, aliases] of Object.entries(reloadAliases)) {
            if (aliases.includes(input)) return type
          }
          return null
        }

        let reloadType = resolveReload(args[0])

        if (!reloadType) {
          if (cmd === "reloadconfig") reloadType = "config"
          if (cmd === "reloadplugins") reloadType = "plugins"
          if (cmd === "reloadcommands") reloadType = "commands"
        }

        switch (reloadType) {
          case "config": {
            cacApi.config.write(cacApi.config.load())
            console.log(`[Plugin: ${this.name}] Config Reloaded By ${message.member.nickname}(${message.author.id})`)
            return message.reply("Config Reload Success")
            break
          }

          case "plugins": {
            await cacApi.plugins.loadAll()
            console.log(`[Plugin: ${this.name}] Plugins Reloaded By ${message.member.nickname}(${message.author.id})`)
            return message.reply("Plugins Reload Success")
            break
          }

          case "commands": {
            await cacApi.plugins.reload("CrossArkChat")
            console.log(`[Plugin: ${this.name}] Commands Reloaded By ${message.member.nickname}(${message.author.id})`)
            return message.reply("Commands Reload Success")
            break
          }

          default: {
            return message.reply(
              `Please Do \`${config.discord.prefix}reload config\`, \`${config.discord.prefix}reload plugins\`, Or \`${config.discord.prefix}reload commands\``,
            )
          }
        }
      } catch (err) {
        return message.reply(`Reload Failed, ${err.message}`)
      }
    })

    textCmd.register(pluginCommands.restart, async (message, cmd, args) => {
      try {
        if (!(await cacApi.utils.isAdmin(message.author.id))) throw new Error("Not An Admin")

        const childProc = cacApi.utils.modules.child_process

        console.log(`[Plugin: ${this.name}] Restart Requested By ${message.member.nickname}(${message.author.id})`)
        await message.reply("Restarting...")

        const child = childProc.spawn(process.argv[0], process.argv.slice(1), {
          detached: true,
          stdio: "inherit",
        })
        child.unref()

        console.log(`[Plugin: ${this.name}] Restart Spawned, Exiting...`)
        console.log(``)
        process.exit(0)
      } catch (err) {
        return message.reply(`Restart Failed, ${err.message}`)
      }
    })

    // textCmd.register(pluginCommands.rcon, async (message, cmd, args) => {
    //   try {
    //     if (!(await cacApi.utils.isAdmin(message.author.id))) throw new Error("Not An Admin")
    //   } catch (err) {
    //     return message.reply(`Rcon Failed, ${err.message}`)
    //   }
    // })

    slashCmd.register(
      pluginCommands.getplayerinfo[0],

      new SlashCommandBuilder()
        .setName("getplayerinfo")
        .setDescription("Get information about a player")
        .addStringOption((option) => option.setName("query").setDescription("Player name or Steam ID").setRequired(true)),

      async (interaction, cmd, args) => {
        const config = cacApi.config.get()
        const cache = cacApi.cache.get()

        try {
          const query = args.query

          const enabledServers = config.servers.filter((server) => server.enabled)

          const serverPlayers = enabledServers.flatMap((server) => {
            return (cache[server.name]?.players || []).map((player) => ({
              ...player,
              server,
            }))
          })

          let matches = serverPlayers.filter(
            (player) => player.name.toLowerCase().includes(query) || player.data.ign.toLowerCase().includes(query) || player.steamId.includes(query),
          )

          if (matches.length === 0) {
            return interaction.reply({
              content: "No Player Found",
              flags: 64,
            })
          }

          let results = matches.map((player) => {
            let name = player.data?.ign ? `${player.name} (${player.data.ign})` : player.name

            let sessionTime = Date.now() - (player.data?.sessionStart ? player.data.sessionStart : player.joinTime)

            let joinTime = Date.now() - player.joinTime

            return {
              name,
              tribe: player.data?.tribeName || null,
              steamId: player.steamId,
              server: player.server.name,
              joinTime,
              sessionTime,
            }
          })

          const truncated = results.length > 5
          if (truncated) results = results.slice(0, 5)

          const fields = {
            player: (r) => `Player: ${r.name}`,
            steam: (r) => `Steam: ${r.steamId}`,
            tribe: (r) => r.tribe && `Tribe: ${r.tribe}`,
            server: (r) => `Server: ${r.server}`,
            join: (r) => `Current Server Time: ${formatTime(r.joinTime)}`,
            session: (r) => `Session Time: ${formatTime(r.sessionTime)}`,
          }

          const layout = ["player", "steam", "tribe", "server", "join", "session"]

          let reply = results
            .map((result) =>
              layout
                .map((key) => fields[key](result))
                .filter(Boolean)
                .join("\n"),
            )
            .join("\n\n")

          if (truncated) {
            reply += `\n\n-# More Than 5 Players Found, Try Limiting The Scope More`
          }

          return interaction.reply({
            content: reply,
            flags: 64,
          })
        } catch {
          return interaction.reply({
            content: "Something Went Wrong...",
            flags: 64,
          })
        }
      },
    )

    slashCmd.register(
      pluginCommands.reload[0],

      new SlashCommandBuilder()
        .setName("reload")
        .setDescription("Reload CrossArkChat components")
        .addStringOption((option) =>
          option
            .setName("type")
            .setDescription("What to reload")
            .setRequired(true)
            .addChoices({ name: "Config", value: "config" }, { name: "Plugins", value: "plugins" }, { name: "Commands", value: "commands" }),
        ),

      async (interaction, cmd, args) => {
        try {
          if (!(await cacApi.utils.isAdmin(interaction.user.id))) {
            throw new Error("Not An Admin")
          }

          const reloadType = args.type
          let reply
          let config = cacApi.config.get()

          switch (reloadType) {
            case "config": {
              cacApi.config.write(cacApi.config.load())
              console.log(`[Plugin: ${this.name}] Config Reloaded By ${interaction.user.username}(${interaction.user.id})`)
              reply = "Config Reload Success"
              break
            }

            case "plugins": {
              await cacApi.plugins.loadAll()
              console.log(`[Plugin: ${this.name}] Plugins Reloaded By ${interaction.user.username}(${interaction.user.id})`)
              reply = "Plugins Reload Success"
              break
            }

            case "commands": {
              await cacApi.plugins.reload("CrossArkChat")
              console.log(`[Plugin: ${this.name}] Commands Reloaded By ${interaction.user.username}(${interaction.user.id})`)
              reply = "Commands Reload Success"
              break
            }
          }

          return interaction.reply({
            content: reply,
            flags: 64,
          })
        } catch (err) {
          return interaction.reply({
            content: `Reload Failed, ${err.message}`,
            flags: 64,
          })
        }
      },
    )

    slashCmd.register(
      pluginCommands.restart[0],

      new SlashCommandBuilder().setName("restart").setDescription("Restart CrossArkChat"),

      async (interaction, cmd, args) => {
        try {
          if (!(await cacApi.utils.isAdmin(interaction.user.id))) {
            throw new Error("Not An Admin")
          }

          const childProc = cacApi.utils.modules.child_process

          console.log(`[Plugin: ${this.name}] Restart Requested By ${interaction.user.username}(${interaction.user.id})`)

          let reply = "Restarting..."

          await interaction.reply({
            content: reply,
            flags: 64,
          })

          const child = childProc.spawn(process.argv[0], process.argv.slice(1), {
            detached: true,
            stdio: "inherit",
          })

          child.unref()

          console.log(`[Plugin: ${this.name}] Restart Spawned, Exiting...`)
          console.log(``)

          process.exit(0)
        } catch (err) {
          return interaction.reply({
            content: `Restart Failed, ${err.message}`,
            flags: 64,
          })
        }
      },
    )
  },
}
