import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { Text, Platform } from 'react-native';
import { useAuth } from '../context/AuthContext';
import ProjectListScreen from '../screens/projects/ProjectListScreen';
import ProjectDetailScreen from '../screens/projects/ProjectDetailScreen';
import ProjectFormScreen from '../screens/projects/ProjectFormScreen';
import TeamMemberScreen from '../screens/team/TeamMemberScreen';
import UserManagementScreen from '../screens/admin/UserManagementScreen';
import PhotoLedgerScreen from '../screens/projects/PhotoLedgerScreen';
import ChatScreen from '../screens/projects/ChatScreen';

const Tab = createBottomTabNavigator();
const ProjectStack = createStackNavigator();

function ProjectStackNavigator() {
  return (
    <ProjectStack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: '#1a56db' },
        headerTintColor: '#ffffff',
        headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
        cardStyle: { overflow: 'visible' as any, flex: 1 },
      }}
    >
      <ProjectStack.Screen
        name="ProjectListHome"
        component={ProjectListScreen}
        options={{ title: '案件一覧' }}
      />
      <ProjectStack.Screen
        name="ProjectDetail"
        component={ProjectDetailScreen}
        options={{ title: '案件詳細' }}
      />
      <ProjectStack.Screen
        name="ProjectForm"
        component={ProjectFormScreen}
        options={({ route }: any) => ({
          title: route.params?.projectId ? '案件を編集' : '案件を新規作成',
        })}
      />
      <ProjectStack.Screen
        name="TeamMember"
        component={TeamMemberScreen}
        options={{ title: 'チームメンバー管理' }}
      />
      <ProjectStack.Screen
        name="PhotoLedger"
        component={PhotoLedgerScreen}
        options={{ title: '写真台帳の作成' }}
      />
      <ProjectStack.Screen
        name="Chat"
        component={ChatScreen}
        options={{ title: 'チャット' }}
      />
      <ProjectStack.Screen
        name="UserMgmt"
        component={UserManagementScreen}
        options={{ title: 'メンバー管理' }}
      />
    </ProjectStack.Navigator>
  );
}

export function MainNavigator() {
  const { profile } = useAuth();
  const isAdmin = profile?.role === 'admin';

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarActiveTintColor: '#1a56db',
        tabBarInactiveTintColor: '#9ca3af',
        tabBarStyle: Platform.OS === 'web' ? { display: 'none' } : { height: 80, paddingBottom: 24 },
        tabBarLabelStyle: { fontSize: 13, fontWeight: '600' },
        tabBarIcon: ({ color }) => {
          const icons: Record<string, string> = {
            Projects: '📋',
            UserMgmt: '👥',
          };
          return <Text style={{ fontSize: 22, color }}>{icons[route.name] ?? '📋'}</Text>;
        },
      })}
    >
      <Tab.Screen
        name="Projects"
        component={ProjectStackNavigator}
        options={{ tabBarLabel: '案件' }}
      />
      {isAdmin && (
        <Tab.Screen
          name="UserMgmt"
          component={UserManagementScreen}
          options={{
            tabBarLabel: 'メンバー管理',
            headerShown: true,
            title: 'メンバー管理',
            headerStyle: { backgroundColor: '#1a56db' },
            headerTintColor: '#ffffff',
            headerTitleStyle: { fontWeight: 'bold', fontSize: 18 },
          }}
        />
      )}
    </Tab.Navigator>
  );
}
