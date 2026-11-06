import {readFileSync} from 'fs';
import {join} from 'path';

// The PNGs come from assets/icon.svg through `npm run icon` (#31).
// A PNG keeps its width and height as big-endian integers at bytes 16 and 20 (the IHDR chunk).
function pngSize(file: string): {width: number; height: number} {
  const bytes = readFileSync(join(__dirname, '..', 'assets', file));
  expect(bytes.subarray(12, 16).toString('ascii')).toBe('IHDR');
  return {width: bytes.readUInt32BE(16), height: bytes.readUInt32BE(20)};
}

describe('plugin icon', () => {
  it('renders the toolbar icon at 96 x 96 for the 1.875 density', () => {
    expect(pngSize('icon.png')).toEqual({width: 96, height: 96});
  });

  it('renders the README icon at 512 x 512', () => {
    expect(pngSize('icon-512.png')).toEqual({width: 512, height: 512});
  });
});
