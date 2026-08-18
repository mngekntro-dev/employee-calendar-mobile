import React, { useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, useWindowDimensions, Platform } from 'react-native';
import { Schedule } from '../types';
import { getDepartmentColor } from '../constants/departmentColors';
import { getEmployeeInitial } from '../constants/employeeInitials';

interface Employee { id: number; name: string; color: string | null; }
interface Props {
  schedules: Schedule[];
  employees: Employee[];
  selectedDate: string;
  onDayPress: (date: string) => void;
}

const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const DAYS = ['日','月','火','水','木','金','土'];

export const CalendarView = ({ schedules, employees, selectedDate, onDayPress }: Props) => {
  const { width } = useWindowDimensions();
  const CELL_W = Math.floor(width / 7);
  const todayStr = useMemo(() => fmt(new Date()), []);

  // 月ナビゲーション用の内部state
  const base = selectedDate ? new Date(selectedDate + 'T00:00:00') : new Date();
  const [displayYear, setDisplayYear] = useState(base.getFullYear());
  const [displayMonth, setDisplayMonth] = useState(base.getMonth());

  const goToPrevMonth = () => {
    if (displayMonth === 0) {
      setDisplayYear(y => y - 1);
      setDisplayMonth(11);
    } else {
      setDisplayMonth(m => m - 1);
    }
  };

  const goToNextMonth = () => {
    if (displayMonth === 11) {
      setDisplayYear(y => y + 1);
      setDisplayMonth(0);
    } else {
      setDisplayMonth(m => m + 1);
    }
  };

  const goToToday = () => {
    const today = new Date();
    setDisplayYear(today.getFullYear());
    setDisplayMonth(today.getMonth());
    onDayPress(fmt(today));
  };

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

  const year = displayYear;
  const month = displayMonth;
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const startDow = firstDay.getDay();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  for (let d = 1; d <= lastDay.getDate(); d++) cells.push(new Date(year, month, d));
  while (cells.length % 7 !== 0) cells.push(null);

  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));

  const isCurrentMonth = (() => {
    const t = new Date();
    return displayYear === t.getFullYear() && displayMonth === t.getMonth();
  })();

  return (
    <View style={{ flex: 1 }}>
      {/* 月ナビゲーションヘッダー */}
      <View style={{
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderBottomWidth: 1,
        borderColor: '#e0e0e0',
      }}>
        {/* 前月ボタン */}
        <TouchableOpacity
          onPress={goToPrevMonth}
          style={{ padding: 8, minWidth: 40, alignItems: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 18, color: '#3B82F6', fontWeight: '600' }}>◀</Text>
        </TouchableOpacity>

        {/* 年月表示（中央） */}
        <View style={{ flex: 1, alignItems: 'center' }}>
          <Text style={{ fontSize: 17, fontWeight: '700', color: '#111827' }}>
            {year}年{month + 1}月
          </Text>
        </View>

        {/* 次月ボタン */}
        <TouchableOpacity
          onPress={goToNextMonth}
          style={{ padding: 8, minWidth: 40, alignItems: 'center' }}
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        >
          <Text style={{ fontSize: 18, color: '#3B82F6', fontWeight: '600' }}>▶</Text>
        </TouchableOpacity>

        {/* 今日ボタン */}
        <TouchableOpacity
          onPress={goToToday}
          style={{
            borderWidth: 1,
            borderColor: isCurrentMonth ? '#93C5FD' : '#3B82F6',
            borderRadius: 6,
            paddingVertical: 4,
            paddingHorizontal: 10,
            marginLeft: 4,
            backgroundColor: isCurrentMonth ? '#EFF6FF' : '#fff',
          }}
        >
          <Text style={{ fontSize: 12, color: '#3B82F6', fontWeight: '600' }}>今日</Text>
        </TouchableOpacity>
      </View>

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
              const maxShow = Platform.OS === 'web' ? 8 : 2;
              const shown = daySchedules.slice(0, maxShow);
              const extra = daySchedules.length - maxShow;
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
                    const color = getDepartmentColor(s.department_name);
                    const employee = empMap[s.user_id];
                    return (
                      <View
                        key={si}
                        style={{
                          backgroundColor: color,
                          marginHorizontal: 1,
                          marginTop: 1,
                          borderRadius: 2,
                          paddingHorizontal: 2,
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 2,
                        }}
                      >
                        <Text style={{ fontSize: 8, color: '#fff', fontWeight: '700' }}>
                          {getEmployeeInitial(employee?.name)}
                        </Text>
                        <Text numberOfLines={1} style={{ fontSize: 8, color: '#fff', flex: 1 }}>{s.title}</Text>
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
