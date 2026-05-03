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
 * React Native bridge: [JsonClient.td_send] / [JsonClient.td_receive] with @extra correlation for
 * [sendClientJson] promises; all other incoming JSON is emitted as `td_json_update`.
 */
@ReactModule(name = TdlibModule.NAME)
class TdlibModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "Tdlib"
    private const val TAG = "TdlibModule"
  }

  private val clientId: Int
  private val receiverThread: Thread
  @Volatile private var receiverRunning = false
  private val pending = ConcurrentHashMap<String, Promise>()
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
      receiverRunning = true
      receiverThread =
        Thread(
          {
            while (receiverRunning) {
              try {
                val json = JsonClient.td_receive(1.0) ?: continue
                handleIncoming(json)
              } catch (_: InterruptedException) {
                break
              } catch (e: Exception) {
                Log.w(TAG, "td_receive loop", e)
              }
            }
          },
          "tdlib-receive",
        )
      receiverThread.isDaemon = true
      receiverThread.start()
    } else {
      receiverThread = Thread({})
    }
  }

  private fun handleIncoming(json: String) {
    val obj =
      try {
        JSONObject(json)
      } catch (_: Exception) {
        return
      }
    val cid = obj.optInt("@client_id", -1)
    if (cid >= 0 && cid != clientId) {
      return
    }
    val extra =
      if (obj.has("@extra") && !obj.isNull("@extra")) {
        obj.optString("@extra", "")
      } else {
        ""
      }
    if (extra.isNotEmpty()) {
      val p = pending.remove(extra)
      if (p != null) {
        mainHandler.post { p.resolve(json) }
        return
      }
    }
    mainHandler.post {
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
    try {
      val o = JSONObject(queryJson)
      var extra =
        if (o.has("@extra") && !o.isNull("@extra")) {
          o.optString("@extra", "")
        } else {
          ""
        }
      if (extra.isEmpty()) {
        extra = "rn_" + UUID.randomUUID().toString()
        o.put("@extra", extra)
      }
      pending[extra] = promise
      JsonClient.td_send(clientId, o.toString())
      mainHandler.postDelayed(
        {
          if (pending.remove(extra) != null) {
            promise.reject(
              "E_TD_TIMEOUT",
              "TDLib: нет ответа за 120 с (проверь сеть или логи).",
              null,
            )
          }
        },
        120_000L,
      )
    } catch (e: Exception) {
      promise.reject("E_TD_JSON", e.message, e)
    }
  }

  override fun invalidate() {
    receiverRunning = false
    try {
      receiverThread.interrupt()
    } catch (_: Exception) {
    }
    pending.clear()
    super.invalidate()
  }
}
