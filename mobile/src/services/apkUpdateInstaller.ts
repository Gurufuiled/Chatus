import * as FileSystem from 'expo-file-system/legacy';

import {
  canRequestPackageInstalls,
  installApk,
  isApkInstallerAvailable,
  openInstallPermissionSettings,
} from '../native/ApkInstaller';

export type ApkInstallProgress = {
  bytesWritten: number;
  contentLength: number | null;
  percent: number | null;
};

export class ApkInstallPermissionRequiredError extends Error {
  constructor() {
    super('Install unknown apps permission is required');
    this.name = 'ApkInstallPermissionRequiredError';
  }
}

const APK_DOWNLOAD_DIR = 'updates/';
const APK_DOWNLOAD_NAME = 'chatus-update.apk';

function getApkDownloadUri(): string {
  const base = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
  if (!base) {
    throw new Error('No writable directory available for APK download');
  }
  return `${base}${APK_DOWNLOAD_DIR}${APK_DOWNLOAD_NAME}`;
}

export async function openApkInstallPermissionSettings(): Promise<void> {
  await openInstallPermissionSettings();
}

export async function ensureCanInstallApks(): Promise<void> {
  if (!isApkInstallerAvailable()) {
    throw new Error('In-app APK installer is unavailable in this build');
  }
  if (!(await canRequestPackageInstalls())) {
    throw new ApkInstallPermissionRequiredError();
  }
}

export async function downloadAndInstallApk(
  apkUrl: string,
  currentVersionCode: number,
  onProgress?: (progress: ApkInstallProgress) => void,
): Promise<void> {
  await ensureCanInstallApks();

  const dir = `${FileSystem.cacheDirectory ?? FileSystem.documentDirectory ?? ''}${APK_DOWNLOAD_DIR}`;
  if (!dir) {
    throw new Error('No writable directory available for APK download');
  }
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);

  const apkUri = getApkDownloadUri();
  await FileSystem.deleteAsync(apkUri, { idempotent: true }).catch(() => undefined);

  const download = FileSystem.createDownloadResumable(apkUrl, apkUri, {}, (p) => {
    const contentLength = p.totalBytesExpectedToWrite > 0 ? p.totalBytesExpectedToWrite : null;
    const percent = contentLength
      ? Math.max(0, Math.min(1, p.totalBytesWritten / contentLength))
      : null;
    onProgress?.({
      bytesWritten: p.totalBytesWritten,
      contentLength,
      percent,
    });
  });

  const result = await download.downloadAsync();
  if (!result?.uri) {
    throw new Error('APK download did not produce a file');
  }

  const info = await FileSystem.getInfoAsync(result.uri);
  if (!info.exists || (typeof info.size === 'number' && info.size <= 0)) {
    throw new Error('Downloaded APK is empty');
  }

  await installApk(result.uri, currentVersionCode);
}
