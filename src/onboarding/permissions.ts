/** The grouped permission step of the first real use (brief section 8.7). */
import {
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_INTERNET,
  requestPermission,
} from '../sdk/plugin';
import {copy} from '../ui/copy';
import {logged} from '../log/memory';

/** `requestPermission` answers that grant: allowed this time (1) or always (2). */
const GRANTING_ANSWERS = new Set([1, 2]);

export type PermissionNeed = {permission: string; reason: string};

export const PERMISSIONS: readonly PermissionNeed[] = [
  {permission: PERMISSION_INTERNET, reason: copy['error.permission.internet']},
  {permission: PERMISSION_FILE_READ, reason: copy['error.permission.files']},
  {permission: PERMISSION_FILE_WRITE, reason: copy['error.permission.files']},
];

export type Denied = PermissionNeed & {detail: string};

/**
 * Permissions the host reports as not granted. Each check is logged with a time limit; a check
 * that fails or times out is logged and not counted, so a stuck check never blocks the plugin
 * (build 0.1.0 (6) stayed on its starting screen); the real call then shows its own error.
 */
export async function missingPermissions(): Promise<PermissionNeed[]> {
  const missing: PermissionNeed[] = [];
  for (const need of PERMISSIONS) {
    const check = await logged(`hasPermission(${need.permission})`, () =>
      hasPermission(need.permission),
    );
    if (check.ok && !check.value) {
      missing.push(need);
    }
  }
  return missing;
}

/** Shown-once signal until the file writer (#11) can store a flag. */
export async function needsOnboarding(): Promise<boolean> {
  return (await missingPermissions()).length > 0;
}

/**
 * Asks the host again after a request: on build 0.1.0 (10), «Always Allow» was granted but its
 * answer was not 1 or 2, and the plugin said the permission was missing (#13).
 */
async function grantedNow(need: PermissionNeed): Promise<boolean> {
  const check = await logged(`hasPermission(${need.permission}) again`, () =>
    hasPermission(need.permission),
  );
  return check.ok && check.value;
}

/** Requests every missing permission in turn and reports what stays denied. */
export async function requestMissing(): Promise<{
  granted: PermissionNeed[];
  denied: Denied[];
}> {
  const granted: PermissionNeed[] = [];
  const denied: Denied[] = [];
  for (const need of await missingPermissions()) {
    const answer = await logged(`requestPermission(${need.permission})`, () =>
      requestPermission(need.permission, need.reason),
    );
    if (
      (answer.ok && GRANTING_ANSWERS.has(answer.value)) ||
      (await grantedNow(need))
    ) {
      granted.push(need);
    } else {
      denied.push({
        ...need,
        detail: answer.ok
          ? `answer ${answer.value}`
          : `error ${answer.code}: ${answer.message}`,
      });
    }
  }
  return {granted, denied};
}
