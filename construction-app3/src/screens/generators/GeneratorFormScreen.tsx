import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, Alert, ActivityIndicator, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { createCase, updateCase, fetchCase, fetchGenerators, Generator, GeneratorCase } from '../../lib/generators';

const C = '#1D9E75';

const WORK_TYPES = [
  { key: '負荷試験', icon: '⚡', desc: '負荷試・験報告書' },
  { key: '点検',   icon: '🔍', desc: '点検報告書' },
  { key: '修理',   icon: '🔧', desc: '修理報告書' },
  { key: 'その他', icon: '📋', desc: '報告書' },
];

const STATUS_LIST = [
  { value: 'draft', label: '下書き' },
  { value: 'active', label: '実施中' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: '中止' },
];

interface Props { route: any; navigation: any; }

export default function GeneratorFormScreen({ route, navigation }: Props) {
  const { caseId } = route.params ?? {};
  const isEdit = !!caseId;

  // 新規作成時は Step1（作業種別選択）から開始
  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [saving, setSaving] = useState(false);
  const [generators, setGenerators] = useState<Generator[]>([]);
  const [selectedGen, setSelectedGen] = useState<Generator | null>(null);
  const [members, setMembers] = useState<{ id: string; full_name: string }[]>([]);
  const [form, setForm] = useState({
    name: '', address: '', client_name: '',
    work_type: '負荷試験', work_date: '', staff_name: '', status: 'draft',
    gen_model: '', gen_rated_output_kw: '', gen_rated_voltage_v: '',
    gen_rated_current_a: '', gen_manufacturer: '', gen_serial_number: '',
    gen_installed_at: '', gen_battery_model: '', gen_battery_count: '',
    result_comment: '', next_scheduled_date: '',
  });

  useEffect(() => {
    navigation.setOptions({ title: isEdit ? '案件編集' : '新規案件登録' });
    fetchGenerators().then(setGenerators).catch(() => {});
    supabase.from('profiles').select('id, full_name').order('full_name')
      .then(({ data }) => setMembers(data ?? []));
    if (isEdit) {
      fetchCase(caseId).then(c => {
        if (!c) return;
        setForm({
          name: c.name ?? '', address: c.address ?? '', client_name: c.client_name ?? '',
          work_type: c.work_type ?? '負荷試験', work_date: c.work_date ?? '',
          staff_name: c.staff_name ?? '', status: c.status ?? 'draft',
          gen_model: c.gen_model ?? '', gen_rated_output_kw: String(c.gen_rated_output_kw ?? ''),
          gen_rated_voltage_v: String(c.gen_rated_voltage_v ?? ''),
          gen_rated_current_a: String(c.gen_rated_current_a ?? ''),
          gen_manufacturer: c.gen_manufacturer ?? '', gen_serial_number: c.gen_serial_number ?? '',
          gen_installed_at: c.gen_installed_at ?? '', gen_battery_model: c.gen_battery_model ?? '',
          gen_battery_count: String(c.gen_battery_count ?? ''),
          result_comment: c.result_comment ?? '', next_scheduled_date: c.next_scheduled_date ?? '',
        });
      });
    }
  }, [caseId]);

  const applyGenerator = (gen: Generator) => {
    setSelectedGen(gen);
    setForm(f => ({
      ...f,
      gen_model: gen.model ?? '', gen_rated_output_kw: String(gen.rated_output_kw ?? ''),
      gen_rated_voltage_v: String(gen.rated_voltage_v ?? ''),
      gen_rated_current_a: String(gen.rated_current_a ?? ''),
      gen_manufacturer: gen.manufacturer ?? '', gen_serial_number: gen.serial_number ?? '',
      gen_installed_at: gen.installed_at ?? '', gen_battery_model: gen.battery_model ?? '',
      gen_battery_count: String(gen.battery_count ?? ''),
      client_name: gen.client_name ?? f.client_name, address: gen.location ?? f.address,
    }));
  };

  const handleSave = async () => {
    if (!form.name.trim()) { Alert.alert('案件名を入力してください'); return; }
    setSaving(true);
    try {
      const payload: Partial<GeneratorCase> = {
        name: form.name.trim(),
        address: form.address.trim() || null,
        client_name: form.client_name.trim() || null,
        work_type: form.work_type as any,
        work_date: form.work_date || null,
        staff_name: form.staff_name || null,
        status: form.status as any,
        generator_id: selectedGen?.id ?? null,
        gen_model: form.gen_model || null,
        gen_rated_output_kw: form.gen_rated_output_kw ? Number(form.gen_rated_output_kw) : null,
        gen_rated_voltage_v: form.gen_rated_voltage_v ? Number(form.gen_rated_voltage_v) : null,
        gen_rated_current_a: form.gen_rated_current_a ? Number(form.gen_rated_current_a) : null,
        gen_manufacturer: form.gen_manufacturer || null,
        gen_serial_number: form.gen_serial_number || null,
        gen_installed_at: form.gen_installed_at || null,
        gen_battery_model: form.gen_battery_model || null,
        gen_battery_count: form.gen_battery_count ? Number(form.gen_battery_count) : null,
        result_comment: form.result_comment || null,
        next_scheduled_date: form.next_scheduled_date || null,
        contractor: '有限会社三幸',
      };
      if (isEdit) {
        await updateCase(caseId, payload);
        navigation.goBack();
      } else {
        const created = await createCase(payload);
        // 保存後は詳細画面へ（報告書入力へ進む）
        navigation.replace('GeneratorDetail', { caseId: (created as any)?.id ?? '' });
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '保存に失敗しました');
    } finally { setSaving(false); }
  };

  const set = (key: string) => (val: string) => setForm(f => ({ ...f, [key]: val }));

  // ─── STEP 1: 作業種別選択 ───
  if (step === 1) {
    return (
      <View style={styles.stepContainer}>
        <View style={styles.stepHeader}>
          <Text style={styles.stepTitle}>新規案件登録</Text>
          <Text style={styles.stepSubtitle}>作業種別を選択してください</Text>
          <View style={styles.stepFlowRow}>
            <View style={[styles.stepBadge, styles.stepBadgeActive]}>
              <Text style={styles.stepBadgeText}>1</Text>
            </View>
            <View style={styles.stepLine} />
            <View style={styles.stepBadge}>
              <Text style={[styles.stepBadgeText, { color: '#9ca3af' }]}>2</Text>
            </View>
          </View>
          <View style={styles.stepLabelRow}>
            <Text style={[styles.stepLabel, { color: C }]}>作業種別</Text>
            <Text style={[styles.stepLabel, { color: '#9ca3af', marginLeft: 40 }]}>基本情報</Text>
          </View>
        </View>

        <View style={styles.workTypeGrid}>
          {WORK_TYPES.map(t => {
            const active = form.work_type === t.key;
            return (
              <TouchableOpacity
                key={t.key}
                style={[styles.workTypeCard, active && styles.workTypeCardActive]}
                onPress={() => setForm(f => ({ ...f, work_type: t.key }))}
                activeOpacity={0.7}
              >
                <Text style={styles.workTypeIcon}>{t.icon}</Text>
                <Text style={[styles.workTypeLabel, active && styles.workTypeLabelActive]}>{t.key}</Text>
                <Text style={[styles.workTypeDesc, active && { color: C }]}>{t.desc}</Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <TouchableOpacity
          style={styles.nextBtn}
          onPress={() => setStep(2)}
          activeOpacity={0.8}
        >
          <Text style={styles.nextBtnText}>次へ　基本情報を入力 →</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ─── STEP 2: 基本情報・発電機情報入力 ───
  const selectedWorkType = WORK_TYPES.find(t => t.key === form.work_type);

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">

      {/* 選択中の作業種別バナー */}
      {!isEdit && (
        <TouchableOpacity style={styles.workTypeBanner} onPress={() => setStep(1)}>
          <Text style={styles.workTypeBannerIcon}>{selectedWorkType?.icon}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.workTypeBannerLabel}>{form.work_type}</Text>
            <Text style={styles.workTypeBannerSub}>{selectedWorkType?.desc} を作成します</Text>
          </View>
          <Text style={styles.workTypeBannerChange}>変更</Text>
        </TouchableOpacity>
      )}

      {/* 既存発電機から自動入力 */}
      {generators.length > 0 && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>既存発電機から自動入力</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
            {generators.map(g => (
              <TouchableOpacity key={g.id} style={[styles.genChip, selectedGen?.id === g.id && styles.genChipActive]} onPress={() => applyGenerator(g)}>
                <Text style={[styles.genChipText, selectedGen?.id === g.id && styles.genChipTextActive]}>{g.name}</Text>
                {g.model ? <Text style={styles.genChipSub}>{g.model}</Text> : null}
              </TouchableOpacity>
            ))}
          </ScrollView>
        </View>
      )}

      {/* 基本情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>基本情報</Text>
        <Text style={styles.label}>案件名 *</Text>
        <TextInput style={styles.input} value={form.name} onChangeText={set('name')} placeholder="例：〇〇ビル 負荷試験" />
        <Text style={styles.label}>住所</Text>
        <TextInput style={styles.input} value={form.address} onChangeText={set('address')} />
        <Text style={styles.label}>顧客名</Text>
        <TextInput style={styles.input} value={form.client_name} onChangeText={set('client_name')} />
        <Text style={styles.label}>作業日</Text>
        <TextInput style={styles.input} value={form.work_date} onChangeText={set('work_date')} placeholder="YYYY-MM-DD" />
        <Text style={styles.label}>担当者</Text>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {members.map(m => (
            <TouchableOpacity key={m.id} style={[styles.memberChip, form.staff_name === m.full_name && styles.memberChipActive]}
              onPress={() => setForm(f => ({ ...f, staff_name: f.staff_name === m.full_name ? '' : m.full_name }))}>
              <Text style={[styles.memberChipText, form.staff_name === m.full_name && styles.memberChipTextActive]}>{m.full_name}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        <Text style={styles.label}>ステータス</Text>
        <View style={styles.chipRow}>
          {STATUS_LIST.map(s => (
            <TouchableOpacity key={s.value} style={[styles.chip, form.status === s.value && styles.chipActive]} onPress={() => setForm(f => ({ ...f, status: s.value }))}>
              <Text style={[styles.chipText, form.status === s.value && styles.chipTextActive]}>{s.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* 発電機情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>発電機情報</Text>
        {[
          { key: 'gen_model', label: '型式' },
          { key: 'gen_rated_output_kw', label: '定格出力（kW）' },
          { key: 'gen_rated_voltage_v', label: '定格電圧（V）' },
          { key: 'gen_rated_current_a', label: '定格電流（A）' },
          { key: 'gen_manufacturer', label: 'メーカー' },
          { key: 'gen_serial_number', label: '製造番号' },
          { key: 'gen_installed_at', label: '設置年月日' },
          { key: 'gen_battery_model', label: '蓄電池型式' },
          { key: 'gen_battery_count', label: '蓄電池個数' },
        ].map(({ key, label }) => (
          <View key={key}>
            <Text style={styles.label}>{label}</Text>
            <TextInput style={styles.input} value={(form as any)[key]} onChangeText={set(key)} />
          </View>
        ))}
      </View>

      {/* 備考 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>備考</Text>
        <TextInput style={[styles.input, { height: 80 }]} value={form.result_comment} onChangeText={set('result_comment')} multiline placeholder="特記事項など" />
        <Text style={styles.label}>次回点検予定日</Text>
        <TextInput style={styles.input} value={form.next_scheduled_date} onChangeText={set('next_scheduled_date')} placeholder="YYYY-MM-DD" />
      </View>

      <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.6 }]} onPress={handleSave} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : (
          <Text style={styles.saveBtnText}>
            {isEdit ? '💾 保存する' : `💾 登録して${form.work_type}報告書へ進む`}
          </Text>
        )}
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // Step1
  stepContainer: { flex: 1, backgroundColor: '#f0fdf9', padding: 20 },
  stepHeader: { alignItems: 'center', marginBottom: 32, marginTop: 16 },
  stepTitle: { fontSize: 22, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  stepSubtitle: { fontSize: 14, color: '#64748b', marginBottom: 20 },
  stepFlowRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  stepBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: '#e2e8f0', alignItems: 'center', justifyContent: 'center' },
  stepBadgeActive: { backgroundColor: C },
  stepBadgeText: { fontSize: 13, fontWeight: '700', color: '#fff' },
  stepLine: { width: 60, height: 2, backgroundColor: '#e2e8f0', marginHorizontal: 8 },
  stepLabelRow: { flexDirection: 'row', marginTop: 4 },
  stepLabel: { fontSize: 12, fontWeight: '600' },
  workTypeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  workTypeCard: {
    width: '47%', alignItems: 'center', paddingVertical: 24, paddingHorizontal: 12,
    backgroundColor: '#fff', borderRadius: 16, borderWidth: 2, borderColor: '#e2e8f0',
    shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 8, elevation: 2,
  },
  workTypeCardActive: { borderColor: C, backgroundColor: '#f0fdf9' },
  workTypeIcon: { fontSize: 36, marginBottom: 10 },
  workTypeLabel: { fontSize: 16, fontWeight: '800', color: '#64748b', marginBottom: 4 },
  workTypeLabelActive: { color: C },
  workTypeDesc: { fontSize: 11, color: '#94a3b8', textAlign: 'center' },
  nextBtn: {
    marginTop: 32, backgroundColor: C, borderRadius: 14, paddingVertical: 16,
    alignItems: 'center', shadowColor: C, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4,
  },
  nextBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  // Step2
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: { padding: 16, paddingBottom: 60 },
  workTypeBanner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff',
    borderRadius: 12, padding: 14, marginBottom: 16, borderWidth: 2, borderColor: C,
  },
  workTypeBannerIcon: { fontSize: 28, marginRight: 12 },
  workTypeBannerLabel: { fontSize: 16, fontWeight: '800', color: C },
  workTypeBannerSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  workTypeBannerChange: { fontSize: 12, color: C, fontWeight: '700', paddingHorizontal: 10, paddingVertical: 4, borderWidth: 1, borderColor: C, borderRadius: 8 },
  section: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C, marginBottom: 12 },
  label: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4, marginTop: 8 },
  input: { backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 4 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: C, borderColor: C },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  genChip: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#d1fae5', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, marginRight: 8, minWidth: 100 },
  genChipActive: { backgroundColor: C, borderColor: C },
  genChipText: { fontSize: 13, fontWeight: '700', color: '#065f46' },
  genChipTextActive: { color: '#fff' },
  genChipSub: { fontSize: 11, color: '#6b7280', marginTop: 2 },
  memberChip: { backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 16, paddingHorizontal: 12, paddingVertical: 6, marginRight: 6 },
  memberChipActive: { backgroundColor: C, borderColor: C },
  memberChipText: { fontSize: 13, color: '#374151' },
  memberChipTextActive: { color: '#fff', fontWeight: '600' },
  saveBtn: { backgroundColor: C, borderRadius: 12, paddingVertical: 16, alignItems: 'center', marginTop: 8 },
  saveBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
});
