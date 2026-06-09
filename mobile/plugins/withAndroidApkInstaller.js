/**
 * Expo config plugin: native Android APK installer bridge.
 *
 * Copies the React Native module into the generated Android project and exposes APK files
 * from app cache through FileProvider so Package Installer can read them.
 */
const fs = require('fs');
const path = require('path');
const {
  AndroidConfig,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const JAVA_REL = path.join('app', 'src', 'main', 'java');
const XML_REL = path.join('app', 'src', 'main', 'res', 'xml');
const PACKAGE_REL = path.join('com', 'anonymous', 'mobile');
const PROVIDER_AUTHORITY_SUFFIX = '.apkprovider';
const PROVIDER_NAME = 'androidx.core.content.FileProvider';

function ensurePermission(manifest, permissionName) {
  const usesPermissions = manifest.manifest['uses-permission'] ?? [];
  if (!usesPermissions.some((p) => p?.$?.['android:name'] === permissionName)) {
    usesPermissions.push({ $: { 'android:name': permissionName } });
    manifest.manifest['uses-permission'] = usesPermissions;
  }
}

function upsertApkProvider(app, packageName) {
  const providers = app.provider ?? [];
  const authority = `${packageName}${PROVIDER_AUTHORITY_SUFFIX}`;
  const existing = providers.find((p) => p?.$?.['android:authorities'] === authority);
  const provider =
    existing ??
    {
      $: {
        'android:name': PROVIDER_NAME,
        'android:authorities': authority,
        'android:exported': 'false',
        'android:grantUriPermissions': 'true',
      },
    };
  provider.$ = {
    ...provider.$,
    'android:name': PROVIDER_NAME,
    'android:authorities': authority,
    'android:exported': 'false',
    'android:grantUriPermissions': 'true',
  };
  provider['meta-data'] = [
    {
      $: {
        'android:name': 'android.support.FILE_PROVIDER_PATHS',
        'android:resource': '@xml/apk_file_paths',
      },
    },
  ];
  if (!existing) providers.push(provider);
  app.provider = providers;
}

function withAndroidApkInstaller(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const mobileRoot = cfg.modRequest.projectRoot;
      const nativeRoot = path.join(mobileRoot, 'native', 'android-apk-installer');
      const destPackage = path.join(cfg.modRequest.platformProjectRoot, JAVA_REL, PACKAGE_REL);
      await fs.promises.mkdir(destPackage, { recursive: true });
      for (const file of ['ApkInstallerModule.kt', 'ApkInstallerPackage.kt']) {
        const from = path.join(nativeRoot, PACKAGE_REL, file);
        const to = path.join(destPackage, file);
        if (!fs.existsSync(from)) {
          throw new Error(`withAndroidApkInstaller: missing ${from}`);
        }
        await fs.promises.copyFile(from, to);
      }

      const xmlDest = path.join(cfg.modRequest.platformProjectRoot, XML_REL);
      await fs.promises.mkdir(xmlDest, { recursive: true });
      await fs.promises.copyFile(
        path.join(nativeRoot, 'res', 'xml', 'apk_file_paths.xml'),
        path.join(xmlDest, 'apk_file_paths.xml'),
      );
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const manifest = cfg.modResults;
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(manifest);
    const packageName = cfg.android?.package ?? manifest.manifest.$?.package;
    if (!packageName) {
      throw new Error('withAndroidApkInstaller: android.package is required');
    }
    ensurePermission(manifest, 'android.permission.REQUEST_INSTALL_PACKAGES');
    upsertApkProvider(app, packageName);
    return cfg;
  });

  config = withMainApplication(config, (mod) => {
    const lang = mod.modResults.language;
    if (lang !== 'kotlin' && lang !== 'kt') {
      throw new Error(`withAndroidApkInstaller: unsupported MainApplication language "${lang}"`);
    }
    let src = mod.modResults.contents;
    const importLine = 'import com.anonymous.mobile.ApkInstallerPackage';
    if (!src.includes(importLine)) {
      if (src.includes('import com.anonymous.mobile.TdlibPackage')) {
        src = src.replace(
          'import com.anonymous.mobile.TdlibPackage',
          'import com.anonymous.mobile.ApkInstallerPackage\nimport com.anonymous.mobile.TdlibPackage',
        );
      } else {
        src = src.replace(
          'import com.facebook.react.PackageList',
          `${importLine}\n\nimport com.facebook.react.PackageList`,
        );
      }
    }
    if (src.includes('add(ApkInstallerPackage())')) {
      mod.modResults.contents = src;
      return mod;
    }
    const needle = `PackageList(this).packages.apply {
          add(TdlibPackage())
        }`;
    if (src.includes(needle)) {
      src = src.replace(
        needle,
        `PackageList(this).packages.apply {
          add(TdlibPackage())
          add(ApkInstallerPackage())
        }`,
      );
      mod.modResults.contents = src;
      return mod;
    }
    const defaultNeedle = `PackageList(this).packages.apply {
          // Packages that cannot be autolinked yet can be added manually here, for example:
          // add(MyReactNativePackage())
        }`;
    if (src.includes(defaultNeedle)) {
      src = src.replace(
        defaultNeedle,
        `PackageList(this).packages.apply {
          add(ApkInstallerPackage())
        }`,
      );
      mod.modResults.contents = src;
      return mod;
    }
    throw new Error(
      'withAndroidApkInstaller: failed to register ApkInstallerPackage in MainApplication.kt',
    );
  });

  return config;
}

module.exports = withAndroidApkInstaller;
