import {readdirSync, readFileSync, statSync} from 'fs';
import {join, relative} from 'path';

const ROOT = join(__dirname, '..');
const SKIP = new Set([
  'node_modules',
  'build',
  'android',
  '.git',
  '.scratch',
  '.claude',
  '__mocks__',
]);
/** The only files allowed to import the SDK: the wrappers and tests, which drive its mock. */
const ALLOWED = [/^src\/sdk\//, /^__tests__\//];

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap(name => {
    const path = join(dir, name);
    if (SKIP.has(name)) {
      return [];
    }
    if (statSync(path).isDirectory()) {
      return sources(path);
    }
    return /\.(ts|tsx|js)$/.test(name) ? [relative(ROOT, path)] : [];
  });
}

it('imports sn-plugin-lib only from src/sdk/', () => {
  const offenders = sources(ROOT).filter(
    path =>
      !ALLOWED.some(rule => rule.test(path)) &&
      /from ['"]sn-plugin-lib['"]|require\(['"]sn-plugin-lib['"]\)/.test(
        readFileSync(join(ROOT, path), 'utf8'),
      ),
  );
  expect(offenders).toEqual([]);
});
