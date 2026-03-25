# Step 3. Rust на mobile для media/voice задач

## Цель

Добавить Rust на mobile не в UI, а в локальный media engine: там, где сейчас тяжелые вычисления идут рядом с записью и подготовкой медиа.

## Почему это не первый шаг

Mobile Rust в Expo-проекте сложнее, чем серверный Rust:

- нужен native module;
- нужен dev build;
- нужен bridge;
- выше риск платформенных проблем.

Поэтому этот шаг должен идти после server media pipeline.

## Что именно переносить в Rust на mobile

### Лучшие кандидаты

1. Построение waveform
2. Извлечение audio metadata
3. Локальная подготовка thumbnail
4. Image resize/compress
5. Быстрые file hash / checksum операции

### Текущие файлы, связанные с этим

- `mobile/src/services/VoiceRecorderService.ts`
- `mobile/src/services/VideoNoteRecorderService.ts`
- `mobile/src/services/ImagePickerService.ts`
- `mobile/src/services/waveformUtils.ts`
- `mobile/src/services/MediaCacheService.ts`
- `mobile/src/bridge/messengerBridge.ts`

## Рекомендуемая архитектура

### На JS/TS стороне

- orchestration;
- вызов bridge;
- обработка ошибок;
- fallbacks;
- UX state.

### На Rust стороне

- waveform generation;
- metadata extraction;
- file hashing;
- binary transforms.

### На native wrapper стороне

- минимальный Kotlin/Swift слой;
- только bridging и marshaling данных.

## Что не нужно переносить в Rust на mobile

- `InputBar`;
- анимации;
- экраны чатов;
- navigation;
- Zustand store;
- reply/search/profile UI.

Rust не улучшит это заметно, а сложность интеграции вырастет сильно.

## Практический rollout

### Первая волна

1. `buildWaveform(fileUri) -> number[]`
2. `getMediaMetadata(fileUri) -> { duration, width, height, mime }`

### Вторая волна

3. `prepareImageForUpload(fileUri, options)`
4. `createVideoThumbnail(fileUri)`

## Что это даст проекту

1. Быстрее и стабильнее подготовка голосовых
2. Меньше нагрузки на JS при работе с файлами
3. Более надежная база для больших медиа-сценариев

## Риски

- переусложнить mobile build pipeline;
- завязаться на слишком тяжелый bridge;
- попытаться делать через Rust то, что уже хорошо решает Expo API.

## Критерий завершения

Шаг завершен, когда:

- mobile умеет вызывать Rust-native helper для waveform/metadata;
- voice/media preprocessing больше не зависит только от JS-утилит;
- UI при этом остается полностью на React Native стороне.
