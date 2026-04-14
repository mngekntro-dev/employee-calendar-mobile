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
import { Profile, UserRole, ROLE_LABEL } from '../../types';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import LoadingOverlay from '../../components/LoadingOverlay';

export default function UserManagementScreen() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [inviteRole, setInviteRole] = useState<UserRole>('employee');
  const [inviteLink, setInviteLink] = useState('');
  const [generatingLink, setGeneratingLink] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('company_id', profile?.company_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers(data as Profile[]);
    } catch (e: any) {
      Alert.alert('エラー', 'ユーザーの取得に失敗しました');
    }
  }, [profile]);

  useFocusEffect(
    useCallback(() => {
      setLoading(true);
      fetchUsers().finally(() => setLoading(false));
    }, [fetchUsers])
  );

  const deleteUser = (target: Profile) => {
    if (target.id === profile?.id) {
      Alert.alert('エラー', '自分自身は削除できません');
      return;
    }
    Alert.alert(
      'メンバーを削除',
      `${target.full_name} を削除しますか？この操作は元に戻せません。`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除',
          style: 'destructive',
          onPress: async () => {
            const { error } = await supabase
              .from('profiles')
              .delete()
              .eq('id', target.id);
            if (error) Alert.alert('エラー', '削除に失敗しました');
            else await fetchUsers();
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
          project_id: null,
          invited_by: profile?.id,
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) throw error;
      setInviteLink(`construction-app://invite/${data.token}`);
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

  const INVITE_ROLES: UserRole[] = ['admin', 'employee', 'partner'];

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true);
          await fetchUsers();
          setRefreshing(false);
        }} />}
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
                    <View style={styles.meBadge}>
                      <Text style={styles.meBadgeText}>自分</Text>
                    </View>
                  )}
                </View>
                <Text style={styles.userEmail}>{item.email}</Text>
                <Badge role={item.role} />
              </View>
              {item.id !== profile?.id && (
                <TouchableOpacity
                  style={styles.deleteBtn}
                  onPress={() => deleteUser(item)}
                >
                  <Text style={styles.deleteBtnText}>削除</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        )}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>全メンバー（{users.length}名）</Text>
            <Button
              title="＋ 招待リンクを生成"
              onPress={() => {
                setInviteLink('');
                setInviteModalVisible(true);
              }}
              variant="primary"
              style={styles.inviteBtn}
            />
          </View>
        }
      />

      {/* 招待リンク生成モーダル */}
      <Modal visible={inviteModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>会社への招待リンク</Text>
            <Text style={styles.modalSubtitle}>
              生成したリンクを招待したい方に共有してください。
            </Text>

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
                  <Text style={styles.linkText} numberOfLines={3}>{inviteLink}</Text>
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
  list: { padding: 16, paddingBottom: 40 },
  header: { marginBottom: 16 },
  headerTitle: {
    fontSize: 17,
    fontWeight: '700',
    color: '#374151',
    marginBottom: 12,
  },
  inviteBtn: {},
  userCard: { marginBottom: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#1a56db',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1, gap: 4 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meBadge: {
    backgroundColor: '#e0f2fe',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 10,
  },
  meBadgeText: { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  userEmail: { fontSize: 13, color: '#9ca3af' },
  deleteBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#fde8e8',
    borderRadius: 8,
  },
  deleteBtnText: { color: '#c81e1e', fontSize: 13, fontWeight: '700' },
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
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 6 },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 20 },
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
  modalBtn: { marginBottom: 10 },
  linkBox: {
    backgroundColor: '#f3f4f6',
    borderRadius: 10,
    padding: 14,
    marginBottom: 6,
  },
  linkText: { fontSize: 12, color: '#374151', fontFamily: 'monospace' },
  expireNote: { fontSize: 12, color: '#9ca3af', marginBottom: 14 },
});
