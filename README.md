# Mindcraft

Crafting minds for Minecraft with ChatGPT and Mineflayer

#### ‼️Warning‼️

This project allows an AI model to write/execute code on your computer that may be insecure, dangerous, and vulnerable to injection attacks on public servers. Code writing is disabled by default, you can enable it by setting `allow_insecure_coding` to `true` in `settings.json`. Enable only on local or private servers, **never** on public servers. Ye be warned.

## Requirements

- [OpenAI API Subscription](https://openai.com/blog/openai-api)
- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc) (at most v1.20.2)
- [Node.js](https://nodejs.org/) (at least v14)

## Installation

Add `OPENAI_API_KEY` (and optionally `OPENAI_ORG_ID`) to your environment variables

Clone/Download this repository

Run `npm install`

## Run

Start a minecraft world and open it to LAN on localhost port `55916`

Run `node main.js`

You can configure details in `settings.json`. Here is an example settings for connecting to a non-local server:
```
{
    "minecraft_version": "1.20.1",
    "host": "111.222.333.444",
    "port": 55920,
    "auth": "microsoft",
    "allow_insecure_coding": false
}
```

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`