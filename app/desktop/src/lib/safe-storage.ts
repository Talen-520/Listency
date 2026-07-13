export function safeGetLocalStorageItem(key: string) {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return null;
    }
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function safeSetLocalStorageItem(key: string, value: string) {
  try {
    if (typeof window === "undefined" || !window.localStorage) {
      return;
    }
    window.localStorage.setItem(key, value);
  } catch {
    // Storage can be unavailable in some packaged WebView states. Ignore and keep runtime state.
  }
}
