import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Alert, Platform } from 'react-native';
import { fetchCase, deleteCase, GeneratorCase } from '../../lib/generators';
import LoadingOverlay from '../../components/LoadingOverlay';
const C = '#1D9E75';
const STATUS_MAP: Record<string, { label: string; color: string }> = {
  draft: { label: '下書き', color: '#9ca3af' }, active: { label: '実施中', color: C },
  completed: { label: '完了', color: '#3b82f6' }, cancelled: { label: '中止', color: '#ef4444' },
};
interface Props { route: any; navigation: any; }
export default function GeneratorDetailScreen({ route, navigation }: Props) {
  const { caseId } = route.params;
  const [c, setC] = useState<GeneratorCase | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    fetchCase(caseId).then(data => { setC(data); navigation.setOptions({ title: data?.name ?? '案件詳細' }); }).finally(() => setLoading(false));
  }, [caseId]);
  if (loading) return <LoadingOverlay />;
  if (!c) return <View style={s.center}><Text>案件が見つかりません</Text></View>;
  const st = STATUS_MAP[c.status] ?? STATUS_MAP.draft;
  const handleDelete = () => {
    const doDelete = async () => { await deleteCase(c.id); navigation.goBack(); };
    if (Platform.OS === 'web') { if (window.confirm(`「${c.name}」を削除しますか？`)) doDelete(); }
    else Alert.alert('削除確認', `「${c.name}」を削除しますか？`, [{ text: 'キャンセル', style: 'cancel' }, { text: '削除', style: 'destructive', onPress: doDelete }]);
  };
  const Row = ({ label, value }: { label: string; value?: string | number | null }) =>
    value ? <View style={s.row}><Text style={s.rowLabel}>{label}</Text><Text style={s.rowValue}>{String(value)}</Text></View> : null;
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content}>
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={s.title}>{c.name}</Text>
          <View style={[s.statusChip, { backgroundColor: st.color }]}><Text style={s.statusChipText}>{st.label}</Text></View>
        </View>
        <View style={s.headerBtns}>
          <TouchableOpacity style={s.editBtn} onPress={() => navigation.navigate('GeneratorForm', { caseId: c.id })}><Text style={s.editBtnText}>編集</Text></TouchableOpacity>
          <TouchableOpacity style={s.deleteBtn} onPress={handleDelete}><Text style={s.deleteBtnText}>削除</Text></TouchableOpacity>
        </View>
      </View>
      <View style={s.actionRow}>
        <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('GeneratorProcess', { caseId: c.id })}><Text style={s.actionBtnText}>📋 工程表</Text></TouchableOpacity>
        <TouchableOpacity style={s.actionBtn} onPress={() => navigation.navigate('GeneratorCalendar', {})}><Text style={s.actionBtnText}>📅 年間カレンダー</Text></TouchableOpacity>
      </View>
      <View style={s.section}><Text style={s.sectionTitle}>基本情報</Text>
        <Row label="作業種別" value={c.work_type} /><Row label="作業日" value={c.work_date} />
        <Row label="住所" value={c.address} /><Row label="顧客名" value={c.client_name} />
        <Row label="担当者" value={c.staff_name} /><Row label="次回点検予定日" value={c.next_scheduled_date} />
      </View>
      <View style={s.section}><Text style={s.sectionTitle}>発電機情報</Text>
        <Row label="型式" value={c.gen_model} />
        <Row label="定格出力" value={c.gen_rated_output_kw ? `${c.gen_rated_output_kw} kW` : null} />
        <Row label="定格電圧" value={c.gen_rated_voltage_v ? `${c.gen_rated_voltage_v} V` : null} />
        <Row label="メーカー" value={c.gen_manufacturer} /><Row label="製造番号" value={c.gen_serial_number} />
      </View>
      {c.work_date && c.staff_name && (
        <View style={[s.section, { backgroundColor: '#f0fdf4' }]}>
          <Text style={[s.sectionTitle, { color: C }]}>📅 社員カレンダー連動</Text>
          <Text style={s.syncText}>{c.staff_name} さんの {c.work_date} に「⚡ {c.work_type}：{c.name}」が登録されています</Text>
        </View>
      )}
    </ScrollView>
  );
}
const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' }, content: { padding: 16, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  title: { fontSize: 18, fontWeight: '800', color: '#111827', marginBottom: 8, flex: 1 },
  statusChip: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10 },
  statusChipText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  headerBtns: { flexDirection: 'row', gap: 8, marginLeft: 8 },
  editBtn: { backgroundColor: C, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  editBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  deleteBtn: { borderWidth: 1, borderColor: '#ef4444', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  deleteBtnText: { color: '#ef4444', fontWeight: '700', fontSize: 13 },
  actionRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  actionBtn: { flex: 1, backgroundColor: '#fff', borderRadius: 10, paddingVertical: 14, alignItems: 'center', borderWidth: 1, borderColor: '#d1fae5', shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 2, elevation: 1 },
  actionBtnText: { fontSize: 14, fontWeight: '700', color: C },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: C, marginBottom: 10 },
  row: { flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  rowLabel: { width: 120, fontSize: 13, color: '#6b7280', fontWeight: '600' },
  rowValue: { flex: 1, fontSize: 13, color: '#111827' },
  syncText: { fontSize: 13, color: '#065f46', lineHeight: 20 },
});
