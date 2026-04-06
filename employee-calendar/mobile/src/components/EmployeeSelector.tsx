import React from 'react';
import { ScrollView, TouchableOpacity, Text, View, StyleSheet } from 'react-native';
import { Employee } from '../types';

interface Props {
  employees: Employee[];
  selectedId: number | null;
  onSelect: (id: number | null) => void;
}

export const EmployeeSelector: React.FC<Props> = ({ employees, selectedId, onSelect }) => (
  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.container} contentContainerStyle={styles.content}>
    <TouchableOpacity style={styles.item} onPress={() => onSelect(null)}>
      <View style={[styles.avatar, selectedId === null && styles.avatarSelected]}>
        <Text style={styles.avatarText}>全</Text>
      </View>
      <Text style={[styles.name, selectedId === null && styles.nameSelected]}>全員</Text>
    </TouchableOpacity>
    {employees.map((emp) => (
      <TouchableOpacity key={emp.id} style={styles.item} onPress={() => onSelect(emp.id)}>
        <View style={[styles.avatar, selectedId === emp.id && styles.avatarSelected]}>
          <Text style={styles.avatarText}>{emp.name.charAt(0)}</Text>
        </View>
        <Text style={[styles.name, selectedId === emp.id && styles.nameSelected]} numberOfLines={1}>{emp.name}</Text>
      </TouchableOpacity>
    ))}
  </ScrollView>
);

const styles = StyleSheet.create({
  container: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB', maxHeight: 56 },
  content: { paddingHorizontal: 12, paddingVertical: 4, gap: 8 },
  item: { alignItems: 'center', width: 44 },
  avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#E5E7EB', alignItems: 'center', justifyContent: 'center', marginBottom: 2 },
  avatarSelected: { backgroundColor: '#3B82F6' },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  name: { fontSize: 9, color: '#6B7280', textAlign: 'center' },
  nameSelected: { color: '#3B82F6', fontWeight: '700' },
});
