module.exports = {
  preset: 'react-native',
  // Lane worktrees live under .claude/worktrees; their tests run in their own checkout.
  testPathIgnorePatterns: [
    '/node_modules/',
    '<rootDir>/.claude/',
    '<rootDir>/.scratch/',
  ],
  modulePathIgnorePatterns: ['<rootDir>/.claude/', '<rootDir>/.scratch/'],
};
