/**
 * shortcut: a re-export for `src/ui/ResultsGrid.tsx` and its test, which another lane changes
 * while the search moves to `src/search-core/` (#65); remove it once they import the core.
 */
export type {SearchResult} from '../search-core';
