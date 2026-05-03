/**
 * Expo config plugin: копирует stub TDLib bridge (Kotlin) и регистрирует пакет в MainApplication.
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withMainApplication } = require('@expo/config-plugins');

const REL = path.join('app', 'src', 'main', 'java', 'com', 'anonymous', 'mobile');

function withTdlibNative(config) {
  const mobileRoot = config.modRequest.projectRoot;

  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const destRoot = cfg.modRequest.platformProjectRoot;
      const destDir = path.join(destRoot, REL);
      await fs.promises.mkdir(destDir, { recursive: true });
      const stubDir = path.join(mobileRoot, 'tdlib-stub');
      await fs.promises.copyFile(
        path.join(stubDir, 'TdlibModule.kt'),
        path.join(destDir, 'TdlibModule.kt'),
      );
      await fs.promises.copyFile(
        path.join(stubDir, 'TdlibPackage.kt'),
        path.join(destDir, 'TdlibPackage.kt'),
      );
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
