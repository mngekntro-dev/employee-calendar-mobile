import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import { supabase } from '../lib/supabase';

const REPORT_TYPES = ['現場調査報告', '開始報告', '進捗報告', '終了報告'] as const;
type ReportType = typeof REPORT_TYPES[number];

const TYPE_META: Record<ReportType, { color: string; icon: string }> = {
  '現場調査報告': { color: '#6b7280', icon: '🔍' },
  '開始報告':     { color: '#1a56db', icon: '🚀' },
  '進捗報告':     { color: '#d97706', icon: '📊' },
  '終了報告':     { color: '#059669', icon: '✅' },
};

interface Report {
  id: string;
  report_type: string;
  content: string | null;
  photos: string[] | null;
  created_at: string;
  reporter_name?: string;
}

interface Props { projectId: string; userId: string; }

export default function ReportTab({ projectId, userId }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('現場調査報告');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('project_reports')
        .select('id, report_type, content, photos, created_at, created_by')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (error) { setReports([]); return; }
      const rows: Report[] = [];
      for (const row of (data ?? [])) {
        let name = '';
        if (row.created_by) {
          const { data: p } = await supabase.from('profiles').select('full_name').eq('id', row.created_by).single();
          name = p?.full_name ?? '';
        }
        rows.push({ ...row, reporter_name: name });
      }
      setReports(rows);
    } catch { setReports([]); }
    finally { setLoading(false); }
  }, [projectId]);

  useEffect(() => { fetchReports(); }, [fetchReports]);

  const openModal = () => {
    setReportType('現場調査報告');
    setContent('');
    setPhotos([]);
    setModalVisible(true);
  };

  const pickImage = () => {
    Alert.alert('写真を追加', '', [
      { text: 'カメラ', onPress: async () => {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) { Alert.alert('カメラの許可が必要です'); return; }
        const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
        if (!result.canceled && result.assets[0]) {
          const a = result.assets[0];
          const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width ?? 1920, 1920) } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
          setPhotos(prev => [...prev, m.uri]);
        }
      }},
      { text: 'ギャラリー', onPress: async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('ギャラリーの許可が必要です'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ quality: 1.0, allowsMultipleSelection: true, selectionLimit: 5 });
        if (!result.canceled) {
          const uris: string[] = [];
          for (const a of result.assets) {
            const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width ?? 1920, 1920) } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
            uris.push(m.uri);
          }
          setPhotos(prev => [...prev, ...uris]);
        }
      }},
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const path = `${projectId}/${Date.now()}.jpg`;
      const formData = new FormData();
      formData.append('file', { uri, name: 'photo.jpg', type: 'image/jpeg' } as any);
      const { error } = await supabase.storage.from('report-photos').upload(path, formData, { contentType: 'multipart/form-data' });
      if (error) return null;
      return supabase.storage.from('report-photos').getPublicUrl(path).data.publicUrl;
    } catch { return null; }
  };

  const submit = async () => {
    setSubmitting(true);
    try {
      const uploadedUrls: string[] = [];
      for (const uri of photos) {
        const url = await uploadPhoto(uri);
        if (url) uploadedUrls.push(url);
      }
      const { error } = await supabase.from('project_reports').insert({
        project_id: projectId, report_type: reportType,
        content: content.trim() || null,
        photos: uploadedUrls.length > 0 ? uploadedUrls : null,
        created_by: userId || null,
      });
      if (error) throw error;
      setModalVisible(false);
      fetchReports();
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '送信に失敗しました');
    } finally { setSubmitting(false); }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
    } catch { return ''; }
  };

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>報告一覧</Text>
          {reports.length > 0 && <Text style={styles.headerSub}>{reports.length}件の報告</Text>}
        </View>
        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Text style={styles.addBtnText}>＋ 報告を追加</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}><ActivityIndicator size="large" color="#1a56db" /></View>
      ) : reports.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>報告がありません</Text>
          <Text style={styles.emptySub}>＋ 報告を追加から作成してください</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={openModal}>
            <Text style={styles.emptyBtnText}>最初の報告を追加</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.listContent}>
          {reports.map(item => {
            const meta = TYPE_META[item.report_type as ReportType] ?? { color: '#6b7280', icon: '📋' };
            const isExpanded = expandedId === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                style={[styles.card, { borderLeftColor: meta.color }]}
                onPress={() => setExpandedId(isExpanded ? null : item.id)}
                activeOpacity={0.85}
              >
                {/* カードヘッダー */}
                <View style={styles.cardTop}>
                  <View style={[styles.typeBadge, { backgroundColor: meta.color + '18' }]}>
                    <Text style={styles.typeIcon}>{meta.icon}</Text>
                    <Text style={[styles.typeText, { color: meta.color }]}>{item.report_type}</Text>
                  </View>
                  <View style={styles.cardMeta}>
                    <Text style={styles.metaDate}>{formatDate(item.created_at)}</Text>
                    {item.reporter_name ? <Text style={styles.metaName}>👤 {item.reporter_name}</Text> : null}
                  </View>
                </View>

                {/* 内容プレビュー */}
                {item.content ? (
                  <Text style={styles.contentText} numberOfLines={isExpanded ? undefined : 2}>
                    {item.content}
                  </Text>
                ) : null}

                {/* 写真サムネイル */}
                {item.photos && item.photos.length > 0 && (
                  <View style={styles.photoRow}>
                    {item.photos.slice(0, isExpanded ? 99 : 3).map((url, i) => (
                      <Image key={i} source={{ uri: url }} style={styles.thumb} />
                    ))}
                    {!isExpanded && item.photos.length > 3 && (
                      <View style={styles.moreBox}>
                        <Text style={styles.moreText}>+{item.photos.length - 3}</Text>
                      </View>
                    )}
                  </View>
                )}

                {/* 展開インジケーター */}
                <Text style={styles.expandHint}>{isExpanded ? '▲ 折りたたむ' : '▼ 展開'}</Text>
              </TouchableOpacity>
            );
          })}
          <View style={{ height: 40 }} />
        </ScrollView>
      )}

      {/* 追加モーダル */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView style={styles.overlay} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />
            <View style={styles.modalHeader}>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
              <Text style={styles.modalTitle}>報告を追加</Text>
              <TouchableOpacity
                style={[styles.submitBtnSmall, submitting && { opacity: 0.6 }]}
                onPress={submit} disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Text style={styles.submitBtnSmallText}>送信</Text>}
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.modalBody}>
              {/* 報告種別 */}
              <Text style={styles.label}>報告種別 <Text style={styles.req}>必須</Text></Text>
              <View style={styles.typeGrid}>
                {REPORT_TYPES.map(t => {
                  const active = reportType === t;
                  const m = TYPE_META[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, active && { backgroundColor: m.color, borderColor: m.color }]}
                      onPress={() => setReportType(t)}
                    >
                      <Text style={styles.typeChipIcon}>{m.icon}</Text>
                      <Text style={[styles.typeChipText, active && { color: '#fff' }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 報告内容 */}
              <Text style={styles.label}>報告内容</Text>
              <TextInput
                style={styles.textInput}
                placeholder="報告内容を入力..."
                value={content}
                onChangeText={setContent}
                multiline
                numberOfLines={5}
                textAlignVertical="top"
              />

              {/* 写真 */}
              <Text style={styles.label}>写真</Text>
              <View style={styles.photoGrid}>
                {photos.map((uri, i) => (
                  <View key={i} style={styles.photoWrapper}>
                    <Image source={{ uri }} style={styles.photoPreview} />
                    <TouchableOpacity style={styles.removeBtn}
                      onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}>
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addPhoto} onPress={pickImage}>
                  <Text style={styles.addPhotoIcon}>＋</Text>
                  <Text style={styles.addPhotoText}>写真追加</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 52, marginBottom: 14 },
  emptyText: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 6 },
  emptySub: { fontSize: 13, color: '#94a3b8', textAlign: 'center', marginBottom: 20 },
  emptyBtn: { backgroundColor: '#1a56db', paddingHorizontal: 24, paddingVertical: 12, borderRadius: 12 },
  emptyBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 20, paddingVertical: 14,
    backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e2e8f0',
  },
  headerTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  headerSub: { fontSize: 12, color: '#94a3b8', marginTop: 2, fontWeight: '500' },
  addBtn: { backgroundColor: '#1a56db', paddingHorizontal: 16, paddingVertical: 9, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

  listContent: { padding: 16, maxWidth: 760, width: '100%', alignSelf: 'center' as any },

  card: {
    backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12,
    borderLeftWidth: 4,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as any : { elevation: 2, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6 }),
  },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 },
  typeBadge: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
  typeIcon: { fontSize: 13 },
  typeText: { fontSize: 12, fontWeight: '700' },
  cardMeta: { alignItems: 'flex-end', gap: 3 },
  metaDate: { fontSize: 12, color: '#64748b', fontWeight: '600' },
  metaName: { fontSize: 12, color: '#94a3b8' },
  contentText: { fontSize: 14, color: '#374151', lineHeight: 21, marginBottom: 10 },
  photoRow: { flexDirection: 'row', gap: 8, marginBottom: 8, flexWrap: 'wrap' },
  thumb: { width: 72, height: 72, borderRadius: 8 },
  moreBox: { width: 72, height: 72, borderRadius: 8, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  moreText: { fontSize: 14, fontWeight: '800', color: '#64748b' },
  expandHint: { fontSize: 11, color: '#cbd5e1', textAlign: 'right', marginTop: 4, fontWeight: '600' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end', ...(Platform.OS === 'web' ? { alignItems: 'center' } as any : {}) },
  sheet: {
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%',
    ...(Platform.OS === 'web' ? { borderRadius: 20, width: '100%', maxWidth: 560, marginBottom: 0 } as any : {}),
  },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginTop: 12, marginBottom: 4 },
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#f1f5f9' },
  closeBtn: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#f1f5f9', alignItems: 'center', justifyContent: 'center' },
  closeBtnText: { fontSize: 14, color: '#64748b', fontWeight: '700' },
  modalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a' },
  submitBtnSmall: { backgroundColor: '#059669', paddingHorizontal: 18, paddingVertical: 8, borderRadius: 10 },
  submitBtnSmallText: { color: '#fff', fontSize: 14, fontWeight: '800' },
  modalBody: { padding: 16, paddingBottom: 48 },

  label: { fontSize: 13, fontWeight: '700', color: '#374151', marginBottom: 8, marginTop: 16 },
  req: { color: '#ef4444' },
  typeGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, borderWidth: 1.5, borderColor: '#e2e8f0', backgroundColor: '#fff' },
  typeChipIcon: { fontSize: 14 },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#64748b' },

  textInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 13, fontSize: 15, minHeight: 120, backgroundColor: '#fafafa', color: '#0f172a' },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  photoWrapper: { position: 'relative' },
  photoPreview: { width: 80, height: 80, borderRadius: 10 },
  removeBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', borderRadius: 10, width: 22, height: 22, justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
  addPhoto: { width: 80, height: 80, borderRadius: 10, borderWidth: 2, borderColor: '#e2e8f0', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center', backgroundColor: '#f8fafc' },
  addPhotoIcon: { fontSize: 26, color: '#94a3b8' },
  addPhotoText: { fontSize: 11, color: '#94a3b8', marginTop: 3, fontWeight: '600' },
});
