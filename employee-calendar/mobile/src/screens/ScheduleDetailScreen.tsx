import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ScrollView, Linking, Platform } from 'react-native';
import { useNavigation, useRoute, RouteProp } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQueryClient } from '@tanstack/react-query';
import { deleteSchedule } from '../api/schedules';
import { useAuthStore } from '../store/authStore';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type Route = RouteProp<RootStackParamList, 'ScheduleDetail'>;

export const ScheduleDetailScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { params: { schedule } } = useRoute<Route>();
  const user = useAuthStore((s) => s.user);
  const queryClient = useQueryClient();

  const canEdit = user?.role === 'admin' || user?.id === schedule.created_by;

  // description から project_id・project_name を抽出
  const desc = schedule.description ?? '';
  const projectIdMatch = desc.match(/project_id:([^\n]+)/);
  const projectNameMatch = desc.match(/project_name:([^\n]+)/);
  const projectId = projectIdMatch ? projectIdMatch[1].trim() : null;
  const projectName = projectNameMatch ? projectNameMatch[1].trim() : null;
  const scheduleTitleMatch = desc.match(/schedule_title:([^\n]+)/);
  const scheduleTitle = scheduleTitleMatch ? scheduleTitleMatch[1].trim() : null;
  const addressMatch = desc.match(/project_address:([^\n]+)/);
  const projectAddress = addressMatch ? addressMatch[1].trim() : null;
  const cleanDesc = desc
    .split('\n')
    .filter(l => !l.startsWith('project_id:') && !l.startsWith('project_name:') && !l.startsWith('night_shift:') && !l.startsWith('schedule_title:') && !l.startsWith('project_address:'))
    .join('\n')
    .trim();

  const handleDelete = () => {
    Alert.alert('削除確認', 'この予定を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          await deleteSchedule(schedule.id);
          await queryClient.refetchQueries({ queryKey: ['schedules'] });
          navigation.goBack();
        },
      },
    ]);
  };

  const fmt = (d: string) => {
    const local = d.replace('Z', '').replace(/\+\d{2}:\d{2}$/, '').substring(0, 16);
    const [datePart, timePart] = local.split('T');
    const [y, m, day] = datePart.split('-');
    return `${y}/${m}/${day} ${timePart || '00:00'}`;
  };

  const openMap = (address: string) => {
    const encoded = encodeURIComponent(address);
    const url = Platform.OS === 'ios'
      ? `maps:?q=${encoded}`
      : `geo:0,0?q=${encoded}`;
    Linking.openURL(url).catch(() =>
      Linking.openURL(`https://maps.google.com/?q=${encoded}`)
    );
  };

  const openConstructionApp = () => {
    if (!projectId) return;
    const url = `exp+construction-app://projects/${projectId}`;
    Linking.openURL(url).catch(() => {
      Alert.alert('現場管理アプリ', '現場管理アプリが起動していません。\nExpo GoでアプリのQRを読み込んでください。');
    });
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{schedule.title}</Text>
        <View style={styles.row}>
          <Text style={styles.label}>担当者</Text>
          <Text style={styles.value}>{schedule.user_name} ({schedule.department_name || '部署未設定'})</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>開始</Text>
          <Text style={styles.value}>{schedule.is_all_day ? '終日' : fmt(schedule.start_at)}</Text>
        </View>
        <View style={styles.row}>
          <Text style={styles.label}>終了</Text>
          <Text style={styles.value}>{schedule.is_all_day ? '終日' : fmt(schedule.end_at)}</Text>
        </View>
        {projectName && (
          <View style={styles.row}>
            <Text style={styles.label}>案件名</Text>
            <Text style={styles.value}>🏗 {projectName}</Text>
          </View>
        )}
        {scheduleTitle && (
          <View style={styles.row}>
            <Text style={styles.label}>作業内容</Text>
            <Text style={styles.value}>{scheduleTitle}</Text>
          </View>
        )}
        {projectAddress && (
          <TouchableOpacity onPress={() => openMap(projectAddress)}>
            <View style={styles.row}>
              <Text style={styles.label}>住所</Text>
              <Text style={[styles.value, { color: '#1a56db', textDecorationLine: 'underline' }]}>📍 {projectAddress}</Text>
            </View>
          </TouchableOpacity>
        )}
        {cleanDesc.length > 0 && (
          <View style={styles.row}>
            <Text style={styles.label}>メモ</Text>
            <Text style={styles.value}>{cleanDesc}</Text>
          </View>
        )}
      </View>

      {projectId && (
        <TouchableOpacity style={styles.projectButton} onPress={openConstructionApp}>
          <Text style={styles.projectButtonText}>🏗 現場アプリで案件を開く</Text>
        </TouchableOpacity>
      )}

      {canEdit && (
        <View style={styles.actions}>
          <TouchableOpacity
            style={styles.editButton}
            onPress={() => navigation.navigate('ScheduleForm', { schedule })}
          >
            <Text style={styles.editButtonText}>編集</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.deleteButton} onPress={handleDelete}>
            <Text style={styles.deleteButtonText}>削除</Text>
          </TouchableOpacity>
        </View>
      )}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  card: { margin: 16, backgroundColor: '#FFFFFF', borderRadius: 12, padding: 20 },
  title: { fontSize: 22, fontWeight: '700', color: '#111827', marginBottom: 20 },
  row: { marginBottom: 14 },
  label: { fontSize: 12, color: '#9CA3AF', fontWeight: '600', marginBottom: 2 },
  value: { fontSize: 15, color: '#374151' },
  projectButton: { marginHorizontal: 16, marginBottom: 12, backgroundColor: '#059669', padding: 16, borderRadius: 12, alignItems: 'center' },
  projectButtonText: { color: '#FFFFFF', fontSize: 16, fontWeight: '700' },
  actions: { flexDirection: 'row', paddingHorizontal: 16, gap: 12 },
  editButton: { flex: 1, backgroundColor: '#3B82F6', padding: 14, borderRadius: 10, alignItems: 'center' },
  editButtonText: { color: '#FFFFFF', fontSize: 15, fontWeight: '600' },
  deleteButton: { flex: 1, backgroundColor: '#FEE2E2', padding: 14, borderRadius: 10, alignItems: 'center' },
  deleteButtonText: { color: '#DC2626', fontSize: 15, fontWeight: '600' },
});
