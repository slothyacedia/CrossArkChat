module.exports = {
  names: ["restart"],
  version: "v1.0.0",
  async execute(message, cmd, args, cacApi) {
    let isAdmin = cacApi.isAdmin
    let childProc = await cacApi.modMan.require("node:child_process")

    try {
      if (!(await isAdmin(message.author.id))) {
        throw new Error(`Not An Admin`)
      }

      console.log(`[CrossArkChat] Restart Requested By ${message.member.nickname}(${message.author.id})`)
      await message.reply(`Restarting...`)
      let startArgs = process.argv.slice(1)
      let child = childProc.spawn(process.argv[0], startArgs, {
        detached: true,
        stdio: "inherit",
      })
      child.unref()
      console.log(`[CrossArkChat] Restart Spawned, Exiting...`)
      process.exit(0)
    } catch (err) {
      await message.reply(`Restart Failed, ${err.message}`)
    }
  },
}
