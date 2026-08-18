import React from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Employee } from '../types';
import { getDepartmentColor } from '../constants/departmentColors';

interface Props {
  employees: Employee[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}

export const EmployeeSelector: React.FC<Props> = ({ employees, selectedIds, onToggle }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container} contentContainerStyle={styles.content}>
    {employees.map((emp) => {
      const isOn = selectedIds.has(emp.id);
      const color = getDepartmentColor(emp.department_name);
      return (
        <TouchableOpacity key={emp.id} style={styles.item} onPress={() => onToggle(emp.id)}>
          <View style={[styles.avatar, isOn ? { backgroundColor: color } : styles.avatarOff]}>
            <Text style={[styles.avatarText, !isOn && styles.avatarTextOff]}>{emp.name.charAt(0)}</Text>
            {isOn && (
              <View style={styles.checkBadge}>
                <Text style={styles.checkBadgeText}>✓</Text>
              </View>
            )}
          </View>
          <Text style={[styles.name, !isOn && styles.nameOff]} numberOfLines={1}>{emp.name}</Text>
        </TouchableOpacity>
      );
    })}
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', maxHeight: 56 },
  content: { paddingHorizontal: 12, paddingVertical: 4, gap: 8 },
  item: { alignItems: 'center', width: 44 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  avatarOff: { backgroundColor: '#F3F4F6' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  avatarTextOff: { color: '#9CA3AF' },
  checkBadge: {
    position: 'absolute', bottom: -2, right: -2, width: 12, height: 12, borderRadius: 6,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB',
  },
  checkBadgeText: { fontSize: 8, color: '#10B981', fontWeight: '900' },
  name: { fontSize: 9, color: '#374151', textAlign: 'center' },
  nameOff: { color: '#9CA3AF' },
});
