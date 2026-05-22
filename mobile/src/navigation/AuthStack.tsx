import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { LoginScreen } from '../screens';
import type { AuthSession } from '../services/AuthService';
import type { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

type Props = {
  onLoginSession: (session: AuthSession) => Promise<void>;
};

export function AuthStack({ onLoginSession }: Props) {
  return (
    <Stack.Navigator
      id={undefined as never}
      screenOptions={{
        headerShown: false,
      }}
    >
      <Stack.Screen name="Login">
        {() => <LoginScreen onLoginSession={onLoginSession} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
}
