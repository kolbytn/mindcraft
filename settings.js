export default 
{
    "minecraft_version": "1.20.4", // supports up to 1.20.4
    "host": "45.159.6.47", // or "localhost", "your.ip.address.here"
    "port": 25822,
    "auth": "offline", // or "microsoft"
    
    "profiles": [
        "./user-profiles/andy1.json",
        "./user-profiles/andy2.json",
        "./user-profiles/andy3.json",
        "./user-profiles/andy4.json",
        "./user-profiles/andy5.json",       
        "./user-profiles/andy6.json",
        "./user-profiles/andy7.json",
        "./user-profiles/andy8.json",
        "./user-profiles/andy9.json",
        //"./user-profiles/andy10.json",
        // add more profiles here, check ./profiles/ for more
        // more than 1 profile will require you to /msg each bot indivually
    ],
    "load_memory": false, // load memory from previous session
    "init_message": "Say hello world and your name", // sends to all on spawn

    "allow_insecure_coding": false, // allows newAction command and model can write/run code on your computer. enable at own risk
    "code_timeout_mins": 10, // minutes code is allowed to run. -1 for no timeout
    
    "max_commands": -1, // max number of commands to use in a response. -1 for no limit
    "verbose_commands": true, // show full command syntax
    "narrate_behavior": true, // chat simple automatic actions ('Picking up item!')

    "predefined": {
        "conversing": "Predefined conversation prompt",
        "coding": "Predefined coding prompt",
        "saving_memory": "Predefined memory saving prompt",
        "goal_setting": "Predefined goal setting prompt"
    }
}