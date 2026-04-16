import React from 'react';
import { Text } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import GeneratorListScreen from '../screens/generators/GeneratorListScreen';
import GeneratorFormScreen from '../screens/generators/GeneratorFormScreen';
import GeneratorDetailScreen from '../screens/generators/GeneratorDetailScreen';
import GeneratorProcessScreen from '../screens/generators/GeneratorProcessScreen';
import GeneratorCalendarScreen from '../screens/generators/GeneratorCalendarScreen';
import GeneratorMasterScreen from '../screens/generators/GeneratorMasterScreen';

const Tab = createBottomTabNavigator();
const Stack = createStackNavigator();

const HEADER_OPTS = {
  headerStyle: { backgroundColor: '#1D9E75' },
  headerTintColor: '#ffffff',
  headerTitleStyle: { fontWeight: 'bold' as const, fontSize: 18 },
};

function GeneratorStack() {
  return (
    <Stack.Navigator screenOptions={HEADER_OPTS}>
      <Stack.Screen name="GeneratorList" component={GeneratorListScreen} options={{ title: '発電機管理 - 案件一覧' }} />
      <Stack.Screen name="GeneratorForm" component={GeneratorFormScreen} options={{ title: '案件登録' }} />
      <Stack.Screen name="GeneratorDetail" component={GeneratorDetailScreen} options={{ title: '案件詳細' }} />
      <Stack.Screen name="GeneratorProcess" component={GeneratorProcessScreen} options={{ title: '工程表' }} />
    </Stack.Navigator>
  );
}

function CalendarStack() {
  return (
    <Stack.Navigator screenOptions={HEADER_OPTS}>
      <Stack.Screen name="GeneratorCalendar" component={GeneratorCalendarScreen} options={{ title: '年間カレンダー' }} />
    </Stack.Navigator>
  );
}

function MasterStack() {
  return (
    <Stack.Navigator screenOptions={HEADER_OPTS}>
      <Stack.Screen name="GeneratorMaster" component={GeneratorMasterScreen} options={{ title: '発電機台帳' }} />
    </Stack.Navigator>
  );
}

export function MainNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: '#1D9E75',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: { backgroundColor: '#ffffff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
        tabBarLabelStyle: { fontSize: 11, fontWeight: '600' },
      }}
    >
      <Tab.Screen
        name="Cases"
        component={GeneratorStack}
        options={{
          tabBarLabel: '案件一覧',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📋</Text>,
        }}
      />
      <Tab.Screen
        name="Calendar"
        component={CalendarStack}
        options={{
          tabBarLabel: 'カレンダー',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>📅</Text>,
        }}
      />
      <Tab.Screen
        name="Master"
        component={MasterStack}
        options={{
          tabBarLabel: '発電機台帳',
          tabBarIcon: ({ color }) => <Text style={{ fontSize: 20, color }}>⚡</Text>,
        }}
      />
    </Tab.Navigator>
  );
}
