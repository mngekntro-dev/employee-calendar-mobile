import React, { useCallback, useEffect, useRef, useState } from 'react';
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

// モジュールスコープ変数（HTML5 DnD廃止・マウスイベント方式）
let _globalDragId: string | null = null;

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

  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<string | null>(null);
  const dragIdRef  = useRef<string | null>(null);
  const ghostRef   = useRef<HTMLDivElement | null>(null);

  const isAdmin = profile?.role === 'admin';
  const canCreate = profile?.role === 'admin' || profile?.role === 'employee';

  const fetchProjects = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('projects')
        .select('*, created_by, members:project_members(user_id, profile:profiles!project_members_user_id_fkey(full_name))')
        .order('updated_at', { ascending: false });
      if (error) throw error;
      setAllProjects(data ?? []);
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').order('full_name');
      setAllMembers(profiles ?? []);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '案件の取得に失敗しました');
    }
  }, []);

  // クロージャ問題を回避するためrefでprojectsを保持
  const projectsRef = useRef<any[]>([]);
  useEffect(() => { projectsRef.current = allProjects; }, [allProjects]);

  // マウスイベントベースのドラッグ実装（HTML5 DnD API完全廃止）
  useEffect(() => {
    if (Platform.OS !== 'web') return;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragIdRef.current) return;
      if (ghostRef.current) {
        ghostRef.current.style.left = `${e.clientX - 80}px`;
        ghostRef.current.style.top  = `${e.clientY - 20}px`;
      }
      const el  = document.elementFromPoint(e.clientX, e.clientY);
      const col = (el as Element)?.closest?.('[data-kanban-col]');
      setDragOverStatus(col?.getAttribute('data-kanban-col') ?? null);
    };

    const onMouseUp = async (e: MouseEvent) => {
      const id = dragIdRef.current;
      dragIdRef.current = null;
      ghostRef.current?.remove();
      ghostRef.current = null;
      setDraggedId(null);
      setDragOverStatus(null);
      if (!id) return;

      const el  = document.elementFromPoint(e.clientX, e.clientY);
      const col = (el as Element)?.closest?.('[data-kanban-col]');
      const newStatus = col?.getAttribute('data-kanban-col');
      if (!newStatus) return;

      const proj = projectsRef.current.find(p => p.id === id);
      if (!proj || proj.status === newStatus) return;

      setAllProjects(prev =>
        prev.map(p => p.id === id
          ? { ...p, status: newStatus, updated_at: new Date().toISOString() }
          : p)
      );
      const { error } = await supabase
        .from('projects')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);
      if (error) { Alert.alert('更新失敗', error.message); fetchProjects(); }
    };

    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup',   onMouseUp);
    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup',   onMouseUp);
      ghostRef.current?.remove();
    };
  }, [fetchProjects]);

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
      const isMember = (p.members ?? []).some((m: any) => m.user_id === profile?.id) || p.created_by === profile?.id;
      if (!isMember) return false;
    }
    if (filterStatuses.length > 0 && !filterStatuses.includes(p.status)) return false;
    if (filterMembers.length > 0) {
      const memberIds = (p.members ?? []).map((m: any) => m.user_id);
      if (p.created_by) memberIds.push(p.created_by);
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
            {isAdmin && (
              <TouchableOpacity
                style={[styles.memberBtnTop, { backgroundColor: '#0e7490' }]}
                onPress={() => navigation.navigate('CustomerList')}
              >
                <Text style={styles.memberBtnTopText}>🏢 顧客一覧</Text>
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
        <div style={{ display: 'flex', flex: 1, overflowX: 'auto', gap: 12, padding: 16, alignItems: 'flex-start' }}>
          {STATUS_OPTIONS.map((status) => {
            const col = filtered
              .filter((p) => p.status === status.value)
              .sort((a, b) =>
                new Date(b.updated_at ?? b.created_at).getTime() -
                new Date(a.updated_at ?? a.created_at).getTime()
              );
            const isOver = dragOverStatus === status.value;
            return (
              <div
                key={status.value}
                data-kanban-col={status.value}
                style={{
                  minWidth: 260, maxWidth: 300, flex: '0 0 auto',
                  backgroundColor: isOver ? status.color + '12' : '#f8fafc',
                  border: isOver ? `2px dashed ${status.color}` : '2px solid #e2e8f0',
                  borderRadius: 14, display: 'flex', flexDirection: 'column',
                  maxHeight: 'calc(100vh - 180px)', overflow: 'hidden',
                  transition: 'all 0.15s ease',
                }}
              >
                {/* 列ヘッダー */}
                <div style={{ borderTop: `4px solid ${status.color}`, borderRadius: '12px 12px 0 0', padding: '12px 14px', display: 'flex', alignItems: 'center', gap: 8, backgroundColor: '#fff' }}>
                  <span style={{ fontSize: 13, fontWeight: 800, color: status.color }}>{status.label}</span>
                  <span style={{ backgroundColor: status.color, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 11, fontWeight: 700 }}>{col.length}</span>
                </div>

                {/* カード一覧 */}
                <div style={{ overflowY: 'auto', padding: 8, display: 'flex', flexDirection: 'column', gap: 6, flex: 1, minHeight: 120 }}>
                  {isOver && draggedId && (
                    <div style={{ border: `2px dashed ${status.color}`, borderRadius: 10, padding: 12, textAlign: 'center', color: status.color, fontSize: 13, fontWeight: 700, backgroundColor: '#fff' }}>
                      ここにドロップ
                    </div>
                  )}
                  {col.length === 0 && !isOver && (
                    <div style={{ textAlign: 'center', padding: 32, color: '#cbd5e1', fontSize: 13 }}>案件なし</div>
                  )}
                  {col.map((item) => (
                    <div key={item.id} style={{ position: 'relative' }}>
                      {isNew(item) && (
                        <View style={styles.newBadge}>
                          <Text style={styles.newBadgeText}>NEW</Text>
                        </View>
                      )}
                      <ProjectCard
                        project={item}
                        onPress={() => navigation.navigate('ProjectDetail', { projectId: item.id })}
                      />
                      {/* ステータス変更セレクト */}
                      <select
                        value={item.status}
                        onChange={async (e: any) => {
                          const newStatus = e.target.value;
                          if (!newStatus || newStatus === item.status) return;
                          setAllProjects(prev =>
                            prev.map(p => p.id === item.id
                              ? { ...p, status: newStatus, updated_at: new Date().toISOString() }
                              : p)
                          );
                          const { error } = await supabase
                            .from('projects')
                            .update({ status: newStatus, updated_at: new Date().toISOString() })
                            .eq('id', item.id);
                          if (error) { Alert.alert('更新失敗', error.message); fetchProjects(); }
                        }}
                        onClick={(e: any) => e.stopPropagation()}
                        style={{
                          position: 'absolute', bottom: 8, right: 8,
                          fontSize: 11, padding: '2px 4px', borderRadius: 6,
                          border: `1px solid ${status.color}`, color: status.color,
                          backgroundColor: '#fff', cursor: 'pointer',
                          fontWeight: 700, outline: 'none',
                        }}
                      >
                        {STATUS_OPTIONS.map(s => (
                          <option key={s.value} value={s.value}>{s.label}</option>
                        ))}
                      </select>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
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
  kanbanCardWrap: { position: 'relative', marginBottom: 4, cursor: 'grab' as any },
  dropIndicator: { borderWidth: 2, borderStyle: 'dashed', borderRadius: 10, padding: 12, marginBottom: 8, alignItems: 'center' },
  dropIndicatorText: { fontSize: 13, fontWeight: '700' },
  kanbanEmpty: { alignItems: 'center', paddingVertical: 32 },
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
