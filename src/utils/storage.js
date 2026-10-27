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
    getStorage()?.setItem(key, JSON.stringify(value));
    return true;
  } catch (error) {
    console.warn(`Kaizen localStorage write failed for ${key}`, error);
    return false;
  }
}

function getStorage() {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}
