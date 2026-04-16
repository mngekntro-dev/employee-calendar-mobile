import React from 'react';
import { View, Text, TouchableOpacity, Dimensions } from 'react-native';
import { Schedule } from '../types';

interface Employee { id: number; name: string; color: string | null; }
interface Props {
  schedules: Schedule[];
  employees: Employee[];
  selectedDate: string;
  onDayPress: (date: string) => void;
}

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const todayStr = fmt(new Date());
const DAYS = ['日','月','火','水','木','金','土'];
const { width } = Dimensions.get('window');
const CELL_W = Math.floor(width / 7);

export const CalendarView = ({ schedules, employees, selectedDate, onDayPress }: Props) => {
  const empMap: Record<number, { name: string; color: string }> = {};
  employees.forEach(e => { empMap[e.id] = { name: e.name, color: e.color || '#3B82F6' }; });

  const schedulesByDate: Record<string, Schedule[]> = {};
  schedules.forEach(s => {
    const key = s.start_at.substring(0, 10);
    if (!schedulesByDate[key]) schedulesByDate[key] = [];
    schedulesByDate[key].push(s);
  });
  Object.keys(schedulesByDate).forEach(key => {
    schedulesByDate[key].sort((a, b) => a.user_id - b.user_id);
  });

  const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const year = base.getFullYear();
  const month = base.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  return (
    <View style={{ flex: 1 }}>
      {/* 曜日ヘッダー */}
      <View style={{ flexDirection: 'row', backgroundColor: '#f8f9fa', borderBottomWidth: 1, borderColor: '#e0e0e0' }}>
        {DAYS.map((d, i) => (
          <View key={i} style={{ width: CELL_W, alignItems: 'center', paddingVertical: 5 }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#666' }}>{d}</Text>
          </View>
        ))}
      </View>

      {/* カレンダーグリッド（flex: 1 で画面いっぱい） */}
      <View style={{ flex: 1 }}>
        {weeks.map((week, wi) => (
          <View key={wi} style={{ flex: 1, flexDirection: 'row', borderBottomWidth: 1, borderColor: '#e8e8e8' }}>
            {week.map((day, di) => {
              if (!day) return (
                <View key={di} style={{ flex: 1, backgroundColor: '#f8f8f8', borderLeftWidth: di > 0 ? 1 : 0, borderColor: '#e8e8e8' }} />
              );
              const dateStr = fmt(day);
              const isToday = dateStr === todayStr;
              const isSelected = dateStr === selectedDate;
              const daySchedules = schedulesByDate[dateStr] || [];
              const shown = daySchedules.slice(0, 2);
              const extra = daySchedules.length - 2;
              return (
                <TouchableOpacity
                  key={di}
                  onPress={() => onDayPress(dateStr)}
                  style={{
                    flex: 1,
                    borderLeftWidth: di > 0 ? 1 : 0,
                    borderColor: '#e8e8e8',
                    backgroundColor: isSelected ? '#EFF6FF' : isToday ? '#FFFDE7' : (di === 0 || di === 6) ? '#fafafa' : '#fff',
                    overflow: 'hidden',
                  }}
                >
                  <View style={{ alignItems: 'center', marginTop: 2 }}>
                    <View style={{
                      width: 20, height: 20, borderRadius: 10,
                      backgroundColor: isToday ? '#3B82F6' : 'transparent',
                      alignItems: 'center', justifyContent: 'center',
                    }}>
                      <Text style={{
                        fontSize: 11, fontWeight: isToday ? '700' : '400',
                        color: isToday ? '#fff' : di === 0 ? '#EF4444' : di === 6 ? '#3B82F6' : '#333',
                      }}>
                        {day.getDate()}
                      </Text>
                    </View>
                  </View>
                  {shown.map((s, si) => {
                    const emp = empMap[s.user_id];
                    const color = emp?.color || '#3B82F6';
                    const initials = emp?.name?.[0] || '';
                    return (
                      <View
                        key={si}
                        style={{ backgroundColor: color, marginHorizontal: 1, marginTop: 1, borderRadius: 2, paddingHorizontal: 2 }}
                      >
                        <Text numberOfLines={1} style={{ fontSize: 8, color: '#fff' }}>{initials}{s.title}</Text>
                      </View>
                    );
                  })}
                  {extra > 0 && <Text style={{ fontSize: 8, color: '#888', textAlign: 'center' }}>+{extra}</Text>}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
};
