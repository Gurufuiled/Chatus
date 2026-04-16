# Каналы (Channels)

Краткая карта для ИИ — **не** дублировать код, только навигация.

## Клиент (React Native)

- Лента: `mobile/src/screens/ChannelFeedScreen.tsx`
- Обсуждение поста: `mobile/src/screens/ChannelDiscussionScreen.tsx`
- Навигация: `mobile/src/navigation/ChatsStack.tsx`, `MainTabs.tsx`
- API: `mobile/src/services/channelService.ts`
- Стейт: `mobile/src/stores/channelStore.ts`

## Сервер

- Сервис: `server/src/channels/channels.service.ts`
- Маппинг сообщений (в т.ч. `sender_name`, `sender_avatar_url` для discussion): `server/src/common/mappers.ts`

## Заметки

- Посты с медиа: embedded баблы без двойной рамки; ширина карточки ≈ ширина медиа.
- Комментарии в discussion: сортировка по времени; оригинальный пост сверху из `feedByChannelId` по `postId`.

Связано: [[../Home|Home]], [[Code-map]].
