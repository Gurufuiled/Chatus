package com.anonymous.mobile

import android.text.format.DateFormat
import android.util.Log
import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import io.github.up9cloud.td.JsonClient
import org.json.JSONObject
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap

/**
 * React Native bridge: [JsonClient.td_send] / [JsonClient.td_receive] с корреляцией по @extra.
 *
 * По [td_json_client.h] для `td_create_client_id`: **td_send** можно вызывать с любого потока,
 * **td_receive** — с одного выделенного потока (не одновременно с другого). Раньше send стоял
 * в очереди того же [HandlerThread], что и receive: при блокирующем/долгом send цикл receive
 * не крутился — ответ на запрос не доходил до JS и срабатывал таймаут (в т.ч. на
 * `setAuthenticationPhoneNumber`).
 */
/** Апдейты, которые слушает JS. Остальные (online, typing, stories…) не шлём в RN — иначе лагает ввод. */
private fun shouldEmitUpdateToJs(updateType: String): Boolean =
  when (updateType) {
    "updateAuthorizationState",
    "updateNewMessage",
    "updateMessageSendSucceeded",
    "updateMessageSendFailed",
    "updateFile",
    "updateChatPinnedMessage",
    "updateDeleteMessages",
    "updateChatReadOutbox",
    "updateNewChat",
    "updateChatLastMessage",
    "updateChatPosition",
    "updateChatReadInbox",
    "updateChatTitle",
    "updateChatPhoto",
    "updateUserChatAction",
    -> true
    else -> false
  }

@ReactModule(name = TdlibModule.NAME)
class TdlibModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "Tdlib"
    private const val TAG = "TdlibModule"
    private const val SEND_TIMEOUT_MS = 240_000L
    private const val MAX_LOG_TAIL_CHARS = 128 * 1024
  }

  private fun coerceExtraKey(obj: JSONObject): String {
    if (!obj.has("@extra") || obj.isNull("@extra")) return ""
    return try {
      when (val v = obj.get("@extra")) {
        is String -> v.trim()
        is Number -> v.toString()
        is Boolean -> if (v) "true" else "false"
        else -> v?.toString()?.trim() ?: ""
      }
    } catch (_: Exception) {
      ""
    }
  }

  private val instanceId = UUID.randomUUID().toString()
  private val diagnosticLock = Any()
  private val diagnosticTail = StringBuilder()
  private val clientId: Int
  @Volatile private var destroyed = false
  @Volatile private var receiveRunning = false
  private var receiveThread: Thread? = null
  /** Короткая сериализация отправок (TDLib допускает любой поток; порядок не ломаем). */
  private val sendLock = Any()
  private val pending = ConcurrentHashMap<String, Promise>()
  private val pendingTimeouts = ConcurrentHashMap<String, Runnable>()
  private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

  init {
    clientId =
      try {
        JsonClient.td_create_client_id()
      } catch (e: Throwable) {
        Log.e(TAG, "TDLib native init failed (did you run npm run tdlib:fetch-android?)", e)
        -1
      }
    if (clientId >= 0) {
      try {
        JsonClient.td_set_log_message_callback(
          2,
          JsonClient.LogMessageCallback { level, message ->
            val line = "[tdlib log $level] ${message ?: ""}"
            appendDiagnostic(line)
            when {
              level >= 4 -> Log.e(TAG, line)
              level == 3 -> Log.w(TAG, line)
              else -> Log.d(TAG, line)
            }
          },
        )
      } catch (e: Throwable) {
        Log.w(TAG, "td_set_log_message_callback unavailable", e)
      }
      receiveRunning = true
      receiveThread =
        Thread(
            {
              while (!destroyed && !Thread.currentThread().isInterrupted) {
                try {
                  val hasPending = pending.isNotEmpty()
                  val timeout = if (hasPending) 0.1 else 1.0
                  val json = JsonClient.td_receive(timeout) ?: continue
                  if (destroyed) break
                  handleIncoming(json)
                } catch (_: InterruptedException) {
                  break
                } catch (e: Exception) {
                  if (destroyed) break
                  Log.w(TAG, "td_receive", e)
                  try {
                    Thread.sleep(200)
                  } catch (_: InterruptedException) {
                    break
                  }
                }
              }
            },
            "tdlib-receive",
          )
          .apply { start() }
    }
  }

  /** Keep a local bounded tail; JS applies its strict allow-list before upload. */
  private fun appendDiagnostic(line: String) {
    synchronized(diagnosticLock) {
      diagnosticTail.append(line).append('\n')
      val overflow = diagnosticTail.length - MAX_LOG_TAIL_CHARS
      if (overflow > 0) diagnosticTail.delete(0, overflow)
    }
  }

  private fun emitLifecycleDiagnostic(event: String) {
    try {
      if (!reactContext.hasActiveReactInstance()) return
      val map = Arguments.createMap()
      map.putString("event", event)
      map.putString("instanceId", instanceId)
      reactContext
        .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
        .emit("td_json_diagnostic", map)
    } catch (e: Exception) {
      Log.w(TAG, "emit td_json_diagnostic", e)
    }
  }

  private fun handleIncoming(json: String) {
    if (destroyed) return
    val obj =
      try {
        JSONObject(json)
      } catch (_: Exception) {
        return
      }
    val extra = coerceExtraKey(obj)
    if (extra.isNotEmpty()) {
      val p = pending.remove(extra)
      if (p != null) {
        val timeoutRunnable = pendingTimeouts.remove(extra)
        if (timeoutRunnable != null) {
          mainHandler.removeCallbacks(timeoutRunnable)
        }
        mainHandler.post {
          // Не проверять destroyed: иначе при гонке с invalidate() Promise снимают с pending,
          // а resolve не вызывается — JS зависает навсегда.
          try {
            p.resolve(json)
          } catch (_: Exception) {
          }
        }
        return
      }
      // TDLib иногда переиспользует @extra от предыдущего запроса (или сессии) для любого
      // типа ответа — "ok", "error", и др. Если @extra не совпало ни с одним pending И в
      // очереди ровно один запрос — это однозначно ответ на него. Резолвим немедленно.
      val pendingEntries = pending.entries.toList()
      val msgType = obj.optString("@type", "")
      if (pendingEntries.size == 1) {
        val (onlyExtra, onlyPromise) = pendingEntries[0]
        pending.remove(onlyExtra)
        val timeoutRunnable = pendingTimeouts.remove(onlyExtra)
        if (timeoutRunnable != null) {
          mainHandler.removeCallbacks(timeoutRunnable)
        }
        Log.w(
          TAG,
          "ответ '$msgType' с несовпадающим @extra='$extra' → разрешаем единственный pending extra='$onlyExtra'${if (msgType == "error") " (ошибка: ${obj.optString("message", "?")})" else ""}",
        )
        mainHandler.post {
          try {
            onlyPromise.resolve(json)
          } catch (_: Exception) {
          }
        }
        // Не return: всё равно эмитим апдейт ниже, чтобы JS получил updateAuthorizationState
      } else if (pendingEntries.isNotEmpty()) {
        Log.w(
          TAG,
          "ответ '$msgType' без совпадения @extra (got extra='$extra', pending=${pendingEntries.size}): ${if (msgType == "error") obj.optString("message", "?") else "(не ошибка)"}",
        )
      }
    }
    val cid = obj.optInt("@client_id", -1)
    if (cid >= 0 && cid != clientId) {
      return
    }
    val updateType = obj.optString("@type", "")
    if (updateType == "updateAuthorizationState") {
      val innerState = obj.optJSONObject("authorization_state")?.optString("@type", "?") ?: "?"
      Log.d(TAG, "updateAuthorizationState → $innerState")
    }
    if (!shouldEmitUpdateToJs(updateType)) {
      return
    }
    mainHandler.post {
      if (destroyed) return@post
      try {
        if (!reactContext.hasActiveReactInstance()) {
          return@post
        }
        val map = Arguments.createMap()
        map.putString("json", json)
        reactContext
          .getJSModule(DeviceEventManagerModule.RCTDeviceEventEmitter::class.java)
          .emit("td_json_update", map)
      } catch (e: Exception) {
        Log.w(TAG, "emit td_json_update", e)
      }
    }
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun getInstanceIdentity(promise: Promise) {
    promise.resolve(Arguments.createMap().apply { putString("instanceId", instanceId) })
  }

  @ReactMethod
  fun readTdlibLogTail(maxBytes: Int, promise: Promise) {
    try {
      val limit = maxBytes.coerceIn(1, MAX_LOG_TAIL_CHARS)
      val tail = synchronized(diagnosticLock) {
        diagnosticTail.toString().takeLast(limit)
      }
      promise.resolve(tail)
    } catch (e: Exception) {
      promise.reject("E_TD_LOG_READ", e.message, e)
    }
  }

  /** System Settings → 24-hour format (used by JS message time labels). */
  @ReactMethod
  fun getUses24HourClock(promise: Promise) {
    try {
      promise.resolve(DateFormat.is24HourFormat(reactContext))
    } catch (e: Exception) {
      promise.reject("E_TIME_FORMAT", e.message, e)
    }
  }

  /**
   * Center-crop helper for video notes. Android camera ratio 1:1 usually already square —
   * if the file is already square and ≤ maxSide we return the same path; otherwise reject
   * so JS can show a clear error (full MediaCodec crop is not wired here).
   */
  @ReactMethod
  fun centerCropSquareVideo(inputPath: String, maxSide: Int, promise: Promise) {
    Thread {
      try {
        val trimmed = inputPath.trim()
        if (trimmed.isEmpty()) {
          promise.reject("E_VIDEO_CROP", "Empty video path", null)
          return@Thread
        }
        val path =
          if (trimmed.startsWith("file://")) trimmed.removePrefix("file://") else trimmed
        val retriever = android.media.MediaMetadataRetriever()
        try {
          retriever.setDataSource(path)
          val width =
            retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)
              ?.toIntOrNull()
              ?: 0
          val height =
            retriever.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)
              ?.toIntOrNull()
              ?: 0
          if (width <= 0 || height <= 0) {
            promise.reject("E_VIDEO_CROP", "Invalid video dimensions", null)
            return@Thread
          }
          // Match display orientation (JS isSquareVideoDimensions / expo-video track size).
          val rotation =
            retriever
              .extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_ROTATION)
              ?.toIntOrNull()
              ?: 0
          val displayWidth = if (rotation == 90 || rotation == 270) height else width
          val displayHeight = if (rotation == 90 || rotation == 270) width else height
          val sideDiff = kotlin.math.abs(displayWidth - displayHeight)
          val maxDim = maxOf(displayWidth, displayHeight)
          val limit = maxSide.coerceIn(240, 640)
          if (sideDiff <= 4 && maxDim <= limit + 4) {
            promise.resolve(path)
            return@Thread
          }
          promise.reject(
            "E_VIDEO_CROP",
            "Video is not square; re-record the circle with the in-app camera.",
            null,
          )
        } finally {
          try {
            retriever.release()
          } catch (_: Exception) {
          }
        }
      } catch (e: Exception) {
        promise.reject("E_VIDEO_CROP", e.message, e)
      }
    }.start()
  }

  @ReactMethod
  fun addListener(eventName: String) {}

  @ReactMethod
  fun removeListeners(count: Int) {}

  @ReactMethod
  fun sendClientJson(queryJson: String, promise: Promise) {
    if (clientId < 0) {
      promise.reject(
        "E_TD_JSON",
        "TDLib не загружен. Выполни из папки mobile: npm run tdlib:fetch-android (см. TDLIB.md).",
        null,
      )
      return
    }
    val rt = receiveThread
    if (!receiveRunning || rt == null || !rt.isAlive) {
      promise.reject("E_TD_JSON", "TDLib receive-поток недоступен", null)
      return
    }

    var registeredExtra: String? = null
    try {
      val o = JSONObject(queryJson)
      var extra = coerceExtraKey(o)
      if (extra.isEmpty()) {
        extra = "rn_" + UUID.randomUUID().toString()
        o.put("@extra", extra)
      }
      if (pending.putIfAbsent(extra, promise) != null) {
        promise.reject(
          "E_TD_JSON",
          "Параллельный запрос с тем же @extra; дождитесь ответа или не задавайте @extra вручную.",
          null,
        )
        return
      }
      registeredExtra = extra
      val timeoutRunnable =
        Runnable {
          pendingTimeouts.remove(extra)
          if (pending.remove(extra) != null) {
            Log.e(
              TAG,
              "TIMEOUT extra=$extra pendingLeft=${pending.size} (если сеть ок — смотри лог «error без совпадения @extra» и [tdlib log …])",
            )
            try {
              promise.reject(
                "E_TD_TIMEOUT",
                "TDLib: нет ответа за 4 мин (logcat: TdlibModule). Если интернет в порядке — пересобери приложение с обновлённым нативным модулем.",
                null,
              )
            } catch (_: Exception) {
            }
          }
        }
      pendingTimeouts[extra] = timeoutRunnable
      mainHandler.postDelayed(timeoutRunnable, SEND_TIMEOUT_MS)

      val payload = o.toString()
      synchronized(sendLock) {
        if (destroyed || !receiveRunning) {
          mainHandler.post {
            pendingTimeouts.remove(extra)?.let { mainHandler.removeCallbacks(it) }
            if (pending.remove(extra) != null) {
              promise.reject("E_TD_NATIVE", "TDLib I/O остановлен", null)
            }
          }
          return
        }
        try {
          JsonClient.td_send(clientId, payload)
        } catch (e: Exception) {
          mainHandler.post {
            pendingTimeouts.remove(extra)?.let { mainHandler.removeCallbacks(it) }
            if (pending.remove(extra) != null) {
              promise.reject("E_TD_JSON", e.message, e)
            }
          }
        }
      }
    } catch (e: Exception) {
      val ex = registeredExtra
      if (ex != null) {
        pendingTimeouts.remove(ex)?.let { mainHandler.removeCallbacks(it) }
        if (pending.remove(ex) != null) {
          promise.reject("E_TD_JSON", e.message, e)
        }
      } else {
        promise.reject("E_TD_JSON", e.message, e)
      }
    }
  }

  override fun invalidate() {
    emitLifecycleDiagnostic("invalidate")
    destroyed = true
    receiveRunning = false
    receiveThread?.interrupt()
    try {
      receiveThread?.join(5000)
    } catch (_: Exception) {
    }
    if (receiveThread?.isAlive == true) {
      Log.w(TAG, "receive thread still alive after join; TDLib may still deliver updates briefly")
    }
    receiveThread = null

    for (r in pendingTimeouts.values.toList()) {
      mainHandler.removeCallbacks(r)
    }
    pendingTimeouts.clear()
    val snapshot = pending.entries.toList()
    pending.clear()
    for ((_, p) in snapshot) {
      mainHandler.post {
        try {
          p.reject("E_TD_NATIVE", "Модуль TDLib выгружен (перезагрузка приложения / JS).", null)
        } catch (_: Exception) {
        }
      }
    }
    super.invalidate()
  }
}
