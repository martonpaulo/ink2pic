/**
 * Every user-facing string (brief section 8.10). English only.
 */
export const copy = {
  'button.lasso': 'Find picture',
  'button.sidebar': 'Ink2Pic',
  'action.close': 'Close',
} as const;

export type CopyKey = keyof typeof copy;
