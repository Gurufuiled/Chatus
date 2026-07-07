import { useMobileUiStore, type ChatListFilter } from '@/stores/mobileUiStore';
import {
  SettingsOptionList,
  SettingsSubpageLayout,
} from '../../components/settings/SettingsSubpageLayout';

const FILTER_DESCRIPTIONS: Record<ChatListFilter, string> = {
  all: 'Все чаты',
  chatus_only: 'Только Chatus',
  telegram_only: 'Только Telegram',
};

const OPTIONS = [
  { value: 'all', label: 'Все чаты', hint: 'Показывать Chatus и Telegram вместе' },
  { value: 'chatus_only', label: 'Только Chatus', hint: 'Показывать только чаты Chatus' },
  { value: 'telegram_only', label: 'Только Telegram', hint: 'Показывать только чаты Telegram' },
];

export function MobileChatSettingsScreen() {
  const chatListFilter = useMobileUiStore((s) => s.chatListFilter);
  const setChatListFilter = useMobileUiStore((s) => s.setChatListFilter);

  return (
    <SettingsSubpageLayout title="Настройки чатов">
      <SettingsOptionList
        caption={`Сейчас: ${FILTER_DESCRIPTIONS[chatListFilter]}`}
        options={OPTIONS}
        value={chatListFilter}
        onChange={(value) => setChatListFilter(value as ChatListFilter)}
      />
    </SettingsSubpageLayout>
  );
}
