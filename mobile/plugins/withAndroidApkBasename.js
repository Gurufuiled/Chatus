/**
 * Expo config plugin: Android APK basename (e.g. chatus-release.apk).
 * AGP 8+ does not support defaultConfig.archivesBaseName — use outputFileName on variants.
 */
const { withAppBuildGradle } = require('@expo/config-plugins');

/** @param {import('@expo/config-plugins').ExportedConfig} config */
function withAndroidApkBasename(config, props = {}) {
  const basename = typeof props.basename === 'string' ? props.basename : 'chatus';

  return withAppBuildGradle(config, (mod) => {
    if (mod.modResults.language !== 'groovy') {
      return mod;
    }
    let contents = mod.modResults.contents;

    const apkLine = `output.outputFileName = "${basename}-\${variant.buildType.name}.apk"`;
    if (contents.includes(apkLine)) {
      return mod;
    }

    contents = contents.replace(/\s*archivesBaseName\s+"[^"]+"\s*\n/g, '\n');

    const marker = '// Apply static values from `gradle.properties`';
    const variantBlock =
      `\n// APK basename (withAndroidApkBasename)\n` +
      `android.applicationVariants.configureEach { variant ->\n` +
      `    variant.outputs.configureEach { output ->\n` +
      `        ${apkLine}\n` +
      `    }\n` +
      `}\n\n`;

    if (contents.includes(marker)) {
      contents = contents.replace(marker, variantBlock + marker);
      mod.modResults.contents = contents;
    }

    return mod;
  });
}

module.exports = withAndroidApkBasename;
