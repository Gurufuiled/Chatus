## 2024-05-19 - [Telegram UI Alignment]
**What:** Aligned the mobile app's UI/UX closer to Telegram by hiding the tab bar on inner setting screens, greying out the unread badge for muted chats, and removing the pin action from the chat profile screen.
**Why:** Improves user experience by bringing interactions in line with established Telegram patterns and reducing interface clutter and keyboard overlapping.
**Before/After:** The main settings screens and telegram auth screen are now free from the tab bar when focused. Muted chats in the dialogs list feature a gray unread badge rather than an accent color. The chat profile screen's 'more' menu is now devoid of the 'pin' action.
**Accessibility details:** Changes respect existing accessibility semantics; muted status is visual and relies on standard contrast ratios.
