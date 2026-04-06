import React, { useRef } from 'react';
import { View, Text, TouchableOpacity, ScrollView, Dimensions } from 'react-native';
import { Schedule } from '../types';

interface Employee { id: number; name: string; color: string | null; }
interface Props {
  selectedDate: string;
  schedules: Schedule[];
  employees: Employee[];
  onDayPress: (date: string) => void;
  onPrevWeek: () => void;
  onNextWeek: () => void;
  onAddPress?: () => void;
}

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayStr = fmt(new Date());
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const HOUR_HEIGHT = 60;
const START_HOUR = 0;
const END_HOUR = 24;
const TIME_COL_W = 32;
const { width } = Dimensions.get('window');
const DAY_COL_W = Math.floor((width - TIME_COL_W) / 7);

export const WeekView: React.FC<Props> = ({
  selectedDate, schedules, employees, onDayPress, onPrevWeek, onNextWeek,
}) => {
  const empMap: Record<number, { name: string; color: string }> = {};
  employees.forEach(e => { empMap[e.id] = { name: e.name, color: e.color || '#3B82F6' }; });

  const base = new Date(selectedDate + 'T00:00:00');
  const dow = base.getDay();
  const weekStart = new Date(base);
  weekStart.setDate(base.getDate() - dow);

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const hours = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

  const getEventStyle = (s: Schedule) => {
    const local = s.start_at.replace('Z', '').replace(/\+\d{2}:\d{2}$/, '').substring(0, 16);
    const localEnd = s.end_at.replace('Z', '').replace(/\+\d{2}:\d{2}$/, '').substring(0, 16);
    const [, startTime] = local.split('T');
    const [, endTime] = localEnd.split('T');
    const [sh, sm] = (startTime || '00:00').split(':').map(Number);
    const [eh, em] = (endTime || '00:00').split(':').map(Number);
    const startMin = (sh - START_HOUR) * 60 + sm;
    const endMin = (eh - START_HOUR) * 60 + em;
    const top = (startMin / 60) * HOUR_HEIGHT;
    const height = Math.max(((endMin - startMin) / 60) * HOUR_HEIGHT, 20);
    return { top, height };
  };

  const schedulesByDate: Record<string, Schedule[]> = {};
  schedules.forEach(s => {
    const key = s.start_at.substring(0, 10);
    if (!schedulesByDate[key]) schedulesByDate[key] = [];
    schedulesByDate[key].push(s);
  });

  const startStr = `${weekStart.getMonth() + 1}/${weekStart.getDate()}`;
  const endDay = days[6];
  const endStr = `${endDay.getMonth() + 1}/${endDay.getDate()}`;

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      {/* 週ナビゲーション */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 12, paddingVertical: 6, borderBottomWidth: 1, borderColor: '#E5E7EB' }}>
        <TouchableOpacity onPress={onPrevWeek} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18, color: '#3B82F6', fontWeight: '600' }}>{'<'}</Text>
        </TouchableOpacity>
        <Text style={{ fontSize: 14, fontWeight: '700', color: '#111827' }}>{startStr} 〜 {endStr}</Text>
        <TouchableOpacity onPress={onNextWeek} style={{ padding: 6 }}>
          <Text style={{ fontSize: 18, color: '#3B82F6', fontWeight: '600' }}>{'>'}</Text>
        </TouchableOpacity>
      </View>

      {/* 曜日・日付ヘッダー */}
      <View style={{ flexDirection: 'row', borderBottomWidth: 1, borderColor: '#E5E7EB', backgroundColor: '#F9FAFB' }}>
        <View style={{ width: TIME_COL_W }} />
        {days.map((d, i) => {
          const dateStr = fmt(d);
          const isToday = dateStr === todayStr;
          const isSelected = dateStr === selectedDate;
          return (
            <TouchableOpacity key={i} style={{ width: DAY_COL_W, alignItems: 'center', paddingVertical: 4 }} onPress={() => onDayPress(dateStr)}>
              <Text style={{ fontSize: 10, color: i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#6B7280', fontWeight: '600' }}>
                {DAY_LABELS[i]}
              </Text>
              <View style={{
                width: 24, height: 24, borderRadius: 12, marginTop: 2,
                backgroundColor: isToday ? '#3B82F6' : 'transparent',
                borderWidth: isSelected && !isToday ? 1.5 : 0,
                borderColor: '#3B82F6',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Text style={{
                  fontSize: 12, fontWeight: '700',
                  color: isToday ? '#fff' : i === 0 ? '#EF4444' : i === 6 ? '#3B82F6' : '#374151',
                }}>
                  {d.getDate()}
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* タイムグリッド */}
      <ScrollView style={{ flex: 1 }}>
        <View style={{ flexDirection: 'row' }}>
          {/* 時間軸 */}
          <View style={{ width: TIME_COL_W }}>
            {hours.map(h => (
              <View key={h} style={{ height: HOUR_HEIGHT, borderBottomWidth: 1, borderColor: '#F3F4F6', justifyContent: 'flex-start', alignItems: 'flex-end', paddingRight: 4 }}>
                <Text style={{ fontSize: 9, color: '#9CA3AF', marginTop: -6 }}>{h === 0 ? '' : `${h}`}</Text>
              </View>
            ))}
          </View>

          {/* 各日の列 */}
          {days.map((d, di) => {
            const dateStr = fmt(d);
            const isToday = dateStr === todayStr;
            const isSelected = dateStr === selectedDate;
            const daySchedules = schedulesByDate[dateStr] || [];

            return (
              <TouchableOpacity
                key={di}
                activeOpacity={0.9}
                onPress={() => onDayPress(dateStr)}
                style={{
                  width: DAY_COL_W,
                  height: HOUR_HEIGHT * (END_HOUR - START_HOUR),
                  borderLeftWidth: 1,
                  borderColor: '#E5E7EB',
                  backgroundColor: isToday ? '#FFFDE7' : isSelected ? '#EFF6FF' : (di === 0 || di === 6) ? '#FEF2F2' : '#fff',
                  position: 'relative',
                }}
              >
                {/* 時間の横線 */}
                {hours.map(h => (
                  <View key={h} style={{ position: 'absolute', top: (h - START_HOUR) * HOUR_HEIGHT, left: 0, right: 0, height: 1, backgroundColor: '#F3F4F6' }} />
                ))}

                {/* 予定ブロック */}
                {daySchedules.map((s, si) => {
                  const emp = empMap[s.user_id];
                  const color = emp?.color || '#3B82F6';
                  const { top, height } = getEventStyle(s);
                  return (
                    <View key={si} style={{
                      position: 'absolute',
                      top,
                      height,
                      left: 1,
                      right: 1,
                      backgroundColor: color,
                      borderRadius: 3,
                      padding: 2,
                      overflow: 'hidden',
                    }}>
                      <Text style={{ fontSize: 8, color: '#fff', fontWeight: '600' }} numberOfLines={3}>
                        {emp?.name?.[0] ? `${emp.name[0]} ` : ''}{s.title}
                      </Text>
                    </View>
                  );
                })}
              </TouchableOpacity>
            );
          })}
        </View>
      </ScrollView>
    </View>
  );
};
