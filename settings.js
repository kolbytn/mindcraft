export default 
{
    "minecraft_version": "1.20.1", // supports up to 1.20.4
    "host": "127.0.0.1", // or "localhost", "your.ip.address.here"
    "port": 55916,
    "auth": "offline", // or "microsoft"
    
    "profiles": [
        "./profiles/gpt.json",
        // add more profiles here, check ./profiles/ for more
        // more than 1 profile will require you to /msg each bot indivually
    ],
    "load_memory": false, // load memory from previous session
    "init_message": "Say hello world and your name", // sends to all on spawn
    "allow_insecure_coding": true, // disable at own risk
    "code_timeout_mins": 10, // -1 for no timeout
}