package com.anonymous.mobile

import android.os.Handler
import android.os.HandlerThread
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
 * Все вызовы **td_send** и **td_receive** выполняются на одном [HandlerThread] — так исключаются
 * гонки в JNI/сборке libtdjson, когда ответы «теряются» и JS видит таймаут при живом TDLib (не сеть).
 */
@ReactModule(name = TdlibModule.NAME)
class TdlibModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "Tdlib"
    private const val TAG = "TdlibModule"
    private const val SEND_TIMEOUT_MS = 240_000L
    /** Когда очередь пуста — не крутить td_receive(0) в tight loop. */
    private const val IDLE_RECEIVE_DELAY_MS = 20L
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

  private val clientId: Int
  @Volatile private var destroyed = false
  @Volatile private var ioRunning = false
  private var ioThread: HandlerThread? = null
  private var ioHandler: Handler? = null
  private val pending = ConcurrentHashMap<String, Promise>()
  private val pendingTimeouts = ConcurrentHashMap<String, Runnable>()
  private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

  private val receivePump =
    object : Runnable {
      override fun run() {
        val h = ioHandler ?: return
        if (!ioRunning || destroyed) return
        try {
          val json = JsonClient.td_receive(0.1) ?: run {
            h.postDelayed(this, IDLE_RECEIVE_DELAY_MS)
            return
          }
          handleIncoming(json)
          h.post(this)
        } catch (_: InterruptedException) {
          // ignore
        } catch (e: Exception) {
          Log.w(TAG, "td_receive", e)
          h.postDelayed(this, 200L)
        }
      }
    }

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
      val thread = HandlerThread("tdlib-io").apply { start() }
      ioThread = thread
      ioHandler = Handler(thread.looper)
      ioRunning = true
      ioHandler?.post(receivePump)
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
          if (destroyed) return@post
          try {
            p.resolve(json)
          } catch (_: Exception) {
          }
        }
        return
      }
      if (pending.isNotEmpty() && obj.optString("@type", "") == "error") {
        Log.w(
          TAG,
          "error без совпадения @extra (got extra='$extra'); pending sample: ${pending.keys.take(4)}",
        )
      }
    }
    val cid = obj.optInt("@client_id", -1)
    if (cid >= 0 && cid != clientId) {
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
    val h = ioHandler
    if (h == null || !ioRunning) {
      promise.reject("E_TD_JSON", "TDLib I/O поток недоступен", null)
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
      h.post {
        if (destroyed || !ioRunning) {
          mainHandler.post {
            pendingTimeouts.remove(extra)?.let { mainHandler.removeCallbacks(it) }
            if (pending.remove(extra) != null) {
              promise.reject("E_TD_NATIVE", "TDLib I/O остановлен", null)
            }
          }
          return@post
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
    destroyed = true
    ioRunning = false
    ioHandler?.removeCallbacks(receivePump)
    ioHandler?.removeCallbacksAndMessages(null)
    try {
      ioThread?.quitSafely()
    } catch (_: Exception) {
    }
    try {
      ioThread?.join(2500)
    } catch (_: Exception) {
    }
    ioHandler = null
    ioThread = null

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
