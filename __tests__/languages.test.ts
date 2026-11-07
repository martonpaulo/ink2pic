import {
  addableLanguages,
  defaultLanguages,
  LanguageCode,
  languageCode,
  languagesStep,
} from '../src/settings/languages';

const OWNER: readonly LanguageCode[] = ['zh', 'es', 'en', 'pt'];

describe('defaultLanguages (#68)', () => {
  it('is the system language, then English', () => {
    expect(defaultLanguages('pt')).toEqual(['pt', 'en']);
    expect(defaultLanguages('zh-CN')).toEqual(['zh', 'en']);
    expect(defaultLanguages('pt_BR')).toEqual(['pt', 'en']);
  });

  it('is English once when the system language is English', () => {
    expect(defaultLanguages('en-US')).toEqual(['en']);
  });

  it('is English alone when the system language is unknown or unsupported', () => {
    expect(defaultLanguages(null)).toEqual(['en']);
    expect(defaultLanguages('de')).toEqual(['en']);
    expect(defaultLanguages('not a tag')).toEqual(['en']);
  });
});

it('reads language tags', () => {
  expect(languageCode('ES')).toBe('es');
  expect(languageCode('')).toBeNull();
  expect(languageCode(7)).toBeNull();
});

describe('languagesStep (#68)', () => {
  it('moves a language up and down', () => {
    expect(languagesStep(OWNER, {type: 'up', code: 'en'})).toEqual([
      'zh',
      'en',
      'es',
      'pt',
    ]);
    expect(languagesStep(OWNER, {type: 'down', code: 'zh'})).toEqual([
      'es',
      'zh',
      'en',
      'pt',
    ]);
  });

  it('changes nothing for up on the first row and down on the last', () => {
    expect(languagesStep(OWNER, {type: 'up', code: 'zh'})).toBe(OWNER);
    expect(languagesStep(OWNER, {type: 'down', code: 'pt'})).toBe(OWNER);
  });

  it('removes a language, but never the last one', () => {
    expect(languagesStep(OWNER, {type: 'remove', code: 'es'})).toEqual([
      'zh',
      'en',
      'pt',
    ]);
    const one: readonly LanguageCode[] = ['en'];
    expect(languagesStep(one, {type: 'remove', code: 'en'})).toBe(one);
  });

  it('appends an added language once', () => {
    const two: readonly LanguageCode[] = ['en', 'pt'];
    expect(languagesStep(two, {type: 'add', code: 'zh'})).toEqual([
      'en',
      'pt',
      'zh',
    ]);
    expect(languagesStep(two, {type: 'add', code: 'en'})).toBe(two);
  });

  it('resets to exactly the default', () => {
    expect(languagesStep(OWNER, {type: 'reset', system: 'es'})).toEqual(
      defaultLanguages('es'),
    );
    expect(languagesStep(OWNER, {type: 'reset', system: null})).toEqual(['en']);
  });

  it('offers only the languages not in use, in the table order', () => {
    expect(addableLanguages(['en'])).toEqual(['zh', 'es', 'pt']);
    expect(addableLanguages(OWNER)).toEqual([]);
  });
});
