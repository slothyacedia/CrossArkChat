const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let poller = null

module.exports = {
  name: "Live Player List",
  version: "v1.0.1",

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

    let createEmbed = (players) => {
      let embed = new EmbedBuilder().setTitle("Live Player List").setTimestamp(new Date())

      for (let server in players) {
        embed.addFields({
          name: server,
          value: players[server].join("\n") || "No players online",
        })
      }

      return embed
    }

    const pluginConfig = loadPluginConfig()

    if (!pluginConfig.channel) {
      console.warn(`[${this.name}] No channel configured.`)
      return
    }

    const client = cacApi.discord.getClient()

    let channel = client.channels.cache.get(pluginConfig.channel) || (await client.channels.fetch(pluginConfig.channel))

    if (!channel) {
      console.warn(`[${this.name}] Channel not found.`)
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
        let embed = createEmbed(players)

        await message.edit({ embeds: [embed] })
      } catch (err) {
        console.error(`[${this.name}] Refresh failed:`, err)
      }

      poller = setTimeout(refresh, getDelay())
    }

    await refresh()

    poller = setTimeout(refresh, getDelay())

    onPacket = async function (packet) {
      if (!["join", "leave"].includes(packet.type)) return

      setTimeout(() => {
        refresh()
      }, 1000)
    }

    cacApi.events.on("packet", onPacket)
  },
}
