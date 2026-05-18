const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let poller = null

module.exports = {
  name: "Live Player List",
  version: "v1.0.3",

  async teardown(cacApi) {
    if (onPacket) cacApi.events.off("packet", onPacket)
    if (poller) clearTimeout(poller)

    onPacket = null
    poller = null
  },

  async setup(cacApi) {
    const djs = cacApi.utils.modules.djs
    const { EmbedBuilder } = djs

    const pluginDir = __dirname
    const configPath = path.join(pluginDir, "config.json")

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            channel: "",
          },
          null,
          2,
        ),
      )
    }

    function loadPluginConfig() {
      delete require.cache[require.resolve(configPath)]
      return JSON.parse(fs.readFileSync(configPath, "utf8"))
    }

    const getDelay = () => {
      const now = Date.now()
      return 60000 - (now % 60000)
    }

    let getPlayerList = () => {
      let cache = cacApi.cache.get()
      let config = cacApi.config.get()
      let players = {}

      let servers = Object.entries(cache).filter(([name, server]) => {
        let configMatch = config.servers.find((s) => s.name == name)
        return configMatch?.enabled
      })

      servers.forEach(([name, server]) => {
        players[name] = server.players.map((player) => {
          if (player.data?.ign) {
            return `${player.data.ign} (${player.name}) [${player.data.tribeName}]: \`${player.steamId}\``
          }

          return `${player.name}: \`${player.steamId}\``
        })
      })

      return players
    }

    let createEmbeds = (players) => {
      let embeds = []

      let embed = new EmbedBuilder().setTitle("Live Player List").setTimestamp(new Date())

      let fieldCount = 0

      for (let server in players) {
        let value = players[server].join("\n") || "No players online"

        if (value.length > 1024) {
          value = value.slice(0, 1020) + "..."
        }

        if (fieldCount >= 25) {
          embeds.push(embed)

          embed = new EmbedBuilder().setTitle("Live Player List (Continued)").setTimestamp(new Date())

          fieldCount = 0
        }

        embed.addFields({
          name: server,
          value,
        })

        fieldCount++
      }

      embeds.push(embed)

      return embeds
    }

    const pluginConfig = loadPluginConfig()

    if (!pluginConfig.channel) {
      console.log(`[${this.name}] No channel configured.`)
      return
    }

    const client = cacApi.discord.getClient()

    let channel = client.channels.cache.get(pluginConfig.channel) || (await client.channels.fetch(pluginConfig.channel))

    if (!channel) {
      console.log(`[${this.name}] Channel not found.`)
      return
    }

    let messages = await channel.messages.fetch({ limit: 100 })
    await channel.bulkDelete(messages, true)

    let message = await channel.send({
      embeds: [new EmbedBuilder().setTitle("Live Player List").setDescription("Loading...")],
    })

    let refresh = async () => {
      try {
        let players = getPlayerList()
        let embed = createEmbeds(players)

        await message.edit({ embeds: [...embed] })
      } catch (err) {
        console.log(`[${this.name}] Refresh failed:`, err)
      }
    }

    let refreshLoop = async () => {
      refresh()
      poller = setTimeout(refreshLoop, getDelay())
    }

    await refresh()

    poller = setTimeout(refreshLoop, getDelay())

    onPacket = async function (packet) {
      if (!["join", "leave"].includes(packet.type)) return

      setTimeout(() => {
        refresh()
      }, 1000)
    }

    cacApi.events.on("packet", onPacket)
  },
}
