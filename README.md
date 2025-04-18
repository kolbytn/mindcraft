# <img src="https://s2.loli.net/2025/04/18/RWaFJkY4gSDLViy.png" alt="Official Discord Server" width="30" height="30"> Mindcraft Generative Agents



The setup process of Mincraft Generative Agents is identical to the setup of Mindcraft, while
there are some distinguishable features which you should pay attention.

🦾 This project is under development, more functions are added and optimized. If you have any question, welcome to join the our Discord server for more communications! 

<a href="https://discord.gg/RKjspnTBmb" target="_blank"><img src="https://s2.loli.net/2025/04/18/CEjdFuZYA4pKsQD.png" alt="Official Discord Server" width="180" height="36"></a>


## Notable Features 

### Profile of Bots
You are high recommended to specify the service profider as the value of key "api" in the configuration of the bot, 
as in the following example. 
```json
{
    "name" : "Dusty", 
    "model" : {
        "api" : "openrouter", 
        "model" : "openrouter/deepseek/deepseek-chat-v3-0324:free"
    }
}
```