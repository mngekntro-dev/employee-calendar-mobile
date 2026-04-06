import React from 'react';
import { View, Text, FlatList, StyleSheet, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getEmployees, deleteEmployee } from '../api/employees';
import { RootStackParamList, Employee } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const AdminScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const queryClient = useQueryClient();
  const { data: employees = [], isLoading } = useQuery({ queryKey: ['employees'], queryFn: () => getEmployees() });

  const handleDelete = (emp: Employee) => {
    Alert.alert('削除確認', `「${emp.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        try {
          await deleteEmployee(emp.id);
          queryClient.invalidateQueries({ queryKey: ['employees'] });
        } catch (e: any) {
          Alert.alert('エラー', e?.response?.data?.error || '削除に失敗しました');
        }
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>部署管理</Text>
        <TouchableOpacity style={styles.sectionButton} onPress={() => navigation.navigate('DepartmentManage')}>
          <Text style={styles.sectionButtonText}>部署を管理する →</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.divider} />

      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>社員管理</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => navigation.navigate('EmployeeForm', {})}>
            <Text style={styles.addBtnText}>+ 追加</Text>
          </TouchableOpacity>
        </View>
      </View>

      {isLoading ? <ActivityIndicator color="#3B82F6" style={{ marginTop: 20 }} /> : (
        <FlatList
          data={employees}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.name.charAt(0)}</Text>
              </View>
              <View style={styles.info}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.sub}>{item.department_name || '部署未設定'} · {item.role === 'admin' ? '管理者' : '一般'}</Text>
              </View>
              <View style={styles.actions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('EmployeeForm', { employee: item })}>
                  <Text style={styles.editBtnText}>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 16 }}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  section: { paddingHorizontal: 16, paddingVertical: 12 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  sectionButton: { marginTop: 8, backgroundColor: '#EFF6FF', padding: 12, borderRadius: 8 },
  sectionButtonText: { color: '#3B82F6', fontWeight: '600', fontSize: 14 },
  addBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#fff', fontWeight: '600', fontSize: 13 },
  divider: { height: 1, backgroundColor: '#E5E7EB', marginHorizontal: 16 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 12, borderRadius: 10, marginBottom: 8 },
  avatar: { width: 40, height: 40, borderRadius: 20, backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 15, fontWeight: '600', color: '#111827' },
  sub: { fontSize: 12, color: '#6B7280', marginTop: 2 },
  actions: { flexDirection: 'row', gap: 6 },
  editBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  editBtnText: { color: '#3B82F6', fontWeight: '600', fontSize: 12 },
  deleteBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6 },
  deleteBtnText: { color: '#DC2626', fontWeight: '600', fontSize: 12 },
});
