let onPacket = null

module.exports = {
  name: "Player Database",
  version: "v1.0.0",

  async teardown(cacApi) {
    cacApi.events.off("packet", onPacket)
    onPacket = null
    if (cacApi.database && cacApi.database.playerDB) {
      delete cacApi.database.playerDB
    }
  },

  async setup(cacApi) {
    const path = cacApi.utils.modules.path
    const fs = cacApi.utils.modules.fs

    const db = cacApi.database("players")

    const getProfile = (steamId) => {
      const row = db.prepare("SELECT profile FROM players WHERE steamId = ?").get(steamId)
      return row ? JSON.parse(row.profile) : null
    }

    const saveProfile = (steamId, profileObj) => {
      db.prepare(
        `
        INSERT INTO players (steamId, profile) 
        VALUES (?, ?) 
        ON CONFLICT(steamId) DO UPDATE SET profile = excluded.profile
      `,
      ).run(steamId, JSON.stringify(profileObj, null, 2))
    }

    cacApi.database.playerDB = {
      db,
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
        const rows = db.prepare("SELECT profile FROM players").all()
        const allData = rows.map((r) => JSON.parse(r.profile))

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
