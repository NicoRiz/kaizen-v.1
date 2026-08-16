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
  getStorage()?.setItem(key, JSON.stringify(value));
}

function getStorage() {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}
