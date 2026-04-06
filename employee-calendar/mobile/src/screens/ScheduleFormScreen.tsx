import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, TouchableOpacity,
  Switch, Alert, ScrollView, ActivityIndicator, Platform,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useNavigation, useRoute } from '@react-navigation/native';
import { useQueryClient } from '@tanstack/react-query';
import { createSchedule, updateSchedule } from '../api/schedules';
import { useAuthStore } from '../store/authStore';

const fmtDisplay = (d, allDay) => {
  const date = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}`;
  if (allDay) return date;
  return `${date} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
};
const toISO = (d, allDay, isEnd) => {
  const p = n => String(n).padStart(2,'0');
  const base = `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}`;
  if (allDay) return isEnd ? `${base}T23:59:59` : `${base}T00:00:00`;
  return `${base}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
};
const parseDate = (iso, fallback) => {
  if (!iso) return fallback;
  // タイムゾーン記号を除去してローカル時刻として解釈
  const local = iso.replace('Z', '').replace(/\+\d{2}:\d{2}$/, '').substring(0, 19);
  const d = new Date(local);
  return isNaN(d.getTime()) ? fallback : d;
};

export const ScheduleFormScreen = () => {
  const navigation = useNavigation();
  const { params } = useRoute();
  const schedule = params?.schedule;
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);
  const now = new Date();
  const _id = params?.initialDate;
  const initialDate = _id ? (() => { const d = new Date(now); const parts = _id.split('-'); d.setFullYear(+parts[0], +parts[1]-1, +parts[2]); return d; })() : now;
  const defaultEnd = new Date(now.getTime() + 3600000);
  const [title, setTitle] = useState(schedule?.title || '');
  const [description, setDescription] = useState(schedule?.description || '');
  const [startAt, setStartAt] = useState(parseDate(schedule?.start_at, initialDate));
  const [endAt, setEndAt] = useState(parseDate(schedule?.end_at, new Date(initialDate.getTime() + 3600000)));
  const [isAllDay, setIsAllDay] = useState(schedule?.is_all_day || false);
  const [loading, setLoading] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [pickerTarget, setPickerTarget] = useState('start');
  const [pickerMode, setPickerMode] = useState('date');

  const openPicker = (target) => { setPickerTarget(target); setPickerMode('date'); setShowPicker(true); };
  const onPickerChange = (event, selected) => {
    if (event.type === 'dismissed' || !selected) { setShowPicker(false); return; }
    if (pickerTarget === 'start') { setStartAt(selected); setEndAt(new Date(selected.getTime() + 3600000)); } else { setEndAt(selected); }
    if (!isAllDay && pickerMode === 'date') { setPickerMode('time'); } else { setShowPicker(false); }
  };

  const handleSave = async () => {
    if (!title) { Alert.alert('エラー', 'タイトルを入力してください'); return; }
    setLoading(true);
    try {
      const data = { title, description: description || undefined, start_at: toISO(startAt, isAllDay, false), end_at: toISO(endAt, isAllDay, true), is_all_day: isAllDay, user_id: params?.userId || user?.id };
      if (schedule) { await updateSchedule(schedule.id, data); } else { await createSchedule(data); }
      await queryClient.refetchQueries({ queryKey: ['schedules'] });
      navigation.navigate('Main' as any);
    } catch { Alert.alert('エラー', '保存に失敗しました'); } finally { setLoading(false); }
  };

  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      <View style={{ padding: 20 }}>
        <Text style={styles.label}>タイトル *</Text>
        <TextInput style={styles.input} value={title} onChangeText={setTitle} placeholder="例: チームミーティング" />
        <Text style={styles.label}>メモ</Text>
        <TextInput style={[styles.input, { height: 80, textAlignVertical: 'top' }]} value={description} onChangeText={setDescription} placeholder="詳細・備考" multiline numberOfLines={3} />
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 }}>
          <Text style={styles.label}>終日</Text>
          <Switch value={isAllDay} onValueChange={setIsAllDay} trackColor={{ true: '#3B82F6' }} />
        </View>
        <Text style={styles.label}>開始{isAllDay ? '日付' : '日時'}</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => openPicker('start')}>
          <Text style={styles.dateText}>{fmtDisplay(startAt, isAllDay)}</Text>
        </TouchableOpacity>
        <Text style={styles.label}>終了{isAllDay ? '日付' : '日時'}</Text>
        <TouchableOpacity style={styles.dateButton} onPress={() => openPicker('end')}>
          <Text style={styles.dateText}>{fmtDisplay(endAt, isAllDay)}</Text>
        </TouchableOpacity>
        {showPicker && (
          <DateTimePicker value={pickerTarget === 'start' ? startAt : endAt} mode={isAllDay ? 'date' : pickerMode} display={Platform.OS === 'ios' ? 'spinner' : 'default'} onChange={onPickerChange} />
        )}
        <TouchableOpacity style={styles.saveButton} onPress={handleSave} disabled={loading}>
          {loading ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>{schedule ? '更新' : '保存'}</Text>}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  label: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 14 },
  input: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15 },
  dateButton: { backgroundColor: '#fff', borderWidth: 1, borderColor: '#3B82F6', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 14 },
  dateText: { fontSize: 15, color: '#1D4ED8', fontWeight: '500' },
  saveButton: { backgroundColor: '#3B82F6', borderRadius: 10, padding: 16, alignItems: 'center', marginTop: 32 },
});

