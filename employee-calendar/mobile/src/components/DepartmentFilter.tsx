import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Department } from '../types';
import { getDepartmentColor } from '../constants/departmentColors';

interface Props {
  departments: Department[];
  selectedIds: Set<number>;
  onToggle: (id: number) => void;
}

export const DepartmentFilter: React.FC<Props> = ({ departments, selectedIds, onToggle }) => (
  <View style={styles.wrapper}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      {departments.map((d) => {
        const isOn = selectedIds.has(d.id);
        const color = getDepartmentColor(d.name);
        return (
          <TouchableOpacity
            key={d.id}
            style={[styles.chip, isOn && { backgroundColor: color, borderColor: color }]}
            onPress={() => onToggle(d.id)}
          >
            {isOn && <Text style={styles.checkMark}>✓ </Text>}
            <Text style={[styles.chipText, isOn && styles.chipTextSelected]}>{d.name}</Text>
          </TouchableOpacity>
        );
      })}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  wrapper: { height: 28, backgroundColor: '#fff' },
  content: { paddingHorizontal: 12, alignItems: 'center' },
  chip: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    backgroundColor: '#F3F4F6', marginRight: 5, borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipText: { fontSize: 11, color: '#9CA3AF' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
  checkMark: { fontSize: 11, color: '#FFFFFF', fontWeight: '700' },
});
