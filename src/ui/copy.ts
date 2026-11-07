/**
 * Every user-facing string, from brief section 8.10. English only; never inline in components.
 * Permission request descriptions reuse the `error.permission.*` texts.
 */
export const copy = {
  'button.lasso': 'Find picture',
  'button.insert': 'Insert picture',
  'button.sidebar': 'Ink2Pic',
  'tab.search': 'Search',
  'tab.library': 'Library',
  'search.placeholder': 'Type a word',
  'search.running': 'Searching…',
  'search.empty': 'No pictures found. Check the spelling or try one word.',
  'search.recent': 'Recent',
  'search.needWord': 'Type a word first.',
  'search.corrected': 'Showing results for {query}.',
  'search.instead': 'Search for {query} instead',
  'search.stale': 'The sources did not answer. Showing an earlier search.',
  // Outside the brief's table: a page waits for its thumbnails after the search ended (#35).
  'page.loading': 'Loading pictures…',
  'nav.previous': '◀',
  'nav.next': '▶',
  'nav.previousLabel': 'Previous page',
  'nav.nextLabel': 'Next page',
  'insert.running': 'Adding to your note…',
  'error.offline': 'No internet. Showing your library.',
  'error.sourceDown': 'A picture source did not answer. Try again later for more pictures.',
  'error.permission.internet':
    'Ink2Pic needs Network Access to search pictures.',
  'error.permission.files':
    'Ink2Pic needs Read Files and Modify Files to save pictures to your library.',
  'error.permission.settings':
    'To allow it, open Settings > Apps > Plugins > Ink2Pic > Permissions.',
  'error.recognition': 'Could not read the word. Type it instead.',
  'onboarding.1': 'Write a word in your note.',
  'onboarding.2': 'Circle it with the lasso.',
  'onboarding.3': 'Tap ••• on the lasso toolbar, then Find picture.',
  'onboarding.start': 'Start',
  // Outside the brief's table: the close button of the plugin view (#3).
  'action.close': 'Close',
  // Outside the brief's table: the search button and the call log (owner's logging rule, #13).
  'action.search': 'Search',
  'action.log': 'Log',
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
  'error.placeSlow':
    'The picture may still appear. Check the page before you try again.',
  'error.unexpected': 'Something went wrong. Close Ink2Pic and open it again.',
  // Outside the brief's table: the starting screen (#12, build 0.1.0 (7)).
  'app.starting': 'Starting…',
  // Outside the brief's table: the #75 device spike in the Log view, removed when the spike ends.
  'probe.run': 'Probe pen and page',
  'probe.lastWord': 'Lasso last word',
  'probe.noStrokes':
    'No handwriting on this page yet. Write a word, then try again.',
  'probe.lassoFailed':
    'The lasso did not take the word. Open the log for the details.',
  // Outside the brief's table: the empty Library tab (#15).
  'library.empty': 'No saved pictures yet. Insert one from a search.',
  // The Languages screen, from the plugin's Settings entry (#68).
  'languages.title': 'Languages',
  'languages.hint': 'The first language is tried first.',
  'languages.inUse': 'IN USE',
  'languages.addSection': 'ADD A LANGUAGE',
  'languages.up': '↑',
  'languages.down': '↓',
  'languages.remove': 'Remove',
  'languages.add': 'Add',
  'languages.upLabel': 'Move {language} up',
  'languages.downLabel': 'Move {language} down',
  'languages.removeLabel': 'Remove {language}',
  'languages.addLabel': 'Add {language}',
  'languages.reset': 'Reset',
  'languages.resetQuestion': 'Reset languages to the default?',
  'action.cancel': 'Cancel',
  'language.zh': '中文 (Chinese)',
  'language.es': 'Español',
  'language.en': 'English',
  'language.pt': 'Português',
  // The Settings screen, from the plugin's Settings entry (#70).
  'settings.title': 'Settings',
  'settings.back': '‹ Settings',
  'settings.backLabel': 'Back to Settings',
  'settings.languages': 'Languages',
  'settings.languagesOpen': 'Change ›',
  'settings.languagesOpenLabel': 'Change the languages',
  'settings.size': 'Picture size',
  'settings.size.small': 'Small',
  'settings.size.medium': 'Medium',
  'settings.size.large': 'Large',
  'settings.placement': 'Where the picture goes',
  'settings.placement.below': 'Below',
  'settings.placement.replace': 'In place of word',
  'settings.placement.beside': 'Beside',
  'settings.placementNote':
    'In place of word deletes the lassoed handwriting when you tap a picture.',
  'settings.style': 'Picture style',
  'settings.style.drawings': 'Drawings first',
  'settings.style.photos': 'Photos too',
  'settings.style.contour': 'All as contour',
  'settings.spacing': 'Word spacing in your handwriting',
  'settings.spacing.tight': 'Tight',
  'settings.spacing.normal': 'Normal',
  'settings.spacing.wide': 'Wide',
  'settings.sources': 'Picture sources (one stays on)',
  'source.openclipart': 'Openclipart',
  'source.commons': 'Commons',
  'source.wikidata': 'Wikipedia',
  'source.openmoji': 'OpenMoji',
  'settings.dataSaver': 'Data saver: fewer and smaller pictures',
  'settings.dataSaver.off': 'Off',
  'settings.dataSaver.on': 'On',
  'settings.symbols': 'Offline symbols: {saved} of {total}',
  'settings.symbolsDownload': 'Download symbols for offline use',
  'settings.symbolsQuestion':
    'Download {count} OpenMoji symbols, about {size} MB? They stay in MyStyle/Ink2Pic/symbols/, under CC BY-SA 4.0.',
  'settings.symbolsConfirm': 'Download',
  'settings.symbolsProgress': 'Downloading symbols: {saved} of {total}…',
  'settings.symbolsDone': 'Every symbol is saved for offline use.',
  'settings.symbolsStopped':
    'The download stopped at {saved} of {total}. Check the Wi-Fi, then download again to go on.',
  'settings.clear': 'Clear library list',
  'settings.clearQuestion':
    'Clear the library list and recent searches? The picture files stay in MyStyle/Ink2Pic/library/.',
  'settings.clearConfirm': 'Clear list',
  'settings.cleared':
    'The library list is cleared. The picture files stay in MyStyle/Ink2Pic/library/.',
  'settings.clearFailed': 'Could not clear the library list. Try again.',
  'settings.reset': 'Reset all',
  'settings.resetQuestion': 'Reset every setting to the default?',
} as const;

export type CopyKey = keyof typeof copy;
