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
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, ProjectMember, UserRole, ROLE_LABEL } from '../../types';
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
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteLink, setInviteLink] = useState('');
  const [inviteRole, setInviteRole] = useState<UserRole>('partner');
  const [generatingLink, setGeneratingLink] = useState(false);

  const isAdmin = profile?.role === 'admin';
  const isEmployee = profile?.role === 'employee';
  const canManage = isAdmin || isEmployee;

  const fetchData = useCallback(async () => {
    try {
      const [membersRes, companyRes] = await Promise.all([
        supabase
          .from('project_members')
          .select('*, profile:profiles(id, full_name, email, role)')
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

  const generateInviteLink = async () => {
    setGeneratingLink(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          role: inviteRole,
          company_id: profile?.company_id,
          project_id: projectId,
          invited_by: profile?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      const link = `construction-app://invite/${data.token}`;
      setInviteLink(link);
    } catch (e: any) {
      Alert.alert('エラー', '招待リンクの生成に失敗しました');
    } finally {
      setGeneratingLink(false);
    }
  };

  const copyLink = async () => {
    await Clipboard.setStringAsync(inviteLink);
    Alert.alert('コピー完了', '招待リンクをクリップボードにコピーしました');
  };

  if (loading) return <LoadingOverlay />;

  const INVITE_ROLES: UserRole[] = isAdmin
    ? ['admin', 'employee', 'partner']
    : ['employee', 'partner'];

  return (
    <View style={styles.container}>
      {/* アクション */}
      {canManage && (
        <View style={styles.actions}>
          <Button
            title="既存メンバーを追加"
            onPress={() => setAddModalVisible(true)}
            variant="secondary"
            style={styles.actionBtn}
            disabled={companyMembers.length === 0}
          />
          <Button
            title="招待リンクを生成"
            onPress={() => {
              setInviteLink('');
              setInviteModalVisible(true);
            }}
            variant="primary"
            style={styles.actionBtn}
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

      {/* 既存メンバー追加モーダル */}
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

      {/* 招待リンク生成モーダル */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>招待リンクを生成</Text>

            <Text style={styles.label}>招待する役割</Text>
            <View style={styles.roleGrid}>
              {INVITE_ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleOption, inviteRole === r && styles.roleSelected]}
                  onPress={() => setInviteRole(r)}
                >
                  <Text style={[styles.roleOptionText, inviteRole === r && styles.roleSelectedText]}>
                    {ROLE_LABEL[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {!inviteLink ? (
              <Button
                title="リンクを生成"
                onPress={generateInviteLink}
                loading={generatingLink}
                fullWidth
                style={styles.modalBtn}
              />
            ) : (
              <View>
                <View style={styles.linkBox}>
                  <Text style={styles.linkText} numberOfLines={2}>{inviteLink}</Text>
                </View>
                <Text style={styles.expireNote}>※ このリンクは7日間有効です</Text>
                <Button
                  title="📋 リンクをコピー"
                  onPress={copyLink}
                  fullWidth
                  style={styles.modalBtn}
                />
                <Button
                  title="別のリンクを生成"
                  onPress={() => setInviteLink('')}
                  variant="secondary"
                  fullWidth
                  style={styles.modalBtn}
                />
              </View>
            )}

            <Button
              title="閉じる"
              onPress={() => {
                setInviteModalVisible(false);
                setInviteLink('');
              }}
              variant="ghost"
              fullWidth
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
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    paddingBottom: 0,
  },
  actionBtn: { flex: 1 },
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
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  roleGrid: { flexDirection: 'row', gap: 8, marginBottom: 20, flexWrap: 'wrap' },
  roleOption: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
  },
  roleSelected: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  roleOptionText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  roleSelectedText: { color: '#1a56db' },
  linkBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
  },
  linkText: { fontSize: 13, color: '#374151', fontFamily: 'monospace' },
  expireNote: { fontSize: 12, color: '#9ca3af', marginBottom: 14 },
});
