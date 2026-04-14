import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, Switch,
} from 'react-native';
import WebView from 'react-native-webview';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Task, TaskStatus, ProjectMember } from '../types';
import { CalendarPicker, todayStr } from './CalendarPicker';

const todayFmt = todayStr;
const AVATAR_COLORS = ['#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const STATUS_LIST: TaskStatus[] = ['未着手', '進行中', '完了'];
const STATUS_COLOR: Record<TaskStatus, string> = {
  '未着手': '#6b7280',
  '進行中': '#1a56db',
  '完了': '#057a55',
};
const STATUS_BG: Record<TaskStatus, string> = {
  '未着手': '#f3f4f6',
  '進行中': '#eff6ff',
  '完了': '#ecfdf5',
};

interface Props {
  projectId: string;
  projectName: string;
  members: ProjectMember[];
}

export default function TaskTab({ projectId, projectName, members }: Props) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select(`
        *,
        requester:profiles!tasks_requester_id_fkey(full_name),
        assignees:task_assignees(user_id, profile:profiles(full_name))
      `)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleDelete = (task: Task) => {
    Alert.alert('タスクを削除', `「${task.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('tasks').delete().eq('id', task.id);
          fetchTasks();
        },
      },
    ]);
  };

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', task.id);
    fetchTasks();
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 40 }} color="#1a56db" />;

  return (
    <View style={styles.container}>
      <ScrollView>
        {STATUS_LIST.map(status => {
          const filtered = tasks.filter(t => t.status === status);
          return (
            <View key={status} style={styles.section}>
              <View style={styles.sectionHeader}>
                <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[status] }]} />
                <Text style={styles.sectionTitle}>{status}</Text>
                <Text style={styles.sectionCount}>{filtered.length}</Text>
              </View>
              {filtered.length === 0 ? (
                <Text style={styles.emptyText}>タスクなし</Text>
              ) : (
                filtered.map(task => <TaskCard key={task.id} task={task} members={members}
                  onEdit={() => { setEditingTask(task); setModalVisible(true); }}
                  onDelete={() => handleDelete(task)}
                  onStatusChange={(s) => handleStatusChange(task, s)} />)
              )}
            </View>
          );
        })}
        <View style={{ height: 80 }} />
      </ScrollView>

      <TouchableOpacity style={styles.addBtn} onPress={() => { setEditingTask(null); setModalVisible(true); }}>
        <Text style={styles.addBtnText}>＋ タスクを追加</Text>
      </TouchableOpacity>

      <TaskFormModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingTask(null); }}
        onSaved={() => { setModalVisible(false); setEditingTask(null); fetchTasks(); }}
        projectId={projectId}
        projectName={projectName}
        members={members}
        editingTask={editingTask}
        currentUserId={profile?.id ?? ''}
      />
    </View>
  );
}

// ───────────────────────────────────────────
// タスクカード
// ───────────────────────────────────────────
function TaskCard({ task, members, onEdit, onDelete, onStatusChange }: {
  task: Task; members: ProjectMember[];
  onEdit: () => void; onDelete: () => void;
  onStatusChange: (s: TaskStatus) => void;
}) {
  const [showStatus, setShowStatus] = useState(false);

  return (
    <View style={styles.card}>
      <TouchableOpacity onPress={onEdit} style={styles.cardMain}>
        {/* 担当者アバター */}
        <View style={styles.avatarRow}>
          {(task.assignees ?? []).slice(0, 3).map((a, i) => {
            const mi = members.findIndex(m => m.user_id === a.user_id);
            const color = AVATAR_COLORS[mi >= 0 ? mi % AVATAR_COLORS.length : i % AVATAR_COLORS.length];
            return (
              <View key={a.user_id} style={[styles.avatar, { backgroundColor: color, marginLeft: i > 0 ? -6 : 0 }]}>
                <Text style={styles.avatarText}>{(a.profile?.full_name ?? '?')[0]}</Text>
              </View>
            );
          })}
          {(task.assignees?.length ?? 0) === 0 && (
            <View style={[styles.avatar, { backgroundColor: '#e5e7eb' }]}>
              <Text style={[styles.avatarText, { color: '#9ca3af' }]}>未</Text>
            </View>
          )}
        </View>
        <View style={styles.cardInfo}>
          <Text style={styles.cardTitle} numberOfLines={2}>{task.title}</Text>
          {task.due_date && (
            <Text style={styles.cardDue}>期日：{task.due_date}{task.due_time ? ' ' + task.due_time.slice(0, 5) : ''}</Text>
          )}
          {task.requester && (
            <Text style={styles.cardRequester}>依頼者：{task.requester.full_name}</Text>
          )}
        </View>
      </TouchableOpacity>

      <View style={styles.cardActions}>
        <TouchableOpacity onPress={() => setShowStatus(v => !v)}
          style={[styles.statusBadge, { backgroundColor: STATUS_BG[task.status] }]}>
          <Text style={[styles.statusText, { color: STATUS_COLOR[task.status] }]}>{task.status}</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
          <Text style={styles.deleteBtnText}>削除</Text>
        </TouchableOpacity>
      </View>

      {showStatus && (
        <View style={styles.statusPicker}>
          {STATUS_LIST.map(s => (
            <TouchableOpacity key={s} onPress={() => { onStatusChange(s); setShowStatus(false); }}
              style={[styles.statusOption, task.status === s && { backgroundColor: STATUS_BG[s] }]}>
              <Text style={[styles.statusOptionText, { color: STATUS_COLOR[s] }]}>{s}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
    </View>
  );
}

// ───────────────────────────────────────────
// タスク追加/編集モーダル
// ───────────────────────────────────────────
interface FormProps {
  visible: boolean; onClose: () => void; onSaved: () => void;
  projectId: string; projectName: string;
  members: ProjectMember[]; editingTask: Task | null; currentUserId: string;
}

function TaskFormModal({ visible, onClose, onSaved, projectId, projectName, members, editingTask, currentUserId }: FormProps) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(todayFmt());
  const [dueTime, setDueTime] = useState('');
  const [withTime, setWithTime] = useState(false);
  const [requesterId, setRequesterId] = useState(currentUserId);
  const [assigneeIds, setAssigneeIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [showRequesterPicker, setShowRequesterPicker] = useState(false);
  const [showCalendar, setShowCalendar] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);

  useEffect(() => {
    if (visible) {
      setSaving(false);
      if (editingTask) {
        setTitle(editingTask.title);
        setDescription(editingTask.description ?? '');
        setDueDate(editingTask.due_date ?? '');
        setDueTime(editingTask.due_time?.slice(0, 5) ?? '');
        setWithTime(!!editingTask.due_time);
        setRequesterId(editingTask.requester_id ?? currentUserId);
        setAssigneeIds(new Set((editingTask.assignees ?? []).map(a => a.user_id)));
      } else {
        setTitle(''); setDescription(''); setDueDate(todayFmt()); setDueTime('');
        setWithTime(false); setRequesterId(currentUserId);
        setAssigneeIds(new Set()); setShowCalendar(false);
      }
    }
  }, [visible, editingTask, currentUserId]);

  const toggleAssignee = (userId: string) => {
    setAssigneeIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('エラー', 'タスク名を入力してください'); return; }
    setSaving(true);
    try {
      const payload = {
        project_id: projectId,
        title: title.trim(),
        description: description || null,
        due_date: dueDate || null,
        due_time: withTime && dueTime ? dueTime + ':00' : null,
        requester_id: requesterId || null,
        updated_at: new Date().toISOString(),
      };

      let taskId = editingTask?.id;
      if (editingTask) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', taskId!);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('tasks').insert({ ...payload, status: '未着手', created_by: currentUserId }).select('id').single();
        if (error) throw error;
        taskId = data.id;
      }

      // 担当者を更新
      await supabase.from('task_assignees').delete().eq('task_id', taskId!);
      if (assigneeIds.size > 0) {
        await supabase.from('task_assignees').insert(
          [...assigneeIds].map(uid => ({ task_id: taskId!, user_id: uid }))
        );
      }

      onSaved();
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const requesterProfile = members.find(m => m.user_id === requesterId)?.profile;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={fStyles.overlay}>
        <ScrollView contentContainerStyle={fStyles.modal} keyboardShouldPersistTaps="handled">
          <View style={fStyles.header}>
            <TouchableOpacity onPress={onClose}><Text style={fStyles.closeBtn}>✕</Text></TouchableOpacity>
            <Text style={fStyles.headerTitle}>{editingTask ? 'タスクを編集' : 'タスクを追加'}</Text>
            <TouchableOpacity onPress={handleSave} style={fStyles.saveBtn} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fStyles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          </View>

          {/* タスク名 */}
          <Text style={fStyles.label}>タスク名 <Text style={fStyles.required}>必須</Text></Text>
          <TextInput style={fStyles.input} placeholder="タスク名を入力" value={title} onChangeText={setTitle} />

          {/* 案件 */}
          <Text style={fStyles.label}>案件</Text>
          <Text style={fStyles.staticText}>{projectName}</Text>

          {/* タスク担当 */}
          <Text style={fStyles.label}>タスク担当</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
            {members.map((m, i) => {
              const selected = assigneeIds.has(m.user_id);
              const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <TouchableOpacity key={m.user_id} onPress={() => toggleAssignee(m.user_id)}
                  style={[fStyles.memberChip, selected && { borderColor: color, backgroundColor: color + '18' }]}>
                  <View style={[fStyles.chipAvatar, { backgroundColor: color }]}>
                    <Text style={fStyles.chipAvatarText}>{(m.profile?.full_name ?? '?')[0]}</Text>
                  </View>
                  <Text style={[fStyles.chipName, selected && { color }]}>{m.profile?.full_name ?? '不明'}</Text>
                  {selected && <Text style={{ color, marginLeft: 4, fontWeight: '800' }}>✓</Text>}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* 期日 */}
          <View style={fStyles.dueDateRow}>
            <Text style={fStyles.label}>期日</Text>
            <View style={fStyles.timeToggle}>
              <Text style={fStyles.timeToggleLabel}>時間を指定</Text>
              <Switch value={withTime} onValueChange={setWithTime} trackColor={{ true: '#1a56db' }} />
            </View>
          </View>
          <TouchableOpacity style={fStyles.dateBox} onPress={() => setShowCalendar(v => !v)}>
            <Text style={fStyles.dateBoxIcon}>📅</Text>
            <Text style={fStyles.dateBoxText}>{dueDate || '指定なし'}</Text>
          </TouchableOpacity>
          {showCalendar && (
            <CalendarPicker value={dueDate} onChange={setDueDate} onClose={() => setShowCalendar(false)} />
          )}
          {withTime && (
            <TextInput style={[fStyles.input, { marginTop: 8 }]} placeholder="HH:MM" value={dueTime} onChangeText={setDueTime} keyboardType="numeric" />
          )}

          {/* 依頼者 */}
          <Text style={fStyles.label}>依頼者 <Text style={fStyles.required}>必須</Text></Text>
          <TouchableOpacity style={fStyles.requesterBox} onPress={() => setShowRequesterPicker(v => !v)}>
            <Text style={fStyles.requesterName}>{requesterProfile?.full_name ?? '選択してください'}</Text>
            <Text style={fStyles.chevron}>▼</Text>
          </TouchableOpacity>
          {showRequesterPicker && (
            <View style={fStyles.pickerList}>
              {members.map(m => (
                <TouchableOpacity key={m.user_id} style={fStyles.pickerItem}
                  onPress={() => { setRequesterId(m.user_id); setShowRequesterPicker(false); }}>
                  <Text style={[fStyles.pickerItemText, requesterId === m.user_id && { color: '#1a56db', fontWeight: '700' }]}>
                    {m.profile?.full_name ?? '不明'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          {/* タスク内容 */}
          <Text style={fStyles.label}>タスク内容</Text>
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
            <TextInput style={[fStyles.input, { flex: 1, height: 100, marginBottom: 0 }]} placeholder="タスクの内容を入力"
              value={description} onChangeText={setDescription} multiline />
            <TouchableOpacity
              style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: '#1a56db', justifyContent: 'center', alignItems: 'center', marginTop: 4 }}
              onPress={() => Alert.alert('音声入力', '音声入力は本番アプリでご利用いただけます。\n現在はキーボードの🎤マイクボタンをご使用ください。', [{ text: 'OK' }])}
            >
              <Text style={{ fontSize: 20 }}>🎤</Text>
            </TouchableOpacity>
          </View>

          <Text style={fStyles.note}>※写真と資料はタスク作成後に添付可能です</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

// ───────────────────────────────────────────
// スタイル
// ───────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  section: { marginTop: 16, paddingHorizontal: 16 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: '#111827', flex: 1 },
  sectionCount: { fontSize: 13, color: '#9ca3af', fontWeight: '600' },
  emptyText: { fontSize: 13, color: '#d1d5db', textAlign: 'center', paddingVertical: 8 },
  card: { backgroundColor: '#fff', borderRadius: 12, marginBottom: 10, padding: 14, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 2 },
  cardMain: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 },
  avatarRow: { flexDirection: 'row', marginRight: 12, alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', marginBottom: 4 },
  cardDue: { fontSize: 12, color: '#6b7280' },
  cardRequester: { fontSize: 12, color: '#9ca3af', marginTop: 2 },
  cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  statusBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flex: 1 },
  statusText: { fontSize: 12, fontWeight: '700', textAlign: 'center' },
  deleteBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#dc2626' },
  deleteBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  statusPicker: { flexDirection: 'row', gap: 8, marginTop: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: '#f3f4f6' },
  statusOption: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center' },
  statusOptionText: { fontSize: 12, fontWeight: '700' },
  addBtn: { position: 'absolute', bottom: 16, right: 16, left: 16, backgroundColor: '#1a56db', borderRadius: 12, padding: 14, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

const fStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 40 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  closeBtn: { fontSize: 18, color: '#6b7280', paddingHorizontal: 8 },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  saveBtn: { backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 16, paddingHorizontal: 16 },
  required: { color: '#dc2626' },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, marginHorizontal: 16, color: '#111827' },
  staticText: { fontSize: 15, color: '#374151', paddingHorizontal: 16, paddingVertical: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 24, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, marginLeft: 16 },
  chipAvatar: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  chipAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  chipName: { fontSize: 13, fontWeight: '600', color: '#374151' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  timeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  timeToggleLabel: { fontSize: 13, color: '#6b7280' },
  requesterBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, marginHorizontal: 16 },
  requesterName: { fontSize: 15, color: '#111827', fontWeight: '600' },
  chevron: { fontSize: 12, color: '#9ca3af' },
  dateBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14, marginHorizontal: 16 },
  dateBoxIcon: { fontSize: 16, marginRight: 8 },
  dateBoxText: { fontSize: 15, color: '#111827', fontWeight: '600' },
  pickerList: { marginHorizontal: 16, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, overflow: 'hidden' },
  pickerItem: { padding: 14, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  pickerItemText: { fontSize: 15, color: '#374151' },
  note: { fontSize: 12, color: '#9ca3af', textAlign: 'center', marginTop: 20, paddingHorizontal: 16 },
});
