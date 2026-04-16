import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, Alert,
  TouchableOpacity, RefreshControl, Modal, TextInput,
  ActivityIndicator, ScrollView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';
import { Profile, ROLE_LABEL } from '../../types';
import Card from '../../components/Card';
import Badge from '../../components/Badge';
import LoadingOverlay from '../../components/LoadingOverlay';

const ROLES = ['employee', 'admin', 'partner'] as const;
type Role = typeof ROLES[number];
const ROLE_NAMES: Record<Role, string> = { employee: '社員', admin: '管理者', partner: '協力会社' };

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL ?? 'https://your-backend.railway.app';

export default function UserManagementScreen() {
  const { profile } = useAuth();
  const [users, setUsers] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [addVisible, setAddVisible] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role: 'employee' as Role });
  const [saving, setSaving] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('profiles').select('*')
        .eq('company_id', profile?.company_id)
        .order('created_at', { ascending: true });
      if (error) throw error;
      setUsers(data as Profile[]);
    } catch {
      Alert.alert('エラー', 'ユーザーの取得に失敗しました');
    }
  }, [profile]);

  useFocusEffect(useCallback(() => {
    setLoading(true);
    fetchUsers().finally(() => setLoading(false));
  }, [fetchUsers]));

  const deleteUser = (target: Profile) => {
    if (target.id === profile?.id) { Alert.alert('エラー', '自分自身は削除できません'); return; }
    const doDelete = async () => {
      const { error } = await supabase.from('profiles').delete().eq('id', target.id);
      if (error) Alert.alert('エラー', '削除に失敗しました');
      else fetchUsers();
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`「${target.full_name}」を削除しますか？`)) doDelete();
    } else {
      Alert.alert('メンバーを削除', `${target.full_name} を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: doDelete },
      ]);
    }
  };

  const handleAdd = async () => {
    if (!form.full_name.trim()) { alert('名前を入力してください'); return; }
    if (!form.email.trim())     { alert('メールアドレスを入力してください'); return; }
    if (form.password.length < 6) { alert('パスワードは6文字以上で入力してください'); return; }
    setSaving(true);
    try {
      const res = await fetch(`${BACKEND_URL}/api/users/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: form.full_name.trim(),
          email: form.email.trim(),
          password: form.password,
          role: form.role,
          company_id: profile?.company_id ?? profile?.id ?? 'sanko',
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? 'エラー');
      setAddVisible(false);
      setForm({ full_name: '', email: '', password: '', role: 'employee' });
      fetchUsers();
      alert('メンバーを追加しました');
    } catch (e: any) {
      alert('エラー: ' + e.message);
    } finally { setSaving(false); }
  };

  if (loading) return <LoadingOverlay />;

  return (
    <View style={styles.container}>
      <FlatList
        data={users}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => {
          setRefreshing(true); await fetchUsers(); setRefreshing(false);
        }} />}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.headerTitle}>全メンバー（{users.length}名）</Text>
            <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
              <Text style={styles.addBtnText}>＋ メンバーを追加</Text>
            </TouchableOpacity>
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
              {item.id !== profile?.id && (
                <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteUser(item)}>
                  <Text style={styles.deleteBtnText}>削除</Text>
                </TouchableOpacity>
              )}
            </View>
          </Card>
        )}
      />

      {/* メンバー追加モーダル */}
      <Modal visible={addVisible} transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <View style={styles.sheetHeader}>
              <TouchableOpacity onPress={() => setAddVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.sheetTitle}>メンバーを追加</Text>
              <TouchableOpacity onPress={handleAdd} style={styles.saveBtn} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={styles.saveBtnText}>追加</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.sheetBody} keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>名前 <Text style={styles.req}>必須</Text></Text>
              <TextInput style={styles.input} value={form.full_name} onChangeText={v => setForm(f => ({ ...f, full_name: v }))} placeholder="例：山田 太郎" />

              <Text style={styles.label}>メールアドレス <Text style={styles.req}>必須</Text></Text>
              <TextInput style={styles.input} value={form.email} onChangeText={v => setForm(f => ({ ...f, email: v }))} placeholder="example@email.com" keyboardType="email-address" autoCapitalize="none" />

              <Text style={styles.label}>パスワード <Text style={styles.req}>必須（6文字以上）</Text></Text>
              <TextInput style={styles.input} value={form.password} onChangeText={v => setForm(f => ({ ...f, password: v }))} placeholder="6文字以上" secureTextEntry />

              <Text style={styles.label}>権限</Text>
              <View style={styles.roleRow}>
                {ROLES.map(r => (
                  <TouchableOpacity key={r}
                    style={[styles.roleChip, form.role === r && styles.roleChipActive]}
                    onPress={() => setForm(f => ({ ...f, role: r }))}>
                    <Text style={[styles.roleChipText, form.role === r && styles.roleChipTextActive]}>
                      {ROLE_NAMES[r]}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.note}>
                <Text style={styles.noteText}>追加後、そのメールアドレスとパスワードでログインできます。</Text>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  list: { padding: 16, paddingBottom: 40, maxWidth: 760, width: '100%', alignSelf: 'center' as any },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#374151' },
  addBtn: { backgroundColor: '#059669', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  userCard: { marginBottom: 10 },
  userRow: { flexDirection: 'row', alignItems: 'center' },
  avatar: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a56db', justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  avatarText: { color: '#fff', fontSize: 20, fontWeight: '700' },
  userInfo: { flex: 1, gap: 4 },
  userNameRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  userName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  meBadge: { backgroundColor: '#e0f2fe', paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
  meBadgeText: { fontSize: 11, fontWeight: '700', color: '#0369a1' },
  userEmail: { fontSize: 13, color: '#9ca3af' },
  deleteBtn: { paddingHorizontal: 12, paddingVertical: 8, backgroundColor: '#fde8e8', borderRadius: 8 },
  deleteBtnText: { color: '#c81e1e', fontSize: 13, fontWeight: '700' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { alignItems: 'center' } as any : {}) },
  sheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%', ...(Platform.OS === 'web' ? { borderRadius: 20, width: '100%', maxWidth: 500, marginBottom: 0 } as any : {}) },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: '#64748b', fontWeight: '700' },
  sheetTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  saveBtn: { backgroundColor: '#059669', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  sheetBody: { padding: 20, paddingBottom: 48 },
  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 6, marginTop: 16 },
  req: { color: '#ef4444', fontWeight: '500' },
  input: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 13, fontSize: 15, color: '#0f172a', backgroundColor: '#fafafa' },
  roleRow: { flexDirection: 'row', gap: 10 },
  roleChip: { flex: 1, paddingVertical: 12, borderRadius: 12, borderWidth: 1.5, borderColor: '#e2e8f0', alignItems: 'center', backgroundColor: '#fff' },
  roleChipActive: { backgroundColor: '#059669', borderColor: '#059669' },
  roleChipText: { fontSize: 14, fontWeight: '600', color: '#64748b' },
  roleChipTextActive: { color: '#fff', fontWeight: '800' },
  note: { marginTop: 24, backgroundColor: '#f0fdf4', borderRadius: 12, padding: 14 },
  noteText: { fontSize: 13, color: '#166534', lineHeight: 20 },
});
