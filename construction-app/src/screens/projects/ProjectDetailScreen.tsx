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

const AVATAR_COLORS = ['#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];
const getUserColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

const TABS = ['概要', 'タスク', '報告', '写真', 'カレンダー', ...(Platform.OS === 'web' ? ['台帳'] : [])] as const;
type Tab = typeof TABS[number];

const TAB_ICONS: Record<string, string> = {
  '概要': '📋', 'タスク': '✅', '報告': '📝', '写真': '📷', 'カレンダー': '📅', '台帳': '📒',
};

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
    if (Platform.OS === 'web') {
      if (!window.confirm(`「${project?.name}」を削除しますか？`)) return;
      supabase.from('projects').delete().eq('id', projectId).then(({ error }) => {
        if (error) Alert.alert('エラー', '削除に失敗しました');
        else navigation.goBack();
      });
      return;
    }
    Alert.alert('案件を削除', `「${project?.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        const { error } = await supabase.from('projects').delete().eq('id', projectId);
        if (error) Alert.alert('エラー', '削除に失敗しました');
        else navigation.goBack();
      }},
    ]);
  };

  const handleCopy = () => {
    Alert.alert('案件をコピー', `「${project?.name}」をコピーして新規作成しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: 'コピー', onPress: async () => {
        if (!project) return;
        const { data, error } = await supabase.from('projects').insert({
          name: `${project.name}（コピー）`, description: project.description,
          status: 'planning', start_date: project.start_date, end_date: project.end_date,
          company_id: project.company_id, created_by: profile?.id,
          address: project.address, building_type: project.building_type,
          parking_info: project.parking_info, work_period: project.work_period,
          weekend_work: project.weekend_work, smoking_rule: project.smoking_rule,
          other_notes: project.other_notes, customer_type: project.customer_type,
          customer_company: project.customer_company, customer_contact: project.customer_contact,
          customer_phone: project.customer_phone,
        }).select().single();
        if (error) Alert.alert('エラー', 'コピーに失敗しました');
        else { Alert.alert('完了', '案件をコピーしました'); navigation.navigate('ProjectDetail', { projectId: data.id }); }
      }},
    ]);
  };

  const openMap = (address: string) =>
    Linking.openURL(`https://maps.apple.com/?q=${encodeURIComponent(address)}`);

  if (loading) return <LoadingOverlay />;
  if (!project) return null;

  const statusColor = STATUS_COLOR[project.status];

  const actionButtons = (
    <View style={styles.actionSection}>
      {canEdit && (
        <ActionBtn icon="✏️" label="案件を編集する" color="#1a56db" bg="#eff6ff"
          onPress={() => navigation.navigate('ProjectForm', { projectId })} />
      )}
      {canEdit && (
        <ActionBtn icon="👥" label="チームメンバー管理" color="#1a56db" bg="#eff6ff"
          onPress={() => navigation.navigate('TeamMember', { projectId })} />
      )}
      <ActionBtn icon="📋" label="案件をコピーする" color="#374151" bg="#f1f5f9" onPress={handleCopy} />
      {isAdmin && (
        <ActionBtn icon="🗑️" label="案件を削除する" color="#dc2626" bg="#fef2f2" onPress={handleDelete} />
      )}
    </View>
  );

  const overviewContent = (
    <>
      {/* ステータス＋工期カード */}
      <View style={styles.heroCard}>
        <View style={styles.heroTop}>
          <View style={[styles.statusPill, { backgroundColor: statusColor + '22', borderColor: statusColor + '44' }]}>
            <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
            <Text style={[styles.statusText, { color: statusColor }]}>{STATUS_LABEL[project.status]}</Text>
          </View>
          <View style={styles.avatarRow}>
            {members.slice(0, 5).map((m, i) => (
              <View key={m.user_id} style={[styles.avatar, { backgroundColor: getUserColor(m.user_id), marginLeft: i === 0 ? 0 : -10 }]}>
                <Text style={styles.avatarText}>{(m.profile?.full_name ?? '?')[0]}</Text>
              </View>
            ))}
            {members.length > 5 && (
              <View style={[styles.avatar, { backgroundColor: '#94a3b8', marginLeft: -10 }]}>
                <Text style={styles.avatarText}>+{members.length - 5}</Text>
              </View>
            )}
          </View>
        </View>
        {(project.start_date || project.end_date) && (
          <View style={styles.dateRow}>
            <Text style={styles.dateIcon}>📅</Text>
            <Text style={styles.dateValue}>{project.start_date ?? '未定'} 〜 {project.end_date ?? '未定'}</Text>
          </View>
        )}
        {project.description ? <Text style={styles.description}>{project.description}</Text> : null}
      </View>

      <InfoSection title="物件情報" icon="🏠">
        <InfoRow label="物件名" value={project.name} />
        {project.address ? (
          <TouchableOpacity onPress={() => openMap(project.address!)}>
            <InfoRow label="住所" value={project.address} highlight />
          </TouchableOpacity>
        ) : <InfoRow label="住所" value={null} />}
        <InfoRow label="建物構造" value={project.building_type} last />
      </InfoSection>

      <InfoSection title="施工に関する注意点" icon="⚠️">
        <InfoRow label="駐車スペース" value={project.parking_info} />
        <InfoRow label="工事可能期間" value={project.work_period} />
        <InfoRow label="土日の工事" value={project.weekend_work} />
        <InfoRow label="喫煙ルール" value={project.smoking_rule} />
        <InfoRow label="その他" value={project.other_notes} last />
      </InfoSection>

      <InfoSection title="顧客情報" icon="👤">
        <InfoRow label="区分" value={project.customer_type} />
        <InfoRow label="会社名" value={project.customer_company} />
        <InfoRow label="担当者名" value={project.customer_contact} />
        {project.customer_phone ? (
          <TouchableOpacity onPress={() => Linking.openURL(`tel:${project.customer_phone}`)}>
            <InfoRow label="電話番号" value={project.customer_phone} highlight last />
          </TouchableOpacity>
        ) : <InfoRow label="電話番号" value={null} last />}
      </InfoSection>

      {/* モバイルのみ：下部にアクションボタン */}
      {Platform.OS !== 'web' && actionButtons}
    </>
  );

  const renderOverview = () => (
    <ScrollView
      contentContainerStyle={styles.tabContent}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
        setRefreshing(true); await fetchData(); setRefreshing(false);
      }} />}
    >
      {Platform.OS === 'web' ? (
        <View style={styles.webTwoCol}>
          {/* 左：アクションサイドバー */}
          <View style={styles.webSidebar}>
            <Text style={styles.sidebarHeading}>操作メニュー</Text>
            {actionButtons}
          </View>
          {/* 右：メインコンテンツ */}
          <View style={styles.webMain}>{overviewContent}</View>
        </View>
      ) : overviewContent}
    </ScrollView>
  );

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Text style={styles.backText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>{project.name}</Text>
        <View style={styles.headerActions}>
          {canEdit && (
            <TouchableOpacity
              style={[styles.headerActionBtn, { backgroundColor: 'rgba(255,255,255,0.2)' }]}
              onPress={() => navigation.navigate('ProjectForm', { projectId })}
            >
              <Text style={styles.headerActionText}>編集</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.headerActionBtn, { backgroundColor: '#059669' }]}
            onPress={async () => {
              try {
                const roomId = await getOrCreateRoom('project', project.id);
                navigation.navigate('Chat', { roomId, roomType: 'project', title: `${project.name} チャット` });
              } catch { Alert.alert('エラー', 'チャットを開けませんでした'); }
            }}
          >
            <Text style={styles.headerActionText}>💬 チャット</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* タブバー */}
      <View style={styles.tabBar}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBarInner}>
          {TABS.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tabItem, activeTab === tab && styles.tabItemActive]}
              onPress={() => setActiveTab(tab)}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>
                {TAB_ICONS[tab]} {tab}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      {/* タブコンテンツ */}
      <View style={styles.flex}>
        {activeTab === '概要' && renderOverview()}
        {activeTab === 'タスク' && <TaskTab projectId={projectId} projectName={project.name} members={members} />}
        {activeTab === '報告' && <ReportTab projectId={projectId} userId={profile?.id ?? ''} />}
        {activeTab === '写真' && project && <PhotoTab projectId={project.id} projectName={project.name} navigation={navigation} />}
        {activeTab === 'カレンダー' && <ProjectCalendarTab projectId={projectId} projectName={project.name} projectAddress={project.address ?? null} members={members} />}
        {activeTab === '台帳' && <LedgerListTab projectId={project.id} projectName={project.name} navigation={navigation} />}
      </View>
    </View>
  );
}

function InfoSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <View style={sectionStyles.wrap}>
      <View style={sectionStyles.header}>
        <Text style={sectionStyles.icon}>{icon}</Text>
        <Text style={sectionStyles.title}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function InfoRow({ label, value, highlight, last }: { label: string; value: string | null | undefined; highlight?: boolean; last?: boolean }) {
  return (
    <View style={[infoStyles.row, last && infoStyles.rowLast]}>
      <Text style={infoStyles.label}>{label}</Text>
      <Text style={[infoStyles.value, highlight && infoStyles.highlight]} numberOfLines={highlight ? 1 : undefined}>
        {value ?? <Text style={infoStyles.empty}>未設定</Text>}
      </Text>
    </View>
  );
}

function ActionBtn({ icon, label, color, bg, onPress }: { icon: string; label: string; color: string; bg: string; onPress: () => void }) {
  return (
    <TouchableOpacity style={[actionStyles.btn, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={actionStyles.icon}>{icon}</Text>
      <Text style={[actionStyles.label, { color }]}>{label}</Text>
      <Text style={[actionStyles.arrow, { color }]}>›</Text>
    </TouchableOpacity>
  );
}

const sectionStyles = StyleSheet.create({
  wrap: { backgroundColor: '#fff', borderRadius: 16, marginBottom: 12, overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } as any : { elevation: 1 }) },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  icon: { fontSize: 16 },
  title: { fontSize: 13, fontWeight: '800', color: '#0f172a', textTransform: 'uppercase', letterSpacing: 0.8 },
});

const infoStyles = StyleSheet.create({
  row: { flexDirection: 'row', paddingVertical: 12, paddingHorizontal: 16, borderBottomWidth: 1, borderBottomColor: '#f8fafc' },
  rowLast: { borderBottomWidth: 0 },
  label: { width: 100, fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  value: { flex: 1, fontSize: 14, color: '#0f172a', fontWeight: '500' },
  highlight: { color: '#1a56db', textDecorationLine: 'underline' },
  empty: { color: '#cbd5e1', fontStyle: 'italic' },
});

const actionStyles = StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderRadius: 14, marginBottom: 8 },
  icon: { fontSize: 18, marginRight: 12 },
  label: { flex: 1, fontSize: 15, fontWeight: '700' },
  arrow: { fontSize: 20, fontWeight: '300' },
});

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f1f5f9' },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1a56db',
    paddingTop: Platform.OS === 'web' ? 12 : 50,
    paddingBottom: 12, paddingHorizontal: 16, gap: 10,
  },
  backBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  backText: { color: '#fff', fontSize: 20, lineHeight: 22 },
  headerTitle: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '700', letterSpacing: -0.3 },
  headerActions: { flexDirection: 'row', gap: 8 },
  headerActionBtn: { paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20 },
  headerActionText: { color: '#fff', fontSize: 13, fontWeight: '700' },
  tabBar: { backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0' },
  tabBarInner: { paddingHorizontal: 8, gap: 4, flexGrow: 1, justifyContent: 'center' },
  tabItem: { paddingHorizontal: 14, paddingVertical: 11, borderRadius: 8, marginVertical: 4 },
  tabItemActive: { backgroundColor: '#eff6ff' },
  tabText: { fontSize: 13, color: '#94a3b8', fontWeight: '600' },
  tabTextActive: { color: '#1a56db', fontWeight: '800' },
  tabContent: { padding: 16, paddingBottom: 32 },
  tabContentWeb: { maxWidth: 800, alignSelf: 'center' as any, width: '100%' },
  heroCard: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 12,
    ...(Platform.OS === 'web' ? { boxShadow: '0 1px 4px rgba(0,0,0,0.06)' } as any : { elevation: 1 }),
  },
  heroTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  statusPill: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 20, borderWidth: 1, gap: 6 },
  statusDot: { width: 7, height: 7, borderRadius: 4 },
  statusText: { fontSize: 13, fontWeight: '700' },
  avatarRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 32, height: 32, borderRadius: 16, justifyContent: 'center', alignItems: 'center', borderWidth: 2, borderColor: '#fff' },
  avatarText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  dateRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 },
  dateIcon: { fontSize: 14 },
  dateValue: { fontSize: 13, color: '#475569', fontWeight: '600' },
  description: { fontSize: 14, color: '#64748b', lineHeight: 20, marginTop: 4 },
  actionSection: { marginTop: 4 },
  webCenter: { maxWidth: 760, width: '100%', alignSelf: 'center' as any },
  webTwoCol: { flexDirection: 'row', gap: 20, maxWidth: 1100, alignSelf: 'center' as any, width: '100%' },
  webSidebar: { width: 220, flexShrink: 0 },
  webMain: { flex: 1, minWidth: 0 },
  sidebarHeading: { fontSize: 11, fontWeight: '800', color: '#94a3b8', letterSpacing: 1.2, textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4 },
});
