import {readFileSync} from 'fs';
import {join} from 'path';
import {copy, CopyKey} from '../src/ui/copy';

/** The rows of the copy table in brief section 8.10, as key and text. */
function briefCopy(): [string, string][] {
  const brief = readFileSync(join(__dirname, '..', 'docs', 'brief.md'), 'utf8');
  const section = brief.split('### 8.10 User-facing copy')[1].split('\n## ')[0];
  const rows: [string, string][] = [];
  for (const line of section.split('\n')) {
    const match = /^\| `([^`]+)`(?: \/ `([^`]+)`)? \| (.+) \|$/.exec(line);
    if (!match) {
      continue;
    }
    const [, first, second, text] = match;
    if (second) {
      const [a, b] = text.split(' / ');
      rows.push([first, a], [second, b]);
    } else {
      rows.push([first, text]);
    }
  }
  return rows;
}

describe('copy', () => {
  it('reads the brief table', () => {
    expect(briefCopy().length).toBeGreaterThan(10);
  });

  it.each(briefCopy())('holds %s exactly as the brief', (key, text) => {
    expect(copy[key as CopyKey]).toBe(text);
  });
});
