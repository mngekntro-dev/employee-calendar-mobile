import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Alert,
  TouchableOpacity, Linking, RefreshControl, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { getOrCreateRoom } from '../../lib/chatRoom';
import { useAuth } from '../../context/AuthContext';
import { Project, ProjectMember, STATUS_LABEL, STATUS_COLOR } from '../../types';
import LoadingOverlay from '../../components/LoadingOverlay';
import ProjectCalendarTab from '../../components/ProjectCalendarTab';
import TaskTab from '../../components/TaskTab';
import ReportTab from '../../components/ReportTab';
import { PhotoTab } from '../../components/PhotoTab';
import LedgerListTab from '../../components/LedgerListTab';
import PhotoLedgerScreen from './PhotoLedgerScreen';

const AVATAR_COLORS = ['#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const getUserColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};
const TABS = ['概要', 'タスク', '報告', '写真', 'カレンダー', ...(Platform.OS === 'web' ? ['台帳'] : [])] as const;
type Tab = typeof TABS[number];

interface Props { route: any; navigation: any; }

export default function ProjectDetailScreen({ route, navigation }: Props) {
  const { projectId } = route.params;
  const { profile } = useAuth();
  const [project, setProject] = useState<Project | null>(null);
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>('概要');

  const isAdmin = profile?.role === 'admin';
  const isEmployee = profile?.role === 'employee';
  const canEdit = isAdmin || isEmployee;

  const fetchData = useCallback(async () => {
    try {
      const [projRes, membersRes] = await Promise.all([
        supabase.from('projects').select('*').eq('id', projectId).single(),
        supabase
          .from('project_members')
          .select('*, profile:profiles!project_members_user_id_fkey(id, full_name, email, role)')
          .eq('project_id', projectId),
      ]);
      if (projRes.error) throw projRes.error;
      setProject(projRes.data as Project);
      setMembers((membersRes.data ?? []) as ProjectMember[]);
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'データの取得に失敗しました');
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]));

  const handleDelete = () => {
    if (!isAdmin) return;
    Alert.alert('案件を削除', `「${project?.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('projects').delete().eq('id', projectId);
          if (error) Alert.alert('エラー', '削除に失敗しました');
          else navigation.goBack();
        },
      },
    ]);
  };

  const handleCopy = () => {
    Alert.alert('案件をコピー', `「${project?.name}」をコピーして新規作成しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: 'コピー',
        onPress: async () => {
          if (!project) return;
          const { data, error } = await supabase.from('projects').insert({
            name: `${project.name}（コピー）`,
            description: project.description,
            status: 'planning',
            start_date: project.start_date,
            end_date: project.end_date,
            company_id: project.company_id,
            created_by: profile?.id,
            address: project.address,
            building_type: project.building_type,
            parking_info: project.parking_info,
            work_period: project.work_period,
            weekend_work: project.weekend_work,
            smoking_rule: project.smoking_rule,
            other_notes: project.other_notes,
            customer_type: project.customer_type,
            customer_company: project.customer_company,
            customer_contact: project.customer_contact,
            customer_phone: project.customer_phone,
          }).select().single();
          if (error) Alert.alert('エラー', 'コピーに失敗しました');
          else {
            Alert.alert('完了', '案件をコピーしました');
            navigation.navigate('ProjectDetail', { projectId: data.id });
          }
        },
      },
    ]);
  };

  const openMap = (address: string) => {
    const url = `https://maps.apple.com/?q=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  const openNearby = (address: string | null) => {
    if (!address) return;
    const url = `https://maps.apple.com/?q=${encodeURIComponent('周辺施設')}&near=${encodeURIComponent(address)}`;
    Linking.openURL(url);
  };

  if (loading) return <LoadingOverlay />;
  if (!project) return null;

  const statusColor = STATUS_COLOR[project.status];

  const renderOverview = () => (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true); await fetchData(); setRefreshing(false);
      }} />}
    >
      {/* ステータス＋アバター行 */}
      <View style={styles.statusRow}>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[project.status]}</Text>
        </View>
        <View style={styles.avatarRow}>
          {members.slice(0, 5).map((m, i) => (
            <View key={m.user_id} style={[styles.avatar, { backgroundColor: getUserColor(m.user_id), marginLeft: i === 0 ? 0 : -8 }]}>
              <Text style={styles.avatarText}>{(m.profile?.full_name ?? '?')[0]}</Text>
            </View>
          ))}
          {members.length > 5 && (
            <View style={[styles.avatar, { backgroundColor: '#9ca3af', marginLeft: -8 }]}>
              <Text style={styles.avatarText}>+{members.length - 5}</Text>
            </View>
          )}
        </View>
      </View>

      {/* 工期 */}
      {(project.start_date || project.end_date) && (
        <View style={styles.dateRow}>
          <Text style={styles.dateLabel}>📅 工期：</Text>
          <Text style={styles.dateValue}>
            {project.start_date ?? '未定'} 〜 {project.end_date ?? '未定'}
          </Text>
        </View>
      )}

      {/* 物件情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>物件情報</Text>
        <InfoRow label="物件名" value={project.name} />
        {project.address ? (
          <TouchableOpacity onPress={() => openMap(project.address!)}>
            <InfoRow label="住所" value={project.address} highlight />
          </TouchableOpacity>
        ) : <InfoRow label="住所" value={null} />}

        <InfoRow label="建物構造" value={project.building_type} />
      </View>

      {/* 施工に関する注意点 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>施工に関する注意点</Text>
        <InfoRow label="駐車スペース" value={project.parking_info} />
        <InfoRow label="工事可能期間" value={project.work_period} />
        <InfoRow label="土日の工事" value={project.weekend_work} />
        <InfoRow label="喫煙ルール" value={project.smoking_rule} />
        <InfoRow label="その他" value={project.other_notes} />
      </View>

      {/* 顧客情報 */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>顧客情報</Text>
        <InfoRow label="区分" value={project.customer_type} />
        <InfoRow label="会社名" value={project.customer_company} />
        <InfoRow label="担当者名" value={project.customer_contact} />
        {project.customer_phone ? (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${project.customer_phone}`)}>
            <InfoRow label="電話番号" value={project.customer_phone} highlight />
          </TouchableOpacity>
        ) : <InfoRow label="電話番号" value={null} />}
      </View>

      {/* アクションボタン */}
      <View style={styles.section}>
        {canEdit && (
          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('ProjectForm', { projectId })}>
            <Text style={styles.editBtnText}>✏️ 案件を編集する</Text>
          </TouchableOpacity>
        )}
        {canEdit && (
          <TouchableOpacity style={styles.editBtn} onPress={() => navigation.navigate('TeamMember', { projectId })}>
            <Text style={styles.editBtnText}>👥 チームメンバー管理</Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity style={styles.copyBtn} onPress={handleCopy}>
          <Text style={styles.copyBtnText}>📋 案件をコピーする</Text>
        </TouchableOpacity>
        {isAdmin && (
          <TouchableOpacity style={styles.deleteBtn} onPress={handleDelete}>
            <Text style={styles.deleteBtnText}>🗑️ 案件を削除する</Text>
          </TouchableOpacity>
        )}
      </View>
    </ScrollView>
  );

  const renderPlaceholder = (label: string) => (
    <View style={styles.placeholder}>
      <Text style={styles.placeholderIcon}>🚧</Text>
      <Text style={styles.placeholderText}>{label}は近日実装予定です</Text>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{project.name}</Text>
        {canEdit && (
          <TouchableOpacity onPress={() => navigation.navigate('ProjectForm', { projectId })} style={styles.headerEditBtn}>
            <Text style={styles.headerEditText}>編集</Text>
          </TouchableOpacity>
        )}
        {(
          <TouchableOpacity
            style={styles.headerChatBtn}
            onPress={async () => {
              try {
                const roomId = await getOrCreateRoom('project', project.id);
                navigation.navigate('Chat', {
                  roomId,
                  roomType: 'project',
                  title: `${project.name} チャット`,
                });
              } catch {
                Alert.alert('エラー', 'チャットを開けませんでした');
              }
            }}
          >
            <Text style={styles.headerChatText}>💬 チャット</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* タブバー */}
      <View style={styles.tabBar}>
        {TABS.map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
            onPress={() => setActiveTab(tab)}
          >
            <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* タブコンテンツ */}
      <View style={styles.flex}>
        {activeTab === '概要' && renderOverview()}
        {activeTab === 'タスク' && <TaskTab projectId={projectId} projectName={project.name} members={members} />}
        {activeTab === '報告' && (
          <ReportTab projectId={projectId} userId={profile?.id ?? ''} />
        )}
        {activeTab === '写真' && project && <PhotoTab projectId={project.id} projectName={project.name} navigation={navigation} />}
        {activeTab === 'カレンダー' && <ProjectCalendarTab projectId={projectId} projectName={project.name} projectAddress={project.address ?? null} members={members} />}
        {activeTab === '台帳' && <LedgerListTab projectId={project.id} projectName={project.name} navigation={navigation} />}
      </View>

    </View>
  );
}

function InfoRow({ label, value, highlight }: { label: string; value: string | null; highlight?: boolean }) {
  return (
    <View style={infoStyles.row}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, highlight && infoStyles.highlight]}>
        {value ?? '未設定'}
      </Text>
    </View>
  );
}

const infoStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#f3f4f6',
  },
  label: { width: 110, fontSize: 14, color: '#9ca3af', fontWeight: '500' },
  value: { flex: 1, fontSize: 14, color: '#111827' },
  highlight: { color: '#1a56db', textDecorationLine: 'underline' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a56db',
    paddingTop: Platform.OS === 'web' ? 10 : 48,
    paddingBottom: Platform.OS === 'web' ? 10 : 12,
    paddingHorizontal: 16,
  },
  backBtn: { marginRight: 8 },
  backText: { color: '#fff', fontSize: 22 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 18, fontWeight: '700' },
  headerEditBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#059669', borderRadius: 8, marginRight: 6 },
  headerEditText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  headerChatBtn: { paddingHorizontal: 12, paddingVertical: 6, backgroundColor: '#059669', borderRadius: 8 },
  headerChatText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#fff',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  tabItem: { flex: 1, paddingVertical: 12, alignItems: 'center' },
  tabItemActive: { borderBottomWidth: 2, borderBottomColor: '#1a56db' },
  tabText: { fontSize: 14, color: '#9ca3af', fontWeight: '600' },
  tabTextActive: { color: '#1a56db' },
  tabContent: { padding: 16, paddingBottom: 24 },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  statusBadge: { paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20 },
  statusText: { fontSize: 13, fontWeight: '700' },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 32, height: 32, borderRadius: 16,
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 2, borderColor: '#fff',
  },
  avatarText: { color: '#fff', fontSize: 12, fontWeight: '700' },
  dateRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  dateLabel: { fontSize: 13, color: '#9ca3af' },
  dateValue: { fontSize: 13, color: '#374151', fontWeight: '600' },
  section: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 8,
    borderLeftWidth: 3,
    borderLeftColor: '#1a56db',
    paddingLeft: 8,
  },
  nearbyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 8, marginBottom: 4 },
  nearbyBtn: {
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, borderColor: '#1a56db',
    backgroundColor: '#eff6ff',
  },
  nearbyText: { fontSize: 12, color: '#1a56db', fontWeight: '600' },
  editBtn: {
    padding: 14, borderRadius: 10,
    backgroundColor: '#eff6ff',
    alignItems: 'center', marginBottom: 8,
  },
  editBtnText: { color: '#1a56db', fontSize: 15, fontWeight: '700' },
  copyBtn: {
    padding: 14, borderRadius: 10,
    backgroundColor: '#f3f4f6',
    alignItems: 'center', marginBottom: 8,
  },
  copyBtnText: { color: '#374151', fontSize: 15, fontWeight: '700' },
  deleteBtn: {
    padding: 14, borderRadius: 10,
    backgroundColor: '#fde8e8',
    alignItems: 'center',
  },
  deleteBtnText: { color: '#c81e1e', fontSize: 15, fontWeight: '700' },
  chatBtn: {
    backgroundColor: '#057a55',
    padding: 16,
    alignItems: 'center',
  },
  chatBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  placeholder: { flex: 1, justifyContent: 'center', alignItems: 'center', marginTop: 100 },
  placeholderIcon: { fontSize: 48, marginBottom: 12 },
  placeholderText: { fontSize: 16, color: '#9ca3af' },
});
