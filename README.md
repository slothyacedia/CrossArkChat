# CrossArkChat.js

A JavaScript reimplementation of SpikeyDragoon’s Cross-Ark-Chat for ARK clusters, with support for cross-server chat, tribe log forwarding, Discord integration, hot-reloadable configs, and plugin loading

## Features

- Cross-server global chat for clustered ARK servers
- Discord chat relay support
- Tribe log forwarding
- Hot config reloading (`reload`)
- Full process restart command (`restart`)
- Optional automatic plugin loading
- Open source and fully customizable
- Lightweight and responsive

## Compatibility

### Networking

Full support for clusters hosted on the same machine

> [!NOTE]
> Multi-machine/network clusters should work in theory, but have not been extensively tested

> [!NOTE]
> If attempting multi-machine/network cross chat, adjust the `pollInterval` setting to a higher value

### ARK: Survival Ascended

This may also work with **ARK: Survival Ascended** and could potentially allow cross chat between **ASE** and **ASA**

> [!NOTE]
> This depends on Wildcard not changing RCON response formats

---

# Getting Started

## 1. Download the Repository

Download the latest version:

https://github.com/slothyacedia/CrossArkChat/archive/refs/heads/main.zip

Extract the archive and open the `CrossArkChat` folder.

---

## 2. Configure

Edit:

```text
config.js
```

Edit your:

- Server details
- RCON settings
- Formatting
- Text replacements
- Discord bot settings

If you're unsure how to configure it, see:

https://github.com/slothyacedia/CrossArkChat/blob/main/CrossArkChat/config_explained.js

---

## 3. Start CrossArkChat

### Windows double-click

Double-click:

```bat
CrossArkChat.bat
```

The launcher will:

- Install Node.js and git (if missing)
- Install required modules:
  - `gamedig`
  - `rcon-client`
  - `dotenv`
  - `discord.js`

### Manual start using a terminal

If launching for the first time, open a terminal in the folder and do:

```text
npm install
```

To start `CrossArkChat.js`, open a terminal in the folder and do:

```text
node CrossArkChat.js
```

---

## 4. Verify Connection

If `essentialPlugins` is configured, you may see messages such as on the server console:

```text
Plugin <pluginName> was already loaded!
```

If not, send a chat message in-game and verify it appears on other servers

---

# Commands

`CrossArkChat.js` comes with 2 commands on the discord bot

Default prefix:

```text
cac.
```

## Reload Config

```text
cac.reload (aliases: cac.rc, cac.reloadconfig)
```

Reloads configuration without restarting the program.

---

## Restart

```text
cac.restart
```

Restarts the entire CrossArkChat process.

---

# CrossArkChat.js vs Cross-Ark-Chat

| Feature              | CrossArkChat.js | Cross-Ark-Chat |
| -------------------- | --------------- | -------------- |
| Cross Server Chat    | Yes             | Yes            |
| Discord Relay        | Yes             | Yes            |
| Tribe Logs           | Yes             | Yes            |
| Hot Reload           | Yes             | No             |
| Open Source          | Yes             | No             |
| Easier Config        | Yes             | No             |
| More Flexible Config | No              | Yes            |

---

# Support the Project

If you like the stuff I make and want to support development:

<a href="https://ko-fi.com/slothyacedia">
  <img src="https://github.com/slothyace/slothyace/blob/main/icons/kofi.png" width="240" height="48">
</a>

---
