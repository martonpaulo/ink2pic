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
  'search.ready': 'Tap a picture to add it to your note.',
  // Outside the brief's table: a page waits for its thumbnails after the search ended (#35).
  'page.loading': 'Loading pictures…',
  'nav.previous': '◀',
  'nav.next': '▶',
  'nav.previousLabel': 'Previous page',
  'nav.nextLabel': 'Next page',
  'insert.running': 'Adding to your note…',
  'error.offline': 'No internet. Showing your library.',
  'error.sourceDown':
    'A picture source did not answer. Try again later for more pictures.',
  'error.permission.internet':
    'Ink2Pic needs Network Access to search pictures.',
  'error.permission.files':
    'Ink2Pic needs Read Files and Modify Files to save pictures to your library.',
  'error.permission.settings':
    'To allow it, open Settings > Apps > Plugins > Ink2Pic > Permissions.',
  'error.recognition': 'Could not read the word. Type it instead.',
  'onboarding.1': 'Write a word in your note.',
  'onboarding.2': 'Circle it with the lasso.',
  'onboarding.3':
    'Tap ••• on the lasso toolbar, then Insert picture, or Find picture to choose one.',
  'onboarding.undo': 'A wrong picture stays lassoed: tap Delete.',
  'onboarding.start': 'Start',
  // Outside the brief's table: the close button of the plugin view (#3).
  'action.close': 'Close',
  // Outside the brief's table: the search button and the call log (owner's logging rule, #13).
  'action.search': 'Search',
  'action.log': 'Log',
  // The fixed line above the log (#106).
  'log.about': 'Technical log for bug reports. Saved in MyStyle/Ink2Pic/logs/.',
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
  'probe.on': 'Probe on: each stroke is logged until the view closes.',
  'probe.stop': 'Stop probe',
  'probe.noStrokes':
    'No handwriting on this page yet. Write a word, then try again.',
  'probe.lassoFailed':
    'The lasso did not take the word. Open the log for the details.',
  // Outside the brief's table: the empty Library tab (#15).
  'library.empty':
    'No saved pictures yet. Insert one from a search. Change size and more in Settings > Apps > Plugins > Ink2Pic.',
  // Outside the brief's table: the empty Library tab with no network (#98).
  'library.emptyOffline':
    'No saved pictures yet. Connect to Wi-Fi, then search again.',
  // Outside the brief's table: the Library tab after an unreadable library.json (#104).
  'library.unreadableRebuilt':
    'Your Library was damaged and is rebuilt from your saved pictures.',
  'library.unreadableKept':
    'Your Library cannot be read. New pictures are not added to it until you open Ink2Pic again.',
  // The Languages screen, from the plugin's Settings entry (#68).
  'languages.title': 'Search languages',
  'languages.hint': 'The first language is tried first.',
  'languages.inUse': 'In use',
  'languages.addSection': 'Add a language',
  'languages.oneStays': 'One language always stays.',
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
  'settings.languages': 'Search languages',
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
  'settings.style.photos': 'Drawings and photos',
  'settings.style.contour': 'Outlines only',
  'settings.spacing':
    'When you lasso a whole line: space between your words',
  'settings.spacing.tight': 'Tight',
  'settings.spacing.normal': 'Normal',
  'settings.spacing.wide': 'Wide',
  'settings.sources':
    'Picture sources: tap to turn each on or off (one stays on)',
  'source.openclipart': 'Clip art',
  'source.commons': 'Wikimedia',
  'source.wikidata': 'Wikipedia',
  'source.openmoji': 'Symbols',
  'settings.dataSaver': 'Data saver: fewer and smaller pictures',
  'settings.dataSaver.off': 'Off',
  'settings.dataSaver.on': 'On',
  'settings.symbols': 'Offline symbols: {saved} of {total}',
  'settings.symbolsUnreadable':
    'Saved symbols cannot be read now. Open Settings again to retry.',
  'settings.symbolsDownload': 'Download symbols for offline use',
  'settings.symbolsQuestion':
    'Download the other {count} symbols, about {size} MB, so they work without Wi-Fi? They go to MyStyle/Ink2Pic/symbols/.',
  'settings.symbolsConfirm': 'Download',
  'settings.symbolsProgress': 'Downloading symbols: {saved} of {total}…',
  'settings.symbolsDone': 'Every symbol is saved for offline use.',
  'settings.symbolsStopped':
    'The download stopped at {saved} of {total}. Check the Wi-Fi, then download again to go on.',
  'settings.symbolsFailed':
    '{saved} of {total} symbols are saved. {failed} could not be downloaded; download again to try them once more.',
  'settings.clear': 'Empty Library tab',
  'settings.clearQuestion':
    'Remove every picture from the Library tab and clear recent searches? The picture files stay in MyStyle/Ink2Pic/library/.',
  'settings.clearConfirm': 'Empty',
  'settings.cleared':
    'The Library tab is empty. The picture files stay in MyStyle/Ink2Pic/library/.',
  'settings.clearFailed': 'Could not empty the Library tab. Try again.',
  'settings.reset': 'Reset all',
  'settings.resetQuestion': 'Reset every setting to the default?',
} as const;

export type CopyKey = keyof typeof copy;
