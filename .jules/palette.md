## 2025-02-23 - [Input Field Accessibility Mismatch]
**Learning:** Found a pattern where visually required labels (`(обязательно)`) do not have semantic `required` or `aria-required` bindings in the underlying form inputs, causing screen readers to miss validation requirements.
**Action:** When inspecting forms, ensure fields labeled as required programmatically implement `required` and `aria-required="true"`.
