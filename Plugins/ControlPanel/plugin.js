const fs = require("node:fs")
const path = require("node:path")

let interactionHandler = null
let packetHandler = null
let ssuPacketHandler = null
let ssuPacketHandling = null
let ssuPacketQueue = new Set()

module.exports = {
  name: "Control Panel",
  version: "v1.2.1",

  async teardown(cacApi) {
    const client = cacApi.discord.getClient()

    if (interactionHandler) {
      client.off("interactionCreate", interactionHandler)
      interactionHandler = null
    }

    if (packetHandler) {
      cacApi.events.off("packet", packetHandler)
      packetHandler = null
    }

    if (ssuPacketHandler) {
      cacApi.events.off("serverStatusUpdate", ssuPacketHandler)
      ssuPacketHandler = null
    }

    if (ssuPacketHandling) {
      clearTimeout(ssuPacketHandling)
      ssuPacketHandling = null
    }
    ssuPacketQueue.clear()
  },

  async setup(cacApi) {
    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
      ModalBuilder,
      StringSelectMenuBuilder,
      TextInputBuilder,
      TextInputStyle,
      MessageFlags,
      ContainerBuilder,
      LabelBuilder,
      CheckboxBuilder,
    } = cacApi.utils.modules.djs
    const childProc = cacApi.utils.modules.child_process

    const pluginDir = __dirname
    const configPath = path.join(pluginDir, "config.json")
    const panelsPath = path.join(pluginDir, "panels.json")

    let cacConfig = cacApi.config.get()
    let enabledServers = cacConfig.servers.filter((server) => server.enabled)
    if (!enabledServers.every((server) => server.data?.cluster && server.data?.controlPanel)) {
      let defaultServerData = {
        data: {
          cluster: "Sinfuls RXP",
          controlPanel: {
            startScript: "",
            stopScript: "",
            restartScript: "",
            stopCommand: "doExit",
          },
        },
      }

      console.log(`[Plugin: ${this.name}] Not All Enabled Servers Are Configured As Required...`)
      console.log(`[Plugin: ${this.name}] Add ${JSON.stringify(defaultServerData, null)} To Each Server Config`)
      return
    }

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            channel: "",
            cluster: true,
          },
          null,
          2,
        ),
      )
    }

    let loadConfig = () => JSON.parse(fs.readFileSync(configPath))

    let loadPanelCache = () => {
      let defaultPanelCache = { createdAt: "", messages: {} }
      if (!fs.existsSync(panelsPath)) return defaultPanelCache
      try {
        return JSON.parse(fs.readFileSync(panelsPath))
      } catch {
        return defaultPanelCache
      }
    }

    let savePanelCache = (cache) => {
      fs.writeFileSync(panelsPath, JSON.stringify(cache, null, 2))
    }

    let isServerOnline = (serverName) => {
      let cache = cacApi.cache.get()
      return cache[serverName]?.online || false
    }

    let getServer = (serverName) => enabledServers.find((server) => server.name === serverName)

    let getClusters = () => [...new Set(enabledServers.map((server) => server.data.cluster).filter(Boolean))]

    let getClusterServers = (clusterName) => enabledServers.filter((server) => server.data.cluster === clusterName)

    let getFormattedPlayerList = (serverName) => {
      let cache = cacApi.cache.get()
      let players = cache[serverName]?.players || []

      if (players.length > 0) {
        return players
          .map((player) => {
            if (player.data?.ign) {
              return `${player.data.ign} (${player.name}) [${player.data.tribeName}]: \`${player.steamId}\``
            }
            return `${player.name}: \`${player.steamId}\``
          })
          .join("\n")
      }
      return "No Players Online"
    }

    let getClusterPlayers = (clusterName) => {
      let cache = cacApi.cache.get()
      let players = []
      Object.entries(cache).forEach(([name, serverCache]) => {
        if (serverCache?.cluster === clusterName && Array.isArray(serverCache.players)) {
          players.push(
            ...serverCache.players.map((player) => ({
              server: name,
              ...player,
            })),
          )
        }
      })
      return players
    }

    let getServerPlayers = (serverName) => {
      let cache = cacApi.cache.get()
      return (
        cache[serverName]?.players?.map((player) => ({
          server: serverName,
          ...player,
        })) || []
      )
    }

    let createServerEmbed = (serverName) => {
      let server = getServer(serverName)
      let isOnline = isServerOnline(serverName)
      let updateTimestampFormatted = `<t:${Math.floor(Date.now() / 1000)}>`

      return new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(`## ${isOnline ? "🟢" : "🔴"} ${server.data.cluster} - ${server.name}\n-# Updated: ${updateTimestampFormatted}`),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(isOnline ? getFormattedPlayerList(serverName) : "The server is currently offline."))
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;rcon;server;${server.name}`).setLabel("Send Command").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;kick;server;${server.name}`).setLabel("Kick Player").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`controlPanel;ban;server;${server.name}`).setLabel("Ban Player").setStyle(ButtonStyle.Danger),
          ),
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;start;server;${server.name}`).setLabel("Start").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;stop;server;${server.name}`).setLabel("Stop").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;restart;server;${server.name}`).setLabel("Restart").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;commandStop;server;${server.name}`).setLabel("Send Stop Command").setStyle(ButtonStyle.Secondary),
          ),
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;refresh;server;${server.name}`).setLabel("Refresh Panel").setStyle(ButtonStyle.Success),
          ),
        )
    }

    let createClusterEmbed = (clusterName) => {
      let cache = cacApi.cache.get()
      let totalPlayers = getClusterPlayers(clusterName).length
      let clusterServers = getClusterServers(clusterName)
      let onlineServers = clusterServers.filter((server) => cache[server.name]?.online)
      let updateTimestampFormatted = `<t:${Math.floor(Date.now() / 1000)}>`

      return new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`## ${clusterName} - Cluster Control\n-# Updated: ${updateTimestampFormatted}`))
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(`Total Players: **${totalPlayers}**\nOnline Servers: **${onlineServers.length}**/**${clusterServers.length}**`),
        )
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;rcon;cluster;${clusterName}`).setLabel("Send Command").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;kick;cluster;${clusterName}`).setLabel("Kick Player").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`controlPanel;ban;cluster;${clusterName}`).setLabel("Ban Player").setStyle(ButtonStyle.Danger),
          ),
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;start;cluster;${clusterName}`).setLabel("Start").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;stop;cluster;${clusterName}`).setLabel("Stop").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;restart;cluster;${clusterName}`).setLabel("Restart").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;commandStop;cluster;${clusterName}`).setLabel("Send Stop Command").setStyle(ButtonStyle.Secondary),
          ),
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;refresh;cluster;${clusterName}`).setLabel("Refresh Panels").setStyle(ButtonStyle.Success),
          ),
        )
    }

    let createRconModal = (scope, target) => {
      return new ModalBuilder()
        .setCustomId(`controlPanel;rconModal;${scope};${target}`)
        .setTitle("Send RCON Command")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("command").setLabel("RCON Command").setPlaceholder("saveworld").setStyle(TextInputStyle.Short).setRequired(true),
          ),
        )
    }

    let createConfirmationModal = (action, scope, target) => {
      let actionFormatted = action === "commandStop" ? "Stop Command" : String(action).charAt(0).toUpperCase() + action.slice(1).toLowerCase()

      return new ModalBuilder()
        .setCustomId(`controlPanel;confirmAction;${action};${scope};${target}`)
        .setTitle(`Confirm: ${actionFormatted}`)
        .addLabelComponents(
          new LabelBuilder().setLabel(`Confirm ${target}`).setCheckboxComponent(new CheckboxBuilder().setCustomId("confirmInput").setDefault(false)),
        )
    }

    let createPlayerActionModal = (action, scope, target) => {
      let players = scope === "cluster" ? getClusterPlayers(target) : getServerPlayers(target)

      const modal = new ModalBuilder()
        .setCustomId(`controlPanel;playerAction;${action};${scope};${target}`)
        .setTitle(`${action === "kick" ? "Kick" : "Ban"} Player`)

      if (players.length) {
        modal.addLabelComponents(
          new LabelBuilder().setLabel("Player").setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("player")
              .setPlaceholder("Select a player")
              .addOptions(
                players.slice(0, 25).map((player) => {
                  let label = player.data?.ign
                    ? `${player.data.ign} (${player.name}) [${player.data.tribeName}]: ${player.steamId}`
                    : `${player.name}: ${player.steamId}`

                  if (scope === "cluster") {
                    label = `${player.server} - ${label}`
                  }
                  return { label: label.slice(0, 100), value: String(player.steamId) }
                }),
              ),
          ),
        )
      } else {
        modal.addLabelComponents(
          new LabelBuilder()
            .setLabel("Steam ID")
            .setTextInputComponent(
              new TextInputBuilder().setCustomId("player").setPlaceholder("Enter the player's Steam ID").setStyle(TextInputStyle.Short).setRequired(true),
            ),
        )
      }

      return modal
    }

    let sendRcon = async (serverName, command) => {
      try {
        let response = await cacApi.ark.server.sendCommand(serverName, command)
        return { success: true, response }
      } catch (error) {
        return { success: false, error }
      }
    }

    let sendClusterRcon = async (clusterName, command) => {
      let results = []
      for (const server of getClusterServers(clusterName)) {
        results.push({
          server: server.name,
          ...(await sendRcon(server.name, command)),
        })
      }
      return results
    }

    let runScript = (command) => {
      return new Promise((resolve, reject) => {
        childProc.exec(command, (error, stdout, stderr) => {
          if (error) return reject(error)
          resolve({ stdout, stderr })
        })
      })
    }

    async function refreshPanels(panelMessages, specTarget) {
      let cache = cacApi.cache.get()
      const targets = specTarget ? (Array.isArray(specTarget) ? [...specTarget] : [specTarget]) : null

      if (targets) {
        for (let target of targets) {
          if (cache[target]?.cluster) {
            let clusterId = `cluster:${cache[target].cluster}`
            if (!targets.includes(clusterId)) {
              targets.push(clusterId)
            }
          }
        }
      }

      for (const [key, message] of Object.entries(panelMessages)) {
        if (targets && !targets.includes(key)) continue

        try {
          const container = key.startsWith("cluster:") ? createClusterEmbed(key.replace("cluster:", "")) : createServerEmbed(key)
          await message.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          })
        } catch {}
      }
    }

    let pluginConfig = loadConfig()
    if (!pluginConfig.channel) {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] No Control Panel Channel Configured`)
      }
      return
    }

    const client = cacApi.discord.getClient()
    const controlPanelChannel = client.channels.cache.get(pluginConfig.channel) || (await client.channels.fetch(pluginConfig.channel))

    if (!controlPanelChannel) {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Channel With Id ${pluginConfig.channel} Not Found`)
      }
      return
    }

    let panelCache = loadPanelCache()
    let panelMessages = {}

    let initPanels = async () => {
      let todayString = new Date().toLocaleDateString()
      let createdAtString = new Date(panelCache.createdAt).toLocaleDateString()

      if (createdAtString !== todayString) {
        const deletePromises = Object.values(panelCache.messages || {}).map(async (messageId) => {
          try {
            const message = controlPanelChannel.messages.cache.get(messageId) || (await controlPanelChannel.messages.fetch(messageId))
            await message.delete()
          } catch {}
        })
        await Promise.all(deletePromises)

        panelCache = { createdAt: Date.now(), messages: {} }
      }

      const serverPromises = enabledServers.map(async (server) => {
        const messageId = panelCache.messages[server.name]
        let message = null

        if (messageId) {
          try {
            message = controlPanelChannel.messages.cache.get(messageId) || (await controlPanelChannel.messages.fetch(messageId))
          } catch {}
        }

        if (!message) {
          message = await controlPanelChannel.send({
            components: [createServerEmbed(server.name)],
            flags: MessageFlags.IsComponentsV2,
          })
          panelCache.messages[server.name] = message.id
        }

        return { key: server.name, message }
      })

      let clusterPromises = []
      if (pluginConfig.cluster) {
        clusterPromises = getClusters().map(async (clusterName) => {
          const clusterKey = `cluster:${clusterName}`
          const messageId = panelCache.messages[clusterKey]
          let message = null

          if (messageId) {
            try {
              message = controlPanelChannel.messages.cache.get(messageId) || (await controlPanelChannel.messages.fetch(messageId))
            } catch {}
          }

          if (!message) {
            message = await controlPanelChannel.send({
              components: [createClusterEmbed(clusterName)],
              flags: MessageFlags.IsComponentsV2,
            })
            panelCache.messages[clusterKey] = message.id
          }

          return { key: clusterKey, message }
        })
      }

      const results = await Promise.all([...serverPromises, ...clusterPromises])
      results.forEach(({ key, message }) => {
        panelMessages[key] = message
      })

      panelCache.createdAt = Date.now()
      savePanelCache(panelCache)

      await refreshPanels(panelMessages)

      if (cacConfig.logging.plugins) console.log(`[${this.name}] Panels Ready`)
    }

    interactionHandler = async (interaction) => {
      if (!interaction.customId || !interaction.customId.startsWith("controlPanel;")) return

      let idParts = interaction.customId.split(";")

      if (interaction.isButton()) {
        let [, action, scope, target] = idParts

        switch (action) {
          case "rcon": {
            return interaction.showModal(createRconModal(scope, target))
          }

          case "kick":
          case "ban": {
            return interaction.showModal(createPlayerActionModal(action, scope, target))
          }

          case "start":
          case "stop":
          case "restart":
          case "commandStop": {
            return interaction.showModal(createConfirmationModal(action, scope, target))
          }

          case "refresh": {
            await interaction.deferReply({ ephemeral: true })
            let servers = scope === "cluster" ? getClusterServers(target).map((server) => server.name) : [target]
            await interaction.editReply(`Refreshing Panel${scope === "cluster" ? "s" : ""}`)
            refreshPanels(panelMessages, servers)
            return
          }
        }
      } else if (interaction.isModalSubmit()) {
        switch (idParts[1]) {
          case "rconModal": {
            let [, , scope, target] = idParts
            let command = interaction.fields.getTextInputValue("command")
            await interaction.deferReply({ ephemeral: true })

            if (scope === "cluster") {
              let results = await sendClusterRcon(target, command)
              let output = results
                .map(
                  (result) =>
                    `**${result.server}**:\n\`\`\`${
                      result.success
                        ? (result.response || "No Response From Server")
                            .split("\n")
                            .filter((l) => l.trim())
                            .join("\n")
                        : result.error.message
                    }\`\`\``,
                )
                .join("\n")

              await interaction.editReply(`RCON Command (${command}) Sent To Cluster **${target}**:\n\n${output}`)
              return
            } else if (scope === "server") {
              let result = await sendRcon(target, command)
              let resultText = `\`\`\`${
                result.success
                  ? (result.response || "No Response From Server")
                      .split("\n")
                      .filter((l) => l.trim())
                      .join("\n")
                  : result.error.message
              }\`\`\``

              await interaction.editReply(`RCON Command (${command}) Sent To Server **${target}**:\n\n${resultText}`)
              return
            }
            break
          }

          case "playerAction": {
            let [, , action, scope, target] = idParts
            let selectValues = []

            try {
              selectValues = interaction.fields.getStringSelectValues("player")
            } catch {
              selectValues = []
            }

            let steamId = selectValues.length ? selectValues[0] : interaction.fields.getTextInputValue("player").trim()
            let label = `Steam Id **${steamId}**`

            await interaction.deferReply({ ephemeral: true })

            let actionFormatted = action === "kick" ? "Kicking" : "Banning"
            let command = `${action}Player ${steamId}`

            if (scope === "cluster") {
              const results = await sendClusterRcon(target, command)
              const output = results
                .map(
                  (result) =>
                    `**${result.server}**:\n\`\`\`${
                      result.success
                        ? (result.response || "No Response From Server")
                            .split("\n")
                            .filter((l) => l.trim())
                            .join("\n")
                        : result.error.message
                    }\`\`\``,
                )
                .join("\n")

              await interaction.editReply(`Attempted **${actionFormatted}** ${label} From The **${target}** Cluster\n\n${output}`)
              return
            } else if (scope === "server") {
              const result = await sendRcon(target, command)
              let resultText = `\`\`\`${
                result.success
                  ? (result.response || "No Response From Server")
                      .split("\n")
                      .filter((l) => l.trim())
                      .join("\n")
                  : result.error.message
              }\`\`\``

              await interaction.editReply(`Attempted **${actionFormatted}** ${label} From **${target}**\n\n${resultText}`)
              return
            }
            break
          }

          case "confirmAction": {
            let [, , action, scope, target] = idParts
            let isConfirmed = interaction.fields.getCheckbox("confirmInput")

            if (!isConfirmed) {
              await interaction.reply({ content: "❎ Action Cancelled, Check The Confirmation Box.", ephemeral: true })
              return
            }

            await interaction.deferReply({ ephemeral: true })

            let actionFormatted = action === "commandStop" ? "Stop Command" : String(action).charAt(0).toUpperCase() + action.slice(1).toLowerCase()
            let servers = scope === "cluster" ? getClusterServers(target).map((server) => server.name) : [target]
            let results = []

            if (["start", "stop", "restart"].includes(action)) {
              for (let serverName of servers) {
                try {
                  let scriptKey = `${action}Script`
                  let execCommand = enabledServers.find((server) => server.name === serverName)?.data?.controlPanel?.[scriptKey]

                  if (!execCommand) {
                    throw new Error(`No ${scriptKey} Configured For ${serverName}`)
                  }

                  await runScript(execCommand)
                  results.push(`✅ **${serverName}** ${actionFormatted} Success`)
                } catch (error) {
                  results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${error.message}`)
                }
              }
            } else if (action === "commandStop") {
              for (let serverName of servers) {
                try {
                  let serverConfig = getServer(serverName)
                  let stopCommand = serverConfig?.data?.controlPanel?.stopCommand
                  if (!stopCommand) {
                    throw new Error(`No Stop Command Configured For ${target}`)
                  }

                  let result = await sendRcon(serverName, stopCommand)
                  if (!result.success) {
                    throw result.error
                  }

                  results.push(`✅ **${serverName}** ${actionFormatted} Success`)
                } catch (error) {
                  results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${error.message}`)
                }
              }
            }

            await interaction.editReply(`Executed ${actionFormatted}:\n\n${results.join("\n")}`)
            return
          }
        }
      }
    }

    client.on("interactionCreate", interactionHandler)

    packetHandler = async (packet) => {
      if (["join", "leave"].includes(packet.type)) {
        setTimeout(() => refreshPanels(panelMessages, packet.server), 1000)
      }
    }

    let isProcessingSSU = false

    ssuPacketHandler = async (ssuPacket) => {
      if (ssuPacket?.server) {
        ssuPacketQueue.add(ssuPacket.server)
      }

      if (isProcessingSSU) {
        return
      }
      isProcessingSSU = true

      ssuPacketHandling = setTimeout(async () => {
        while (ssuPacketQueue.size > 0) {
          const batch = Array.from(ssuPacketQueue)
          ssuPacketQueue.clear()

          for (const server of batch) {
            await refreshPanels(panelMessages, server)
          }
        }

        isProcessingSSU = false
        ssuPacketHandling = null
      }, 1000)
    }

    cacApi.events.on("packet", packetHandler)
    cacApi.events.on("serverStatusUpdate", ssuPacketHandler)

    initPanels().catch((err) => {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Panel Init Error`, err)
      }
    })
  },
}
