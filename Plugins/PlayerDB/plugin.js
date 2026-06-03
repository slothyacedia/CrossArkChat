let onPacket = null

module.exports = {
  name: "Player Database",
  version: "v1.0.2",

  async teardown(cacApi) {
    cacApi.events.off("packet", onPacket)
    onPacket = null
    if (cacApi.database && cacApi.database.playerDB) {
      delete cacApi.apis.playerDB
    }
  },

  async setup(cacApi) {
    const path = cacApi.utils.modules.path
    const fs = cacApi.utils.modules.fs

    const playerTable = cacApi.database.tools.table("players").createColumn("steamId", "string unique").createColumn("profile", "string")

    const getProfile = (steamId) => {
      const row = playerTable.findOne("steamId", steamId)
      return row ? JSON.parse(row.profile) : null
    }

    const saveProfile = (steamId, profileObj) => {
      playerTable.upsert("steamId", steamId, { profile: JSON.stringify(profileObj, null, 2) })
    }

    cacApi.apis.playerDB = {
      getProfile,
      saveProfile,
    }

    let lastJson = ""
    let lastPlayerCache = ""

    try {
      lastJson = fs.readFileSync(path.join(__dirname, "playerDB.json"), "utf8")
    } catch (e) {}

    try {
      lastPlayerCache = fs.readFileSync(path.join(__dirname, "playerCache.json"), "utf8")
    } catch (e) {}

    cacApi.events.on("playerInfoUpdate", async (data) => {
      let config = cacApi.config.get()
      let cache = cacApi.cache.get()
      const enabledServers = config.servers.filter((server) => server.enabled)

      const serverPlayers = enabledServers.flatMap((server) => {
        return (cache[server.name]?.players || []).map((player) => ({ ...player, server: { name: server.name } }))
      })

      let newPlayerCache = JSON.stringify(serverPlayers, null, 2)
      if (lastPlayerCache === newPlayerCache) {
        return
      }

      fs.writeFileSync(path.join(__dirname, "playerCache.json"), newPlayerCache, "utf8")
      lastPlayerCache = newPlayerCache

      for (let player of serverPlayers) {
        if (!player.steamId) continue

        let profile = getProfile(player.steamId) || {
          steamId: player.steamId,
          names: {},
          lastseen: {},
          tribes: {},
          data: {},
        }

        profile.names = {
          steam: player.name,
          in_game: player.data?.ign || "",
        }
        profile.lastseen = {
          timestamp: "online",
          readable: "online",
          map: player.server.name,
        }
        profile.tribes[player.server.name] = {
          name: player.data?.tribeName || "",
          id: player.data?.tribeId || "",
        }
        profile.data = player.data

        saveProfile(player.steamId, profile)
      }

      cacApi.events.emit("playerDB.update")
    })

    onPacket = async function (packet) {
      let packetType = packet.type?.toLowerCase()
      if (!["join", "leave"].includes(packetType)) return

      const targetSteamId = packet.metadata?.steamId || packet.steamId
      if (!targetSteamId) return

      let profile = getProfile(targetSteamId) || {
        steamId: targetSteamId,
        names: {},
        lastseen: {},
        tribes: {},
        data: {},
      }

      switch (packetType) {
        case "join": {
          profile.lastseen = {
            timestamp: "online",
            readable: "online",
            map: packet.server || "Unknown",
          }
          break
        }

        case "leave": {
          profile.lastseen = {
            timestamp: Date.now(),
            readable: new Date().toLocaleString(),
            map: packet.server || "Unknown",
          }
          break
        }
      }

      saveProfile(targetSteamId, profile)
      cacApi.events.emit("playerDB.update")
    }

    cacApi.events.on("playerDB.update", async () => {
      try {
        const allRows = cacApi.database("players").prepare("SELECT profile FROM players").all()
        const allData = allRows.map((row) => JSON.parse(row.profile))

        let newJson = JSON.stringify(allData, null, 2)

        if (lastJson !== newJson) {
          fs.writeFileSync(path.join(__dirname, "playerDB.json"), newJson, "utf8")
          lastJson = newJson
        }
      } catch (err) {
        console.error("[PlayerDB] Error exporting human-browsable JSON:", err)
      }
    })

    cacApi.events.on("packet", onPacket)
  },
}
