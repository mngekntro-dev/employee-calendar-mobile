import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  Platform, TouchableOpacity,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Project, Property, ProjectStatus, STATUS_LABEL } from '../../types';
import Input from '../../components/Input';
import Button from '../../components/Button';
import LoadingOverlay from '../../components/LoadingOverlay';
import PropertySearchModal from '../../components/PropertySearchModal';
import CustomerSearchModal, { Customer } from '../../components/CustomerSearchModal';
import { CalendarPicker, DateBox } from '../../components/CalendarPicker';

interface Props { route: any; navigation: any; }

const STATUS_OPTIONS: ProjectStatus[] = ['inquiry', 'planning', 'active', 'completed', 'paused'];

export default function ProjectFormScreen({ route, navigation }: Props) {
  const { projectId } = route.params ?? {};
  const { profile } = useAuth();
  const isEdit = !!projectId;

  // Web版: NavigationのDOM全体のoverflow:hiddenをスクロール可能に上書き
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    const style = document.createElement('style');
    style.id = 'form-scroll-fix';
    style.innerHTML = `
      .project-form-scroll { height: 100% !important; overflow-y: auto !important; }
      .project-form-scroll * { overflow: visible !important; }
    `;
    document.head.appendChild(style);
    return () => document.getElementById('form-scroll-fix')?.remove();
  }, []);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);
  const fmt = (d: Date) => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;

  // 物件
  const [selectedProperty, setSelectedProperty] = useState<Property | null>(null);
  const [propertyModalVisible, setPropertyModalVisible] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [customerModalVisible, setCustomerModalVisible] = useState(false);
  // 基本情報
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<ProjectStatus>('planning');
  const [startDate, setStartDate] = useState(fmt(today));
  const [endDate, setEndDate] = useState(fmt(tomorrow));
  // 物件情報
  const [address, setAddress] = useState('');
  const [buildingType, setBuildingType] = useState('');
  const [propertyName, setPropertyName] = useState('');
  // 施工注意点
  const [parkingInfo, setParkingInfo] = useState('');
  const [workPeriod, setWorkPeriod] = useState('');
  const [weekendWork, setWeekendWork] = useState('');
  const [smokingRule, setSmokingRule] = useState('');
  const [otherNotes, setOtherNotes] = useState('');
  // 顧客情報
  const [customerType, setCustomerType] = useState('');
  const [customerFurigana, setCustomerFurigana] = useState('');
  const [customerCompany, setCustomerCompany] = useState('');
  const [customerAddress, setCustomerAddress] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');

  // 企業形態タップ選択
  const PREFIX_OPTIONS = ['（なし）', '株式会社', '有限会社', '合同会社', '一般社団法人', '社会福祉法人', '特定非営利活動法人', '直接入力'];
  const SUFFIX_OPTIONS = ['（なし）', '株式会社', '有限会社', '合同会社', '直接入力'];
  const [companyPrefix, setCompanyPrefix] = useState('（なし）');
  const [companySuffix, setCompanySuffix] = useState('（なし）');
  const [customPrefix, setCustomPrefix] = useState('');
  const [customSuffix, setCustomSuffix] = useState('');

  const getPrefix = () => companyPrefix === '直接入力' ? customPrefix : (companyPrefix === '（なし）' ? '' : companyPrefix);
  const getSuffix = () => companySuffix === '直接入力' ? customSuffix : (companySuffix === '（なし）' ? '' : companySuffix);

  // カタカナ→ひらがな変換
  const toHiragana = (str: string) =>
    str.replace(/[\u30A1-\u30F6]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

  // 会社名変更時：カナのみなら自動フリガナ
  const handleCompanyChange = (text: string) => {
    setCustomerCompany(text);
    if (/^[\u3040-\u30FF\uFF66-\uFF9F\s　ー\-－]+$/.test(text)) {
      setCustomerFurigana(toHiragana(text));
    }
  };

  // フリガナ欄：カタカナ→ひらがな自動変換
  const handleFuriganaChange = (text: string) => {
    setCustomerFurigana(toHiragana(text));
  };

  const [loading, setLoading] = useState(isEdit);
  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showStartCal, setShowStartCal] = useState(false);
  const [showEndCal, setShowEndCal] = useState(false);

  useEffect(() => {
    if (isEdit) {
      (async () => {
        try {
          const { data, error } = await supabase.from('projects').select('*').eq('id', projectId).single();
          if (error || !data) { Alert.alert('エラー', '取得に失敗しました'); navigation.goBack(); return; }
          const p = data as Project;
          setName(p.name); setDescription(p.description); setStatus(p.status);
          setStartDate(p.start_date ?? ''); setEndDate(p.end_date ?? '');
          setAddress(p.address ?? ''); setBuildingType(p.building_type ?? '');
          setParkingInfo(p.parking_info ?? ''); setWorkPeriod(p.work_period ?? '');
          setWeekendWork(p.weekend_work ?? ''); setSmokingRule(p.smoking_rule ?? '');
          setOtherNotes(p.other_notes ?? '');
          setCustomerType(p.customer_type ?? ''); setCustomerCompany(p.customer_company ?? '');
          setCustomerContact(p.customer_contact ?? ''); setCustomerPhone(p.customer_phone ?? '');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [isEdit, projectId]);

  // 顧客選択時：自動入力
  const applyCustomer = (cust: Customer) => {
    setSelectedCustomer(cust);
    setCustomerType(cust.customer_type ?? '');
    setCustomerFurigana((cust as any).customer_furigana ?? '');
    setCustomerCompany(cust.customer_company ?? '');
    setCustomerAddress((cust as any).customer_address ?? '');
    setCustomerContact(cust.customer_contact ?? '');
    setCustomerPhone(cust.customer_phone ?? '');
    setCustomerModalVisible(false);
  };

  // 物件選択時：自動入力
  const applyProperty = (prop: Property) => {
    const hasData = address || buildingType || customerCompany || customerContact || customerPhone;
    const doApply = () => {
      setSelectedProperty(prop);
      setAddress(prop.address ?? '');
      setBuildingType(prop.building_type ?? '');
      setPropertyName(prop.name ?? '');
      setCustomerType(prop.customer_type ?? '');
      setCustomerCompany(prop.customer_company ?? '');
      setCustomerContact(prop.customer_contact ?? '');
      setCustomerPhone(prop.customer_phone ?? '');
    };
    if (hasData) {
      Alert.alert('上書き確認', '入力済みの物件情報を選択した物件で上書きしますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '上書きする', onPress: doApply },
      ]);
    } else {
      doApply();
    }
  };

  // 新規物件名でセット
  const applyNewPropertyName = (propName: string) => {
    setSelectedProperty(null);
    if (!name) setName(propName);
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = '案件名を入力してください';
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (startDate && !dateRegex.test(startDate)) errs.startDate = 'YYYY-MM-DD 形式で入力してください';
    if (endDate && !dateRegex.test(endDate)) errs.endDate = 'YYYY-MM-DD 形式で入力してください';
    if (startDate && endDate && startDate > endDate) errs.endDate = '終了日は開始日以降にしてください';
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      Alert.alert('入力エラー', Object.values(errs).join('\n'));
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validate()) return;
    setSaving(true);
    try {
      // 物件を自動登録 or 既存を更新
      let propertyId = selectedProperty?.id ?? null;
      if (!selectedProperty && (address || buildingType)) {
        const { data: prop, error: propErr } = await supabase
          .from('properties')
          .insert({
            name: name.trim(), address: address || null,
            building_type: buildingType || null,
            customer_type: customerType || null,
            customer_company: customerCompany || null,
            customer_contact: customerContact || null,
            customer_phone: customerPhone || null,
            company_id: profile?.company_id,
          }).select().single();
        if (!propErr && prop) propertyId = prop.id;
      }

      // 顧客を自動登録
      if (!selectedCustomer && (customerCompany || customerContact)) {
        await supabase.from('customers').insert({
          customer_type: customerType || null,
          customer_company: customerCompany || null,
          customer_contact: customerContact || null,
          customer_phone: customerPhone || null,
          company_id: profile?.company_id,
        });
      }

      const payload = {
        name: name.trim(), description: description.trim(), status,
        start_date: startDate || null, end_date: endDate || null,
        company_id: profile?.company_id, created_by: profile?.id,
        property_id: propertyId,
        address: address || null, building_type: buildingType || null,
        parking_info: parkingInfo || null, work_period: workPeriod || null,
        weekend_work: weekendWork || null, smoking_rule: smokingRule || null,
        other_notes: otherNotes || null,
        customer_type: customerType || null, customer_company: (getPrefix() + customerCompany + getSuffix()) || null,
        customer_furigana: customerFurigana || null, customer_address: customerAddress || null,
        customer_contact: customerContact || null, customer_phone: customerPhone || null,
      };

      if (isEdit) {
        const { error } = await supabase.from('projects').update({ ...payload, updated_at: new Date().toISOString() }).eq('id', projectId);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from('projects').insert(payload).select().single();
        if (error) throw error;
        await supabase.from('project_members').insert({ project_id: data.id, user_id: profile?.id, role: 'manager', added_by: profile?.id });
      }
      navigation.goBack();
    } catch (e: any) {
      Alert.alert('保存失敗', e.message ?? '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingOverlay />;

  const content = (
    <>
        {/* 物件検索 */}
        <Text style={styles.sectionTitle}>物件を選択（任意）</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.propertySearchBtn} onPress={() => setPropertyModalVisible(true)}>
            <Text style={styles.propertySearchIcon}>🔍</Text>
            <Text style={styles.propertySearchText}>
              {selectedProperty ? selectedProperty.name : '物件名で検索...'}
            </Text>
            {selectedProperty && (
              <TouchableOpacity onPress={() => setSelectedProperty(null)} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {selectedProperty && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>✅ 既存物件から自動入力されました</Text>
            </View>
          )}
        </View>

        {/* 基本情報 */}
        <Text style={styles.sectionTitle}>基本情報</Text>
        <View style={styles.card}>
          <Input label="案件名 *" placeholder="例）○○ビル新築工事" value={name} onChangeText={setName} error={errors.name} />
          <Input label="概要・説明" placeholder="案件の概要（任意）" value={description} onChangeText={setDescription} multiline numberOfLines={3} style={styles.textarea} />
          <Text style={styles.label}>ステータス</Text>
          <View style={styles.statusGrid}>
            {STATUS_OPTIONS.map((s) => (
              <TouchableOpacity key={s} style={[styles.statusOption, status === s && styles.statusSelected]} onPress={() => setStatus(s)}>
                <Text style={[styles.statusOptionText, status === s && styles.statusSelectedText]}>{STATUS_LABEL[s]}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <DateBox label="開始日" value={startDate} onPress={() => { setShowEndCal(false); setShowStartCal(v => !v); }} />
          {showStartCal && (
            <CalendarPicker value={startDate} onChange={d => { setStartDate(d); if (endDate && d > endDate) setEndDate(d); }} onClose={() => setShowStartCal(false)} allowClear={false} />
          )}
          <DateBox label="終了（予定）日" value={endDate} onPress={() => { setShowStartCal(false); setShowEndCal(v => !v); }} />
          {showEndCal && (
            <CalendarPicker value={endDate} onChange={setEndDate} onClose={() => setShowEndCal(false)} />
          )}
        </View>

        {/* 物件情報 */}
        <Text style={styles.sectionTitle}>物件情報</Text>
        <TouchableOpacity style={styles.callPropertyBtn} onPress={() => setPropertyModalVisible(true)}>
          <Text style={styles.callPropertyBtnText}>🔍 既存物件情報を呼び出す</Text>
        </TouchableOpacity>
        <View style={styles.card}>
          <Input label="物件名" placeholder="例）○○ビル・△△マンション" value={propertyName} onChangeText={setPropertyName} />
          <Input label="住所" placeholder="例）東京都新宿区西新宿2-1-1" value={address} onChangeText={setAddress} />
          <Input label="建物構造" placeholder="例）RC造・木造・鉄骨造" value={buildingType} onChangeText={setBuildingType} />
        </View>

        {/* 施工に関する注意点 */}
        <Text style={styles.sectionTitle}>施工に関する注意点</Text>
        <View style={styles.card}>
          <Input label="駐車スペース" placeholder="例）現場前に2台まで可" value={parkingInfo} onChangeText={setParkingInfo} />
          <Input label="工事可能期間" placeholder="例）平日8:00〜17:00" value={workPeriod} onChangeText={setWorkPeriod} />
          <Input label="土日の工事" placeholder="例）要相談" value={weekendWork} onChangeText={setWeekendWork} />
          <Input label="喫煙ルール" placeholder="例）現場内禁煙" value={smokingRule} onChangeText={setSmokingRule} />
          <Input label="その他" placeholder="その他注意事項" value={otherNotes} onChangeText={setOtherNotes} multiline numberOfLines={3} style={styles.textarea} />
        </View>

        {/* 顧客情報 */}
        <Text style={styles.sectionTitle}>顧客情報</Text>
        <View style={styles.card}>
          <TouchableOpacity style={styles.propertySearchBtn} onPress={() => setCustomerModalVisible(true)}>
            <Text style={styles.propertySearchIcon}>🔍</Text>
            <Text style={styles.propertySearchText}>
              {selectedCustomer ? (selectedCustomer.customer_company ?? selectedCustomer.customer_contact ?? '選択済み') : '既存の顧客から選択...'}
            </Text>
            {selectedCustomer && (
              <TouchableOpacity onPress={() => setSelectedCustomer(null)} style={styles.clearBtn}>
                <Text style={styles.clearBtnText}>✕</Text>
              </TouchableOpacity>
            )}
          </TouchableOpacity>
          {selectedCustomer && (
            <View style={styles.selectedBadge}>
              <Text style={styles.selectedBadgeText}>✅ 既存顧客から自動入力されました</Text>
            </View>
          )}
          <View style={styles.divider} />
          <Text style={styles.label}>区分</Text>
          <View style={styles.typeGrid}>
            {['法人', '個人'].map((t) => (
              <TouchableOpacity
                key={t}
                style={[styles.typeOption, customerType === t && styles.typeSelected]}
                onPress={() => setCustomerType(customerType === t ? '' : t)}
              >
                <Text style={[styles.typeOptionText, customerType === t && styles.typeSelectedText]}>{t}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Input label="フリガナ" placeholder="例）かぶしきがいしゃ〇〇" value={customerFurigana} onChangeText={handleFuriganaChange} />
          {customerType === '法人' ? (
            <>
              <Text style={styles.label}>前株（会社形態）</Text>
              <View style={styles.chipGrid}>
                {PREFIX_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chipOption, companyPrefix === opt && styles.chipSelected]}
                    onPress={() => setCompanyPrefix(opt)}
                  >
                    <Text style={[styles.chipOptionText, companyPrefix === opt && styles.chipSelectedText]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {companyPrefix === '直接入力' && (
                <Input label="前株（自由記入）" placeholder="例）一般財団法人" value={customPrefix} onChangeText={setCustomPrefix} />
              )}
              <Input label="会社名" placeholder="例）三幸" value={customerCompany} onChangeText={handleCompanyChange} />
              <Text style={styles.label}>後株（会社形態）</Text>
              <View style={styles.chipGrid}>
                {SUFFIX_OPTIONS.map((opt) => (
                  <TouchableOpacity
                    key={opt}
                    style={[styles.chipOption, companySuffix === opt && styles.chipSelected]}
                    onPress={() => setCompanySuffix(opt)}
                  >
                    <Text style={[styles.chipOptionText, companySuffix === opt && styles.chipSelectedText]}>{opt}</Text>
                  </TouchableOpacity>
                ))}
              </View>
              {companySuffix === '直接入力' && (
                <Input label="後株（自由記入）" placeholder="例）協同組合" value={customSuffix} onChangeText={setCustomSuffix} />
              )}
              {(getPrefix() || customerCompany || getSuffix()) ? (
                <View style={styles.companyPreview}>
                  <Text style={styles.companyPreviewLabel}>保存される会社名：</Text>
                  <Text style={styles.companyPreviewValue}>{getPrefix()}{customerCompany}{getSuffix()}</Text>
                </View>
              ) : null}
            </>
          ) : (
            <Input label="会社名" placeholder="例）株式会社○○" value={customerCompany} onChangeText={handleCompanyChange} />
          )}
          <Input label="住所" placeholder="例）東京都〇〇区..." value={customerAddress} onChangeText={setCustomerAddress} />
          <Input label="担当者名" placeholder="例）山田 太郎" value={customerContact} onChangeText={setCustomerContact} />
          <Input label="電話番号" placeholder="例）03-1234-5678" value={customerPhone} onChangeText={setCustomerPhone} keyboardType="phone-pad" />
        </View>

        <Button title={isEdit ? '変更を保存' : '案件を作成'} onPress={handleSave} loading={saving} fullWidth style={styles.saveBtn} />
        <Button title="キャンセル" onPress={() => navigation.goBack()} variant="ghost" fullWidth />
    </>
  );

  return (
    <View style={styles.flex}>
      {Platform.OS === 'web' ? (
        <div className="project-form-scroll" style={{ height: '100vh', overflowY: 'auto', backgroundColor: '#f1f5f9' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', padding: '24px 24px 60px' }}>
            {content}
            <PropertySearchModal visible={propertyModalVisible} onClose={() => setPropertyModalVisible(false)} onSelect={applyProperty} onNewProperty={applyNewPropertyName} />
            <CustomerSearchModal visible={customerModalVisible} onClose={() => setCustomerModalVisible(false)} onSelect={applyCustomer} onNew={(name) => setCustomerCompany(name)} />
          </div>
        </div>
      ) : (
        <ScrollView style={styles.scroll} contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          {content}
          <PropertySearchModal visible={propertyModalVisible} onClose={() => setPropertyModalVisible(false)} onSelect={applyProperty} onNewProperty={applyNewPropertyName} />
          <CustomerSearchModal visible={customerModalVisible} onClose={() => setCustomerModalVisible(false)} onSelect={applyCustomer} onNew={(name) => setCustomerCompany(name)} />
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb', ...(Platform.OS === 'web' ? { height: '100%' as any } : {}) },
  scroll: { flex: 1 },
  container: { padding: 16, paddingBottom: 40 },
  sectionTitle: { fontSize: 11, fontWeight: '700', color: '#94a3b8', marginBottom: 8, marginTop: 20, textTransform: 'uppercase', letterSpacing: 1.2 },
  callPropertyBtn: {
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: '#eff6ff', borderWidth: 1.5, borderColor: '#1a56db',
    borderRadius: 8, paddingVertical: 10, marginBottom: 10,
  },
  callPropertyBtnText: { color: '#1a56db', fontSize: 14, fontWeight: '700' },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 20, marginBottom: 8,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 4px rgba(0,0,0,0.08)' } as any : { elevation: 1 }) },
  propertySearchBtn: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f3f4f6', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 12,
  },
  propertySearchIcon: { fontSize: 16, marginRight: 8 },
  propertySearchText: { flex: 1, fontSize: 15, color: '#6b7280' },
  clearBtn: { padding: 4 },
  clearBtnText: { fontSize: 16, color: '#9ca3af' },
  selectedBadge: { marginTop: 8, backgroundColor: '#ecfdf5', borderRadius: 8, padding: 8 },
  selectedBadgeText: { fontSize: 13, color: '#057a55', fontWeight: '600' },
  textarea: { height: 80, textAlignVertical: 'top', paddingTop: 12 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statusOption: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
  statusSelected: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  statusOptionText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  statusSelectedText: { color: '#1a56db' },
  saveBtn: { marginBottom: 10, marginTop: 24 },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginVertical: 12 },
  typeGrid: { flexDirection: 'row', gap: 8, marginBottom: 16 },
  typeOption: { flex: 1, paddingVertical: 12, borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb', alignItems: 'center' },
  typeSelected: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  typeOptionText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  typeSelectedText: { color: '#1a56db' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  chipOption: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb' },
  chipSelected: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  chipOptionText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },
  chipSelectedText: { color: '#1a56db' },
  companyPreview: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 12, borderWidth: 1, borderColor: '#86efac' },
  companyPreviewLabel: { fontSize: 12, color: '#15803d', marginBottom: 2 },
  companyPreviewValue: { fontSize: 15, fontWeight: '700', color: '#15803d' },
});
