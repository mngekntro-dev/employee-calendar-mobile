import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Platform, useWindowDimensions, Modal, ActivityIndicator,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

interface Customer {
  customer_company: string;
  customer_furigana: string | null;
  customer_contact: string | null;
  customer_phone: string | null;
  customer_type: string | null;
  customer_address: string | null;
  project_count: number;
  latest_project: string;
  latest_date: string;
  projects: ProjectItem[];
}

interface ProjectItem {
  id: string;
  name: string;
  status: string;
  created_at: string;
  address: string | null;
}

interface CsvRow {
  会社名: string;
  フリガナ: string;
  区分: string;
  担当者名: string;
  電話番号: string;
  住所: string;
}

const TYPE_COLOR: Record<string, string> = {
  '個人': '#7c3aed', '法人': '#0e7490', '官公庁': '#b45309',
};
const STATUS_COLOR: Record<string, string> = {
  '引き合い': '#6366f1', '受注': '#0891b2', '施工中': '#16a34a', '完了': '#374151', '失注': '#dc2626',
};

const PREFIX_OPTIONS = ['（なし）', '株式会社', '有限会社', '合同会社', '一般社団法人', '社会福祉法人', '特定非営利活動法人', '直接入力'];
const SUFFIX_OPTIONS = ['（なし）', '株式会社', '有限会社', '合同会社', '直接入力'];
const TYPE_OPTIONS = ['法人', '個人', '官公庁'];

function detectPrefix(company: string): { prefix: string; base: string } {
  for (const p of PREFIX_OPTIONS.filter(o => o !== '（なし）' && o !== '直接入力')) {
    if (company.startsWith(p)) return { prefix: p, base: company.slice(p.length) };
  }
  return { prefix: '（なし）', base: company };
}
function detectSuffix(base: string): { suffix: string; core: string } {
  for (const s of SUFFIX_OPTIONS.filter(o => o !== '（なし）' && o !== '直接入力')) {
    if (base.endsWith(s)) return { suffix: s, core: base.slice(0, base.length - s.length) };
  }
  return { suffix: '（なし）', core: base };
}

export default function CustomerListScreen({ navigation }: any) {
  const { profile } = useAuth();
  const { width } = useWindowDimensions();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [filtered, setFiltered] = useState<Customer[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Customer | null>(null);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importPreview, setImportPreview] = useState<{ valid: CsvRow[]; errors: string[] } | null>(null);
  const [saving, setSaving] = useState(false);
  const fileInputRef = React.useRef<any>(null);

  // 編集／新規フォーム state
  const [editPrefix, setEditPrefix] = useState('（なし）');
  const [editCustomPrefix, setEditCustomPrefix] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editSuffix, setEditSuffix] = useState('（なし）');
  const [editCustomSuffix, setEditCustomSuffix] = useState('');
  const [editFurigana, setEditFurigana] = useState('');
  const [editType, setEditType] = useState('');
  const [editContact, setEditContact] = useState('');
  const [editPhone, setEditPhone] = useState('');
  const [editAddress, setEditAddress] = useState('');

  const cols = width >= 1200 ? 4 : width >= 800 ? 3 : width >= 500 ? 2 : 1;

  const fetchCustomers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('id, name, status, customer_company, customer_furigana, customer_contact, customer_phone, customer_type, customer_address, address, created_at')
        .not('customer_company', 'is', null)
        .order('created_at', { ascending: false });
      if (error) throw error;

      const map = new Map<string, Customer>();
      (data ?? []).forEach((p: any) => {
        const key = p.customer_company ?? '';
        if (!key) return;
        const proj: ProjectItem = { id: p.id, name: p.name, status: p.status, created_at: p.created_at?.slice(0, 10) ?? '', address: p.address };
        if (map.has(key)) {
          const c = map.get(key)!;
          c.project_count += 1;
          c.projects.push(proj);
        } else {
          map.set(key, {
            customer_company: key,
            customer_furigana: p.customer_furigana,
            customer_contact: p.customer_contact,
            customer_phone: p.customer_phone,
            customer_type: p.customer_type,
            customer_address: p.customer_address,
            project_count: 1,
            latest_project: p.name,
            latest_date: p.created_at?.slice(0, 10) ?? '',
            projects: [proj],
          });
        }
      });
      const list = Array.from(map.values());
      setCustomers(list);
      setFiltered(list);
    } catch (e: any) {
      Alert.alert('エラー', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchCustomers(); }, [fetchCustomers]);

  useEffect(() => {
    if (!search.trim()) { setFiltered(customers); return; }
    const q = search.toLowerCase();
    setFiltered(customers.filter(c =>
      c.customer_company.toLowerCase().includes(q) ||
      (c.customer_contact ?? '').toLowerCase().includes(q) ||
      (c.customer_phone ?? '').includes(q)
    ));
  }, [search, customers]);

  // ===== CSVエクスポート =====
  const handleExport = () => {
    const BOM = '\uFEFF';
    const header = '会社名,フリガナ,区分,担当者名,電話番号,住所';
    const escape = (v: string | null) => {
      const s = v ?? '';
      return s.includes(',') || s.includes('"') || s.includes('\n')
        ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = customers.map(c =>
      [c.customer_company, c.customer_furigana, c.customer_type,
       c.customer_contact, c.customer_phone, c.customer_address]
        .map(escape).join(',')
    );
    const csv = BOM + [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    a.href = url; a.download = `customers_${date}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };

  // ===== CSVインポート =====
  const handleFileSelect = (e: any) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = (ev.target?.result as string ?? '').replace(/^\uFEFF/, '');
      const lines = text.split(/\r?\n/).filter(l => l.trim());
      if (lines.length < 2) { Alert.alert('エラー', 'データ行がありません'); return; }

      const headers = lines[0].split(',').map(h => h.trim());
      const valid: CsvRow[] = [];
      const errors: string[] = [];

      lines.slice(1).forEach((line, i) => {
        const cols = line.match(/(".*?"|[^,]+|(?<=,)(?=,)|(?<=,)$|^(?=,))/g) ?? line.split(',');
        const clean = cols.map(c => c.replace(/^"|"$/g, '').replace(/""/g, '"').trim());
        const row: any = {};
        headers.forEach((h, idx) => { row[h] = clean[idx] ?? ''; });
        if (!row['会社名']?.trim()) {
          errors.push(`${i + 2}行目: 会社名が空のためスキップ`);
        } else {
          valid.push(row as CsvRow);
        }
      });

      setImportPreview({ valid, errors });
      e.target.value = '';
    };
    reader.readAsText(file, 'UTF-8');
  };

  const handleImport = async () => {
    if (!importPreview || importPreview.valid.length === 0) return;
    setImporting(true);
    try {
      const existingCompanies = new Set(customers.map(c => c.customer_company));
      const toInsert: any[] = [];
      const toUpdate: any[] = [];

      importPreview.valid.forEach(row => {
        const payload = {
          customer_company: row['会社名'],
          customer_furigana: row['フリガナ'] || null,
          customer_type: row['区分'] || null,
          customer_contact: row['担当者名'] || null,
          customer_phone: row['電話番号'] || null,
          customer_address: row['住所'] || null,
        };
        if (existingCompanies.has(row['会社名'])) {
          toUpdate.push(payload);
        } else {
          toInsert.push({ ...payload, name: row['会社名'], company_id: profile?.company_id, created_by: profile?.id, status: 'planning' });
        }
      });

      // 新規insert
      if (toInsert.length > 0) {
        const { error } = await supabase.from('projects').insert(toInsert);
        if (error) throw error;
      }
      // 既存update（会社名ごと）
      for (const u of toUpdate) {
        const { error } = await supabase.from('projects')
          .update({ customer_furigana: u.customer_furigana, customer_type: u.customer_type,
                    customer_contact: u.customer_contact, customer_phone: u.customer_phone,
                    customer_address: u.customer_address })
          .eq('customer_company', u.customer_company)
          .eq('company_id', profile?.company_id);
        if (error) throw error;
      }

      Alert.alert('取込完了', `新規登録: ${toInsert.length}件 / 更新: ${toUpdate.length}件`);
      setImportPreview(null);
      await fetchCustomers();
    } catch (e: any) {
      Alert.alert('取込失敗', e.message);
    } finally {
      setImporting(false);
    }
  };

  const openCreate = () => {
    setEditPrefix('（なし）'); setEditCustomPrefix('');
    setEditCompany(''); setEditSuffix('（なし）'); setEditCustomSuffix('');
    setEditFurigana(''); setEditType(''); setEditContact('');
    setEditPhone(''); setEditAddress('');
    setCreating(true);
  };

  const handleCreate = async () => {
    if (!editCompany.trim()) { Alert.alert('エラー', '会社名を入力してください'); return; }
    setSaving(true);
    try {
      const newCompany = fullCompany();
      const { error } = await supabase.from('projects').insert({
        name: newCompany,
        company_id: profile?.company_id,
        created_by: profile?.id,
        status: 'planning',
        customer_company: newCompany,
        customer_furigana: editFurigana || null,
        customer_type: editType || null,
        customer_contact: editContact || null,
        customer_phone: editPhone || null,
        customer_address: editAddress || null,
      });
      if (error) throw error;
      Alert.alert('登録完了', `「${newCompany}」を顧客として登録しました`);
      setCreating(false);
      await fetchCustomers();
    } catch (e: any) {
      Alert.alert('保存失敗', e.message);
    } finally {
      setSaving(false);
    }
  };

  const openEdit = (c: Customer) => {
    const { prefix, base } = detectPrefix(c.customer_company);
    const { suffix, core } = detectSuffix(base);
    setEditPrefix(prefix);
    setEditCustomPrefix('');
    setEditCompany(core);
    setEditSuffix(suffix);
    setEditCustomSuffix('');
    setEditFurigana(c.customer_furigana ?? '');
    setEditType(c.customer_type ?? '');
    setEditContact(c.customer_contact ?? '');
    setEditPhone(c.customer_phone ?? '');
    setEditAddress(c.customer_address ?? '');
    setEditing(true);
  };

  const getPrefix = () => editPrefix === '直接入力' ? editCustomPrefix : (editPrefix === '（なし）' ? '' : editPrefix);
  const getSuffix = () => editSuffix === '直接入力' ? editCustomSuffix : (editSuffix === '（なし）' ? '' : editSuffix);
  const fullCompany = () => getPrefix() + editCompany + getSuffix();

  const handleSave = async () => {
    if (!selected) return;
    if (!editCompany.trim()) { Alert.alert('エラー', '会社名を入力してください'); return; }
    setSaving(true);
    try {
      const newCompany = fullCompany();
      const { error } = await supabase
        .from('projects')
        .update({
          customer_company: newCompany,
          customer_furigana: editFurigana || null,
          customer_type: editType || null,
          customer_contact: editContact || null,
          customer_phone: editPhone || null,
          customer_address: editAddress || null,
        })
        .eq('customer_company', selected.customer_company)
        .eq('company_id', profile?.company_id);
      if (error) throw error;
      Alert.alert('保存完了', '顧客情報を更新しました');
      setEditing(false);
      setSelected(null);
      await fetchCustomers();
    } catch (e: any) {
      Alert.alert('保存失敗', e.message);
    } finally {
      setSaving(false);
    }
  };

  const typeColor = (type: string | null) => TYPE_COLOR[type ?? ''] ?? '#374151';

  const KanbanCard = ({ item }: { item: Customer }) => (
    <TouchableOpacity style={styles.card} onPress={() => setSelected(item)} activeOpacity={0.75}>
      {item.customer_type && (
        <View style={[styles.typeBadge, { backgroundColor: typeColor(item.customer_type) + '20' }]}>
          <Text style={[styles.typeText, { color: typeColor(item.customer_type) }]}>{item.customer_type}</Text>
        </View>
      )}
      {item.customer_furigana && <Text style={styles.furigana}>{item.customer_furigana}</Text>}
      <Text style={styles.company} numberOfLines={2}>{item.customer_company}</Text>
      <View style={styles.countRow}>
        <Text style={styles.countIcon}>📁</Text>
        <Text style={styles.countText}>案件 {item.project_count}件</Text>
      </View>
      <View style={styles.divider} />
      {item.customer_contact && <Text style={styles.meta} numberOfLines={1}>👤 {item.customer_contact}</Text>}
      {item.customer_phone && <Text style={styles.meta} numberOfLines={1}>📞 {item.customer_phone}</Text>}
      <Text style={styles.metaSub} numberOfLines={1}>最新: {item.latest_project}</Text>
    </TouchableOpacity>
  );

  const CreateModal = () => (
    <Modal visible={creating} transparent animationType="fade" onRequestClose={() => setCreating(false)}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.editHeader}>
            <Text style={styles.editHeaderTitle}>新規顧客を作成</Text>
            <TouchableOpacity onPress={() => setCreating(false)} style={styles.closeBtn}>
              <Text style={styles.closeBtnText}>✕</Text>
            </TouchableOpacity>
          </View>
          <ScrollView style={styles.editBody} keyboardShouldPersistTaps="handled">
            <FormLabel>前株（会社形態）</FormLabel>
            <View style={styles.chipGrid}>
              {PREFIX_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={[styles.chip, editPrefix === opt && styles.chipActive]} onPress={() => setEditPrefix(opt)}>
                  <Text style={[styles.chipText, editPrefix === opt && styles.chipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {editPrefix === '直接入力' && (
              <FormInput label="前株（自由記入）" value={editCustomPrefix} onChangeText={setEditCustomPrefix} placeholder="例）一般財団法人" />
            )}
            <FormInput label="会社名 *" value={editCompany} onChangeText={setEditCompany} placeholder="例）三幸" />
            <FormLabel>後株（会社形態）</FormLabel>
            <View style={styles.chipGrid}>
              {SUFFIX_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={[styles.chip, editSuffix === opt && styles.chipActive]} onPress={() => setEditSuffix(opt)}>
                  <Text style={[styles.chipText, editSuffix === opt && styles.chipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {editSuffix === '直接入力' && (
              <FormInput label="後株（自由記入）" value={editCustomSuffix} onChangeText={setEditCustomSuffix} placeholder="例）協同組合" />
            )}
            {(getPrefix() || editCompany || getSuffix()) ? (
              <View style={styles.preview}>
                <Text style={styles.previewLabel}>登録される会社名</Text>
                <Text style={styles.previewValue}>{fullCompany()}</Text>
              </View>
            ) : null}
            <FormInput label="フリガナ" value={editFurigana} onChangeText={setEditFurigana} placeholder="ゆうげんがいしゃ…" />
            <FormLabel>区分</FormLabel>
            <View style={[styles.chipGrid, { marginBottom: 16 }]}>
              {TYPE_OPTIONS.map(opt => (
                <TouchableOpacity key={opt} style={[styles.chip, editType === opt && styles.chipActive]} onPress={() => setEditType(opt)}>
                  <Text style={[styles.chipText, editType === opt && styles.chipTextActive]}>{opt}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <FormInput label="担当者名" value={editContact} onChangeText={setEditContact} placeholder="例）田中 太郎" />
            <FormInput label="電話番号" value={editPhone} onChangeText={setEditPhone} placeholder="例）03-xxxx-xxxx" keyboardType="phone-pad" />
            <FormInput label="住所" value={editAddress} onChangeText={setEditAddress} placeholder="例）東京都渋谷区…" />
          </ScrollView>
          <View style={styles.editFooter}>
            <TouchableOpacity style={styles.cancelBtn} onPress={() => setCreating(false)}>
              <Text style={styles.cancelBtnText}>キャンセル</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.saveBtn} onPress={handleCreate} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>登録する</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );

  const DetailModal = () => {
    if (!selected) return null;
    return (
      <Modal visible={!!selected} transparent animationType="fade" onRequestClose={() => { setEditing(false); setSelected(null); }}>
        <View style={styles.overlay}>
          <View style={styles.modal}>
            {editing ? (
              /* ===== 編集モード ===== */
              <>
                <View style={styles.editHeader}>
                  <Text style={styles.editHeaderTitle}>顧客情報を編集</Text>
                  <TouchableOpacity onPress={() => setEditing(false)} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>
                <ScrollView style={styles.editBody} keyboardShouldPersistTaps="handled">
                  <FormLabel>前株（会社形態）</FormLabel>
                  <View style={styles.chipGrid}>
                    {PREFIX_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt} style={[styles.chip, editPrefix === opt && styles.chipActive]} onPress={() => setEditPrefix(opt)}>
                        <Text style={[styles.chipText, editPrefix === opt && styles.chipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {editPrefix === '直接入力' && (
                    <FormInput label="前株（自由記入）" value={editCustomPrefix} onChangeText={setEditCustomPrefix} placeholder="例）一般財団法人" />
                  )}

                  <FormInput label="会社名 *" value={editCompany} onChangeText={setEditCompany} placeholder="例）三幸" />

                  <FormLabel>後株（会社形態）</FormLabel>
                  <View style={styles.chipGrid}>
                    {SUFFIX_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt} style={[styles.chip, editSuffix === opt && styles.chipActive]} onPress={() => setEditSuffix(opt)}>
                        <Text style={[styles.chipText, editSuffix === opt && styles.chipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  {editSuffix === '直接入力' && (
                    <FormInput label="後株（自由記入）" value={editCustomSuffix} onChangeText={setEditCustomSuffix} placeholder="例）協同組合" />
                  )}

                  {(getPrefix() || editCompany || getSuffix()) ? (
                    <View style={styles.preview}>
                      <Text style={styles.previewLabel}>保存される会社名</Text>
                      <Text style={styles.previewValue}>{fullCompany()}</Text>
                    </View>
                  ) : null}

                  <FormInput label="フリガナ" value={editFurigana} onChangeText={setEditFurigana} placeholder="ゆうげんがいしゃ…" />

                  <FormLabel>区分</FormLabel>
                  <View style={[styles.chipGrid, { marginBottom: 16 }]}>
                    {TYPE_OPTIONS.map(opt => (
                      <TouchableOpacity key={opt} style={[styles.chip, editType === opt && styles.chipActive]} onPress={() => setEditType(opt)}>
                        <Text style={[styles.chipText, editType === opt && styles.chipTextActive]}>{opt}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <FormInput label="担当者名" value={editContact} onChangeText={setEditContact} placeholder="例）田中 太郎" />
                  <FormInput label="電話番号" value={editPhone} onChangeText={setEditPhone} placeholder="例）03-xxxx-xxxx" keyboardType="phone-pad" />
                  <FormInput label="住所" value={editAddress} onChangeText={setEditAddress} placeholder="例）東京都渋谷区…" />
                </ScrollView>
                <View style={styles.editFooter}>
                  <TouchableOpacity style={styles.cancelBtn} onPress={() => setEditing(false)}>
                    <Text style={styles.cancelBtnText}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>保存する</Text>}
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              /* ===== 詳細表示モード ===== */
              <>
                <View style={[styles.modalHeader, { backgroundColor: typeColor(selected.customer_type) }]}>
                  <View style={{ flex: 1 }}>
                    {selected.customer_type && <Text style={styles.modalType}>{selected.customer_type}</Text>}
                    <Text style={styles.modalCompany}>{selected.customer_company}</Text>
                  </View>
                  <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(selected)}>
                    <Text style={styles.editBtnText}>✏️ 編集</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={() => setSelected(null)} style={styles.closeBtn}>
                    <Text style={styles.closeBtnText}>✕</Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.modalBody}>
                  <Text style={styles.sectionTitle}>基本情報</Text>
                  <View style={styles.infoBox}>
                    <InfoRow label="フリガナ" value={selected.customer_furigana} />
                    <InfoRow label="担当者" value={selected.customer_contact} />
                    <InfoRow label="電話番号" value={selected.customer_phone} />
                    <InfoRow label="住所" value={selected.customer_address} />
                    <InfoRow label="種別" value={selected.customer_type} />
                    <InfoRow label="案件数" value={`${selected.project_count}件`} />
                  </View>

                  <Text style={styles.sectionTitle}>関連案件（{selected.projects.length}件）</Text>
                  {selected.projects.map(p => (
                    <TouchableOpacity
                      key={p.id}
                      style={styles.projectRow}
                      onPress={() => { setSelected(null); navigation.navigate('ProjectDetail', { projectId: p.id }); }}
                    >
                      <View style={{ flex: 1 }}>
                        <Text style={styles.projectName}>{p.name}</Text>
                        {p.address && <Text style={styles.projectAddr} numberOfLines={1}>📍 {p.address}</Text>}
                        <Text style={styles.projectDate}>{p.created_at}</Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: (STATUS_COLOR[p.status] ?? '#374151') + '20' }]}>
                        <Text style={[styles.statusText, { color: STATUS_COLOR[p.status] ?? '#374151' }]}>{p.status}</Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </>
            )}
          </View>
        </View>
      </Modal>
    );
  };

  const columns: Customer[][] = Array.from({ length: cols }, () => []);
  filtered.forEach((c, i) => columns[i % cols].push(c));

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        {Platform.OS === 'web' && (
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Text style={styles.backText}>← 戻る</Text>
          </TouchableOpacity>
        )}
        <Text style={styles.title}>🏢 顧客一覧</Text>
        <TouchableOpacity style={styles.newBtn} onPress={openCreate}>
          <Text style={styles.newBtnText}>＋ 新規顧客</Text>
        </TouchableOpacity>
        {Platform.OS === 'web' && (
          <>
            <TouchableOpacity style={[styles.newBtn, { backgroundColor: '#e0f2fe' }]} onPress={() => fileInputRef.current?.click()}>
              <Text style={[styles.newBtnText, { color: '#0369a1' }]}>↑ CSV取込</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.newBtn, { backgroundColor: '#dcfce7' }]} onPress={handleExport}>
              <Text style={[styles.newBtnText, { color: '#15803d' }]}>↓ CSV出力</Text>
            </TouchableOpacity>
            <input ref={fileInputRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={handleFileSelect} />
          </>
        )}
        <Text style={styles.countBadge}>{filtered.length}社</Text>
      </View>

      <View style={styles.searchBar}>
        <TextInput
          style={styles.searchInput}
          placeholder="🔍 会社名・担当者・電話番号で検索..."
          value={search}
          onChangeText={setSearch}
          placeholderTextColor="#9ca3af"
        />
      </View>

      <ScrollView contentContainerStyle={styles.kanban}>
        {filtered.length === 0 ? (
          <Text style={styles.empty}>{loading ? '読み込み中...' : '顧客情報がありません'}</Text>
        ) : (
          <View style={styles.grid}>
            {columns.map((col, ci) => (
              <View key={ci} style={styles.col}>
                {col.map(item => <KanbanCard key={item.customer_company} item={item} />)}
              </View>
            ))}
          </View>
        )}
      </ScrollView>

      <DetailModal />
      <CreateModal />

      {/* CSVインポートプレビューモーダル */}
      {importPreview && (
        <Modal visible transparent animationType="fade" onRequestClose={() => setImportPreview(null)}>
          <View style={styles.overlay}>
            <View style={[styles.modal, { maxHeight: '85%' }]}>
              <View style={[styles.editHeader, { backgroundColor: '#0369a1' }]}>
                <Text style={styles.editHeaderTitle}>📥 CSVインポート確認</Text>
                <TouchableOpacity onPress={() => setImportPreview(null)} style={styles.closeBtn}>
                  <Text style={styles.closeBtnText}>✕</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.importSummary}>
                <View style={styles.importBadge}>
                  <Text style={styles.importBadgeText}>✅ 取込可能: {importPreview.valid.length}件</Text>
                </View>
                {importPreview.errors.length > 0 && (
                  <View style={[styles.importBadge, { backgroundColor: '#fef3c7' }]}>
                    <Text style={[styles.importBadgeText, { color: '#b45309' }]}>⚠️ スキップ: {importPreview.errors.length}件</Text>
                  </View>
                )}
              </View>

              <ScrollView style={{ maxHeight: 340, paddingHorizontal: 16 }}>
                {/* エラー行 */}
                {importPreview.errors.map((e, i) => (
                  <View key={i} style={styles.importErrorRow}>
                    <Text style={styles.importErrorText}>{e}</Text>
                  </View>
                ))}
                {/* 有効行プレビュー */}
                <View style={styles.importTable}>
                  <View style={[styles.importTableRow, { backgroundColor: '#f1f5f9' }]}>
                    <Text style={[styles.importCell, styles.importHeaderCell]}>会社名</Text>
                    <Text style={[styles.importCell, styles.importHeaderCell]}>区分</Text>
                    <Text style={[styles.importCell, styles.importHeaderCell]}>担当者</Text>
                  </View>
                  {importPreview.valid.map((row, i) => (
                    <View key={i} style={[styles.importTableRow, i % 2 === 0 ? {} : { backgroundColor: '#f8fafc' }]}>
                      <Text style={styles.importCell} numberOfLines={1}>{row['会社名']}</Text>
                      <Text style={[styles.importCell, { color: '#64748b', fontSize: 11 }]} numberOfLines={1}>{row['区分'] || '—'}</Text>
                      <Text style={[styles.importCell, { color: '#64748b', fontSize: 11 }]} numberOfLines={1}>{row['担当者名'] || '—'}</Text>
                    </View>
                  ))}
                </View>
              </ScrollView>

              <View style={styles.editFooter}>
                <TouchableOpacity style={styles.cancelBtn} onPress={() => setImportPreview(null)}>
                  <Text style={styles.cancelBtnText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.saveBtn, { backgroundColor: '#0369a1' }]}
                  onPress={handleImport}
                  disabled={importing || importPreview.valid.length === 0}
                >
                  {importing
                    ? <ActivityIndicator color="#fff" size="small" />
                    : <Text style={styles.saveBtnText}>登録する（{importPreview.valid.length}件）</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

function InfoRow({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={styles.infoValue}>{value}</Text>
    </View>
  );
}

function FormLabel({ children }: { children: string }) {
  return <Text style={styles.formLabel}>{children}</Text>;
}

function FormInput({ label, value, onChangeText, placeholder, keyboardType }: {
  label: string; value: string; onChangeText: (t: string) => void;
  placeholder?: string; keyboardType?: any;
}) {
  return (
    <View style={styles.formGroup}>
      <Text style={styles.formLabel}>{label}</Text>
      <TextInput
        style={styles.formInput}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType ?? 'default'}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#0e7490', paddingHorizontal: 16, paddingVertical: 12 },
  backBtn: { paddingRight: 8 },
  backText: { color: '#fff', fontSize: 14 },
  title: { flex: 1, fontSize: 18, fontWeight: 'bold', color: '#fff' },
  newBtn: { backgroundColor: '#fff', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  newBtnText: { color: '#0e7490', fontWeight: '800', fontSize: 13 },
  countBadge: { backgroundColor: 'rgba(255,255,255,0.25)', color: '#fff', fontWeight: 'bold', fontSize: 13, paddingHorizontal: 10, paddingVertical: 3, borderRadius: 12 },
  searchBar: { backgroundColor: '#fff', padding: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchInput: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 13, color: '#111827' },
  kanban: { padding: 12 },
  grid: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  col: { flex: 1, gap: 10 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 12, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, borderLeftWidth: 3, borderLeftColor: '#0e7490' },
  typeBadge: { alignSelf: 'flex-start', borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2, marginBottom: 6 },
  typeText: { fontSize: 10, fontWeight: 'bold' },
  furigana: { fontSize: 9, color: '#9ca3af', marginBottom: 2 },
  company: { fontSize: 13, fontWeight: 'bold', color: '#111827', marginBottom: 6 },
  countRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 6 },
  countIcon: { fontSize: 11 },
  countText: { fontSize: 11, color: '#0e7490', fontWeight: '600' },
  divider: { height: 1, backgroundColor: '#f3f4f6', marginBottom: 6 },
  meta: { fontSize: 11, color: '#374151', marginBottom: 2 },
  metaSub: { fontSize: 10, color: '#9ca3af', marginTop: 2 },
  empty: { textAlign: 'center', color: '#9ca3af', marginTop: 60, fontSize: 14 },

  // モーダル共通
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  modal: { backgroundColor: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, maxHeight: '90%', overflow: 'hidden' },
  closeBtn: { width: 30, height: 30, borderRadius: 15, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center', marginLeft: 8 },
  closeBtnText: { fontSize: 14, color: '#fff', fontWeight: '700' },

  // 詳細モード
  modalHeader: { flexDirection: 'row', alignItems: 'center', padding: 16 },
  modalType: { fontSize: 11, color: '#fff', opacity: 0.85, marginBottom: 2 },
  modalCompany: { fontSize: 20, fontWeight: 'bold', color: '#fff' },
  editBtn: { backgroundColor: 'rgba(255,255,255,0.25)', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 6 },
  editBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  modalBody: { padding: 16 },
  sectionTitle: { fontSize: 12, fontWeight: '800', color: '#6b7280', marginTop: 8, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.8 },
  infoBox: { backgroundColor: '#f9fafb', borderRadius: 10, padding: 12, marginBottom: 16, gap: 8 },
  infoRow: { flexDirection: 'row', gap: 8 },
  infoLabel: { width: 70, fontSize: 13, color: '#9ca3af' },
  infoValue: { flex: 1, fontSize: 13, color: '#111827', fontWeight: '600' },
  projectRow: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#f9fafb', borderRadius: 8, marginBottom: 8, gap: 10 },
  projectName: { fontSize: 13, fontWeight: '600', color: '#111827', marginBottom: 2 },
  projectAddr: { fontSize: 11, color: '#6b7280', marginBottom: 2 },
  projectDate: { fontSize: 11, color: '#9ca3af' },
  statusBadge: { borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
  statusText: { fontSize: 11, fontWeight: 'bold' },

  // 編集モード
  editHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9', backgroundColor: '#1a56db' },
  editHeaderTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  editBody: { padding: 16, maxHeight: 480 },
  editFooter: { flexDirection: 'row', gap: 12, padding: 16, borderTopWidth: 1, borderTopColor: '#f1f5f9' },
  cancelBtn: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#d1d5db', alignItems: 'center' },
  cancelBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  saveBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, backgroundColor: '#1a56db', alignItems: 'center' },
  saveBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
  // フォーム
  formGroup: { marginBottom: 14 },
  formLabel: { fontSize: 12, fontWeight: '700', color: '#64748b', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
  formInput: { backgroundColor: '#f8fafc', borderRadius: 10, borderWidth: 1.5, borderColor: '#e2e8f0', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: '#0f172a' },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 14 },
  chip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f8fafc' },
  chipActive: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  chipText: { fontSize: 12, fontWeight: '600', color: '#6b7280' },
  chipTextActive: { color: '#1a56db' },
  preview: { backgroundColor: '#f0fdf4', borderRadius: 8, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#86efac' },
  previewLabel: { fontSize: 11, color: '#15803d', marginBottom: 2 },
  previewValue: { fontSize: 15, fontWeight: '700', color: '#15803d' },
  importSummary: { flexDirection: 'row', gap: 10, padding: 16, paddingBottom: 8 },
  importBadge: { backgroundColor: '#dcfce7', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 6 },
  importBadgeText: { fontSize: 13, fontWeight: '700', color: '#15803d' },
  importErrorRow: { backgroundColor: '#fef3c7', borderRadius: 6, padding: 8, marginBottom: 4 },
  importErrorText: { fontSize: 12, color: '#b45309' },
  importTable: { borderRadius: 8, overflow: 'hidden', borderWidth: 1, borderColor: '#e2e8f0', marginBottom: 12 },
  importTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  importCell: { flex: 1, padding: 8, fontSize: 12, color: '#111827' },
  importHeaderCell: { fontWeight: '700', color: '#374151', fontSize: 11 },
});
