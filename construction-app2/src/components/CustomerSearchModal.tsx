import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { useAuth } from '../context/AuthContext';

export interface Customer {
  id: string;
  company_id: string;
  customer_type: string | null;
  customer_company: string | null;
  customer_contact: string | null;
  customer_phone: string | null;
  created_at: string;
}

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (customer: Customer) => void;
  onNew: (name: string) => void;
}

export default function CustomerSearchModal({ visible, onClose, onSelect, onNew }: Props) {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!visible) { setQuery(''); setResults([]); return; }
  }, [visible]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!query.trim()) { setResults([]); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const { data } = await supabase
          .from('customers')
          .select('*')
          .eq('company_id', profile?.company_id)
          .or(`customer_company.ilike.%${query.trim()}%,customer_contact.ilike.%${query.trim()}%`)
          .order('created_at', { ascending: false })
          .limit(20);
        setResults((data ?? []) as Customer[]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>
        <View style={styles.modal}>
          <View style={styles.header}>
            <Text style={styles.title}>顧客を検索</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.input}
              placeholder="会社名または担当者名で検索..."
              value={query}
              onChangeText={setQuery}
              autoFocus
              clearButtonMode="while-editing"
            />
            {loading && <ActivityIndicator size="small" color="#1a56db" />}
          </View>

          <FlatList
            data={results}
            keyExtractor={(item) => item.id}
            style={styles.list}
            keyboardShouldPersistTaps="handled"
            ListHeaderComponent={
              query.trim().length > 0 ? (
                <TouchableOpacity
                  style={styles.newItem}
                  onPress={() => { onNew(query.trim()); onClose(); }}
                >
                  <Text style={styles.newItemIcon}>＋</Text>
                  <View>
                    <Text style={styles.newItemText}>「{query.trim()}」として新規登録</Text>
                    <Text style={styles.newItemSub}>顧客データが新しく作成されます</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              query.trim().length > 0 && !loading ? (
                <Text style={styles.emptyText}>該当する顧客が見つかりません</Text>
              ) : (
                <Text style={styles.emptyText}>会社名・担当者名を入力して検索</Text>
              )
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.item}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <View style={styles.itemIcon}>
                  <Text style={styles.itemIconText}>🏢</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.customer_company ?? item.customer_contact ?? '不明'}</Text>
                  {item.customer_contact && item.customer_company && (
                    <Text style={styles.itemSub}>担当：{item.customer_contact}</Text>
                  )}
                  {item.customer_phone && (
                    <Text style={styles.itemSub}>📞 {item.customer_phone}</Text>
                  )}
                  {item.customer_type && (
                    <Text style={styles.itemType}>{item.customer_type}</Text>
                  )}
                </View>
                <Text style={styles.itemArrow}>›</Text>
              </TouchableOpacity>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modal: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '85%' },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    padding: 20, borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  title: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { padding: 4 },
  closeText: { fontSize: 18, color: '#6b7280' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, paddingHorizontal: 12, paddingVertical: 10,
    backgroundColor: '#f3f4f6', borderRadius: 12,
  },
  searchIcon: { fontSize: 16, marginRight: 8 },
  input: { flex: 1, fontSize: 16, color: '#111827' },
  list: { flex: 1 },
  newItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: 16, marginHorizontal: 16, marginBottom: 8,
    backgroundColor: '#eff6ff', borderRadius: 12,
    borderWidth: 1.5, borderColor: '#1a56db',
  },
  newItemIcon: { fontSize: 22, color: '#1a56db', marginRight: 12, fontWeight: '700' },
  newItemText: { fontSize: 15, fontWeight: '700', color: '#1a56db' },
  newItemSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  itemIcon: {
    width: 40, height: 40, borderRadius: 8, backgroundColor: '#f3f4f6',
    justifyContent: 'center', alignItems: 'center', marginRight: 12,
  },
  itemIconText: { fontSize: 20 },
  itemInfo: { flex: 1 },
  itemName: { fontSize: 15, fontWeight: '700', color: '#111827' },
  itemSub: { fontSize: 13, color: '#9ca3af', marginTop: 2 },
  itemType: { fontSize: 12, color: '#1a56db', marginTop: 2, fontWeight: '600' },
  itemArrow: { fontSize: 20, color: '#d1d5db' },
  emptyText: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 32 },
});
