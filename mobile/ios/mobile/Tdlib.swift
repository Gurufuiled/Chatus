image.pngimport Foundation
import React

@objc(Tdlib)
class Tdlib: NSObject {
  @objc static func requiresMainQueueSetup() -> Bool {
    true
  }

  @objc(sendClientJson:resolver:rejecter:)
  func sendClientJson(
    _ queryJson: String,
    resolver resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    if queryJson.contains("getAuthorizationState") {
      resolve("{\"@type\":\"authorizationStateWaitPhoneNumber\"}")
      return
    }
    if queryJson.contains("setTdlibParameters") ||
      queryJson.contains("setAuthenticationPhoneNumber") ||
      queryJson.contains("checkAuthenticationCode") {
      resolve("{\"@type\":\"ok\"}")
      return
    }
    if queryJson.contains("getChats") {
      resolve("{\"@type\":\"chats\",\"chat_ids\":[],\"total_count\":0}")
      return
    }
    resolve("{\"@type\":\"ok\"}")
  }

  @objc(addListener:)
  func addListener(_ eventName: String) {}

  @objc(removeListeners:)
  func removeListeners(_ count: NSNumber) {}
}
