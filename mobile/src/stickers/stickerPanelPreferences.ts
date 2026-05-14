import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'chatus_sticker_panel_top_tab';

export type StickerPanelTopTab = 'emoji' | 'stickers' | 'gif';

export async function loadStickerPanelTopTab(): Promise<StickerPanelTopTab | null> {
  try {
    const raw = await SecureStore.getItemAsync(STORAGE_KEY);
    if (raw === 'emoji' || raw === 'stickers' || raw === 'gif') return raw;
  } catch {
    /* ignore */
  }
  return null;
}

export function persistStickerPanelTopTab(tab: StickerPanelTopTab): void {
  void SecureStore.setItemAsync(STORAGE_KEY, tab).catch(() => undefined);
}
