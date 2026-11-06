/** The grouped permission step of the first real use (brief section 8.7). */
import {
  hasPermission,
  PERMISSION_FILE_READ,
  PERMISSION_FILE_WRITE,
  PERMISSION_INTERNET,
  requestPermission,
} from '../sdk/plugin';
import {copy} from '../ui/copy';

/** `requestPermission` answers that grant: allowed this time (1) or always (2). */
const GRANTING_ANSWERS = new Set([1, 2]);

export type PermissionNeed = {permission: string; reason: string};

export const PERMISSIONS: readonly PermissionNeed[] = [
  {permission: PERMISSION_INTERNET, reason: copy['error.permission.internet']},
  {permission: PERMISSION_FILE_READ, reason: copy['error.permission.files']},
  {permission: PERMISSION_FILE_WRITE, reason: copy['error.permission.files']},
];

export type Denied = PermissionNeed & {detail: string};

/** Permissions not reported granted; a failed check counts as missing. */
export async function missingPermissions(): Promise<PermissionNeed[]> {
  const checks = await Promise.all(
    PERMISSIONS.map(need => hasPermission(need.permission)),
  );
  return PERMISSIONS.filter((_, i) => {
    const check = checks[i];
    return !(check.ok && check.value);
  });
}

/** Shown-once signal until the file writer (#11) can store a flag. */
export async function needsOnboarding(): Promise<boolean> {
  return (await missingPermissions()).length > 0;
}

/** Requests every missing permission in turn and reports what stays denied. */
export async function requestMissing(): Promise<{
  granted: PermissionNeed[];
  denied: Denied[];
}> {
  const granted: PermissionNeed[] = [];
  const denied: Denied[] = [];
  for (const need of await missingPermissions()) {
    const answer = await requestPermission(need.permission, need.reason);
    if (answer.ok && GRANTING_ANSWERS.has(answer.value)) {
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
