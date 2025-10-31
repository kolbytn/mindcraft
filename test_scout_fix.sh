#!/bin/bash
#
# Test script to verify scout-1 self-prompting fix
#

echo "=========================================="
echo "Scout-1 Self-Prompting Fix Test"
echo "=========================================="
echo ""

# Clean up old files
echo "1. Cleaning up old test files..."
rm -f .mindcraft-agents/logs/scout-1.done
rm -f .mindcraft-agents/context/scout-report.md
echo "   ✓ Cleanup complete"
echo ""

echo "2. Test Instructions:"
echo "   a. The script will start 'npm start andy' in the background"
echo "   b. Wait for andy to connect to Minecraft"
echo "   c. In Minecraft, say: hey andy build a small wooden platform"
echo "   d. Watch the console output for [SELF-PROMPTER] and [!goal] messages"
echo ""

echo "3. What to look for:"
echo "   [!goal] Command triggered!      <- Scout-1 called !goal ✓"
echo "   [SELF-PROMPTER] Self-prompting started  <- Self-prompting activated ✓"
echo "   [SELF-PROMPTER] Loop iteration 1        <- Loop running ✓"
echo "   [SELF-PROMPTER] Loop iteration 2        <- Still running! ✓"
echo ""

echo "4. Press Enter to start the test (or Ctrl+C to cancel)..."
read

echo "Starting andy..."
npm start andy
