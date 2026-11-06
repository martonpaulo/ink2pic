/**
 * Every user-facing string, from brief section 8.10. English only; never inline in components.
 * Permission request descriptions reuse the `error.permission.*` texts.
 */
export const copy = {
  'button.lasso': 'Find picture',
  'button.sidebar': 'Ink2Pic',
  'tab.search': 'Search',
  'tab.library': 'Library',
  'search.placeholder': 'Type or fix the word',
  'search.running': 'Searching…',
  'search.empty': 'No pictures found. Try a simpler English word.',
  'search.recent': 'Recent',
  // Outside the brief's table: a page waits for its thumbnails after the search ended (#35).
  'page.loading': 'Loading pictures…',
  'nav.previous': '◀',
  'nav.next': '▶',
  'nav.previousLabel': 'Previous page',
  'nav.nextLabel': 'Next page',
  'insert.running': 'Adding to your note…',
  'error.offline': 'No internet. Showing your library.',
  'error.sourceDown': 'One source did not answer. Showing the other one.',
  'error.permission.internet':
    'Ink2Pic needs internet access to search pictures.',
  'error.permission.files':
    'Ink2Pic needs file access to save pictures to your library.',
  'error.permission.settings':
    'To allow it, open Settings > Apps > Plugins > Ink2Pic > Permissions.',
  'error.recognition': 'Could not read the word. Type it instead.',
  'onboarding.1': 'Write a word in your note.',
  'onboarding.2': 'Circle it with the lasso.',
  'onboarding.3': 'Tap Find picture and choose one.',
  'onboarding.start': 'Start',
  // Outside the brief's table: the close button of the plugin view (#3).
  'action.close': 'Close',
  // Outside the brief's table: the search button and the call log (owner's logging rule, #13).
  'action.search': 'Search',
  'action.log': 'Log',
  'action.checkFiles': 'Check files',
  'error.emptyLasso':
    'There is no handwriting in the lasso. Type the word instead.',
  'error.sourcesDown':
    'The picture sources did not answer. Try again in a minute.',
  'error.downloadOffline':
    'The internet stopped while getting the picture. Try again when you are online.',
  'error.download': 'Could not get this picture. Try another one.',
  'error.save':
    'Could not save the picture. Free some space on the device and try again.',
  'error.place':
    'Could not put the picture in the note. Open a note page and try again.',
  'error.unexpected': 'Something went wrong. Open Log for details.',
  // Outside the brief's table: the starting screen (#12, build 0.1.0 (7)).
  'app.starting': 'Starting…',
  // Outside the brief's table: the empty Library tab (#15).
  'library.empty': 'No saved pictures yet. Insert one from a search.',
} as const;

export type CopyKey = keyof typeof copy;
