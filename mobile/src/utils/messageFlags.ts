/** API / WS / SQLite may send booleans, 0/1, or strings — UI checks `=== 1` only. */
export function normalizeMessageFlag(value: unknown): 0 | 1 {
  if (value === true || value === 1) return 1;
  if (typeof value === 'string') {
    const s = value.trim().toLowerCase();
    if (s === '1' || s === 'true' || s === 'yes') return 1;
  }
  return 0;
}
