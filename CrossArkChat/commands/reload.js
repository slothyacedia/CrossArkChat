module.exports = {
  names: ["reload", "reloadconfig", "reloadcommands"],
  async execute(message, cmd, args, cacApi) {
    let isAdmin = cacApi.isAdmin
    let config = cacApi.getConfig()

    try {
      if (!(await isAdmin(message.author.id))) {
        throw new Error(`Not An Admin`)
      }

      let reloadType = (args[0] || "").toLowerCase()
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
