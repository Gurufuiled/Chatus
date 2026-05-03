/**
 * Expo config plugin: копирует нативный TDLib bridge (Kotlin + JsonClient.java) в android/app/src/main/java.
 * Бинарники libtdjson.so — отдельно: `npm run tdlib:fetch-android` (см. mobile/TDLIB.md).
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const JAVA_REL = path.join('app', 'src', 'main', 'java');

function withTdlibNative(config) {
  const mobileRoot =
    config.modRequest?.projectRoot ??
    config._internal?.projectRoot ??
    path.join(__dirname, '..');

  const srcRoot = path.join(mobileRoot, 'tdlib-android');

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const destJava = path.join(cfg.modRequest.platformProjectRoot, JAVA_REL);
      await fs.promises.mkdir(destJava, { recursive: true });
      for (const rel of ['com', 'io']) {
        const from = path.join(srcRoot, rel);
        const to = path.join(destJava, rel);
        if (!fs.existsSync(from)) {
          throw new Error(`withTdlibNative: missing ${from}`);
        }
        await fs.promises.cp(from, to, { recursive: true });
      }
      const jniFrom = path.join(srcRoot, 'jniLibs');
      const jniTo = path.join(cfg.modRequest.platformProjectRoot, 'app', 'src', 'main', 'jniLibs');
      if (fs.existsSync(path.join(jniFrom, 'arm64-v8a', 'libtdjson.so'))) {
        await fs.promises.mkdir(path.dirname(jniTo), { recursive: true });
        await fs.promises.cp(jniFrom, jniTo, { recursive: true });
      }
      return cfg;
    },
  ]);

  config = withMainApplication(config, (mod) => {
    if (mod.modResults.language !== 'kotlin') {
      return mod;
    }
    let src = mod.modResults.contents;
    if (src.includes('add(TdlibPackage())')) {
      return mod;
    }
    const needle = `PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }`;
    if (!src.includes(needle)) {
      return mod;
    }
    src = src.replace(
      needle,
      `PackageList(this).packages.apply {
          add(TdlibPackage())
        }`,
    );
    mod.modResults.contents = src;
    return mod;
  });

  return config;
}

module.exports = withTdlibNative;
