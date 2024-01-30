# Mindcraft

Crafting minds for Minecraft with AI!

### ‼️Warning‼️

This project allows an AI model to write/execute code on your computer that may be insecure, dangerous, and vulnerable to injection attacks by human players. This is disabled by default, you can enable it by setting `allow_insecure_coding` to `true` in `settings.json`. Use with caution.


**Do not** connect this bot to public servers, only run on local or private servers.

## Installation

Install Minecraft Java Edition <= 1.20.2

Install Node.js >= 14 from [nodejs.org](https://nodejs.org/)

Clone/Download this repository

Run `npm install`

Add `OPENAI_API_KEY` (and optionally `OPENAI_ORG_ID`) to your environment variables.

## Running

Start minecraft game and open it to LAN on localhost port `55916`

Run `node main.js`

You can configure the bot in `settings.json`. Here is an example settings for connecting to a non-local server:
```
{
    "host": "111.222.333.444",
    "port": 55920,
    "auth": "microsoft",
    "allow_insecure_coding": false
}
```

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`