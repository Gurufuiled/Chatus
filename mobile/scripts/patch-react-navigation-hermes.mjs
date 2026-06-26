/**
 * Re-apply Hermes-safe transforms to prebuilt @react-navigation ESM bundles.
 * Run after npm ci, before patch-package (or via postinstall helper).
 */
import { transformSync } from '@babel/core';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const targets = [
  '@react-navigation/core/lib/module',
  '@react-navigation/routers/lib/module',
];

const plugins = [
  '@babel/plugin-transform-optional-chaining',
  '@babel/plugin-transform-nullish-coalescing-operator',
];

for (const rel of targets) {
  const dir = path.join(root, 'node_modules', rel);
  if (!fs.existsSync(dir)) {
    console.warn(`skip missing ${rel}`);
    continue;
  }
  for (const file of fs.readdirSync(dir)) {
    if (!file.endsWith('.js')) continue;
    const fp = path.join(dir, file);
    const code = fs.readFileSync(fp, 'utf8');
    const result = transformSync(code, {
      filename: fp,
      plugins,
      babelrc: false,
      configFile: false,
    });
    fs.writeFileSync(fp, result.code);
  }
  console.log(`patched ${rel}`);
}
