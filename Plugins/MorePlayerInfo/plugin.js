const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let poller = null

module.exports = {
  name: "More Player Info",
  version: "v2.0.0",

  async teardown(cacApi) {
    if (onPacket) cacApi.events.off("packet", onPacket)
    if (poller) clearInterval(poller)
  },

  async setup(cacApi) {
    let getCache = () => cacApi.cache.get()
    let arkAgents = cacApi.ark.getAgents()

    let cache = getCache()
    poller = setInterval(async () => {
      arkAgents.forEach(async (agent) => {
        const cacheKey = agent.name
        let response = await agent.sendCommand("playerInfo.getAllPlayerInfos")
        if (!response) return
        if (response.trim() == "[No Players Online]") return

        let players

        try {
          response = response.trim()
          players = JSON.parse(response)
        } catch (err) {
          console.log(`[${this.name}] Failed To Parse Player Info Response: ${err.message}`)
        }

        if (!players) return

        players.forEach((player) => {
          let playerMatch = cache[cacheKey].players.find((cachedPlayer) => cachedPlayer.steamId == player.steamId)
          if (playerMatch) {
            playerMatch.data.tribeName = player.tribeName == "?" && player.tribeId == "?" ? "" : player.tribeName
            playerMatch.data.tribeId = player.tribeName == "?" && player.tribeId == "?" ? "" : player.tribeId
            playerMatch.data.ign = player.charName
            playerMatch.data.playerId = player.playerId
          }
        })
      })

      cacApi.events.emit("playerInfoUpdate", { source: "updater" })
    }, 1000)

    onPacket = async function (packet) {
      let steamId = packet.metadata?.steamId

      if (["join", "leave"].includes(packet.type)) {
        let agent = arkAgents.find((agent) => agent.name == packet.server)
        const cacheKey = agent.name
        let response = await agent.sendCommand("playerInfo.getAllPlayerInfos")
        if (!response) return
        if (response.trim() == "[No Players Online]") return

        let players

        try {
          response = response.trim()
          players = JSON.parse(response)
        } catch (err) {
          console.log(`[${this.name}] Failed To Parse Player Info Response: ${err.message}`)
        }

        if (!players) return

        players.forEach((player) => {
          let playerMatch = cache[cacheKey].players.find((cachedPlayer) => cachedPlayer.steamId == player.steamId)
          if (playerMatch) {
            playerMatch.data.tribeName = player.tribeName == "?" && player.tribeId == "?" ? "" : player.tribeName
            playerMatch.data.tribeId = player.tribeName == "?" && player.tribeId == "?" ? "" : player.tribeId
            playerMatch.data.ign = player.charName
            playerMatch.data.playerId = player.playerId
          }
        })
      }

      cacApi.events.emit("playerInfoUpdate", { source: "packet", packet })
    }

    cacApi.events.on("packet", onPacket)
  },
}
