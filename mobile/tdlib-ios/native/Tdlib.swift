import Foundation
import AVFoundation
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

  /// Center-crops a local video to a square H.264/AAC MP4 (even side ≤ maxSide) for Telegram video notes.
  @objc(centerCropSquareVideo:maxSide:resolver:rejecter:)
  func centerCropSquareVideo(
    _ inputPath: String,
    maxSide: NSNumber,
    resolver resolve: @escaping RCTPromiseResolveBlock,
    rejecter reject: @escaping RCTPromiseRejectBlock
  ) {
    DispatchQueue.global(qos: .userInitiated).async {
      let trimmed = inputPath.trimmingCharacters(in: .whitespacesAndNewlines)
      guard !trimmed.isEmpty else {
        reject("E_VIDEO_CROP", "Empty video path", nil)
        return
      }
      let path =
        trimmed.hasPrefix("file://")
        ? String(trimmed.dropFirst("file://".count))
        : trimmed
      let inputURL = URL(fileURLWithPath: path.removingPercentEncoding ?? path)
      let asset = AVURLAsset(url: inputURL)
      guard let videoTrack = asset.tracks(withMediaType: .video).first else {
        reject("E_VIDEO_CROP", "Video track not found", nil)
        return
      }

      // Orient via preferredTransform, then normalize origin (portrait footgun), then center-crop.
      let preferred = videoTrack.preferredTransform
      let natural = videoTrack.naturalSize
      let boundingRect = CGRect(origin: .zero, size: natural).applying(preferred)
      let srcW = abs(boundingRect.width)
      let srcH = abs(boundingRect.height)
      guard srcW > 1, srcH > 1 else {
        reject("E_VIDEO_CROP", "Invalid video dimensions", nil)
        return
      }

      let cropSide = min(srcW, srcH)
      let maxSidePx = max(240.0, min(640.0, maxSide.doubleValue))
      let sideRaw = Int(min(cropSide, maxSidePx).rounded(.down))
      let evenSide = max(240, sideRaw - (sideRaw % 2))
      let scale = CGFloat(evenSide) / cropSide
      let xOffset = (srcW - cropSide) / 2.0
      let yOffset = (srcH - cropSide) / 2.0

      let composition = AVMutableComposition()
      guard
        let compositionVideoTrack = composition.addMutableTrack(
          withMediaType: .video,
          preferredTrackID: kCMPersistentTrackID_Invalid
        )
      else {
        reject("E_VIDEO_CROP", "Failed to create composition track", nil)
        return
      }

      let duration = asset.duration
      let timeRange = CMTimeRange(start: .zero, duration: duration)
      do {
        try compositionVideoTrack.insertTimeRange(timeRange, of: videoTrack, at: .zero)
      } catch {
        reject("E_VIDEO_CROP", error.localizedDescription, error)
        return
      }

      if let audioTrack = asset.tracks(withMediaType: .audio).first,
         let compositionAudioTrack = composition.addMutableTrack(
           withMediaType: .audio,
           preferredTrackID: kCMPersistentTrackID_Invalid
         )
      {
        try? compositionAudioTrack.insertTimeRange(timeRange, of: audioTrack, at: .zero)
      }

      var transform = preferred
      transform.tx -= boundingRect.origin.x
      transform.ty -= boundingRect.origin.y
      transform = transform.concatenating(CGAffineTransform(translationX: -xOffset, y: -yOffset))
      transform = transform.concatenating(CGAffineTransform(scaleX: scale, y: scale))

      let layerInstruction = AVMutableVideoCompositionLayerInstruction(assetTrack: compositionVideoTrack)
      layerInstruction.setTransform(transform, at: .zero)

      let instruction = AVMutableVideoCompositionInstruction()
      instruction.timeRange = timeRange
      instruction.layerInstructions = [layerInstruction]

      let videoComposition = AVMutableVideoComposition()
      videoComposition.renderSize = CGSize(width: evenSide, height: evenSide)
      videoComposition.frameDuration = CMTime(value: 1, timescale: 30)
      videoComposition.instructions = [instruction]

      let outURL = URL(fileURLWithPath: NSTemporaryDirectory())
        .appendingPathComponent("video-note-square-\(Int(Date().timeIntervalSince1970 * 1000)).mp4")
      try? FileManager.default.removeItem(at: outURL)

      do {
        try Self.exportSquareH264Mp4(
          composition: composition,
          videoComposition: videoComposition,
          outputURL: outURL,
          side: evenSide
        )
        resolve(outURL.path)
      } catch {
        try? FileManager.default.removeItem(at: outURL)
        reject("E_VIDEO_CROP", error.localizedDescription, error)
      }
    }
  }

  /// Forced H.264/AAC MP4 (AVAssetExportSession HighestQuality often emits HEVC).
  private static func exportSquareH264Mp4(
    composition: AVMutableComposition,
    videoComposition: AVMutableVideoComposition,
    outputURL: URL,
    side: Int
  ) throws {
    let reader = try AVAssetReader(asset: composition)
    let videoTracks = composition.tracks(withMediaType: .video)
    guard !videoTracks.isEmpty else {
      throw NSError(
        domain: "Tdlib",
        code: 1,
        userInfo: [NSLocalizedDescriptionKey: "Composition has no video track"]
      )
    }

    let readerVideoOutput = AVAssetReaderVideoCompositionOutput(
      videoTracks: videoTracks,
      videoSettings: [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_420YpCbCr8BiPlanarVideoRange
      ]
    )
    readerVideoOutput.videoComposition = videoComposition
    readerVideoOutput.alwaysCopiesSampleData = false
    guard reader.canAdd(readerVideoOutput) else {
      throw NSError(
        domain: "Tdlib",
        code: 2,
        userInfo: [NSLocalizedDescriptionKey: "Cannot add video reader output"]
      )
    }
    reader.add(readerVideoOutput)

    var readerAudioOutput: AVAssetReaderTrackOutput?
    if let audioTrack = composition.tracks(withMediaType: .audio).first {
      let audioOutput = AVAssetReaderTrackOutput(
        track: audioTrack,
        outputSettings: [
          AVFormatIDKey: kAudioFormatLinearPCM,
          AVLinearPCMIsBigEndianKey: false,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMBitDepthKey: 16,
        ]
      )
      audioOutput.alwaysCopiesSampleData = false
      if reader.canAdd(audioOutput) {
        reader.add(audioOutput)
        readerAudioOutput = audioOutput
      }
    }

    let writer = try AVAssetWriter(outputURL: outputURL, fileType: .mp4)
    let bitrate = max(1_200_000, side * side * 4)
    let writerVideoInput = AVAssetWriterInput(
      mediaType: .video,
      outputSettings: [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: side,
        AVVideoHeightKey: side,
        AVVideoCompressionPropertiesKey: [
          AVVideoAverageBitRateKey: bitrate,
          AVVideoProfileLevelKey: AVVideoProfileLevelH264BaselineAutoLevel,
          AVVideoMaxKeyFrameIntervalKey: 30,
        ],
      ]
    )
    writerVideoInput.expectsMediaDataInRealTime = false
    guard writer.canAdd(writerVideoInput) else {
      throw NSError(
        domain: "Tdlib",
        code: 3,
        userInfo: [NSLocalizedDescriptionKey: "Cannot add H.264 writer input"]
      )
    }
    writer.add(writerVideoInput)

    var writerAudioInput: AVAssetWriterInput?
    if readerAudioOutput != nil {
      let audioInput = AVAssetWriterInput(
        mediaType: .audio,
        outputSettings: [
          AVFormatIDKey: kAudioFormatMPEG4AAC,
          AVNumberOfChannelsKey: 1,
          AVSampleRateKey: 44100,
          AVEncoderBitRateKey: 96_000,
        ]
      )
      audioInput.expectsMediaDataInRealTime = false
      if writer.canAdd(audioInput) {
        writer.add(audioInput)
        writerAudioInput = audioInput
      }
    }

    guard reader.startReading() else {
      throw reader.error
        ?? NSError(
          domain: "Tdlib",
          code: 4,
          userInfo: [NSLocalizedDescriptionKey: "Asset reader failed to start"]
        )
    }
    guard writer.startWriting() else {
      throw writer.error
        ?? NSError(
          domain: "Tdlib",
          code: 5,
          userInfo: [NSLocalizedDescriptionKey: "Asset writer failed to start"]
        )
    }
    writer.startSession(atSourceTime: .zero)

    let videoDone = DispatchSemaphore(value: 0)
    var videoWriteError: Error?
    writerVideoInput.requestMediaDataWhenReady(on: DispatchQueue(label: "tdlib.video.note.video")) {
      while writerVideoInput.isReadyForMoreMediaData {
        if reader.status == .failed {
          videoWriteError = reader.error
          writerVideoInput.markAsFinished()
          videoDone.signal()
          return
        }
        guard let sample = readerVideoOutput.copyNextSampleBuffer() else {
          writerVideoInput.markAsFinished()
          videoDone.signal()
          return
        }
        if !writerVideoInput.append(sample) {
          videoWriteError = writer.error
          writerVideoInput.markAsFinished()
          videoDone.signal()
          return
        }
      }
    }

    let audioDone = DispatchSemaphore(value: 0)
    var audioWriteError: Error?
    if let readerAudioOutput, let writerAudioInput {
      writerAudioInput.requestMediaDataWhenReady(on: DispatchQueue(label: "tdlib.video.note.audio")) {
        while writerAudioInput.isReadyForMoreMediaData {
          if reader.status == .failed {
            audioWriteError = reader.error
            writerAudioInput.markAsFinished()
            audioDone.signal()
            return
          }
          guard let sample = readerAudioOutput.copyNextSampleBuffer() else {
            writerAudioInput.markAsFinished()
            audioDone.signal()
            return
          }
          if !writerAudioInput.append(sample) {
            audioWriteError = writer.error
            writerAudioInput.markAsFinished()
            audioDone.signal()
            return
          }
        }
      }
    } else {
      audioDone.signal()
    }

    let timeout = DispatchTime.now() + 120
    let videoWait = videoDone.wait(timeout: timeout)
    let audioWait = audioDone.wait(timeout: timeout)
    if videoWait == .timedOut || audioWait == .timedOut {
      reader.cancelReading()
      writer.cancelWriting()
      throw NSError(
        domain: "Tdlib",
        code: 6,
        userInfo: [NSLocalizedDescriptionKey: "Video crop export timed out"]
      )
    }
    if let videoWriteError {
      reader.cancelReading()
      writer.cancelWriting()
      throw videoWriteError
    }
    if let audioWriteError {
      reader.cancelReading()
      writer.cancelWriting()
      throw audioWriteError
    }
    if reader.status == .failed {
      writer.cancelWriting()
      throw reader.error
        ?? NSError(
          domain: "Tdlib",
          code: 7,
          userInfo: [NSLocalizedDescriptionKey: "Asset reader failed"]
        )
    }

    let finishDone = DispatchSemaphore(value: 0)
    var finishError: Error?
    writer.finishWriting {
      finishError = writer.error
      finishDone.signal()
    }
    if finishDone.wait(timeout: .now() + 30) == .timedOut {
      writer.cancelWriting()
      throw NSError(
        domain: "Tdlib",
        code: 8,
        userInfo: [NSLocalizedDescriptionKey: "Video crop finish timed out"]
      )
    }
    if writer.status != .completed {
      throw finishError
        ?? NSError(
          domain: "Tdlib",
          code: 9,
          userInfo: [NSLocalizedDescriptionKey: "H.264 export did not complete"]
        )
    }
    guard FileManager.default.fileExists(atPath: outputURL.path) else {
      throw NSError(
        domain: "Tdlib",
        code: 10,
        userInfo: [NSLocalizedDescriptionKey: "Export produced no file"]
      )
    }
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
