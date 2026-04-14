import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import {
  ChannelAdminScreen,
  ChannelCatalogScreen,
  ChannelDiscussionScreen,
  ChannelFeedScreen,
  ChannelPreviewScreen,
  CreateChannelScreen,
} from '../screens';
import type { ChannelsStackParamList } from './types';
import { colors } from '../theme/colors';

const Stack = createNativeStackNavigator<ChannelsStackParamList>();

export function ChannelsStack() {
  return (
    <Stack.Navigator
      id={undefined as never}
      screenOptions={{
        headerStyle: { backgroundColor: colors.toolbar },
        headerShadowVisible: false,
        headerTintColor: colors.textPrimary,
        headerTitleStyle: { color: colors.textPrimary, fontWeight: '700' },
      }}
    >
      <Stack.Screen
        name="ChannelCatalog"
        component={ChannelCatalogScreen}
        options={{ title: 'Каналы' }}
      />
      <Stack.Screen
        name="ChannelPreview"
        component={ChannelPreviewScreen}
        options={{ title: 'Превью' }}
      />
      <Stack.Screen
        name="ChannelFeed"
        component={ChannelFeedScreen}
        options={{ title: 'Канал' }}
      />
      <Stack.Screen
        name="ChannelDiscussion"
        component={ChannelDiscussionScreen}
        options={{ title: 'Обсуждение' }}
      />
      <Stack.Screen
        name="CreateChannel"
        component={CreateChannelScreen}
        options={{ title: 'Создать канал' }}
      />
      <Stack.Screen
        name="ChannelAdmin"
        component={ChannelAdminScreen}
        options={{ title: 'Управление каналом' }}
      />
    </Stack.Navigator>
  );
}
