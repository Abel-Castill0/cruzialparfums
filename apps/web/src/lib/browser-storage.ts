/** True only if sessionStorage can actually be written to and read back —
 * not just "exists". Some browsers/extensions/enterprise configs expose the
 * API but throw (or silently no-op) on every call (locked-down privacy
 * modes, storage-blocking extensions, some in-app webviews). Checkout flows
 * use this to know whether their pending-attempt id can actually survive a
 * reload, so they can warn honestly instead of silently claiming a
 * duplicate-prevention guarantee they cannot keep. */
export function isSessionStorageAvailable(): boolean {
  const probeKey = "__cruzial_storage_probe__";
  try {
    sessionStorage.setItem(probeKey, "1");
    const readBack = sessionStorage.getItem(probeKey) === "1";
    sessionStorage.removeItem(probeKey);
    return readBack;
  } catch {
    return false;
  }
}
