import { Injectable, Logger } from '@nestjs/common';
import { ChatType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { MessagesService } from '../messages/messages.service';
import { MiniAppsService } from './mini-apps.service';
import {
  CHATUS_FATHER_USER_ID,
  DEVELOPER_AGREEMENT_TEXT,
} from './mini-apps.constants';

type ChatusFatherState =
  | { kind: 'idle' }
  | { kind: 'awaiting_agreement' }
  | { kind: 'newapp_title' }
  | { kind: 'newapp_url'; title: string }
  | { kind: 'newapp_description'; title: string; baseUrl: string }
  | { kind: 'newapp_icon'; title: string; baseUrl: string; description?: string }
  | { kind: 'myapps_pick' }
  | { kind: 'myapp_menu'; appId: string }
  | { kind: 'myapp_set_icon'; appId: string }
  | { kind: 'myapp_delete_confirm'; appId: string; title: string };

export interface ChatusFatherReply {
  text: string;
}

@Injectable()
export class ChatusFatherService {
  private readonly logger = new Logger(ChatusFatherService.name);
  private readonly states = new Map<string, ChatusFatherState>();

  constructor(
    private readonly prisma: PrismaService,
    private readonly miniApps: MiniAppsService,
    private readonly messages: MessagesService,
  ) {}

  /**
   * Returns chat id if the given chatId is a private chat between `userId` and ChatusFather.
   * Otherwise returns null.
   */
  async getChatIdIfChatusFather(chatId: string, userId: string): Promise<string | null> {
    const chat = await this.prisma.chat.findFirst({
      where: {
        id: chatId,
        chatType: ChatType.private,
        AND: [
          { members: { some: { userId } } },
          { members: { some: { userId: CHATUS_FATHER_USER_ID } } },
        ],
      },
      select: { id: true },
    });
    return chat?.id ?? null;
  }

  /**
   * Handle a text message from `userId` directed to ChatusFather.
   * Persists bot replies in the chat as messages from CHATUS_FATHER_USER_ID
   * and returns the list of created messages so the caller can broadcast them.
   */
  async handleUserMessage(
    chatId: string,
    userId: string,
    text: string,
  ): Promise<Awaited<ReturnType<MessagesService['createMessage']>>[]> {
    const replies = await this.computeReplies(userId, text);
    const created: Awaited<ReturnType<MessagesService['createMessage']>>[] = [];
    // Sequential on purpose: each createMessage updates chat.lastMessageAt; parallel
    // inserts would scramble createdAt order in chat history (usually 1–3 replies).
    for (const reply of replies) {
      try {
        const msg = await this.messages.createMessage(
          chatId,
          CHATUS_FATHER_USER_ID,
          'text',
          reply.text,
        );
        created.push(msg);
      } catch (err) {
        this.logger.warn(`Failed to post ChatusFather reply: ${err}`);
      }
    }
    return created;
  }

  private setState(userId: string, state: ChatusFatherState) {
    if (state.kind === 'idle') this.states.delete(userId);
    else this.states.set(userId, state);
  }

  private getState(userId: string): ChatusFatherState {
    return this.states.get(userId) ?? { kind: 'idle' };
  }

  /** Список приложений с выбором по номеру строки */
  private async repliesMyappsPickList(userId: string): Promise<ChatusFatherReply[]> {
    const apps = await this.miniApps.listOwnedApps(userId);
    if (apps.length === 0) {
      this.setState(userId, { kind: 'idle' });
      return [{ text: 'У вас пока нет приложений. Создайте первое: /newapp' }];
    }
    this.setState(userId, { kind: 'myapps_pick' });
    const lines = apps.map(
      (a, i) => `${i + 1}. ${a.title}\n   ${a.short_id}\n   ${a.base_url}`,
    );
    return [
      {
        text:
          `Ваши приложения — отправьте номер строки (1–${apps.length}), чтобы открыть меню действий.\n\n` +
          lines.join('\n\n') +
          '\n\n/cancel — выход из меню.',
      },
    ];
  }

  /** Карточка приложения с пунктами 1 / 2 / 0 */
  private async repliesAppMenu(userId: string, appId: string): Promise<ChatusFatherReply[]> {
    const apps = await this.miniApps.listOwnedApps(userId);
    const app = apps.find((a) => a.id === appId);
    if (!app) {
      this.setState(userId, { kind: 'idle' });
      return [{ text: 'Приложение не найдено. Откройте /myapps снова.' }];
    }
    this.setState(userId, { kind: 'myapp_menu', appId });
    const iconLine = app.icon_url ? app.icon_url : 'нет';
    return [
      {
        text:
          `«${app.title}» (${app.short_id})\n` +
          `URL: ${app.base_url}\n` +
          `secret: ${app.secret}\n` +
          `иконка: ${iconLine}\n\n` +
          `Выберите действие:\n` +
          `1 — изменить иконку\n` +
          `2 — удалить приложение\n` +
          `0 — назад к списку`,
      },
    ];
  }

  private async computeReplies(
    userId: string,
    rawText: string,
  ): Promise<ChatusFatherReply[]> {
    const text = rawText.trim();
    const lower = text.toLowerCase();
    const state = this.getState(userId);

    if (lower === '/cancel' || lower === 'отмена') {
      this.setState(userId, { kind: 'idle' });
      return [{ text: 'Отменил. Напишите /help, чтобы увидеть команды.' }];
    }

    if (lower === '/myapps' || lower === 'myapp') {
      const apps = await this.miniApps.listOwnedApps(userId);
      if (apps.length === 0) {
        this.setState(userId, { kind: 'idle' });
        return [{ text: 'У вас пока нет приложений. Создайте первое: /newapp' }];
      }
      return this.repliesMyappsPickList(userId);
    }

    if (state.kind === 'myapp_delete_confirm') {
      if (lower === '0' || lower === 'отмена') {
        return this.repliesAppMenu(userId, state.appId);
      }
      if (lower === 'удалить') {
        try {
          await this.miniApps.deleteApp(userId, state.appId);
          this.setState(userId, { kind: 'idle' });
          return [{ text: 'Приложение удалено из каталога «Сервисы».' }];
        } catch (err) {
          const msg = err instanceof Error ? err.message : 'Ошибка';
          return [{ text: `Не удалось удалить: ${msg}` }];
        }
      }
      return [{ text: 'Отправьте УДАЛИТЬ для подтверждения или 0 для отмены.' }];
    }

    if (state.kind === 'myapp_set_icon') {
      let iconUrl: string | undefined;
      if (text === '-') {
        iconUrl = '';
      } else {
        try {
          const url = new URL(text.trim());
          if (url.protocol !== 'https:') {
            return [{ text: 'Иконка только по HTTPS. Пришлите другой URL или «-».' }];
          }
          iconUrl = text.trim();
        } catch {
          return [{ text: 'Нужна корректная HTTPS-ссылка или «-» чтобы убрать иконку.' }];
        }
      }
      try {
        await this.miniApps.updateApp(userId, state.appId, {
          icon_url: iconUrl === '' ? '' : iconUrl,
        });
        const out: ChatusFatherReply[] = [{ text: 'Иконка обновлена.' }];
        out.push(...(await this.repliesAppMenu(userId, state.appId)));
        return out;
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Ошибка';
        return [{ text: `Не удалось сохранить: ${msg}` }];
      }
    }

    if (state.kind === 'myapp_menu') {
      const t = text.trim();
      const l = t.toLowerCase();
      if (t === '0' || l === 'назад') {
        return this.repliesMyappsPickList(userId);
      }
      if (t === '1') {
        this.setState(userId, { kind: 'myapp_set_icon', appId: state.appId });
        return [
          {
            text:
              'Пришлите HTTPS-ссылку на новую иконку или «-» чтобы убрать иконку из каталога.',
          },
        ];
      }
      if (t === '2') {
        const apps = await this.miniApps.listOwnedApps(userId);
        const app = apps.find((a) => a.id === state.appId);
        const title = app?.title ?? 'приложение';
        this.setState(userId, {
          kind: 'myapp_delete_confirm',
          appId: state.appId,
          title,
        });
        return [
          {
            text:
              `Удалить «${title}» безвозвратно из «Сервисов»? Отправьте УДАЛИТЬ или 0 для отмены.`,
          },
        ];
      }
      return [{ text: 'Нажмите 1 (иконка), 2 (удалить) или 0 (назад к списку).' }];
    }

    if (state.kind === 'myapps_pick') {
      const apps = await this.miniApps.listOwnedApps(userId);
      if (apps.length === 0) {
        this.setState(userId, { kind: 'idle' });
        return [{ text: 'Список пуст. Создайте приложение: /newapp' }];
      }
      const n = parseInt(text.trim(), 10);
      if (Number.isNaN(n) || n < 1 || n > apps.length) {
        return [
          {
            text: `Отправьте номер от 1 до ${apps.length}, или /cancel.`,
          },
        ];
      }
      return this.repliesAppMenu(userId, apps[n - 1].id);
    }

    if (lower === '/start' || lower === '/help') {
      this.setState(userId, { kind: 'idle' });
      return [
        {
          text:
            'Привет! Я ChatusFather — помогаю публиковать мини-приложения.\n\n' +
            'Команды:\n' +
            '/newapp — зарегистрировать новое мини-приложение (в конце можно указать URL иконки)\n' +
            '/myapps или myapp — список: номер строки → меню (иконка, удаление)\n' +
            '/agreement — правила разработчика\n' +
            '/cancel — отменить текущий шаг',
        },
      ];
    }

    if (lower === '/agreement') {
      const isDev = await this.miniApps.isDeveloper(userId);
      return [
        {
          text:
            DEVELOPER_AGREEMENT_TEXT +
            '\n\n' +
            (isDev
              ? 'Оферта уже подписана ранее.'
              : 'Отправьте «Согласен» чтобы подписать и продолжить.'),
        },
      ];
    }

    if (state.kind === 'idle' && lower === 'согласен') {
      await this.miniApps.acceptAgreement(userId);
      return [
        { text: 'Отлично, оферта подписана. Теперь вы можете /newapp.' },
      ];
    }

    if (lower === '/newapp') {
      if (!(await this.miniApps.isDeveloper(userId))) {
        this.setState(userId, { kind: 'awaiting_agreement' });
        return [
          { text: DEVELOPER_AGREEMENT_TEXT },
          {
            text:
              'Чтобы публиковать приложения, отправьте «Согласен» в ответ на правила разработчика.',
          },
        ];
      }
      this.setState(userId, { kind: 'newapp_title' });
      return [
        {
          text: 'Как назовём приложение? Пришлите название (2–64 символа).',
        },
      ];
    }

    if (state.kind === 'awaiting_agreement') {
      if (lower === 'согласен') {
        await this.miniApps.acceptAgreement(userId);
        this.setState(userId, { kind: 'newapp_title' });
        return [
          { text: 'Спасибо! Оферта подписана.' },
          { text: 'Как назовём приложение? Пришлите название (2–64 символа).' },
        ];
      }
      return [{ text: 'Отправьте «Согласен» или /cancel.' }];
    }

    if (state.kind === 'newapp_title') {
      if (text.length < 2 || text.length > 64) {
        return [{ text: 'Название должно быть от 2 до 64 символов. Попробуйте ещё раз.' }];
      }
      this.setState(userId, { kind: 'newapp_url', title: text });
      return [
        {
          text:
            'Отлично! Теперь пришлите HTTPS URL вашей страницы мини-приложения (например, https://example.com/app).',
        },
      ];
    }

    if (state.kind === 'newapp_url') {
      let url: URL | null = null;
      try {
        url = new URL(text);
      } catch {
        return [{ text: 'Это не похоже на URL. Пришлите валидный HTTPS адрес.' }];
      }
      if (url.protocol !== 'https:') {
        return [{ text: 'Разрешены только HTTPS URL. Попробуйте ещё раз.' }];
      }
      this.setState(userId, {
        kind: 'newapp_description',
        title: state.title,
        baseUrl: text,
      });
      return [
        {
          text:
            'Готово. Добавьте короткое описание (до 200 символов), или отправьте «-» чтобы пропустить.',
        },
      ];
    }

    if (state.kind === 'newapp_description') {
      const description = text === '-' ? undefined : text.slice(0, 200);
      this.setState(userId, {
        kind: 'newapp_icon',
        title: state.title,
        baseUrl: state.baseUrl,
        description,
      });
      return [
        {
          text:
            'Иконка в каталоге «Сервисы»: пришлите HTTPS-ссылку на картинку (PNG, WebP или SVG), например файл на том же Netlify/GitHub Pages.\n' +
            'Или отправьте «-» чтобы без иконки.',
        },
      ];
    }

    if (state.kind === 'newapp_icon') {
      let iconUrl: string | undefined;
      if (text !== '-') {
        let url: URL | null = null;
        try {
          url = new URL(text.trim());
        } catch {
          return [{ text: 'Нужна корректная HTTPS-ссылка на изображение или «-». Попробуйте ещё раз.' }];
        }
        if (url.protocol !== 'https:') {
          return [{ text: 'Иконка только по HTTPS. Пришлите другой URL или «-».' }];
        }
        iconUrl = text.trim();
      }
      try {
        const app = await this.miniApps.createApp(userId, {
          title: state.title,
          base_url: state.baseUrl,
          description: state.description,
          icon_url: iconUrl,
        });
        this.setState(userId, { kind: 'idle' });
        const iconLine = iconUrl ? `иконка: ${iconUrl}\n` : '';
        return [
          {
            text:
              `Приложение создано и опубликовано в «Сервисах».\n\n` +
              iconLine +
              `id: ${app.short_id}\n` +
              `URL: ${app.base_url}\n` +
              `secret: ${app.secret}\n\n` +
              `Сохраните secret — им проверяется подпись init_data на вашем backend.\n` +
              `Команды: /myapps, /newapp.`,
          },
        ];
      } catch (err) {
        this.setState(userId, { kind: 'idle' });
        const msg = err instanceof Error ? err.message : 'Неизвестная ошибка';
        return [{ text: `Не получилось создать приложение: ${msg}` }];
      }
    }

    return [
      {
        text: 'Не понял команду. Напишите /help, чтобы увидеть список.',
      },
    ];
  }
}
