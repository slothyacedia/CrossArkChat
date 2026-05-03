module.exports = {
  names: ["reload", "reloadconfig", "reloadcommands"],
  version: "v1.0.3",
  async execute(message, cmd, args, cacApi) {
    let isAdmin = cacApi.isAdmin
    let config = cacApi.getConfig()

    try {
      if (!(await isAdmin(message.author.id))) {
        throw new Error(`Not An Admin`)
      }

      const reloadAliases = {
        config: ["config", "conf", "cfg"],
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
        if (cmd == "reloadconfig") {
          reloadType = "config"
        }
        if (cmd == "reloadcommands") {
          reloadType = "commands"
        }
      }

      switch (reloadType) {
        case "config": {
          cacApi.writeConfig(cacApi.loadConfig())
          console.log(`[CrossArkChat] Config Reloaded By ${message.member.nickname}(${message.author.id})`)
          await message.reply(`Config Reload Success`)
          break
        }

        case "commands": {
          cacApi.loadCommands()
          console.log(`[CrossArkChat] Commands Reloaded By ${message.member.nickname}(${message.author.id})`)
          await message.reply(`Commands Reload Success`)
          break
        }

        default: {
          await message.reply(`Please Do \`${config.discord.prefix}reload config\` Or \`${config.discord.prefix}reload commands\``)
          break
        }
      }
    } catch (err) {
      await message.reply(`Reload Failed, ${err.message}`)
    }
  },
}
