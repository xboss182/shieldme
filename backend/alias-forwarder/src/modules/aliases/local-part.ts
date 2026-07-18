export const LOCAL_PART_REGEX = /^[a-z0-9][a-z0-9._-]{0,62}[a-z0-9]$|^[a-z0-9]$/;

export function normalizeLocalPart(value: string) {
  return value.trim().toLowerCase();
}

export function isValidLocalPart(value: string) {
  return LOCAL_PART_REGEX.test(value);
}
