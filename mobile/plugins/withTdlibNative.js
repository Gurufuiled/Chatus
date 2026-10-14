/**
 * Expo config plugin:
 * - Android: копирует TDLib bridge (Kotlin + JsonClient.java) и libtdjson.so.
 * - iOS: подключает local pod TdLib и копирует Swift/ObjC bridge.
 *
 * Бинарники:
 * - Android: `npm run tdlib:fetch-android`
 * - iOS: `npm run tdlib:fetch-ios` (или `tdlib:build-ios` из исходников)
 * См. mobile/TDLIB.md.
 */
const fs = require('fs');
const path = require('path');
const {
  IOSConfig,
  withAppBuildGradle,
  withDangerousMod,
  withMainApplication,
  withPodfile,
  withXcodeProject,
} = require('@expo/config-plugins');

const JAVA_REL = path.join('app', 'src', 'main', 'java');
/**
 * Media3 Transformer для `VideoSquareModule` (обрезка видеокружка до квадрата перед отправкой в Telegram).
 * Версия та же, что у expo-video (`androidxMedia3Version`), чтобы не смешивать разные релизы media3.
 */
const ANDROID_MEDIA3_VERSION = '1.8.0';
const ANDROID_MEDIA3_DEPENDENCIES = [
  `implementation "androidx.media3:media3-transformer:${ANDROID_MEDIA3_VERSION}"`,
  `implementation "androidx.media3:media3-effect:${ANDROID_MEDIA3_VERSION}"`,
  `implementation "androidx.media3:media3-common:${ANDROID_MEDIA3_VERSION}"`,
];
const IOS_TDLIB_POD_LINE = "  pod 'TdLib', :path => '../tdlib-ios'";
const IOS_TDLIB_HEADER_IMPORT = '#import <td/telegram/td_json_client.h>';
const IOS_TDLIB_FALLBACK_DECLARATIONS = `
// Swift needs these declarations at compile time. Keep them here as a fallback
// because TDLib headers are generated/downloaded outside git before pod install.
#ifdef __cplusplus
extern "C" {
#endif

void *td_json_client_create(void);
void td_json_client_send(void *client, const char *request);
const char *td_json_client_receive(void *client, double timeout);
void td_json_client_destroy(void *client);

#ifdef __cplusplus
}
#endif
`;

async function copyIosNativeBridge(mobileRoot, iosProjectRoot, appGroupName) {
  const nativeRoot = path.join(mobileRoot, 'tdlib-ios', 'native');
  const sourceRoot = path.join(iosProjectRoot, 'mobile');
  const headerRoot = path.join(iosProjectRoot, appGroupName);
  await fs.promises.mkdir(sourceRoot, { recursive: true });
  await fs.promises.mkdir(headerRoot, { recursive: true });
  for (const file of ['Tdlib.swift', 'TdlibBridge.m']) {
    const from = path.join(nativeRoot, file);
    const to = path.join(sourceRoot, file);
    if (!fs.existsSync(from)) {
      throw new Error(`withTdlibNative: missing ${from}`);
    }
    await fs.promises.copyFile(from, to);
  }

  const bridgingHeader = path.join(headerRoot, `${appGroupName}-Bridging-Header.h`);
  let header = '';
  if (fs.existsSync(bridgingHeader)) {
    header = await fs.promises.readFile(bridgingHeader, 'utf8');
  }
  if (!header.includes(IOS_TDLIB_HEADER_IMPORT)) {
    const next = `${header.trimEnd()}\n#if __has_include(<td/telegram/td_json_client.h>)\n${IOS_TDLIB_HEADER_IMPORT}\n#endif\n`;
    await fs.promises.writeFile(bridgingHeader, next);
    header = next;
  }
  if (!header.includes('td_json_client_create')) {
    await fs.promises.writeFile(bridgingHeader, `${header.trimEnd()}\n${IOS_TDLIB_FALLBACK_DECLARATIONS}`);
  }
}

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

  config = withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') return mod;
    const contents = mod.modResults.contents;
    const missing = ANDROID_MEDIA3_DEPENDENCIES.filter((line) => !contents.includes(line));
    if (missing.length === 0) return mod;
    const anchor = 'implementation("com.facebook.react:react-android")';
    if (!contents.includes(anchor)) {
      throw new Error(
        `withTdlibNative: не нашёл ${anchor} в app/build.gradle — добавь зависимости media3 вручную: ${missing.join('; ')}`,
      );
    }
    const lines = ['', '    // VideoSquareModule: квадратный видеокружок для Telegram', ...missing.map((line) => `    ${line}`)];
    mod.modResults.contents = contents.replace(anchor, `${anchor}\n${lines.join('\n')}`);
    return mod;
  });

  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      const appGroupName =
        IOSConfig.XcodeUtils.getProjectName(cfg.modRequest.projectRoot) ||
        cfg.modRequest.projectName ||
        config.name ||
        'mobile';
      await copyIosNativeBridge(mobileRoot, cfg.modRequest.platformProjectRoot, appGroupName);
      return cfg;
    },
  ]);

  config = withPodfile(config, (mod) => {
    if (!mod.modResults.contents.includes(IOS_TDLIB_POD_LINE)) {
      const next = mod.modResults.contents.replace(
        '  use_expo_modules!',
        `  use_expo_modules!\n${IOS_TDLIB_POD_LINE}`,
      );
      if (next === mod.modResults.contents) {
        throw new Error(
          `withTdlibNative: failed to add "${IOS_TDLIB_POD_LINE}" to Podfile; add it inside target 'mobile' manually.`,
        );
      }
      mod.modResults.contents = next;
    }
    return mod;
  });

  config = withXcodeProject(config, (mod) => {
    const project = mod.modResults;
    const projectName = IOSConfig.XcodeUtils.getProjectName(mod.modRequest.projectRoot);
    IOSConfig.XcodeUtils.ensureGroupRecursively(project, projectName);
    for (const filepath of ['mobile/Tdlib.swift', 'mobile/TdlibBridge.m']) {
      IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
        filepath,
        groupName: projectName,
        project,
      });
    }
    const configs = project.pbxXCBuildConfigurationSection();
    for (const key of Object.keys(configs)) {
      const entry = configs[key];
      if (!entry || typeof entry !== 'object' || !entry.buildSettings) continue;
      const infoPlist = String(entry.buildSettings.INFOPLIST_FILE || '').replace(/"/g, '');
      if (infoPlist !== `${projectName}/Info.plist`) continue;
      entry.buildSettings.SWIFT_OBJC_BRIDGING_HEADER = `"${projectName}/${projectName}-Bridging-Header.h"`;
      const existingHeaderSearchPaths = Array.isArray(entry.buildSettings.HEADER_SEARCH_PATHS)
        ? entry.buildSettings.HEADER_SEARCH_PATHS
        : entry.buildSettings.HEADER_SEARCH_PATHS
          ? [entry.buildSettings.HEADER_SEARCH_PATHS]
          : [];
      entry.buildSettings.HEADER_SEARCH_PATHS = [
        ...existingHeaderSearchPaths,
        '"$(inherited)"',
        '"$(SRCROOT)/../tdlib-ios/include"',
      ].filter((value, index, values) => values.indexOf(value) === index);
    }
    return mod;
  });

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
