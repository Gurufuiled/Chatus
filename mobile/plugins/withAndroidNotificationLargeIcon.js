/**
 * Expo config plugin: Android large notification icon (tray / expanded header).
 * expo-notifications sets small (status) icon only; NotificationContent.getImage() on Android
 * reads meta expo.modules.notifications.large_notification_icon.
 *
 * @param {import('@expo/config-plugins').ExportedConfig} config
 */
const fs = require('fs');
const path = require('path');
const { withDangerousMod, withAndroidManifest, AndroidConfig } = require('@expo/config-plugins');

const META_LARGE = 'expo.modules.notifications.large_notification_icon';
const DRAWABLE_NAME = 'large_notification_icon';

function withAndroidNotificationLargeIcon(config) {
  config = withDangerousMod(config, [
    'android',
    async (cfg) => {
      const projectRoot = cfg.modRequest.projectRoot;
      const src = path.join(projectRoot, 'assets', 'chatus_icon.png');
      if (!fs.existsSync(src)) {
        throw new Error(`withAndroidNotificationLargeIcon: missing ${src}`);
      }
      const nodpi = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'drawable-nodpi',
      );
      fs.mkdirSync(nodpi, { recursive: true });
      const dest = path.join(nodpi, `${DRAWABLE_NAME}.png`);
      fs.copyFileSync(src, dest);
      return cfg;
    },
  ]);

  config = withAndroidManifest(config, (cfg) => {
    const app = AndroidConfig.Manifest.getMainApplicationOrThrow(cfg.modResults);
    AndroidConfig.Manifest.removeMetaDataItemFromMainApplication(app, META_LARGE);
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      app,
      META_LARGE,
      `@drawable/${DRAWABLE_NAME}`,
      'resource',
    );
    return cfg;
  });

  return config;
}

module.exports = withAndroidNotificationLargeIcon;
