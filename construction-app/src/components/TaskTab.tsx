import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator, Switch, Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { Task, TaskStatus, ProjectMember } from '../types';
import { CalendarPicker, todayStr } from './CalendarPicker';

// スケジュール通知（ローカル）
async function scheduleReminderNotification(taskTitle: string, reminderDate: string): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== 'granted') {
      const { status: s } = await Notifications.requestPermissionsAsync();
      if (s !== 'granted') return;
    }
    const date = new Date(reminderDate + 'T08:00:00');
    if (date <= new Date()) return;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: '📋 タスク期限が近づいています',
        body: `「${taskTitle}」の期限まであと少しです`,
        sound: true,
      },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date },
    });
  } catch (e) { console.warn('リマインダー設定エラー', e); }
}

// タスク通知をメンバーに送信
async function sendTaskNotification(task: Task, senderName: string, targetUserIds: string[]) {
  if (targetUserIds.length === 0) return;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, push_token')
    .in('id', targetUserIds);
  const tokens = (profiles ?? []).map(p => p.push_token).filter(Boolean);
  if (tokens.length === 0) return;
  try {
    await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tokens.map(token => ({
        to: token,
        title: `📋 タスク共有：${task.title}`,
        body: `${senderName} さんからタスクが共有されました`,
        data: { taskId: task.id },
        sound: 'default',
      }))),
    });
  } catch (e) { console.warn('Push送信エラー', e); }
}

const todayFmt = todayStr;
const AVATAR_COLORS = ['#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const STATUS_LIST: TaskStatus[] = ['未着手', '進行中', '完了'];
const STATUS_META: Record<TaskStatus, { color: string; bg: string; icon: string }> = {
  '未着手': { color: '#64748b', bg: '#f1f5f9', icon: '○' },
  '進行中': { color: '#2563eb', bg: '#eff6ff', icon: '◑' },
  '完了':   { color: '#059669', bg: '#ecfdf5', icon: '●' },
};

interface Props { projectId: string; projectName: string; members: ProjectMember[]; }

export default function TaskTab({ projectId, projectName, members }: Props) {
  const { profile } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [notifyTask, setNotifyTask] = useState<Task | null>(null);

  const fetchTasks = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('tasks')
      .select(`*, requester:profiles!tasks_requester_id_fkey(full_name),
        assignees:task_assignees(user_id, profile:profiles(full_name))`)
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    setTasks((data ?? []) as Task[]);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { fetchTasks(); }, [fetchTasks]);

  const handleDelete = (task: Task) => {
    Alert.alert('タスクを削除', `「${task.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        await supabase.from('tasks').delete().eq('id', task.id);
        fetchTasks();
      }},
    ]);
  };

  const handleStatusChange = async (task: Task, status: TaskStatus) => {
    await supabase.from('tasks').update({ status, updated_at: new Date().toISOString() }).eq('id', task.id);
    setTasks(prev => prev.map(t => t.id === task.id ? { ...t, status } : t));
  };

  if (loading) return <ActivityIndicator style={{ marginTop: 60 }} color="#1a56db" size="large" />;

  const total = tasks.length;
  const done  = tasks.filter(t => t.status === '完了').length;
  const progress = total > 0 ? done / total : 0;

  return (
    <View style={styles.container}>
      {/* サマリーバー */}
      {total > 0 && (
        <View style={styles.summaryBar}>
          <View style={styles.summaryText}>
            <Text style={styles.summaryLabel}>進捗</Text>
            <Text style={styles.summaryValue}>{done} / {total} 完了</Text>
          </View>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${progress * 100}%` as any }]} />
          </View>
          <Text style={styles.summaryPct}>{Math.round(progress * 100)}%</Text>
        </View>
      )}

      <ScrollView contentContainerStyle={styles.scrollContent}>
        {STATUS_LIST.map(status => {
          const filtered = tasks.filter(t => t.status === status);
          const meta = STATUS_META[status];
          return (
            <View key={status} style={styles.section}>
              {/* セクションヘッダー */}
              <View style={[styles.sectionHeader, { borderLeftColor: meta.color }]}>
                <Text style={[styles.sectionIcon, { color: meta.color }]}>{meta.icon}</Text>
                <Text style={[styles.sectionTitle, { color: meta.color }]}>{status}</Text>
                <View style={[styles.countBadge, { backgroundColor: meta.bg }]}>
                  <Text style={[styles.countText, { color: meta.color }]}>{filtered.length}</Text>
                </View>
              </View>

              {filtered.length === 0 ? (
                <View style={styles.emptyWrap}>
                  <Text style={styles.emptyText}>タスクなし</Text>
                </View>
              ) : (
                filtered.map(task => (
                  <TaskCard key={task.id} task={task} members={members}
                    onEdit={() => { setEditingTask(task); setModalVisible(true); }}
                    onDelete={() => handleDelete(task)}
                    onStatusChange={s => handleStatusChange(task, s)}
                    onNotify={() => setNotifyTask(task)} />
                ))
              )}
            </View>
          );
        })}
        <View style={{ height: 100 }} />
      </ScrollView>

      {/* 追加ボタン */}
      <TouchableOpacity style={styles.fab} onPress={() => { setEditingTask(null); setModalVisible(true); }}>
        <Text style={styles.fabIcon}>＋</Text>
        <Text style={styles.fabText}>タスクを追加</Text>
      </TouchableOpacity>

      <TaskFormModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingTask(null); }}
        onSaved={() => { setModalVisible(false); setEditingTask(null); fetchTasks(); }}
        projectId={projectId} projectName={projectName} members={members}
        editingTask={editingTask} currentUserId={profile?.id ?? ''} />

      <NotifyModal
        task={notifyTask}
        members={members}
        senderName={profile?.full_name ?? ''}
        onClose={() => setNotifyTask(null)} />
    </View>
  );
}

// ─── TaskCard ───
function TaskCard({ task, members, onEdit, onDelete, onStatusChange, onNotify }:
  { task: Task; members: ProjectMember[]; onEdit: ()=>void; onDelete: ()=>void; onStatusChange: (s: TaskStatus)=>void; onNotify: ()=>void }) {
  const [showStatus, setShowStatus] = useState(false);
  const meta = STATUS_META[task.status];
  const isOverdue = task.due_date && task.due_date < new Date().toISOString().slice(0, 10) && task.status !== '完了';

  return (
    <View style={[styles.card, { borderLeftColor: meta.color }]}>
      <TouchableOpacity onPress={onEdit} activeOpacity={0.8} style={styles.cardBody}>
        {/* タイトル行 */}
        <View style={styles.cardTitleRow}>
          <Text style={[styles.cardTitle, task.status === '完了' && styles.cardTitleDone]} numberOfLines={2}>
            {task.title}
          </Text>
          <TouchableOpacity
            onPress={() => setShowStatus(v => !v)}
            style={[styles.statusPill, { backgroundColor: meta.bg }]}
          >
            <Text style={[styles.statusText, { color: meta.color }]}>{meta.icon} {task.status}</Text>
          </TouchableOpacity>
        </View>

        {/* メタ情報 */}
        <View style={styles.cardMeta}>
          {task.due_date && (
            <View style={[styles.metaChip, isOverdue && styles.metaChipOverdue]}>
              <Text style={[styles.metaChipText, isOverdue && styles.metaChipTextOverdue]}>
                📅 {task.due_date}{task.due_time ? ' ' + task.due_time.slice(0, 5) : ''}
              </Text>
            </View>
          )}
          {task.requester && (
            <View style={styles.metaChip}>
              <Text style={styles.metaChipText}>👤 {task.requester.full_name}</Text>
            </View>
          )}
        </View>

        {/* 担当者アバター */}
        {(task.assignees?.length ?? 0) > 0 && (
          <View style={styles.assigneeRow}>
            {(task.assignees ?? []).slice(0, 5).map((a, i) => {
              const mi = members.findIndex(m => m.user_id === a.user_id);
              const color = AVATAR_COLORS[(mi >= 0 ? mi : i) % AVATAR_COLORS.length];
              return (
                <View key={a.user_id} style={[styles.avatar, { backgroundColor: color, marginLeft: i > 0 ? -8 : 0 }]}>
                  <Text style={styles.avatarText}>{(a.profile?.full_name ?? '?')[0]}</Text>
                </View>
              );
            })}
            <Text style={styles.assigneeLabel}>担当</Text>
          </View>
        )}
      </TouchableOpacity>

      {/* ステータス変更パネル */}
      {showStatus && (
        <View style={styles.statusPanel}>
          {STATUS_LIST.map(s => {
            const sm = STATUS_META[s];
            return (
              <TouchableOpacity key={s}
                onPress={() => { onStatusChange(s); setShowStatus(false); }}
                style={[styles.statusOption, s === task.status && { backgroundColor: sm.bg }]}
              >
                <Text style={[styles.statusOptionText, { color: sm.color }]}>{sm.icon} {s}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {/* 削除ボタン */}
      <TouchableOpacity onPress={onDelete} style={styles.deleteBtn}>
        <Text style={styles.deleteBtnText}>✕</Text>
      </TouchableOpacity>
      {/* 通知共有ボタン */}
      <TouchableOpacity onPress={onNotify} style={styles.notifyBtn}>
        <Text style={styles.notifyBtnText}>🔔</Text>
      </TouchableOpacity>
    </View>
  );
}

// ─── NotifyModal ───
function NotifyModal({ task, members, senderName, onClose }:
  { task: Task | null; members: ProjectMember[]; senderName: string; onClose: ()=>void }) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);

  // タスクが開かれるたびに担当者を強制選択
  useEffect(() => {
    if (task) {
      const assigneeIds = new Set((task.assignees ?? []).map(a => a.user_id));
      setSelected(assigneeIds);
    }
  }, [task]);

  if (!task) return null;
  const assigneeIds = new Set((task.assignees ?? []).map(a => a.user_id));

  const toggle = (uid: string) => {
    if (assigneeIds.has(uid)) return; // 担当者は解除不可
    setSelected(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  };

  const handleSend = async () => {
    setSending(true);
    await sendTaskNotification(task, senderName, [...selected]);
    setSending(false);
    Alert.alert('送信完了', `${selected.size}名にタスクを通知しました`);
    onClose();
  };

  return (
    <Modal visible={!!task} animationType="fade" transparent>
      <View style={nStyles.overlay}>
        <View style={nStyles.sheet}>
          <View style={nStyles.header}>
            <Text style={nStyles.title}>📋 タスクを通知共有</Text>
            <TouchableOpacity onPress={onClose} style={nStyles.closeBtn}>
              <Text style={nStyles.closeTxt}>✕</Text>
            </TouchableOpacity>
          </View>
          <Text style={nStyles.taskName} numberOfLines={2}>{task.title}</Text>
          <Text style={nStyles.hint}>通知するメンバーを選んでください（担当者は必須）</Text>
          <ScrollView style={nStyles.list}>
            {members.map((m, i) => {
              const uid = m.user_id;
              const isAssignee = assigneeIds.has(uid);
              const isSelected = selected.has(uid);
              const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
              return (
                <TouchableOpacity key={uid} onPress={() => toggle(uid)}
                  style={[nStyles.memberRow, isSelected && { backgroundColor: color + '12' }]}>
                  <View style={[nStyles.avatar, { backgroundColor: color }]}>
                    <Text style={nStyles.avatarTxt}>{(m.profile?.full_name ?? '?')[0]}</Text>
                  </View>
                  <Text style={nStyles.memberName}>{m.profile?.full_name ?? '不明'}</Text>
                  {isAssignee && <View style={nStyles.requiredBadge}><Text style={nStyles.requiredTxt}>担当者</Text></View>}
                  <View style={[nStyles.check, isSelected && { backgroundColor: color, borderColor: color }]}>
                    {isSelected && <Text style={nStyles.checkTxt}>✓</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity style={nStyles.sendBtn} onPress={handleSend} disabled={sending}>
            {sending ? <ActivityIndicator color="#fff" /> : (
              <Text style={nStyles.sendTxt}>🔔 {selected.size}名に通知する</Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const nStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center' },
  sheet: {
    backgroundColor: '#fff', borderRadius: 20, width: '90%', maxWidth: 480,
    maxHeight: '80%', overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } as any : { elevation: 10 }),
  },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  title: { fontSize: 16, fontWeight: '800', color: '#0f172a' },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  closeTxt: { fontSize: 13, color: '#64748b', fontWeight: '700' },
  taskName: { fontSize: 14, fontWeight: '700', color: '#1a56db', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 },
  hint: { fontSize: 12, color: '#94a3b8', paddingHorizontal: 16, marginBottom: 8 },
  list: { maxHeight: 300 },
  memberRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f8fafc', gap: 10 },
  avatar: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  avatarTxt: { color: '#fff', fontSize: 13, fontWeight: '800' },
  memberName: { flex: 1, fontSize: 14, fontWeight: '600', color: '#0f172a' },
  requiredBadge: { backgroundColor: '#fef3c7', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 },
  requiredTxt: { fontSize: 11, color: '#d97706', fontWeight: '700' },
  check: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#d1d5db', alignItems: 'center', justifyContent: 'center' },
  checkTxt: { color: '#fff', fontSize: 12, fontWeight: '800' },
  sendBtn: { margin: 16, backgroundColor: '#1a56db', borderRadius: 12, paddingVertical: 14, alignItems: 'center' },
  sendTxt: { color: '#fff', fontSize: 15, fontWeight: '800' },
});
interface FormProps {
  visible: boolean; onClose: ()=>void; onSaved: ()=>void;
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
  const [reminderEnabled, setReminderEnabled] = useState(true);
  const [reminderDate, setReminderDate] = useState('');
  const [showReminderCalendar, setShowReminderCalendar] = useState(false);

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
        setReminderEnabled(true); setReminderDate(''); setShowReminderCalendar(false);
      }
    }
  }, [visible, editingTask, currentUserId]);

  const toggleAssignee = (uid: string) => {
    setAssigneeIds(prev => { const n = new Set(prev); n.has(uid) ? n.delete(uid) : n.add(uid); return n; });
  };

  // 期日が変わったら5日前をリマインダーデフォルトに
  useEffect(() => {
    if (dueDate) {
      const d = new Date(dueDate);
      d.setDate(d.getDate() - 5);
      setReminderDate(d.toISOString().slice(0, 10));
    } else {
      setReminderDate('');
    }
  }, [dueDate]);

  const handleSave = async () => {
    if (!title.trim()) {
      if (Platform.OS === 'web') window.alert('タスク名を入力してください');
      else Alert.alert('エラー', 'タスク名を入力してください');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        project_id: projectId, title: title.trim(),
        description: description || null, due_date: dueDate || null,
        due_time: withTime && dueTime ? dueTime + ':00' : null,
        requester_id: requesterId || null, updated_at: new Date().toISOString(),
      };
      let taskId = editingTask?.id;
      if (editingTask) {
        const { error } = await supabase.from('tasks').update(payload).eq('id', taskId!);
        if (error) throw error;
      } else {
        const insertPayload = { ...payload, status: '未着手', ...(currentUserId ? { created_by: currentUserId } : {}) };
        const { data, error } = await supabase.from('tasks').insert(insertPayload).select('id').single();
        if (error) throw error;
        taskId = data.id;
      }
      await supabase.from('task_assignees').delete().eq('task_id', taskId!);
      if (assigneeIds.size > 0) {
        await supabase.from('task_assignees').insert([...assigneeIds].map(uid => ({ task_id: taskId!, user_id: uid })));
      }
      onSaved();
      if (reminderEnabled && reminderDate) {
        await scheduleReminderNotification(title.trim(), reminderDate);
      }
    } catch (e: any) {
      const msg = e.message ?? '保存に失敗しました';
      if (Platform.OS === 'web') window.alert('エラー: ' + msg);
      else Alert.alert('エラー', msg);
    } finally { setSaving(false); }
  };

  const requesterProfile = members.find(m => m.user_id === requesterId)?.profile;

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={fStyles.overlay}>
        <View style={fStyles.sheet}>
          {/* ヘッダー */}
          <View style={fStyles.header}>
            <TouchableOpacity onPress={onClose} style={fStyles.closeBtn}>
              <Text style={fStyles.closeBtnText}>✕</Text>
            </TouchableOpacity>
            <Text style={fStyles.headerTitle}>{editingTask ? 'タスクを編集' : '新しいタスク'}</Text>
            <TouchableOpacity onPress={handleSave} style={fStyles.saveBtn} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={fStyles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          </View>

          <ScrollView contentContainerStyle={fStyles.body} keyboardShouldPersistTaps="handled">
            {/* タスク名 */}
            <Text style={fStyles.label}>タスク名 <Text style={fStyles.req}>必須</Text></Text>
            <TextInput style={fStyles.input} placeholder="タスク名を入力" value={title} onChangeText={setTitle} />

            {/* 案件 */}
            <Text style={fStyles.label}>案件</Text>
            <View style={fStyles.staticBox}><Text style={fStyles.staticText}>{projectName}</Text></View>

            {/* タスク担当 */}
            <Text style={fStyles.label}>タスク担当</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={fStyles.chipScroll}>
              {members.map((m, i) => {
                const selected = assigneeIds.has(m.user_id);
                const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
                return (
                  <TouchableOpacity key={m.user_id} onPress={() => toggleAssignee(m.user_id)}
                    style={[fStyles.chip, selected && { borderColor: color, backgroundColor: color + '15' }]}>
                    <View style={[fStyles.chipAvatar, { backgroundColor: color }]}>
                      <Text style={fStyles.chipAvatarText}>{(m.profile?.full_name ?? '?')[0]}</Text>
                    </View>
                    <Text style={[fStyles.chipName, selected && { color }]}>{m.profile?.full_name ?? '不明'}</Text>
                    {selected && <Text style={{ color, fontSize: 12, fontWeight: '800', marginLeft: 4 }}>✓</Text>}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* 期日 */}
            <View style={fStyles.dueDateRow}>
              <Text style={fStyles.label}>期日</Text>
              <View style={fStyles.timeToggle}>
                <Text style={fStyles.timeLabel}>時間を指定</Text>
                <Switch value={withTime} onValueChange={setWithTime} trackColor={{ true: '#1a56db' }} />
              </View>
            </View>
            <TouchableOpacity style={fStyles.dateBox} onPress={() => setShowCalendar(v => !v)}>
              <Text style={fStyles.dateIcon}>📅</Text>
              <Text style={fStyles.dateText}>{dueDate || '指定なし'}</Text>
            </TouchableOpacity>
            {showCalendar && <CalendarPicker value={dueDate} onChange={setDueDate} onClose={() => setShowCalendar(false)} />}
            {withTime && (
              <TextInput style={[fStyles.input, { marginTop: 8 }]} placeholder="HH:MM" value={dueTime} onChangeText={setDueTime} keyboardType="numeric" />
            )}

            {/* リマインダー */}
            {dueDate ? (
              <View style={fStyles.reminderSection}>
                <View style={fStyles.reminderRow}>
                  <Text style={fStyles.label}>🔔 リマインダー通知</Text>
                  <Switch value={reminderEnabled} onValueChange={setReminderEnabled} trackColor={{ true: '#1a56db' }} />
                </View>
                {reminderEnabled && (
                  <>
                    <Text style={fStyles.reminderHint}>デフォルト：期限の5日前（変更可）</Text>
                    <TouchableOpacity style={fStyles.dateBox} onPress={() => setShowReminderCalendar(v => !v)}>
                      <Text style={fStyles.dateIcon}>📅</Text>
                      <Text style={fStyles.dateText}>{reminderDate || '日付を選択'}</Text>
                    </TouchableOpacity>
                    {showReminderCalendar && (
                      <CalendarPicker value={reminderDate} onChange={v => { setReminderDate(v); setShowReminderCalendar(false); }} onClose={() => setShowReminderCalendar(false)} />
                    )}
                  </>
                )}
              </View>
            ) : null}

            {/* 依頼者 */}
            <Text style={fStyles.label}>依頼者 <Text style={fStyles.req}>必須</Text></Text>
            <TouchableOpacity style={fStyles.pickerBox} onPress={() => setShowRequesterPicker(v => !v)}>
              <Text style={fStyles.pickerBoxText}>{requesterProfile?.full_name ?? '選択してください'}</Text>
              <Text style={fStyles.chevron}>▼</Text>
            </TouchableOpacity>
            {showRequesterPicker && (
              <View style={fStyles.pickerList}>
                {members.map(m => (
                  <TouchableOpacity key={m.user_id} style={fStyles.pickerItem}
                    onPress={() => { setRequesterId(m.user_id); setShowRequesterPicker(false); }}>
                    <Text style={[fStyles.pickerItemText, requesterId === m.user_id && fStyles.pickerItemActive]}>
                      {m.profile?.full_name ?? '不明'}
                    </Text>
                    {requesterId === m.user_id && <Text style={{ color: '#1a56db', fontWeight: '800' }}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>
            )}

            {/* タスク内容 */}
            <Text style={fStyles.label}>タスク内容</Text>
            <TextInput style={[fStyles.input, { height: 100 }]} placeholder="タスクの詳細を入力"
              value={description} onChangeText={setDescription} multiline textAlignVertical="top" />

            <Text style={fStyles.note}>※ 写真・資料はタスク作成後に添付できます</Text>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ─── スタイル ───
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  summaryBar: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: '#fff', paddingHorizontal: 20, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  summaryText: { width: 90 },
  summaryLabel: { fontSize: 11, color: '#94a3b8', fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  summaryValue: { fontSize: 13, color: '#0f172a', fontWeight: '800', marginTop: 2 },
  progressTrack: { flex: 1, height: 6, backgroundColor: '#e2e8f0', borderRadius: 3, overflow: 'hidden' },
  progressFill: { height: '100%', backgroundColor: '#059669', borderRadius: 3 },
  summaryPct: { width: 38, fontSize: 13, fontWeight: '800', color: '#059669', textAlign: 'right' },

  scrollContent: { padding: 16, paddingBottom: 100, maxWidth: 760, width: '100%', alignSelf: 'center' as any },
  section: { marginBottom: 24 },
  sectionHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    borderLeftWidth: 3, paddingLeft: 10, marginBottom: 10,
  },
  sectionIcon: { fontSize: 15, fontWeight: '800' },
  sectionTitle: { fontSize: 15, fontWeight: '800', flex: 1 },
  countBadge: { paddingHorizontal: 9, paddingVertical: 2, borderRadius: 12 },
  countText: { fontSize: 12, fontWeight: '800' },
  emptyWrap: { paddingVertical: 14, paddingHorizontal: 12, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1, borderColor: '#e2e8f0', borderStyle: 'dashed' },
  emptyText: { fontSize: 13, color: '#cbd5e1', textAlign: 'center' },

  card: {
    backgroundColor: '#fff', borderRadius: 14, marginBottom: 10,
    borderLeftWidth: 4, paddingTop: 14, paddingRight: 40, paddingBottom: 14, paddingLeft: 14,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as any : { shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 }),
  },
  cardBody: {},
  cardTitleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 8 },
  cardTitle: { flex: 1, fontSize: 15, fontWeight: '700', color: '#0f172a', lineHeight: 21 },
  cardTitleDone: { color: '#94a3b8', textDecorationLine: 'line-through' },
  statusPill: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, flexShrink: 0 },
  statusText: { fontSize: 12, fontWeight: '700' },
  cardMeta: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  metaChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f1f5f9', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  metaChipText: { fontSize: 12, color: '#64748b', fontWeight: '500' },
  metaChipOverdue: { backgroundColor: '#fef2f2' },
  metaChipTextOverdue: { color: '#dc2626' },
  assigneeRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  avatar: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  assigneeLabel: { fontSize: 11, color: '#94a3b8', marginLeft: 6, fontWeight: '600' },
  statusPanel: { flexDirection: 'row', gap: 6, marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  statusOption: { flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', backgroundColor: '#f8fafc' },
  statusOptionText: { fontSize: 12, fontWeight: '700' },
  deleteBtn: { position: 'absolute', top: 12, right: 12, width: 28, height: 28, borderRadius: 14, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  deleteBtnText: { fontSize: 12, color: '#94a3b8', fontWeight: '700' },
  notifyBtn: { position: 'absolute', top: 12, right: 46, width: 28, height: 28, borderRadius: 14, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center' },
  notifyBtnText: { fontSize: 14 },

  fab: {
    position: 'absolute', bottom: 20,
    left: '50%' as any, transform: [{ translateX: -180 }],
    width: 360,
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    backgroundColor: '#1a56db', borderRadius: 16, paddingVertical: 15,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(26,86,219,0.35)' } as any : { shadowColor: '#1a56db', shadowOpacity: 0.35, shadowRadius: 10, elevation: 6 }),
  },
  fabIcon: { fontSize: 20, color: '#fff', fontWeight: '300' },
  fabText: { fontSize: 16, fontWeight: '800', color: '#fff' },
});

const fStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: Platform.OS === 'web' ? 'center' : 'flex-end', alignItems: Platform.OS === 'web' ? 'center' : 'stretch' },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', ...(Platform.OS === 'web' ? { borderRadius: 20, width: '100%', maxWidth: 600 } as any : {}) },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: '#64748b', fontWeight: '700' },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  saveBtn: { backgroundColor: '#059669', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  body: { paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginTop: 18, marginBottom: 6, paddingHorizontal: 16 },
  req: { color: '#ef4444' },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 13, fontSize: 15, marginHorizontal: 16, color: '#0f172a', backgroundColor: '#fafafa' },
  staticBox: { marginHorizontal: 16, backgroundColor: '#f8fafc', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  staticText: { fontSize: 15, color: '#475569', fontWeight: '600' },
  chipScroll: { paddingLeft: 16, marginBottom: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 24, paddingHorizontal: 10, paddingVertical: 7, marginRight: 8, backgroundColor: '#fff' },
  chipAvatar: { width: 26, height: 26, borderRadius: 13, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  chipAvatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  chipName: { fontSize: 13, fontWeight: '600', color: '#374151' },
  dueDateRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  timeToggle: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 18 },
  timeLabel: { fontSize: 13, color: '#64748b', fontWeight: '600' },
  dateBox: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginHorizontal: 16, backgroundColor: '#fafafa' },
  dateIcon: { fontSize: 16, marginRight: 10 },
  dateText: { fontSize: 15, color: '#0f172a', fontWeight: '600' },
  pickerBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 13, marginHorizontal: 16, backgroundColor: '#fafafa' },
  pickerBoxText: { fontSize: 15, color: '#0f172a', fontWeight: '600' },
  chevron: { fontSize: 12, color: '#94a3b8' },
  pickerList: { marginHorizontal: 16, marginTop: 4, borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, overflow: 'hidden', backgroundColor: '#fff' },
  pickerItem: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  pickerItemText: { fontSize: 15, color: '#374151', fontWeight: '500' },
  pickerItemActive: { color: '#1a56db', fontWeight: '700' },
  note: { fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 24, paddingHorizontal: 16 },
  reminderSection: { marginHorizontal: 16, marginTop: 16, backgroundColor: '#f8fafc', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  reminderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  reminderHint: { fontSize: 12, color: '#94a3b8', marginBottom: 8, marginLeft: 2 },
});
