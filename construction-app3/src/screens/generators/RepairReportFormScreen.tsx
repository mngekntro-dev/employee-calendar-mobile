// ============================================================
// F-3: 修理報告書入力フォーム (RepairReportFormScreen)
// 台帳詳細 (GeneratorDetailScreen) → RepairReportForm で遷移
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform,
  ActionSheetIOS, Image,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { resizeAndUploadRepairPhoto, deleteRepairPhoto } from '../../lib/repairPhotoStorage';
import { fetchCase, GeneratorCase, getCaseStaffFieldByWorkType, getCaseStaffNameByWorkType, getCalendarSyncErrorMessage, syncToCalendar } from '../../lib/generators';
import { CalendarPicker, DateBox } from '../../components/CalendarPicker';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useAuth } from '../../context/AuthContext';
import { FailureLocation, RepairUrgency, RepairResultType } from '../../types';
import { exportRepairReportExcel } from '../../lib/exportRepairReport';

const C = '#1D9E75';

// ─── 担当者事業部ロジック ────────────────────────────────────
const DEPARTMENTS = ['電気工事事業部', '発電機事業部', '経理部'] as const;
type Department = typeof DEPARTMENTS[number];

/** メンバーが指定の事業部に属するか判定する。
 *  - department カラムが設定されていれば完全一致で判定
 *  - department が未設定 (null/空) の場合は担当者リストに表示しない (false を返す)
 */
function memberBelongsToDept(
  member: { full_name: string; company_id?: string | null; department?: string | null },
  dept: Department,
  _currentUserCompanyId: string | null
): boolean {
  const d = member.department?.trim();
  if (d === '発電機事業部' || d === '電気工事事業部' || d === '経理部') {
    return d === dept;
  }
  // department 未設定のメンバーは担当者リストに表示しない
  return false;
}

const STATUS_LIST = [
  { value: 'draft',     label: '下書き' },
  { value: 'active',   label: '実施中' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: '中止' },
] as const;
type CaseStatus = typeof STATUS_LIST[number]['value'];

const FAILURE_LOCATIONS: FailureLocation[] = ['エンジン', '制御盤', '蓄電池', '燃料系統', '冷却系統', 'その他'];
const URGENCY_OPTIONS: RepairUrgency[] = ['通常', '急ぎ', '緊急'];
const REPAIR_RESULTS: RepairResultType[] = ['修理完了', '応急処置', '部品待ち', '要追加修理'];

// 写真ラベル（修理前・作業中・修理後）
const PHOTO_LABELS = ['修理前', '作業中', '修理後'] as const;
type PhotoLabel = (typeof PHOTO_LABELS)[number];
const PHOTO_KEY_MAP: Record<PhotoLabel, 'photo_before_url' | 'photo_during_url' | 'photo_after_url'> = {
  '修理前': 'photo_before_url',
  '作業中': 'photo_during_url',
  '修理後': 'photo_after_url',
};

interface FormState {
  // 基本情報
  subject:        string;
  address:        string;
  work_date:      string;
  staff_name:     string;
  contractor:     string;
  // 発電機情報
  gen_model:             string;
  gen_rated_output_kw:   string;
  output_unit: 'kva' | 'kw';
  gen_manufacturer:      string;
  gen_serial_number:     string;
  // 故障・修理情報
  failure_date:          string;
  repair_date:           string;
  failure_location:      FailureLocation;
  urgency:               RepairUrgency;
  failure_symptom:       string;
  failure_cause:         string;
  repair_work:           string;
  repair_parts:          string;
  repair_result:         RepairResultType;
  next_inspection_date:  string;
  notes:                 string;
  // 写真URL（3枚固定）
  photo_before_url:      string;
  photo_during_url:      string;
  photo_after_url:       string;
}

const INITIAL_FORM: FormState = {
  subject: '', address: '', work_date: '', staff_name: '', contractor: '',
  gen_model: '', gen_rated_output_kw: '', output_unit: 'kw', gen_manufacturer: '', gen_serial_number: '',
  failure_date: '', repair_date: '',
  failure_location: '', urgency: '通常',
  failure_symptom: '', failure_cause: '',
  repair_work: '', repair_parts: '',
  repair_result: '', next_inspection_date: '', notes: '',
  photo_before_url: '', photo_during_url: '', photo_after_url: '',
};

interface Props { route: any; navigation: any; }

export default function RepairReportFormScreen({ route, navigation }: Props) {
  const { caseId, recordId } = route.params as { caseId: string; recordId?: string };
  const { profile } = useAuth();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [caseStatus, setCaseStatus] = useState<CaseStatus>('draft');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showFailureDateCal, setShowFailureDateCal] = useState(false);
  const [showNextInspCal, setShowNextInspCal] = useState(false);
  const [showRepairDateCal, setShowRepairDateCal] = useState(false);
  const [uploading, setUploading] = useState<PhotoLabel | null>(null);
  const [showWorkDateCal, setShowWorkDateCal] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // 担当者選択
  const [members, setMembers] = useState<{ id: string; full_name: string; company_id?: string | null; department?: string | null }[]>([]);
  const [selectedStaffNames, setSelectedStaffNames] = useState<string[]>([]);
  const [expandedDept, setExpandedDept] = useState<Department | null>('電気工事事業部');

  const loadCase = useCallback(async () => {
    try {
      const c: GeneratorCase | null = await fetchCase(caseId);
      if (!c) return;
      if (c.status) setCaseStatus(c.status as CaseStatus);
      const initialStaffName = getCaseStaffNameByWorkType(c, '修理');
      if (initialStaffName) {
        setSelectedStaffNames(
          initialStaffName.split(',').map((s: string) => s.trim()).filter(Boolean)
        );
      }
      setForm(prev => ({
        ...prev,
        subject:             c.name ?? '',
        address:             c.address ?? '',
        staff_name:          c.staff_name ?? '',
        contractor:          c.contractor ?? '',
        gen_model:           c.gen_model ?? '',
        gen_rated_output_kw: c.gen_rated_output_kw != null ? String(c.gen_rated_output_kw) : '',
        output_unit:         c.output_unit === 'kva' ? 'kva' : 'kw',
        gen_manufacturer:    c.gen_manufacturer ?? '',
        gen_serial_number:   c.gen_serial_number ?? '',
      }));
    } catch (e: any) { setFetchError(e?.message ?? '台帳データの読み込みに失敗しました'); }
  }, [caseId]);

  const [currentRecordId, setCurrentRecordId] = useState<string | undefined>(recordId);

  const loadRecord = useCallback(async () => {
    try {
      let query = supabase.from('repair_reports').select('*');
      if (currentRecordId) {
        query = query.eq('id', currentRecordId);
      } else {
        query = query.eq('case_id', caseId);
      }
      const { data, error } = await query.maybeSingle();
      if (error || !data) return;
      setCurrentRecordId(data.id);
      setForm({
        subject:              data.subject ?? '',
        address:              data.address ?? '',
        work_date:            data.work_date ?? '',
        staff_name:           data.staff_name ?? '',
        contractor:           data.contractor ?? '',
        gen_model:            data.gen_model ?? '',
        gen_rated_output_kw:  data.gen_rated_output_kw != null ? String(data.gen_rated_output_kw) : '',
        output_unit:          data.output_unit === 'kva' ? 'kva' : 'kw',
        gen_manufacturer:     data.gen_manufacturer ?? '',
        gen_serial_number:    data.gen_serial_number ?? '',
        failure_date:         data.failure_date ?? '',
        repair_date:          data.repair_date ?? '',
        failure_location:     (data.failure_location ?? '') as FailureLocation,
        urgency:              (data.urgency ?? '通常') as RepairUrgency,
        failure_symptom:      data.failure_symptom ?? '',
        failure_cause:        data.failure_cause ?? '',
        repair_work:          data.repair_work ?? '',
        repair_parts:         data.repair_parts ?? '',
        repair_result:        (data.repair_result ?? '') as RepairResultType,
        next_inspection_date: data.next_inspection_date ?? '',
        notes:                data.notes ?? '',
        photo_before_url:     data.photo_before_url ?? '',
        photo_during_url:     data.photo_during_url ?? '',
        photo_after_url:      data.photo_after_url ?? '',
      });
    } catch (e: any) { setFetchError(e?.message ?? '修理報告書の読み込みに失敗しました'); }
  }, [currentRecordId, caseId]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      await loadCase();
      await loadRecord();
      setLoading(false);
    })();

    // 担当者一覧を取得
    supabase
      .from('profiles')
      .select('id, full_name, company_id, department')
      .order('full_name')
      .then(({ data }) => setMembers(data ?? []));
  }, [loadCase, loadRecord]);

  const set = (key: keyof FormState, value: string) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // ── 写真アップロード（即時アップロード・Storageへ） ──
  async function pickPhotoForLabel(label: PhotoLabel, useCamera: boolean) {
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('権限が必要です'); return; }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.9, allowsEditing: false });

    if (result.canceled || !result.assets?.[0]) return;

    setUploading(label);
    try {
      const asset = result.assets[0];
      const url = await resizeAndUploadRepairPhoto({ caseId, label, localUri: asset.uri });
      set(PHOTO_KEY_MAP[label], url);
    } catch (e: any) {
      const msg = e.message ?? 'アップロードに失敗しました';
      if (Platform.OS === 'web') window.alert('エラー: ' + msg);
      else Alert.alert('エラー', msg);
    } finally {
      setUploading(null);
    }
  }

  // Web用: file input経由でのアップロード
  async function pickPhotoWeb(label: PhotoLabel) {
    return new Promise<void>((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.onchange = async (e: Event) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (!file) { resolve(); return; }
        setUploading(label);
        try {
          const localUri = URL.createObjectURL(file);
          const url = await resizeAndUploadRepairPhoto({ caseId, label, localUri });
          set(PHOTO_KEY_MAP[label], url);
        } catch (ex: any) {
          window.alert('エラー: ' + (ex.message ?? 'アップロードに失敗しました'));
        } finally {
          setUploading(null);
        }
        resolve();
      };
      input.click();
    });
  }

  async function handleDeletePhoto(label: PhotoLabel) {
    const urlKey = PHOTO_KEY_MAP[label];
    const currentUrl = form[urlKey];
    if (!currentUrl) return;

    const doDelete = async () => {
      setUploading(label);
      try {
        await deleteRepairPhoto({ caseId, label });
        set(urlKey, '');
        // DBのURL列もnullに更新（recordIdがある場合）
        if (currentRecordId) {
          await supabase.from('repair_reports').update({ [urlKey]: null }).eq('id', currentRecordId);
        }
      } catch (e: any) {
        const msg = e.message ?? '削除に失敗しました';
        if (Platform.OS === 'web') window.alert('エラー: ' + msg);
        else Alert.alert('エラー', msg);
      } finally {
        setUploading(null);
      }
    };

    if (Platform.OS === 'web') {
      if (window.confirm(`「${label}」の写真を削除しますか？`)) doDelete();
    } else {
      Alert.alert('削除確認', `「${label}」の写真を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  function showPhotoOptions(label: PhotoLabel) {
    if (Platform.OS === 'web') {
      pickPhotoWeb(label);
      return;
    }
    if (Platform.OS === 'ios') {
      const hasPhoto = !!form[PHOTO_KEY_MAP[label]];
      const options = ['キャンセル', '写真撮影', 'ギャラリーから選択', ...(hasPhoto ? ['削除'] : [])];
      ActionSheetIOS.showActionSheetWithOptions(
        { options, cancelButtonIndex: 0, destructiveButtonIndex: hasPhoto ? 3 : undefined },
        i => {
          if (i === 1) pickPhotoForLabel(label, true);
          if (i === 2) pickPhotoForLabel(label, false);
          if (i === 3 && hasPhoto) handleDeletePhoto(label);
        }
      );
    } else {
      const actions: any[] = [
        { text: 'キャンセル', style: 'cancel' },
        { text: '写真撮影', onPress: () => pickPhotoForLabel(label, true) },
        { text: 'ギャラリーから選択', onPress: () => pickPhotoForLabel(label, false) },
      ];
      Alert.alert(`写真 (${label})`, '', actions);
    }
  }

  // ── プルダウン表示ヘルパー ──
  function showOptions<T extends string>(
    title: string, options: T[], onSelect: (v: T) => void
  ) {
    if (Platform.OS === 'web') {
      const msg = options.map((o, i) => `${i + 1}. ${o}`).join('\n');
      const input = window.prompt(`${title}\n番号を入力してください:\n${msg}`);
      if (input) {
        const idx = parseInt(input, 10) - 1;
        if (idx >= 0 && idx < options.length) onSelect(options[idx]);
      }
    } else if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['キャンセル', ...options], cancelButtonIndex: 0 },
        i => { if (i > 0) onSelect(options[i - 1]); }
      );
    } else {
      Alert.alert(title, '選択してください', [
        { text: 'キャンセル', style: 'cancel' },
        ...options.map(opt => ({ text: opt, onPress: () => onSelect(opt) })),
      ]);
    }
  }

  // ── 保存 ──
  async function save() {
    if (!form.repair_work.trim()) {
      if (Platform.OS === 'web') {
        window.alert('修理作業内容は必須です');
      } else {
        Alert.alert('入力エラー', '修理作業内容は必須です');
      }
      return;
    }
    setSaving(true);
    try {
      const staffName = selectedStaffNames.length > 0 ? selectedStaffNames.join(', ') : null;
      const payload = {
        case_id:              caseId,
        subject:              form.subject || null,
        address:              form.address || null,
        work_date:            form.work_date || null,
        staff_name:           staffName,
        contractor:           form.contractor || null,
        gen_model:            form.gen_model || null,
        gen_rated_output_kw:  form.gen_rated_output_kw ? Number(form.gen_rated_output_kw) : null,
        gen_manufacturer:     form.gen_manufacturer || null,
        gen_serial_number:    form.gen_serial_number || null,
        failure_date:         form.failure_date || null,
        repair_date:          form.repair_date || null,
        failure_location:     form.failure_location || null,
        urgency:              form.urgency,
        failure_symptom:      form.failure_symptom || null,
        failure_cause:        form.failure_cause || null,
        repair_work:          form.repair_work,
        repair_parts:         form.repair_parts || null,
        repair_result:        form.repair_result || null,
        next_inspection_date: form.next_inspection_date || null,
        notes:                form.notes || null,
        photo_before_url:     form.photo_before_url || null,
        photo_during_url:     form.photo_during_url || null,
        photo_after_url:      form.photo_after_url || null,
      };

      if (currentRecordId) {
        const { error } = await supabase.from('repair_reports').update(payload).eq('id', currentRecordId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('repair_reports').insert(payload).select('id').single();
        if (error) throw error;
        if (inserted) setCurrentRecordId(inserted.id);
      }

      // 施工日が設定されていれば社員カレンダーに同期（失敗しても保存は続行）
      // casesテーブルのステータスと担当者を更新
      await supabase.from('cases').update({
        status: caseStatus,
        [getCaseStaffFieldByWorkType('修理')]: staffName,
      }).eq('id', caseId);

      try {
        const caseSnapshot = await fetchCase(caseId);
        if (caseSnapshot) {
          await syncToCalendar(
            {
              ...caseSnapshot,
              work_date: form.work_date || null,
              staff_name: staffName,
              status: caseStatus,
            },
            '修理'
          );
        }
      } catch (e) {
        console.warn('カレンダー同期失敗:', e);
        Alert.alert('カレンダー同期エラー', getCalendarSyncErrorMessage(e));
      }

      if (Platform.OS === 'web') {
        navigation.goBack();
      } else {
        Alert.alert('保存完了', '修理報告書を保存しました', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      console.error('修理保存エラー:', e);
      if (Platform.OS === 'web') {
        window.alert('エラー: ' + (e.message ?? '保存に失敗しました'));
      } else {
        Alert.alert('エラー', e.message ?? '保存に失敗しました');
      }
    } finally {
      setSaving(false);
    }
  }

  // ── Excel出力 ──
  async function handleExportExcel() {
    try {
      await exportRepairReportExcel({
        subject:              form.subject,
        address:              form.address,
        work_date:            form.work_date,
        staff_name:           selectedStaffNames.join('・'),
        contractor:           form.contractor,
        gen_model:            form.gen_model,
        gen_rated_output_kw:  form.gen_rated_output_kw,
        output_unit:          form.output_unit,
        gen_manufacturer:     form.gen_manufacturer,
        gen_serial_number:    form.gen_serial_number,
        failure_date:         form.failure_date,
        repair_date:          form.repair_date,
        failure_location:     form.failure_location,
        urgency:              form.urgency,
        failure_symptom:      form.failure_symptom,
        failure_cause:        form.failure_cause,
        repair_work:          form.repair_work,
        repair_parts:         form.repair_parts,
        repair_result:        form.repair_result,
        next_inspection_date: form.next_inspection_date,
        notes:                form.notes,
        photo_before_url:     form.photo_before_url || undefined,
        photo_during_url:     form.photo_during_url || undefined,
        photo_after_url:      form.photo_after_url  || undefined,
      });
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert('Excel出力エラー: ' + (e?.message ?? 'エラーが発生しました'));
      } else {
        Alert.alert('Excel出力エラー', e?.message ?? 'エラーが発生しました');
      }
    }
  }

  if (loading) return <LoadingOverlay />;

  if (fetchError) {
    return (
      <ScrollView style={s.container} contentContainerStyle={s.content}>
        <View style={{ backgroundColor: '#fef2f2', borderRadius: 10, padding: 16, margin: 16, borderWidth: 1, borderColor: '#fecaca' }}>
          <Text style={{ color: '#dc2626', fontWeight: '700', fontSize: 15, marginBottom: 6 }}>データの読み込みエラー</Text>
          <Text style={{ color: '#7f1d1d', fontSize: 13 }}>{fetchError}</Text>
          <Text style={{ color: '#6b7280', fontSize: 12, marginTop: 8 }}>閲覧権限がない場合は管理者にお問い合わせください。</Text>
        </View>
      </ScrollView>
    );
  }

  function urgencyColor(u: RepairUrgency): string {
    if (u === '緊急') return '#ef4444';
    if (u === '急ぎ') return '#d97706';
    return '#059669';
  }

  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">
      {/* ── 基本情報 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>基本情報</Text>
        <Text style={s.note}>台帳から自動引き継ぎ（編集可）</Text>
        <Field label="件名" value={form.subject} onChangeText={v => set('subject', v)} />
        <Field label="住所" value={form.address} onChangeText={v => set('address', v)} />

        {/* 施工日 + 工程表ボタン 横並び */}
        <View style={s.workDateRow}>
          <View style={{ flex: 1 }}>
            <DateBox
              label="施工日"
              value={form.work_date}
              onPress={() => setShowWorkDateCal(v => !v)}
              placeholder="指定なし"
            />
          </View>
          <TouchableOpacity
            style={s.processBtn}
            onPress={() => navigation.navigate('GeneratorProcess', { caseId })}
            activeOpacity={0.8}
          >
            <Text style={s.processBtnIcon}>📋</Text>
            <Text style={s.processBtnText}>工程表</Text>
          </TouchableOpacity>
        </View>
        {showWorkDateCal && (
          <CalendarPicker
            value={form.work_date}
            onChange={d => { set('work_date', d); setShowWorkDateCal(false); }}
            onClose={() => setShowWorkDateCal(false)}
            allowClear
          />
        )}
        <Field label="請負者" value={form.contractor} onChangeText={v => set('contractor', v)} />
      </View>

      {/* ── 担当者選択 ── */}
      <View style={s.section}>
        <View style={s.staffSectionHeader}>
          <Text style={s.sectionTitle}>担当者 <Text style={{ fontSize: 12, fontWeight: '400', color: '#9ca3af' }}>（複数選択可）</Text></Text>
        </View>
        {DEPARTMENTS.map(dept => {
          const deptMembers = members.filter(m => memberBelongsToDept(m, dept, profile?.company_id ?? null));
          const isOpen = expandedDept === dept;
          const selectedCount = deptMembers.filter(m => selectedStaffNames.includes(m.full_name)).length;
          return (
            <View key={dept} style={s.deptAccordion}>
              <TouchableOpacity
                style={[s.deptHeader, isOpen && s.deptHeaderOpen]}
                onPress={() => setExpandedDept(isOpen ? null : dept)}
                activeOpacity={0.8}
              >
                <View style={s.deptHeaderLeft}>
                  <Text style={[s.deptHeaderText, isOpen && s.deptHeaderTextOpen]}>{dept}</Text>
                  {selectedCount > 0 && (
                    <View style={s.deptBadge}>
                      <Text style={s.deptBadgeText}>{selectedCount}</Text>
                    </View>
                  )}
                </View>
                <Text style={[s.deptChevron, isOpen && s.deptChevronOpen]}>›</Text>
              </TouchableOpacity>
              {isOpen && (
                <View style={s.deptMembersWrap}>
                  {deptMembers.length === 0 ? (
                    <Text style={s.deptEmptyText}>社員が登録されていません</Text>
                  ) : (
                    <View style={s.staffChipGrid}>
                      {deptMembers.map(m => {
                        const isSelected = selectedStaffNames.includes(m.full_name);
                        return (
                          <TouchableOpacity
                            key={m.id}
                            style={[s.staffChip, isSelected && s.staffChipActive]}
                            onPress={() => setSelectedStaffNames(prev =>
                              isSelected
                                ? prev.filter(n => n !== m.full_name)
                                : [...prev, m.full_name]
                            )}
                          >
                            <Text style={[s.staffChipText, isSelected && s.staffChipTextActive]}>
                              {isSelected ? '✓ ' : ''}{m.full_name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          );
        })}
        {selectedStaffNames.length > 0 && (
          <TouchableOpacity onPress={() => setSelectedStaffNames([])} style={s.clearStaffBtn}>
            <Text style={s.clearStaffBtnText}>選択をクリア</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* ── 発電機情報 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>発電機情報</Text>
        <Text style={s.note}>台帳から自動引き継ぎ（編集可）</Text>
        <Field label="装置型式" value={form.gen_model} onChangeText={v => set('gen_model', v)} />
        <Field label={`定格出力 (${form.output_unit === 'kva' ? 'kVA' : 'kW'})`} value={form.gen_rated_output_kw} onChangeText={v => set('gen_rated_output_kw', v)} keyboardType="numeric" />
        <Field label="製造者" value={form.gen_manufacturer} onChangeText={v => set('gen_manufacturer', v)} />
        <Field label="製造番号" value={form.gen_serial_number} onChangeText={v => set('gen_serial_number', v)} />
      </View>

      {/* ── 故障情報 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>故障情報</Text>
        <Text style={s.fieldLabel}>故障発生日</Text>
        <DateBox label="故障発生日" value={form.failure_date} onPress={() => setShowFailureDateCal(true)} placeholder="タップで選択" />
        {showFailureDateCal && (
          <CalendarPicker
            value={form.failure_date}
            onChange={d => { set('failure_date', d); setShowFailureDateCal(false); }}
            onClose={() => setShowFailureDateCal(false)}
            allowClear
          />
        )}

        <Text style={s.fieldLabel}>故障箇所</Text>
        <SelectButton
          value={form.failure_location || '選択してください'}
          color={form.failure_location ? '#374151' : '#9ca3af'}
          onPress={() => showOptions('故障箇所', FAILURE_LOCATIONS, v => set('failure_location', v))}
        />

        <Text style={s.fieldLabel}>緊急度</Text>
        <SelectButton
          value={form.urgency}
          color={urgencyColor(form.urgency)}
          bold
          onPress={() => showOptions('緊急度', URGENCY_OPTIONS, v => set('urgency', v as RepairUrgency))}
        />

        <Field label="故障状況・症状" value={form.failure_symptom} onChangeText={v => set('failure_symptom', v)} multiline />
        <Field label="原因" value={form.failure_cause} onChangeText={v => set('failure_cause', v)} multiline />
      </View>

      {/* ── 修理情報 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>修理情報</Text>
        <View style={s.required}>
          <Text style={s.fieldLabel}>修理作業内容 <Text style={s.reqMark}>*必須</Text></Text>
        </View>
        <TextInput
          style={[s.input, s.textarea]}
          value={form.repair_work}
          onChangeText={v => set('repair_work', v)}
          placeholder="修理作業の内容を記入してください"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
        <Field label="交換部品名・型番" value={form.repair_parts} onChangeText={v => set('repair_parts', v)} />

        <Text style={s.fieldLabel}>修理結果</Text>
        <SelectButton
          value={form.repair_result || '選択してください'}
          color={form.repair_result ? '#374151' : '#9ca3af'}
          onPress={() => showOptions('修理結果', REPAIR_RESULTS, v => set('repair_result', v))}
        />

        <Text style={s.fieldLabel}>次回点検推奨日</Text>
        <DateBox label="次回点検推奨日" value={form.next_inspection_date} onPress={() => setShowNextInspCal(true)} placeholder="タップで選択" />
        {showNextInspCal && (
          <CalendarPicker
            value={form.next_inspection_date}
            onChange={d => { set('next_inspection_date', d); setShowNextInspCal(false); }}
            onClose={() => setShowNextInspCal(false)}
            allowClear
          />
        )}
        <Field label="備考" value={form.notes} onChangeText={v => set('notes', v)} multiline />
      </View>

      {/* ── 写真（修理前・作業中・修理後） ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>写真</Text>
        <Text style={s.note}>修理前・作業中・修理後（各1枚・選択後即アップロード）</Text>
        {PHOTO_LABELS.map(label => {
          const urlKey = PHOTO_KEY_MAP[label];
          const url = form[urlKey];
          const isUploading = uploading === label;
          return (
            <View key={label} style={s.photoCard}>
              <Text style={s.photoCardLabel}>{label}</Text>
              {isUploading ? (
                <View style={s.photoPlaceholderV}>
                  <ActivityIndicator size="large" color={C} />
                  <Text style={s.photoUploadingText}>アップロード中...</Text>
                </View>
              ) : url ? (
                <View style={s.photoFilledWrap}>
                  <Image source={{ uri: url }} style={s.photoFilledImg} resizeMode="cover" />
                  <TouchableOpacity
                    style={s.photoDeleteBtn}
                    onPress={() => handleDeletePhoto(label)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <Text style={s.photoDeleteBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity style={s.photoPlaceholderV} onPress={() => showPhotoOptions(label)} activeOpacity={0.7}>
                  <Text style={s.photoPlaceholderIcon}>📷</Text>
                  <Text style={s.photoPlaceholderText}>{label}の写真を追加</Text>
                </TouchableOpacity>
              )}
            </View>
          );
        })}
      </View>

      {/* ── Excel出力ボタン ── */}
      <TouchableOpacity style={s.exportBtn} onPress={handleExportExcel}>
        <Text style={s.exportBtnText}>📄 Excel出力</Text>
      </TouchableOpacity>

      {/* ── 保存ボタン ── */}
      <TouchableOpacity style={s.saveBtn} onPress={save} disabled={saving}>
        {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.saveBtnText}>保存する</Text>}
      </TouchableOpacity>
    </ScrollView>
  );
}

// ── 共通: テキスト入力フィールド ──
function Field({
  label, value, onChangeText, placeholder, keyboardType, multiline,
}: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; keyboardType?: 'default' | 'numeric'; multiline?: boolean;
}) {
  return (
    <View style={s.fieldRow}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.input, multiline && s.textarea]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? label}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        textAlignVertical={multiline ? 'top' : 'center'}
      />
    </View>
  );
}

// ── 共通: 選択ボタン ──
function SelectButton({ value, color, bold, onPress }: {
  value: string; color: string; bold?: boolean; onPress: () => void;
}) {
  return (
    <TouchableOpacity style={s.selectBtn} onPress={onPress}>
      <Text style={[s.selectBtnText, { color }, bold && { fontWeight: '800' }]}>{value}</Text>
      <Text style={s.chevron}>▼</Text>
    </TouchableOpacity>
  );
}

const C_STYLE = '#1D9E75';

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  content: {
    padding: 16, paddingBottom: 48,
    ...(Platform.OS === 'web' ? { maxWidth: 720, width: '100%', alignSelf: 'center' } as any : {}),
  },
  section: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 12,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C_STYLE, marginBottom: 4 },
  note: { fontSize: 11, color: '#9ca3af', marginBottom: 10 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb',
  },
  textarea: { minHeight: 72, paddingTop: 10 },
  required: { flexDirection: 'row', alignItems: 'center' },
  reqMark: { color: '#ef4444', fontSize: 11, fontWeight: '600', marginLeft: 4 },
  selectBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, backgroundColor: '#f9fafb', marginBottom: 10,
  },
  selectBtnText: { fontSize: 14 },
  chevron: { fontSize: 12, color: '#9ca3af', marginLeft: 6 },
  // 写真カード（縦並び）
  photoCard: {
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#d1fae5',
    borderStyle: 'dashed',
    backgroundColor: '#f0fdf4',
    marginBottom: 12,
    overflow: 'hidden',
  },
  photoCardLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: C_STYLE,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 6,
    backgroundColor: '#ecfdf5',
    borderBottomWidth: 1,
    borderBottomColor: '#d1fae5',
  },
  photoPlaceholderV: {
    height: 140,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  photoPlaceholderIcon: { fontSize: 32 },
  photoPlaceholderText: {
    fontSize: 13,
    color: '#6b7280',
    fontWeight: '500',
  },
  photoUploadingText: {
    fontSize: 13,
    color: '#6b7280',
    marginTop: 8,
  },
  photoFilledWrap: {
    position: 'relative',
  },
  photoFilledImg: {
    width: '100%',
    height: 200,
  },
  photoDeleteBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: 'rgba(239,68,68,0.88)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  photoDeleteBtnText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '800',
  },
  // 保存ボタン
  saveBtn: {
    backgroundColor: C_STYLE, borderRadius: 12, padding: 16,
    alignItems: 'center', marginTop: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  // Excel出力ボタン
  exportBtn: {
    borderRadius: 12, padding: 14,
    alignItems: 'center', marginTop: 8,
    borderWidth: 2, borderColor: '#059669',
    backgroundColor: '#f0fdf4',
  },
  exportBtnText: { color: '#059669', fontSize: 15, fontWeight: '700' },

  // Status chips
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  statusChipActive: { borderColor: C_STYLE, backgroundColor: '#ecfdf5' },
  statusChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  statusChipTextActive: { color: C_STYLE },

  // 担当者選択
  staffSectionHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10,
  },
  workDateRow: {
    flexDirection: 'row', alignItems: 'flex-end',
  },
  processBtn: {
    backgroundColor: '#ecfdf5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#6ee7b7',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-end', marginBottom: 16, marginLeft: 10,
    minWidth: 72,
  },
  processBtnIcon: { fontSize: 20, marginBottom: 2 },
  processBtnText: { fontSize: 12, fontWeight: '700', color: C_STYLE },
  deptAccordion: {
    borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb',
    backgroundColor: '#fff', marginBottom: 8, overflow: 'hidden',
  },
  deptHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f9fafb',
  },
  deptHeaderOpen: { backgroundColor: '#ecfdf5', borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  deptHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deptHeaderText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  deptHeaderTextOpen: { color: C_STYLE },
  deptBadge: {
    backgroundColor: C_STYLE, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  deptBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  deptChevron: { fontSize: 22, color: '#9ca3af', transform: [{ rotate: '90deg' }] },
  deptChevronOpen: { color: C_STYLE, transform: [{ rotate: '-90deg' }] },
  deptMembersWrap: { padding: 12 },
  deptEmptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  staffChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  staffChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  staffChipActive: { borderColor: C_STYLE, backgroundColor: '#ecfdf5' },
  staffChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  staffChipTextActive: { color: C_STYLE },
  clearStaffBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6, backgroundColor: '#fee2e2', alignSelf: 'flex-end', marginTop: 4,
  },
  clearStaffBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
});

