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
`ollama pull llama3 && ollama pull nomic-embed-text`

Then, clone/download this repository

Run `npm install`

Install the minecraft version specified in `settings.json`, currently supports up to 1.20.4

## Running Locally

Start a minecraft world and open it to LAN on localhost port `55916`

Run `node main.js`

You can configure the agent's name, model, and prompts in their profile like `andy.json`.

You can configure project details in `settings.json`.

## Bot Profiles

Bot profiles are json files (such as `andy.json`) that define a bot's behavior in three ways:

1. Bot backend LLMs to use for chat and embeddings.
2. Prompts used to influence the bot's behavior.
3. Examples retrieved and provided to the bot to help it better perform tasks.

### Model Specifications

LLM backends can be specified as simply as `"model": "gpt-3.5-turbo"`. However, for both the chat model and the embedding model, the bot profile can specify the below attributes:

```
"model": {
  "api": "openai",
  "url": "https://api.openai.com/v1/",
  "model": "gpt-3.5-turbo"
},
"embedding": {
  "api": "openai",
  "url": "https://api.openai.com/v1/",
  "model": "text-embedding-ada-002"
}
```

The model parameter accepts either a string or object. If a string, it should specify the model to be used. The api and url will be assumed. If an object, the api field must be specified. Each api has a default model and url, so those fields are optional.

If the embedding field is not specified, then it will use the default embedding method for the chat model's api (Note that anthropic has no embedding model). The embedding parameter can also be a string or object. If a string, it should specify the embedding api and the default model and url will be used. If a valid embedding is not specified and cannot be assumed, then word overlap will be used to retrieve examples instead.

Thus, all the below specifications are equivalent to the above example:

```
"model": "gpt-3.5-turbo"
```
```
"model": {
  "api": "openai"
}
```
```
"model": "gpt-3.5-turbo",
"embedding": "openai"
```

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
