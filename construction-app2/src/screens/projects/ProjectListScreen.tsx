import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity,
  Alert, RefreshControl, Platform, TextInput, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import ProjectCard from '../../components/ProjectCard';
import Button from '../../components/Button';
import LoadingOverlay from '../../components/LoadingOverlay';
import { getOrCreateRoom } from '../../lib/chatRoom';

const STATUS_OPTIONS = [
  { value: 'inquiry',   label: '引き合い', color: '#f59e0b' },
  { value: 'planning',  label: '計画中',   color: '#3b82f6' },
  { value: 'active',    label: '施工中',   color: '#059669' },
  { value: 'completed', label: '完了',     color: '#6b7280' },
  { value: 'paused',    label: '一時停止', color: '#ef4444' },
];

const isNew = (p: any) => {
  const t = new Date(p.updated_at ?? p.created_at).getTime();
  return Date.now() - t < 24 * 60 * 60 * 1000;
};

interface Props { navigation: any; }

export default function ProjectListScreen({ navigation }: Props) {
  const { profile, signOut } = useAuth();
  const [allProjects, setAllProjects] = useState<any[]>([]);
  const [allMembers, setAllMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const [searchText, setSearchText] = useState('');
  const [filterMyOnly, setFilterMyOnly] = useState(false);
  const [filterStatuses, setFilterStatuses] = useState<string[]>([]);
  const [filterMembers, setFilterMembers] = useState<string[]>([]);

  const isAdmin = profile?.role === 'admin';
  const canCreate = profile?.role === 'admin' || profile?.role === 'employee';

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, members:project_members(user_id, profile:profiles!project_members_user_id_fkey(full_name))')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setAllProjects(data ?? []);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setAllMembers(profiles ?? []);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '案件の取得に失敗しました');
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchProjects().finally(() => setLoading(false));
    }, [fetchProjects])
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchProjects();
    setRefreshing(false);
  };

  const handleGlobalChat = async () => {
    try {
      const roomId = await getOrCreateRoom('global');
      navigation.navigate('Chat', { roomId, roomType: 'global', title: '全体チャット' });
    } catch {
      Alert.alert('エラー', 'チャットを開けませんでした');
    }
  };

  const filtered = allProjects.filter((p) => {
    if (searchText) {
      const q = searchText.toLowerCase();
      const hit = (p.name ?? '').toLowerCase().includes(q)
        || (p.address ?? '').toLowerCase().includes(q)
        || (p.customer_company ?? '').toLowerCase().includes(q);
      if (!hit) return false;
    }
    if (filterMyOnly) {
      const isMember = (p.members ?? []).some((m: any) => m.user_id === profile?.id);
      if (!isMember) return false;
    }
    if (filterStatuses.length > 0 && !filterStatuses.includes(p.status)) return false;
    if (filterMembers.length > 0) {
      const memberIds = (p.members ?? []).map((m: any) => m.user_id);
      if (!filterMembers.some((id) => memberIds.includes(id))) return false;
    }
    return true;
  });

  const toggleStatus = (v: string) =>
    setFilterStatuses((prev) => prev.includes(v) ? prev.filter((x) => x !== v) : [...prev, v]);
  const toggleMember = (id: string) =>
    setFilterMembers((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  const activeFilterCount = (filterMyOnly ? 1 : 0) + filterStatuses.length + filterMembers.length;

  const handleLogout = () => {
    if (Platform.OS === 'web') {
      if (window.confirm('ログアウトしますか？')) signOut();
      return;
    }
    Alert.alert('ログアウト', 'ログアウトしますか？', [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'ログアウト', style: 'destructive', onPress: signOut },
    ]);
  };

  if (loading) return <LoadingOverlay />;

  // ─── PC版カンバンボード ───────────────────────────────
  if (Platform.OS === 'web') {
    return (
      <View style={styles.container}>
        {/* トップバー */}
        <View style={styles.topBar}>
          <Text style={styles.topBarTitle}>案件一覧</Text>
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            {canCreate && (
              <TouchableOpacity
                style={styles.createBtnTop}
                onPress={() => navigation.navigate('ProjectForm', {})}
              >
                <Text style={styles.createBtnTopText}>＋ 新規作成</Text>
              </TouchableOpacity>
            )}
            {isAdmin && (
              <TouchableOpacity
                style={styles.memberBtnTop}
                onPress={() => navigation.navigate('UserMgmt')}
              >
                <Text style={styles.memberBtnTopText}>👥 メンバー管理</Text>
              </TouchableOpacity>
            )}
            <TouchableOpacity style={styles.chatBtn} onPress={handleGlobalChat}>
              <Text style={styles.chatBtnText}>💬 全体チャット</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={handleLogout}>
              <Text style={styles.logoutTextTop}>ログアウト</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* 検索・フィルター */}
        <View style={styles.webFilterBar}>
          <TextInput
            style={styles.webSearchInput}
            placeholder="案件名・住所・会社名で検索..."
            value={searchText}
            onChangeText={setSearchText}
          />
          <TouchableOpacity
            style={[styles.chip, filterMyOnly && styles.chipActive]}
            onPress={() => setFilterMyOnly(!filterMyOnly)}
          >
            <Text style={[styles.chipText, filterMyOnly && styles.chipTextActive]}>担当案件のみ</Text>
          </TouchableOpacity>
          {allMembers.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, filterMembers.includes(m.id) && styles.chipActive]}
              onPress={() => toggleMember(m.id)}
            >
              <Text style={[styles.chipText, filterMembers.includes(m.id) && styles.chipTextActive]}>
                {m.full_name}
              </Text>
            </TouchableOpacity>
          ))}
          {activeFilterCount > 0 && (
            <TouchableOpacity style={styles.resetBtn} onPress={() => {
              setFilterMyOnly(false); setFilterStatuses([]); setFilterMembers([]);
            }}>
              <Text style={styles.resetText}>リセット</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* カンバンボード */}
        <ScrollView horizontal style={{ flex: 1 }} contentContainerStyle={styles.kanbanContainer}>
          {STATUS_OPTIONS.map((status) => {
            const col = filtered
              .filter((p) => p.status === status.value)
              .sort((a, b) =>
                new Date(b.updated_at ?? b.created_at).getTime() -
                new Date(a.updated_at ?? a.created_at).getTime()
              );
            return (
              <View key={status.value} style={styles.kanbanCol}>
                {/* 列ヘッダー */}
                <View style={[styles.kanbanHeader, { borderTopColor: status.color }]}>
                  <Text style={[styles.kanbanHeaderLabel, { color: status.color }]}>
                    {status.label}
                  </Text>
                  <View style={[styles.kanbanBadge, { backgroundColor: status.color }]}>
                    <Text style={styles.kanbanBadgeText}>{col.length}</Text>
                  </View>
                </View>

                {/* 案件カード列 */}
                <ScrollView
                  style={styles.kanbanScroll}
                  showsVerticalScrollIndicator={false}
                >
                  {col.length === 0 ? (
                    <View style={styles.kanbanEmpty}>
                      <Text style={styles.kanbanEmptyText}>案件なし</Text>
                    </View>
                  ) : col.map((item) => (
                    <View key={item.id} style={styles.kanbanCardWrap}>
                      {isNew(item) && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      )}
                      <ProjectCard
                        project={item}
                        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
                      />
                    </View>
                  ))}
                </ScrollView>
              </View>
            );
          })}
        </ScrollView>
      </View>
    );
  }

  // ─── モバイル版（変更なし）────────────────────────────
  return (
    <View style={styles.container}>
      <View style={styles.topBar}>
        <Text style={styles.topBarTitle}>案件一覧</Text>
        <TouchableOpacity style={styles.chatBtn} onPress={handleGlobalChat}>
          <Text style={styles.chatBtnText}>💬 全体チャット</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.searchRow}>
        <TextInput
          style={styles.searchInput}
          placeholder="案件名・住所・会社名で検索..."
          value={searchText}
          onChangeText={setSearchText}
          clearButtonMode="while-editing"
        />
      </View>
      <View style={styles.filterPanel}>
        <View style={styles.filterSection}>
          <TouchableOpacity style={styles.checkRow} onPress={() => setFilterMyOnly(!filterMyOnly)}>
            <View style={[styles.checkbox, filterMyOnly && styles.checkboxChecked]}>
              {filterMyOnly && <Text style={styles.checkMark}>✓</Text>}
            </View>
            <Text style={styles.checkLabel}>担当案件のみ</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.filterTitle}>案件進捗</Text>
        <View style={styles.chipRow}>
          {STATUS_OPTIONS.map((s) => (
            <TouchableOpacity
              key={s.value}
              style={[styles.chip, filterStatuses.includes(s.value) && styles.chipActive]}
              onPress={() => toggleStatus(s.value)}
            >
              <Text style={[styles.chipText, filterStatuses.includes(s.value) && styles.chipTextActive]}>
                {s.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.filterTitle}>個人名</Text>
        <View style={styles.chipRow}>
          {allMembers.map((m) => (
            <TouchableOpacity
              key={m.id}
              style={[styles.chip, filterMembers.includes(m.id) && styles.chipActive]}
              onPress={() => toggleMember(m.id)}
            >
              <Text style={[styles.chipText, filterMembers.includes(m.id) && styles.chipTextActive]}>
                {m.full_name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        {activeFilterCount > 0 && (
          <TouchableOpacity style={styles.resetBtn} onPress={() => {
            setFilterMyOnly(false); setFilterStatuses([]); setFilterMembers([]);
          }}>
            <Text style={styles.resetText}>絞込をリセット</Text>
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <ProjectCard
            project={item}
            onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
          />
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>📂</Text>
            <Text style={styles.emptyText}>
              {searchText || activeFilterCount > 0 ? '条件に一致する案件がありません' : '案件がありません'}
            </Text>
          </View>
        }
        ListHeaderComponent={
          canCreate ? (
            <View style={styles.headerBtnRow}>
              <Button
                title="＋ 案件を新規作成"
                onPress={() => navigation.navigate('ProjectForm', {})}
                fullWidth
                style={styles.createBtn}
              />
            </View>
          ) : null
        }
      />
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout}>
        <Text style={styles.logoutText}>ログアウト</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f3f4f6' },
  topBar: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  topBarTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  chatBtn: {
    backgroundColor: '#059669', paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 20,
  },
  chatBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  createBtnTop: {
    backgroundColor: '#1a56db', paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 8,
  },
  createBtnTopText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  memberBtnTop: {
    backgroundColor: '#059669', paddingHorizontal: 14,
    paddingVertical: 8, borderRadius: 8,
  },
  memberBtnTopText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  logoutTextTop: { fontSize: 13, color: '#ef4444', fontWeight: '600', paddingHorizontal: 8 },
  // Web フィルターバー
  webFilterBar: {
    flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 8,
    paddingHorizontal: 16, paddingVertical: 10,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  webSearchInput: {
    backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 7, fontSize: 14,
    minWidth: 240, borderWidth: 1, borderColor: '#e5e7eb',
  },
  // カンバンボード
  kanbanContainer: {
    flexDirection: 'row', alignItems: 'flex-start',
    padding: 16, gap: 12, minHeight: '100%',
  },
  kanbanCol: {
    width: 280, backgroundColor: '#f9fafb',
    borderRadius: 12, overflow: 'hidden',
    borderWidth: 1, borderColor: '#e5e7eb',
    flexShrink: 0, maxHeight: '85vh' as any,
    display: 'flex' as any, flexDirection: 'column',
  },
  kanbanHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12,
    backgroundColor: '#fff', borderTopWidth: 4,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  kanbanHeaderLabel: { fontSize: 15, fontWeight: '800' },
  kanbanBadge: {
    minWidth: 24, height: 24, borderRadius: 12,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  kanbanBadgeText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  kanbanScroll: { flex: 1, padding: 8 },
  kanbanCardWrap: { position: 'relative', marginBottom: 4 },
  kanbanEmpty: {
    alignItems: 'center', paddingVertical: 32,
  },
  kanbanEmptyText: { fontSize: 13, color: '#9ca3af' },
  newBadge: {
    position: 'absolute', top: 8, right: 8, zIndex: 10,
    backgroundColor: '#ef4444', borderRadius: 6,
    paddingHorizontal: 6, paddingVertical: 2,
  },
  newBadgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  // モバイル共通
  searchRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 8,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', gap: 8,
  },
  searchInput: {
    flex: 1, backgroundColor: '#f3f4f6', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 8, fontSize: 14,
  },
  filterPanel: {
    backgroundColor: '#fff', paddingHorizontal: 16, paddingVertical: 12,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  filterSection: { marginBottom: 8 },
  filterTitle: { fontSize: 12, fontWeight: '700', color: '#6b7280', marginTop: 8, marginBottom: 6 },
  checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  checkbox: {
    width: 20, height: 20, borderRadius: 4,
    borderWidth: 2, borderColor: '#d1d5db',
    alignItems: 'center', justifyContent: 'center',
  },
  checkboxChecked: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  checkMark: { color: '#fff', fontSize: 13, fontWeight: '700' },
  checkLabel: { fontSize: 14, color: '#374151' },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
  chip: {
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
    backgroundColor: '#f3f4f6', borderWidth: 1, borderColor: '#e5e7eb',
  },
  chipActive: { backgroundColor: '#1a56db', borderColor: '#1a56db' },
  chipText: { fontSize: 13, color: '#374151' },
  chipTextActive: { color: '#fff', fontWeight: '600' },
  resetBtn: { marginTop: 6 },
  resetText: { fontSize: 13, color: '#ef4444' },
  list: { padding: 16, paddingBottom: 60 },
  createBtn: { marginBottom: 16 },
  headerBtnRow: { marginBottom: 8 },
  empty: { alignItems: 'center', marginTop: 80 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 18, fontWeight: '700', color: '#6b7280', marginBottom: 6 },
  logoutBtn: {
    padding: 14, alignItems: 'center',
    borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#fff',
  },
  logoutText: { color: '#ef4444', fontSize: 15, fontWeight: '600' },
});
