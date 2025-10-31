#!/bin/bash
# Apply bot whitelist commands to Minecraft server
#
# Usage:
#   ./scripts/apply_whitelist.sh                    # Show commands to copy/paste
#   ./scripts/apply_whitelist.sh rcon               # Use RCON (if configured)
#   ./scripts/apply_whitelist.sh docker <name>      # Send to Docker container

WHITELIST_FILE="scripts/whitelist_bots.txt"

if [ ! -f "$WHITELIST_FILE" ]; then
    echo "❌ Error: $WHITELIST_FILE not found"
    exit 1
fi

# Extract just the /whitelist commands
COMMANDS=$(grep "^/whitelist" "$WHITELIST_FILE")
COUNT=$(echo "$COMMANDS" | wc -l)

echo "=========================================="
echo "Minecraft Bot Whitelist Commands"
echo "=========================================="
echo "Total commands: $COUNT"
echo ""

case "$1" in
    rcon)
        echo "📡 Sending commands via RCON..."
        if ! command -v rcon-cli &> /dev/null; then
            echo "❌ Error: rcon-cli not installed"
            echo "Install with: npm install -g rcon-cli"
            exit 1
        fi

        read -p "RCON Host [localhost]: " RCON_HOST
        RCON_HOST=${RCON_HOST:-localhost}

        read -p "RCON Port [25575]: " RCON_PORT
        RCON_PORT=${RCON_PORT:-25575}

        read -sp "RCON Password: " RCON_PASSWORD
        echo ""

        echo "$COMMANDS" | while read cmd; do
            rcon-cli -H "$RCON_HOST" -P "$RCON_PORT" -p "$RCON_PASSWORD" "$cmd"
        done

        echo "✅ Done! Commands sent via RCON"
        ;;

    docker)
        if [ -z "$2" ]; then
            echo "❌ Error: Please specify container name"
            echo "Usage: $0 docker <container-name>"
            exit 1
        fi

        CONTAINER="$2"
        echo "🐳 Sending commands to Docker container: $CONTAINER"

        # Use docker exec with stdin
        echo "$COMMANDS" | docker exec -i "$CONTAINER" sh -c 'while read cmd; do echo "$cmd"; done'

        echo "✅ Done! Commands sent to Docker container"
        ;;

    *)
        echo "📋 COPY THESE COMMANDS:"
        echo "=========================================="
        echo "$COMMANDS"
        echo "=========================================="
        echo ""
        echo "📝 Instructions:"
        echo "1. Copy all commands above (Ctrl+Shift+C)"
        echo "2. Access your Minecraft server console"
        echo "3. Paste commands (Ctrl+Shift+V or right-click)"
        echo "4. Verify with: /whitelist list"
        echo ""
        echo "💡 Alternative methods:"
        echo "   $0 rcon              # Use RCON"
        echo "   $0 docker <name>     # Send to Docker container"
        ;;
esac
