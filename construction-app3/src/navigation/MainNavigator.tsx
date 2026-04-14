import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import GeneratorListScreen from '../screens/generators/GeneratorListScreen';
import GeneratorFormScreen from '../screens/generators/GeneratorFormScreen';
import GeneratorDetailScreen from '../screens/generators/GeneratorDetailScreen';
import GeneratorProcessScreen from '../screens/generators/GeneratorProcessScreen';
import GeneratorCalendarScreen from '../screens/generators/GeneratorCalendarScreen';
import GeneratorMasterScreen from '../screens/generators/GeneratorMasterScreen';

const Stack = createStackNavigator();

export function MainNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1D9E75' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
      }}
    >
      <Stack.Screen
        name="GeneratorList"
        component={GeneratorListScreen}
        options={{ title: '⚡ 発電機管理' }}
      />
      <Stack.Screen
        name="GeneratorForm"
        component={GeneratorFormScreen}
        options={{ title: '案件登録' }}
      />
      <Stack.Screen
        name="GeneratorDetail"
        component={GeneratorDetailScreen}
        options={{ title: '案件詳細' }}
      />
      <Stack.Screen
        name="GeneratorProcess"
        component={GeneratorProcessScreen}
        options={{ title: '工程表' }}
      />
      <Stack.Screen
        name="GeneratorCalendar"
        component={GeneratorCalendarScreen}
        options={{ title: '年間カレンダー' }}
      />
      <Stack.Screen
        name="GeneratorMaster"
        component={GeneratorMasterScreen}
        options={{ title: '発電機台帳' }}
      />
    </Stack.Navigator>
  );
}
