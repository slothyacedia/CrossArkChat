module.exports = {
  names: ["reload", "reloadconfig", "rc"],
  async execute(message, args, cacApi) {
    let isAdmin = cacApi.isAdmin
    let config = cacApi.getConfig()

    try {
      if (!(await isAdmin(message.author.id))) {
        throw new Error(`Not An Admin`)
      }

      cacApi.writeConfig(cacApi.loadConfig())
      console.log(`[CrossArkChat] Config Reloaded By ${message.member.nickname}(${message.author.id})`)

      await message.reply(`Config Reload Success`)
    } catch (err) {
      await message.reply(`Config Reload Failed, ${err.message}`)
    }
  },
}
