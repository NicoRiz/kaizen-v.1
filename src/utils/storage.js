export function readStorage(key, fallback) {
  try {
    const storage = getStorage();
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function writeStorage(key, value) {
  try {
    const storage = getStorage();
    const serialized = JSON.stringify(value);
    if (storage?.getItem(key) !== serialized) storage?.setItem(key, serialized);
    return true;
  } catch (error) {
    console.warn(`Kaizen localStorage write failed for ${key}`, error);
    return false;
  }
}

// A quota failure must not leave half a user edit saved. This protects against
// synchronous failures, not a browser/process crash between localStorage keys.
export function writeStorageBatch(entries, storage = getStorage()) {
  if (!storage) return false;
  const changed = entries.map(([key, value]) => [key, JSON.stringify(value), storage.getItem(key)])
    .filter(([, value, previous]) => value !== previous);
  const written = [];
  try {
    for (const [key, value, previous] of changed) {
      storage.setItem(key, value);
      written.push([key, previous]);
    }
    return true;
  } catch {
    // Remove the growing values first, so the original smaller dataset fits.
    for (const [key] of written) storage.removeItem(key);
    for (const [key, previous] of written) if (previous !== null) storage.setItem(key, previous);
    return false;
  }
}

function getStorage() {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}
