# Structured Action Logging

Mindcraft can optionally write structured `ACTION` lines for successful bot actions that change or use blocks. The log is intended to make Andy's physical actions inspectable without changing how the actions are executed.

## Enabling

Set `action_logging` to `true` in `settings.js`:

```js
"action_logging": true,
"action_log_file_prefix": "andy_log",
```

Logging is disabled by default so normal Mindcraft behavior stays unchanged unless the feature is explicitly enabled.

## Log Location

When the first action is logged, Mindcraft creates a new file for the current bot:

```text
./bots/<bot-name>/logs/andy_log_<timestamp>.txt
```

The filename prefix can be changed with `action_log_file_prefix`.

## Log Format

Each logged action is one line:

```text
ACTION <type> item=<item> previous_block=<block> result_block=<block> result_coord=[x,y,z] clicked_block=[x,y,z] clicked_face=<face> player_pos=[x.xxxxxx,y.yyyyyy,z.zzzzzz] yaw=<degrees> pitch=<degrees> sneaking=<true|false> standing_on=[x,y,z] standing_on_block=<block> hand=<main_hand|off_hand> tick=<tick> timestamp=<iso-date>
```

Example:

```text
ACTION place_block item=dirt previous_block=air result_block=dirt result_coord=[4,-61,1] clicked_block=[4,-62,1] clicked_face=up player_pos=[3.472681,-60.000000,2.516543] yaw=-493.917 pitch=58.176 sneaking=false standing_on=[3,-61,2] standing_on_block=grass_block hand=main_hand tick=1011330 timestamp=2026-05-02T16:56:42.367Z
```

Unknown or unavailable fields are written as `unknown`.

## Logged Actions

The logger currently records successful actions from the standard skill execution paths:

- `break_block` from `breakBlockAt`
- `place_block` from normal `placeBlock`
- `place_fluid` from bucket-based fluid placement through `placeBlock` or `useToolOnBlock`
- `use_bucket` from empty bucket use on water or lava through `useToolOnBlock`
- `use_item_on_block` from generic tool/item use through `useToolOnBlock`

## Known Limitations

- The logger records actions that go through the shared skill functions. Direct Mineflayer calls made elsewhere are not automatically logged.
- Some interactions do not expose an exact clicked face through the existing skill API; those lines use `clicked_face=unknown`.
- Cheat-mode `/setblock` placement and breaking are logged with the target coordinate, but they do not have a real clicked block face.
- Entity interactions are not logged.
