# Журнал: UI/UX стикеров и панели как в Telegram (Chatus)

**Назначение:** дорожная карта по этапам, журнал выполненных шагов и **контекст для агента** — чтобы не путать ветки и не дублировать обсуждение в чате.

**Область по умолчанию:** нативный чат Chatus — `ChatScreen`, `InputBar`, `StickerPackSheet`, `StickerMessageBubble`, каталог `mobile/src/stickers/`.  
**Отдельно:** чат через TDLib (`TelegramChatScreen`) — стикеры там идут из TDLib API; пересечение с этим файлом — только если сознательно унифицируем композер/панель (см. [tasks/telegram-chat-ui-parity.md](./tasks/telegram-chat-ui-parity.md)).

**Уже есть (фиксация контекста):** кнопка стикеров (**tap** — стикеры / клавиатура, **long-press** — вкладка Emoji); при **узком экране** (<380dp) стикеры **у скрепки** слева (`InputBar`); **черновик текста** при отправке стикера **не очищается** (только `handleSend` очищает поле); шторка **Emoji | Stickers | GIF** со свайпом и persist вкладки (`stickerPanelPreferences.ts`), переключение смайл/клавиатура, **рейл наборов слева** (`CHATUS_STICKER_PACK_RAIL`) + справа чипы «Недавние» / название активного пака + поиск + сетка (`getStickerSheetItemsForPack`), все 65 локальных PNG пака `friend` (id = stem файла), **поиск по строке** (`stickerSheetSearch.ts`), **свайп вниз с «ручки»** (`PanResponder` на `grabberWrap`), MRU (`recentStickerMru.ts`, `recentStickersStorage.ts`), отправка `{ t: 'cs', p, i }`, **без бабла** в ленте (`StickerMessageBubble`, `ChatusStickerBubbleRow`), **вход исходящего стикера** только при **пустом композере** (`chatus_sticker_solo_send`, Reanimated `FadeIn.springify`; после ACK флаг сбрасывается), **long-press в сетке** → крупное превью + «Отправить» (`StickerPackSheet`), **haptics** панели/выбора (`expo-haptics`, `chatusStickerPanelHaptics.ts`), **a11y вкладок/пейджера** (`stickerPanelA11y.ts`, озвучка смены вкладки, `accessibilityViewIsModal`), legacy-алиасы + `canonicalFriendStickerRef`, закрытие шторки при blur, `chatusStickerPayload` + тесты, плейсхолдер неизвестного стикера.

---

## Как вести журнал

После каждого заметного шага добавляй строку в **«Лог»** внизу: дата (ISO), кратко что сделано, файлы.  
В чеклистах фаз меняй `[ ]` → `[x]` когда поведение реализовано в коде; финальную проверку на устройстве/эмуляторе отмечай в логе словами **«проверено на устройстве»**, если делал вручную.

---

## Фаза 1 — Панель: структура как в Telegram

**Цель:** верхний уровень панели не «только наши разделы пака», а привычные вкладки.

- [x] **1.1** Вкладки верхнего уровня: **Emoji | Stickers | GIF** (GIF можно фазой 1 сделать заглушкой «скоро» с тем же UI-скелетом).
- [x] **1.2** Свайп между вкладками (горизональный `PagerView` / `ScrollView` paging) или явные табы + сохранение последней открытой вкладки (локально, например `AsyncStorage` / существующий persist-паттерн проекта).
- [x] **1.3** Высота панели и анимация открытия/закрытия ближе к TG: связка с клавиатурой без рывка (см. `toggleStickerPanel`, `useAnimatedKeyboard` в нативном чате при необходимости).

**Файлы (ориентир):** `mobile/src/components/StickerPackSheet.tsx`, при разрастании — вынести оболочку в `StickerEmojiPanel.tsx` и оставить лист только для сетки.

**Реализация (код, 2026-05-11):** `StickerPackSheet` — табы + горизонтальный `ScrollView` с `pagingEnabled`, вкладка Emoji (`CHATUS_QUICK_EMOJIS`), стикеры как раньше, GIF — заглушка; последняя вкладка в `SecureStore` (`stickerPanelPreferences.ts`); открытие панели в `InputBar` — `Keyboard.dismiss` + `InteractionManager.runAfterInteractions` + `rAF`. **Проверка на устройстве** — вручную.

---

## Фаза 2 — Недавние, поиск, сетка наборов

**Цель:** быстрый доступ и навигация как в TG.

- [x] **2.1** Блок **Recent** (последние N стикеров по `packId`+`stickerId`, персист на устройстве; обновлять при отправке). **Код:** `recentStickersStorage.ts` (до 24, `SecureStore`), секция «Недавние» в `StickerPackSheet`.
- [x] **2.2** **Поиск по каталогу** (минимум из журнала: фильтр по ключам `packId`/`stickerId`; **не** по Unicode-именам эмодзи — это отдельная таблица/пакет на будущее). **Сейчас:** подстрока по `packId:stickerId` с нормализацией (без учёта дефисов), поле над сеткой на вкладке «Стикеры». Файлы: `stickerSheetSearch.ts`, `stickerSheetSearch.test.ts`.
- [x] **2.3** Двухуровневая навигация: **слева иконки наборов** (`CHATUS_STICKER_PACK_RAIL`), справа чипы «Недавние» / название активного пака + поиск + сетка (`getStickerSheetItemsForPack`). Пока один пак `friend` — рейл из одной ячейки, дальше расширяется массивом в каталоге.
- [x] **2.4** Свайп вниз по шторке для закрытия (в дополнение к бэкдропу и кнопке клавиатуры). **Код:** вертикальный жест только на `grabberWrap` (`PanResponder`), порог по `dy` / `vy`, без перехвата горизонтального пейджера.

**Файлы:** `chatusStickerCatalog.ts`, `recentStickersStorage.ts`, `recentStickerMru.ts`, `stickerSheetSearch.ts`, `StickerPackSheet.tsx`.

---

## Фаза 3 — Композер и жесты

**Цель:** вход в панель и плотность как в TG.

- [x] **3.1** **Long-press** на иконке смайла открывает ту же панель сразу на вкладке **Emoji** (`InputBar`: `openStickerPanel('emoji')`, `StickerPackSheet` `initialTopTabSnapshot` + `skipTopTabPersistRef`, чтобы restore из SecureStore не перебил открытие).
- [x] **3.2** Адаптив при узкой ширине: при `windowWidth < 380` кнопка стикеров переносится **к скрепке** (одна группа `leadingCluster`: скрепка + смайл) или слева одна смайл-кнопка, если вложений нет — правый край не перегружается, микрофон/видео без изменений (`InputBar`, `COMPOSER_NARROW_BREAKPOINT`).
- [x] **3.3** **Стикер + черновик текста:** отправка стикера идёт через `onSendSticker` / `handleStickerPick` **без** `setInputText('')` (очистка поля только в `handleSend` для текста/медиа). Зафиксировано комментарием в `InputBar` и в журнале.

**Файлы:** `mobile/src/components/InputBar.tsx`, стили композера в том же файле / `composerPresentation`.

---

## Фаза 4 — Ощущение «стикер в ленте», не «текст в пузыре»

**Цель:** визуально ближе к Telegram.

- [x] **4.1** Упрощённый фон для сообщений-стикеров: меньше «пузыря», больше воздуха; время/статус как в TG (позиция и размер). **Код:** `StickerMessageBubble` (`bubbleless`), `ChatusStickerBubbleRow` (`layout="telegram"`, выравнивание исходящих `alignSelf` по `isMe`).
- [x] **4.2** Лёгкая **анимация появления** исходящего стикера: **Reanimated** `FadeIn.springify()` только если стикер отправлен **с пустым полем ввода** (как в Telegram при «отдельном» стикере); при непустом черновике текста — без анимации. Флаг `chatus_sticker_solo_send` на оптимистичном сообщении (`InputBar` → `handleSendSticker` → `handleSendText`), лента: `ChatMessageList` → `playOutgoingEntrance`. После **ACK** с заменой `id` флаг сбрасывается в `WebSocketProvider`, чтобы не было второго `entering` при новом key в списке.
- [x] **4.3** (Опционально) Long-press на ячейке в сетке — превью крупнее перед отправкой. **Код:** `StickerPackSheet` — оверлей с `STICKER_PREVIEW_IMAGE`, «Отправить» / «Отмена», `delayLongPress` 400 ms, защита от двойной отправки (`skipStickerTapPickAfterLongPressRef`), Android back / бэкдроп сначала закрывают превью (`handleSheetRequestClose`, `userDismissOrClearStickerPreviewRef`); `hapticStickerPreviewReveal` в `chatusStickerPanelHaptics.ts`.

**Файлы:** `StickerMessageBubble.tsx`, `ChatusStickerBubbleRow.tsx`, `ChatMessageList.tsx`, превью меню в `ChatScreen.tsx`.

---

## Фаза 5 — Полировка и нативное ощущение

- [x] **5.1** **Haptics:** `expo-haptics` — выбор стикера / эмодзи в сетке (`hapticStickerSheetPick`), открытие панели (`selectionAsync` при показе шторки), закрытие: бэкдроп / свайп с ручки / Android back (`hapticStickerSheetDismiss`), toggle кнопкой смайла в `InputBar` (`hapticStickerSheetDismiss`). Обёртки с `.catch` — web/симулятор. **Код:** `chatusStickerPanelHaptics.ts`, `StickerPackSheet.tsx`, `InputBar.tsx`.
- [x] **5.2** **Accessibility:** вкладки Emoji·Стикеры·GIF — `tablist` + подпись группы, у каждой вкладки `tab` + `selected` + hint; текст вкладки `accessible={false}` (без двойного зачитывания). Горизонтальный пейджер: подпись и hint на `ScrollView`; при **смене раздела** (тап по вкладке или свайп) — `AccessibilityInfo.announceForAccessibility` через `formatStickerPanelTopTabAnnouncement` (`stickerPanelA11y.ts`, тест `stickerPanelA11y.test.ts`). Лист шторки: `accessibilityViewIsModal`; бэкдроп — `accessibilityRole="button"`; «ручка» — доп. hint.
- [ ] **5.3** Тесты: unit на recent-store и/или снапшот панели; **частично:** `stickerSheetSearch.test.ts`, `recentStickerMru.test.ts`, **`stickerPanelA11y.test.ts`**. Импорт всего `chatusStickerCatalog.ts` в Node-`tsx` без Metro ломается на `require(.png)` — отдельные тесты каталога вынести в Jest с моком ассетов или в чистый модуль без `require`.

---

## Фаза 6 — Наборы и настройки (продукт)

**Цель:** не только захардкоженный «friend»-пак.

- [ ] **6.1** Экран или модалка **«Мои стикеры»**: включить/выключить набор, порядок (drag).
- [ ] **6.2** Загрузка/обновление списка паков с сервера (если появится API) — вынести в отдельную задачу и ссылку сюда.

---

## Фаза 7 — Согласование с Telegram-веткой (по необходимости)

- [ ] **7.1** Решить: TDLib-стикеры рендерятся только нативным TG UI или допускается общая **оболочка панели** (Emoji/Sticker tabs) с разным data source (`chatusStickerCatalog` vs TDLib `getStickerSets`).
- [ ] **7.2** Если общая оболочка — описать контракт пропсов в логе и не смешивать payload `{t:'cs'}` с TDLib file_id в одном компоненте без явного `mode`.

**Файлы:** `mobile/src/screens/TelegramChatScreen.tsx`, TDLib mapping.

---

## Лог изменений (журнал)

| Дата | Сделано |
|------|---------|
| 2026-05-11 | Создан документ: фазы 1–7, контекст Chatus vs TDLib, ссылка на `telegram-chat-ui-parity.md`. |
| 2026-05-11 | **Фаза 1:** вкладки Emoji / Стикеры / GIF, свайп `pagingEnabled`, persist вкладки (`stickerPanelPreferences.ts`), сетка `chatusEmojiGrid.ts`, открытие панели через `InteractionManager`+`rAF` (`InputBar`), фиксированная высота тела пейджера (`StickerPackSheet`). |
| 2026-05-11 | После review: `useLayoutEffect` синхрон пейджер↔`topTabIndex`, `userAdjustedTopTabRef` + проверка `cancelled` в rAF restore, `onPagerScrollEnd` не помечает ручное изменение при совпадении страницы, `nestedScrollEnabled` и a11y на чипах разделов стикеров, дедуп `😌` в `chatusEmojiGrid`. |
| 2026-05-14 | **Каталог friend:** 65 PNG по stem-имени, `CHATUS_STICKER_IMAGES` + legacy-алиасы, `FRIEND_EMOJI_PEOPLE_STICKER_ITEMS`, `canonicalFriendStickerRef`. **Панель:** секции «Недавние» + «Emoji & People», MRU `recentStickersStorage.ts`. **Лента:** bubbleless + telegram-meta (`StickerMessageBubble`, `ChatusStickerBubbleRow`, выравнивание своих при reply). |
| 2026-05-14 | Журнал актуализирован под код. **Фаза 2.2 (мин.):** `stickerSheetSearch.ts`, поле поиска в `StickerPackSheet`, `stickerSheetSearch.test.ts`. Следующий крупный шаг по карте: **2.3** или **2.4**. |
| 2026-05-14 | **Фаза 2.3 + 3.1:** рейл паков в `StickerPackSheet`, `getStickerSheetItemsForPack` / `CHATUS_STICKER_PACK_RAIL` в каталоге; long-press смайла → Emoji (`InputBar` + `initialTopTabSnapshot`, `skipTopTabPersistRef`). |
| 2026-05-14 | После **reviewer:** невалидный snapshot не ставит `skipTopTabPersistRef`; `nestedScrollEnabled` на рейле и сетке; `hitSlop` на ячейке пака; `handleStickerBootTabConsumed` в `useCallback`. |
| 2026-05-14 | **Фаза 2.4:** `PanResponder` на `grabberWrap` — свайп вниз закрывает шторку. MRU: `recentStickerMru.ts` + тесты, при `load` — `canonicalFriendStickerRef` + дедуп; UI «Загрузка…» для «Недавние» до чтения SecureStore. |
| 2026-05-14 | **Фаза 3.2–3.3:** узкий композер — стикеры в `leadingCluster` со скрепкой (`COMPOSER_NARROW_BREAKPOINT`); явный комментарий про сохранение черновика при стикере (`handleStickerPick` vs `handleSend`). |
| 2026-05-11 | **Фаза 4.2:** `StickerMessageBubble` — исходящие `bubbleless` в `Reanimated.View` с `entering={FadeIn.springify()…}`; fallback без shell — то же для `isMe`. |
| 2026-05-11 | **4.2 уточнение (как TG):** анимация только при **пустом** `inputText` на момент выбора стикера (`composerWasEmpty` → `chatus_sticker_solo_send` → `playOutgoingEntrance`). |
| 2026-05-11 | После **review:** при ACK оптимистичного сообщения сброс `chatus_sticker_solo_send` в `WebSocketProvider` (нет повторного `entering` при смене `message.id` / key в списке). |
| 2026-05-11 | **Фаза 5.1:** `expo-haptics` + `chatusStickerPanelHaptics.ts` — pick стикера/эмодзи, открытие/закрытие панели (`InputBar`, `StickerPackSheet` backdrop + grabber + `onRequestClose`). |
| 2026-05-14 | После **/review:** подтверждена схема haptics (pick без dismiss-haptic); **фаза 4.3** — long-press на ячейке сетки: крупное превью, «Отправить»/«Отмена», back/бэкдроп сначала снимают превью; `hapticStickerPreviewReveal`. |
| 2026-05-14 | **Фаза 5.2:** a11y вкладок и пейджера (`StickerPackSheet`), озвучка смены вкладки, `stickerPanelA11y.ts` + `stickerPanelA11y.test.ts`. |
| 2026-05-14 | После **review** 5.2: озвучка в `onPagerScrollEnd` по **clamped** индексу (как у `commitTopTab`). |

---

## Быстрый указатель кода (для агента)

| Что | Где |
|-----|-----|
| Шторка / панель Emoji·Стикеры·GIF | `mobile/src/components/StickerPackSheet.tsx` (в т.ч. превью по long-press) |
| Persist вкладки панели | `mobile/src/stickers/stickerPanelPreferences.ts` |
| MRU стикеров | `mobile/src/stickers/recentStickersStorage.ts` |
| MRU merge/dedupe (pure) | `mobile/src/stickers/recentStickerMru.ts` |
| Фильтр сетки по запросу | `mobile/src/stickers/stickerSheetSearch.ts` |
| Сетка быстрых эмодзи | `mobile/src/stickers/chatusEmojiGrid.ts` |
| Каталог: рейл паков, сетка по `packId` | `chatusStickerCatalog.ts` (`CHATUS_STICKER_PACK_RAIL`, `getStickerSheetItemsForPack`) |
| Кнопка, клавиатура, лист, узкий композер | `mobile/src/components/InputBar.tsx` (`COMPOSER_NARROW_BREAKPOINT`, `leadingCluster`) |
| Пузырь в списке и меню | `StickerMessageBubble.tsx`, `ChatMessageList.tsx`, `ChatScreen.tsx` |
| Кодек + неизвестный стикер | `chatusStickerPayload.ts`, `chatusStickerCatalog.ts` |
| Ряд картинка+время | `ChatusStickerBubbleRow.tsx` |
| Haptics панели стикеров | `chatusStickerPanelHaptics.ts`, вызовы в `StickerPackSheet.tsx`, `InputBar.tsx` |
| Озвучка вкладок панели (TalkBack / VoiceOver) | `stickerPanelA11y.ts`, `StickerPackSheet.tsx` |
| Проброс в док | `mobile/src/components/ChatInputDock.tsx` |
