module.exports = {
  names: ["reloadCommands", "rlc"],
  async execute(message, args, cacApi) {
    let isAdmin = cacApi.isAdmin
    let config = cacApi.getConfig()

    try {
      if (!(await isAdmin(message.author.id))) {
        throw new Error(`Not An Admin`)
      }

      cacApi.loadCommands()

      await message.reply(`Commands Reload Success`)
    } catch (err) {
      await message.reply(`Commands Reload Failed, ${err.message}`)
    }
  },
}
