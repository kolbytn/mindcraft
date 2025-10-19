# Mindcraft Testing

Test suite for the Mindcraft project.

## Structure

- `unit/` - Unit tests for individual components
- `integration/` - Integration tests for component interactions

## Running Tests

```bash
npm test              # Run all tests
npm run test:watch    # Watch mode
npm run test:coverage # With coverage
npm run test:ci       # CI mode
```

## Test Files

### Unit Tests
- `commands.test.js` - Command parsing and execution
- `utils.test.js` - Utility functions
- `task.test.js` - Task validation and processing
- `settings.test.js` - Settings configuration
- `models.test.js` - Model configuration and API selection

### Integration Tests
- `basic.test.js` - Module loading and configuration

## Guidelines

1. Tests verify existing functionality without modifications
2. Mock external dependencies (APIs, file system, network)
3. Test edge cases and error conditions
4. Use descriptive test names
5. Keep tests independent

## Coverage

Tests cover core functionality while avoiding:
- Minecraft server connections
- External API calls
- File system modifications

## CI/CD

Automated testing on:
- Push to `develop`, `unit-test`, `main` branches
- Pull requests to `develop` or `main` branches
- Node.js versions 18.x and 20.x

Coverage reports uploaded to Codecov.
