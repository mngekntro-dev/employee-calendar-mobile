import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';
import { ProjectMember } from '../types';

const AVATAR_COLORS = ['#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

// user_id から一貫した色を返す（案件をまたいでも同じ社員は同じ色）
const getUserColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
const CALENDAR_API = 'https://employee-calendar-backend-production.up.railway.app/api';
const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];
const MINUTES = [0, 15, 30, 45];

interface Schedule {
  id: string;
  title: string;
  memo: string | null;
  participant_user_id: string;
  scheduled_date: string;
  start_at?: string;
  end_at?: string;
  profile?: { full_name: string };
}

interface MemberDates {
  [userId: string]: Set<string>;
}

interface Props {
  projectId: string;
  projectName: string;
  projectAddress: string | null;
  members: ProjectMember[];
}

// ─── ＋／－ 時間ピッカー ─────────────────────────
function TimePicker({ value, onChange }: { value: { h: number; m: number }; onChange: (h: number, m: number) => void }) {
  const nextMin = () => {
    const idx = MINUTES.indexOf(value.m);
    const next = MINUTES[(idx + 1) % MINUTES.length];
    onChange(value.h, next);
  };
  const prevMin = () => {
    const idx = MINUTES.indexOf(value.m);
    const prev = MINUTES[(idx - 1 + MINUTES.length) % MINUTES.length];
    onChange(value.h, prev);
  };
  const nextH = () => onChange((value.h + 1) % 24, value.m);
  const prevH = () => onChange((value.h - 1 + 24) % 24, value.m);

  return (
    <View style={tp.container}>
      <View style={tp.col}>
        <TouchableOpacity onPress={nextH} style={tp.arrowBtn}><Text style={tp.arrow}>▲</Text></TouchableOpacity>
        <Text style={tp.num}>{String(value.h).padStart(2, '0')}</Text>
        <TouchableOpacity onPress={prevH} style={tp.arrowBtn}><Text style={tp.arrow}>▼</Text></TouchableOpacity>
      </View>
      <Text style={tp.colon}>:</Text>
      <View style={tp.col}>
        <TouchableOpacity onPress={nextMin} style={tp.arrowBtn}><Text style={tp.arrow}>▲</Text></TouchableOpacity>
        <Text style={tp.num}>{String(value.m).padStart(2, '0')}</Text>
        <TouchableOpacity onPress={prevMin} style={tp.arrowBtn}><Text style={tp.arrow}>▼</Text></TouchableOpacity>
      </View>
    </View>
  );
}

const tp = StyleSheet.create({
  container: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#f3f4f6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 6 },
  col: { alignItems: 'center' },
  arrowBtn: { paddingHorizontal: 12, paddingVertical: 4 },
  arrow: { fontSize: 16, color: '#1a56db', fontWeight: '800' },
  num: { fontSize: 28, fontWeight: '800', color: '#111827', minWidth: 44, textAlign: 'center' },
  colon: { fontSize: 28, fontWeight: '800', color: '#374151', marginHorizontal: 4 },
});

// ─── メインコンポーネント ─────────────────────────
export default function ProjectCalendarTab({ projectId, projectName, projectAddress, members }: Props) {
  const { profile } = useAuth();
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [schedules, setSchedules] = useState<Schedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [presetDate, setPresetDate] = useState<string | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<Schedule | null>(null);

  const handleDeleteSchedule = (s: Schedule) => {
    Alert.alert('予定を削除', `「${s.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          const { error } = await supabase.from('project_schedules').delete().eq('id', s.id);
          if (error) { Alert.alert('エラー', error.message); return; }

          try {
            const loginRes = await fetch(`${CALENDAR_API}/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ email: 'admin@example.com', password: 'password' }),
            });
            const { token: calToken } = await loginRes.json();
            const { data: prof } = await supabase.from('profiles').select('email').eq('id', s.participant_user_id).single();
            if (!prof?.email) { fetchSchedules(); return; }
            const empRes = await fetch(`${CALENDAR_API}/employees`, { headers: { Authorization: `Bearer ${calToken}` } });
            const employees: { id: number; email: string }[] = await empRes.json();
            const calUserId = employees.find(e => e.email === prof.email)?.id;
            if (!calUserId) { fetchSchedules(); return; }
            const schRes = await fetch(
              `${CALENDAR_API}/schedules?user_id=${calUserId}&start=${s.scheduled_date}T00:00:00&end=${s.scheduled_date}T23:59:59`,
              { headers: { Authorization: `Bearer ${calToken}` } },
            );
            const calSchedules: { id: number; description: string | null }[] = await schRes.json();
            for (const cs of calSchedules) {
              if ((cs.description ?? '').includes(`project_id:${projectId}`)) {
                await fetch(`${CALENDAR_API}/schedules/${cs.id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${calToken}` } });
              }
            }
          } catch (_) {}

          fetchSchedules();
        },
      },
    ]);
  };

  const fetchSchedules = useCallback(async () => {
    const from = `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month + 1, 0).getDate();
    const to = `${year}-${String(month + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    const { data } = await supabase
      .from('project_schedules')
      .select('*, profile:profiles!project_schedules_participant_user_id_fkey(full_name)')
      .eq('project_id', projectId)
      .gte('scheduled_date', from)
      .lte('scheduled_date', to);
    setSchedules((data ?? []) as Schedule[]);
    setLoading(false);
  }, [projectId, year, month]);

  useEffect(() => { setLoading(true); fetchSchedules(); }, [fetchSchedules]);

  const dateMap: Record<string, Schedule[]> = {};
  for (const s of schedules) {
    if (!dateMap[s.scheduled_date]) dateMap[s.scheduled_date] = [];
    dateMap[s.scheduled_date].push(s);
  }

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const handleDayPress = (day: number) => {
    setPresetDate(fmt(day));
    setModalVisible(true);
  };

  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  return (
    <View style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }} style={styles.navBtn}>
          <Text style={styles.navArrow}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.navTitle}>{year}年{month + 1}月</Text>
        <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }} style={styles.navBtn}>
          <Text style={styles.navArrow}>▶</Text>
        </TouchableOpacity>
      </View>

      <ScrollView>
        <View style={styles.weekRow}>
          {DAY_LABELS.map((d, i) => (
            <Text key={d} style={[styles.weekLabel, i === 0 && styles.sun, i === 6 && styles.sat]}>{d}</Text>
          ))}
        </View>

        {loading ? <ActivityIndicator style={{ marginTop: 32 }} color="#1a56db" /> : (
          <View style={styles.grid}>
            {cells.map((day, i) => {
              const dateStr = day ? fmt(day) : '';
              const daySchedules = day ? (dateMap[dateStr] ?? []) : [];
              const isToday = dateStr === todayStr;
              const col = i % 7;
              return (
                <TouchableOpacity
                  key={i}
                  style={[styles.cell, isToday && styles.todayCell]}
                  onPress={() => day && handleDayPress(day)}
                  disabled={!day}
                >
                  {day ? (
                    <>
                      <Text style={[styles.dayNum, isToday && styles.todayNum, col === 0 && styles.sunNum, col === 6 && styles.satNum]}>
                        {day}
                      </Text>
                      <View style={styles.dots}>
                        {daySchedules.slice(0, 3).map((s, si) => {
                          const mi = members.findIndex(m => m.user_id === s.participant_user_id);
                          const nightShift = (s.memo ?? '').includes('night_shift:true');
                          const dotColor = nightShift ? '#dc2626' : getUserColor(s.participant_user_id);
                          return <View key={si} style={[styles.dot, { backgroundColor: dotColor }]} />;
                        })}
                      </View>
                      {daySchedules.length > 0 && (
                        <Text style={styles.scheduleTitle} numberOfLines={1}>
                          {daySchedules[0].profile?.full_name?.[0]}{daySchedules[0].title}
                        </Text>
                      )}
                    </>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>
        )}

        {schedules.length > 0 && (
          <View style={styles.listSection}>
            <Text style={styles.listTitle}>今月の予定</Text>
            {schedules.map((s) => {
              const mi = members.findIndex(m => m.user_id === s.participant_user_id);
              const nightShift = (s.memo ?? '').includes('night_shift:true');
              const color = nightShift ? '#dc2626' : getUserColor(s.participant_user_id);
              const startTime = s.start_at ? s.start_at.substring(11, 16) : '09:00';
              const endTime = s.end_at ? s.end_at.substring(11, 16) : '18:00';
              return (
                <View key={s.id} style={styles.scheduleRow}>
                  <View style={[styles.scheduleAvatar, { backgroundColor: color }]}>
                    <Text style={styles.scheduleAvatarText}>{(s.profile?.full_name ?? '?')[0]}</Text>
                  </View>
                  <View style={styles.scheduleInfo}>
                    <Text style={styles.scheduleRowTitle}>{s.title}</Text>
                    <Text style={styles.scheduleDate}>{s.scheduled_date} {startTime}〜{endTime} · {s.profile?.full_name}</Text>
                  </View>
                  <TouchableOpacity style={styles.editBtn} onPress={() => { setEditingSchedule(s); setPresetDate(s.scheduled_date); setModalVisible(true); }}>
                    <Text style={styles.editBtnText}>編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDeleteSchedule(s)}>
                    <Text style={styles.deleteBtnText}>削除</Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>
        )}
      </ScrollView>

      <TouchableOpacity style={styles.addBtn} onPress={() => { setPresetDate(todayStr); setModalVisible(true); }}>
        <Text style={styles.addBtnText}>＋ 予定を追加</Text>
      </TouchableOpacity>

      <ScheduleModal
        visible={modalVisible}
        onClose={() => { setModalVisible(false); setEditingSchedule(null); }}
        onSaved={() => { setModalVisible(false); setEditingSchedule(null); fetchSchedules(); }}
        projectId={projectId}
        projectName={projectName}
        projectAddress={projectAddress}
        members={members}
        presetDate={presetDate}
        editingSchedule={editingSchedule}
      />
    </View>
  );
}

// ─── 予定登録モーダル ─────────────────────────────
interface ModalProps {
  visible: boolean;
  onClose: () => void;
  onSaved: () => void;
  projectId: string;
  projectName: string;
  projectAddress: string | null;
  members: ProjectMember[];
  presetDate: string | null;
  editingSchedule: Schedule | null;
}

function ScheduleModal({ visible, onClose, onSaved, projectId, projectName, projectAddress, members, presetDate, editingSchedule }: ModalProps) {
  const { profile } = useAuth();
  const [title, setTitle] = useState('');
  const [memo, setMemo] = useState('');
  const [saving, setSaving] = useState(false);
  const [selectedMemberIds, setSelectedMemberIds] = useState<Set<string>>(new Set());
  const [memberDates, setMemberDates] = useState<MemberDates>({});
  const [startTime, setStartTime] = useState({ h: 8, m: 0 });
  const [endTime, setEndTime] = useState({ h: 17, m: 0 });
  const [isNightShift, setIsNightShift] = useState(false);

  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());

  const allSelected = members.length > 0 && members.every(m => selectedMemberIds.has(m.user_id));

  useEffect(() => {
    if (visible) {
      setSaving(false);
      if (editingSchedule) {
        setTitle(editingSchedule.title);
        const rawMemo = editingSchedule.memo ?? '';
        setMemo(rawMemo.replace(/\nproject_id:[^\n]*/g, '').replace(/^project_id:[^\n]*/g, '').trim());
        const userId = editingSchedule.participant_user_id;
        setSelectedMemberIds(new Set([userId]));
        setMemberDates({ [userId]: new Set([editingSchedule.scheduled_date]) });
        const [y, mo] = editingSchedule.scheduled_date.split('-').map(Number);
        setYear(y); setMonth(mo - 1);
        // 既存の時間を読み込み
        if (editingSchedule.start_at) {
          const [sh, sm] = editingSchedule.start_at.substring(11, 16).split(':').map(Number);
          setStartTime({ h: sh, m: sm });
        } else { setStartTime({ h: 8, m: 0 }); }
        if (editingSchedule.end_at) {
          const [eh, em] = editingSchedule.end_at.substring(11, 16).split(':').map(Number);
          setEndTime({ h: eh, m: em });
        } else { setEndTime({ h: 17, m: 0 }); }
        setIsNightShift((editingSchedule.memo ?? '').includes('night_shift:true'));
      } else {
        setTitle(''); setMemo('');
        setSelectedMemberIds(new Set());
        setMemberDates({});
        setStartTime({ h: 8, m: 0 });
        setEndTime({ h: 17, m: 0 });
        setIsNightShift(false);
        if (presetDate) {
          const [y, mo] = presetDate.split('-').map(Number);
          setYear(y); setMonth(mo - 1);
        }
      }
    }
  }, [visible, presetDate, members, editingSchedule]);

  const toggleMember = (userId: string) => {
    setSelectedMemberIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId); else next.add(userId);
      return next;
    });
  };

  const toggleAllMembers = () => {
    if (allSelected) setSelectedMemberIds(new Set());
    else setSelectedMemberIds(new Set(members.map(m => m.user_id)));
  };

  const toggleDate = (dateStr: string) => {
    if (selectedMemberIds.size === 0) { Alert.alert('', 'まずメンバーを選択してください'); return; }
    setMemberDates(prev => {
      const next = { ...prev };
      for (const userId of selectedMemberIds) {
        const set = new Set(next[userId] ?? []);
        if (set.has(dateStr)) set.delete(dateStr); else set.add(dateStr);
        next[userId] = set;
      }
      return next;
    });
  };

  const removeDate = (userId: string, dateStr: string) => {
    setMemberDates(prev => {
      const next = { ...prev };
      const set = new Set(next[userId] ?? []);
      set.delete(dateStr);
      next[userId] = set;
      return next;
    });
  };

  const hhmm = (h: number, m: number) => `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;

  const activeDates = (() => {
    const sets = [...selectedMemberIds].map(id => memberDates[id] ?? new Set<string>());
    if (sets.length === 0) return new Set<string>();
    const union = new Set<string>();
    sets.forEach(s => s.forEach(d => union.add(d)));
    return union;
  })();

  const handleSave = async () => {
    if (!title.trim()) { Alert.alert('エラー', 'タイトルを入力してください'); return; }
    setSaving(true);
    const startHHMM = hhmm(startTime.h, startTime.m);
    const endHHMM = hhmm(endTime.h, endTime.m);
    const nightFlag = isNightShift ? '\nnight_shift:true' : '';

    try {
      if (editingSchedule) {
        const userId = editingSchedule.participant_user_id;
        const dates = memberDates[userId];
        const newDate = dates && dates.size > 0 ? [...dates][0] : editingSchedule.scheduled_date;
        const projectIdMatch = (editingSchedule.memo ?? '').match(/project_id:([^\n]+)/);
        const projectIdStr = projectIdMatch ? `\nproject_id:${projectIdMatch[1]}` : '';
        const { error } = await supabase.from('project_schedules').update({
          title: title.trim(),
          memo: (memo || '') + projectIdStr + nightFlag,
          scheduled_date: newDate,
          start_at: `${newDate}T${startHHMM}:00`,
          end_at: `${newDate}T${endHHMM}:00`,
        }).eq('id', editingSchedule.id);
        if (error) throw error;
      } else {
        const hasAny = Object.values(memberDates).some(s => s.size > 0);
        if (!hasAny) { Alert.alert('エラー', 'メンバーと参加日を選択してください'); setSaving(false); return; }

        const rows: any[] = [];
        for (const [userId, dates] of Object.entries(memberDates)) {
          for (const date of dates) {
            rows.push({
              project_id: projectId,
              title: title.trim(),
              memo: (memo || '') + nightFlag,
              user_id: userId,
              participant_user_id: userId,
              scheduled_date: date,
              start_at: `${date}T${startHHMM}:00`,
              end_at: `${date}T${endHHMM}:00`,
              created_by: profile?.id,
            });
          }
        }
        const { error } = await supabase.from('project_schedules').insert(rows);
        if (error) throw error;

        try {
          const loginRes = await fetch(`${CALENDAR_API}/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: 'admin@example.com', password: 'password' }),
          });
          const loginData = await loginRes.json();
          const calToken = loginData.token;
          const empRes = await fetch(`${CALENDAR_API}/employees`, { headers: { Authorization: `Bearer ${calToken}` } });
          const employees: { id: number; email: string }[] = await empRes.json();
          const emailToCalId: Record<string, number> = {};
          for (const e of employees) emailToCalId[e.email] = e.id;

          for (const row of rows) {
            const { data: prof } = await supabase.from('profiles').select('email').eq('id', row.user_id).single();
            const calUserId = prof?.email ? emailToCalId[prof.email] : null;
            if (!calUserId) continue;
            const memberObj = members.find(m => m.user_id === row.user_id);
            const initial = (memberObj?.profile?.full_name ?? '?')[0];
            await fetch(`${CALENDAR_API}/schedules`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${calToken}` },
              body: JSON.stringify({
                title: `${initial} ${projectName}`,
                start_at: row.start_at,
                end_at: row.end_at,
                description: [
                  row.memo || null,
                  `project_id:${projectId}`,
                  `project_name:${projectName}`,
                  `schedule_title:${row.title}`,
                  projectAddress ? `project_address:${projectAddress}` : null,
                ].filter(Boolean).join('\n'),
                user_id: calUserId,
              }),
            });
          }
        } catch (syncErr: any) {
          Alert.alert('同期エラー', syncErr?.message ?? JSON.stringify(syncErr));
        }
      }

      onSaved();
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={mStyles.overlay}>
        <ScrollView contentContainerStyle={mStyles.modal} keyboardShouldPersistTaps="handled">
          <Text style={mStyles.title}>{editingSchedule ? '予定を編集' : '予定を追加'}</Text>

          <TextInput style={mStyles.input} placeholder="タイトル" value={title} onChangeText={setTitle} />
          <TextInput style={[mStyles.input, { height: 60 }]} placeholder="メモ（任意）" value={memo} onChangeText={setMemo} multiline />

          {/* 時間設定 */}
          <Text style={mStyles.sectionLabel}>時間</Text>
          {/* 終日ボタン・夜勤ボタン */}
          <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
            <TouchableOpacity
              style={[mStyles.allDayBtn, { flex: 1 }, !isNightShift && { borderColor: '#1a56db', backgroundColor: '#eff6ff' }]}
              onPress={() => { setIsNightShift(false); setStartTime({ h: 8, m: 0 }); setEndTime({ h: 17, m: 0 }); }}
            >
              <Text style={[mStyles.allDayBtnText, { color: isNightShift ? '#9ca3af' : '#1a56db' }]}>☀️ 日勤（8:00〜17:00）</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[mStyles.allDayBtn, { flex: 1 }, isNightShift && { borderColor: '#dc2626', backgroundColor: '#fef2f2' }]}
              onPress={() => { setIsNightShift(true); setStartTime({ h: 22, m: 0 }); setEndTime({ h: 7, m: 0 }); }}
            >
              <Text style={[mStyles.allDayBtnText, { color: isNightShift ? '#dc2626' : '#9ca3af' }]}>🌙 夜勤（22:00〜7:00）</Text>
            </TouchableOpacity>
          </View>

          <View style={mStyles.timeRow}>
            <View style={mStyles.timeBlock}>
              <Text style={mStyles.timeLabel}>開始</Text>
              <TimePicker value={startTime} onChange={(h, m) => setStartTime({ h, m })} />
            </View>
            <Text style={mStyles.timeSep}>〜</Text>
            <View style={mStyles.timeBlock}>
              <Text style={mStyles.timeLabel}>終了</Text>
              <TimePicker value={endTime} onChange={(h, m) => setEndTime({ h, m })} />
            </View>
          </View>

          {/* メンバー選択 */}
          <Text style={[mStyles.sectionLabel, { marginTop: 12 }]}>参加メンバーを選択（複数可）</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <TouchableOpacity
              style={[mStyles.memberChip, allSelected && { borderColor: '#059669', backgroundColor: '#ecfdf5' }]}
              onPress={toggleAllMembers}
            >
              <Text style={[mStyles.chipName, allSelected && { color: '#059669' }]}>👥 全員</Text>
              {allSelected && <Text style={{ color: '#059669', marginLeft: 4, fontWeight: '800' }}>✓</Text>}
            </TouchableOpacity>
            {members.map((m, i) => {
              const isSelected = selectedMemberIds.has(m.user_id);
              const color = getUserColor(m.user_id);
              const dates = memberDates[m.user_id];
              return (
                <TouchableOpacity
                  key={m.user_id}
                  style={[mStyles.memberChip, isSelected && { borderColor: color, backgroundColor: color + '18' }]}
                  onPress={() => toggleMember(m.user_id)}
                >
                  <View style={[mStyles.chipAvatar, { backgroundColor: color }]}>
                    <Text style={mStyles.chipAvatarText}>{(m.profile?.full_name ?? '?')[0]}</Text>
                  </View>
                  <Text style={[mStyles.chipName, isSelected && { color }]}>{m.profile?.full_name ?? '不明'}</Text>
                  {isSelected && <Text style={{ color, marginLeft: 4, fontWeight: '800' }}>✓</Text>}
                  {dates && dates.size > 0 && (
                    <View style={[mStyles.chipBadge, { backgroundColor: color }]}>
                      <Text style={mStyles.chipBadgeText}>{dates.size}</Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {members.map((m, i) => {
            const dates = memberDates[m.user_id];
            if (!dates || dates.size === 0) return null;
            const color = getUserColor(m.user_id);
            return (
              <View key={m.user_id} style={mStyles.memberDateRow}>
                <Text style={[mStyles.memberDateName, { color }]}>{m.profile?.full_name}：</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {[...dates].sort().map(d => (
                    <TouchableOpacity key={d} style={[mStyles.dateTag, { borderColor: color }]} onPress={() => removeDate(m.user_id, d)}>
                      <Text style={[mStyles.dateTagText, { color }]}>{d.slice(5).replace('-', '/')} ✕</Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })}

          <Text style={[mStyles.sectionLabel, { marginTop: 8 }]}>
            {selectedMemberIds.size > 0 ? '日付をタップして参加日を追加' : '← まずメンバーを選択'}
          </Text>
          <View style={mStyles.calNav}>
            <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>
              <Text style={mStyles.calNavArrow}>◀</Text>
            </TouchableOpacity>
            <Text style={mStyles.calNavTitle}>{year}年{month + 1}月</Text>
            <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>
              <Text style={mStyles.calNavArrow}>▶</Text>
            </TouchableOpacity>
          </View>
          <View style={mStyles.weekRow}>
            {DAY_LABELS.map(d => <Text key={d} style={mStyles.weekLabel}>{d}</Text>)}
          </View>
          <View style={mStyles.grid}>
            {cells.map((day, i) => {
              const dateStr = day ? fmt(day) : '';
              const selected = day ? activeDates.has(dateStr) : false;
              const col = i % 7;
              return (
                <TouchableOpacity
                  key={i}
                  style={[mStyles.cell, selected && mStyles.cellSelected, selectedMemberIds.size === 0 && { opacity: 0.4 }]}
                  onPress={() => day && toggleDate(fmt(day))}
                  disabled={!day}
                >
                  {day ? (
                    <Text style={[mStyles.dayNum, selected && mStyles.dayNumSelected, col === 0 && { color: selected ? '#fff' : '#dc2626' }, col === 6 && { color: selected ? '#fff' : '#1a56db' }]}>{day}</Text>
                  ) : null}
                </TouchableOpacity>
              );
            })}
          </View>

          <View style={mStyles.btnRow}>
            <TouchableOpacity style={mStyles.cancelBtn} onPress={onClose}>
              <Text style={mStyles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={mStyles.saveBtn} onPress={handleSave} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={mStyles.saveBtnText}>保存</Text>}
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  navBtn: { padding: 8 },
  navArrow: { fontSize: 16, color: '#1a56db' },
  navTitle: { fontSize: 17, fontWeight: '800', color: '#111827' },
  weekRow: { flexDirection: 'row', backgroundColor: '#fff' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, fontWeight: '600', color: '#9ca3af', paddingVertical: 6 },
  sun: { color: '#dc2626' }, sat: { color: '#1a56db' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  cell: { width: `${100 / 7}%`, minHeight: 64, borderRightWidth: 1, borderBottomWidth: 1, borderColor: '#f3f4f6', padding: 4 },
  todayCell: { backgroundColor: '#eff6ff' },
  dayNum: { fontSize: 14, fontWeight: '600', color: '#374151' },
  todayNum: { color: '#1a56db', fontWeight: '800' },
  sunNum: { color: '#dc2626' }, satNum: { color: '#1a56db' },
  dots: { flexDirection: 'row', gap: 2, marginTop: 2 },
  dot: { width: 6, height: 6, borderRadius: 3 },
  scheduleTitle: { fontSize: 9, color: '#374151', marginTop: 2 },
  listSection: { padding: 16 },
  listTitle: { fontSize: 15, fontWeight: '800', color: '#374151', marginBottom: 12 },
  scheduleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 10 },
  scheduleAvatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', marginRight: 10 },
  scheduleAvatarText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  scheduleInfo: { flex: 1 },
  scheduleRowTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  scheduleDate: { fontSize: 12, color: '#9ca3af' },
  editBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#1a56db', marginLeft: 6 },
  editBtnText: { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  deleteBtn: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: '#dc2626', marginLeft: 4 },
  deleteBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
  addBtn: { backgroundColor: '#1a56db', margin: 16, borderRadius: 12, padding: 14, alignItems: 'center' },
  addBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});

const mStyles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 12 },
  input: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 15, marginBottom: 10, color: '#111827' },
  sectionLabel: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8 },
  allDayBtn: { backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#1a56db', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 12 },
  allDayBtnText: { color: '#1a56db', fontSize: 15, fontWeight: '700' },
  timeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around', marginBottom: 8 },
  timeBlock: { alignItems: 'center' },
  timeLabel: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginBottom: 4 },
  timeSep: { fontSize: 20, fontWeight: '800', color: '#374151', marginHorizontal: 8 },
  memberRow: { flexDirection: 'row', marginBottom: 8 },
  memberChip: { flexDirection: 'row', alignItems: 'center', borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 24, paddingHorizontal: 10, paddingVertical: 6, marginRight: 8, position: 'relative' },
  chipAvatar: { width: 24, height: 24, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 6 },
  chipAvatarText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  chipName: { fontSize: 13, fontWeight: '600', color: '#374151' },
  chipBadge: { position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: 8, justifyContent: 'center', alignItems: 'center' },
  chipBadgeText: { color: '#fff', fontSize: 9, fontWeight: '800' },
  dateTagRow: { flexDirection: 'row', marginBottom: 8 },
  dateTag: { backgroundColor: '#eff6ff', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 4, marginRight: 6, borderWidth: 1, borderColor: '#1a56db' },
  dateTagText: { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  memberDateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  memberDateName: { fontSize: 12, fontWeight: '700', marginRight: 6, minWidth: 50 },
  calNav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 8, marginBottom: 4 },
  calNavArrow: { fontSize: 16, color: '#1a56db', paddingHorizontal: 12 },
  calNavTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  weekRow: { flexDirection: 'row' },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 11, color: '#9ca3af', paddingVertical: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18 },
  cellSelected: { backgroundColor: '#1a56db' },
  dayNum: { fontSize: 14, fontWeight: '600', color: '#374151' },
  dayNumSelected: { color: '#fff', fontWeight: '800' },
  btnRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  cancelBtn: { flex: 1, padding: 14, borderRadius: 12, borderWidth: 1.5, borderColor: '#e5e7eb', alignItems: 'center' },
  cancelBtnText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  saveBtn: { flex: 1, padding: 14, borderRadius: 12, backgroundColor: '#1a56db', alignItems: 'center' },
  saveBtnText: { fontSize: 15, fontWeight: '700', color: '#fff' },
});
