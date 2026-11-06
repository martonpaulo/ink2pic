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
} as const;

export type CopyKey = keyof typeof copy;
