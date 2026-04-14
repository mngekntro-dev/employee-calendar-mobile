import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  TextInput, ScrollView, RefreshControl, Alert, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchCases, deleteCase, GeneratorCase, CaseStatus } from '../../lib/generators';
import LoadingOverlay from '../../components/LoadingOverlay';

const STATUS_LIST: { value: CaseStatus; label: string; color: string }[] = [
  { value: 'draft',     label: '下書き',  color: '#9ca3af' },
  { value: 'active',    label: '実施中',  color: '#1D9E75' },
  { value: 'completed', label: '完了',    color: '#3b82f6' },
  { value: 'cancelled', label: '中止',    color: '#ef4444' },
];
const WORK_TYPES = ['負荷試験', '点検', '修理', 'その他'];
const isNew = (c: GeneratorCase) =>
  Date.now() - new Date(c.updated_at ?? c.created_at).getTime() < 24 * 60 * 60 * 1000;
const statusInfo = (v: string) => STATUS_LIST.find(s => s.value === v) ?? STATUS_LIST[0];

interface Props { navigation: any; }

export default function GeneratorListScreen({ navigation }: Props) {
  const [cases, setCases] = useState<GeneratorCase[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [filterStatus, setFilterStatus] = useState<CaseStatus | ''>('');
  const [filterType, setFilterType] = useState('');

  const load = useCallback(async () => {
    try { const data = await fetchCases(); setCases(data); }
    catch (e: any) { Alert.alert('エラー', e.message); }
  }, []);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]));

  const onRefresh = async () => { setRefreshing(true); await load(); setRefreshing(false); };

  const filtered = cases.filter(c => {
    if (search) {
      const q = search.toLowerCase();
      if (!(c.name ?? '').toLowerCase().includes(q) &&
          !(c.address ?? '').toLowerCase().includes(q) &&
          !(c.client_name ?? '').toLowerCase().includes(q)) return false;
    }
    if (filterStatus && c.status !== filterStatus) return false;
    if (filterType && c.work_type !== filterType) return false;
    return true;
  });

  const handleDelete = (id: string, name: string) => {
    const doDelete = async () => {
      try { await deleteCase(id); await load(); }
      catch (e: any) { Alert.alert('エラー', e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`「${name}」を削除しますか？`)) doDelete();
    } else {
      Alert.alert('削除', `「${name}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  if (loading) return <LoadingOverlay />;

  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>⚡ 発電機管理</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <TouchableOpacity style={styles.newBtn} onPress={() => navigation.navigate('GeneratorForm', {})}>
              <Text style={styles.newBtnText}>＋ 新規案件登録</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.genListBtn} onPress={() => navigation.navigate('GeneratorMaster', {})}>
              <Text style={styles.genListBtnText}>🔧 発電機台帳</Text>
            </TouchableOpacity>
          </View>
        </View>
        <View style={styles.webFilterBar}>
          <TextInput style={styles.webSearch} placeholder="案件名・住所・顧客名で検索..." value={search} onChangeText={setSearch} />
          {WORK_TYPES.map(t => (
            <TouchableOpacity key={t} style={[styles.chip, filterType === t && styles.chipActive]} onPress={() => setFilterType(prev => prev === t ? '' : t)}>
              <Text style={[styles.chipText, filterType === t && styles.chipTextActive]}>{t}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.kanban}>
          {STATUS_LIST.map(status => {
            const col = filtered.filter(c => c.status === status.value)
              .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
            return (
              <View key={status.value} style={styles.kanbanCol}>
                <View style={[styles.kanbanHeader, { borderTopColor: status.color }]}>
                  <Text style={[styles.kanbanHeaderLabel, { color: status.color }]}>{status.label}</Text>
                  <View style={[styles.kanbanBadge, { backgroundColor: status.color }]}>
                    <Text style={styles.kanbanBadgeText}>{col.length}</Text>
                  </View>
                </View>
                <ScrollView style={styles.kanbanScroll} showsVerticalScrollIndicator={false}>
                  {col.length === 0 ? <Text style={styles.kanbanEmpty}>案件なし</Text> : col.map(item => (
                    <TouchableOpacity key={item.id} style={styles.card} onPress={() => navigation.navigate('GeneratorDetail', { caseId: item.id })}>
                      {isNew(item) && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
                      <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                      <View style={styles.cardRow}>
                        <Text style={styles.cardTag}>{item.work_type}</Text>
                        <Text style={styles.cardDate}>{item.work_date ?? '日程未定'}</Text>
                      </View>
                      {item.address ? <Text style={styles.cardSub} numberOfLines={1}>📍 {item.address}</Text> : null}
                      {item.staff_name ? <Text style={styles.cardSub}>👤 {item.staff_name}</Text> : null}
                      <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item.id, item.name)}>
                        <Text style={styles.deleteBtnText}>削除</Text>
                      </TouchableOpacity>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.searchRow}>
        <TextInput style={styles.searchInput} placeholder="案件名・住所・顧客名で検索..." value={search} onChangeText={setSearch} clearButtonMode="while-editing" />
      </View>
      <View style={styles.filterRow}>
        {STATUS_LIST.map(s => (
          <TouchableOpacity key={s.value} style={[styles.chip, filterStatus === s.value && { backgroundColor: s.color, borderColor: s.color }]}
            onPress={() => setFilterStatus(prev => prev === s.value ? '' : s.value as CaseStatus)}>
            <Text style={[styles.chipText, filterStatus === s.value && styles.chipTextActive]}>{s.label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      <FlatList
        data={filtered} keyExtractor={i => i.id} contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => {
          const st = statusInfo(item.status);
          return (
            <TouchableOpacity style={styles.card} onPress={() => navigation.navigate('GeneratorDetail', { caseId: item.id })}>
              {isNew(item) && <View style={styles.newBadge}><Text style={styles.newBadgeText}>NEW</Text></View>}
              <View style={styles.cardHeaderRow}>
                <Text style={styles.cardTitle} numberOfLines={2}>{item.name}</Text>
                <View style={[styles.statusChip, { backgroundColor: st.color }]}><Text style={styles.statusChipText}>{st.label}</Text></View>
              </View>
              <View style={styles.cardRow}>
                <Text style={styles.cardTag}>{item.work_type}</Text>
                <Text style={styles.cardDate}>{item.work_date ?? '日程未定'}</Text>
              </View>
              {item.address ? <Text style={styles.cardSub} numberOfLines={1}>📍 {item.address}</Text> : null}
              {item.staff_name ? <Text style={styles.cardSub}>👤 {item.staff_name}</Text> : null}
            </TouchableOpacity>
          );
        }}
        ListEmptyComponent={<View style={styles.empty}><Text style={styles.emptyIcon}>⚡</Text><Text style={styles.emptyText}>案件がありません</Text></View>}
      />
      <TouchableOpacity style={styles.fab} onPress={() => navigation.navigate('GeneratorForm', {})}>
        <Text style={styles.fabText}>＋</Text>
      </TouchableOpacity>
    </View>
  );
}

const C = '#1D9E75';
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  topBarTitle: { fontSize: 20, fontWeight: '800', color: C },
  newBtn: { backgroundColor: C, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8 },
  newBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  genListBtn: { backgroundColor: '#f3f4f6', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: '#d1d5db' },
  genListBtnText: { color: '#374151', fontWeight: '600', fontSize: 14 },
  webFilterBar: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8, paddingHorizontal: 16, paddingVertical: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  webSearch: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, fontSize: 14, minWidth: 240, borderWidth: 1, borderColor: '#e5e7eb' },
  chip: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16, backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb' },
  chipActive: { backgroundColor: C, borderColor: C },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  kanban: { flexDirection: 'row', alignItems: 'flex-start', padding: 16, gap: 12, minHeight: '100%' },
  kanbanCol: { width: 280, backgroundColor: '#f9fafb', borderRadius: 12, borderWidth: 1, borderColor: '#e5e7eb', flexShrink: 0, maxHeight: '85vh' as any, display: 'flex' as any, flexDirection: 'column' },
  kanbanHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#fff', borderTopWidth: 4, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  kanbanHeaderLabel: { fontSize: 15, fontWeight: '800' },
  kanbanBadge: { minWidth: 24, height: 24, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6 },
  kanbanBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  kanbanScroll: { flex: 1, padding: 8 },
  kanbanEmpty: { textAlign: 'center', color: '#9ca3af', paddingVertical: 32, fontSize: 13 },
  searchRow: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  searchInput: { backgroundColor: '#f3f4f6', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  list: { padding: 12, paddingBottom: 80 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2, position: 'relative' },
  newBadge: { position: 'absolute', top: 8, right: 8, backgroundColor: '#ef4444', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827', flex: 1, marginRight: 8 },
  statusChip: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10 },
  statusChipText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
  cardTag: { backgroundColor: '#d1fae5', color: '#065f46', fontSize: 12, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8 },
  cardDate: { fontSize: 13, color: '#6b7280' },
  cardSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  deleteBtn: { marginTop: 8, alignSelf: 'flex-end' },
  deleteBtnText: { fontSize: 12, color: '#ef4444', fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 16, fontWeight: '700', color: '#6b7280' },
  fab: { position: 'absolute', right: 20, bottom: 24, width: 56, height: 56, borderRadius: 28, backgroundColor: C, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, elevation: 6 },
  fabText: { color: '#fff', fontSize: 28, fontWeight: '300', lineHeight: 32 },
});
