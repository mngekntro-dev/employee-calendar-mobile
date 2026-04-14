import React, { useCallback, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Alert,
  TouchableOpacity,
  Modal,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, ProjectMember } from '../../types';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import LoadingOverlay from '../../components/LoadingOverlay';

interface Props {
  route: any;
}

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
      const [membersRes, companyRes] = await Promise.all([
        supabase
          .from('project_members')
          .select('*, profile:profiles!project_members_user_id_fkey(id, full_name, email, role)')
          .eq('project_id', projectId),
        supabase
          .from('profiles')
          .select('*')
          .eq('company_id', profile!.company_id),
      ]);

      if (membersRes.error) throw membersRes.error;
      setMembers((membersRes.data ?? []) as ProjectMember[]);

      const memberIds = new Set((membersRes.data ?? []).map((m) => m.user_id));
      setCompanyMembers(
        ((companyRes.data ?? []) as Profile[]).filter((p) => !memberIds.has(p.id))
      );
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'データ取得に失敗しました');
    }
  }, [projectId, profile]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchData().finally(() => setLoading(false));
    }, [fetchData])
  );

  const addMember = async (userId: string) => {
    try {
      const { error } = await supabase.from('project_members').insert({
        project_id: projectId,
        user_id: userId,
        role: 'member',
        added_by: profile?.id,
      });
      if (error) throw error;
      setAddModalVisible(false);
      await fetchData();
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'メンバーの追加に失敗しました');
    }
  };

  const removeMember = (member: ProjectMember) => {
    Alert.alert(
      'メンバーを削除',
      `${member.profile?.full_name} をこの案件から削除しますか？`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('project_members')
              .delete()
              .eq('project_id', projectId)
              .eq('user_id', member.user_id);
            if (error) Alert.alert('エラー', '削除に失敗しました');
            else await fetchData();
          },
        },
      ]
    );
  };

  if (loading) return <LoadingOverlay />;

  return (
    <View style={styles.container}>
      {/* アクション */}
      {canManage && (
        <View style={styles.actions}>
          <Button
            title="＋ メンバーを追加"
            onPress={() => setAddModalVisible(true)}
            fullWidth
            disabled={companyMembers.length === 0}
          />
        </View>
      )}

      {/* メンバー一覧 */}
      <FlatList
        data={members}
        keyExtractor={(item) => item.user_id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          await fetchData();
          setRefreshing(false);
        }} />}
        renderItem={({ item }) => (
          <Card style={styles.memberCard}>
            <View style={styles.memberRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>
                  {(item.profile?.full_name ?? 'U')[0]}
                </Text>
              </View>
              <View style={styles.memberInfo}>
                <Text style={styles.memberName}>{item.profile?.full_name ?? '不明'}</Text>
                <Text style={styles.memberEmail}>{item.profile?.email}</Text>
              </View>
              <View style={styles.memberRight}>
                {item.profile?.role && <Badge role={item.profile.role} />}
                {canManage && item.user_id !== profile?.id && (
                  <TouchableOpacity
                    style={styles.removeBtn}
                    onPress={() => removeMember(item)}
                  >
                    <Text style={styles.removeBtnText}>削除</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Card>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={styles.emptyText}>メンバーがいません</Text>
          </View>
        }
        ListHeaderComponent={
          <Text style={styles.sectionTitle}>メンバー一覧（{members.length}名）</Text>
        }
      />

      {/* メンバー追加モーダル */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>メンバーを追加</Text>
            <ScrollView>
              {companyMembers.length === 0 ? (
                <Text style={styles.emptyText}>追加できるメンバーがいません</Text>
              ) : (
                companyMembers.map((p) => (
                  <TouchableOpacity
                    key={p.id}
                    style={styles.memberOption}
                    onPress={() => addMember(p.id)}
                  >
                    <View style={styles.memberOptionLeft}>
                      <Text style={styles.memberName}>{p.full_name}</Text>
                      <Text style={styles.memberEmail}>{p.email}</Text>
                    </View>
                    <Badge role={p.role} />
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
            <Button
              title="キャンセル"
              onPress={() => setAddModalVisible(false)}
              variant="ghost"
              fullWidth
              style={styles.modalBtn}
            />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  actions: {
    padding: 16,
    paddingBottom: 0,
  },
  list: { padding: 16 },
  sectionTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  memberCard: { marginBottom: 8 },
  memberRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#1a56db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 18, fontWeight: '700' },
  memberInfo: { flex: 1 },
  memberName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  memberEmail: { fontSize: 13, color: '#9ca3af' },
  memberRight: { alignItems: 'flex-end', gap: 6 },
  removeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    backgroundColor: '#fde8e8',
    borderRadius: 6,
  },
  removeBtnText: { color: '#c81e1e', fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: 40 },
  emptyText: { color: '#9ca3af', fontSize: 15 },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 24,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 20,
  },
  modalBtn: { marginBottom: 10 },
  memberOption: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  memberOptionLeft: { flex: 1, marginRight: 8 },
});
