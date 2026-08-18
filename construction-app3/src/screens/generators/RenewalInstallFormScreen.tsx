// ============================================================
// F-4: 更新・新設工事入力フォーム (RenewalInstallFormScreen)
// 台帳詳細 (GeneratorDetailScreen) → RenewalInstallForm で遷移
// 更新工事・新設設置の両方に対応（work_category で切り替え）
// ============================================================
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, ActivityIndicator, Platform,
  ActionSheetIOS, Image, Switch,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { supabase } from '../../lib/supabase';
import { fetchCase, GeneratorCase, getCaseStaffFieldByWorkType, getCaseStaffNameByWorkType, getCalendarSyncErrorMessage, syncToCalendar } from '../../lib/generators';
import { CalendarPicker, DateBox } from '../../components/CalendarPicker';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useAuth } from '../../context/AuthContext';
import { WorkCategory } from '../../types';

const C = '#1D9E75';
const MAX_PHOTOS = 25;
const WORK_CATEGORIES: WorkCategory[] = ['更新工事', '新設設置'];

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

interface FormState {
  // 基本情報
  subject:        string;
  address:        string;
  work_date:      string;
  staff_name:     string;
  contractor:     string;
  // 工事区分
  work_category: WorkCategory;
  // 既設発電機情報（更新工事のみ）
  existing_gen_model:     string;
  existing_gen_serial:    string;
  existing_removal_date:  string;
  // 新設発電機情報
  new_gen_model:             string;
  new_gen_rated_output_kw:   string;
  new_output_unit: 'kva' | 'kw';
  new_gen_manufacturer:      string;
  new_gen_install_date:      string;
  // 施工内容
  construction_detail: string;
  // 消防届出（新設設置のみ）
  fire_dept_notified: boolean;
  // 備考
  notes: string;
}

const INITIAL_FORM: FormState = {
  subject: '', address: '', work_date: '', staff_name: '', contractor: '',
  work_category: '更新工事',
  existing_gen_model: '', existing_gen_serial: '', existing_removal_date: '',
  new_gen_model: '', new_gen_rated_output_kw: '', new_output_unit: 'kw', new_gen_manufacturer: '', new_gen_install_date: '',
  construction_detail: '', fire_dept_notified: false, notes: '',
};

interface Props { route: any; navigation: any; }

export default function RenewalInstallFormScreen({ route, navigation }: Props) {
  const { caseId, recordId } = route.params as { caseId: string; recordId?: string };
  const { profile } = useAuth();

  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [caseStatus, setCaseStatus] = useState<CaseStatus>('draft');
  const [photoUrls, setPhotoUrls] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
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
      const initialStaffName = getCaseStaffNameByWorkType(c, '更新・新設');
      if (initialStaffName) {
        setSelectedStaffNames(
          initialStaffName.split(',').map((s: string) => s.trim()).filter(Boolean)
        );
      }
      setForm(prev => ({
        ...prev,
        subject:    c.name ?? '',
        address:    c.address ?? '',
        work_date:  c.work_date ?? '',
        staff_name: c.staff_name ?? '',
        contractor: c.contractor ?? '',
      }));
    } catch (e: any) { setFetchError(e?.message ?? '台帳データの読み込みに失敗しました'); }
  }, [caseId]);

  const [currentRecordId, setCurrentRecordId] = useState<string | undefined>(recordId);

  const loadRecord = useCallback(async () => {
    try {
      let query = supabase.from('renewal_install_records').select('*');
      if (currentRecordId) {
        query = query.eq('id', currentRecordId);
      } else {
        query = query.eq('case_id', caseId);
      }
      const { data, error } = await query.maybeSingle();
      if (error || !data) return;
      setCurrentRecordId(data.id);
      setForm({
        subject:                  data.subject ?? '',
        address:                  data.address ?? '',
        work_date:                data.work_date ?? '',
        staff_name:               data.staff_name ?? '',
        contractor:               data.contractor ?? '',
        work_category:            (data.work_category ?? '更新工事') as WorkCategory,
        existing_gen_model:       data.existing_gen_model ?? '',
        existing_gen_serial:      data.existing_gen_serial ?? '',
        existing_removal_date:    data.existing_removal_date ?? '',
        new_gen_model:            data.new_gen_model ?? '',
        new_gen_rated_output_kw:  data.new_gen_rated_output_kw != null ? String(data.new_gen_rated_output_kw) : '',
        new_output_unit:          data.new_output_unit === 'kva' ? 'kva' : 'kw',
        new_gen_manufacturer:     data.new_gen_manufacturer ?? '',
        new_gen_install_date:     data.new_gen_install_date ?? '',
        construction_detail:      data.construction_detail ?? '',
        fire_dept_notified:       data.fire_dept_notified ?? false,
        notes:                    data.notes ?? '',
      });
      setPhotoUrls(data.photo_urls ?? []);
    } catch (e: any) { setFetchError(e?.message ?? '更新・新設工事記録の読み込みに失敗しました'); }
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

  const set = (key: keyof FormState, value: string | boolean | WorkCategory) =>
    setForm(prev => ({ ...prev, [key]: value }));

  // ── 写真アップロード（最大25枚） ──
  async function uploadBase64(base64: string): Promise<string> {
    const fileName = `renewal/${caseId}/${Date.now()}.jpg`;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const { error } = await supabase.storage
      .from('project-photos')
      .upload(fileName, bytes, { contentType: 'image/jpeg', upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from('project-photos').getPublicUrl(fileName);
    return data.publicUrl;
  }

  async function pickImages(useCamera: boolean) {
    if (photoUrls.length >= MAX_PHOTOS) {
      Alert.alert('上限', `写真は最大${MAX_PHOTOS}枚までです`);
      return;
    }
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('権限が必要です'); return; }

    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 1.0 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          quality: 1.0, allowsMultipleSelection: true,
        });

    if (!result.canceled) {
      setUploading(true);
      for (const asset of result.assets) {
        if (photoUrls.length >= MAX_PHOTOS) break;
        try {
          const manipulated = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: Math.min(asset.width ?? 1920, 1920) } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (!manipulated.base64) throw new Error('base64 取得失敗');
          const url = await uploadBase64(manipulated.base64);
          setPhotoUrls(prev => [...prev, url]);
        } catch (e: any) {
          Alert.alert('エラー', e.message ?? 'アップロードに失敗しました');
        }
      }
      setUploading(false);
    }
  }

  function showPhotoOptions() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['キャンセル', '写真撮影', 'ギャラリーから選択'], cancelButtonIndex: 0 },
        i => { if (i === 1) pickImages(true); if (i === 2) pickImages(false); }
      );
    } else {
      Alert.alert('写真を追加', '', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '写真撮影', onPress: () => pickImages(true) },
        { text: 'ギャラリーから選択', onPress: () => pickImages(false) },
      ]);
    }
  }

  function removePhoto(index: number) {
    Alert.alert('削除', 'この写真を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () =>
        setPhotoUrls(prev => prev.filter((_, i) => i !== index)) },
    ]);
  }

  // ── 工事区分切り替え ──
  function showCategoryOptions() {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['キャンセル', ...WORK_CATEGORIES], cancelButtonIndex: 0 },
        i => { if (i > 0) set('work_category', WORK_CATEGORIES[i - 1]); }
      );
    } else {
      Alert.alert('工事区分', '選択してください', [
        { text: 'キャンセル', style: 'cancel' },
        ...WORK_CATEGORIES.map(opt => ({ text: opt, onPress: () => set('work_category', opt) })),
      ]);
    }
  }

  // ── 保存 ──
  async function save() {
    setSaving(true);
    try {
      const staffName = selectedStaffNames.length > 0 ? selectedStaffNames.join(', ') : null;
      const payload = {
        case_id:                  caseId,
        subject:                  form.subject || null,
        address:                  form.address || null,
        work_date:                form.work_date || null,
        staff_name:               staffName,
        contractor:               form.contractor || null,
        work_category:            form.work_category,
        existing_gen_model:       form.work_category === '更新工事' ? (form.existing_gen_model || null) : null,
        existing_gen_serial:      form.work_category === '更新工事' ? (form.existing_gen_serial || null) : null,
        existing_removal_date:    form.work_category === '更新工事' ? (form.existing_removal_date || null) : null,
        new_gen_model:            form.new_gen_model || null,
        new_gen_rated_output_kw:  form.new_gen_rated_output_kw ? Number(form.new_gen_rated_output_kw) : null,
        new_gen_manufacturer:     form.new_gen_manufacturer || null,
        new_gen_install_date:     form.new_gen_install_date || null,
        construction_detail:      form.construction_detail || null,
        fire_dept_notified:       form.work_category === '新設設置' ? form.fire_dept_notified : false,
        photo_urls:               photoUrls,
        notes:                    form.notes || null,
      };

      if (currentRecordId) {
        const { error } = await supabase.from('renewal_install_records').update(payload).eq('id', currentRecordId);
        if (error) throw error;
      } else {
        const { data: inserted, error } = await supabase.from('renewal_install_records').insert(payload).select('id').single();
        if (error) throw error;
        if (inserted) setCurrentRecordId(inserted.id);
      }

      // 施工日が設定されていれば社員カレンダーに同期（失敗しても保存は続行）
      // casesテーブルのステータスと担当者を更新
      await supabase.from('cases').update({
        status: caseStatus,
        [getCaseStaffFieldByWorkType('更新・新設')]: staffName,
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
            '更新新設'
          );
        }
      } catch (e) {
        console.warn('カレンダー同期失敗:', e);
        Alert.alert('カレンダー同期エラー', getCalendarSyncErrorMessage(e));
      }

      if (Platform.OS === 'web') {
        navigation.goBack();
      } else {
        Alert.alert('保存完了', '更新・新設工事記録を保存しました', [
          { text: 'OK', onPress: () => navigation.goBack() },
        ]);
      }
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
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

  const isRenewal = form.work_category === '更新工事';
  const isNewInstall = form.work_category === '新設設置';

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

      {/* ── 工事区分 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>工事区分</Text>
        <TouchableOpacity style={s.categorySelect} onPress={showCategoryOptions}>
          <Text style={s.categoryText}>{form.work_category}</Text>
          <Text style={s.chevron}>▼</Text>
        </TouchableOpacity>
        <Text style={s.categoryNote}>
          {isRenewal ? '既設発電機の入れ替え工事' : '新規発電機の設置工事'}
        </Text>
      </View>

      {/* ── 既設発電機情報（更新工事のみ） ── */}
      {isRenewal && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>既設発電機情報</Text>
          <Text style={s.note}>更新工事：撤去する発電機の情報</Text>
          <Field label="既設型式" value={form.existing_gen_model} onChangeText={v => set('existing_gen_model', v)} />
          <Field label="既設製造番号" value={form.existing_gen_serial} onChangeText={v => set('existing_gen_serial', v)} />
          <Field label="撤去日" value={form.existing_removal_date} onChangeText={v => set('existing_removal_date', v)} placeholder="YYYY-MM-DD" />
        </View>
      )}

      {/* ── 新設発電機情報 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>新設発電機情報</Text>
        <Field label="型式" value={form.new_gen_model} onChangeText={v => set('new_gen_model', v)} />
        <Field label={`定格出力 (${form.new_output_unit === 'kva' ? 'kVA' : 'kW'})`} value={form.new_gen_rated_output_kw} onChangeText={v => set('new_gen_rated_output_kw', v)} keyboardType="numeric" />
        <Field label="製造者" value={form.new_gen_manufacturer} onChangeText={v => set('new_gen_manufacturer', v)} />
        <Field label="据付日" value={form.new_gen_install_date} onChangeText={v => set('new_gen_install_date', v)} placeholder="YYYY-MM-DD" />
      </View>

      {/* ── 施工内容 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>施工内容</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={form.construction_detail}
          onChangeText={v => set('construction_detail', v)}
          placeholder="施工内容を記入してください"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />
      </View>

      {/* ── 消防届出（新設設置のみ） ── */}
      {isNewInstall && (
        <View style={s.section}>
          <Text style={s.sectionTitle}>消防届出</Text>
          <Text style={s.note}>新設設置の場合、消防への届出が必要です</Text>
          <View style={s.switchRow}>
            <Text style={s.switchLabel}>消防届出済み</Text>
            <Switch
              value={form.fire_dept_notified}
              onValueChange={v => set('fire_dept_notified', v)}
              trackColor={{ false: '#d1d5db', true: '#6ee7b7' }}
              thumbColor={form.fire_dept_notified ? C : '#f3f4f6'}
            />
          </View>
          {form.fire_dept_notified && (
            <Text style={s.switchConfirm}>届出済みとして記録されます</Text>
          )}
        </View>
      )}

      {/* ── 写真台帳（最大25枚） ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>写真台帳（最大{MAX_PHOTOS}枚）</Text>
        <View style={s.photoGrid}>
          {photoUrls.map((url, i) => (
            <View key={i} style={s.photoThumb}>
              <Image source={{ uri: url }} style={s.photoImg} />
              <View style={s.photoNumBadge}><Text style={s.photoNum}>{i + 1}</Text></View>
              <TouchableOpacity style={s.photoRemove} onPress={() => removePhoto(i)}>
                <Text style={s.photoRemoveText}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {photoUrls.length < MAX_PHOTOS && (
            <TouchableOpacity style={s.photoAdd} onPress={showPhotoOptions}>
              {uploading ? <ActivityIndicator color={C} /> : <Text style={s.photoAddText}>＋</Text>}
            </TouchableOpacity>
          )}
        </View>
        <Text style={s.photoCount}>{photoUrls.length} / {MAX_PHOTOS} 枚</Text>
      </View>

      {/* ── 備考 ── */}
      <View style={s.section}>
        <Text style={s.sectionTitle}>備考</Text>
        <TextInput
          style={[s.input, s.textarea]}
          value={form.notes}
          onChangeText={v => set('notes', v)}
          placeholder="備考を記入してください"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={3}
          textAlignVertical="top"
        />
      </View>

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
  sectionTitle: { fontSize: 15, fontWeight: '800', color: C, marginBottom: 4 },
  note: { fontSize: 11, color: '#9ca3af', marginBottom: 10 },
  fieldRow: { marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 4 },
  input: {
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 8,
    padding: 10, fontSize: 14, color: '#111827', backgroundColor: '#f9fafb',
  },
  textarea: { minHeight: 72, paddingTop: 10 },
  // 工事区分
  categorySelect: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    borderWidth: 2, borderColor: C, borderRadius: 10, padding: 14,
    backgroundColor: '#f0fdf4', marginBottom: 6,
  },
  categoryText: { fontSize: 16, fontWeight: '800', color: C },
  chevron: { fontSize: 12, color: '#9ca3af' },
  categoryNote: { fontSize: 12, color: '#6b7280', fontStyle: 'italic' },
  // 消防届出
  switchRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8 },
  switchLabel: { fontSize: 14, fontWeight: '600', color: '#374151' },
  switchConfirm: { fontSize: 12, color: '#059669', fontWeight: '600', marginTop: 4 },
  // 写真
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 },
  photoThumb: { width: 80, height: 80, borderRadius: 8, overflow: 'visible', position: 'relative' },
  photoImg: { width: 80, height: 80, borderRadius: 8 },
  photoNumBadge: {
    position: 'absolute', bottom: 2, left: 2,
    backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 6, paddingHorizontal: 5, paddingVertical: 1,
  },
  photoNum: { color: '#fff', fontSize: 10, fontWeight: '700' },
  photoRemove: {
    position: 'absolute', top: -6, right: -6, width: 20, height: 20,
    backgroundColor: '#ef4444', borderRadius: 10, alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 2, elevation: 3,
  },
  photoRemoveText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  photoAdd: {
    width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderColor: '#d1fae5',
    borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', backgroundColor: '#f0fdf4',
  },
  photoAddText: { fontSize: 26, color: C, lineHeight: 30 },
  photoCount: { fontSize: 12, color: '#6b7280', marginTop: 8, textAlign: 'right' },
  // 保存ボタン
  saveBtn: {
    backgroundColor: C, borderRadius: 12, padding: 16, alignItems: 'center', marginTop: 8,
    shadowColor: '#000', shadowOpacity: 0.1, shadowRadius: 4, elevation: 2,
  },
  saveBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },

  // Status chips
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 },
  statusChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  statusChipActive: { borderColor: C, backgroundColor: '#ecfdf5' },
  statusChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  statusChipTextActive: { color: C },

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
  processBtnText: { fontSize: 12, fontWeight: '700', color: C },
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
  deptHeaderTextOpen: { color: C },
  deptBadge: {
    backgroundColor: C, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  deptBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  deptChevron: { fontSize: 22, color: '#9ca3af', transform: [{ rotate: '90deg' }] },
  deptChevronOpen: { color: C, transform: [{ rotate: '-90deg' }] },
  deptMembersWrap: { padding: 12 },
  deptEmptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  staffChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  staffChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  staffChipActive: { borderColor: C, backgroundColor: '#ecfdf5' },
  staffChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  staffChipTextActive: { color: C },
  clearStaffBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6, backgroundColor: '#fee2e2', alignSelf: 'flex-end', marginTop: 4,
  },
  clearStaffBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },
});

