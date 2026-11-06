import {einkScore, rankForEink} from '../src/search-core/rank';
import type {SearchResult, SourceName} from '../src/search-core/types';

const r = (
  source: SourceName,
  title: string,
  mime?: string,
  canonical?: boolean,
): SearchResult => ({
  id: `${source}:${title}`,
  source,
  title,
  thumbUrl: 'https://example.test/t',
  license: 'CC0 1.0',
  attribution: 'x',
  mime,
  ...(canonical ? {canonical} : {}),
});

describe('einkScore', () => {
  it('prefers line work and clip art over photos', () => {
    expect(einkScore(r('commons', 'Soup engraving', 'image/jpeg'))).toBe(1);
    expect(einkScore(r('commons', 'Photo of soup', 'image/jpeg'))).toBe(-1);
    expect(einkScore(r('openclipart', 'Soup bowl', 'image/png'))).toBe(1);
    expect(einkScore(r('commons', 'Soup bowl', 'image/png'))).toBe(1);
  });

  it('prefers a picture of the word alone over a scene that mentions it (#43)', () => {
    const plain = einkScore(r('openclipart', 'Cat'), 'cat');
    const named = einkScore(r('openclipart', 'Cat silhouette darkgray'), 'cat');
    const plural = einkScore(r('openclipart', 'Two cats'), 'cat');
    const scene = einkScore(
      r('openclipart', 'Cat fight on a roof at night'),
      'cat',
    );
    const other = einkScore(r('openclipart', 'Dog'), 'cat');
    // A silhouette is no line work: a solid fill is hard to write on (#65).
    expect(named).toBe(plain);
    expect(plural).toBe(plain);
    expect(plain).toBeGreaterThan(scene);
    expect(scene).toBeGreaterThan(other);
  });

  it('puts logos, maps, diagrams and flags below every plain picture (#43)', () => {
    for (const title of [
      'Apple Logo',
      'Apple origins map',
      'Bicycle diagram',
      'Flag of Apple',
      'Apple structure',
    ]) {
      expect(
        einkScore(r('commons', title, 'image/svg+xml'), 'apple'),
      ).toBeLessThan(
        einkScore(r('commons', 'Pink apple photo', 'image/jpeg'), 'apple'),
      );
    }
  });
});

describe('rankForEink', () => {
  it('ranks deterministically and mixes sources on ties', () => {
    const clipart = [
      r('openclipart', 'Bowl', 'image/png'),
      r('openclipart', 'Ladle', 'image/png'),
    ];
    const commons = [
      r('commons', 'Photo of a bowl', 'image/jpeg'),
      r('commons', 'Kitchen woodcut', 'image/jpeg'),
      r('commons', 'Soup', 'image/png'),
    ];
    const titles = rankForEink([clipart, commons]).map(x => x.title);
    // Bowl, Ladle, Kitchen woodcut and Soup tie at 1 and keep their interleaved order (#23).
    expect(titles).toEqual([
      'Bowl',
      'Ladle',
      'Kitchen woodcut',
      'Soup',
      'Photo of a bowl',
    ]);
    expect(rankForEink([clipart, commons]).map(x => x.title)).toEqual(titles);
  });

  it('shows the canonical pictures right after the best drawing (#43)', () => {
    const clipart = [
      r('openclipart', 'Napoleon on a horse with his army'),
      r('openclipart', 'Napoleon'),
    ];
    const wikidata = [
      r('commons', 'Example portrait', 'image/jpeg', true),
      r('commons', 'Example flag', 'image/svg+xml', true),
    ];
    const commons = [r('commons', 'Example portrait', 'image/jpeg')];
    const titles = rankForEink([clipart, commons, wikidata], 'Napoleon').map(
      x => x.title,
    );
    // The duplicate portrait from the Commons search is shown once.
    expect(titles).toEqual([
      'Napoleon',
      'Example portrait',
      'Example flag',
      'Napoleon on a horse with his army',
    ]);
  });

  it('shows the canonical pictures alone when nothing else was found', () => {
    const wikidata = [r('commons', 'Example flag', 'image/svg+xml', true)];
    expect(rankForEink([[], wikidata], 'x').map(x => x.title)).toEqual([
      'Example flag',
    ]);
  });

  it('handles empty lists', () => {
    expect(rankForEink([])).toEqual([]);
    expect(rankForEink([[], []])).toEqual([]);
  });

  it('mixes Commons into the first page when Openclipart has many hits (#23)', () => {
    const clipart = Array.from({length: 8}, (_, i) =>
      r('openclipart', `Bowl ${i}`, 'image/png'),
    );
    const commons = Array.from({length: 3}, (_, i) =>
      r('commons', `Bowl ${i}`, 'image/png'),
    );
    const firstPage = rankForEink([clipart, commons]).slice(0, 6);
    expect(firstPage.filter(x => x.source === 'commons')).toHaveLength(3);
  });
});

describe('style words in the query (#65)', () => {
  const apples = [
    r('openclipart', 'Apple'),
    r('openclipart', 'Red apple icon'),
    r('commons', 'Apple logo', 'image/svg+xml'),
    r('commons', 'Apple origins map', 'image/svg+xml'),
  ];

  it('«apple logo» shows the logo first (owner, 2026-11-06)', () => {
    expect(rankForEink([apples], 'apple logo')[0].title).toBe('Apple logo');
  });

  it('«apple» still puts the logo below a plain apple', () => {
    const titles = rankForEink([apples], 'apple').map(x => x.title);
    expect(titles.indexOf('Apple logo')).toBeGreaterThan(
      titles.indexOf('Apple'),
    );
  });

  it('a style word cancels only its own group: «apple logo» keeps the map low', () => {
    const titles = rankForEink([apples], 'apple logo').map(x => x.title);
    expect(titles[titles.length - 1]).toBe('Apple origins map');
  });

  it('a plain apple still answers «apple logo», below the logo', () => {
    expect(einkScore(apples[0], 'apple logo')).toBeGreaterThan(
      einkScore(r('openclipart', 'Pear'), 'apple logo'),
    );
  });

  it('a query of style words alone keeps them as its subject', () => {
    expect(
      einkScore(r('commons', 'Flag', 'image/svg+xml'), 'flag'),
    ).toBeGreaterThan(
      einkScore(r('commons', 'Logo of a bank', 'image/svg+xml'), 'flag'),
    );
  });

  it('«photo» lifts photos, «painting» paintings', () => {
    const photo = r('commons', 'Apple photo', 'image/jpeg');
    expect(einkScore(photo, 'apple photo')).toBeGreaterThan(
      einkScore(photo, 'apple'),
    );
    const painting = r('commons', 'Apple painting', 'image/jpeg');
    expect(einkScore(painting, 'apple painting')).toBeGreaterThan(
      einkScore(r('commons', 'Apple', 'image/jpeg'), 'apple painting'),
    );
  });
});

describe('text-only pictures and signatures (#65)', () => {
  const plain = r('commons', 'Miguel de Cervantes', 'image/jpeg');

  it.each([
    'Miguel de Cervantes quote',
    'Miguel de Cervantes text',
    'Miguel de Cervantes lettering',
    'Miguel de Cervantes typography',
    'Miguel de Cervantes calligraphy',
    'Frase de Miguel de Cervantes',
    'Citação de Miguel de Cervantes',
  ])(
    'ranks «%s» below a plain picture (owner: text-only images rank low)',
    title => {
      expect(
        einkScore(r('commons', title, 'image/svg+xml'), 'Miguel de Cervantes'),
      ).toBeLessThan(einkScore(plain, 'Miguel de Cervantes') - 2);
    },
  );

  it('keeps a text picture up when the query asks for text', () => {
    const quote = r('commons', 'Miguel de Cervantes quote', 'image/svg+xml');
    expect(einkScore(quote, 'Miguel de Cervantes quote')).toBeGreaterThan(
      einkScore(quote, 'Miguel de Cervantes'),
    );
  });

  it.each([
    'Miguel de Cervantes signature',
    'Frida Kahlo signature firma',
    'Assinatura de Machado de Assis',
    'Clarice-Lispector-Unterschrift',
    'Napoleon autograph',
  ])('drops «%s»', title => {
    const signed = r('commons', title, 'image/svg+xml');
    expect(rankForEink([[plain, signed]], 'cervantes')).toEqual([plain]);
  });

  it('drops a signature named only in the file name', () => {
    const signed = {
      ...r('commons', 'Cervantes 1605'),
      thumbUrl:
        'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/Cervantes_firma.svg/330px-Cervantes_firma.svg.png',
    };
    expect(rankForEink([[plain, signed]], 'cervantes')).toEqual([plain]);
  });

  it('keeps signatures when the query asks for one', () => {
    const signed = r(
      'commons',
      'Miguel de Cervantes signature',
      'image/svg+xml',
    );
    expect(rankForEink([[plain, signed]], 'cervantes signature')[0]).toBe(
      signed,
    );
  });
});

describe('silhouettes and frames (#65)', () => {
  it('gives a silhouette no line-work point: a solid fill is hard to write on', () => {
    expect(einkScore(r('openclipart', 'Cat silhouette'), 'cat')).toBe(
      einkScore(r('openclipart', 'Cat'), 'cat'),
    );
  });

  it.each([
    'Apple Runner',
    'Apple border',
    'Apple frame',
    'Apple ornament',
    'Apple divider',
  ])('ranks «%s» below a plain apple for «apple»', title => {
    const titles = rankForEink(
      [[r('openclipart', title), r('openclipart', 'Red apple')]],
      'apple',
    ).map(x => x.title);
    expect(titles).toEqual(['Red apple', title]);
  });

  it('keeps a frame up when the query asks for one', () => {
    const frame = r('openclipart', 'Apple frame');
    expect(einkScore(frame, 'apple frame')).toBeGreaterThan(
      einkScore(frame, 'apple'),
    );
  });
});
