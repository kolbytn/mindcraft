# Mindcraft 🧠⛏️

Crafting minds for Minecraft with Language Models and Mineflayer!

#### ‼️Warning‼️

This project allows an AI model to write/execute code on your computer that may be insecure, dangerous, and vulnerable to injection attacks on public servers. Code writing is disabled by default, you can enable it by setting `allow_insecure_coding` to `true` in `settings.json`. Enable only on local or private servers, **never** on public servers. Ye be warned.

## Requirements

- [OpenAI API Subscription](https://openai.com/blog/openai-api), [Gemini API Subscription](https://aistudio.google.com/app/apikey), [Anthropic API Subscription](https://docs.anthropic.com/claude/docs/getting-access-to-claude), or [Ollama Installed](https://ollama.com/download)
- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc)
- [Node.js](https://nodejs.org/) (at least v14)

## Installation

Add one of these environment variables:
  - `OPENAI_API_KEY` (and optionally `OPENAI_ORG_ID`)
  - `GEMINI_API_KEY`
  - `ANTHROPIC_API_KEY` (and optionally `OPENAI_API_KEY` for embeddings. not necessary, but without embeddings performance will suffer)

⭐[How do I add the API key as an environment variable?](https://phoenixnap.com/kb/windows-set-environment-variable)⭐

If you use Ollama, to install the models used by default (generation and embedding), execute the following terminal command:
`ollama pull phi3 && ollama pull nomic-embed-text`

Then, clone/download this repository

Run `npm install`

Install the minecraft version specified in `settings.json`, currently supports up to 1.20.4

## Running Locally

Start a minecraft world and open it to LAN on localhost port `55916`

Run `node main.js`

You can configure the agent's name, model, and prompts in their profile like `andy.json`.

You can configure project details in `settings.json`. 


## Online Servers
To connect to online servers your bot will need an official Microsoft/Minecraft account. You can use your own personal one, but will need another account if you want to connect with it. Here is an example settings for this:
```
{
    "minecraft_version": "1.20.4",
    "host": "111.222.333.444",
    "port": 55920,
    "auth": "microsoft",
    "allow_insecure_coding": false
}
```
‼️Make sure your bot's name in the profile.json matches the account name! Otherwise the bot will spam talk to itself.

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`
