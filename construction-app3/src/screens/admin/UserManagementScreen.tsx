import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert,
  TouchableOpacity, Modal, RefreshControl, TextInput, Platform,
  ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, UserRole, ROLE_LABEL, Department, DEPARTMENTS } from '../../types';
import Card from '../../components/Card';
import Button from '../../components/Button';
import Badge from '../../components/Badge';
import LoadingOverlay from '../../components/LoadingOverlay';
import { syncMemberToCalendar } from '../../lib/syncMember';

const INVITE_ROLES: UserRole[] = ['admin', 'employee', 'partner'];
const GREEN = '#1D9E75';

// アプリのWebURL（メール内で案内するURL）
const APP_URL = process.env.EXPO_PUBLIC_APP_URL ?? 'https://your-app.example.com';

export default function UserManagementScreen() {
  const { profile } = useAuth();

  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // メンバー追加モーダル
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [addEmail, setAddEmail] = useState('');
  const [addPassword, setAddPassword] = useState('');
  const [addName, setAddName] = useState('');
  const [addRole, setAddRole] = useState<UserRole>('employee');
  const [addDepartment, setAddDepartment] = useState<Department | null>(null);
  const [adding, setAdding] = useState(false);

  // 編集モーダル
  const [editTarget, setEditTarget] = useState<Profile | null>(null);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editRole, setEditRole] = useState<UserRole>('employee');
  const [editDepartment, setEditDepartment] = useState<Department | null>(null);
  const [saving, setSaving] = useState(false);

  // メール送信中のユーザーID
  const [sendingEmailId, setSendingEmailId] = useState<string | null>(null);

  // 事業部変更中のユーザーID
  const [updatingDeptId, setUpdatingDeptId] = useState<string | null>(null);

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

  // ---- メンバー追加 ----
  const openAddModal = () => {
    setAddEmail('');
    setAddPassword('');
    setAddName('');
    setAddRole('employee');
    setAddDepartment(null);
    setAddModalVisible(true);
  };

  const addMember = async () => {
    if (!addEmail.trim()) { Alert.alert('エラー', 'メールアドレスを入力してください'); return; }
    if (!addPassword.trim() || addPassword.length < 6) { Alert.alert('エラー', 'パスワードは6文字以上で入力してください'); return; }
    if (!addName.trim()) { Alert.alert('エラー', '氏名を入力してください'); return; }

    setAdding(true);
    try {
      // Edge Function 経由でユーザー作成（service_role キーを使用するためセッション切替なし）
      const { data: fnData, error: fnError } = await supabase.functions.invoke('create-user', {
        body: {
          email: addEmail.trim(),
          password: addPassword.trim(),
          full_name: addName.trim(),
          company_id: profile?.company_id ?? null,
          role: addRole,
          department: addDepartment,
        },
      });

      if (fnError) throw fnError;
      if (fnData?.error) throw new Error(fnData.error);

      setAddModalVisible(false);
      await fetchUsers();
      // Railway カレンダーに非同期で同期（失敗してもメイン操作はブロックしない）
      syncMemberToCalendar({
        email: addEmail.trim(),
        full_name: addName.trim(),
        role: addRole,
        department: addDepartment,
      });
      Alert.alert('追加完了', `${addName} さんのアカウントを作成しました。\n\nログイン情報をメールで送信するには、メンバー一覧の「メール送信」ボタンを使ってください。`);
    } catch (e: any) {
      const msg = e?.message ?? 'アカウント作成に失敗しました';
      Alert.alert('エラー', msg);
    } finally {
      setAdding(false);
    }
  };

  // ---- メール送信（ログイン情報の案内） ----
  const sendLoginEmail = async (target: Profile) => {
    setSendingEmailId(target.id);
    try {
      // パスワードリセットメールを送信（ログインURLを含む）
      const { error } = await supabase.auth.resetPasswordForEmail(target.email, {
        redirectTo: APP_URL,
      });
      if (error) throw error;
      Alert.alert(
        'メール送信完了',
        `${target.full_name} さん（${target.email}）にログイン案内メールを送信しました。\n\nメール内のリンクからパスワードを設定し、ログインできます。`
      );
    } catch (e: any) {
      Alert.alert('エラー', e?.message ?? 'メール送信に失敗しました');
    } finally {
      setSendingEmailId(null);
    }
  };

  // ---- 編集 ----
  const openEdit = (target: Profile) => {
    setEditTarget(target);
    setEditName(target.full_name ?? '');
    setEditEmail(target.email);
    setEditRole(target.role);
    setEditDepartment(target.department ?? null);
  };

  const saveEdit = async () => {
    if (!editTarget) return;
    if (!editName.trim()) { Alert.alert('エラー', '氏名を入力してください'); return; }
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({
          full_name: editName.trim(),
          email: editEmail.trim(),
          role: editRole,
          department: editDepartment,
        })
        .eq('id', editTarget.id);
      if (error) throw error;
      setEditTarget(null);
      await fetchUsers();
      // Railway カレンダーに非同期で同期（失敗してもメイン操作はブロックしない）
      syncMemberToCalendar({
        email: editEmail.trim(),
        full_name: editName.trim(),
        role: editRole,
        department: editDepartment,
      });
      Alert.alert('更新完了', 'メンバー情報を更新しました');
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '更新に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  // ---- 事業部ワンタップ切り替え（電気工事→発電機→経理→電気工事…の順で循環） ----
  const toggleDepartment = async (target: Profile) => {
    const currentDept = target.department;
    const cycle: Record<Department, Department> = {
      '電気工事事業部': '発電機事業部',
      '発電機事業部': '経理部',
      '経理部': '電気工事事業部',
    };
    const next: Department = currentDept ? cycle[currentDept] : '電気工事事業部';
    setUpdatingDeptId(target.id);
    setUsers((prev) => prev.map((u) => u.id === target.id ? { ...u, department: next } : u));
    try {
      const { data, error } = await supabase
        .from('profiles')
        .update({ department: next })
        .eq('id', target.id)
        .select('id, department');
      if (error) {
        console.error('[toggleDepartment] Supabase error:', error);
        throw error;
      }
      if (!data || data.length === 0) {
        console.error('[toggleDepartment] 0 rows updated — RLSポリシーによりブロックされた可能性があります。target.id:', target.id);
        throw new Error('事業部の更新に失敗しました（権限エラーの可能性があります）');
      }
      console.log('[toggleDepartment] 更新成功:', data[0]);
    } catch (e: any) {
      setUsers((prev) => prev.map((u) => u.id === target.id ? { ...u, department: currentDept } : u));
      Alert.alert('エラー', e.message ?? '事業部の更新に失敗しました');
    } finally {
      setUpdatingDeptId(null);
    }
  };

  // ---- 削除 ----
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
            <TouchableOpacity style={styles.addBtn} onPress={openAddModal} activeOpacity={0.8}>
              <Text style={styles.addBtnText}>＋ メンバーを追加</Text>
            </TouchableOpacity>
          </View>
        }
        renderItem={({ item }) => (
          <Card style={styles.userCard}>
            <View style={styles.userRow}>
              {/* アバター */}
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.full_name?.[0] ?? '?'}</Text>
              </View>

              {/* ユーザー情報 */}
              <View style={styles.userInfo}>
                <View style={styles.userNameRow}>
                  <Text style={styles.userName}>{item.full_name}</Text>
                  {item.id === profile?.id && (
                    <View style={styles.meBadge}><Text style={styles.meBadgeText}>自分</Text></View>
                  )}
                </View>
                <Text style={styles.userEmail}>{item.email}</Text>
                <View style={styles.badgeRow}>
                  <Badge role={item.role} />
                  <TouchableOpacity
                    style={[
                      styles.deptChip,
                      item.department ? styles.deptChipActive : styles.deptChipEmpty,
                    ]}
                    onPress={() => toggleDepartment(item)}
                    disabled={updatingDeptId === item.id}
                    activeOpacity={0.7}
                  >
                    <Text style={[
                      styles.deptChipText,
                      item.department ? styles.deptChipTextActive : styles.deptChipTextEmpty,
                    ]}>
                      {updatingDeptId === item.id ? '更新中…' : (item.department ?? '事業部未設定')}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* メール送信ボタン */}
                <TouchableOpacity
                  style={[styles.mailBtn, sendingEmailId === item.id && styles.mailBtnDisabled]}
                  onPress={() => sendLoginEmail(item)}
                  disabled={sendingEmailId === item.id}
                  activeOpacity={0.75}
                >
                  <Text style={styles.mailBtnText}>
                    {sendingEmailId === item.id ? '送信中…' : '✉ メール送信'}
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 編集・削除ボタン */}
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

      {/* ---- メンバー追加モーダル ---- */}
      <Modal visible={addModalVisible} animationType="slide" transparent>
        <View style={styles.modalOverlay}>
          <View style={styles.modal}>
            <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
              <Text style={styles.modalTitle}>メンバーを追加</Text>
              <Text style={styles.modalSubtitle}>入力した情報でアカウントを作成します。</Text>

              <Text style={styles.label}>メールアドレス <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={addEmail}
                onChangeText={setAddEmail}
                placeholder="example@company.com"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>パスワード <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={addPassword}
                onChangeText={setAddPassword}
                placeholder="6文字以上"
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>氏名 <Text style={styles.required}>*</Text></Text>
              <TextInput
                style={styles.input}
                value={addName}
                onChangeText={setAddName}
                placeholder="山田 太郎"
              />

              <Text style={styles.label}>役割</Text>
              <View style={styles.roleGrid}>
                {INVITE_ROLES.map((r) => (
                  <TouchableOpacity
                    key={r}
                    style={[styles.roleOption, addRole === r && styles.roleSelected]}
                    onPress={() => setAddRole(r)}
                  >
                    <Text style={[styles.roleOptionText, addRole === r && styles.roleSelectedText]}>
                      {ROLE_LABEL[r]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={styles.label}>事業部</Text>
              <View style={styles.roleGrid}>
                {DEPARTMENTS.map((d) => (
                  <TouchableOpacity
                    key={d}
                    style={[styles.deptOption, addDepartment === d && styles.deptOptionSelected]}
                    onPress={() => setAddDepartment(addDepartment === d ? null : d)}
                  >
                    <Text style={[styles.deptOptionText, addDepartment === d && styles.deptOptionSelectedText]}>
                      {d}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Button
                title="追加する"
                onPress={addMember}
                loading={adding}
                fullWidth
                style={styles.modalBtn}
              />
              <Button
                title="キャンセル"
                onPress={() => setAddModalVisible(false)}
                variant="ghost"
                fullWidth
              />
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ---- 編集モーダル ---- */}
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

            <Text style={styles.label}>事業部</Text>
            <View style={styles.roleGrid}>
              {DEPARTMENTS.map((d) => (
                <TouchableOpacity
                  key={d}
                  style={[styles.deptOption, editDepartment === d && styles.deptOptionSelected]}
                  onPress={() => setEditDepartment(d)}
                >
                  <Text style={[styles.deptOptionText, editDepartment === d && styles.deptOptionSelectedText]}>
                    {d}
                  </Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                style={[styles.deptOption, editDepartment === null && styles.deptOptionSelected]}
                onPress={() => setEditDepartment(null)}
              >
                <Text style={[styles.deptOptionText, editDepartment === null && styles.deptOptionSelectedText]}>
                  未設定
                </Text>
              </TouchableOpacity>
            </View>

            <Button title="保存" onPress={saveEdit} loading={saving} fullWidth style={styles.modalBtn} />
            <Button title="キャンセル" onPress={() => setEditTarget(null)} variant="ghost" fullWidth />
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: {
    padding: 16, paddingBottom: 40,
    ...(Platform.OS === 'web' ? { maxWidth: 760, width: '100%', alignSelf: 'center' } as any : {}),
  },
  header: { marginBottom: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 12 },
  addBtn: {
    backgroundColor: GREEN,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    alignItems: 'center',
  },
  addBtnText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  userCard: { marginBottom: 10 },
  userRow: { flexDirection: 'row', alignItems: 'flex-start' },
  avatar: {
    width: 48, height: 48, borderRadius: 24,
    backgroundColor: '#1a56db',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
    flexShrink: 0,
  },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1, gap: 4 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  meBadgeText: { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  userEmail: { fontSize: 13, color: '#9ca3af' },
  badgeRow: { flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' },
  deptChip: {
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 20, borderWidth: 1.5,
  },
  deptChipActive: { borderColor: GREEN, backgroundColor: '#e6f7f2' },
  deptChipEmpty: { borderColor: '#d1d5db', backgroundColor: '#f3f4f6' },
  deptChipText: { fontSize: 12, fontWeight: '600' },
  deptChipTextActive: { color: GREEN },
  deptChipTextEmpty: { color: '#9ca3af' },
  // メール送信ボタン
  mailBtn: {
    flexDirection: 'row',
    alignSelf: 'flex-start',
    marginTop: 6,
    backgroundColor: '#e6f7f2',
    borderWidth: 1.5,
    borderColor: GREEN,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  mailBtnDisabled: { opacity: 0.5 },
  mailBtnText: { color: GREEN, fontSize: 12, fontWeight: '700' },
  actionBtns: { flexDirection: 'column', gap: 6, marginLeft: 8 },
  editBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#eff6ff', borderRadius: 8 },
  editBtnText: { color: '#1a56db', fontSize: 13, fontWeight: '700' },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 7, backgroundColor: '#fde8e8', borderRadius: 8 },
  deleteBtnText: { color: '#c81e1e', fontSize: 13, fontWeight: '700' },
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 20, borderTopRightRadius: 20,
    padding: 24, maxHeight: '90%',
  },
  modalTitle: { fontSize: 20, fontWeight: '800', color: '#111827', marginBottom: 8 },
  modalSubtitle: { fontSize: 14, color: '#6b7280', marginBottom: 4 },
  label: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 6, marginTop: 12 },
  required: { color: '#e53e3e' },
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
  deptOption: {
    paddingHorizontal: 16, paddingVertical: 10,
    borderRadius: 8, borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  deptOptionSelected: { borderColor: GREEN, backgroundColor: '#e6f7f2' },
  deptOptionText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  deptOptionSelectedText: { color: GREEN },
  modalBtn: { marginBottom: 10, marginTop: 16 },
});
