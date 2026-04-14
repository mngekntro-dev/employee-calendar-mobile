import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, FlatList, TouchableOpacity, Alert, Platform,
} from 'react-native';
import { supabase } from '../lib/supabase';
import PhotoLedgerScreen from '../screens/projects/PhotoLedgerScreen';

interface Ledger {
  id: string;
  title: string;
  subtitle: string | null;
  file_type: 'pdf' | 'excel';
  url: string;
  created_at: string;
}

interface Props {
  projectId: string;
  projectName: string;
  navigation: any;
}

export default function LedgerListTab({ projectId, projectName, navigation }: Props) {
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editLedgerId, setEditLedgerId] = useState<string | null>(null);

  const loadLedgers = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase
      .from('project_ledgers')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (data) setLedgers(data);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadLedgers(); }, [loadLedgers]);

  async function openPdf(ledger: Ledger) {
    const { data } = await supabase
      .from('project_ledgers')
      .select('title, subtitle, rows_json')
      .eq('id', ledger.id)
      .single();
    if (!data) { window.alert('データの取得に失敗しました'); return; }

    let rows: any[] = [];
    try { rows = JSON.parse(data.rows_json ?? '[]'); } catch {}

    const apiRows = rows.map((row: any, idx: number) => ({
      no: idx + 1,
      photoUrl: row.photo?.url ?? null,
      date: row.photo?.created_at ?? null,
      comment: row.comment ?? '',
    }));

    const BACKEND = 'https://employee-calendar-backend-production.up.railway.app';
    const resp = await fetch(`${BACKEND}/api/ledger/pdf`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: data.title, subtitle: data.subtitle, rows: apiRows }),
    });

    if (!resp.ok) { window.alert('PDF生成に失敗しました'); return; }

    const blob = await resp.blob();
    const url = URL.createObjectURL(blob);
    window.open(url, '_blank');
  }

  async function deleteLedger(ledger: Ledger) {
    const ok = Platform.OS === 'web'
      ? window.confirm(`「${ledger.title}」を削除しますか？`)
      : await new Promise<boolean>(resolve =>
          Alert.alert('削除確認', `「${ledger.title}」を削除しますか？`, [
            { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
            { text: '削除', style: 'destructive', onPress: () => resolve(true) },
          ])
        );
    if (!ok) return;
    await supabase.from('project_ledgers').delete().eq('id', ledger.id);
    loadLedgers();
  }

  // 作成・編集画面を表示中
  if (showCreate || editLedgerId) {
    return (
      <View style={{ flex: 1 }}>
        <PhotoLedgerScreen
          route={{ params: { projectId, projectName, ledgerId: editLedgerId ?? undefined } }}
          navigation={{
            ...navigation,
            goBack: () => { setShowCreate(false); setEditLedgerId(null); loadLedgers(); },
          }}
          embedded
          onClose={() => { setShowCreate(false); setEditLedgerId(null); loadLedgers(); }}
        />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <Text style={styles.headerTitle}>写真台帳一覧</Text>
        {Platform.OS === 'web' && (
          <TouchableOpacity style={styles.createBtn} onPress={() => setShowCreate(true)}>
            <Text style={styles.createBtnText}>＋ 新規台帳作成</Text>
          </TouchableOpacity>
        )}
      </View>

      {/* 一覧 */}
      {!loading && ledgers.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>作成されている写真台帳はありません。</Text>
          {Platform.OS === 'web' && (
            <TouchableOpacity style={styles.createBtnLarge} onPress={() => setShowCreate(true)}>
              <Text style={styles.createBtnText}>＋ 新規台帳作成</Text>
            </TouchableOpacity>
          )}
          {Platform.OS !== 'web' && (
            <Text style={styles.webOnlyNote}>台帳作成はPCブラウザからご利用ください</Text>
          )}
        </View>
      ) : (
        <FlatList
          data={ledgers}
          keyExtractor={item => item.id}
          contentContainerStyle={{ padding: 16 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardInfo}>
                <Text style={styles.cardTitle}>{item.title}</Text>
                {item.subtitle ? <Text style={styles.cardSub}>{item.subtitle}</Text> : null}
                <Text style={styles.cardDate}>{new Date(item.created_at).toLocaleDateString('ja-JP')}　{item.file_type.toUpperCase()}</Text>
              </View>
              <View style={styles.cardBtns}>
                {Platform.OS === 'web' && (
                  <TouchableOpacity style={styles.editBtn} onPress={() => { setEditLedgerId(item.id); setShowCreate(false); }}>
                    <Text style={styles.editBtnText}>編集</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity style={styles.downloadBtn} onPress={() => {
                  if (Platform.OS === 'web') window.open(item.url, '_blank');
                }}>
                  <Text style={styles.downloadBtnText}>Excel</Text>
                </TouchableOpacity>
                {Platform.OS === 'web' && (
                  <TouchableOpacity style={styles.pdfBtn} onPress={() => openPdf(item)}>
                    <Text style={styles.pdfBtnText}>PDF</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={() => deleteLedger(item)}>
                  <Text style={styles.deleteBtnText}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  headerTitle: { fontSize: 16, fontWeight: '700', color: '#111827' },
  createBtn: { backgroundColor: '#059669', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8 },
  createBtnLarge: { backgroundColor: '#059669', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 8, marginTop: 16 },
  createBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 },
  emptyText: { fontSize: 15, color: '#6b7280', marginBottom: 8 },
  webOnlyNote: { fontSize: 13, color: '#9ca3af', marginTop: 12 },
  card: { backgroundColor: '#fff', borderRadius: 10, padding: 14, marginBottom: 12, flexDirection: 'row', alignItems: 'center', shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4, elevation: 2 },
  cardInfo: { flex: 1 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: '#111827' },
  cardSub: { fontSize: 12, color: '#6b7280', marginTop: 2 },
  cardDate: { fontSize: 11, color: '#9ca3af', marginTop: 4 },
  cardBtns: { flexDirection: 'row', gap: 6, alignItems: 'center' },
  editBtn: { backgroundColor: '#dbeafe', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  editBtnText: { color: '#1d4ed8', fontSize: 12, fontWeight: '600' },
  downloadBtn: { backgroundColor: '#d1fae5', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  downloadBtnText: { color: '#059669', fontSize: 12, fontWeight: '600' },
  pdfBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  pdfBtnText: { color: '#dc2626', fontSize: 12, fontWeight: '600' },
  deleteBtn: { backgroundColor: '#fee2e2', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 6 },
  deleteBtnText: { color: '#dc2626', fontSize: 12, fontWeight: '600' },
});
