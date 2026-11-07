module.exports = {
  preset: 'react-native',
  // A test fails on a console.error it did not expect (#112).
  setupFilesAfterEnv: ['<rootDir>/__tests__/host/consoleSetup.ts'],
  // Lane worktrees live under .claude/worktrees; their tests run in their own checkout. The search
  // lab (lab/, #63) runs on its own against the live sources, never in the gate.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
    '<rootDir>/lab/',
    // The PluginHost simulator and its helpers: modules the tests import, not tests (#78).
    '<rootDir>/__tests__/host/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
    '<rootDir>/lab/',
  ],
};
