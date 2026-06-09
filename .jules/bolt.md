## 2026-06-06 - expo-image for list performance\n**Learning:** Standard React Native Image lacks disk caching and memory-efficient decoding, causing performance bottlenecks and re-renders when used extensively in lists.\n**Action:** Use `expo-image` for images in lists to achieve automatic caching and smoother scrolling.

## 2026-06-08 - Formatting Noise in PRs
**Learning:** Running Prettier over entire files when making small, focused changes can generate a massive amount of formatting noise (like changing quote styles), which distracts from the core optimization and violates the rule to keep PRs under 50 lines.
**Action:** When making isolated performance improvements, refrain from running file-wide auto-formatters unless specifically instructed, to ensure the diff reflects only the meaningful optimization.
