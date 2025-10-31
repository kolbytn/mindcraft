#!/bin/bash
# Watch Minecraft server logs in real-time

echo "=========================================="
echo "Minecraft Server Live Logs"
echo "=========================================="
echo "Press Ctrl+C to stop"
echo ""

# Follow the latest log file
tail -f /opt/minecraft/paper/logs/latest.log
