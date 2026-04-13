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
        options={{ title: 'Channels' }}
      />
      <Stack.Screen
        name="ChannelPreview"
        component={ChannelPreviewScreen}
        options={{ title: 'Preview' }}
      />
      <Stack.Screen
        name="ChannelFeed"
        component={ChannelFeedScreen}
        options={{ title: 'Channel' }}
      />
      <Stack.Screen
        name="ChannelDiscussion"
        component={ChannelDiscussionScreen}
        options={{ title: 'Discussion' }}
      />
      <Stack.Screen
        name="CreateChannel"
        component={CreateChannelScreen}
        options={{ title: 'Create channel' }}
      />
      <Stack.Screen
        name="ChannelAdmin"
        component={ChannelAdminScreen}
        options={{ title: 'Manage channel' }}
      />
    </Stack.Navigator>
  );
}
