# ViaProxy Setup

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

Connecting to "online" servers via viaproxy involves more effort:\
First start the ViaProxy container, then open another terminal in the mindcraft directory.\
Run `docker attach mindcraft-viaproxy-1` in the new terminal to attach to the container.\
After attaching, you can use the `account` command to manage user accounts:

- `account list` List all accounts in the list
- `account add microsoft` Add a microsoft account (run the command and follow the instructions)
- `account select <id>` Select the account to be used (run `account list` to see the ids)
- `account remove <id>` Remove an account (run `account list` to see the ids)
- `account deselect` Deselect the current account (go back to offline mode)

> [!WARNING]
> If you login with a microsoft account, the access token is stored in the `saves.json` file.\
> Never share this file with anyone! This would allow them to join servers in your name!

When you're done setting up your account (don't forget to select it), use `CTRL-P` then `CTRL-Q` to detach from the container.

If you want to persist these changes, you can configure them in the `services/viaproxy/viaproxy.yml`.

1. Change `auth-method` to `account`
2. Change `minecraft-account-index` to the id of your account


