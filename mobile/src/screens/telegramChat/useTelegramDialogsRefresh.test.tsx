/**
 * Тесты обновления списка Telegram-диалогов. Запуск: npx jest src/screens/telegramChat/useTelegramDialogsRefresh.test.tsx
 */
import React from 'react';
import { act, renderHook } from '@testing-library/react-native';
import { useTelegramDialogsRefresh } from './useTelegramDialogsRefresh';
import type { TelegramDialogRow } from '../../stores/telegramAccountStore';

type Listener = (update: Record<string, unknown>) => void;

const mockListeners: { current: Listener[] } = { current: [] };
const mockUnsubscribe = jest.fn();
jest.mock('../../services/tdlib/TdlibClient', () => ({
  tdlibClient: {
    subscribe: (listener: Listener) => {
      mockListeners.current.push(listener);
      return () => {
        mockListeners.current = mockListeners.current.filter((l) => l !== listener);
        mockUnsubscribe();
      };
    },
    send: jest.fn(),
  },
}));

const mockState: { dialogs: TelegramDialogRow[]; setDialogs: jest.Mock; patchDialog: jest.Mock } = {
  dialogs: [],
  setDialogs: jest.fn(),
  patchDialog: jest.fn(),
};
jest.mock('../../stores/telegramAccountStore', () => ({
  telegramAccountStore: { getState: () => mockState },
}));

const mockRefresh = jest.fn(() => Promise.resolve());
jest.mock('./telegramDialogsLoader', () => ({
  refreshTelegramDialogs: () => mockRefresh(),
}));

// useFocusEffect в тесте = обычный эффект на монтирование
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  return {
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => callback(), [callback]);
    },
  };
});

const dialog = (chatId: string, avatarFileId?: number): TelegramDialogRow =>
  ({
    id: chatId,
    chatId,
    title: `Чат ${chatId}`,
    lastMessagePreview: '',
    avatarUri: null,
    avatarFileId,
  }) as TelegramDialogRow;

const file = (id: number, path?: string) => ({
  '@type': 'updateFile',
  file: { id, local: { path: path ?? '', is_downloading_completed: Boolean(path) } },
});

const emit = (update: Record<string, unknown>) => {
  for (const listener of [...mockListeners.current]) listener(update);
};

beforeEach(() => {
  jest.useFakeTimers();
  mockListeners.current = [];
  mockUnsubscribe.mockClear();
  mockRefresh.mockClear();
  mockState.setDialogs.mockClear();
  mockState.patchDialog.mockClear();
  mockState.dialogs = [dialog('1', 11), dialog('2', 22), dialog('3')];
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useTelegramDialogsRefresh: аватарки по updateFile (регрессия: появлялись только после рефреша)', () => {
  it('скачанный файл аватарки подставляется в диалог без полного обновления списка', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    emit(file(11, '/data/a1.jpg'));
    act(() => {
      jest.advanceTimersByTime(60);
    });

    expect(mockState.setDialogs).toHaveBeenCalledTimes(1);
    const next = mockState.setDialogs.mock.calls[0][0] as TelegramDialogRow[];
    expect(next[0]).toMatchObject({ avatarUri: 'file:///data/a1.jpg', avatarFileId: undefined });
    expect(next[1]).toBe(mockState.dialogs[1]); // остальные — без изменений
  });

  it('несколько файлов подряд применяются одним обновлением списка', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    emit(file(11, '/a1.jpg'));
    emit(file(22, '/a2.jpg'));
    act(() => {
      jest.advanceTimersByTime(60);
    });
    expect(mockState.setDialogs).toHaveBeenCalledTimes(1);
    const next = mockState.setDialogs.mock.calls[0][0] as TelegramDialogRow[];
    expect(next[0].avatarUri).toBe('file:///a1.jpg');
    expect(next[1].avatarUri).toBe('file:///a2.jpg');
  });

  it('файл не от аватарок диалогов — список не трогаем', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    emit(file(999, '/other.jpg'));
    act(() => {
      jest.advanceTimersByTime(60);
    });
    expect(mockState.setDialogs).not.toHaveBeenCalled();
  });

  it('файл ещё качается (нет is_downloading_completed) — игнорируется', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    emit(file(11));
    act(() => {
      jest.advanceTimersByTime(200);
    });
    expect(mockState.setDialogs).not.toHaveBeenCalled();
  });

  it('при потере фокуса накопленное применяется, подписка снимается', () => {
    const { unmount } = renderHook(() => useTelegramDialogsRefresh(true));
    emit(file(11, '/a1.jpg'));
    unmount();
    expect(mockUnsubscribe).toHaveBeenCalledTimes(1);
    expect(mockState.setDialogs).toHaveBeenCalledTimes(1);
    expect(mockListeners.current).toHaveLength(0);
  });

  it('выключен (нет Telegram-аккаунта) — ничего не подписывается и не обновляется', () => {
    renderHook(() => useTelegramDialogsRefresh(false));
    expect(mockListeners.current).toHaveLength(0);
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});

describe('useTelegramDialogsRefresh: прежнее поведение сохранено', () => {
  it('при монтировании сразу обновляет список', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('новое сообщение/позиция чата — обновление списка с задержкой 500 мс (дребезг склеивается)', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    mockRefresh.mockClear();
    emit({ '@type': 'updateChatLastMessage' });
    emit({ '@type': 'updateChatPosition' });
    act(() => {
      jest.advanceTimersByTime(499);
    });
    expect(mockRefresh).not.toHaveBeenCalled();
    act(() => {
      jest.advanceTimersByTime(1);
    });
    expect(mockRefresh).toHaveBeenCalledTimes(1);
  });

  it('updateChatReadInbox сразу меняет счётчик непрочитанных', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    emit({ '@type': 'updateChatReadInbox', chat_id: 7, unread_count: 3 });
    expect(mockState.patchDialog).toHaveBeenCalledWith('7', { unreadCount: 3 });
  });

  it('прочие события игнорируются', () => {
    renderHook(() => useTelegramDialogsRefresh(true));
    mockRefresh.mockClear();
    emit({ '@type': 'updateUserStatus' });
    act(() => {
      jest.advanceTimersByTime(1000);
    });
    expect(mockRefresh).not.toHaveBeenCalled();
  });
});
