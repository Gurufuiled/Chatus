import * as Haptics from 'expo-haptics';

/** Лёгкий отклик при выборе стикера / эмодзи в шторке (фаза 5.1). */
export function hapticStickerSheetPick(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** При открытии панели Emoji | Stickers | GIF (клавиатура скрыта). */
export function hapticStickerSheetOpen(): void {
  void Haptics.selectionAsync().catch(() => {});
}

/** При закрытии панели кнопкой смайла (toggle). */
export function hapticStickerSheetDismiss(): void {
  void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Long-press на ячейке сетки — открытие крупного превью (фаза 4.3). */
export function hapticStickerPreviewReveal(): void {
  void Haptics.selectionAsync().catch(() => {});
}
