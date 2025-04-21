# Mindcraft Generative Agents <img src="https://s2.loli.net/2025/04/18/RWaFJkY4gSDLViy.png" alt="Official Discord Server" width="36" height="36"> 

**Mindcraft Generative Agents** is an extension of the [Mindcraft](https://github.com/kolbytn/mindcraft) and integrates the core concepts of [Generative Agents](https://github.com/joonspk-research/generative_agents)—such as autonomous planning, self-reflection, self-driven behavior, and long-term goal pursuit—into an interactive Minecraft environment. Rather than introducing a separate memory system, the project leverages Mindcraft’s existing memory infrastructure, enhancing it with dynamic agent profiles, daily self-generated task lists, and reflective behaviors. Agents can interact, plan, and evolve over time based on their profile and experiences, enabling a lightweight yet powerful simulation of human-like behavior.

🦾 This project is currently in development. We are continuously adding and optimizing more functions. If you have any questions, you're welcome to join our Discord server for further discussions!

<a href="https://discord.gg/RKjspnTBmb" target="_blank"><img src="https://s2.loli.net/2025/04/18/CEjdFuZYA4pKsQD.png" alt="Official Discord Server" width="180" height="36"></a>

The **setup process** of Minecraft Generative Agents is the same as that of [Mindcraft](https://github.com/kolbytn/mindcraft). However, there are some significant features you should be aware of.

## Notable Features

- [Profile of Bots](#profile-of-bots)
- [Used mineflayer-pathfinder from MinePal](#used-mineflayer-pathfinder-from-minepal)
- [Support for Pollinations AI](#support-for-pollinations-ai)
- [Support for Doubao LLMs from ByteDance](#support-for-doubao-llms-from-bytedance)
- [Talk to All Bots with @all](#talk-to-all-bots-with-all)
- [Set Skin with Local Files](#set-skin-with-local-files)
- [Interaction in Natural Voice](#interaction-in-natural-voice)
- [Implementation of Generative Agents](#implementation-of-generative-agents)

### Profile of Bots

Since some models are supported by multiple API providers, the API inference function may sometimes produce unexpected results due to confusion. We highly recommend that you specify the service provider as the value of the "api" key in the bot's configuration, as shown in the following example:

```json
{
    "name": "Dusty", 
    "model": {
        "api": "openrouter", 
        "model": "openrouter/deepseek/deepseek-chat-v3-0324:free"
    }
}
```

### Used mineflayer-pathfinder from [MinePal](https://github.com/leo4life2/MinePal/tree/main)

During the development of this project, the pathfinder function from mineflayer-pathfinder had certain limitations regarding bots' interactions with doors and other tools. Therefore, we borrowed the version of mineflayer-pathfinder from [MinePal](https://github.com/leo4life2/MinePal/tree/main), as specified in the `package.json` file:

```
"mineflayer-pathfinder": "file:mineflayer-pathfinder",
```

<img src="https://s2.loli.net/2025/04/18/TjrGhlR6OYniHyQ.gif" alt="Bot open doors." width="800" height="450">

### Support for Pollinations AI 

We have added support for using text models from [Pollinations](https://pollinations.ai/). It is a open-sourced LLM API without requiring keys/token/accounts to get access!

You only need to specify the API as "pollinations" and select a model from the [model list](https://text.pollinations.ai/models):

```json
{
    "name": "Oppen", 
    "model": {
        "api": "pollinations", 
        "model": "openai-large"
    }
}
```

### Support for Doubao LLMs from ByteDance

We have added support for using [Doubao LLMs](https://www.volcengine.com/docs/82379/1099504). To use it, you need to provide your token as the value of the "DOUBAO_API_KEY" in the `key.json` file:

```json
{
    "DOUBAO_API_KEY": "[access token]"
}
```

Then, you must specify the API as "doubao" and select a model for which you have access rights:

```json
{
    "name": "Dobson", 
    "model": {
        "api": "doubao", 
        "model": "doubao-1-5-pro-32k-250115"
    }
}
```

🧛‍♀️ *You can also use Deepseek models through the "doubao" API.*

### Talk to All Bots with @all

In Mindcraft, when multiple bots are online, you have to use the "whisper" function to send a message to a specific bot. We have added a feature to simplify sending messages to all bots simultaneously. Just start your message with "@all", and all bots will receive it.

```
@all come here
```

### Set Skin with Local Files

We have expanded the skin feature of Mindcraft to enable bots to set their skins using local skin files. Simply specify the path to the skin file in the "skin" section of the bot's profile.

💼 **Note that the skin feature requires the [Fabric Tailor Mod](https://www.curseforge.com/minecraft/mc-mods/fabrictailor)**.

```json
{
    "name": "Dobson", 
    "skin": {
        "model": "classic",
        "file": "[path to the local stored minecraft skin file]"
    },
    "model": {
        "api": "doubao", 
        "model": "doubao-1-5-pro-32k-250115"
    }
}
```
<img src="https://s2.loli.net/2025/04/18/gb1UiLjJyMzEuh2.gif" alt="Change skins." width="800" height="450">

💡 With the [Fabric Tailor Mod](https://www.curseforge.com/minecraft/mc-mods/fabrictailor), a bot can change its skin using the chat command `/skin set upload [skin model] [path to skin file]`. This opens up the possibility of adding a "skin change" action that allows the bot to change its skin during gameplay. We may explore this feature in the future.

### Interaction in Natural Voice

#### Talk to The Bot

In Mindcraft, you can manage the bots through a page hosted at `localhost:8080` (by default). We have added a Speech-to-Text (STT) function to this page. By clicking the "Start Detecting" button, the front-end will request access to your microphone and continuously detect voice input. When voice is detected, it starts recording and stops when there is no voice for 3 seconds. You can also manually stop the recording and detection by clicking the "Stop Detecting" button.

The recorded voice is converted into text via the STT API. If the resulting text starts with the name of a specific bot, the text will be sent to that bot as a whisper message. Otherwise, an "@all" label will be automatically added, ensuring that the message is received by all bots.

🪪 **Currently, the STT function is only available with [ByteDance's STT API](https://www.volcengine.com/docs/6561/163043). Therefore, you need to apply for access rights on ByteDance's website, enable the STT service, obtain the appropriate app ID and access token, and fill them in the `key.json` file:**

```json
{
    "BYTEDANCE_APP_ID": "[app ID]",
    "BYTEDANCE_APP_TOKEN": "[access token]"
}
```

<img src="https://s2.loli.net/2025/04/18/FVON4CPf3DTSpQ8.gif" alt="Talk to bot." width="800" height="450">

#### Bot Speak

Mindcraft has a speak function that can be toggled on or off by changing the value of "speak" in the `settings.json` file. It uses the native text-to-speech (TTS) tools of your system. We have added an additional option to perform TTS via an API.

🪪 **Currently, the TTS via API function is only available with [ByteDance's TTS API](https://www.volcengine.com/docs/6561/79820). Therefore, you need to apply for access rights on ByteDance's website, enable the TTS service, obtain the appropriate app ID and access token, and fill them in the `key.json` file:**

```json
{
    "BYTEDANCE_APP_ID": "[app ID]",
    "BYTEDANCE_APP_TOKEN": "[access token]"
}
```

To use the TTS via API function, you need to set "speak" to `true` in the `settings.json` file and explicitly specify the "tts_voice_type" in the bot's profile. When using ByteDance's TTS service, only two voice types are available by default (others require additional purchase): `BV001_streaming` (female voice) and `BV002_streaming` (male voice). If "tts_voice_type" is not specified, the Mindcraft TTS process will be used instead.

```json
{
    "name": "Dobson", 
    "model": {
        "api": "doubao", 
        "model": "doubao-1-5-pro-32k-250115"
    },
    "tts_voice_type": "BV002_streaming"
}
```

Since our Minecraft Generative Agents project allows you to send messages to all bots at once, enabling TTS with multiple bots online may result in a large number of voices speaking simultaneously. To address this, we have added a parameter "speak_agents" to the `settings.json` file. When this parameter is set and a list of bot names is provided, only the bots in the list will speak.

```json
"speak": true, 
"speak_agents": ["Dobson"]
``` 

###  Implementation of Generative Agents 

🧠 We introduce a new module, `SelfDrivenThinking`, implemented in `src/agent/thinking.js`, to enable generative agents to exhibit autonomous behavior cycles inspired by human-like reflection and planning.

This module periodically prompts the agent to engage in self-initiated thought processes, including short-term goal creation and motivation-driven reflection, even when not actively receiving external input.

To activate this feature, two parameters must be defined in the bot’s profile:

- `thinking_interval`: The time interval (in ticks) at which the bot will perform self-driven thinking.
- `reflection_interval`: The interval (in ticks) between each self-reflection round.

Minecraft time uses ticks, where 1000 ticks ≈ 1 hour in-game. For example, `thinking_interval: 100` will prompt thinking every ~6 in-game minutes.

You can customize the agent’s personality and intrinsic goals by configuring the `person_desc`, `longterm`, and `shortterm` fields in the agent’s profile (note that, when not specified in the agent's profile, these fields are set with the default values given in `profiles/defaults/_default.json`). These will influence the content of the agent’s thoughts and the direction of its autonomous actions.

> **Note:** Both `thinking_interval` and `reflection_interval` must be set to valid numerical values for the system to take effect.

```
{
    "name": "Dobson",
    "model" : {
        "api" : "doubao",
        "model": "doubao-1-5-pro-32k-250115"
    },
    "reflection_interval" : 3000,
    "thinking_interval" : 100 
}
```

<img src="https://s2.loli.net/2025/04/20/wWpoAE9xe6rcQ7f.gif" alt="Bot build a igloo after self-driven thinking." width="800" height="450">