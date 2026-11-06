/**
 * The tool bar of every screen without controls of its own, with the call log shown only after
 * Log (#36).
 */
import React, {useState} from 'react';
import {LogView} from './LogView';
import {ToolBar} from './ToolBar';

export type ScreenToolsProps = {onClose: () => void};

export function ScreenTools({onClose}: ScreenToolsProps): React.JSX.Element {
  const [showLog, setShowLog] = useState(false);
  return (
    <>
      <ToolBar
        logShown={showLog}
        onLog={() => setShowLog(!showLog)}
        onClose={onClose}
      />
      {showLog && <LogView />}
    </>
  );
}
