import {
  countDetailLinks,
  countThumbUrls,
  describeModule,
  formatReport,
} from '../src/spike/report';

describe('countDetailLinks', () => {
  it('counts distinct result ids', () => {
    const html =
      '<a href="/detail/340609/soup-bowl"><img src="/image/200px/340609"></a>' +
      '<a href="/detail/340609/soup-bowl">again</a><a href="/detail/12/tree">';
    expect(countDetailLinks(html)).toBe(2);
  });

  it('returns 0 for a page with no results', () => {
    expect(countDetailLinks('<p>No results</p>')).toBe(0);
  });
});

describe('countThumbUrls', () => {
  it('counts thumburl values', () => {
    const json = JSON.stringify({
      query: {
        pages: {
          '1': {imageinfo: [{thumburl: 'https://x/a.jpg'}]},
          '2': {imageinfo: [{}]},
        },
      },
    });
    expect(countThumbUrls(json)).toEqual({count: 1});
  });

  it('reports an API error, not zero results', () => {
    const json = JSON.stringify({
      error: {code: 'ratelimited', info: 'too many'},
    });
    expect(countThumbUrls(json)).toEqual({
      error: 'API error ratelimited: too many',
    });
  });

  it('reports a body that is not JSON', () => {
    expect(countThumbUrls('<html>throttled</html>')).toEqual({
      error: 'not JSON: <html>throttled</html>',
    });
  });

  it('reports a response without pages', () => {
    expect(countThumbUrls('{}')).toEqual({
      error: 'no query.pages in the response',
    });
  });
});

describe('formatReport', () => {
  it('puts each section under its title', () => {
    expect(formatReport('h', [{title: 'S0', lines: ['a', 'b']}])).toBe(
      'h\n\n[S0]\na\nb',
    );
  });
});

describe('describeModule', () => {
  it('skips a module that is not there', () => {
    expect(describeModule('RNFSManager', null, undefined)).toBeNull();
  });

  it('lists the methods of a module, own and inherited', () => {
    class Base {
      readFile() {}
    }
    class Fs extends Base {
      writeFile() {}
    }
    expect(describeModule('RNFSManager', new Fs(), null)).toBe(
      'RNFSManager (turbo): readFile, writeFile',
    );
    expect(describeModule('BlobModule', null, {})).toBe(
      'BlobModule (legacy): (no methods listed)',
    );
  });
});
