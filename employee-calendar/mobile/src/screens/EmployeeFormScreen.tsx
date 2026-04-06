import React, { useState } from 'react';
import { View, Text, TextInput, StyleSheet, TouchableOpacity, Alert, ScrollView, ActivityIndicator, Switch } from 'react-native';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { createEmployee, updateEmployee } from '../api/employees';
import { getDepartments } from '../api/departments';

const COLORS = [
  '#3B82F6','#EF4444','#10B981','#F59E0B','#8B5CF6',
  '#F97316','#EC4899','#06B6D4','#84CC16','#14B8A6',
  '#A855F7','#F43F5E','#0EA5E9','#D97706','#6366F1',
];

export const EmployeeFormScreen = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const employee = params?.employee;
  const queryClient = useQueryClient();
  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });

  const [name, setName] = useState(employee?.name || '');
  const [email, setEmail] = useState(employee?.email || '');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(employee?.role === 'admin');
  const [selectedDept, setSelectedDept] = useState(employee?.department_id ?? null);
  const [color, setColor] = useState(employee?.color || '#3B82F6');
  const [loading, setLoading] = useState(false);

  const handleSave = async () => {
    if (!name.trim() || !email.trim()) { Alert.alert('エラー', '名前とメールは必須です'); return; }
    if (!employee && !password) { Alert.alert('エラー', '新規登録時はパスワードを入力してください'); return; }
    setLoading(true);
    try {
      const data = { name: name.trim(), email: email.trim(), role: isAdmin ? 'admin' : 'employee', department_id: selectedDept, color, ...(password ? { password } : {}) };
      if (employee) { await updateEmployee(employee.id, data); }
      else { await createEmployee({ ...data, password }); }
      await queryClient.refetchQueries({ queryKey: ['employees'] });
      navigation.goBack();
    } catch (e) {
      Alert.alert('エラー', e?.response?.data?.error || '保存に失敗しました');
    } finally { setLoading(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ padding: 20 }}>
        <Text style={styles.label}>名前 *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="例: 田中太郎" />
        <Text style={styles.label}>メールアドレス *</Text>
        <TextInput style={styles.input} value={email} onChangeText={setEmail} placeholder="例: tanaka@example.com" keyboardType="email-address" autoCapitalize="none" />
        <Text style={styles.label}>{employee ? 'パスワード（変更する場合のみ）' : 'パスワード *'}</Text>
        <TextInput style={styles.input} value={password} onChangeText={setPassword} placeholder={employee ? '変更しない場合は空欄' : 'パスワードを入力'} secureTextEntry />
        <Text style={styles.label}>カレンダーの色</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 }}>
          {COLORS.map(c => (
            <TouchableOpacity key={c} onPress={() => setColor(c)}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: c,
                borderWidth: color === c ? 3 : 0, borderColor: '#fff',
                shadowColor: color === c ? c : 'transparent', shadowOpacity: 0.8, shadowRadius: 4, elevation: color === c ? 4 : 0 }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: color, borderRadius: 8, marginBottom: 8 }}>
          <Text style={{ color: '#fff', fontWeight: '700' }}>プレビュー: {name || '社員名'}</Text>
        </View>
        <Text style={styles.label}>部署</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity style={[styles.chip, selectedDept === null && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]} onPress={() => setSelectedDept(null)}>
            <Text style={[styles.chipText, selectedDept === null && { color: '#fff' }]}>未設定</Text>
          </TouchableOpacity>
          {departments.map(d => (
            <TouchableOpacity key={d.id} style={[styles.chip, selectedDept === d.id && { backgroundColor: '#3B82F6', borderColor: '#3B82F6' }]} onPress={() => setSelectedDept(d.id)}>
              <Text style={[styles.chipText, selectedDept === d.id && { color: '#fff' }]}>{d.name}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 16 }}>
          <Text style={styles.label}>管理者権限</Text>
          <Switch value={isAdmin} onValueChange={setIsAdmin} trackColor={{ true: '#3B82F6' }} />
        </View>
        <TouchableOpacity style={[styles.saveButton, { backgroundColor: color }]} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{employee ? '更新' : '登録'}</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 16 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  chip: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20, backgroundColor: '#F3F4F6', borderWidth: 1, borderColor: '#E5E7EB' },
  chipText: { fontSize: 13, color: '#374151' },
  saveButton: { borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 32 },
});