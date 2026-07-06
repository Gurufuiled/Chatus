## 2024-07-28 - Keyboard Accessible Custom Buttons
**Learning:** React elements with `onClick` event handlers are not automatically focusable or operable via keyboard keys (Enter/Space), which breaks accessibility for users navigating without a mouse.
**Action:** When adding interactivity to non-interactive elements (like `div`), always ensure `role="button"`, `tabIndex={0}`, and an `onKeyDown` handler to capture Enter and Space keys to execute the click action.
