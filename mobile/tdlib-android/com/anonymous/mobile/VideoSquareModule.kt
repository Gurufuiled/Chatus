package com.anonymous.mobile

import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MimeTypes
import androidx.media3.common.util.UnstableApi
import androidx.media3.effect.Presentation
import androidx.media3.transformer.Composition
import androidx.media3.transformer.EditedMediaItem
import androidx.media3.transformer.Effects
import androidx.media3.transformer.ExportException
import androidx.media3.transformer.ExportResult
import androidx.media3.transformer.Transformer
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import java.io.File

/**
 * Обрезает видео до квадрата (по центру) для видеокружков Telegram.
 *
 * Камера (expo-camera) пишет 4:3 / 16:9 независимо от формы окна записи — круг в приложении лишь маска при показе.
 * Telegram принимает как кружок только квадратное видео: прямоугольный файл сервер отдаёт обычным роликом, а не
 * кружком. Поэтому перед отправкой в Telegram файл перекодируется в квадрат (Media3 Transformer, аппаратное
 * кодирование, обычно пара секунд на минуту видео). Ориентация (поворот кадра, зеркало фронтальной камеры) учитывается
 * самим Transformer.
 */
@OptIn(UnstableApi::class)
@ReactModule(name = VideoSquareModule.NAME)
class VideoSquareModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "VideoSquare"
    private const val TAG = "VideoSquareModule"
    private const val MIN_SIDE = 240
    private const val MAX_SIDE = 640
  }

  override fun getName(): String = NAME

  /** Сторона квадрата: в пределах 240…640 и чётная (требование H.264-кодеров). */
  private fun normalizeSide(side: Int): Int {
    val clamped = side.coerceIn(MIN_SIDE, MAX_SIDE)
    return clamped - (clamped % 2)
  }

  private fun toFile(uriOrPath: String): File? {
    val trimmed = uriOrPath.trim()
    if (trimmed.isEmpty()) return null
    val path = if (trimmed.startsWith("file://")) Uri.parse(trimmed).path else trimmed
    return path?.let { File(it) }
  }

  /**
   * @param inputUri `file://…` или абсолютный путь исходного видео.
   * @param side желаемая сторона квадрата, px.
   * Результат: `{ uri: "file://…", width, height }`.
   */
  @ReactMethod
  fun cropToSquare(inputUri: String, side: Int, promise: Promise) {
    val input = toFile(inputUri)
    if (input == null || !input.exists() || input.length() == 0L) {
      promise.reject("E_VIDEO_SQUARE_INPUT", "Исходное видео не найдено: $inputUri")
      return
    }
    val outSide = normalizeSide(side)
    val output = File(reactContext.cacheDir, "video-note-square-${System.currentTimeMillis()}.mp4")

    // Transformer должен создаваться и запускаться на потоке с Looper
    Handler(Looper.getMainLooper()).post {
      try {
        val edited =
          EditedMediaItem.Builder(MediaItem.fromUri(Uri.fromFile(input)))
            .setEffects(
              Effects(
                emptyList(),
                listOf(
                  Presentation.createForWidthAndHeight(
                    outSide,
                    outSide,
                    Presentation.LAYOUT_SCALE_TO_FIT_WITH_CROP,
                  ),
                ),
              ),
            )
            .build()

        val transformer =
          Transformer.Builder(reactContext)
            .setVideoMimeType(MimeTypes.VIDEO_H264)
            .setAudioMimeType(MimeTypes.AUDIO_AAC)
            .addListener(
              object : Transformer.Listener {
                override fun onCompleted(composition: Composition, exportResult: ExportResult) {
                  val map = Arguments.createMap()
                  map.putString("uri", Uri.fromFile(output).toString())
                  map.putInt("width", outSide)
                  map.putInt("height", outSide)
                  promise.resolve(map)
                }

                override fun onError(
                  composition: Composition,
                  exportResult: ExportResult,
                  exportException: ExportException,
                ) {
                  Log.e(TAG, "square crop failed", exportException)
                  output.delete()
                  promise.reject(
                    "E_VIDEO_SQUARE",
                    exportException.message ?: "Не удалось обрезать видео до квадрата",
                    exportException,
                  )
                }
              },
            )
            .build()
        transformer.start(edited, output.absolutePath)
      } catch (e: Throwable) {
        Log.e(TAG, "square crop start failed", e)
        output.delete()
        promise.reject("E_VIDEO_SQUARE", e.message ?: "Не удалось запустить обрезку видео", e)
      }
    }
  }
}
