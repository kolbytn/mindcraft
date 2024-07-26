export default 
{
    "minecraft_version": "1.20.4", // supports up to 1.20.4
    "host": "35.184.235.202", // or "localhost", "your.ip.address.here"
    "port": 25565,
    "auth": "microsoft", // or "microsoft"
    
    "profiles": [
        "./andy.json",
        // add more profiles here, check ./profiles/ for more
        // more than 1 profile will require you to /msg each bot indivually
    ],
    "load_memory": false, // load memory from previous session
    "init_message": "Introduce yourself, then start building and running a civilization with the other agents on the server.", // sends to all on spawn
    "allow_insecure_coding": true, // disable at own risk
    "code_timeout_mins": 10, // -1 for no timeout
}