import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { View, ActivityIndicator, TouchableOpacity, Text } from 'react-native';
import { useAuthStore } from './src/store/authStore';
import { LoginScreen } from './src/screens/LoginScreen';
import { CalendarScreen } from './src/screens/CalendarScreen';
import { EmployeeListScreen } from './src/screens/EmployeeListScreen';
import { ScheduleDetailScreen } from './src/screens/ScheduleDetailScreen';
import { ScheduleFormScreen } from './src/screens/ScheduleFormScreen';
import { AdminScreen } from './src/screens/AdminScreen';
import { EmployeeFormScreen } from './src/screens/EmployeeFormScreen';
import { DepartmentManageScreen } from './src/screens/DepartmentManageScreen';
import { RootStackParamList, MainTabParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tab = createBottomTabNavigator<MainTabParamList>();
const queryClient = new QueryClient();

const MainTabs = () => {
  const user = useAuthStore((s) => s.user);
  const logout = useAuthStore((s) => s.logout);
  return (
    <Tab.Navigator screenOptions={{ tabBarActiveTintColor: '#3B82F6' }}>
      <Tab.Screen
        name="Calendar"
        component={CalendarScreen}
        options={{
          title: 'カレンダー',
          tabBarLabel: 'カレンダー',
          headerRight: () => (
            <TouchableOpacity onPress={logout} style={{ marginRight: 16 }}>
              <Text style={{ color: '#EF4444', fontSize: 14 }}>ログアウト</Text>
            </TouchableOpacity>
          ),
        }}
      />
      <Tab.Screen name="EmployeeList" component={EmployeeListScreen} options={{ title: '社員一覧', tabBarLabel: '社員' }} />
      {user?.role === 'admin' && (
        <Tab.Screen name="Admin" component={AdminScreen} options={{ title: '管理', tabBarLabel: '管理' }} />
      )}
    </Tab.Navigator>
  );
};

const AppInner = () => {
  const { token, loadToken } = useAuthStore();
  const [loading, setLoading] = useState(true);

  useEffect(() => { loadToken().finally(() => setLoading(false)); }, []);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" color="#3B82F6" />
      </View>
    );
  }

  return (
    <NavigationContainer>
      <Stack.Navigator>
        {!token ? (
          <Stack.Screen name="Login" component={LoginScreen} options={{ headerShown: false }} />
        ) : (
          <>
            <Stack.Screen name="Main" component={MainTabs} options={{ headerShown: false }} />
            <Stack.Screen name="ScheduleDetail" component={ScheduleDetailScreen} options={{ title: '予定詳細' }} />
            <Stack.Screen name="ScheduleForm" component={ScheduleFormScreen}
              options={({ route }) => ({ title: route.params?.schedule ? '予定を編集' : '予定を追加' })} />
            <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen}
              options={({ route }) => ({ title: route.params?.employee ? '社員を編集' : '社員を追加' })} />
            <Stack.Screen name="DepartmentManage" component={DepartmentManageScreen} options={{ title: '部署管理' }} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}