/**
 * shortcut: a re-export for `src/ui/ResultsGrid.tsx` and its test, which another lane changes
 * while the search moves to `src/search-core/` (#65); remove it once they import the core.
 */
export {PAGE_SIZE, pageCount, pageOf} from '../search-core';
