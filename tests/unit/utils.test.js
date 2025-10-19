import { describe, test, expect } from '@jest/globals';

describe('Utility Functions', () => {
  describe('Text Utilities', () => {
    test('should handle basic string operations', () => {
      const testString = 'Hello World';
      expect(testString.toLowerCase()).toBe('hello world');
      expect(testString.toUpperCase()).toBe('HELLO WORLD');
      expect(testString.length).toBe(11);
    });

    test('should handle string replacement', () => {
      const template = 'Hello $NAME, welcome to $WORLD';
      const result = template.replace('$NAME', 'Agent').replace('$WORLD', 'Minecraft');
      expect(result).toBe('Hello Agent, welcome to Minecraft');
    });

    test('should handle array operations', () => {
      const items = ['stone', 'wood', 'iron'];
      expect(items.includes('stone')).toBe(true);
      expect(items.includes('diamond')).toBe(false);
      expect(items.length).toBe(3);
    });
  });

  describe('Math Utilities', () => {
    test('should handle basic math operations', () => {
      expect(2 + 2).toBe(4);
      expect(10 - 5).toBe(5);
      expect(3 * 4).toBe(12);
      expect(15 / 3).toBe(5);
    });

    test('should handle coordinate calculations', () => {
      const pos1 = { x: 0, y: 64, z: 0 };
      const pos2 = { x: 10, y: 64, z: 10 };
      const distance = Math.sqrt(Math.pow(pos2.x - pos1.x, 2) + Math.pow(pos2.z - pos1.z, 2));
      expect(distance).toBeCloseTo(14.14, 1);
    });

    test('should handle random number generation', () => {
      const random = Math.random();
      expect(random).toBeGreaterThanOrEqual(0);
      expect(random).toBeLessThan(1);
    });
  });

  describe('Object Operations', () => {
    test('should handle object property access', () => {
      const config = {
        name: 'test_agent',
        model: 'gpt-4',
        settings: {
          temperature: 0.7,
          max_tokens: 1000
        }
      };
      
      expect(config.name).toBe('test_agent');
      expect(config.settings.temperature).toBe(0.7);
      expect(config.settings.max_tokens).toBe(1000);
    });

    test('should handle object merging', () => {
      const base = { a: 1, b: 2 };
      const override = { b: 3, c: 4 };
      const merged = { ...base, ...override };
      
      expect(merged.a).toBe(1);
      expect(merged.b).toBe(3);
      expect(merged.c).toBe(4);
    });
  });

  describe('Array Operations', () => {
    test('should handle array filtering', () => {
      const items = ['stone', 'wood', 'iron', 'diamond'];
      const valuable = items.filter(item => item === 'diamond' || item === 'iron');
      expect(valuable).toEqual(['iron', 'diamond']);
    });

    test('should handle array mapping', () => {
      const numbers = [1, 2, 3, 4];
      const doubled = numbers.map(n => n * 2);
      expect(doubled).toEqual([2, 4, 6, 8]);
    });

    test('should handle array finding', () => {
      const players = [
        { name: 'player1', health: 20 },
        { name: 'player2', health: 15 },
        { name: 'player3', health: 20 }
      ];
      const lowHealth = players.find(p => p.health < 20);
      expect(lowHealth?.name).toBe('player2');
    });
  });

  describe('JSON Operations', () => {
    test('should handle JSON parsing and stringifying', () => {
      const obj = { name: 'test', value: 42 };
      const jsonString = JSON.stringify(obj);
      const parsed = JSON.parse(jsonString);
      
      expect(parsed.name).toBe('test');
      expect(parsed.value).toBe(42);
    });

    test('should handle nested JSON structures', () => {
      const config = {
        agent: {
          name: 'andy',
          settings: {
            model: 'gpt-4',
            temperature: 0.7
          }
        }
      };
      
      const jsonString = JSON.stringify(config);
      const parsed = JSON.parse(jsonString);
      
      expect(parsed.agent.name).toBe('andy');
      expect(parsed.agent.settings.model).toBe('gpt-4');
    });
  });
});
