import { describe, test, expect } from '@jest/globals';

describe('Task System', () => {
  describe('Item Presence Validation', () => {
    test('should validate single item presence', () => {
      const data = {
        target: 'diamond',
        number_of_target: 1
      };
      
      const mockAgent = {
        bot: {
          inventory: {
            slots: [
              { name: 'diamond', count: 2 },
              { name: 'stone', count: 10 }
            ]
          }
        }
      };

      function checkItemPresence(data, agent) {
        const targets = typeof data.target === 'string' 
          ? { [data.target]: 1 } 
          : data.target;
        
        const requiredQuantities = typeof data.number_of_target === 'number'
          ? Object.keys(targets).reduce((acc, key) => {
              acc[key] = data.number_of_target;
              return acc;
            }, {})
          : data.number_of_target || {};

        const inventoryCount = {};
        agent.bot.inventory.slots.forEach((slot) => {
          if (slot) {
            const itemName = slot.name.toLowerCase();
            inventoryCount[itemName] = (inventoryCount[itemName] || 0) + slot.count;
          }
        });

        const missingItems = [];
        let allTargetsMet = true;

        for (const [item, requiredCount] of Object.entries(requiredQuantities)) {
          const itemName = item.toLowerCase();
          const currentCount = inventoryCount[itemName] || 0;
          if (currentCount < requiredCount) {
            allTargetsMet = false;
            missingItems.push({
              item: itemName,
              required: requiredCount,
              current: currentCount,
              missing: requiredCount - currentCount
            });
          }
        }

        return {
          success: allTargetsMet,
          missingItems: missingItems
        };
      }

      const result = checkItemPresence(data, mockAgent);
      expect(result.success).toBe(true);
      expect(result.missingItems).toEqual([]);
    });

    test('should detect missing items', () => {
      const data = {
        target: 'diamond',
        number_of_target: 5
      };
      
      const mockAgent = {
        bot: {
          inventory: {
            slots: [
              { name: 'diamond', count: 2 },
              { name: 'stone', count: 10 }
            ]
          }
        }
      };

      function checkItemPresence(data, agent) {
        const targets = { [data.target]: data.number_of_target };
        const inventoryCount = {};
        agent.bot.inventory.slots.forEach((slot) => {
          if (slot) {
            const itemName = slot.name.toLowerCase();
            inventoryCount[itemName] = (inventoryCount[itemName] || 0) + slot.count;
          }
        });

        const missingItems = [];
        let allTargetsMet = true;

        for (const [item, requiredCount] of Object.entries(targets)) {
          const itemName = item.toLowerCase();
          const currentCount = inventoryCount[itemName] || 0;
          if (currentCount < requiredCount) {
            allTargetsMet = false;
            missingItems.push({
              item: itemName,
              required: requiredCount,
              current: currentCount,
              missing: requiredCount - currentCount
            });
          }
        }

        return {
          success: allTargetsMet,
          missingItems: missingItems
        };
      }

      const result = checkItemPresence(data, mockAgent);
      expect(result.success).toBe(false);
      expect(result.missingItems).toHaveLength(1);
      expect(result.missingItems[0].item).toBe('diamond');
      expect(result.missingItems[0].missing).toBe(3);
    });

    test('should handle multiple target items', () => {
      const data = {
        target: {
          'diamond': 2,
          'iron_ingot': 5
        }
      };
      
      const mockAgent = {
        bot: {
          inventory: {
            slots: [
              { name: 'diamond', count: 3 },
              { name: 'iron_ingot', count: 3 }
            ]
          }
        }
      };

      function checkItemPresence(data, agent) {
        const targets = data.target;
        const inventoryCount = {};
        agent.bot.inventory.slots.forEach((slot) => {
          if (slot) {
            const itemName = slot.name.toLowerCase();
            inventoryCount[itemName] = (inventoryCount[itemName] || 0) + slot.count;
          }
        });

        const missingItems = [];
        let allTargetsMet = true;

        for (const [item, requiredCount] of Object.entries(targets)) {
          const itemName = item.toLowerCase();
          const currentCount = inventoryCount[itemName] || 0;
          if (currentCount < requiredCount) {
            allTargetsMet = false;
            missingItems.push({
              item: itemName,
              required: requiredCount,
              current: currentCount,
              missing: requiredCount - currentCount
            });
          }
        }

        return {
          success: allTargetsMet,
          missingItems: missingItems
        };
      }

      const result = checkItemPresence(data, mockAgent);
      expect(result.success).toBe(false);
      expect(result.missingItems).toHaveLength(1);
      expect(result.missingItems[0].item).toBe('iron_ingot');
      expect(result.missingItems[0].missing).toBe(2);
    });
  });

  describe('Task Timeout Logic', () => {
    test('should calculate elapsed time correctly', () => {
      const taskStartTime = Date.now() - 30000;
      const elapsedTime = (Date.now() - taskStartTime) / 1000;
      expect(elapsedTime).toBeGreaterThan(29);
      expect(elapsedTime).toBeLessThan(31);
    });

    test('should handle timeout conditions', () => {
      const taskTimeout = 60;
      const elapsedTime = 65;
      
      const isTimeout = elapsedTime >= taskTimeout;
      expect(isTimeout).toBe(true);
    });
  });

  describe('Task Goal Processing', () => {
    test('should process string goals', () => {
      const goal = 'Build a house';
      const addString = ' with other agents';
      const result = goal + addString;
      expect(result).toBe('Build a house with other agents');
    });

    test('should process object goals by agent ID', () => {
      const goals = {
        '0': 'Agent 0 goal',
        '1': 'Agent 1 goal'
      };
      const agentId = '0';
      const result = goals[agentId] || '';
      expect(result).toBe('Agent 0 goal');
    });

    test('should handle missing agent goals', () => {
      const goals = {
        '0': 'Agent 0 goal'
      };
      const agentId = '1';
      const result = goals[agentId] || '';
      expect(result).toBe('');
    });
  });
});
