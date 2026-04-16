import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, useWindowDimensions } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CalendarView } from '../components/CalendarView';
import { WeekView } from '../components/WeekView';
import { DayView } from '../components/DayView';
import { EmployeeSelector } from '../components/EmployeeSelector';
import { DepartmentFilter } from '../components/DepartmentFilter';
import { getSchedules } from '../api/schedules';
import { getEmployees } from '../api/employees';
import { getDepartments } from '../api/departments';
import { RootStackParamList, Schedule } from '../types';
import { useAuthStore } from '../store/authStore';
import { STORAGE_KEY, TodoItem } from './TodoScreen';

type Nav = NativeStackNavigationProp<RootStackParamList>;
type ViewMode = 'month' | 'week' | 'day';

const fmt = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const deadlineLabel = (todo: TodoItem): string => {
  if (!todo.deadlineType) return '';
  if (todo.deadlineType === 'monthly') return `毎月${todo.deadlineDay}日`;
  if (todo.deadlineDate) {
    const [, m, d] = todo.deadlineDate.split('-');
    return `${Number(m)}/${Number(d)}`;
  }
  return '';
};

export const CalendarScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const { user } = useAuthStore();
  const { width } = useWindowDimensions();
  const isDesktop = width >= 768;
  const today = fmt(new Date());
  const [selectedDate, setSelectedDate] = useState(today);
  const [viewMode, setViewMode] = useState<ViewMode>('month');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState<number | null>(null);
  const [selectedDeptId, setSelectedDeptId] = useState<number | null>(null);
  const [sidebarTodos, setSidebarTodos] = useState<TodoItem[]>([]);

  // TODO ポップアップ
  const [pendingAlerts, setPendingAlerts] = useState<{ todo: TodoItem; daysLeft: number; deadlineStr: string }[]>([]);
  const [currentAlert, setCurrentAlert] = useState<{ todo: TodoItem; daysLeft: number; deadlineStr: string } | null>(null);

  const checkTodoAlerts = useCallback(async () => {
    if (!user) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      const todos: TodoItem[] = raw ? JSON.parse(raw) : [];
      const now = new Date();
      const results: { todo: TodoItem; daysLeft: number; deadlineStr: string }[] = [];
      const upcomingTodos: TodoItem[] = [];

      for (const todo of todos) {
        if (todo.done) continue;
        if (!todo.deadlineType) {
          upcomingTodos.push(todo);
          continue;
        }

        // 担当チェック
        if (todo.assigneeType === 'individual' && !(todo.assigneeUserIds ?? []).includes(user.id)) continue;
        if (todo.assigneeType === 'department' && !(todo.assigneeDeptIds ?? []).includes(user.department_id!)) continue;

        let deadline: Date | null = null;
        let deadlineStr = '';

        if (todo.deadlineType === 'monthly' && todo.deadlineDay) {
          deadline = new Date(now.getFullYear(), now.getMonth(), todo.deadlineDay);
          deadlineStr = `${now.getMonth() + 1}/${todo.deadlineDay}`;
        } else if (todo.deadlineType === 'once' && todo.deadlineDate) {
          const [y, m, d] = todo.deadlineDate.split('-').map(Number);
          deadline = new Date(y, m - 1, d);
          deadlineStr = `${m}/${d}`;
        }

        if (deadline) {
          upcomingTodos.push(todo);
          const daysLeft = Math.ceil((deadline.getTime() - new Date().setHours(0,0,0,0)) / 86400000);
          const notifyBefore = todo.notifyDaysBefore ?? 5;
          if (daysLeft >= 0 && daysLeft <= notifyBefore) {
            const dismissKey = `dismissed_${todo.id}_${deadline.getFullYear()}_${deadline.getMonth()}_${todo.deadlineType === 'once' ? deadline.getDate() : ''}`;
            const dismissed = await AsyncStorage.getItem(dismissKey);
            if (!dismissed) results.push({ todo, daysLeft, deadlineStr });
          }
        }
      }

      setSidebarTodos(upcomingTodos.slice(0, 5));
      if (results.length > 0) {
        setPendingAlerts(results);
        setCurrentAlert(results[0]);
      }
    } catch (_) {}
  }, [user]);

  useEffect(() => { checkTodoAlerts(); }, [checkTodoAlerts]);

  const dismissAlert = async () => {
    if (!currentAlert) return;
    const { todo } = currentAlert;
    const now = new Date();
    let deadline: Date;
    if (todo.deadlineType === 'monthly' && todo.deadlineDay) {
      deadline = new Date(now.getFullYear(), now.getMonth(), todo.deadlineDay);
    } else {
      const [y, m, d] = (todo.deadlineDate ?? '').split('-').map(Number);
      deadline = new Date(y, m - 1, d);
    }
    const dismissKey = `dismissed_${todo.id}_${deadline.getFullYear()}_${deadline.getMonth()}_${todo.deadlineType === 'once' ? deadline.getDate() : ''}`;
    await AsyncStorage.setItem(dismissKey, '1');
    const next = pendingAlerts.slice(1);
    setPendingAlerts(next);
    setCurrentAlert(next.length > 0 ? next[0] : null);
  };

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

  const toggleRow = (
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
  );

  const calendarBody = (
    <>
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
    </>
  );

  return (
    <View style={styles.container}>
      {isDesktop ? (
        /* ─── PC 2カラムレイアウト ─── */
        <View style={styles.desktopContainer}>
          {/* 左サイドバー */}
          <View style={styles.sidebar}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.sidebarSection}>部署</Text>
              <DepartmentFilter departments={departments} selected={selectedDeptId} onSelect={handleDeptSelect} />

              <Text style={styles.sidebarSection}>社員</Text>
              <EmployeeSelector employees={employees} selectedId={selectedEmployeeId} onSelect={setSelectedEmployeeId} />

              {sidebarTodos.length > 0 && (
                <>
                  <Text style={styles.sidebarSection}>TODO</Text>
                  {sidebarTodos.map(todo => (
                    <View key={todo.id} style={styles.sidebarTodoItem}>
                      <Text style={styles.sidebarTodoText} numberOfLines={2}>{todo.text}</Text>
                      {todo.deadlineType && (
                        <Text style={styles.sidebarTodoDeadline}>
                          🔔 {deadlineLabel(todo)}
                          {todo.notifyDaysBefore ? ` (${todo.notifyDaysBefore}日前)` : ''}
                        </Text>
                      )}
                    </View>
                  ))}
                </>
              )}
            </ScrollView>
          </View>

          {/* メインエリア */}
          <View style={styles.mainArea}>
            {toggleRow}
            {calendarBody}
          </View>
        </View>
      ) : (
        /* ─── モバイルレイアウト（変更なし） ─── */
        <>
          <DepartmentFilter departments={departments} selected={selectedDeptId} onSelect={handleDeptSelect} />
          <EmployeeSelector employees={employees} selectedId={selectedEmployeeId} onSelect={setSelectedEmployeeId} />
          {toggleRow}
          {calendarBody}
        </>
      )}

      {/* TODO リマインダーポップアップ */}
      <Modal visible={!!currentAlert} transparent animationType="fade">
        <View style={styles.alertOverlay}>
          <View style={[styles.alertBox, isDesktop && { maxWidth: 420 }]}>
            <Text style={styles.alertIcon}>⚠</Text>
            <Text style={styles.alertTitle}>TODO リマインダー</Text>
            <Text style={styles.alertBody}>
              「{currentAlert?.todo.text}」の期限まで{'\n'}
              {currentAlert?.daysLeft === 0
                ? `今日（${currentAlert?.deadlineStr}）です`
                : `あと ${currentAlert?.daysLeft}日（${currentAlert?.deadlineStr}）です`}
            </Text>
            <TouchableOpacity style={styles.alertBtn} onPress={dismissAlert}>
              <Text style={styles.alertBtnText}>確認</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },

  /* PC レイアウト */
  desktopContainer: { flex: 1, flexDirection: 'row' },
  sidebar: {
    width: 260,
    backgroundColor: '#fff',
    borderRightWidth: 1,
    borderRightColor: '#E5E7EB',
    paddingTop: 8,
    paddingHorizontal: 12,
  },
  sidebarSection: {
    fontSize: 11,
    fontWeight: '800',
    color: '#9CA3AF',
    letterSpacing: 1,
    marginTop: 16,
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  sidebarTodoItem: {
    backgroundColor: '#F9FAFB',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#3B82F6',
  },
  sidebarTodoText: { fontSize: 13, color: '#374151', fontWeight: '600', marginBottom: 2 },
  sidebarTodoDeadline: { fontSize: 11, color: '#EF4444' },
  mainArea: { flex: 1, overflow: 'hidden' },

  /* 切替タブ */
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

  /* ポップアップ */
  alertOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 32 },
  alertBox: { backgroundColor: '#fff', borderRadius: 16, padding: 24, alignItems: 'center', width: '100%' },
  alertIcon: { fontSize: 36, marginBottom: 8 },
  alertTitle: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  alertBody: { fontSize: 16, color: '#374151', textAlign: 'center', lineHeight: 26, marginBottom: 20 },
  alertBtn: { backgroundColor: '#3B82F6', paddingHorizontal: 40, paddingVertical: 12, borderRadius: 10 },
  alertBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
