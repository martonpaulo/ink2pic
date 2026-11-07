#!/usr/bin/env node
/**
 * Builds the OpenMoji keyword index the plugin ships, src/search-core/data/openmoji-index.json
 * (#67), from pinned data files: OpenMoji's openmoji.json, emojilib's English keywords and the
 * CLDR annotations for Portuguese, Spanish and Chinese. Each file is pinned to a commit and its
 * SHA-256, so a run reproduces the committed index byte for byte.
 *
 *   node scripts/build-openmoji-index.cjs [--cache <dir>] [--check]
 *
 * --cache keeps the downloads in <dir> and reads them from there next time. --check builds the
 * index and fails when it differs from the committed file, or when the first symbol's picture at
 * the pinned commit is not a PNG. The index records that pictures URL, so the plugin fetches
 * the pictures of the same release as its keywords (#99). Behind a proxy, Node needs
 * NODE_USE_ENV_PROXY=1 (and NODE_EXTRA_CA_CERTS for its certificate). The plugin never fetches
 * these files: only this script does.
 */
'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');

const OUT = path.join(
  __dirname,
  '..',
  'src',
  'search-core',
  'data',
  'openmoji-index.json',
);
const RAW = 'https://raw.githubusercontent.com';
const OPENMOJI = 'f9fc506a3f913be9897ab0181d611d4c910a4104'; // tag 17.0.0
const EMOJILIB = 'b4da69426d5dc6e8c8c02c09b163ff3e7160b316'; // tag v4.0.3
const CLDR = 'a4b67247b446fd51b475991017a2481911210c60'; // tag 49.0.0
const cldr = lang =>
  `${RAW}/unicode-org/cldr-json/${CLDR}/cldr-json/cldr-annotations-full/annotations/${lang}/annotations.json`;

const SOURCES = {
  openmoji: {
    url: `${RAW}/hfg-gmuend/openmoji/${OPENMOJI}/data/openmoji.json`,
    sha256: 'ab181dd523021dfbe2b98a13d96ab384b7b3014d17815261bc267fb39d9a211b',
  },
  emojilib: {
    url: `${RAW}/muan/emojilib/${EMOJILIB}/dist/emoji-en-US.json`,
    sha256: '7974e9162e1505aa1b02d07a04e4eefa5c51864d6c32e477121c635201e2eca2',
  },
  pt: {
    url: cldr('pt'),
    sha256: 'a64a01f9906ec754487d4d903caa6fb62ee9613047a1c8cfd1c82a0216f0df5e',
  },
  es: {
    url: cldr('es'),
    sha256: 'f4149459f74207b235e673f62f5671c06ac97ae53f2c1d100e1eae40e54c5306',
  },
  zh: {
    url: cldr('zh'),
    sha256: '7d49968f977021fefe6ceea2613e0313de5ea416d8f3c0a8fe3032c9b7f2ebfb',
  },
};
const CLDR_LANGUAGES = ['pt', 'es', 'zh'];
/** The black 618 px pictures of the pinned OpenMoji release, `<HEX>.png` each. */
const PICTURES = `${RAW}/hfg-gmuend/openmoji/${OPENMOJI}/black/618x618`;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47]);

/**
 * Left out (#67): flags, skin-tone parts and variants, OpenMoji's and Unicode's extras (brand
 * logos such as F8FF and E051, proposed emoji with no CLDR keywords), and the «man» and «woman»
 * twins of a sequence whose neutral person stays.
 */
const DROPPED_GROUPS = new Set([
  'flags',
  'component',
  'extras-openmoji',
  'extras-unicode',
]);
const GENDERED = /(^|-)(1F468|1F469|2640|2642)(-|$)/;
/** The separators of the index's text: a keyword holding one is left out. */
const SEPARATORS = /[\t;/]/;
/** Emotions and signs: a query that only they name is abstract (#67). */
const ABSTRACT = new Set(['smileys-emotion', 'symbols']);

/** Lowercase with accents removed: «Frío» and «frio» are one word (#67). */
function fold(text) {
  return text
    .normalize('NFD')
    .replace(/\p{M}+/gu, '')
    .toLowerCase()
    .replace(/[_\s]+/g, ' ')
    .trim();
}

function list(values, skip) {
  const seen = new Set(skip);
  const kept = [];
  for (const value of values.map(fold)) {
    if (value && !SEPARATORS.test(value) && !seen.has(value)) {
      seen.add(value);
      kept.push(value);
    }
  }
  return kept;
}

/** The CLDR key of an emoji: its characters with no variation selector. */
const bare = emoji => emoji.replace(/️/g, '');

async function load(name, cacheDir) {
  const {url, sha256} = SOURCES[name];
  const cached = cacheDir && path.join(cacheDir, `${name}.json`);
  let body;
  if (cached && fs.existsSync(cached)) {
    body = fs.readFileSync(cached);
  } else {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`${url}: HTTP ${response.status}`);
    }
    body = Buffer.from(await response.arrayBuffer());
    if (cached) {
      fs.mkdirSync(cacheDir, {recursive: true});
      fs.writeFileSync(cached, body);
    }
  }
  const digest = crypto.createHash('sha256').update(body).digest('hex');
  if (digest !== sha256) {
    throw new Error(`${name}: SHA-256 ${digest}, expected ${sha256}`);
  }
  return JSON.parse(body.toString('utf8'));
}

function kept(entry) {
  return (
    !entry.skintone &&
    !DROPPED_GROUPS.has(entry.group) &&
    !GENDERED.test(entry.hexcode)
  );
}

/**
 * One line per symbol: `<HEX> <1 abstract | 0 concrete>`, then one tab-separated field per
 * language in LANGUAGES order: `name;keyword;...` (CLDR), then for English `/word;...` of
 * openmoji_tags and `/word;...` of emojilib (#67). Each source that names a word ranks the symbol
 * higher for it. Every word is folded but the English name, the result's title.
 */
function line(hex, abstract, fields) {
  return [`${hex} ${abstract ? 1 : 0}`, ...fields].join('\t');
}

function field(name, ...lists) {
  if (SEPARATORS.test(name)) {
    throw new Error(`a name holds a separator of the index: ${name}`);
  }
  const [first, ...more] = lists;
  return [[name, ...first], ...more]
    .map(words => words.join(';'))
    .join('/')
    .replace(/\/+$/, '');
}

function build(data) {
  const emojilib = new Map(
    Object.entries(data.emojilib).map(([emoji, words]) => [bare(emoji), words]),
  );
  const annotations = Object.fromEntries(
    CLDR_LANGUAGES.map(lang => [
      lang,
      new Map(
        Object.entries(data[lang].annotations.annotations).map(
          ([emoji, value]) => [bare(emoji), value],
        ),
      ),
    ]),
  );
  const split = text => (text ? text.split(',') : []);
  const entries = data.openmoji.filter(kept).map(entry => {
    const key = bare(entry.emoji);
    const name = entry.annotation.trim();
    const strong = list(split(entry.tags), [fold(name)]);
    const tags = list(split(entry.openmoji_tags), [fold(name)]);
    const library = list(emojilib.get(key) ?? [], [fold(name)]);
    const fields = [field(name, strong, tags, library)];
    for (const lang of CLDR_LANGUAGES) {
      const found = annotations[lang].get(key);
      const local = found?.tts?.[0] ? fold(found.tts[0]) : '';
      fields.push(
        local ? field(local, list(found.default ?? [], [local])) : '',
      );
    }
    const abstract = ABSTRACT.has(entry.group);
    return line(entry.hexcode, abstract, fields);
  });
  return {
    sources: Object.fromEntries(
      Object.entries(SOURCES).map(([name, {url}]) => [name, url]),
    ),
    pictures: PICTURES,
    languages: ['en', ...CLDR_LANGUAGES],
    entries,
  };
}

/** Fails unless the first symbol's picture answers as a PNG at the recorded pictures URL. */
async function checkPicture(index) {
  const hex = index.entries[0].split(' ')[0];
  const url = `${index.pictures}/${hex}.png`;
  const response = await fetch(url);
  const head = Buffer.from(await response.arrayBuffer()).subarray(0, 4);
  if (!response.ok || !head.equals(PNG_SIGNATURE)) {
    throw new Error(`${url}: HTTP ${response.status}, not a PNG`);
  }
}

async function main() {
  const args = process.argv.slice(2);
  const cacheAt = args.indexOf('--cache');
  const cacheDir = cacheAt >= 0 ? args[cacheAt + 1] : undefined;
  const data = {};
  for (const name of Object.keys(SOURCES)) {
    data[name] = await load(name, cacheDir);
  }
  const text = `${JSON.stringify(build(data))}\n`;
  const size = `${text.length} B, ${zlib.gzipSync(text).length} B gzipped`;
  if (args.includes('--check')) {
    if (fs.readFileSync(OUT, 'utf8') !== text) {
      throw new Error(`${OUT} differs from a fresh build (${size})`);
    }
    await checkPicture(JSON.parse(text));
    console.log(`openmoji index: up to date (${size})`);
    return;
  }
  fs.mkdirSync(path.dirname(OUT), {recursive: true});
  fs.writeFileSync(OUT, text);
  console.log(`openmoji index: wrote ${OUT} (${size})`);
}

main().catch(error => {
  console.error(error.message);
  process.exit(1);
});
