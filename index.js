/**
 * @format
 */

import {AppRegistry, Image} from 'react-native';
import {PluginManager} from 'sn-plugin-lib';
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
import {copy} from './src/ui/copy';

AppRegistry.registerComponent(appName, () => App);

PluginManager.init();

const icon = Image.resolveAssetSource(require('./assets/icon.png')).uri;

PluginManager.registerButton(BUTTON_TYPE_SIDEBAR, ['NOTE'], {
  id: SIDEBAR_BUTTON_ID,
  name: copy['button.sidebar'],
  icon,
  showType: SHOW_FULL_VIEW,
});

PluginManager.registerButton(BUTTON_TYPE_LASSO, ['NOTE'], {
  id: LASSO_BUTTON_ID,
  name: copy['button.lasso'],
  icon,
  editDataTypes: [EDIT_DATA_STROKES],
  showType: SHOW_FULL_VIEW,
});
