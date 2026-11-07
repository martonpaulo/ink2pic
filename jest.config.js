module.exports = {
  preset: 'react-native',
  // Lane worktrees live under .claude/worktrees; their tests run in their own checkout. The search
  // lab (lab/, #63) runs on its own against the live sources, never in the gate.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
    '<rootDir>/lab/',
  ],
  modulePathIgnorePatterns: [
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
    '<rootDir>/lab/',
  ],
};
