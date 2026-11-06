/**
 * The one mapping from a failure to the sentence the person reads (#37): it names the cause and
 * the next step, never a code. The technical detail stays in the log (`logged` writes it).
 * It reads typed codes; only the text of an Android OS error is matched (#49).
 */
import {logged} from '../log/memory';
import {hasPermission, PERMISSION_INTERNET} from '../sdk/plugin';
import {EMPTY_LASSO_CODE, Failure, TIMEOUT_CODE} from '../sdk/result';
import type {SearchOutcome} from '../search/search';
import type {FilesErrorCode} from '../storage/files';
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

/** The module's code for an error Android raised; its text is the only cause it carries. */
const OS_ERROR: FilesErrorCode = 'IO';

/**
 * Android's answer to a socket or a host lookup without the INTERNET permission; checked before
 * the file-access text, which also says EACCES (review before build 0.1.0 (11)).
 */
const NO_INTERNET_PERMISSION = /(socket|getaddrinfo) failed: EACCES/i;
const NO_FILE_ACCESS = /EACCES|Permission denied/i;
const STORAGE =
  /ENOSPC|No space left|EROFS|Read-only file system|cannot create folder|cannot rename|cannot replace/i;
const NO_INTERNET =
  /UnknownHost|Unable to resolve host|SocketTimeout|ConnectException|NoRouteToHost|SocketException|SSL/i;

const MISSING_FILES: readonly CopyKey[] = [
  'error.permission.files',
  'error.permission.settings',
];
const MISSING_INTERNET: readonly CopyKey[] = [
  'error.permission.internet',
  'error.permission.settings',
];

/** The keys for an Android OS error, from its text; null when the text names no known cause. */
function osErrorKeys(message: string): readonly CopyKey[] | null {
  if (NO_INTERNET_PERMISSION.test(message)) {
    return MISSING_INTERNET;
  }
  if (NO_FILE_ACCESS.test(message)) {
    return MISSING_FILES;
  }
  if (STORAGE.test(message)) {
    return ['error.save'];
  }
  if (NO_INTERNET.test(message)) {
    return ['error.downloadOffline'];
  }
  return null;
}

/**
 * Any other download failure (an HTTP status, TOO_LARGE, NOT_IMAGE, a module that did not load)
 * belongs to this picture: another one may work.
 */
function downloadKeys({code, message, moduleCode}: Failure): readonly CopyKey[] {
  if (code === TIMEOUT_CODE) {
    return ['error.downloadOffline'];
  }
  const fromOs = moduleCode === OS_ERROR ? osErrorKeys(message) : null;
  return fromOs ?? ['error.download'];
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
      // The host may still insert it after a TIMEOUT: «try again» could add a second copy (#33).
      return [
        failure.code === TIMEOUT_CODE ? 'error.placeSlow' : 'error.place',
      ];
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

/**
 * The sentence for a search that found no network: a missing INTERNET permission fails the same
 * way as no network, so the host is asked which one it is (review before build 0.1.0 (11)).
 */
export async function offlineText(): Promise<string> {
  const allowed = await logged(`hasPermission(${PERMISSION_INTERNET})`, () =>
    hasPermission(PERMISSION_INTERNET),
  );
  const keys: readonly CopyKey[] =
    allowed.ok && !allowed.value ? MISSING_INTERNET : ['error.offline'];
  return keys.map(key => copy[key]).join(' ');
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
  // ResultsGrid itself says when one source is down.
  return 'search.empty';
}
