import { NativeModules, Platform } from 'react-native';

type ApkInstallerNative = {
  canRequestPackageInstalls(): Promise<boolean>;
  openInstallPermissionSettings(): Promise<boolean>;
  installApk(fileUri: string, currentVersionCode: number): Promise<boolean>;
};

const nativeModule = NativeModules.ApkInstaller as ApkInstallerNative | undefined;

export function isApkInstallerAvailable(): boolean {
  return Platform.OS === 'android' && !!nativeModule;
}

export async function canRequestPackageInstalls(): Promise<boolean> {
  if (!isApkInstallerAvailable() || !nativeModule) return false;
  return nativeModule.canRequestPackageInstalls();
}

export async function openInstallPermissionSettings(): Promise<void> {
  if (!isApkInstallerAvailable() || !nativeModule) {
    throw new Error('APK installer native module is not available');
  }
  await nativeModule.openInstallPermissionSettings();
}

export async function installApk(fileUri: string, currentVersionCode: number): Promise<void> {
  if (!isApkInstallerAvailable() || !nativeModule) {
    throw new Error('APK installer native module is not available');
  }
  await nativeModule.installApk(fileUri, currentVersionCode);
}
