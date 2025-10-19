import { 
  containsCommand, 
  commandExists, 
  parseCommandMessage, 
  getCommandDocs 
} from '../../src/agent/commands/index.js';

describe('Command System', () => {
  describe('containsCommand', () => {
    test('should detect commands with exclamation mark', () => {
      expect(containsCommand('Hello !goToPlayer("player1")')).toBe('!goToPlayer');
      expect(containsCommand('!stop')).toBe('!stop');
      expect(containsCommand('!goToCoordinates(100, 64, 200)')).toBe('!goToCoordinates');
    });

    test('should return null for messages without commands', () => {
      expect(containsCommand('Hello world')).toBeNull();
      expect(containsCommand('goToPlayer without exclamation')).toBeNull();
      expect(containsCommand('')).toBeNull();
    });

    test('should handle commands with parameters', () => {
      expect(containsCommand('!givePlayer("player1", "diamond", 5)')).toBe('!givePlayer');
      expect(containsCommand('!searchForBlock("stone", 50)')).toBe('!searchForBlock');
    });
  });

  describe('commandExists', () => {
    test('should return true for existing commands', () => {
      expect(commandExists('!stop')).toBe(true);
      expect(commandExists('!stats')).toBe(true);
      expect(commandExists('!inventory')).toBe(true);
    });

    test('should return false for non-existing commands', () => {
      expect(commandExists('!nonexistent')).toBe(false);
      expect(commandExists('!fakeCommand')).toBe(false);
    });

    test('should handle commands with and without exclamation mark', () => {
      expect(commandExists('stop')).toBe(true);
      expect(commandExists('!stop')).toBe(true);
    });
  });

  describe('parseCommandMessage', () => {
    test('should parse simple commands without parameters', () => {
      const result = parseCommandMessage('!stop');
      expect(result.commandName).toBe('!stop');
      expect(result.args).toEqual([]);
    });

    test('should parse commands with string parameters', () => {
      const result = parseCommandMessage('!goToPlayer("player1", 2)');
      expect(result.commandName).toBe('!goToPlayer');
      expect(result.args).toEqual(['player1', 2]);
    });

    test('should parse commands with multiple parameters', () => {
      const result = parseCommandMessage('!goToCoordinates(100, 64, 200, 2)');
      expect(result.commandName).toBe('!goToCoordinates');
      expect(result.args).toEqual([100, 64, 200, 2]);
    });

    test('should parse commands with boolean parameters', () => {
      const result = parseCommandMessage('!setMode("auto_eat", true)');
      expect(result.commandName).toBe('!setMode');
      expect(result.args).toEqual(['auto_eat', true]);
    });

    test('should return error for invalid command format', () => {
      const result = parseCommandMessage('invalid command');
      expect(typeof result).toBe('string');
      expect(result).toContain('incorrectly formatted');
    });

    test('should return error for non-existent commands', () => {
      const result = parseCommandMessage('!nonexistent()');
      expect(typeof result).toBe('string');
      expect(result).toContain('not a command');
    });

    test('should return error for wrong number of arguments', () => {
      const result = parseCommandMessage('!goToPlayer("player1")');
      expect(typeof result).toBe('string');
      expect(result).toContain('args');
    });
  });

  describe('getCommandDocs', () => {
    test('should return command documentation', () => {
      const mockAgent = {
        blocked_actions: []
      };
      const docs = getCommandDocs(mockAgent);
      expect(typeof docs).toBe('string');
      expect(docs).toContain('COMMAND DOCS');
      expect(docs).toContain('!stop');
      expect(docs).toContain('!stats');
    });

    test('should exclude blocked actions from docs', () => {
      const mockAgent = {
        blocked_actions: ['!stop']
      };
      const docs = getCommandDocs(mockAgent);
      expect(docs).not.toContain('!stop');
    });
  });
});
