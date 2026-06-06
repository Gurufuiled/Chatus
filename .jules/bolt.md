## 2024-06-06 - [Performance Optimization] Prefer expo-image for Lists
**Learning:** React Native's standard `Image` component can have memory and decoding inefficiencies when rendering many images inside lists (like FlatList).
**Action:** Use `expo-image` over `Image` from `react-native` inside long lists such as chat or dialog lists to take advantage of better disk caching, background decoding, and performance.
