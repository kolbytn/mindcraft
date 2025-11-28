# Add `host_public` setting for remote UI access

Enables the MindServer web UI to be accessed remotely from other machines by binding to `0.0.0.0` instead of `localhost`.

## Changes

| File | Change |
|------|--------|
| `settings.js` | Added `host_public: false` option with inline documentation |
| `main.js` | Pass `settings.host_public` to `Mindcraft.init()` instead of hardcoded `false` |
| `README.md` | Added "Remote UI access" section explaining the setting |

## Usage

Set `"host_public": true` in `settings.js` to bind the MindServer to `0.0.0.0`, making the web UI accessible from other machines on the network. Useful for headless server deployments.

## Security Note

Ensure your firewall only exposes the MindServer port to trusted networks when using this feature.
