# Survival Mode Configuration

**Date:** 2025-10-31
**Changes:** Switched server and bots from Creative/God Mode to Survival Mode

---

## ✅ Changes Made

### 1. Server Configuration
**File:** `/opt/minecraft/paper/server.properties`

```properties
gamemode=survival        # Changed from: creative
force-gamemode=true      # Changed from: false
```

### 2. Bot Configuration
**File:** `settings.js`

```javascript
"base_profile": "survival"  // Changed from: "god_mode"
```

### 3. Bot Survival Settings
**File:** `src/orchestration/bot_orchestrator.js`

```javascript
baseModes = {
    self_preservation: true,  // Re-enabled for survival
    self_defense: true,       // Re-enabled for survival
    // narrate_behavior still disabled to prevent spam
}
```

---

## 🎮 How to Apply Changes

### Option 1: Restart Minecraft Server (RECOMMENDED)

**Method A: If server has a restart command:**
```bash
# In Minecraft server console:
restart
```

**Method B: Manual restart:**
```bash
# Find the server process
ps aux | grep paper.jar

# Kill it gracefully
sudo systemctl stop minecraft  # If using systemd
# OR
sudo kill <PID>  # If running manually

# Start it again
sudo systemctl start minecraft
```

### Option 2: Change Gamemode In-Game (Temporary)

```bash
# In Minecraft server console or as OP in-game:
defaultgamemode survival
gamemode survival @a
```

⚠️ **Note:** Option 2 only changes current session. Restart server to make it permanent.

---

## 🔄 Restart Bots

After changing the server, restart Andy so bots use survival mode:

```bash
# Stop Andy (Ctrl+C if running)

# Restart
npm start andy
```

---

## 🎯 Expected Behavior

### **Before (Creative/God Mode):**
- ✅ Players fly, unlimited resources
- ✅ Bots invincible, instant breaking
- ❌ No survival challenge

### **After (Survival Mode):**
- ✅ Players need to gather resources
- ✅ Bots need to craft tools, manage health
- ✅ Hunger, health, and damage matter
- ✅ Bots will defend themselves and avoid danger
- ✅ Still no chat spam (narrate_behavior disabled)

---

## 🧪 Testing

1. **Restart server** (see above)
2. **Restart Andy:**
   ```bash
   npm start andy
   ```
3. **Join Minecraft** and check gamemode:
   ```bash
   # You should be in survival mode
   # Check with: /gamemode
   ```
4. **Test survival milestone:**
   ```bash
   /msg andy survive and get wooden tools
   ```

**Expected:**
- gatherer-1 spawns in survival mode
- Needs to actually break blocks (not instant)
- Has health/hunger bars
- Can take damage
- Completes task successfully

---

## ⚙️ Advanced Options

### Keep Andy in Creative, Players in Survival

If you want Andy to stay in creative mode but players in survival:

**In Minecraft:**
```bash
/gamemode creative andy
```

Andy will keep creative abilities while players stay in survival.

### Revert to Creative Mode

If you want to go back:

1. **Edit `/opt/minecraft/paper/server.properties`:**
   ```properties
   gamemode=creative
   ```

2. **Edit `settings.js`:**
   ```javascript
   "base_profile": "god_mode"
   ```

3. **Restart server and Andy**

---

## 📊 Summary

| Setting | Old Value | New Value |
|---------|-----------|-----------|
| Server gamemode | creative | survival |
| Force gamemode | false | true |
| Bot profile | god_mode | survival |
| Bot self-preservation | disabled | enabled |
| Bot narrate | enabled | disabled |

---

## 🚀 Next Steps

1. Restart Minecraft server
2. Restart Andy
3. Test survival milestone: `/msg andy survive and get wooden tools`
4. Enjoy survival mode! 🎯
