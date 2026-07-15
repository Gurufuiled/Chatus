/**
 * Scrub PII from client remote-log payloads.
 * Keep Telegram api_id (JSON "apiId" / "api_id") — OTP scrubber would otherwise wipe it.
 */

export function sanitizeClientLogText(text: string): string {
  const apiIdSlots: string[] = [];
  const withApiIdHeld = text.replace(
    /("api_?[Ii]d"\s*:\s*)(\d{3,12})\b/g,
    (_m, prefix: string, id: string) => {
      const slot = apiIdSlots.length;
      apiIdSlots.push(id);
      return `${prefix}__API_ID_${slot}__`;
    },
  );
  let out = withApiIdHeld
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, '[phone]')
    .replace(/\b\d{4,8}\b/g, '[code]')
    .replace(/api[_-]?hash["'\s:=]+[a-f0-9]{8,}/gi, 'api_hash=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .slice(0, 2000);
  for (let i = 0; i < apiIdSlots.length; i += 1) {
    out = out.replace(`__API_ID_${i}__`, apiIdSlots[i]!);
  }
  return out;
}
