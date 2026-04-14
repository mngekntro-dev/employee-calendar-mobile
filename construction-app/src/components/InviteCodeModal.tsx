import React, { useState } from 'react';
import {
  View, Text, TextInput, StyleSheet, Alert,
  Modal, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useNavigation } from '@react-navigation/native';

export default function InviteCodeModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const navigation = useNavigation<any>();

  const handleSubmit = async () => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length !== 8) {
      Alert.alert('エラー', '招待コードは8文字です');
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('invitations')
        .select('token')
        .like('token', `${trimmed.toLowerCase()}%`)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .single();

      if (error || !data) {
        Alert.alert('エラー', '招待コードが無効か期限切れです');
        return;
      }
      onClose();
      navigation.navigate('InviteAccept', { token: data.token });
    } catch {
      Alert.alert('エラー', '確認に失敗しました');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <Text style={styles.title}>招待コードで参加</Text>
          <Text style={styles.subtitle}>管理者から受け取った8文字のコードを入力してください</Text>
          <TextInput
            style={styles.input}
            value={code}
            onChangeText={t => setCode(t.toUpperCase())}
            placeholder="例: A1B2C3D4"
            maxLength={8}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {loading ? (
            <ActivityIndicator color="#1a56db" style={{ marginTop: 16 }} />
          ) : (
            <TouchableOpacity style={styles.btn} onPress={handleSubmit}>
              <Text style={styles.btnText}>参加する</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.cancel} onPress={onClose}>
            <Text style={styles.cancelText}>キャンセル</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 24 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24, width: '100%' },
  title: { fontSize: 20, fontWeight: '700', color: '#1e3a5f', marginBottom: 8 },
  subtitle: { fontSize: 13, color: '#6b7280', marginBottom: 20 },
  input: {
    borderWidth: 1, borderColor: '#d1d5db', borderRadius: 10,
    padding: 14, fontSize: 24, fontWeight: '700', letterSpacing: 6,
    textAlign: 'center', color: '#1e3a5f', backgroundColor: '#f9fafb',
  },
  btn: { backgroundColor: '#1a56db', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 16 },
  btnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  cancel: { alignItems: 'center', marginTop: 12 },
  cancelText: { color: '#6b7280', fontSize: 14 },
});
