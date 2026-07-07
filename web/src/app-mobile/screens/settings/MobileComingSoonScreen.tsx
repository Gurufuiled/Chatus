import { SettingsSubpageLayout } from '../../components/settings/SettingsSubpageLayout';

interface MobileComingSoonScreenProps {
  title: string;
}

export function MobileComingSoonScreen({ title }: MobileComingSoonScreenProps) {
  return (
    <SettingsSubpageLayout title={title}>
      <div className="mobile-settings-services__empty">
        <p className="mobile-settings-services__empty-title">Скоро</p>
        <p className="mobile-settings-services__empty-subtitle">
          Раздел «{title}» будет подключен позже.
        </p>
      </div>
    </SettingsSubpageLayout>
  );
}
