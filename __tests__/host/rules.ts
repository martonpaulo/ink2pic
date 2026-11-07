/**
 * The PluginHost rules the simulator encodes (#78). Each names its source and keeps the tag the
 * brief gives it (docs/brief.md, «Keep its tags»): an INFERENCE or TO TEST rule is the simulator's
 * best guess, never a fact, and the device check still decides.
 *
 * `__tests__/pluginHost.test.ts` holds one test per rule, named by its id.
 */
export type RuleTag = 'CONFIRMED' | 'REPORTED' | 'INFERENCE' | 'TO TEST';

export type HostRule = {rule: string; source: string; tag: RuleTag};

export const RULES = {
  replay: {
    rule: 'The SDK replays the last button, config and life message to a listener added within 1000 ms of it, once',
    source:
      'sn-plugin-lib 0.2.3 src/PluginManager.ts (setTimeout 1000); docs/research/2026-11-pluginhost-sdk.md (d)',
    tag: 'CONFIRMED',
  },
  beforeInit: {
    rule: 'An event the host sends before PluginManager.init() runs is lost',
    source:
      'sn-plugin-lib 0.2.3 src/PluginManager.ts (registerListener in init); docs/research/2026-11-pluginhost-sdk.md (d)',
    tag: 'CONFIRMED',
  },
  mounted: {
    rule: 'Lifecycle 1 comes from the SDK reporting mounted in init()',
    source: 'docs/brief.md section 10.5 (host code)',
    tag: 'CONFIRMED',
  },
  pressPair: {
    rule: 'A press sends plugin_button_event, then lifecycle 2, as a pair, in that order',
    source: 'docs/brief.md section 10.5 (host code)',
    tag: 'CONFIRMED',
  },
  silentHide: {
    rule: 'A hide because the Note app paused or the file changed sends no lifecycle event',
    source: 'docs/brief.md section 10.5 (host code)',
    tag: 'CONFIRMED',
  },
  lassoEnds: {
    rule: 'The lasso context ends when the person leaves the page, as a silent hide does',
    source:
      'docs/brief.md section 4.8 (apclark31); docs/device-tests.md build 0.1.0 (12): the lasso was gone after Settings',
    tag: 'REPORTED',
  },
  permissionOnHide: {
    rule: 'A pending requestPermission answers -1 when the view hides or the plugin is destroyed; one made while hidden waits for the next press or show',
    source: 'docs/brief.md section 10.5 (host code)',
    tag: 'CONFIRMED',
  },
  allowOnce: {
    rule: 'Allow once (1) ends when the plugin closes; hasPermission may answer 2 as well as 1',
    source:
      'docs/brief.md section 3.6 (official docs); section 10.5 (#34, sn-plugin-lib source)',
    tag: 'CONFIRMED',
  },
  closeView: {
    rule: 'closePluginView answers true at once; the view hides and lifecycle 3 follows after the answer',
    source: 'docs/research/2026-11-pluginhost-sdk.md (d), PluginModule.java',
    tag: 'CONFIRMED',
  },
  insertImage: {
    rule: 'insertImage ignores the lasso: the picture is centred on the screen as a floating selection, 100 to 2560 px per side',
    source: 'docs/brief.md section 10.5 (host code)',
    tag: 'CONFIRMED',
  },
  insertImageFile: {
    rule: 'insertImage needs an existing png, jpg or jpeg file; another path answers {success: true, result: false}',
    source:
      'docs.supernote.com insertImage (file rule); #47 (the result-false shape); the answer for a bad file is not documented',
    tag: 'INFERENCE',
  },
  placeAtRect: {
    rule: 'createElement(200) plus insertPageElements places the picture at picture.rect, in Android pixels, with no clamping to the page',
    source: 'docs/brief.md section 10.5 (host code)',
    tag: 'CONFIRMED',
  },
  insertParams: {
    rule: 'insertPageElements throws on an element list that is not an array, a page below 0 or a layer outside 0 to 3',
    source: 'docs.supernote.com insertPageElements («Throws»)',
    tag: 'CONFIRMED',
  },
  lassoInPage: {
    rule: 'lassoElements(rect) needs a rect within the page size; it lassoes the elements inside the rect',
    source: 'docs.supernote.com lassoElements; brief section 4.5',
    tag: 'CONFIRMED',
  },
  lassoAnswers: {
    rule: 'lassoElements answers false when no element is inside the rect; a rect past the page fails with code 904',
    source: 'none: neither answer is documented',
    tag: 'INFERENCE',
  },
  lassoSurvivesClose: {
    rule: 'The lasso made by lassoElements survives closePluginView',
    source: 'docs/brief.md section 10.5, #73',
    tag: 'TO TEST',
  },
  noLasso: {
    rule: 'getLassoElements and getLassoRect fail outside a lasso; the simulator answers 904',
    source:
      'docs.supernote.com getLassoElements («otherwise the call fails»); 904 is deleteLassoElements outside lasso context (brief section 4.8, apclark31)',
    tag: 'INFERENCE',
  },
  lassoUuids: {
    rule: 'getLassoElements and getElements give different uuids for one element; numInPage matches them',
    source: 'docs/brief.md section 4.8 (apclark31)',
    tag: 'REPORTED',
  },
  recognizeSize: {
    rule: 'recognizeElements with a size other than the page size fails 117 «Recognition failed. Please try again!»',
    source: 'docs/device-tests.md build 0.1.0 (1) and (3)',
    tag: 'CONFIRMED',
  },
  pageSizeRead: {
    rule: 'getPageSize before FILE:READ is granted fails 1503 «File read permission has not been requested»',
    source: 'docs/device-tests.md build 0.1.0 (2)',
    tag: 'CONFIRMED',
  },
  sharedDelete: {
    rule: 'Replacing, renaming over or deleting a file in shared storage counts as a delete and needs FILE:DELETE: «SecurityException: no DELETE permission»',
    source: 'docs/device-tests.md build 0.1.0 (13), #62',
    tag: 'CONFIRMED',
  },
  sharedInPlace: {
    rule: 'Writing a shared file in place needs only FILE:WRITE; every save passes',
    source: 'docs/device-tests.md build 0.1.0 (14), #62',
    tag: 'CONFIRMED',
  },
  sharedNeedsPermission: {
    rule: 'Reading shared storage needs FILE:READ and writing it FILE:WRITE; the simulator words the refusal like the DELETE one',
    source:
      'docs/brief.md section 3.6 (official docs); the refusal text is a guess',
    tag: 'INFERENCE',
  },
  activityNull: {
    rule: 'A FileUtils call that needs the activity throws in the host and destroys the plugin: lifecycle 4 then 5, never 3, and the call never answers',
    source: 'docs/brief.md section 10.5 (host code, build 0.1.0 (9))',
    tag: 'CONFIRMED',
  },
  internet: {
    rule: 'Without INTERNET or without a network, a request fails with «Network request failed»',
    source:
      'docs/brief.md section 3.6 and docs/research/2026-11-pluginhost-sdk.md (INTERNET on every socket); the message is the React Native one',
    tag: 'INFERENCE',
  },
  apiResponse: {
    rule: 'Every PluginCommAPI, PluginNoteAPI and PluginFileAPI call answers {success, result, error}; error is {code, message}',
    source: 'sn-plugin-lib 0.2.3 src/response/APIResponse.ts; docs.supernote.com APIResponse',
    tag: 'CONFIRMED',
  },
} as const satisfies Record<string, HostRule>;

export type RuleId = keyof typeof RULES;
