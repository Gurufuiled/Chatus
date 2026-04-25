/* eslint-disable @typescript-eslint/no-require-imports */
/**
 * Статическая часть — в app.json. Здесь только extra из .env и EAS projectId.
 * Форма ({ config }) нужна, чтобы expo-doctor видел связку app.json + app.config.js.
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

const envPath = path.join(__dirname, '.env');
const envProductionPath = path.join(__dirname, '.env.production');

let envFile = loadDotEnv(envPath);
const mergeProdEnv =
  process.env.MOBILE_ENV === 'production' ||
  process.env.NODE_ENV === 'production';
if (mergeProdEnv && fs.existsSync(envProductionPath)) {
  envFile = { ...envFile, ...loadDotEnv(envProductionPath) };
}

function env(key) {
  return envFile[key] || process.env[key];
}

const EAS_PROJECT_ID_DEFAULT = 'd3eb9f0c-dd7a-49fc-9113-ee9078bcb257';
const easProjectId =
  (env('EXPO_PUBLIC_EAS_PROJECT_ID') || '').trim() || EAS_PROJECT_ID_DEFAULT;

/** @param {{ config: Record<string, unknown> }} ctx */
module.exports = ({ config }) => {
  const baseExtra =
    config.extra && typeof config.extra === 'object' && !Array.isArray(config.extra)
      ? config.extra
      : {};

  return {
    ...config,
    extra: {
      ...baseExtra,
      EXPO_PUBLIC_API_URL: env('EXPO_PUBLIC_API_URL'),
      EXPO_PUBLIC_USE_EMULATOR: env('EXPO_PUBLIC_USE_EMULATOR'),
      EXPO_PUBLIC_LOGINUS_CLIENT_ID: env('EXPO_PUBLIC_LOGINUS_CLIENT_ID'),
      EXPO_PUBLIC_USE_MOCKS: env('EXPO_PUBLIC_USE_MOCKS'),
      eas: { projectId: easProjectId },
    },
  };
};
