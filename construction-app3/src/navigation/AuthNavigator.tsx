import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import LoginScreen from '../screens/auth/LoginScreen';
import InviteAcceptScreen from '../screens/auth/InviteAcceptScreen';

type AuthStackParamList = {
  LoginHome: undefined;
  InviteAcceptHome: { token: string };
};

const Stack = createStackNavigator<AuthStackParamList>();

export function AuthNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="LoginHome" component={LoginScreen} />
      <Stack.Screen name="InviteAcceptHome" component={InviteAcceptScreen} />
    </Stack.Navigator>
  );
}
