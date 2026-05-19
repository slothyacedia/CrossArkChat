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
    isAdmin(),
    handlePacket(),
    modMan(),
    modules: {
      gamedig,
      djs,
      dotenv,
      rcon,
      fs,
      path,
      child_process,
      events,
    },
  },

  config: {
    get(),
    load(),
    write(),
  },

  cache: {
    get(),
    write(),
  },

  events: {
    on: (event, handler) => emitter.on(event, handler),
    off: (event, handler) => emitter.off(event, handler),
  },

  ark: {
    getAgents(),

    server: {
      sendChat: (name, message) => arkAgents.find((agent) => agent.name === name)?.send(message),
      sendCommand: (name, command) => arkAgents.find((agent) => agent.name === name)?.sendCommand(command),
    },

    servers: {
      sendChat: (message) => arkAgents.forEach((agent) => agent.send(message)),
      sendCommand: (command) => arkAgents.forEach((agent) => agent.sendCommand(command)),
    },
  },

  discord: {
    getClient(),
    send: (channelId, message) => client?.channels.cache.get(channelId)?.send(message),

    commands: {
      text: {
        register(),
        unregister(),
      },

      slash: {
        register(),
        unregister(),
        getCommands(),
        implement(),
      },
    },
  },

  plugins: {
    load(),
    loadAll(),
    loaded: () => loadedPlugins,
    reload(),
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

### `modules`

Allows access of baseline modules such as `fs`, `path`, `rcon-client`, `discord.js`, etc.

Usage:

```js
let djs = cacApi.utils.modules.djs
const { EmbedBuilder } = djs
let embed = new EmbedBuilder()
```

Returns: `Module`

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

### `get()`

Returns the current mutable cache that is stored in RAM

Usage:

```js
let cache = cacApi.cache.get()
let cacheKey = server.name
cache[cacheKey].messages.push("hello world!")
```

Returns: `Object`

---

### `write()`

Writes to the current cache but most likely isn't needed due to `get()` returning a live mutable object

> [!WARNING]
> This can totally destroy your cache and crash CrossArkChat

Usage:

```js
cacApi.cache.write(cache)
```

Returns: `null`

---

## Events

### `on(<event>, <handler>)`

Allows you to hook into CrossArkChat's emitted events to act on them

Usage:

```js
cacApi.events.on("packet" (packet)=>{
  console.log(JSON.stringify(packet, null, 2))
})
```

Returns: `EventData`

---

### `off(<event>, <handler>)`

Allows you to unhook from CrossArkChat's emitted events if acting on them

Usage:

```js
cacApi.events.off("packet" (packet)=>{
  console.log(JSON.stringify(packet, null, 2))
})
```

Returns: `null`

---

## ARK

### `getAgents()`

Returns all ARK RCON agents which exposes extra APIs on top

Usage:

```js
let arkAgents = cacApi.ark.getAgents()
arkAgent.forEach((agent) => agent.send("hello world"))
```

Returns: `Array`

### `server`

Exposes 2 sub-apis `sendChat(<name>, <message>)` and `sendCommand(<name>, <message>)` which allows chats to be sent and RCON commands to be executed

Usage:

```js
// The name is the name that is defined for each server in servers in config.js
cacApi.ark.server.sendChat("Island", "hello world")
cacApi.ark.server.sendCommand("Island", "saveworld")
```

Returns: `String`

---

### `servers`

Exposes 2 sub-APIs `sendChat(<message>)` and `sendCommand(<message>)` which allows chats to be sent and RCON commands to be executed

Usage:

```js
// Sends it to all enabled servers
cacApi.ark.servers.sendChat("hello world")
cacApi.ark.servers.sendCommand("saveworld")
```

Returns: `String`

---

## Discord

### `getClient()`

Returns the client object

Usage:

```js
let client = cacApi.discord.getClient()
client.user.setPresence({
  status: "online",
  activities: [
    {
      name: "CrossArkChat.JS",
      type: 0,
    },
  ],
})
```

Returns: `clientObject`

---

### `send(<channelId>, <message>)`

Sends a message to the channel id provided

Usage:

```js
cacApi.discord.send(channelId, "hello world")
```

Returns: `null`

---

### Text Commands

Exposes 2 sub-APIs:<br>

- `register(<names>, <handler>)`
- `unregister(<names>)`

Usage:

```js
let textCmd = cacApi.discord.commands.text
textCmd.register(["cmd", "cmd2"], async (message, cmd, args) => {
  /*
  message => message object
  cmd => command used
  args => list of arguments
  */
  message.reply("hello world")
  console.log(cmd)
  console.log(args.join(", "))
})

// Removes cmd2 from the command pool
textCmd.unregister(["cmd2"])
```

Returns: `null`

---

### Slash Commands

Exposes 4 sub-APIs:<br>

- `register(<name>, <commandData>, <handler>)`
- `unregister(<names>)`
- `getCommands()`
- `implement()`

Usage:

```js
let slashCmd = cacApi.discord.commands.slash
let { SlashCommandBuilder } = require("discord.js")
slashCmd.register("cmd", new SlashCommandBuilder().setName("cmd"), async (interaction, cmd, args) => {
  /*
  interaction => interaction object
  cmd => command used
  args => json object for parameters
  */
  interaction.reply("hello world")
  console.log(cmd)
  console.log(args.join(", "))
})

// Removes cmd from the command pool
slashCmd.unregister("cmd")

slashCommandDatas = slashCmd.getCommands()
slashCmd.implement() // Register them to discord to make them usable
```

Returns: `null`

---

## Plugins

### `load(<filePath>)`

Loads a plugin from the file path given

Usage:

```js
const path = require("node:path")
const fs = require("node:fs")

let filePath = path.join(process.cwd(), "plugins", pluginName)
cacApi.plugins.load(filePath)
```

Returns: `null`

---

### `loadAll()`

Loads all plugins in the `plugins` folder

Usage:

```js
cacApi.plugins.loadAll()
```

Returns: `null`

---

### `loaded()`

Returns a list of loaded plugins

Usage:

```js
let plugins = cacApi.plugins.loaded()
console.log(plugins)
```

Returns: `Map`

---

### `reload(<name>)`

Reloads a plugin by the plugin name

Usage:

```js
cacApi.plugins.reload("CrossArkChat")
// Reloads the base CrossArkChat plugin, which supplies 3 base commands
```

Returns: `null`

---

> [!NOTE]
> This documentation is still WIP
