## 2024-06-29 - [Missing ARIA Label in Media List]
**Learning:** Icon-only buttons used for media thumbnails in the chat sidebar frequently lack `aria-label` attributes.
**Action:** Ensure all interactive elements, especially those relying on images or icons like `.chat-info-sidebar__media-item`, always include descriptive ARIA labels to maintain accessibility for screen readers.
