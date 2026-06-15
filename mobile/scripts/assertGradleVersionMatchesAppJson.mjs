/**
 * Gradle versionName/versionCode must match app.json before release APK build.
 * @see mobile/RELEASE-APK.md §1.2.1
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const mobileRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

export function assertGradleVersionMatchesAppJson() {
  const appJsonPath = path.join(mobileRoot, 'app.json');
  const gradlePath = path.join(mobileRoot, 'android', 'app', 'build.gradle');

  if (!fs.existsSync(appJsonPath)) {
    // eslint-disable-next-line no-console
    console.error('\n  Не найден mobile/app.json\n');
    process.exit(1);
  }
  if (!fs.existsSync(gradlePath)) {
    // eslint-disable-next-line no-console
    console.error(
      '\n  Не найден android/app/build.gradle — сначала: npx expo prebuild --platform android\n',
    );
    process.exit(1);
  }

  const appJson = JSON.parse(fs.readFileSync(appJsonPath, 'utf8'));
  const expectedName = appJson.expo?.version;
  const expectedCode = appJson.expo?.android?.versionCode;

  if (typeof expectedName !== 'string' || !expectedName) {
    // eslint-disable-next-line no-console
    console.error('\n  В app.json не задан expo.version\n');
    process.exit(1);
  }
  if (typeof expectedCode !== 'number' || !Number.isFinite(expectedCode)) {
    // eslint-disable-next-line no-console
    console.error('\n  В app.json не задан expo.android.versionCode\n');
    process.exit(1);
  }

  const gradle = fs.readFileSync(gradlePath, 'utf8');
  const nameMatch = gradle.match(/versionName\s+"([^"]+)"/);
  const codeMatch = gradle.match(/versionCode\s+(\d+)/);
  const gradleName = nameMatch?.[1];
  const gradleCode = codeMatch ? Number(codeMatch[1]) : null;

  if (gradleName === expectedName && gradleCode === expectedCode) return;

  // eslint-disable-next-line no-console
  console.error(
    '\n  Версия в android/app/build.gradle не совпадает с app.json.\n' +
      `  app.json:     version="${expectedName}", versionCode=${expectedCode}\n` +
      `  build.gradle: versionName="${gradleName ?? '?'}", versionCode=${gradleCode ?? '?'}\n` +
      '  Gradle не подтягивает версию из app.json при assembleRelease.\n' +
      '  Обнови build.gradle или: npx expo prebuild --platform android\n' +
      '  (см. mobile/RELEASE-APK.md §1.2.1)\n',
  );
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  assertGradleVersionMatchesAppJson();
}
