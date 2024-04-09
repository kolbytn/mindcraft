# Mindcraft 🧠⛏️

Crafting minds for Minecraft with Language Models and Mineflayer!

#### ‼️Warning‼️

This project allows an AI model to write/execute code on your computer that may be insecure, dangerous, and vulnerable to injection attacks on public servers. Code writing is disabled by default, you can enable it by setting `allow_insecure_coding` to `true` in `settings.json`. Enable only on local or private servers, **never** on public servers. Ye be warned.

## Requirements

- [OpenAI API Subscription](https://openai.com/blog/openai-api), [Gemini API Subscription](https://aistudio.google.com/app/apikey), or [Anthropic API Subscription](https://docs.anthropic.com/claude/docs/getting-access-to-claude) (if planning on using paid model, recommended)
- [Text Generation Web UI](https://github.com/oobabooga/text-generation-webui) (if planning on using local model)
- [Minecraft Java Edition](https://www.minecraft.net/en-us/store/minecraft-java-bedrock-edition-pc)
- [Node.js](https://nodejs.org/) (at least v14)

## Installation

If using paid api, add one of these environment variables:
  - `OPENAI_API_KEY` (and optionally `OPENAI_ORG_ID`)
  - `GEMINI_API_KEY`
  - `ANTHROPIC_API_KEY` (and optionally `OPENAI_API_KEY` for embeddings. not necessary, but without embeddings performance will suffer)

If using local llm, add both of these environment variables:
  - `OPENAI_API_KEY=sk-111111111111111111111111111111111111111111111111`
  - `OPENAI_API_BASE=http://127.0.0.1:5000/v1`

Clone/Download this repository

Run `npm install`

Install the minecraft version specified in `settings.json`, currently supports up to 1.20.2

## Run

Start a minecraft world and open it to LAN on localhost port `55916`

If running local model, prepare text-generation-webui (see below)

Run `node main.js`

You can configure the agent's name, model, and prompts in their profile like `andy.json`.


You can configure project details in `settings.json`. Here is an example settings for connecting to a non-local server:
```
{
    "minecraft_version": "1.20.1",
    "host": "111.222.333.444",
    "port": 55920,
    "auth": "microsoft",
    "allow_insecure_coding": false
}
```

## Text Generation Web UI

Install the webui according to the [given instructions](https://github.com/oobabooga/text-generation-webui)

Add `--api` to the command line flags (CMD_FLAGS.txt)

Run correct start file for your machine

In the terminal, wait for the message `Running on local URL:  http://127.0.0.1:7860`

Visit the webui at http://127.0.0.1:7860 and switch to the `Model` tab

To obtain the model, see the `Download model or LoRA` section to download an LLM model

In the top right, select your model from the drop down menu, then click load

Wait for a confirmation message in the lower right, `Successfully loaded {model name}.`

If running for the first time or having issues:
  - See `Session` tab and check the openai extension
  - Install sentence-transformers with `pip install -U sentence-transformers` or by editing extensions/openai/embeddings.py to include
  ```
  import subprocess
  subprocess.check_call([sys.executable, "-m", "pip", "install", "-U", "sentence-transformers"])
  ```
  - Restart the webui

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`
