/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import App from './App';
import {name as appName} from './app.json';
import {
  BUTTON_TYPE_LASSO,
  BUTTON_TYPE_SIDEBAR,
  EDIT_DATA_STROKES,
  INSERT_BUTTON_ID,
  LASSO_BUTTON_ID,
  SHOW_FULL_VIEW,
  SHOW_NO_VIEW,
  SIDEBAR_BUTTON_ID,
} from './src/buttons';
import {insertWithoutView} from './src/flow/headlessInsert';
import {
  initPlugin,
  registerButton,
  registerConfigButton,
  startButtonQueue,
  startConfigQueue,
  startLangListener,
} from './src/sdk/buttons';
import {showPluginView} from './src/sdk/plugin';
import {copy} from './src/ui/copy';
import {log, logged, setAfterCall} from './src/log/memory';
import {flushLogFile, openLogFile} from './src/storage/logFile';
import {logsDir} from './src/storage/paths';
import {catchCrashes} from './src/flow/crash';

// First: any later error leaves a trace on the page and in crash.log, and the log reaches its
// file from the start, flushed after every call and before a call that can close the plugin, so
// a plugin the host closes leaves its last line in MyStyle/Ink2Pic/logs/session.log (#13, #45).
catchCrashes();
openLogFile(logsDir());
setAfterCall(flushLogFile);

AppRegistry.registerComponent(appName, () => App);

/** A failed registration leaves no button, so it is always reported. */
function report(what, result) {
  // Into the view's log too, so a failed or slow registration shows on screen (#13, build 8).
  log(
    result.ok
      ? `${what}: ok`
      : `${what} failed: ${result.code} ${result.message}`,
  );
  if (!result.ok) {
    console.error(`Ink2Pic: ${what} failed: ${result.code} ${result.message}`);
  }
}

report('init', initPlugin());

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: SIDEBAR_BUTTON_ID,
  name: copy['button.sidebar'],
  icon,
  showType: SHOW_FULL_VIEW,
}).then(result => report('sidebar button', result));

// Before Find picture: the host gives no position field, so the order may set the menu's (#74).
// No view: the person stays on the note; a failure opens the view (#74, TO TEST).
registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: INSERT_BUTTON_ID,
  name: copy['button.insert'],
  icon: Image.resolveAssetSource(require('./assets/insert.png')).uri,
  editDataTypes: [EDIT_DATA_STROKES],
  showType: SHOW_NO_VIEW,
}).then(result => report('insert button', result));

registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: LASSO_BUTTON_ID,
  name: copy['button.lasso'],
  icon,
  editDataTypes: [EDIT_DATA_STROKES],
  showType: SHOW_FULL_VIEW,
}).then(result => report('lasso button', result));

// After registerButton, as the official docs order it; before the view exists (gotcha 11).
// «Insert picture» runs here, with no view (#74); every other press goes to the view.
report(
  'button listener',
  startButtonQueue(id => {
    if (id !== INSERT_BUTTON_ID) {
      return false;
    }
    log('insert button pressed: no view');
    insertWithoutView();
    return true;
  }),
);

// The plugin's own Settings entry opens the Languages screen (#68): registered first, then its
// listener, as the official docs order it. A click queues like a press and shows the view, which
// may be closed; the host keeps the last config event only 1000 ms.
registerConfigButton().then(result => report('config button', result));
report(
  'config listener',
  startConfigQueue(() => {
    log('config button clicked');
    logged('showPluginView', showPluginView);
  }),
);

// The system language, for the default query languages; there is no getter (#68, TO TEST).
report(
  'language listener',
  startLangListener(msg => log(`system language: ${JSON.stringify(msg)}`)),
);
