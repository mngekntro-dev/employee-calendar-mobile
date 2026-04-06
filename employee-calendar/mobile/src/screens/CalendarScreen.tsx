import React, { useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { CalendarView } from '../components/CalendarView';
import { WeekView } from '../components/WeekView';
import { DayView } from '../components/DayView';
import { EmployeeSelector } from '../components/EmployeeSelector';
import { DepartmentFilter } from '../components/DepartmentFilter';
import { getSchedules } from '../api/schedules';
import { getEmployees } from '../api/employees';
import { getDepartments } from '../api/departments';
import { RootStackParamList, Schedule } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'month' | 'week' | 'day';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export const CalendarScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const today = fmt(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);

  const { data: allSchedules = [] } = useQuery({
    queryKey: ['schedules'],
    queryFn: () => getSchedules({}),
  });
  const { data: allEmployees = [] } = useQuery({
    queryKey: ['employees'],
    queryFn: () => getEmployees(),
  });
  const { data: departments = [] } = useQuery({
    queryKey: ['departments'],
    queryFn: getDepartments,
  });

  const employees = useMemo(
    () => selectedDeptId ? allEmployees.filter(e => e.department_id === selectedDeptId) : allEmployees,
    [allEmployees, selectedDeptId]
  );

  const handleDeptSelect = (id: number | null) => {
    setSelectedDeptId(id);
    setSelectedEmployeeId(null);
  };

  const schedules = useMemo(() => {
    let result = allSchedules;
    if (selectedEmployeeId) {
      result = result.filter(s => s.user_id === selectedEmployeeId);
    } else if (selectedDeptId) {
      const ids = new Set(allEmployees.filter(e => e.department_id === selectedDeptId).map(e => e.id));
      result = result.filter(s => ids.has(s.user_id));
    }
    return result;
  }, [allSchedules, allEmployees, selectedEmployeeId, selectedDeptId]);

  const shiftWeek = (dir: 1 | -1) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + dir * 7);
    setSelectedDate(fmt(d));
  };

  const handleDayPress = (date: string) => {
    setSelectedDate(date);
    setViewMode('day');
  };

  return (
    <View style={styles.container}>
      {/* 部署フィルター */}
      <DepartmentFilter departments={departments} selected={selectedDeptId} onSelect={handleDeptSelect} />

      {/* 社員セレクター */}
      <EmployeeSelector employees={employees} selectedId={selectedEmployeeId} onSelect={setSelectedEmployeeId} />

      {/* 月/週/日 切替タブ */}
      <View style={styles.toggleRow}>
        {(['month', 'week', 'day'] as ViewMode[]).map(mode => {
          const label = mode === 'month' ? '月' : mode === 'week' ? '週' : '日';
          return (
            <TouchableOpacity
              key={mode}
              style={[styles.toggleBtn, viewMode === mode && styles.toggleBtnActive]}
              onPress={() => setViewMode(mode)}
            >
              <Text style={[styles.toggleText, viewMode === mode && styles.toggleTextActive]}>{label}</Text>
            </TouchableOpacity>
          );
        })}
      </View>

      {/* カレンダー本体 */}
      {viewMode === 'month' && (
        <CalendarView
          schedules={schedules}
          employees={allEmployees}
          selectedDate={selectedDate}
          onDayPress={handleDayPress}
        />
      )}
      {viewMode === 'week' && (
        <WeekView
          schedules={schedules}
          employees={allEmployees}
          selectedDate={selectedDate}
          onDayPress={handleDayPress}
          onPrevWeek={() => shiftWeek(-1)}
          onNextWeek={() => shiftWeek(1)}
        />
      )}
      {viewMode === 'day' && (
        <DayView
          date={selectedDate}
          schedules={schedules}
          employees={allEmployees}
          onSchedulePress={s => navigation.navigate('ScheduleDetail', { schedule: s })}
          onAddPress={() => navigation.navigate('ScheduleForm', { initialDate: selectedDate })}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  toggleRow: {
    flexDirection: 'row', backgroundColor: '#F3F4F6',
    marginHorizontal: 12, marginVertical: 6, borderRadius: 10, padding: 3,
  },
  toggleBtn: { flex: 1, paddingVertical: 6, alignItems: 'center', borderRadius: 8 },
  toggleBtnActive: {
    backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1, shadowRadius: 2, elevation: 2,
  },
  toggleText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  toggleTextActive: { color: '#3B82F6' },
});
