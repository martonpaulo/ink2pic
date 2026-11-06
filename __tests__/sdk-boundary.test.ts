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

it('defines every negative failure code in src/sdk/result.ts only (#49, #54)', () => {
  const offenders = sources(join(ROOT, 'src')).filter(
    path =>
      path !== 'src/sdk/result.ts' &&
      /fail\(\s*-\d|_CODE\s*=\s*-\d/.test(
        readFileSync(join(ROOT, path), 'utf8'),
      ),
  );
  expect(offenders).toEqual([]);
});

it('keeps the storage, search and library layers below the flow and the view (#54)', () => {
  const lower = /^src\/(log|sdk|storage|sources|search|library)\//;
  const offenders = sources(join(ROOT, 'src')).filter(
    path =>
      lower.test(path) &&
      /from ['"]\.\.\/(flow|onboarding|ui)\//.test(
        readFileSync(join(ROOT, path), 'utf8'),
      ),
  );
  expect(offenders).toEqual([]);
});
