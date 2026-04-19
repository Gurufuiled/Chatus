/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Дублируем EXPO_PUBLIC_* в expo.extra: при сборке release иногда не инлайнится
 * process.env.* в Hermes, из‑за чего остаётся localhost и на части девайсов
 * подставляется 10.0.2.2 (эмулятор).
 */
const fs = require('fs');
const path = require('path');

function loadDotEnv(filePath) {
  const out = {};
  if (!fs.existsSync(filePath)) return out;
  const raw = fs.readFileSync(filePath, 'utf8');
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let val = trimmed.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** @type {{ expo: Record<string, unknown> }} */
const appJson = require('./app.json');

const envPath = path.join(__dirname, '.env');
const envProductionPath = path.join(__dirname, '.env.production');

let envFile = loadDotEnv(envPath);
if (process.env.MOBILE_ENV === 'production' && fs.existsSync(envProductionPath)) {
  envFile = { ...envFile, ...loadDotEnv(envProductionPath) };
}

function env(key) {
  return envFile[key] || process.env[key];
}

module.exports = {
  expo: {
    ...appJson.expo,
    extra: {
      EXPO_PUBLIC_API_URL: env('EXPO_PUBLIC_API_URL'),
      EXPO_PUBLIC_USE_EMULATOR: env('EXPO_PUBLIC_USE_EMULATOR'),
      EXPO_PUBLIC_LOGINUS_CLIENT_ID: env('EXPO_PUBLIC_LOGINUS_CLIENT_ID'),
      EXPO_PUBLIC_USE_MOCKS: env('EXPO_PUBLIC_USE_MOCKS'),
    },
  },
};
