import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';
import * as Linking from 'expo-linking';
import { useAuth } from '../context/AuthContext';
import { AuthNavigator } from './AuthNavigator';
import { MainNavigator } from './MainNavigator';
import InviteAcceptScreen from '../screens/auth/InviteAcceptScreen';
import { RootStackParamList } from '../types';
import { View, ActivityIndicator, StyleSheet } from 'react-native';

const Stack = createStackNavigator<RootStackParamList>();

const prefix = Linking.createURL('/');

const linking = {
  prefixes: [prefix, 'construction-app://', 'exp+construction-app://'],
  config: {
    screens: {
      Login: 'login',
      InviteAccept: 'invite/:token',
      Main: {
        screens: {
          ProjectList: {
            screens: {
              ProjectListHome: 'projects',
              ProjectDetail: 'projects/:projectId',
            },
          },
        },
      },
    },
  },
};

export function AppNavigator() {
  const { session, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#1a56db" />
      </View>
    );
  }

  return (
    <NavigationContainer linking={linking}>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {session ? (
          <Stack.Screen name="Main" component={MainNavigator} />
        ) : (
          <>
            <Stack.Screen name="Login" component={AuthNavigator} />
            <Stack.Screen name="InviteAccept" component={InviteAcceptScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
});
