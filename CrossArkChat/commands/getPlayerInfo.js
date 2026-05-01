module.exports = {
  names: ["getplayerinfo", "gpi"],
  async execute(message, cmd, args, cacApi) {
    let config = cacApi.getConfig()
    let cache = cacApi.getCache()

    try {
      let query = args.join(" ").toLowerCase().trim()

      if (!query) {
        return message.reply("Please Provide A Player Name Or Steam ID")
      }

      let enabledServers = config.servers.filter((server) => server.enabled)

      let serverPlayers = enabledServers.flatMap((server) => {
        return (cache[server.name]?.players || []).map((player) => ({
          ...player,
          server,
        }))
      })

      let matches = serverPlayers.filter((player) => player.name.toLowerCase().includes(query) || player.steamId.includes(query))

      if (matches.length === 0) {
        return message.reply("No Player Found")
      }

      let results = []

      for (const player of matches) {
        const server = player.server

        let joinTime = player.joinTime || null
        let sessionTime = joinTime ? Date.now() - joinTime : null

        results.push({
          name: player.name,
          steamId: player.steamId,
          server: server.name,
          joinTime,
          sessionTime,
        })
      }

      if (results.length === 0) {
        return message.reply("Player Exists In Cache But Server Query Failed")
      }

      function formatSessionTime(ms) {
        if (!ms) return "Unknown"

        let totalSeconds = Math.floor(ms / 1000)
        let minutes = Math.floor(totalSeconds / 60)
        let seconds = totalSeconds % 60
        let hours = Math.floor(minutes / 60)
        minutes = minutes % 60

        if (hours > 0) {
          return `${hours}h ${minutes}m ${seconds}s`
        }

        if (minutes > 0) {
          return `${minutes}m ${seconds}s`
        }

        return `${seconds}s`
      }

      if (results.length > 5) {
        results = results.slice(0, 5)
      }

      let reply = results
        .map((result) => {
          return `Player: ${result.name}\nSteam: ${result.steamId}\nServer: ${result.server}\nSession Time: ${formatSessionTime(result.sessionTime)}`
        })
        .join("\n\n")

      if (results.length > 5) {
        reply += `\n\n-# More Than 5 Players Found, Try Limiting The Scope More`
      }

      return message.reply(reply)
    } catch {
      await message.reply(`Something Went Wrong...`)
    }
  },
}
