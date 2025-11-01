#!/bin/bash

echo "📋 Reloading Minecraft server whitelist..."
echo ""
echo "Please run this command in your Minecraft server console:"
echo ""
echo "  whitelist reload"
echo ""
echo "Or use screen/tmux to send it:"
echo ""
echo "  screen -S minecraft -p 0 -X stuff 'whitelist reload^M'"
echo ""
echo "Current whitelist has $(cat /opt/minecraft/paper/whitelist.json | jq '. | length') entries"
echo ""
echo "Scouts whitelisted:"
cat /opt/minecraft/paper/whitelist.json | jq -r '.[].name' | grep -E "scout-[0-9]+" | sort
