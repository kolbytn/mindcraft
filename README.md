# Mindcraft

Crafting minds for Minecraft with AI!

## Installation

Install Node.js >= 14 from [nodejs.org](https://nodejs.org/)

Install node modules with `npm install`

## Usage

Start minecraft server on localhost port `55916`

Add `OPENAI_API_KEY` (and optionally `OPENAI_ORG_ID`) to your environment variables.

run `node main.js`

## Node Module Patches

Some of the node modules that we depend on have bugs in them. PRs have been submitted but currently you must manually implement these fixes in some node modules:
- In `mineflayer-collectblock/lib/CollectBlock.js`, replace `!block.canHarvest(bot.heldItem)` with `bot.heldItem !== null && !block.canHarvest(bot.heldItem.type)` (line 80?)