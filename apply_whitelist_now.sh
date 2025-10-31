#!/bin/bash
# Apply the bot whitelist to your Minecraft server

echo "=========================================="
echo "Applying Bot Whitelist to Minecraft Server"
echo "=========================================="
echo ""

# Check if whitelist file exists
if [ ! -f "/tmp/new_whitelist.json" ]; then
    echo "❌ Error: /tmp/new_whitelist.json not found"
    echo "Run this first: node /tmp/generate_whitelist.js > /tmp/new_whitelist.json"
    exit 1
fi

# Backup current whitelist
echo "📦 Backing up current whitelist..."
sudo cp /opt/minecraft/paper/whitelist.json /opt/minecraft/paper/whitelist.json.backup
echo "   Backup saved to: whitelist.json.backup"

# Apply new whitelist
echo "📝 Updating whitelist..."
sudo cp /tmp/new_whitelist.json /opt/minecraft/paper/whitelist.json
sudo chown minecraft:minecraft /opt/minecraft/paper/whitelist.json

echo ""
echo "✅ Whitelist file updated!"
echo ""
echo "📊 Whitelist now contains:"
echo "   - Your 4 existing players"
echo "   - 90 bot slots (gatherer-1 through tester-10)"
echo ""
echo "🎮 Next steps:"
echo "   1. Join your Minecraft server"
echo "   2. Run: /whitelist reload"
echo "   3. Or restart the server"
echo ""
echo "Then test with Andy:"
echo "   npm start andy"
echo "   /msg andy survive and get wooden tools"
echo ""
