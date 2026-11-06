import {fullUrl, insertUrl, isSourceName} from '../src/sources/registry';
import type {SearchResult} from '../src/sources/types';

const THUMB =
  'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Soup.png/330px-Soup.png';
const clip: SearchResult = {
  id: 'openclipart:42',
  source: 'openclipart',
  title: 'soup bowl',
  thumbUrl: 'https://openclipart.org/image/400px/42',
  license: 'CC0 1.0',
  attribution: 'Openclipart',
};
const photo: SearchResult = {
  id: 'commons:7',
  source: 'commons',
  title: 'Soup',
  thumbUrl: THUMB,
  license: 'CC BY-SA 4.0',
  attribution: 'Example Artist',
};

describe('the source registry (#54)', () => {
  it('asks each source for the width it serves for an insert (#48)', () => {
    expect(insertUrl(clip)).toBe('https://openclipart.org/image/800px/42');
    expect(insertUrl(photo)).toBe(THUMB.replace('/330px-', '/960px-'));
  });

  it('takes a narrow PNG original as it is (#55)', () => {
    const original = {url: 'https://example.test/Soup.png', width: 576};
    expect(insertUrl({...photo, mime: 'image/png', original})).toBe(
      original.url,
    );
  });

  it('gives a library picture its local file', () => {
    expect(fullUrl({...clip, localPath: '/s/a.png'}, 800)).toBe(
      'file:///s/a.png',
    );
  });

  it('knows only the sources it has a rule for', () => {
    expect(isSourceName('commons')).toBe(true);
    expect(isSourceName('wikidata')).toBe(false);
    expect(isSourceName(1)).toBe(false);
  });
});
