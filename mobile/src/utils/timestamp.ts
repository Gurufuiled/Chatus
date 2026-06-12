/**
 * Normalizes seconds-based timestamps (usually < 10000000000) to millisecond-based timestamps.
 * If the value is a string, parses it. If it is null or undefined, returns null.
 */
export function normalizeTimestamp(ts: number | string | null | undefined): number | null {
  if (ts == null) return null;
  let parsed: number;
  if (typeof ts === 'string') {
    parsed = new Date(ts).getTime();
  } else {
    parsed = ts;
  }
  if (isNaN(parsed)) {
    return null;
  }
  // If the parsed timestamp is in seconds (less than 10 billion, which corresponds to Nov 2286), scale to milliseconds.
  if (parsed < 10000000000) {
    return parsed * 1000;
  }
  return parsed;
}

export function normalizeTimestampRequired(ts: number | string | null | undefined, fallback = Date.now()): number {
  const val = normalizeTimestamp(ts);
  return val == null ? fallback : val;
}
