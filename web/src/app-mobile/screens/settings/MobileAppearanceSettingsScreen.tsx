import { useMobileUiStore } from '@/stores/mobileUiStore';
import { useMobileAppearance } from '../../hooks/useMobileAppearance';
import {
  SettingsOptionList,
  SettingsSubpageLayout,
} from '../../components/settings/SettingsSubpageLayout';

const OPTIONS = [
  { value: 'system', label: 'Как в системе', hint: 'Следовать настройкам устройства' },
  { value: 'light', label: 'Светлая', hint: 'Светлое оформление' },
  { value: 'dark', label: 'Тёмная', hint: 'Тёмное оформление' },
] as const;

export function MobileAppearanceSettingsScreen() {
  const { preference, resolvedScheme } = useMobileAppearance();
  const setPreference = useMobileUiStore((s) => s.setAppAppearancePreference);

  const caption = `Сейчас: ${resolvedScheme === 'dark' ? 'тёмная' : 'светлая'}${
    preference === 'system' ? ' (как в системе)' : ''
  }`;

  return (
    <SettingsSubpageLayout title="Оформление">
      <SettingsOptionList
        caption={caption}
        options={[...OPTIONS]}
        value={preference}
        onChange={(value) =>
          setPreference(value as 'system' | 'light' | 'dark')
        }
      />
    </SettingsSubpageLayout>
  );
}
