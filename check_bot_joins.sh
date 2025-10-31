#!/bin/bash
# Check recent bot join/disconnect activity

echo "=========================================="
echo "Recent Bot Activity (Last 50 Lines)"
echo "=========================================="
echo ""

tail -50 /opt/minecraft/paper/logs/latest.log | \
  grep -E "joined the game|left the game|lost connection|Disconnecting|whitelist" | \
  tail -20

echo ""
echo "=========================================="
echo "Currently Online:"
echo "=========================================="
tail -200 /opt/minecraft/paper/logs/latest.log | \
  grep "joined the game" | \
  tail -10 | \
  sed 's/.*: //' | \
  sed 's/ joined the game//' | \
  sort -u
