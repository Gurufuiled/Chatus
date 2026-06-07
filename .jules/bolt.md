## 2026-06-06 - expo-image for list performance\n**Learning:** Standard React Native Image lacks disk caching and memory-efficient decoding, causing performance bottlenecks and re-renders when used extensively in lists.\n**Action:** Use `expo-image` for images in lists to achieve automatic caching and smoother scrolling.
## 2026-06-07 - Optimize lists with expo-image
**Learning:** Standard React Native Image lacks disk caching and memory-efficient decoding, causing performance bottlenecks and re-renders when used extensively in lists.
**Action:** Use `expo-image` for images in lists to achieve automatic caching and smoother scrolling, and note that the default `memory-disk` policy might sometimes be even better than explicitly setting `disk`.
