package com.anonymous.mobile

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
@ReactModule(name = TdlibModule.NAME)
class TdlibModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "Tdlib"
    private const val TAG = "TdlibModule"
    private const val SEND_TIMEOUT_MS = 240_000L
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
      val msgType = obj.optString("@type", "")
      if (msgType == "error") {
        // TDLib иногда возвращает ошибку (FLOOD_WAIT, сеть, PHONE_NUMBER_INVALID) с @extra,
        // которое не совпадает ни с одним pending — например при параллельных запросах или
        // если TDLib переиспользует @extra предыдущего запроса.
        // Если в очереди ровно один ожидающий запрос — это явно ответ на него.
        val pendingEntries = pending.entries.toList()
        if (pendingEntries.size == 1) {
          val (onlyExtra, onlyPromise) = pendingEntries[0]
          pending.remove(onlyExtra)
          val timeoutRunnable = pendingTimeouts.remove(onlyExtra)
          if (timeoutRunnable != null) {
            mainHandler.removeCallbacks(timeoutRunnable)
          }
          Log.w(TAG, "error с несовпадающим @extra='$extra' → разрешаем единственный pending extra='$onlyExtra'. Тип ошибки: ${obj.optString("message", "?")}.")
          mainHandler.post {
            try {
              onlyPromise.resolve(json)
            } catch (_: Exception) {
            }
          }
          // Всё равно эмитим апдейт, чтобы JS-слушатели получили updateAuthorizationState / ошибку
        } else {
          Log.w(
            TAG,
            "error без совпадения @extra (got extra='$extra', pending=${pending.size}): ${obj.optString("message", "?")}",
          )
        }
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
