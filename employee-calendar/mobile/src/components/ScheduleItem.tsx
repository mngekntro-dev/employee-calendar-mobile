import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Schedule } from '../types';

interface Props {
  schedule: Schedule;
  onPress: () => void;
}

export const ScheduleItem: React.FC<Props> = ({ schedule, onPress }) => {
  const start = new Date(schedule.start_at);
  const timeStr = schedule.is_all_day
    ? '終日'
    : `${start.getHours().toString().padStart(2, '0')}:${start.getMinutes().toString().padStart(2, '0')}`;

  return (
    <TouchableOpacity style={styles.container} onPress={onPress}>
      <View style={styles.timeContainer}>
        <Text style={styles.time}>{timeStr}</Text>
      </View>
      <View style={styles.content}>
        <Text style={styles.title}>{schedule.title}</Text>
        <Text style={styles.user}>{schedule.user_name} · {schedule.department_name || '部署未設定'}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row', padding: 12, backgroundColor: '#FFFFFF',
    borderRadius: 8, marginBottom: 8, shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 2, elevation: 1,
  },
  timeContainer: { width: 48, marginRight: 12 },
  time: { fontSize: 12, color: '#6B7280', fontWeight: '600' },
  content: { flex: 1 },
  title: { fontSize: 15, fontWeight: '600', color: '#111827', marginBottom: 2 },
  user: { fontSize: 12, color: '#6B7280' },
});
