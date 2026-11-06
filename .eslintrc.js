module.exports = {
  root: true,
  extends: '@react-native',
  // Lane worktrees (.claude/worktrees) and scratch work are checked in their own checkout.
  ignorePatterns: ['.claude/', '.scratch/', '.toolchain/', 'build/'],
};
