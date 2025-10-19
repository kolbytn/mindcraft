import { jest } from '@jest/globals';

global.console = {
  ...console,
  log: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  info: jest.fn(),
  debug: jest.fn()
};

const originalExit = process.exit;
process.exit = jest.fn((code) => {
  throw new Error(`Process exit called with code: ${code}`);
});

afterAll(() => {
  process.exit = originalExit;
});

jest.setTimeout(10000);
