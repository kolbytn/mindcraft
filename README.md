# Mindcraft

Crafting minds for Minecraft with AI!

## Installation

Install Node.js >= 14 from [nodejs.org](https://nodejs.org/)

Install node modules with `npm install`

## Usage

Start minecraft server on localhost port `55916`

Add `OPENAI_API_KEY` (and optionally `OPENAI_ORG_ID`) to your environment variables.

run `node main.js`

## Patches

Some of the node modules that we depend on have bugs in them. To add a patch, change your local node module file and run `npx patch-package [package-name]`