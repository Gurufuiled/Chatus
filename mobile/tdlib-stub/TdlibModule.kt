package com.anonymous.mobile

import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.module.annotations.ReactModule
import org.json.JSONObject

/**
 * Stub JSON bridge until libtdjson.so is linked under jniLibs.
 * Ответы в формате TDLib JSON для разработки UI.
 */
@ReactModule(name = TdlibModule.NAME)
class TdlibModule(private val reactContext: ReactApplicationContext) :
  ReactContextBaseJavaModule(reactContext) {

  companion object {
    const val NAME = "Tdlib"
  }

  override fun getName(): String = NAME

  @ReactMethod
  fun addListener(eventName: String) {
  }

  @ReactMethod
  fun removeListeners(count: Int) {
  }

  @ReactMethod
  fun sendClientJson(queryJson: String, promise: Promise) {
    try {
      val o = JSONObject(queryJson)
      val type = o.optString("@type", "")
      val response = when (type) {
        "getAuthorizationState" ->
          "{\"@type\":\"authorizationStateWaitPhoneNumber\"}"
        "setTdlibParameters" -> "{\"@type\":\"ok\"}"
        "setAuthenticationPhoneNumber" -> "{\"@type\":\"ok\"}"
        "checkAuthenticationCode" -> "{\"@type\":\"ok\"}"
        "getChats" -> "{\"@type\":\"chats\",\"chat_ids\":[],\"total_count\":0}"
        else -> "{\"@type\":\"ok\"}"
      }
      promise.resolve(response)
    } catch (e: Exception) {
      promise.reject("E_TD_JSON", e.message, e)
    }
  }
}
