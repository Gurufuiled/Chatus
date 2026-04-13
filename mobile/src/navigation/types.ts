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
};

export type ChannelsStackParamList = {
  ChannelCatalog: undefined;
  ChannelPreview: { channelId: string };
  ChannelFeed: { channelId: string };
  ChannelDiscussion: { channelId: string; postId: string };
  CreateChannel: undefined;
  ChannelAdmin: { channelId: string };
};

export type MainTabParamList = {
  Chats: NavigatorScreenParams<ChatsStackParamList>;
  Channels: NavigatorScreenParams<ChannelsStackParamList>;
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
        ChatsStackParamList,
        ChannelsStackParamList {}
  }
}
