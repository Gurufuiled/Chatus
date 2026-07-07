/**
 * HTTP fetch for native builds. Uses Expo's URLSession-backed fetch instead of
 * RN's default networking stack, which can hang on some iOS Release builds.
 */
import { fetch as expoFetch } from 'expo/fetch';

export function httpFetch(input: string, init?: RequestInit): Promise<Response> {
  return expoFetch(input, init) as unknown as Promise<Response>;
}
