Use this service to connect your bot to unsupported minecraft server versions.

Run:

```bash
docker-compose --profile viaproxy up
```

After first start it will create config file `services/viaproxy/viaproxy.yml`.

Edit this file, and change your desired target `target-address`, 

then point to your `settings.js` `host` and `port` to viaproxy:

```javascript
    "host": "host.docker.internal",
    "port": 25568,
```

This easily works with "offline" servers. 

Connecting to "online" servers involves more configuration: see `auth-method` in `viaproxy.yml` (TODO describe) 



