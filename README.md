# Mindcraft Generative Agents

The setup process of Mincraft Generative Agents is identical to the setup of Mindcraft, while
there are some distinguishable features which you should pay attention.

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