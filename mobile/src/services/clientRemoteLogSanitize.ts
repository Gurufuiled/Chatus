/** Remove credentials and obvious personal data before diagnostics leave the device. */
export function sanitizeClientLogText(text: string): string {
  return text
    .replace(/\+?\d[\d\s\-()]{8,}\d/g, '[phone]')
    .replace(/\b\d{4,8}\b/g, '[code]')
    .replace(/api[_-]?hash["'\s:=]+[a-f0-9]{8,}/gi, 'api_hash=[redacted]')
    .replace(/Bearer\s+[A-Za-z0-9._\-]+/gi, 'Bearer [redacted]')
    .slice(0, 2000);
}
