import React from 'react';
import { View, ScrollView, TouchableOpacity, Text, StyleSheet } from 'react-native';
import { Department } from '../types';

interface Props {
  departments: Department[];
  selected: number | null;
  onSelect: (id: number | null) => void;
}

export const DepartmentFilter: React.FC<Props> = ({ departments, selected, onSelect }) => (
  <View style={styles.wrapper}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.content}>
      <TouchableOpacity
        style={[styles.chip, selected === null && styles.chipSelected]}
        onPress={() => onSelect(null)}
      >
        <Text style={[styles.chipText, selected === null && styles.chipTextSelected]}>全社員</Text>
      </TouchableOpacity>
      {departments.map((d) => (
        <TouchableOpacity
          key={d.id}
          style={[styles.chip, selected === d.id && styles.chipSelected]}
          onPress={() => onSelect(d.id)}
        >
          <Text style={[styles.chipText, selected === d.id && styles.chipTextSelected]}>{d.name}</Text>
        </TouchableOpacity>
      ))}
    </ScrollView>
  </View>
);

const styles = StyleSheet.create({
  wrapper: { height: 28, backgroundColor: '#fff' },
  content: { paddingHorizontal: 12, alignItems: 'center' },
  chip: {
    paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10,
    backgroundColor: '#F3F4F6', marginRight: 5, borderWidth: 1, borderColor: '#E5E7EB',
  },
  chipSelected: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  chipText: { fontSize: 11, color: '#374151' },
  chipTextSelected: { color: '#FFFFFF', fontWeight: '600' },
});
