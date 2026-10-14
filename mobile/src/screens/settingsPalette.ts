import type { ResolvedColorScheme } from '../theme/palettes';

/** Палитра экрана настроек (макет с лавандовым фоном и белыми карточками). */
export type SettingsPalette = {
  background: string;
  card: string;
  cardBorder: string;
  cardPressed: string;
  divider: string;
  sectionTitle: string;
  title: string;
  subtitle: string;
  meta: string;
  tileBg: string;
  tileIcon: string;
  link: string;
  chevron: string;
  soon: string;
  danger: string;
  dangerTile: string;
  cameraBadge: string;
  gradientFrom: string;
  gradientTo: string;
  errorBg: string;
  errorText: string;
};

const LIGHT: SettingsPalette = {
  background: '#EEEBF8',
  card: '#FFFFFF',
  cardBorder: 'transparent',
  cardPressed: '#F5F2FC',
  divider: '#EEEAF6',
  sectionTitle: '#7D7993',
  title: '#1B1830',
  subtitle: '#6F6B86',
  meta: '#6F6B86',
  tileBg: '#EFE9FD',
  tileIcon: '#7B4FE0',
  link: '#7B3FE4',
  chevron: '#B6B1C8',
  soon: '#8E8AA5',
  danger: '#E5393F',
  dangerTile: '#FDECEE',
  cameraBadge: '#7B3FE4',
  gradientFrom: '#4C8DF6',
  gradientTo: '#8B4DE8',
  errorBg: '#FFEBEE',
  errorText: '#C62828',
};

const DARK: SettingsPalette = {
  background: '#14131B',
  card: '#1E1C29',
  cardBorder: 'rgba(255,255,255,0.05)',
  cardPressed: '#272436',
  divider: 'rgba(255,255,255,0.07)',
  sectionTitle: '#8F8BA6',
  title: '#F4F2FB',
  subtitle: '#A19DB8',
  meta: '#A19DB8',
  tileBg: '#2C2742',
  tileIcon: '#B195FF',
  link: '#B08CFF',
  chevron: '#6C6883',
  soon: '#8F8BA6',
  danger: '#FF5A5F',
  dangerTile: '#3A2128',
  cameraBadge: '#7B3FE4',
  gradientFrom: '#4C8DF6',
  gradientTo: '#8B4DE8',
  errorBg: '#3A2128',
  errorText: '#FF8A8F',
};

export function getSettingsPalette(scheme: ResolvedColorScheme): SettingsPalette {
  return scheme === 'dark' ? DARK : LIGHT;
}
