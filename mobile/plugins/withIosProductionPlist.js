/**
 * Expo config plugin: align iOS Info.plist for store readiness (display name, min OS, permissions copy).
 * Removes NSFaceIDUsageDescription — app uses SecureStore without biometric-only flows.
 */

const { withInfoPlist } = require('@expo/config-plugins');

const CAMERA_RU =
  'Разрешите доступ к камере для записи видеокружков и съёмки.';
const MIC_RU =
  'Разрешите доступ к микрофону для голосовых сообщений и видеокружков.';
const PHOTOS_RU = 'Разрешите доступ к фото для выбора изображений и аватара.';
const PHOTOS_ADD_RU = 'Разрешите сохранять изображения в галерею.';

/** @param {import('@expo/config-plugins').ExportedConfig} config */
function withIosProductionPlist(config) {
  return withInfoPlist(config, (mod) => {
    const plist = mod.modResults;
    plist.CFBundleDisplayName = 'Chatus';
    plist.LSMinimumSystemVersion = '15.1';
    delete plist.NSFaceIDUsageDescription;
    plist.NSCameraUsageDescription = CAMERA_RU;
    plist.NSMicrophoneUsageDescription = MIC_RU;
    plist.NSPhotoLibraryUsageDescription = PHOTOS_RU;
    plist.NSPhotoLibraryAddUsageDescription = PHOTOS_ADD_RU;
    return mod;
  });
}

module.exports = withIosProductionPlist;
