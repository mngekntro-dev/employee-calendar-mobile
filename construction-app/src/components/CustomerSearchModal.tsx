import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, Modal, TextInput,
  FlatList, TouchableOpacity, ActivityIndicator, Platform,
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
          .from('projects')
          .select('id, customer_type, customer_company, customer_contact, customer_phone, company_id, created_at')
          .eq('company_id', profile?.company_id)
          .or(`customer_company.ilike.%${query.trim()}%,customer_contact.ilike.%${query.trim()}%`)
          .not('customer_company', 'is', null)
          .order('created_at', { ascending: false })
          .limit(50);
        const seen = new Set<string>();
        const unique = (data ?? []).filter((p: any) => {
          const key = p.customer_company ?? p.customer_contact ?? '';
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        });
        setResults(unique as Customer[]);
      } finally {
        setLoading(false);
      }
    }, 300);
  }, [query]);

  const typeColor = (type: string | null) => {
    if (type === '法人') return { bg: '#eff6ff', text: '#1a56db' };
    if (type === '個人') return { bg: '#f0fdf4', text: '#15803d' };
    return { bg: '#f8fafc', text: '#64748b' };
  };

  const inner = (
    <View style={styles.modal}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <View style={styles.headerDot} />
          <Text style={styles.title}>顧客を検索</Text>
        </View>
        <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeText}>✕</Text>
        </TouchableOpacity>
      </View>

      {/* 検索ボックス */}
      <View style={styles.searchWrap}>
        <View style={styles.searchBox}>
          <Text style={styles.searchIcon}>🔍</Text>
          <TextInput
            style={styles.input}
            placeholder="会社名または担当者名で検索..."
            placeholderTextColor="#9ca3af"
            value={query}
            onChangeText={setQuery}
            autoFocus
            clearButtonMode="while-editing"
          />
          {loading && <ActivityIndicator size="small" color="#1a56db" />}
        </View>
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
              <View style={styles.newItemIconWrap}>
                <Text style={styles.newItemIcon}>＋</Text>
              </View>
              <View style={styles.newItemBody}>
                <Text style={styles.newItemText}>「{query.trim()}」として新規登録</Text>
                <Text style={styles.newItemSub}>顧客データが新しく作成されます</Text>
              </View>
            </TouchableOpacity>
          ) : null
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Text style={styles.emptyIcon}>{query.trim().length > 0 ? '🔎' : '🏢'}</Text>
            <Text style={styles.emptyText}>
              {query.trim().length > 0 && !loading
                ? '該当する顧客が見つかりません'
                : '会社名・担当者名を入力して検索'}
            </Text>
          </View>
        }
        renderItem={({ item }) => {
          const tc = typeColor(item.customer_type);
          return (
            <TouchableOpacity
              style={styles.item}
              onPress={() => { onSelect(item); onClose(); }}
            >
              <View style={styles.itemIconWrap}>
                <Text style={styles.itemIconText}>🏢</Text>
              </View>
              <View style={styles.itemInfo}>
                <View style={styles.itemNameRow}>
                  <Text style={styles.itemName} numberOfLines={1}>
                    {item.customer_company ?? item.customer_contact ?? '不明'}
                  </Text>
                  {item.customer_type && (
                    <View style={[styles.typeBadge, { backgroundColor: tc.bg }]}>
                      <Text style={[styles.typeBadgeText, { color: tc.text }]}>{item.customer_type}</Text>
                    </View>
                  )}
                </View>
                {item.customer_contact && item.customer_company && (
                  <Text style={styles.itemSub}>👤 {item.customer_contact}</Text>
                )}
                {item.customer_phone && (
                  <Text style={styles.itemSub}>📞 {item.customer_phone}</Text>
                )}
              </View>
              <View style={styles.arrowWrap}>
                <Text style={styles.itemArrow}>›</Text>
              </View>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );

  if (Platform.OS === 'web') {
    if (!visible) return null;
    return (
      <div style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        backgroundColor: 'rgba(15,23,42,0.5)',
        backdropFilter: 'blur(4px)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <div style={{ width: '100%', maxWidth: 560, margin: '0 16px' }}>
          {inner}
        </div>
      </div>
    );
  }

  return (
    <Modal visible={visible} animationType="slide" transparent>
      <View style={styles.overlay}>{inner}</View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(15,23,42,0.5)', justifyContent: 'flex-end' },
  modal: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24, borderTopRightRadius: 24,
    ...(Platform.OS === 'web' ? {
      borderRadius: 20,
      maxHeight: '80vh' as any,
      overflow: 'hidden' as any,
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)' as any,
    } : { height: '85%' }),
  },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 20, paddingVertical: 18,
    borderBottomWidth: 1, borderBottomColor: '#f1f5f9',
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: '#1a56db' },
  title: { fontSize: 17, fontWeight: '800', color: '#0f172a', letterSpacing: -0.3 },
  closeBtn: {
    width: 32, height: 32, borderRadius: 16,
    backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center',
  },
  closeText: { fontSize: 14, color: '#64748b', fontWeight: '700' },
  searchWrap: { padding: 16, paddingBottom: 8 },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#f8fafc', borderRadius: 14,
    paddingHorizontal: 14, paddingVertical: 12,
    borderWidth: 1.5, borderColor: '#e2e8f0',
  },
  searchIcon: { fontSize: 16, marginRight: 10 },
  input: { flex: 1, fontSize: 15, color: '#0f172a' },
  list: { flex: 1 },
  newItem: {
    flexDirection: 'row', alignItems: 'center',
    margin: 16, marginBottom: 8, padding: 14,
    backgroundColor: '#eff6ff', borderRadius: 14,
    borderWidth: 1.5, borderColor: '#1a56db',
  },
  newItemIconWrap: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: '#1a56db', alignItems: 'center', justifyContent: 'center',
    marginRight: 12,
  },
  newItemIcon: { fontSize: 18, color: '#fff', fontWeight: '700' },
  newItemBody: { flex: 1 },
  newItemText: { fontSize: 14, fontWeight: '700', color: '#1a56db' },
  newItemSub: { fontSize: 12, color: '#64748b', marginTop: 2 },
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: '#f8fafc',
  },
  itemIconWrap: {
    width: 44, height: 44, borderRadius: 12,
    backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center', marginRight: 14,
  },
  itemIconText: { fontSize: 22 },
  itemInfo: { flex: 1 },
  itemNameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  itemName: { fontSize: 15, fontWeight: '700', color: '#0f172a' },
  typeBadge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  itemSub: { fontSize: 12, color: '#94a3b8', marginTop: 3 },
  arrowWrap: {
    width: 28, height: 28, borderRadius: 14,
    backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center',
  },
  itemArrow: { fontSize: 18, color: '#94a3b8' },
  emptyWrap: { alignItems: 'center', paddingVertical: 48 },
  emptyIcon: { fontSize: 40, marginBottom: 12 },
  emptyText: { fontSize: 14, color: '#94a3b8', textAlign: 'center' },
});
