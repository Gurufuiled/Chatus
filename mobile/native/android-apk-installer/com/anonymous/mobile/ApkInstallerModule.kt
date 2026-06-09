package com.anonymous.mobile

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.os.Build
import android.provider.Settings
import androidx.core.content.FileProvider
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File

@ReactModule(name = ApkInstallerModule.NAME)
class ApkInstallerModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "ApkInstaller"
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun canRequestPackageInstalls(promise: Promise) {
    try {
      val allowed =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          reactContext.packageManager.canRequestPackageInstalls()
        } else {
          true
        }
      promise.resolve(allowed)
    } catch (e: Exception) {
      promise.reject("E_APK_PERMISSION", e.message, e)
    }
  }

  @ReactMethod
  fun openInstallPermissionSettings(promise: Promise) {
    try {
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
        val intent =
          Intent(
              Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
              Uri.parse("package:${reactContext.packageName}"),
            )
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        reactContext.startActivity(intent)
      }
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_APK_PERMISSION_SETTINGS", e.message, e)
    }
  }

  @ReactMethod
  fun installApk(fileUri: String, currentVersionCodeDouble: Double, promise: Promise) {
    try {
      val parsed = Uri.parse(fileUri)
      val apkFile =
        when (parsed.scheme) {
          "file" -> File(parsed.path ?: "")
          null, "" -> File(fileUri)
          else -> {
            promise.reject("E_APK_URI", "Only file:// APK URIs are supported")
            return
          }
        }

      if (!apkFile.exists() || !apkFile.isFile) {
        promise.reject("E_APK_MISSING", "APK file does not exist")
        return
      }

      val archiveInfo = reactContext.packageManager.getPackageArchiveInfo(apkFile.absolutePath, 0)
      if (archiveInfo == null) {
        promise.reject("E_APK_INVALID", "Downloaded file is not a valid APK")
        return
      }
      if (archiveInfo.packageName != reactContext.packageName) {
        promise.reject("E_APK_PACKAGE", "APK package does not match this app")
        return
      }
      val archiveVersionCode =
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
          archiveInfo.longVersionCode
        } else {
          @Suppress("DEPRECATION") archiveInfo.versionCode.toLong()
        }
      val currentVersionCode = currentVersionCodeDouble.toLong()
      if (archiveVersionCode <= currentVersionCode) {
        promise.reject("E_APK_VERSION", "APK version is not newer than the installed app")
        return
      }

      if (
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
          !reactContext.packageManager.canRequestPackageInstalls()
      ) {
        promise.reject("E_APK_PERMISSION_REQUIRED", "Install unknown apps permission required")
        return
      }

      val authority = "${reactContext.packageName}.apkprovider"
      val contentUri = FileProvider.getUriForFile(reactContext, authority, apkFile)
      val intent =
        Intent(Intent.ACTION_VIEW)
          .setDataAndType(contentUri, "application/vnd.android.package-archive")
          .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          .addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
      intent.clipData = ClipData.newUri(reactContext.contentResolver, "APK", contentUri)

      if (intent.resolveActivity(reactContext.packageManager) == null) {
        promise.reject("E_APK_INSTALLER_MISSING", "No package installer available")
        return
      }

      reactContext.startActivity(intent)
      promise.resolve(true)
    } catch (e: Exception) {
      promise.reject("E_APK_INSTALL", e.message, e)
    }
  }
}
