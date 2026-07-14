import Foundation
import React

private final class PendingTdlibRequest {
  let resolve: RCTPromiseResolveBlock
  let reject: RCTPromiseRejectBlock
  var timeoutWorkItem: DispatchWorkItem?

  init(resolve: @escaping RCTPromiseResolveBlock, reject: @escaping RCTPromiseRejectBlock) {
    self.resolve = resolve
    self.reject = reject
  }
}

private func shouldEmitUpdateToJs(_ updateType: String) -> Bool {
  switch updateType {
  case "updateAuthorizationState",
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
       "updateUserChatAction":
    return true
  default:
    return false
  }
}

@objc(Tdlib)
final class Tdlib: RCTEventEmitter {
  private static let sendTimeoutSeconds: TimeInterval = 240

  private let stateLock = NSLock()
  private let sendLock = NSLock()
  /// Serializes td_json_client_receive vs destroy/recreate (TDLib forbids concurrent use).
  private let clientIoLock = NSLock()
  private var client: UnsafeMutableRawPointer?
  private var receiveThread: Thread?
  private var destroyed = false
  private var receivePaused = false
  private var hasActiveListeners = false
  private var pending: [String: PendingTdlibRequest] = [:]

  override init() {
    super.init()
    client = td_json_client_create()
    startReceiveThread()
  }

  override static func requiresMainQueueSetup() -> Bool {
    false
  }

  override func supportedEvents() -> [String]! {
    ["td_json_update"]
  }

  override func startObserving() {
    stateLock.lock()
    hasActiveListeners = true
    stateLock.unlock()
  }

  override func stopObserving() {
    stateLock.lock()
    hasActiveListeners = false
    stateLock.unlock()
  }

  @objc(recreateClient:rejecter:)
  func recreateClient(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    rejectAllPending(code: "E_TD_RECREATE", message: "TDLib client is being recreated.")

    // Pause receive loop, then take clientIoLock so we never destroy while
    // td_json_client_receive is in flight (undefined behavior / native crash).
    stateLock.lock()
    receivePaused = true
    stateLock.unlock()

    sendLock.lock()
    clientIoLock.lock()

    stateLock.lock()
    let oldClient = client
    client = nil
    stateLock.unlock()

    if let oldClient {
      td_json_client_destroy(oldClient)
    }

    let newClient = td_json_client_create()
    stateLock.lock()
    client = newClient
    receivePaused = false
    let created = client != nil
    stateLock.unlock()

    clientIoLock.unlock()
    sendLock.unlock()

    ensureReceiveThreadRunning()

    if !created {
      reject("E_TD_NATIVE", "Failed to recreate TDLib client.", nil)
      return
    }
    NSLog("[Tdlib] client recreated — session can reload from database_directory")
    resolve(true)
  }

  @objc(getUses24HourClock:rejecter:)
  func getUses24HourClock(
    _ resolve: RCTPromiseResolveBlock,
    rejecter reject: RCTPromiseRejectBlock
  ) {
    let format = DateFormatter.dateFormat(
      fromTemplate: "j",
      options: 0,
      locale: Locale.autoupdatingCurrent
    ) ?? ""
    resolve(!format.contains("a"))
  }

  @objc(sendClientJson:resolver:rejecter:)
  func sendClientJson(
    _ queryJson: String,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    guard let client = activeClient() else {
      reject("E_TD_JSON", "TDLib iOS framework is not loaded. Run npm run tdlib:fetch-ios and pod install.", nil)
      return
    }

    var payloadObject: [String: Any]
    do {
      guard let data = queryJson.data(using: .utf8),
            let object = try JSONSerialization.jsonObject(with: data) as? [String: Any] else {
        reject("E_TD_JSON", "TDLib query must be a JSON object.", nil)
        return
      }
      payloadObject = object
    } catch {
      reject("E_TD_JSON", error.localizedDescription, error)
      return
    }

    var extra = coerceExtraKey(payloadObject["@extra"])
    if extra.isEmpty {
      extra = "rn_\(UUID().uuidString)"
      payloadObject["@extra"] = extra
    }

    let pendingRequest = PendingTdlibRequest(resolve: resolve, reject: reject)
    if !registerPending(extra: extra, request: pendingRequest) {
      reject(
        "E_TD_JSON",
        "Parallel TDLib request with the same @extra. Wait for the response or avoid custom @extra.",
        nil
      )
      return
    }

    guard let payloadData = try? JSONSerialization.data(withJSONObject: payloadObject),
          let payload = String(data: payloadData, encoding: .utf8) else {
      removePending(extra: extra)?.reject("E_TD_JSON", "Failed to serialize TDLib query.", nil)
      return
    }

    scheduleTimeout(extra: extra, request: pendingRequest)

    sendLock.lock()
    defer { sendLock.unlock() }

    if isDestroyed() {
      removePending(extra: extra)?.reject("E_TD_NATIVE", "TDLib I/O is stopped.", nil)
      return
    }

    payload.withCString { cString in
      td_json_client_send(client, cString)
    }
  }

  override func invalidate() {
    markDestroyed()
    stateLock.lock()
    receivePaused = true
    stateLock.unlock()
    receiveThread?.cancel()

    let deadline = Date().addingTimeInterval(2)
    while receiveThread?.isExecuting == true && Date() < deadline {
      Thread.sleep(forTimeInterval: 0.05)
    }

    rejectAllPending(code: "E_TD_NATIVE", message: "TDLib module was unloaded.")

    // Same lock order as recreateClient: never destroy while send/receive is in flight.
    sendLock.lock()
    clientIoLock.lock()
    if let client {
      td_json_client_destroy(client)
      self.client = nil
    }
    clientIoLock.unlock()
    sendLock.unlock()

    super.invalidate()
  }

  deinit {
    invalidate()
  }

  private func startReceiveThread() {
    receiveThread = Thread { [weak self] in
      self?.receiveLoop()
    }
    receiveThread?.name = "tdlib-receive"
    receiveThread?.start()
  }

  /** Restart receive loop after recreateClient if the previous thread exited. */
  private func ensureReceiveThreadRunning() {
    stateLock.lock()
    let alive = receiveThread?.isExecuting == true
    stateLock.unlock()
    if alive {
      return
    }
    startReceiveThread()
  }

  private func receiveLoop() {
    while !isDestroyed(), !Thread.current.isCancelled {
      stateLock.lock()
      let paused = receivePaused
      stateLock.unlock()
      if paused {
        Thread.sleep(forTimeInterval: 0.02)
        continue
      }

      clientIoLock.lock()
      let clientPtr: UnsafeMutableRawPointer?
      if isReceivePausedUnlocked() {
        clientIoLock.unlock()
        Thread.sleep(forTimeInterval: 0.02)
        continue
      }
      clientPtr = activeClient()
      guard let client = clientPtr else {
        clientIoLock.unlock()
        // Client briefly nil during recreateClient — wait instead of exiting forever.
        Thread.sleep(forTimeInterval: 0.05)
        continue
      }
      // Short timeout so recreateClient can acquire clientIoLock promptly.
      let timeout = pendingCount() > 0 ? 0.05 : 0.2
      let raw = td_json_client_receive(client, timeout)
      clientIoLock.unlock()

      guard let raw else {
        continue
      }
      let json = String(cString: raw)
      handleIncoming(json)
    }
  }

  private func isReceivePausedUnlocked() -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return receivePaused
  }

  private func handleIncoming(_ json: String) {
    guard let data = json.data(using: .utf8),
          let object = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
      return
    }

    let extra = coerceExtraKey(object["@extra"])
    if !extra.isEmpty {
      if let request = removePending(extra: extra) {
        DispatchQueue.main.async {
          request.resolve(json)
        }
        return
      }

      let msgType = object["@type"] as? String ?? ""
      if pendingCount() > 0 {
        NSLog(
          "[Tdlib] response @extra mismatch (got=%@, type=%@, pending=%d) — not pairing to avoid corrupting parallel requests",
          extra,
          msgType,
          pendingCount()
        )
      }
      if msgType != "updateAuthorizationState" && shouldEmitUpdateToJs(msgType) == false {
        return
      }
    }

    let updateType = object["@type"] as? String ?? ""
    if updateType == "updateAuthorizationState",
       let state = object["authorization_state"] as? [String: Any],
       let stateType = state["@type"] as? String {
      NSLog("[Tdlib] updateAuthorizationState -> %@", stateType)
    }

    guard shouldEmitUpdateToJs(updateType), listenersActive() else {
      return
    }

    DispatchQueue.main.async { [weak self] in
      guard let self, self.listenersActive(), !self.isDestroyed() else {
        return
      }
      self.sendEvent(withName: "td_json_update", body: ["json": json])
    }
  }

  private func coerceExtraKey(_ value: Any?) -> String {
    guard let value else {
      return ""
    }
    if let string = value as? String {
      return string.trimmingCharacters(in: .whitespacesAndNewlines)
    }
    if let number = value as? NSNumber {
      return number.stringValue
    }
    return String(describing: value).trimmingCharacters(in: .whitespacesAndNewlines)
  }

  private func activeClient() -> UnsafeMutableRawPointer? {
    stateLock.lock()
    defer { stateLock.unlock() }
    return destroyed ? nil : client
  }

  private func isDestroyed() -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return destroyed
  }

  private func markDestroyed() {
    stateLock.lock()
    destroyed = true
    stateLock.unlock()
  }

  private func listenersActive() -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    return hasActiveListeners
  }

  private func registerPending(extra: String, request: PendingTdlibRequest) -> Bool {
    stateLock.lock()
    defer { stateLock.unlock() }
    if pending[extra] != nil {
      return false
    }
    pending[extra] = request
    return true
  }

  private func removePending(extra: String) -> PendingTdlibRequest? {
    stateLock.lock()
    let request = pending.removeValue(forKey: extra)
    stateLock.unlock()
    request?.timeoutWorkItem?.cancel()
    return request
  }

  private func pendingCount() -> Int {
    stateLock.lock()
    defer { stateLock.unlock() }
    return pending.count
  }

  private func takeSinglePendingFallback() -> PendingTdlibRequest? {
    stateLock.lock()
    guard pending.count == 1, let (extra, request) = pending.first else {
      stateLock.unlock()
      return nil
    }
    pending.removeValue(forKey: extra)
    stateLock.unlock()
    request.timeoutWorkItem?.cancel()
    NSLog("[Tdlib] response @extra mismatch; resolving the only pending request %@", extra)
    return request
  }

  private func scheduleTimeout(extra: String, request: PendingTdlibRequest) {
    let timeoutWorkItem = DispatchWorkItem { [weak self, weak request] in
      guard let self, let request else {
        return
      }
      if self.removePending(extra: extra) != nil {
        request.reject(
          "E_TD_TIMEOUT",
          "TDLib: no response for 4 minutes. Check iOS TDLib logs and network connectivity.",
          nil
        )
      }
    }
    request.timeoutWorkItem = timeoutWorkItem
    DispatchQueue.main.asyncAfter(
      deadline: .now() + Self.sendTimeoutSeconds,
      execute: timeoutWorkItem
    )
  }

  private func rejectAllPending(code: String, message: String) {
    stateLock.lock()
    let snapshot = pending
    pending.removeAll()
    stateLock.unlock()

    for (_, request) in snapshot {
      request.timeoutWorkItem?.cancel()
      DispatchQueue.main.async {
        request.reject(code, message, nil)
      }
    }
  }
}
