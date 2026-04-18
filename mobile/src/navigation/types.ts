import type { NavigatorScreenParams } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import type { BottomTabScreenProps } from '@react-navigation/bottom-tabs';

export type AuthStackParamList = {
  Login: undefined;
};

export type ChatsStackParamList = {
  ChatList: undefined;
  Chat: { chatId: string; chatTitle?: string; focusMessageId?: string; startSearch?: boolean };
  ChatProfile: { chatId: string; userId: string; chatTitle?: string };
  GroupProfile: { chatId: string; chatTitle?: string };
  CreateGroupChat: undefined;
  ChannelCatalog: undefined;
  /** Deep link: chatus://c/:slug — public channel by slug */
  ChannelLinkSlug: { slug: string };
  /** Deep link: chatus://join/:inviteToken — invite (private or share) */
  ChannelLinkInvite: { inviteToken: string };
  ChannelPreview: { channelId: string };
  ChannelFeed: { channelId: string; inviteToken?: string };
  ChannelInviteLinks: { channelId: string };
  ChannelProfile: { channelId: string };
  ChannelEdit: { channelId: string };
  ChannelMembers: { channelId: string; mode: 'admins' | 'subscribers' | 'banned' };
  ChannelAdminPermissions: {
    channelId: string;
    memberId: string;
    memberName?: string;
    memberAvatarUrl?: string | null;
  };
  ChannelAddAdmin: { channelId: string; memberId?: string; memberName?: string };
  ChannelDiscussion: { channelId: string; postId: string };
  CreateChannel: undefined;
  ChannelAdmin: { channelId: string };
  ChannelSettings: { channelId: string };
  ChannelType: { channelId: string };
  ChannelDiscussionSettings: { channelId: string };
};

export type MainTabParamList = {
  Chats: NavigatorScreenParams<ChatsStackParamList>;
  Contacts: undefined;
  Settings: undefined;
};

export type AuthStackScreenProps<T extends keyof AuthStackParamList> =
  NativeStackScreenProps<AuthStackParamList, T>;

export type MainTabScreenProps<T extends keyof MainTabParamList> =
  BottomTabScreenProps<MainTabParamList, T>;

declare global {
  namespace ReactNavigation {
    interface RootParamList
      extends AuthStackParamList,
        MainTabParamList,
        ChatsStackParamList {}
  }
}
