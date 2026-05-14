/**
 * Строки для TalkBack / VoiceOver (фаза 5.2 журнала).
 * Вынесено в pure-функции — unit-тесты без React Native.
 */

/** Озвучка при переходе на верхнюю вкладку (Emoji / Стикеры / GIF). */
export function formatStickerPanelTopTabAnnouncement(
  tabIndex: number,
  tabLabel: string,
  totalTabs: number,
): string {
  const safeTotal = totalTabs > 0 ? totalTabs : 1;
  const i = Math.max(0, Math.min(tabIndex, safeTotal - 1));
  return `Вкладка ${i + 1} из ${safeTotal}: ${tabLabel}`;
}
