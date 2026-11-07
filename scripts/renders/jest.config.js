/**
 * The renders (#80): every screen to .scratch/renders/ and the e-ink check, with the Jest setup
 * the unit tests use. Run with `npm run renders`; not part of `npm test`.
 */
const base = require('../../jest.config');

module.exports = {
  ...base,
  rootDir: '../..',
  testMatch: ['<rootDir>/scripts/renders/*.render.tsx'],
  setupFiles: ['<rootDir>/scripts/renders/manta.ts'],
};
