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
  | { kind: 'newapp_icon'; title: string; baseUrl: string; description?: string };

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

    if (lower === '/start' || lower === '/help') {
      this.setState(userId, { kind: 'idle' });
      return [
        {
          text:
            'Привет! Я ChatusFather — помогаю публиковать мини-приложения.\n\n' +
            'Команды:\n' +
            '/newapp — зарегистрировать новое мини-приложение (в конце можно указать URL иконки)\n' +
            '/myapps — список ваших приложений\n' +
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

    if (lower === '/myapps') {
      const apps = await this.miniApps.listOwnedApps(userId);
      if (apps.length === 0) {
        return [{ text: 'У вас пока нет приложений. Создайте первое: /newapp' }];
      }
      const lines = apps.map((a, i) => {
        var iconLn = a.icon_url ? `\n   icon: ${a.icon_url}` : '';
        return `${i + 1}. ${a.title}\n   id: ${a.short_id}\n   URL: ${a.base_url}${iconLn}\n   secret: ${a.secret}`;
      });
      return [
        {
          text:
            'Ваши приложения:\n\n' +
            lines.join('\n\n') +
            '\n\nБерегите secret — им подписывается init_data для вашего backend.',
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
