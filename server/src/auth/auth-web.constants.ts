/** Must match web/src/auth/webSessionStorage.ts CHATUS_WEB_SESSION_KEY */
export const CHATUS_WEB_SESSION_KEY = 'chatus_web_session';

export const CHATUS_OAUTH_STATE_COOKIE = 'chatus_oauth_state';

export function readRequestCookie(
  req: { headers?: { cookie?: string } },
  name: string,
): string | undefined {
  const header = req.headers?.cookie;
  if (!header) return undefined;
  const parts = header.split(';');
  for (const part of parts) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (rawKey === name) {
      try {
        return decodeURIComponent(rest.join('='));
      } catch {
        return rest.join('=');
      }
    }
  }
  return undefined;
}

export function appendOAuthStateCookie(
  res: { append?: (name: string, value: string) => void; setHeader: (name: string, value: string) => void },
  state: string,
): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const value = `chatus_oauth_state=${encodeURIComponent(state)}; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=600${secure}`;
  if (typeof res.append === 'function') {
    res.append('Set-Cookie', value);
    return;
  }
  res.setHeader('Set-Cookie', value);
}

export function clearOAuthStateCookie(
  res: { append?: (name: string, value: string) => void; setHeader: (name: string, value: string) => void },
): void {
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  const value = `chatus_oauth_state=; Path=/api/auth; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
  if (typeof res.append === 'function') {
    res.append('Set-Cookie', value);
    return;
  }
  res.setHeader('Set-Cookie', value);
}
