import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert,
  TouchableOpacity, Modal, ScrollView, RefreshControl, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, ProjectMember } from '../../types';
import LoadingOverlay from '../../components/LoadingOverlay';

const ROLE_COLOR: Record<string, { bg: string; text: string }> = {
  admin:    { bg: '#fef3c7', text: '#92400e' },
  employee: { bg: '#dcfce7', text: '#166534' },
  partner:  { bg: '#ede9fe', text: '#5b21b6' },
};
const ROLE_LABEL: Record<string, string> = {
  admin: '管理者', employee: '社員', partner: '協力会社',
};

interface Props { route: any; }

export default function TeamMemberScreen({ route }: Props) {
  const { projectId } = route.params;
  const { profile } = useAuth();

  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [companyMembers, setCompanyMembers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isEmployee = profile?.role === 'employee';
  const canManage = isAdmin || isEmployee;

  const fetchData = useCallback(async () => {
    try {
      const { data: memberRows, error: memberErr } = await supabase
        .from('project_members').select('*').eq('project_id', projectId);
      if (memberErr) throw memberErr;

      const userIds = (memberRows ?? []).map((m: any) => m.user_id);
      let profileMap: Record<string, any> = {};
      if (userIds.length > 0) {
        const { data: profileRows } = await supabase
          .from('profiles').select('id, full_name, email, role').in('id', userIds);
        (profileRows ?? []).forEach((p: any) => { profileMap[p.id] = p; });
      }

      const merged = (memberRows ?? []).map((m: any) => ({
        ...m, profile: profileMap[m.user_id] ?? null,
      }));
      setMembers(merged as ProjectMember[]);

      const memberIdSet = new Set(userIds);
      const { data: allProfiles } = await supabase
        .from('profiles').select('*').order('full_name');
      setCompanyMembers(
        ((allProfiles ?? []) as Profile[]).filter((p) => !memberIdSet.has(p.id))
      );
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'データ取得に失敗しました');
    }
  }, [projectId]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchData().finally(() => setLoading(false));
  }, [fetchData]));

  const addMember = async (userId: string) => {
    try {
      const { error } = await supabase.from('project_members').insert({
        project_id: projectId, user_id: userId, role: 'member', added_by: profile?.id,
      });
      if (error) throw error;
      setAddModalVisible(false);
      await fetchData();
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'メンバーの追加に失敗しました');
    }
  };

  const removeMember = (member: ProjectMember) => {
    const doRemove = async () => {
      const { error } = await supabase.from('project_members').delete()
        .eq('project_id', projectId).eq('user_id', member.user_id);
      if (error) Alert.alert('エラー', '削除に失敗しました');
      else await fetchData();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`${member.profile?.full_name} をこの案件から削除しますか？`)) doRemove();
    } else {
      Alert.alert('メンバーを削除', `${member.profile?.full_name} をこの案件から削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: doRemove },
      ]);
    }
  };

  if (loading) return <LoadingOverlay />;

  return (
    <View style={styles.container}>
      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true); await fetchData(); setRefreshing(false);
        }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <View>
              <Text style={styles.headerTitle}>チームメンバー</Text>
              <Text style={styles.headerSub}>{members.length}名が参加中</Text>
            </View>
            {canManage && (
              <TouchableOpacity style={styles.addBtn} onPress={() => setAddModalVisible(true)}>
                <Text style={styles.addBtnText}>＋ 追加</Text>
              </TouchableOpacity>
            )}
          </View>
        }
        renderItem={({ item }) => {
          const r = item.profile?.role ?? 'employee';
          const color = ROLE_COLOR[r] ?? ROLE_COLOR.employee;
          const initial = (item.profile?.full_name ?? 'U')[0];
          return (
            <View style={styles.card}>
              <View style={[styles.avatar, { backgroundColor: color.bg }]}>
                <Text style={[styles.avatarText, { color: color.text }]}>{initial}</Text>
              </View>
              <View style={styles.info}>
                <View style={styles.nameRow}>
                  <Text style={styles.name}>{item.profile?.full_name ?? '不明'}</Text>
                  {item.user_id === profile?.id && (
                    <View style={styles.meBadge}><Text style={styles.meBadgeText}>自分</Text></View>
                  )}
                </View>
                <Text style={styles.email}>{item.profile?.email}</Text>
              </View>
              <View style={styles.right}>
                <View style={[styles.roleBadge, { backgroundColor: color.bg }]}>
                  <Text style={[styles.roleText, { color: color.text }]}>{ROLE_LABEL[r] ?? r}</Text>
                </View>
                {canManage && item.user_id !== profile?.id && (
                  <TouchableOpacity style={styles.removeBtn} onPress={() => removeMember(item)}>
                    <Text style={styles.removeBtnText}>削除</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyIcon}>👥</Text>
            <Text style={styles.emptyTitle}>メンバーがいません</Text>
            <Text style={styles.emptySub}>「＋ 追加」からメンバーを追加してください</Text>
          </View>
        }
      />

      {/* メンバー追加モーダル */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setAddModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>メンバーを追加</Text>
              <View style={{ width: 32 }} />
            </View>
            <ScrollView contentContainerStyle={styles.sheetBody}>
              {companyMembers.length === 0 ? (
                <View style={styles.empty}>
                  <Text style={styles.emptyTitle}>追加できるメンバーがいません</Text>
                </View>
              ) : (
                companyMembers.map((p) => {
                  const c = ROLE_COLOR[p.role ?? 'employee'] ?? ROLE_COLOR.employee;
                  return (
                    <TouchableOpacity key={p.id} style={styles.option} onPress={() => addMember(p.id)}>
                      <View style={[styles.optionAvatar, { backgroundColor: c.bg }]}>
                        <Text style={[styles.optionAvatarText, { color: c.text }]}>{p.full_name[0]}</Text>
                      </View>
                      <View style={styles.optionInfo}>
                        <Text style={styles.optionName}>{p.full_name}</Text>
                        <Text style={styles.optionEmail}>{p.email}</Text>
                      </View>
                      <View style={[styles.roleBadge, { backgroundColor: c.bg }]}>
                        <Text style={[styles.roleText, { color: c.text }]}>{ROLE_LABEL[p.role ?? 'employee']}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  list: { padding: 16, paddingBottom: 40, maxWidth: 720, width: '100%', alignSelf: 'center' as any },

  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 },
  headerTitle: { fontSize: 20, fontWeight: '800', color: '#0f172a' },
  headerSub: { fontSize: 13, color: '#94a3b8', marginTop: 2 },
  addBtn: { backgroundColor: '#059669', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 16,
    padding: 14, marginBottom: 10,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  avatar: { width: 48, height: 48, borderRadius: 24, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { fontSize: 20, fontWeight: '800' },
  info: { flex: 1 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  name: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  meBadge: { backgroundColor: '#dbeafe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  meBadgeText: { fontSize: 11, fontWeight: '700', color: '#1d4ed8' },
  email: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
  right: { alignItems: 'flex-end', gap: 6 },
  roleBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  roleText: { fontSize: 12, fontWeight: '700' },
  removeBtn: { paddingHorizontal: 10, paddingVertical: 5, backgroundColor: '#fee2e2', borderRadius: 8 },
  removeBtnText: { color: '#dc2626', fontSize: 12, fontWeight: '700' },

  empty: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 16, fontWeight: '700', color: '#64748b', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
    maxHeight: '85%',
  },
  sheetHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: '#64748b', fontWeight: '700' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  sheetBody: { padding: 16, paddingBottom: 40 },

  option: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, paddingHorizontal: 4,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  optionAvatar: { width: 42, height: 42, borderRadius: 21, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  optionAvatarText: { fontSize: 18, fontWeight: '800' },
  optionInfo: { flex: 1 },
  optionName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  optionEmail: { fontSize: 12, color: '#94a3b8', marginTop: 2 },
});
