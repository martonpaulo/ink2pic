/** Plugin button ids, shared by the registration in index.js and the view. */
export const SIDEBAR_BUTTON_ID = 100;
export const LASSO_BUTTON_ID = 200;
/** «Insert picture»: the best result at once, no grid (#74). */
export const INSERT_BUTTON_ID = 300;

/** `registerButton` types (brief section 4.1). */
export const BUTTON_TYPE_SIDEBAR = 1;
export const BUTTON_TYPE_LASSO = 2;

/** `editDataTypes` value for handwritten strokes. */
export const EDIT_DATA_STROKES = 0;

/** `showType` value for a full-screen React Native view. */
export const SHOW_FULL_VIEW = 1;
/** `showType` value for no plugin view (official docs, «PluginButton»): «Insert picture» (#74). */
export const SHOW_NO_VIEW = 0;
/** Not a registered button: the view opened to show a failed «Insert picture» sentence (#74). */
export const INSERT_NOTE_ID = 901;

/**
 * The plugin's Settings entry (#68): not a registered button, but its click goes through the same
 * opening controller as a press, so a pending click and the host's replay behave the same.
 */
export const CONFIG_BUTTON_ID = 900;
