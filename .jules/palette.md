## 2024-05-18 - Native Tooltips for Icon Buttons
**Learning:** Native `title` attributes on buttons that already use `aria-label` provide an excellent, zero-dependency micro-UX improvement for sighted desktop users who hover over icon-only buttons.
**Action:** Always ensure that custom button components (like `IconButton`) map their accessibility label prop to the native HTML `title` attribute.
