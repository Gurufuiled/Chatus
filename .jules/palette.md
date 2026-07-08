
## 2024-07-08 - Icon Button Tooltips
**Learning:** Custom icon-only buttons often use aria-label for screen readers but miss the title attribute, leaving sighted desktop users without hover tooltips. Adding title natively improves discoverability.
**Action:** Always include title={label} alongside aria-label={label} in base IconButton components to ensure a universally accessible experience.
