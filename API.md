# CrossArkChat API (`cacApi`)

The `cacApi` object is passed to every plugin and exposes internal utilities for interacting with CrossArkChat at runtime.

It provides access to:

- Permissions (admin checks)
- Config loading and mutation
- Cache access and mutation
- Plugin and command management
- Event system
- ARK server and Discord communication
- Dynamic module installation

---

## Overview

```js
{
  utils: {
    isAdmin,
    handlePacket,
    modMan,
  },

  config: {
    get: () => config,
    load: loadConfig,
    write: (newConfig) => {
      Object.keys(config).forEach((key) => delete config[key])
      Object.assign(config, newConfig)
    },
  },

  cache: {
    get: () => cache,
    write: (newCache) => {
      Object.keys(cache).forEach((key) => delete cache[key])
      Object.assign(cache, newCache)
    },
  },

  events: {
    on: (event, handler) => emitter.on(event, handler),
    off: (event, handler) => emitter.off(event, handler),
  },

  ark: {
    getAgents: () => arkAgents,

    message: {
      toServers: (message) => arkAgents.forEach((agent) => agent.send(message)),
      toServer: (name, message) => arkAgents.find((agent) => agent.name === name)?.send(message),
    },

    command: {
      toServers: (command) => arkAgents.forEach((agent) => agent.sendCommand(command)),
      toServer: (name, command) => arkAgents.find((agent) => agent.name === name)?.sendCommand(command),
    },
  },

  discord: {
    getClient: () => client,
    send: (channelId, message) => client?.channels.cache.get(channelId)?.send(message),

    commands: {
      register: registerCommand,
      unregister: (names) => {
        if (Array.isArray(names)) {
          names.forEach((n) => {
            if (discordCommands.has(n.toLowerCase())) {
              discordCommands.delete(n.toLowerCase())
            }
          })
        } else {
          discordCommands.delete(names.toLowerCase())
        }
      },
    },
  },

  plugins: {
    load: loadPlugin,
    loadAll: loadPlugins,
    loaded: () => loadedPlugins,
    reload: async (name) => {
      const filePath = loadedPlugins.get(name)
      if (!filePath) throw new Error(`Plugin "${name}" not found`)
      await loadPlugin(filePath)
    },
  },
}
```

---

## Utils

### `isAdmin(<userId>)`

Returns if a user id from Discord is a admin

Usage:

```js
let isAdmin = await cacApi.utils.isAdmin(message.author.id /* the user id of the person who used the command*/)
if (isAdmin) {
  console.log("User Is Admin")
} else {
  console.log("User Is NOT Admin")
}
```

Returns: `<Bool>`
true => User is an admin
false => User is not an admin

---

### `handlePacket(<packet>)`

Packet handler that helps to send messages to appropriate channels

Usage:

```js
cacApi.utils.handlePacket({
  id: `packetId`,
  origin: "plugin", // Packet's origin, if it matches a server's name or is "discord", it will not send to that interface
  type: "chat", // This is the packet's type, only accepts "chat", "join", "leave", "tribeLogs", "leftovers", this routes where the packet will go
  server: server.name, // Packet's origin, if it matches a server's name or is "discord", it will not send to that interface (not used)
  player: player.name, // The player that you want to pose as
  text: "forced-offline", // The text you wanna send
  source: "forced-offline", // The source, internally used as where a packet is derived from
  metadata: {}, // Any other metadata
})
```

Returns: `null`

---

### `modMan`

Module manager, this allows you to install external modules for your plugins

Usage:

```js
let dotenv = cacApi.utils.modMan.require("dotenv")
```

Returns: `require()`

---

## Config

### `get()`

Returns the current config of the entire system

Usage:

```js
let config = cacApi.config.get()
let discordPrefix = config.discord.prefix
```

Returns: `Object`

---

### `load()`

Loads the config from the config file

Usage:

```js
let newConfig = cacApi.config.load()
cacApi.config.write(newConfig)
```

Returns: `Object`

---

### `write(<newConfig>)`

Replaces the current in process config with the new config given

Usage:

```js
let newConfig = cacApi.config.load()
cacApi.config.write(newConfig)
```

Returns: `null`

---

## Cache

> [!NOTE]
> This documentation is still WIP
