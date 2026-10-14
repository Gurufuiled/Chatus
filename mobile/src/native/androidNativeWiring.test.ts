/**
 * Контрактный тест нативной части: модуль обрезки кружка до квадрата должен быть зарегистрирован, подключён к
 * Gradle через config-плагин и называться так же, как его ищет JS. Проверяем по исходникам: собрать Android в
 * юнит-тесте нельзя, а рассинхрон имени/зависимости проявляется только при запуске на устройстве.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const mobileRoot = join(__dirname, '..', '..');
const read = (rel: string) => readFileSync(join(mobileRoot, rel), 'utf8');

const moduleSource = read('tdlib-android/com/anonymous/mobile/VideoSquareModule.kt');
const packageSource = read('tdlib-android/com/anonymous/mobile/TdlibPackage.kt');
const pluginSource = read('plugins/withTdlibNative.js');
const jsService = read('src/services/VideoNoteSquareService.ts');

// ── имя модуля совпадает с тем, что ищет JS ──
const nativeName = /const val NAME = "([^"]+)"/.exec(moduleSource)?.[1];
assert.equal(nativeName, 'VideoSquare');
assert.match(jsService, new RegExp(`NativeModules\\.${nativeName}\\b`), 'JS ищет другой модуль, чем объявлен в Kotlin');

// ── метод и его аргументы ──
assert.match(moduleSource, /@ReactMethod\s+fun cropToSquare\(inputUri: String, side: Int, promise: Promise\)/);
assert.match(jsService, /cropToSquare\(recording\.uri, side\)/);

// ── именно обрезка по центру до квадрата, а не вписывание с полосами ──
assert.match(moduleSource, /Presentation\.createForWidthAndHeight\(\s*outSide,\s*outSide,\s*Presentation\.LAYOUT_SCALE_TO_FIT_WITH_CROP/);
assert.match(moduleSource, /VIDEO_H264/);
assert.match(moduleSource, /AUDIO_AAC/);
// размеры в допустимых для кружка пределах Telegram и чётные (H.264)
assert.match(moduleSource, /MIN_SIDE = 240/);
assert.match(moduleSource, /MAX_SIDE = 640/);
assert.match(moduleSource, /clamped - \(clamped % 2\)/);
// Transformer требует поток с Looper
assert.match(moduleSource, /Handler\(Looper\.getMainLooper\(\)\)/);
// ошибки доходят до JS (иначе запись зависла бы без ответа)
assert.match(moduleSource, /onError\(/);
assert.match(moduleSource, /promise\.reject\("E_VIDEO_SQUARE"/);
assert.match(moduleSource, /promise\.resolve\(map\)/);

// ── модуль зарегистрирован в пакете ──
assert.match(packageSource, /VideoSquareModule\(reactContext\)/);
assert.match(packageSource, /TdlibModule\(reactContext\)/, 'регистрация TDLib не должна пропасть');

// ── config-плагин подключает зависимости media3 с общей версией ──
assert.match(pluginSource, /media3-transformer/);
assert.match(pluginSource, /media3-effect/);
assert.match(pluginSource, /withAppBuildGradle/);
const pluginVersion = /ANDROID_MEDIA3_VERSION = '([\d.]+)'/.exec(pluginSource)?.[1];
const expoVideoGradle = read('node_modules/expo-video/android/build.gradle');
const expoVideoVersion = /androidxMedia3Version = "([\d.]+)"/.exec(expoVideoGradle)?.[1];
assert.ok(pluginVersion, 'не найдена версия media3 в плагине');
assert.equal(pluginVersion, expoVideoVersion, 'версия media3 должна совпадать с expo-video, иначе в сборку попадут два релиза');

console.log('androidNativeWiring.test.ts: ok');
