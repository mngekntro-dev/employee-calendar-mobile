import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet } from 'react-native';
import { Schedule } from '../types';

interface Employee { id: number; name: string; color: string | null; }
interface Props {
  date: string;
  schedules: Schedule[];
  employees: Employee[];
  onSchedulePress: (s: Schedule) => void;
  onAddPress: () => void;
}

const fmtTime = (iso: string) => {
  const local = iso.replace('Z', '').replace(/\+\d{2}:\d{2}$/, '').substring(0, 16);
  return local.split('T')[1] || '00:00';
};

export const DayView: React.FC<Props> = ({ date, schedules, employees, onSchedulePress, onAddPress }) => {
  const empMap: Record<number, { name: string; color: string }> = {};
  employees.forEach(e => { empMap[e.id] = { name: e.name, color: e.color || '#3B82F6' }; });

  const fmt = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const daySchedules = schedules
    .filter(s => s.start_at.substring(0, 10) === date)
    .sort((a, b) => new Date(a.start_at).getTime() - new Date(b.start_at).getTime());

  const [y, m, d2] = date.split('-');
  const label = `${y}/${m}/${d2}`;

  return (
    <View style={{ flex: 1 }}>
      <View style={styles.header}>
        <Text style={styles.dateLabel}>{label} の予定</Text>
        <TouchableOpacity style={styles.addBtn} onPress={onAddPress}>
          <Text style={styles.addBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>
      <ScrollView style={{ flex: 1 }}>
        {daySchedules.length === 0 ? (
          <Text style={styles.empty}>この日の予定はありません</Text>
        ) : (
          daySchedules.map(s => {
            const emp = empMap[s.user_id];
            const color = emp?.color || '#3B82F6';
            return (
              <TouchableOpacity key={s.id} style={[styles.card, { borderLeftColor: color }]} onPress={() => onSchedulePress(s)}>
                <Text style={styles.time}>{fmtTime(s.start_at)} 〜 {fmtTime(s.end_at)}</Text>
                <Text style={styles.title}>{s.title}</Text>
                {emp && <Text style={styles.empName}>{emp.name}</Text>}
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#E5E7EB',
  },
  dateLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  addBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 14, paddingVertical: 6, borderRadius: 8 },
  addBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 14 },
  card: {
    backgroundColor: '#fff', marginHorizontal: 12, marginVertical: 6,
    borderRadius: 8, padding: 12, borderLeftWidth: 4,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 3, elevation: 2,
  },
  time: { fontSize: 11, color: '#6B7280', marginBottom: 2 },
  title: { fontSize: 14, fontWeight: '700', color: '#111827' },
  empName: { fontSize: 12, color: '#6B7280', marginTop: 2 },
});
