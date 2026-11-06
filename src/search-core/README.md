# Search core

The picture search with no platform in it: no React Native, no `sn-plugin-lib`, no file or
network API of its own. Everything it needs comes in through its options, so the same code runs on
the Supernote, in Node (the search lab, #63) and in another project. A test in
`__tests__/sdk-boundary.test.ts` fails when a file here imports anything outside this folder.

## Contents

- [Public API](#public-api)
- [Parts](#parts)
- [Adding a source](#adding-a-source)
- [Adding a ranking signal](#adding-a-ranking-signal)

## Public API

Import from `src/search-core` (its `index.ts`) only.

| Name | What it does |
| :--- | :--- |
| `createContext({fetch, userAgent, clock?, log?, timeoutMs?})` | The context adapters search with: one fetcher, the User-Agent and the log |
| `searchAll(query, adapters, {ctx, clock?, timeoutMs?})` | Searches every adapter in parallel, merges and ranks; never throws |
| `DEFAULT_ADAPTERS` | Openclipart, Commons and Wikidata, in that order |
| `cachedSearch(query, run, {storage, path, clock?})` | A fresh cached outcome, or `run`'s outcome stored when worth keeping |
| `searchState(outcome)` | The one state a finished search is in, for the screen to name |
| `rankForEink(lists, query, scorers?)`, `DEFAULT_SCORERS`, `Scorer` | The ranking as an ordered list of signals |
| `fullUrl(result, width)`, `insertUrl(result)` | The image of a result at a width, or for an insert |
| `pageOf`, `pageCount`, `PAGE_SIZE` | Six results per page |

Every failure is a `Failure` with a typed `kind` (`network`, `timeout`, `http`, `throttled`,
`parse`); its `message` is for the log only.

## Parts

- `adapter.ts`: the `SourceAdapter` interface and the `SourceContext` it searches with.
- `adapters/`: one file per source, each with its URL builders and parsers.
- `registry.ts`: the default adapters and the picture host of each source that owns results.
- `fetcher.ts`: the only network path, with the User-Agent and the per-request timeout.
- `clock.ts`: the injected clock and log.
- `query.ts`: the query pipeline stages.
- `rank.ts`: the scorers and the ranker.
- `search.ts`: the parallel search with its per-source budget.
- `cache.ts`: the cache over an injected text store.
- `state.ts`: the `SearchState` union.

## Adding a source

Write `adapters/<name>.ts` exporting a `SourceAdapter`: `name`, `search(query, ctx)` that reaches
the network only through `ctx.fetch` and returns `{ok: true, results}` or a `Failure`, and
`requests` when it makes more than one request in a row. A source whose results it owns adds a
`PictureHost` and a `SourceName`. List it in `registry.ts`.

## Adding a ranking signal

Write a `Scorer`, `(result, intent) => number`, on the integer scale of `rank.ts`, and pass
`[...DEFAULT_SCORERS, yourScorer]` to `rankForEink`, or add it to `DEFAULT_SCORERS` when every
search should read it.
