import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';
import { Invitation, ROLE_LABEL } from '../../types';
import Input from '../../components/Input';
import Button from '../../components/Button';
import LoadingOverlay from '../../components/LoadingOverlay';

interface Props {
  route: any;
  navigation: any;
}

export default function InviteAcceptScreen({ route, navigation }: Props) {
  const token: string = route.params?.token ?? '';

  const [invitation, setInvitation] = useState<Invitation | null>(null);
  const [checking, setChecking] = useState(true);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // 招待トークンを検証
  useEffect(() => {
    if (!token) {
      Alert.alert('エラー', '招待リンクが無効です', [
        { text: 'OK', onPress: () => navigation.replace('LoginHome') },
      ]);
      return;
    }
    verifyToken();
  }, [token]);

  const verifyToken = async () => {
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('*, project:projects(name)')
        .eq('token', token)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        Alert.alert(
          '招待リンクの有効期限切れ',
          'この招待リンクは無効か期限切れです。新しい招待リンクを管理者に依頼してください。',
          [{ text: 'OK', onPress: () => navigation.replace('LoginHome') }]
        );
        return;
      }
      setInvitation(data as Invitation);
      if (data.email) setEmail(data.email);
    } catch (e) {
      Alert.alert('エラー', '招待情報の取得に失敗しました');
    } finally {
      setChecking(false);
    }
  };

  const validate = () => {
    const errs: Record<string, string> = {};
    if (!fullName.trim()) errs.fullName = '氏名を入力してください';
    if (!email.trim()) errs.email = 'メールアドレスを入力してください';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = '有効なメールアドレスを入力してください';
    if (!password) errs.password = 'パスワードを入力してください';
    else if (password.length < 6) errs.password = 'パスワードは6文字以上で入力してください';
    if (password !== confirmPassword) errs.confirmPassword = 'パスワードが一致しません';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleRegister = async () => {
    if (!validate() || !invitation) return;
    setSubmitting(true);
    try {
      const { error } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          data: {
            full_name: fullName.trim(),
            invitation_token: token,
          },
        },
      });

      if (error) throw error;

      Alert.alert('登録完了', 'アカウントが作成されました。ログインしてください。', [
        { text: 'OK', onPress: () => navigation.replace('LoginHome') },
      ]);
    } catch (e: any) {
      Alert.alert('登録失敗', e?.message ?? '登録に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  if (checking) return <LoadingOverlay message="招待情報を確認中..." />;
  if (!invitation) return null;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        contentContainerStyle={styles.container}
        keyboardShouldPersistTaps="handled"
      >
        {/* ヘッダー */}
        <View style={styles.header}>
          <Text style={styles.icon}>🎉</Text>
          <Text style={styles.title}>招待を受け入れる</Text>
          <View style={styles.inviteInfo}>
            <Text style={styles.roleText}>
              役割：{ROLE_LABEL[invitation.role]}
            </Text>
            {(invitation as any).project?.name && (
              <Text style={styles.projectText}>
                案件：{(invitation as any).project.name}
              </Text>
            )}
          </View>
        </View>

        {/* フォーム */}
        <View style={styles.form}>
          {invitation.email ? (
            <View style={styles.emailRow}>
              <Text style={styles.emailLabel}>メールアドレス</Text>
              <Text style={styles.emailValue}>{invitation.email}</Text>
            </View>
          ) : (
            <Input
              label="メールアドレス"
              placeholder="例）tanaka@example.com"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              error={errors.email}
              autoComplete="email"
            />
          )}

          <Input
            label="氏名"
            placeholder="例）田中 太郎"
            value={fullName}
            onChangeText={setFullName}
            error={errors.fullName}
            autoComplete="name"
          />
          <Input
            label="パスワード"
            placeholder="6文字以上で設定"
            value={password}
            onChangeText={setPassword}
            secureToggle
            error={errors.password}
          />
          <Input
            label="パスワード（確認）"
            placeholder="もう一度入力"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureToggle
            error={errors.confirmPassword}
          />

          <Button
            title="アカウントを作成してログイン"
            onPress={handleRegister}
            loading={submitting}
            fullWidth
            style={styles.btn}
          />
        </View>

        <Button
          title="ログイン画面に戻る"
          onPress={() => navigation.replace('LoginHome')}
          variant="ghost"
          fullWidth
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: '#f9fafb' },
  container: { flexGrow: 1, padding: 24 },
  header: {
    alignItems: 'center',
    marginTop: 40,
    marginBottom: 32,
  },
  icon: { fontSize: 48, marginBottom: 12 },
  title: {
    fontSize: 24,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 12,
  },
  inviteInfo: {
    backgroundColor: '#eff6ff',
    borderRadius: 10,
    padding: 14,
    width: '100%',
    gap: 4,
  },
  roleText: {
    fontSize: 15,
    fontWeight: '700',
    color: '#1e40af',
    textAlign: 'center',
  },
  projectText: {
    fontSize: 14,
    color: '#3b82f6',
    textAlign: 'center',
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  emailRow: {
    marginBottom: 16,
    backgroundColor: '#f9fafb',
    borderRadius: 10,
    padding: 12,
  },
  emailLabel: {
    fontSize: 13,
    color: '#9ca3af',
    marginBottom: 2,
  },
  emailValue: {
    fontSize: 15,
    fontWeight: '600',
    color: '#374151',
  },
  btn: { marginTop: 8 },
});
