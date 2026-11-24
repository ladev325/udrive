import { formatBytes } from './formatters';
import { interpolate } from './i18n';

// Limits from /api/storage, so messages can say "max 500 MB". Set by the app when storage loads.
let limits = { maxFileSize: 0, quota: 0 };
export function setDriveLimits(next) {
  limits = { ...limits, ...next };
}

const keyByCode = {
  FILE_TOO_LARGE: 'fileTooLarge',
  QUOTA_EXCEEDED: 'quotaExceeded',
  NAME_TAKEN: 'nameTaken',
  INVALID_NAME: 'invalidName',
  MOVE_INTO_ITSELF: 'moveIntoItself',
  NOT_FOUND: 'notFound',
};

// Turns an ApiError from the drive API into a translated message.
export function driveErrorMessage(t, error) {
  if (error?.code === 'NETWORK_ERROR') return t.auth.networkError;
  const key = keyByCode[error?.code];
  if (!key) return t.auth.genericError;
  return interpolate(t.drive[key], {
    max: formatBytes(limits.maxFileSize, 0),
    quota: formatBytes(limits.quota, 0),
  });
}
