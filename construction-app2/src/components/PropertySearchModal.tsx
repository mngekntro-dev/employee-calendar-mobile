import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  FlatList, TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { supabase } from '../lib/supabase';
import { Property } from '../types';
import { useAuth } from '../context/AuthContext';

interface Props {
  visible: boolean;
  onClose: () => void;
  onSelect: (property: Property) => void;
  onNewProperty: (name: string) => void;
}

export default function PropertySearchModal({ visible, onClose, onSelect, onNewProperty }: Props) {
  const { profile } = useAuth();
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Property[]>([]);
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
          .from('properties')
          .select('*')
          .eq('company_id', profile?.company_id)
          .ilike('name', `%${query.trim()}%`)
          .order('created_at', { ascending: false })
          .limit(20);
        setResults((data ?? []) as Property[]);
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
            <Text style={styles.title}>物件を検索</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Text style={styles.searchIcon}>🔍</Text>
            <TextInput
              style={styles.input}
              placeholder="物件名を入力..."
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
                  onPress={() => { onNewProperty(query.trim()); onClose(); }}
                >
                  <Text style={styles.newItemIcon}>＋</Text>
                  <View>
                    <Text style={styles.newItemText}>「{query.trim()}」として新規登録</Text>
                    <Text style={styles.newItemSub}>物件データが新しく作成されます</Text>
                  </View>
                </TouchableOpacity>
              ) : null
            }
            ListEmptyComponent={
              query.trim().length > 0 && !loading ? (
                <Text style={styles.emptyText}>該当する物件が見つかりません</Text>
              ) : query.trim().length === 0 ? (
                <Text style={styles.emptyText}>物件名を入力して検索してください</Text>
              ) : null
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.item}
                onPress={() => { onSelect(item); onClose(); }}
              >
                <View style={styles.itemIcon}>
                  <Text style={styles.itemIconText}>🏠</Text>
                </View>
                <View style={styles.itemInfo}>
                  <Text style={styles.itemName}>{item.name}</Text>
                  {item.address && <Text style={styles.itemSub}>{item.address}</Text>}
                  {item.customer_company && (
                    <Text style={styles.itemSub}>顧客：{item.customer_company}</Text>
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
  itemArrow: { fontSize: 20, color: '#d1d5db' },
  emptyText: { textAlign: 'center', color: '#9ca3af', fontSize: 14, marginTop: 32 },
});
