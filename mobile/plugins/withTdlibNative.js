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
  withDangerousMod,
  withMainApplication,
  withPodfile,
  withXcodeProject,
} = require('@expo/config-plugins');

const JAVA_REL = path.join('app', 'src', 'main', 'java');
const IOS_TDLIB_POD_LINE = "  pod 'TdLib', :path => '../tdlib-ios'";
const IOS_TDLIB_HEADER_IMPORT = '#import <td/telegram/td_json_client.h>';

async function copyIosNativeBridge(mobileRoot, iosProjectRoot) {
  const nativeRoot = path.join(mobileRoot, 'tdlib-ios', 'native');
  const appRoot = path.join(iosProjectRoot, 'mobile');
  await fs.promises.mkdir(appRoot, { recursive: true });
  for (const file of ['Tdlib.swift', 'TdlibBridge.m']) {
    const from = path.join(nativeRoot, file);
    const to = path.join(appRoot, file);
    if (!fs.existsSync(from)) {
      throw new Error(`withTdlibNative: missing ${from}`);
    }
    await fs.promises.copyFile(from, to);
  }

  const bridgingHeader = path.join(appRoot, 'mobile-Bridging-Header.h');
  let header = '';
  if (fs.existsSync(bridgingHeader)) {
    header = await fs.promises.readFile(bridgingHeader, 'utf8');
  }
  if (!header.includes(IOS_TDLIB_HEADER_IMPORT)) {
    const next = `${header.trimEnd()}\n${IOS_TDLIB_HEADER_IMPORT}\n`;
    await fs.promises.writeFile(bridgingHeader, next);
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

  config = withDangerousMod(config, [
    'ios',
    async (cfg) => {
      await copyIosNativeBridge(mobileRoot, cfg.modRequest.platformProjectRoot);
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
      if (infoPlist !== 'mobile/Info.plist') continue;
      entry.buildSettings.SWIFT_OBJC_BRIDGING_HEADER = '"mobile/mobile-Bridging-Header.h"';
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
