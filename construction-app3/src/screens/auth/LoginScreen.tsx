import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Image,
} from 'react-native';
import { useAuth } from '../../context/AuthContext';
import Input from '../../components/Input';
import Button from '../../components/Button';
import InviteCodeModal from '../../components/InviteCodeModal';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [inviteModalVisible, setInviteModalVisible] = useState(false);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>({});

  const validate = () => {
    const errs: typeof errors = {};
    if (!email) errs.email = 'メールアドレスを入力してください';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs.email = '有効なメールアドレスを入力してください';
    if (!password) errs.password = 'パスワードを入力してください';
    else if (password.length < 6) errs.password = 'パスワードは6文字以上で入力してください';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleLogin = async () => {
    if (!validate()) return;
    setLoading(true);
    try {
      await signIn(email.trim(), password);
    } catch (e: any) {
      Alert.alert(
        'ログイン失敗',
        e?.message?.includes('Invalid login credentials')
          ? 'メールアドレスまたはパスワードが正しくありません'
          : 'ログインに失敗しました。もう一度お試しください。'
      );
    } finally {
      setLoading(false);
    }
  };

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
          <View style={styles.iconWrapper}>
            <Text style={styles.icon}>⚡</Text>
          </View>
          <Text style={styles.title}>発電機管理</Text>
          <Text style={styles.subtitle}>ログインして発電機案件を管理する</Text>
        </View>

        {/* フォーム */}
        <View style={styles.form}>
          <Input
            label="メールアドレス"
            placeholder="例）tanaka@example.com"
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            error={errors.email}
            autoComplete="email"
          />
          <Input
            label="パスワード"
            placeholder="パスワードを入力"
            value={password}
            onChangeText={setPassword}
            secureToggle
            error={errors.password}
            autoComplete="password"
          />

          <Button
            title="ログイン"
            onPress={handleLogin}
            loading={loading}
            fullWidth
            style={styles.loginBtn}
          />
        </View>

        {/* フッター */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>招待を受けた方はこちら</Text>
          <TouchableOpacity onPress={() => setInviteModalVisible(true)} style={styles.inviteBtn}>
            <Text style={styles.inviteBtnText}>招待コードで参加</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <InviteCodeModal visible={inviteModalVisible} onClose={() => setInviteModalVisible(false)} />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: '#f9fafb',
  },
  container: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 40,
  },
  iconWrapper: {
    width: 80,
    height: 80,
    borderRadius: 20,
    backgroundColor: '#1a56db',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  icon: {
    fontSize: 40,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#111827',
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 15,
    color: '#6b7280',
  },
  form: {
    backgroundColor: '#ffffff',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 24,
  },
  loginBtn: {
    marginTop: 8,
  },
  footer: {
    alignItems: 'center',
  },
  footerText: {
    fontSize: 13,
    color: '#9ca3af',
    textAlign: 'center',
    lineHeight: 20,
    marginBottom: 8,
  },
  inviteBtn: {
    backgroundColor: '#1a56db',
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 32,
    marginTop: 4,
  },
  inviteBtnText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
});
