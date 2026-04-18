import * as Linking from 'expo-linking';
import type { LinkingOptions } from '@react-navigation/native';

const prefixes = [Linking.createURL('/'), 'messenger://', 'chatus://'];

/**
 * Deep links: chatus://c/:slug (public), chatus://join/:inviteToken (invite); OAuth — messenger://.
 * Typed loosely: only a subset of ChatsStack screens is listed for URLs.
 */
export const appLinking = {
  prefixes,
  config: {
    screens: {
      Chats: {
        screens: {
          ChannelLinkSlug: {
            path: 'c/:slug',
            parse: {
              slug: (value: string) => decodeURIComponent(value),
            },
          },
          ChannelLinkInvite: {
            path: 'join/:inviteToken',
            parse: {
              inviteToken: (value: string) => decodeURIComponent(value),
            },
          },
        },
      },
    },
  },
} as unknown as LinkingOptions<Record<string, unknown>>;
