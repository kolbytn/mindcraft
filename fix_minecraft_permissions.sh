#!/bin/bash
# Fix Minecraft permissions so chuck (minecraft group member) can edit files without sudo

echo "=========================================="
echo "Fixing Minecraft Directory Permissions"
echo "=========================================="
echo ""

# Make minecraft directory group-writable
echo "📝 Making /opt/minecraft/paper group-writable..."
sudo chmod -R g+w /opt/minecraft/paper/

echo "✅ Permissions updated!"
echo ""
echo "You can now edit Minecraft files without sudo:"
echo "  - whitelist.json"
echo "  - server.properties"
echo "  - ops.json"
echo "  - etc."
echo ""
