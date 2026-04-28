# Audit: Explorer's Findings — Voice Recording & Empty Messages

## Review Summary

The explorer correctly identified both issues. **Issue 1 (immediate send on release)** is a confirmed UX bug: `LongPress.onEnd` and `Pan.onEnd` both call `handleRecordingEnd`, causing voice messages to send on finger release instead of requiring an explicit tap on Send. **Issue 2 (empty message in mock chat)** is likely caused by Rust Message deserialization mismatch with the server payload (`type` vs `msg_type`, `voice` vs `Voice`) and/or download failure leaving `local_path` null. Severity: Issue 1 is **Critical** (wrong UX); Issue 2 is **Warning** (depends on server format and network).

---

## Issues

### Issue 1: Immediate send on release — **Critical**

**File:** `messenger/mobile/src/components/InputBar.tsx`

**Current behavior:**
- `LongPress.onEnd` (lines 153–155) calls `handleRecordingEnd` on finger release after 300ms hold.
- `Pan.onEnd` (lines 168–170) and `recordingPanGesture.onEnd` (lines 188–190) also call `handleRecordingEnd` on finger release.
- Result: voice message is sent immediately on release instead of requiring a tap on Send.

**Expected behavior (Telegram-like):**
- Release after 300ms → show recording bar with Send button; user must tap Send.
- Swipe left to cancel → release → cancel recording.
- `handleRecordingEnd` should run only when: (a) user taps Send, or (b) user swipes to cancel and releases.

**Fix:**

1. **LongPress.onEnd** — remove the `handleRecordingEnd` call. On release, do nothing; the UI already switches to the recording bar when `isRecording` becomes true.

2. **Pan.onEnd** and **recordingPanGesture.onEnd** — call `handleRecordingEnd` only when `cancelledShared.value === 1` (swipe-to-cancel). When `cancelledShared === 0`, do nothing.

**Exact code changes:**

```tsx
// longPressGesture — remove onEnd entirely or make it a no-op
const longPressGesture = useMemo(
  () =>
    Gesture.LongPress()
      .minDuration(300)
      .enabled(canTriggerVoice && !isRecording)
      .onStart(() => {
        runOnJS(handleLongPressStart)();
      }),
  // Remove .onEnd(() => runOnJS(handleRecordingEnd)())
  [canTriggerVoice, isRecording, handleLongPressStart]
);

// panGesture — only call handleRecordingEnd when cancelled
const panGesture = useMemo(
  () =>
    Gesture.Pan()
      .enabled(isRecording)
      .minDistance(0)
      .onUpdate((e) => {
        if (e.translationX < -SWIPE_CANCEL_THRESHOLD) {
          cancelledShared.value = 1;
        }
      })
      .onEnd(() => {
        if (cancelledShared.value === 1) {
          runOnJS(handleRecordingEnd)();
        }
      }),
  [isRecording, handleRecordingEnd, cancelledShared]
);

// recordingPanGesture — same logic
const recordingPanGesture = useMemo(
  () =>
    Gesture.Pan()
      .minDistance(0)
      .onUpdate((e) => {
        if (e.translationX < -SWIPE_CANCEL_THRESHOLD) {
          cancelledShared.value = 1;
        }
      })
      .onEnd(() => {
        if (cancelledShared.value === 1) {
          runOnJS(handleRecordingEnd)();
        }
      }),
  [handleRecordingEnd, cancelledShared]
);
```

---

### Issue 2: Empty message in mock chat — **Warning**

**Possible causes:**

#### (a) Rust Message deserialization mismatch

**Server payload** (from `server/src/common/mappers.ts` and `ws.types.ts`):
- `message.type` (lowercase: `"voice"`, `"text"`, `"video_note"`)
- `message.content`, `message.status` (lowercase: `"sent"`)

**Rust `Message`** (`messenger/rust-core/src/models/message.rs`):
- Expects `msg_type` (no alias for `type`)
- `MessageType` enum uses default serde → expects PascalCase (`"Voice"`, `"Text"`, `"VideoNote"`)
- `MessageStatus` / `TransportType` same issue
- Missing `#[serde(default)]` for `reply_to_id`, `is_edited`, `is_deleted`, `transport` if server omits them

If the server sends `type: "voice"` and Rust expects `msg_type` and `"Voice"`, deserialization fails. The WebSocket `read_loop` logs a parse error and the message never reaches the event loop. If a different code path (e.g. mock) uses a compatible format, the message may appear but with wrong or default fields.

**Fix for `messenger/rust-core/src/models/message.rs`:**

```rust
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum MessageType {
    Text,
    Image,
    Voice,
    VideoNote,
    Video,
    File,
    System,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum MessageStatus { ... }

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum TransportType { ... }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Message {
    pub id: String,
    pub chat_id: String,
    pub sender_id: String,
    #[serde(alias = "type")]
    pub msg_type: MessageType,
    pub content: Option<String>,
    #[serde(default)]
    pub reply_to_id: Option<String>,
    #[serde(default)]
    pub is_edited: bool,
    #[serde(default)]
    pub is_deleted: bool,
    pub status: MessageStatus,
    #[serde(default)]
    pub transport: TransportType,
    #[serde(default)]
    pub server_id: Option<String>,
    pub created_at: i64,
    pub updated_at: i64,
    // ... rest unchanged
}
```

**Note:** `MessageStatus` and `TransportType` must also accept lowercase (`"sent"`, `"server"`). Add `#[serde(rename_all = "snake_case")]` if the server sends snake_case.

#### (b) Download fails, `local_path` stays null

**Flow** (`messenger/rust-core/src/core.rs` ~1003–1052):
- For voice messages with `media_url`, core inserts Message + Media, then spawns a download task.
- `on_new_message` is called only after a successful download.
- If download fails, Media is updated to `Failed` but `on_new_message` is never called.
- If the message list is loaded from DB (e.g. on reload), the message appears but Media has no `local_path`.
- `VoiceBubble` shows "Loading…" when `!media`, and play does nothing when `media.local_path` is null.

**Mitigation:** Ensure download errors are logged and consider calling `on_new_message` even when download fails, so the UI can show a failed state instead of an empty/loading bubble. This is a design choice.

---

## Positives

- `handledEndRef` correctly prevents double execution when both gestures fire.
- Send button (`Pressable` with `handleRecordingEnd`) is the correct path for sending after release.
- `cancelledShared` is used correctly for swipe-to-cancel.
- Voice/VideoNote handling in `core.rs` is structured with clear separation of receive vs download.

---

## Verdict

- [ ] Approve
- [ ] Approve with minor fixes
- [x] **Request changes**

**Required:** Fix Issue 1 (InputBar gesture logic).  
**Recommended:** Fix Issue 2a (Rust Message deserialization) if the server sends `type` and lowercase enums.  
**Optional:** Revisit Issue 2b (download failure UX) if empty/loading voice bubbles are observed.
