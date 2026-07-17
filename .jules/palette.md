## 2024-03-24 - [Native browser tooltips for custom icon buttons]
**Learning:** Custom UI components that encapsulate HTML `<button>` elements (like `IconButton`) and only display icons can lose the native browser tooltip functionality that helps sighted users understand their purpose, especially if they map their explicit label solely to `aria-label` without a fallback for `title`.
**Action:** Always ensure that an explicitly passed `title` or a fallback to `aria-label` is bound to the native `title` attribute of the underlying HTML `<button>` in icon-only wrapper components.
