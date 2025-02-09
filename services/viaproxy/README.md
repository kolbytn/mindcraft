Use this service to connect your bot to an unsupported minecraft server versions.

Run:

```bash
docker-compose --profile viaproxy up
```

After first start it will create config file `services/viaproxy/viaproxy.yml`.

Edit this file, and change your desired target `target-address`, 

then point your `settings.js` `host` and `port` to viaproxy endpoint:

```javascript
    "host": "host.docker.internal",
    "port": 25568,
```

This easily works with "offline" servers. 

Connecting to "online" servers via viaproxy involves more effort: see `auth-method` in `services/viaproxy/viaproxy.yml` (TODO describe) 



