const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let poller = null

module.exports = {
  name: "More Player Info",
  version: "v1.0.0",

  teardown(cacApi) {
    if (onPacket) cacApi.events.off("packet", onPacket)
    if (poller) clearInterval(poller)
  },

  setup(cacApi) {
    let getCache = () => cacApi.cache.get()
    let arkAgents = cacApi.ark.getAgents()

    let cache = getCache()
    poller = setInterval(async () => {
      arkAgents.forEach(async (agent) => {
        const cacheKey = agent.name
        let response = await agent.sendCommand("ListAllPlayerSteamId")
        if (!response) return
        if (response.trim() == "No Players Online") return

        let lines = response.trim().split("\n")
        for (let line of lines) {
          let playerInfo = line.match(/^(.+)\s\[(.*)\]:\s(\d+)$/)
          if (playerInfo) {
            let [, inGameName, tribeName, steamId] = playerInfo
            let playerMatch = cache[cacheKey].players.find((player) => player.steamId == steamId)
            if (!playerMatch) continue
            playerMatch.data.tribeName = tribeName
            playerMatch.data.ign = inGameName
          }
        }
      })
    }, 1000)

    onPacket = async function (packet) {
      let steamId = packet.metadata?.steamId

      if (["join", "leave"].includes(packet.type)) {
        let agent = arkAgents.find((agent) => agent.name == packet.server)
        const cacheKey = agent.name
        let response = await agent.sendCommand("ListAllPlayerSteamId")
        if (!response) return
        if (response.trim() == "No Players Online") return

        let lines = response.trim().split("\n")
        for (let line of lines) {
          let playerInfo = line.match(/^(.+)\s\[(.*)\]:\s(\d+)$/)
          if (playerInfo) {
            let [, inGameName, tribeName, steamId] = playerInfo
            let playerMatch = cache[cacheKey].players.find((player) => player.steamId == steamId)
            if (!playerMatch) continue
            playerMatch.tribeName = tribeName
            playerMatch.ign = inGameName
          }
        }
      }
    }

    cacApi.events.on("packet", onPacket)
  },
}
