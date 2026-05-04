const path = require("node:path")
let pluginCommands = {
  getplayerinfo: ["getplayerinfo", "gpi"],
  reload: ["reload", "reloadconfig", "reloadplugins", "reloadcommands"],
  restart: ["restart"],
}

let commandsList = Object.values(pluginCommands).flat()

module.exports = {
  name: "Core Commands",
  version: "v1.0.0",

  teardown(cacApi) {
    cacApi.discord.commands.unregister(commandsList)
  },

  setup(cacApi) {
    cacApi.discord.commands.register(pluginCommands.getplayerinfo, async (message, cmd, args) => {
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

        function formatSessionTime(ms) {
          if (!ms) return "Unknown"
          const totalSeconds = Math.floor(ms / 1000)
          const seconds = totalSeconds % 60
          const minutes = Math.floor(totalSeconds / 60) % 60
          const hours = Math.floor(totalSeconds / 3600)
          if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`
          if (minutes > 0) return `${minutes}m ${seconds}s`
          return `${seconds}s`
        }

        let results = matches.map((player) => ({
          name: player.name,
          steamId: player.steamId,
          server: player.server.name,
          sessionTime: player.joinTime ? Date.now() - player.joinTime : null,
        }))

        const truncated = results.length > 5
        if (truncated) results = results.slice(0, 5)

        let reply = results
          .map((r) => `Player: ${r.name}\nSteam: ${r.steamId}\nServer: ${r.server}\nSession Time: ${formatSessionTime(r.sessionTime)}`)
          .join("\n\n")

        if (truncated) reply += `\n\n-# More Than 5 Players Found, Try Limiting The Scope More`

        return message.reply(reply)
      } catch {
        return message.reply("Something Went Wrong...")
      }
    })

    cacApi.discord.commands.register(pluginCommands.reload, async (message, cmd, args) => {
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
            console.log(`[CrossArkChat] Config Reloaded By ${message.member.nickname}(${message.author.id})`)
            return message.reply("Config Reload Success")
          }

          case "plugins": {
            await cacApi.plugins.loadAll()
            console.log(`[CrossArkChat] Plugins Reloaded By ${message.member.nickname}(${message.author.id})`)
            return message.reply("Plugins Reload Success")
          }

          case "commands": {
            await cacApi.plugins.reload("Core Commands")
            console.log(`[CrossArkChat] Commands Reloaded By ${message.member.nickname}(${message.author.id})`)
            return message.reply("Commands Reload Success")
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

    cacApi.discord.commands.register(pluginCommands.restart, async (message, cmd, args) => {
      try {
        if (!(await cacApi.utils.isAdmin(message.author.id))) throw new Error("Not An Admin")

        const childProc = await cacApi.utils.modMan.require("node:child_process")

        console.log(`[CrossArkChat] Restart Requested By ${message.member.nickname}(${message.author.id})`)
        await message.reply("Restarting...")

        const child = childProc.spawn(process.argv[0], process.argv.slice(1), {
          detached: true,
          stdio: "inherit",
        })
        child.unref()

        console.log(`[CrossArkChat] Restart Spawned, Exiting...`)
        console.log(``)
        process.exit(0)
      } catch (err) {
        return message.reply(`Restart Failed, ${err.message}`)
      }
    })
  },
}
