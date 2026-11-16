/** The previous prefix is retained only here to migrate existing browser data. */
export const LEGACY_NAMESPACE = 'calbud';
export const STORAGE_NAMESPACE = 'littletab';

export function migrateStorage(storage: Storage): void {
  const keys = Array.from({length: storage.length}, (_, index) => storage.key(index))
    .filter((key): key is string => Boolean(key?.startsWith(`${LEGACY_NAMESPACE}-`)));
  for (const oldKey of keys) {
    const value = storage.getItem(oldKey);
    if (value === null) continue;
    const newKey = `${STORAGE_NAMESPACE}${oldKey.slice(LEGACY_NAMESPACE.length)}`;
    // Never overwrite newer preferences, and only remove the old copy after saving.
    if (storage.getItem(newKey) === null) storage.setItem(newKey, value);
    storage.removeItem(oldKey);
  }
}

export function upgradeBrowserStorage(): void {
  for (const getStorage of [() => localStorage, () => sessionStorage]) {
    try { migrateStorage(getStorage()); } catch { /* Keep the old data if storage is blocked/full. */ }
  }
}
