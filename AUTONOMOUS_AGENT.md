# Autonomous Task Controller

Complex tasks now run in an observe, plan, single-action, and verification loop instead of generating a command chain all at once.

## Usage

Describe a goal in Minecraft chat or on the Mindcraft control page:

```text
Andy, gather enough materials and craft a stone pickaxe.
Andy, find a safe location, prepare food, and build a temporary shelter.
```

The conversation model can delegate multi-step requests to `!goal("...")`. You can also start a goal directly:

```text
!goal("Gather materials and craft a stone pickaxe; finish when stone_pickaxe is present in the inventory")
```

View the current plan:

```text
!taskStatus
```

Stop the current goal:

```text
!endGoal
```

## Safety Limits

- Each iteration executes one existing command, then reads the world state again.
- The controller stops after four consecutive failures, repeated actions without progress, or 60 steps.
- The plan, current step, and latest result are stored with the bot's memory and can be restored when `load_memory` is enabled.
- `allow_insecure_coding` remains disabled, so the controller cannot generate and execute arbitrary JavaScript.
