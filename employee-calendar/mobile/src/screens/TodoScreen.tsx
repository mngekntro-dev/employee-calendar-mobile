import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAuthStore } from '../store/authStore';

const DAY_LABELS = ['日','月','火','水','木','金','土'];

function InlineCalendar({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const today = new Date();
  const initDate = value ? new Date(value + 'T00:00:00') : today;
  const [year, setYear] = useState(initDate.getFullYear());
  const [month, setMonth] = useState(initDate.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  return (
    <View style={cal.container}>
      <View style={cal.nav}>
        <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={cal.navBtn}>
          <Text style={cal.navArrow}>◀</Text>
        </TouchableOpacity>
        <Text style={cal.navTitle}>{year}年{month + 1}月</Text>
        <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={cal.navBtn}>
          <Text style={cal.navArrow}>▶</Text>
        </TouchableOpacity>
      </View>
      <View style={cal.weekRow}>
        {DAY_LABELS.map((d, i) => (
          <Text key={d} style={[cal.weekLabel, i === 0 && { color: '#dc2626' }, i === 6 && { color: '#1a56db' }]}>{d}</Text>
        ))}
      </View>
      <View style={cal.grid}>
        {cells.map((day, i) => {
          const dateStr = day ? fmt(day) : '';
          const selected = !!dateStr && dateStr === value;
          const col = i % 7;
          return (
            <TouchableOpacity
              key={i}
              style={[cal.cell, selected && cal.cellSelected]}
              onPress={() => day && onChange(fmt(day))}
              disabled={!day}
            >
              {day ? (
                <Text style={[
                  cal.dayNum,
                  selected && cal.dayNumSelected,
                  !selected && col === 0 && { color: '#dc2626' },
                  !selected && col === 6 && { color: '#1a56db' },
                ]}>{day}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {value ? <Text style={cal.selected}>選択中: {value}</Text> : null}
    </View>
  );
}

const cal = StyleSheet.create({
  container: { backgroundColor: '#F3F4F6', borderRadius: 12, padding: 8, marginBottom: 12 },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  navBtn: { padding: 6 },
  navArrow: { fontSize: 14, color: '#1a56db' },
  navTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  weekRow: { flexDirection: 'row', marginBottom: 2 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, fontWeight: '600', color: '#9ca3af' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%` as any, height: 34, justifyContent: 'center', alignItems: 'center', borderRadius: 17 },
  cellSelected: { backgroundColor: '#3B82F6' },
  dayNum: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dayNumSelected: { color: '#fff', fontWeight: '800' },
  selected: { fontSize: 12, color: '#3B82F6', textAlign: 'center', marginTop: 4, fontWeight: '600' },
});

const API = 'https://employee-calendar-backend-production.up.railway.app/api';
export const STORAGE_KEY = '@employee_calendar_todos_v2';

export interface TodoItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  assigneeType: 'all' | 'department' | 'individual';
  assigneeDeptIds?: number[];
  assigneeUserIds?: number[];
  deadlineType?: 'monthly' | 'once';
  deadlineDay?: number;
  deadlineDate?: string;
  notifyDaysBefore?: number;
}

interface Dept { id: number; name: string; }
interface Emp  { id: number; name: string; department_id: number | null; }

// ─── 期限ラベル ───────────────────────────────────
const deadlineLabel = (todo: TodoItem): string => {
  if (!todo.deadlineType) return '';
  if (todo.deadlineType === 'monthly') return `毎月${todo.deadlineDay}日`;
  if (todo.deadlineDate) {
    const [, m, d] = todo.deadlineDate.split('-');
    return `${Number(m)}/${Number(d)}`;
  }
  return '';
};

// ─── 担当ラベル ───────────────────────────────────
const assigneeLabel = (todo: TodoItem, depts: Dept[], emps: Emp[]): string => {
  if (todo.assigneeType === 'all') return '👥 ALL';
  if (todo.assigneeType === 'department') {
    const names = (todo.assigneeDeptIds ?? []).map(id => depts.find(d => d.id === id)?.name ?? '').filter(Boolean);
    return names.join('・');
  }
  const names = (todo.assigneeUserIds ?? []).map(id => {
    const e = emps.find(e => e.id === id);
    return e ? e.name[0] : '';
  }).filter(Boolean);
  return names.join('・');
};

export const TodoScreen: React.FC = () => {
  const { token, user } = useAuthStore();
  const [todos, setTodos] = useState<TodoItem[]>([]);
  const [depts, setDepts] = useState<Dept[]>([]);
  const [emps, setEmps] = useState<Emp[]>([]);
  const [modalVisible, setModalVisible] = useState(false);

  // モーダル state
  const [inputText, setInputText] = useState('');
  const [assigneeType, setAssigneeType] = useState<'all' | 'department' | 'individual'>('all');
  const [selDeptIds, setSelDeptIds] = useState<Set<number>>(new Set());
  const [selUserIds, setSelUserIds] = useState<Set<number>>(new Set());
  const [deadlineType, setDeadlineType] = useState<'none' | 'monthly' | 'once'>('none');
  const [deadlineDay, setDeadlineDay] = useState(1);
  const [deadlineDate, setDeadlineDate] = useState('');
  const [notifyDaysBefore, setNotifyDaysBefore] = useState(5);

  const load = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) setTodos(JSON.parse(raw));
    } catch (_) {}
  }, []);

  const saveTodos = useCallback(async (items: TodoItem[]) => {
    try { await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(items)); } catch (_) {}
  }, []);

  const fetchMeta = useCallback(async () => {
    if (!token) return;
    try {
      const [dr, er] = await Promise.all([
        fetch(`${API}/departments`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${API}/employees`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      setDepts(await dr.json());
      setEmps(await er.json());
    } catch (_) {}
  }, [token]);

  useEffect(() => { load(); fetchMeta(); }, [load, fetchMeta]);

  const openModal = () => {
    setInputText('');
    setAssigneeType('all');
    setSelDeptIds(new Set());
    setSelUserIds(new Set());
    setDeadlineType('none');
    setDeadlineDay(1);
    setDeadlineDate('');
    setNotifyDaysBefore(5);
    setModalVisible(true);
  };

  const addTodo = () => {
    if (!inputText.trim()) { Alert.alert('', '内容を入力してください'); return; }
    if (deadlineType === 'once' && !deadlineDate) { Alert.alert('', '日付を選択してください'); return; }
    const item: TodoItem = {
      id: Date.now().toString(),
      text: inputText.trim(),
      done: false,
      createdAt: new Date().toISOString(),
      assigneeType,
      assigneeDeptIds: assigneeType === 'department' ? [...selDeptIds] : undefined,
      assigneeUserIds: assigneeType === 'individual' ? [...selUserIds] : undefined,
      deadlineType: deadlineType === 'none' ? undefined : deadlineType,
      deadlineDay: deadlineType === 'monthly' ? deadlineDay : undefined,
      deadlineDate: deadlineType === 'once' ? deadlineDate : undefined,
      notifyDaysBefore: deadlineType !== 'none' ? notifyDaysBefore : undefined,
    };
    const next = [item, ...todos];
    setTodos(next);
    saveTodos(next);
    setModalVisible(false);
  };

  const toggleTodo = (id: string) => {
    const next = todos.map(t => t.id === id ? { ...t, done: !t.done } : t);
    setTodos(next); saveTodos(next);
  };

  const deleteTodo = (id: string, text: string) => {
    Alert.alert('削除確認', `「${text}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => {
        const next = todos.filter(t => t.id !== id);
        setTodos(next); saveTodos(next);
      }},
    ]);
  };

  const pending = todos.filter(t => !t.done);
  const done    = todos.filter(t => t.done);

  const renderItem = (item: TodoItem) => {
    const dLabel = deadlineLabel(item);
    const aLabel = assigneeLabel(item, depts, emps);
    return (
      <TouchableOpacity
        key={item.id}
        style={styles.item}
        onPress={() => toggleTodo(item.id)}
        onLongPress={() => deleteTodo(item.id, item.text)}
        activeOpacity={0.7}
      >
        <View style={[styles.circle, item.done && styles.circleDone]}>
          {item.done && <Text style={styles.check}>✓</Text>}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[styles.itemText, item.done && styles.itemTextDone]}>{item.text}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 2 }}>
            {aLabel ? <Text style={styles.meta}>{aLabel}</Text> : null}
            {dLabel ? <Text style={[styles.meta, { color: '#EF4444' }]}>{dLabel}</Text> : null}
            {item.notifyDaysBefore && item.deadlineType ? <Text style={[styles.meta, { color: '#F59E0B' }]}>🔔 {item.notifyDaysBefore}日前</Text> : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={styles.container}>
      {todos.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>☑</Text>
          <Text style={styles.emptyText}>TODOはありません</Text>
          <Text style={styles.emptySubText}>右下の ＋ から追加してください</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {pending.length > 0 && (
            <>
              <Text style={styles.sectionLabel}>未完了 {pending.length}件</Text>
              {pending.map(renderItem)}
            </>
          )}
          {done.length > 0 && (
            <>
              <Text style={[styles.sectionLabel, { marginTop: 16 }]}>完了 {done.length}件</Text>
              {done.map(renderItem)}
            </>
          )}
        </ScrollView>
      )}

      <TouchableOpacity style={styles.fab} onPress={openModal}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>

      {/* ─── 追加モーダル ─── */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <ScrollView contentContainerStyle={styles.modalBox} keyboardShouldPersistTaps="handled">
            <Text style={styles.modalTitle}>TODOを追加</Text>

            {/* 内容 */}
            <TextInput
              style={styles.input}
              placeholder="内容を入力..."
              value={inputText}
              onChangeText={setInputText}
              multiline
              autoFocus
            />

            {/* 担当 */}
            <Text style={styles.label}>担当</Text>
            <View style={styles.segRow}>
              {(['all', 'department', 'individual'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.seg, assigneeType === t && styles.segActive]}
                  onPress={() => setAssigneeType(t)}
                >
                  <Text style={[styles.segText, assigneeType === t && styles.segTextActive]}>
                    {t === 'all' ? 'ALL' : t === 'department' ? '部署' : '個人'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {assigneeType === 'department' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {depts.map(d => {
                  const sel = selDeptIds.has(d.id);
                  return (
                    <TouchableOpacity
                      key={d.id}
                      style={[styles.chip, sel && styles.chipActive]}
                      onPress={() => {
                        const s = new Set(selDeptIds);
                        sel ? s.delete(d.id) : s.add(d.id);
                        setSelDeptIds(s);
                      }}
                    >
                      <Text style={[styles.chipText, sel && styles.chipTextActive]}>{d.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {assigneeType === 'individual' && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                {emps.map(e => {
                  const sel = selUserIds.has(e.id);
                  return (
                    <TouchableOpacity
                      key={e.id}
                      style={[styles.chip, sel && styles.chipActive]}
                      onPress={() => {
                        const s = new Set(selUserIds);
                        sel ? s.delete(e.id) : s.add(e.id);
                        setSelUserIds(s);
                      }}
                    >
                      <Text style={[styles.chipText, sel && styles.chipTextActive]}>{e.name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* 期限 */}
            <Text style={styles.label}>期限</Text>
            <View style={styles.segRow}>
              {(['none', 'monthly', 'once'] as const).map(t => (
                <TouchableOpacity
                  key={t}
                  style={[styles.seg, deadlineType === t && styles.segActive]}
                  onPress={() => setDeadlineType(t)}
                >
                  <Text style={[styles.segText, deadlineType === t && styles.segTextActive]}>
                    {t === 'none' ? 'なし' : t === 'monthly' ? '毎月' : '単発'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {deadlineType === 'monthly' && (
              <View style={styles.dayRow}>
                <Text style={styles.dayLabel}>毎月</Text>
                <TouchableOpacity onPress={() => setDeadlineDay(d => Math.max(1, d - 1))} style={styles.dayBtn}>
                  <Text style={styles.dayBtnText}>▼</Text>
                </TouchableOpacity>
                <Text style={styles.dayNum}>{deadlineDay}</Text>
                <TouchableOpacity onPress={() => setDeadlineDay(d => Math.min(31, d + 1))} style={styles.dayBtn}>
                  <Text style={styles.dayBtnText}>▲</Text>
                </TouchableOpacity>
                <Text style={styles.dayLabel}>日</Text>
              </View>
            )}

            {deadlineType === 'once' && (
              <InlineCalendar value={deadlineDate} onChange={setDeadlineDate} />
            )}

            {/* 通知タイミング */}
            {deadlineType !== 'none' && (
              <>
                <Text style={styles.label}>ポップアップ通知</Text>
                <View style={styles.dayRow}>
                  <Text style={styles.dayLabel}>期限の</Text>
                  <TouchableOpacity onPress={() => setNotifyDaysBefore(d => Math.max(1, d - 1))} style={styles.dayBtn}>
                    <Text style={styles.dayBtnText}>▼</Text>
                  </TouchableOpacity>
                  <Text style={styles.dayNum}>{notifyDaysBefore}</Text>
                  <TouchableOpacity onPress={() => setNotifyDaysBefore(d => Math.min(30, d + 1))} style={styles.dayBtn}>
                    <Text style={styles.dayBtnText}>▲</Text>
                  </TouchableOpacity>
                  <Text style={styles.dayLabel}>日前</Text>
                </View>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
                  {[1,2,3,5,7,10,14,20,30].map(n => (
                    <TouchableOpacity
                      key={n}
                      style={[styles.chip, notifyDaysBefore === n && styles.chipActive, { marginRight: 8 }]}
                      onPress={() => setNotifyDaysBefore(n)}
                    >
                      <Text style={[styles.chipText, notifyDaysBefore === n && styles.chipTextActive]}>{n}日前</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}

            <View style={styles.btnRow}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.addBtn} onPress={addTodo}>
                <Text style={styles.addBtnText}>追加</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 8 },
  item: { flexDirection: 'row', alignItems: 'flex-start', backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 8, elevation: 1, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 3 },
  circle: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', marginRight: 12, marginTop: 1 },
  circleDone: { backgroundColor: '#3B82F6', borderColor: '#3B82F6' },
  check: { color: '#fff', fontSize: 13, fontWeight: '800' },
  itemText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  itemTextDone: { color: '#9CA3AF', textDecorationLine: 'line-through' },
  meta: { fontSize: 12, color: '#6B7280' },
  empty: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 4 },
  emptySubText: { fontSize: 13, color: '#9CA3AF' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 52, height: 52, borderRadius: 26, backgroundColor: '#3B82F6', justifyContent: 'center', alignItems: 'center', elevation: 4, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 6 },
  fabText: { color: '#fff', fontSize: 28, lineHeight: 32 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  input: { borderWidth: 1.5, borderColor: '#E5E7EB', borderRadius: 10, padding: 12, fontSize: 15, minHeight: 72, textAlignVertical: 'top', marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '700', color: '#6B7280', marginBottom: 6 },
  segRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  seg: { flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  segActive: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  segText: { fontSize: 14, fontWeight: '600', color: '#6B7280' },
  segTextActive: { color: '#3B82F6' },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#E5E7EB', marginRight: 8 },
  chipActive: { borderColor: '#3B82F6', backgroundColor: '#EFF6FF' },
  chipText: { fontSize: 13, color: '#6B7280', fontWeight: '600' },
  chipTextActive: { color: '#3B82F6' },
  dayRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  dayLabel: { fontSize: 15, color: '#374151', fontWeight: '600' },
  dayBtn: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 8, backgroundColor: '#F3F4F6' },
  dayBtnText: { fontSize: 16, color: '#3B82F6', fontWeight: '800' },
  dayNum: { fontSize: 28, fontWeight: '800', color: '#111827', minWidth: 40, textAlign: 'center' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 8 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 10, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, color: '#6B7280', fontWeight: '600' },
  addBtn: { flex: 1, padding: 14, borderRadius: 10, backgroundColor: '#3B82F6', alignItems: 'center' },
  addBtnText: { fontSize: 15, color: '#fff', fontWeight: '700' },
});
