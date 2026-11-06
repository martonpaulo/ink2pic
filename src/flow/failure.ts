/**
 * The one mapping from a failure to the sentence the person reads (#37): it names the cause and
 * the next step, never a code. The technical detail stays in the log (`logged` writes it).
 */
import {TIMEOUT_CODE} from '../log/memory';
import type {Failure} from '../sdk/result';
import type {SearchOutcome} from '../search/search';
import {copy, CopyKey} from '../ui/copy';

/** Where a failure happened: reading the lasso, getting the picture, or putting it in the note. */
export type Step = 'lasso' | 'download' | 'place';
export type StepFailure = Failure & {step: Step};
/** A flow's answer: the value, or the failure with the step it happened at. */
export type Done<T> = {ok: true; value: T} | StepFailure;

export function atStep(step: Step, failure: Failure): StepFailure {
  return {...failure, step};
}

/** sn-plugin-lib's code for a missing file permission (brief section 10.5). */
export const FILE_PERMISSION_CODE = 1503;
/** The lasso holds no handwriting; SDK codes are positive, module codes -2, timeouts -3. */
export const EMPTY_LASSO_CODE = -4;

/** Android's answer to a socket opened without the INTERNET permission. */
const NO_INTERNET_PERMISSION = /socket failed: EACCES/i;
const NO_FILE_ACCESS = /EACCES|Permission denied/i;
const STORAGE =
  /ENOSPC|No space left|EROFS|Read-only file system|cannot create folder|cannot rename|cannot replace/i;
const NO_INTERNET =
  /UnknownHost|Unable to resolve host|SocketTimeout|ConnectException|NoRouteToHost|SocketException|SSL/i;
/** The plugin's file module rejects a download that is not HTTP 200 with `HTTP_<status>`. */
const HTTP_STATUS = /^HTTP_\d+/;

const MISSING_FILES: readonly CopyKey[] = [
  'error.permission.files',
  'error.permission.settings',
];
const MISSING_INTERNET: readonly CopyKey[] = [
  'error.permission.internet',
  'error.permission.settings',
];

function downloadKeys({code, message}: Failure): readonly CopyKey[] {
  if (NO_INTERNET_PERMISSION.test(message)) {
    return MISSING_INTERNET;
  }
  if (NO_FILE_ACCESS.test(message)) {
    return MISSING_FILES;
  }
  if (STORAGE.test(message)) {
    return ['error.save'];
  }
  if (code === TIMEOUT_CODE || NO_INTERNET.test(message)) {
    return ['error.downloadOffline'];
  }
  if (HTTP_STATUS.test(message)) {
    return ['error.download'];
  }
  return ['error.unexpected'];
}

/** The copy keys of the sentence for a failure, in order. */
export function failureKeys(failure: StepFailure): readonly CopyKey[] {
  if (failure.code === FILE_PERMISSION_CODE) {
    return MISSING_FILES;
  }
  switch (failure.step) {
    case 'lasso':
      return [
        failure.code === EMPTY_LASSO_CODE
          ? 'error.emptyLasso'
          : 'error.recognition',
      ];
    case 'download':
      return downloadKeys(failure);
    case 'place':
      return ['error.place'];
  }
}

export function failureText(failure: StepFailure): string {
  return failureKeys(failure)
    .map(key => copy[key])
    .join(' ');
}

/** Failure kinds that mean the device has no network, not that one source is down. */
const OFFLINE_KINDS = new Set(['network', 'timeout']);

export function isOffline(outcome: SearchOutcome): boolean {
  return (
    outcome.allFailed &&
    Object.values(outcome.statuses).every(
      status => status.state === 'failed' && OFFLINE_KINDS.has(status.kind),
    )
  );
}

/** What a finished search says, or null when its results speak for themselves. */
export function searchNotice(outcome: SearchOutcome): CopyKey | null {
  if (isOffline(outcome)) {
    return 'error.offline';
  }
  if (outcome.allFailed) {
    return 'error.sourcesDown';
  }
  if (outcome.results.length > 0) {
    return null;
  }
  return outcome.sourceDown ? 'error.sourceDown' : 'search.empty';
}
