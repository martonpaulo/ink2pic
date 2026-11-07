/**
 * The renders (#80): every screen to .scratch/renders/ and the e-ink check, with the Jest setup
 * the unit tests use. Run with `npm run renders`; not part of `npm test`.
 */
const {execFileSync} = require('child_process');
const fs = require('fs');
const base = require('../../jest.config');

/**
 * Playwright is installed globally with its Chromium, not in package.json, so the renders resolve
 * it from the global root, for any user, the gate user too (#90).
 */
const globalRoot = execFileSync('npm', ['root', '-g'], {encoding: 'utf8'}).trim();

/**
 * shortcut: the cloud image keeps Playwright's Chromium in /opt/pw-browsers and sets
 * PLAYWRIGHT_BROWSERS_PATH only for root; upgrade when another machine shares a browser folder.
 */
const SHARED_BROWSERS = '/opt/pw-browsers';
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && fs.existsSync(SHARED_BROWSERS)) {
  process.env.PLAYWRIGHT_BROWSERS_PATH = SHARED_BROWSERS;
}

module.exports = {
  ...base,
  rootDir: '../..',
  testMatch: ['<rootDir>/scripts/renders/*.render.tsx'],
  setupFiles: ['<rootDir>/scripts/renders/manta.ts'],
  modulePaths: [globalRoot],
  /** One test renders every screen: about 4 s idle, so 5 s timed out under load (#90). */
  testTimeout: 120000,
};
