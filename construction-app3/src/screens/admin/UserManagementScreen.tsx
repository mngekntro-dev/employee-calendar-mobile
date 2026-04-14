import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert,
  TouchableOpacity, Modal, RefreshControl, TextInput,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, UserRole, ROLE_LABEL } from '../../types';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import LoadingOverlay from '../../components/LoadingOverlay';

const INVITE_ROLES: UserRole[] = ['admin', 'employee', 'partner'];

export default function UserManagementScreen() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // 招待モーダル
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteRole, setInviteRole] = useState<UserRole>('employee');
  const [inviteLink, setInviteLink] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('employee');
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile?.company_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers(data as Profile[]);
    } catch {
      Alert.alert('エラー', 'ユーザーの取得に失敗しました');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchUsers().finally(() => setLoading(false));
    }, [fetchUsers])
  );

  const openEdit = (target: Profile) => {
    setEditTarget(target);
    setEditName(target.full_name);
    setEditEmail(target.email);
    setEditRole(target.role);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editName.trim()) { Alert.alert('エラー', '氏名を入力してください'); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ full_name: editName.trim(), email: editEmail.trim(), role: editRole })
        .eq('id', editTarget.id);
      if (error) throw error;
      setEditTarget(null);
      await fetchUsers();
      Alert.alert('更新完了', 'メンバー情報を更新しました');
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = (target: Profile) => {
    if (target.id === profile?.id) { Alert.alert('エラー', '自分自身は削除できません'); return; }
    Alert.alert('メンバーを削除', `${target.full_name} を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive',
        onPress: async () => {
          const { error } = await supabase.from('profiles').delete().eq('id', target.id);
          if (error) Alert.alert('エラー', '削除に失敗しました');
          else await fetchUsers();
        },
      },
    ]);
  };

  const generateInviteLink = async () => {
    setGeneratingLink(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .insert({
          role: inviteRole,
          company_id: profile?.company_id,
          project_id: null,
          invited_by: profile?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select().single();
      if (error) throw error;
      setInviteLink(data.token.substring(0, 8).toUpperCase());
    } catch {
      Alert.alert('エラー', '招待コードの生成に失敗しました');
    } finally {
      setGeneratingLink(false);
    }
  };

  if (loading) return <LoadingOverlay />;

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true); await fetchUsers(); setRefreshing(false);
        }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>全メンバー（{users.length}名）</Text>
            <Button
              title="＋ 招待コードを生成"
              onPress={() => { setInviteLink(''); setInviteModalVisible(true); }}
              variant="primary"
            />
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.userCard}>
            <View style={styles.userRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.full_name[0] ?? '?'}</Text>
              </View>
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userName}>{item.full_name}</Text>
                  {item.id === profile?.id && (
                    <View style={styles.meBadge}><Text style={styles.meBadgeText}>自分</Text></View>
                  )}
                </View>
                <Text style={styles.userEmail}>{item.email}</Text>
                <Badge role={item.role} />
              </View>
              <View style={styles.actionBtns}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.editBtnText}>編集</Text>
                </TouchableOpacity>
                {item.id !== profile?.id && (
                  <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteUser(item)}>
                    <Text style={styles.deleteBtnText}>削除</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </Card>
        )}
      />

      {/* 編集モーダル */}
      <Modal visible={!!editTarget} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>メンバー情報を編集</Text>

            <Text style={styles.label}>氏名</Text>
            <TextInput
              style={styles.input}
              value={editName}
              onChangeText={setEditName}
              placeholder="氏名"
            />

            <Text style={styles.label}>メールアドレス</Text>
            <TextInput
              style={styles.input}
              value={editEmail}
              onChangeText={setEditEmail}
              placeholder="メールアドレス"
              keyboardType="email-address"
              autoCapitalize="none"
            />

            <Text style={styles.label}>役割</Text>
            <View style={styles.roleGrid}>
              {INVITE_ROLES.map((r) => (
                <TouchableOpacity
                  key={r}
                  style={[styles.roleOption, editRole === r && styles.roleSelected]}
                  onPress={() => setEditRole(r)}
                >
                  <Text style={[styles.roleOptionText, editRole === r && styles.roleSelectedText]}>
                    {ROLE_LABEL[r]}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Button title="保存" onPress={saveEdit} loading={saving} fullWidth style={styles.modalBtn} />
            <Button title="キャンセル" onPress={() => setEditTarget(null)} variant="ghost" fullWidth />
          </View>
        </View>
      </Modal>

      {/* 招待コードモーダル */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>会社への招待コード</Text>
            <Text style={styles.modalSubtitle}>生成した招待コードを招待したい方に伝えてください。</Text>

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
              <Button title="コードを生成" onPress={generateInviteLink} loading={generatingLink} fullWidth style={styles.modalBtn} />
            ) : (
              <View>
                <View style={styles.linkBox}>
                  <Text style={styles.linkCode}>{inviteLink}</Text>
                </View>
                <Text style={styles.expireNote}>※ このコードは7日間有効です</Text>
                <Button
                  title="📋 コードをコピー"
                  onPress={async () => { await Clipboard.setStringAsync(inviteLink); Alert.alert('コピー完了'); }}
                  fullWidth style={styles.modalBtn}
                />
                <Button title="別のコードを生成" onPress={() => setInviteLink('')} variant="secondary" fullWidth style={styles.modalBtn} />
              </View>
            )}

            <Button title="閉じる" onPress={() => { setInviteModalVisible(false); setInviteLink(''); }} variant="ghost" fullWidth />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 12 },
  userCard: { marginBottom: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#1a56db',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1, gap: 4 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  meBadgeText: { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  userEmail: { fontSize: 13, color: '#9ca3af' },
  actionBtns: { flexDirection: 'column', gap: 6 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#eff6ff', borderRadius: 8 },
  editBtnText: { color: '#1a56db', fontSize: 13, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fde8e8', borderRadius: 8 },
  deleteBtnText: { color: '#c81e1e', fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, maxHeight: '85%' },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 16 },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8,
    paddingHorizontal: 12, paddingVertical: 10, fontSize: 15, backgroundColor: '#f9fafb',
  },
  roleGrid: { flexDirection: 'row', gap: 8, flexWrap: 'wrap', marginBottom: 8 },
  roleOption: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  roleSelected: { borderColor: '#1a56db', backgroundColor: '#eff6ff' },
  roleOptionText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  roleSelectedText: { color: '#1a56db' },
  modalBtn: { marginBottom: 10, marginTop: 16 },
  linkBox: { backgroundColor: '#f3f4f6', borderRadius: 10, padding: 14, marginBottom: 6, alignItems: 'center' },
  linkCode: { fontSize: 28, fontWeight: '800', letterSpacing: 4, color: '#111827' },
  expireNote: { fontSize: 12, color: '#9ca3af', marginBottom: 14 },
});
