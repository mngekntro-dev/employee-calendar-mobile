import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Employee } from '../types';

interface Props {
  employee: Employee;
  onPress: () => void;
}

export const EmployeeCard: React.FC<Props> = ({ employee, onPress }) => (
  <TouchableOpacity style={styles.container} onPress={onPress}>
    <View style={styles.avatar}>
      <Text style={styles.avatarText}>{employee.name.charAt(0)}</Text>
    </View>
    <View style={styles.info}>
      <Text style={styles.name}>{employee.name}</Text>
      <Text style={styles.dept}>{employee.department_name || '部署未設定'}</Text>
    </View>
    {employee.role === 'admin' && (
      <View style={styles.badge}>
        <Text style={styles.badgeText}>管理者</Text>
      </View>
    )}
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', alignItems: 'center', padding: 16,
    backgroundColor: '#FFFFFF', borderRadius: 12, marginBottom: 8,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: '#3B82F6', alignItems: 'center', justifyContent: 'center', marginRight: 12,
  },
  avatarText: { color: '#FFFFFF', fontSize: 18, fontWeight: '700' },
  info: { flex: 1 },
  name: { fontSize: 16, fontWeight: '600', color: '#111827' },
  dept: { fontSize: 13, color: '#6B7280', marginTop: 2 },
  badge: { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 12 },
  badgeText: { fontSize: 11, color: '#92400E', fontWeight: '600' },
});
