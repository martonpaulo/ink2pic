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
  LASSO_BUTTON_ID,
  SHOW_FULL_VIEW,
  SIDEBAR_BUTTON_ID,
} from './src/buttons';
import {initPlugin, registerButton, startButtonQueue} from './src/sdk/buttons';
import {copy} from './src/ui/copy';
import {log, setAfterCall} from './src/log/memory';
import {flushLogFile, openLogFile} from './src/log/file';
import {SHARED_ROOT} from './src/flow/session';
import {logsDir} from './src/storage/paths';
import {catchCrashes} from './src/flow/crash';

// First: any later error leaves a trace on the page and in crash.log, and the log reaches its
// file from the start, flushed around every call, so a plugin the host closes leaves its last
// line in MyStyle/Ink2Pic/logs/session.log (#13, build 0.1.0 (9)).
catchCrashes();
openLogFile(logsDir(SHARED_ROOT));
setAfterCall(() => {
  flushLogFile();
});

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

registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: LASSO_BUTTON_ID,
  name: copy['button.lasso'],
  icon,
  editDataTypes: [EDIT_DATA_STROKES],
  showType: SHOW_FULL_VIEW,
}).then(result => report('lasso button', result));

// After registerButton, as the official docs order it; before the view exists (gotcha 11).
report('button listener', startButtonQueue());
