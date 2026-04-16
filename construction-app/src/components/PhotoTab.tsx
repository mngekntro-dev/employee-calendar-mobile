import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, FlatList,
  Image, Modal, TextInput, Alert, ActivityIndicator,
  ScrollView, useWindowDimensions, ActionSheetIOS, Platform,
} from 'react-native';
import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import { supabase } from '../lib/supabase';

const FOLDER_KEY: Record<string, string> = {
  '現調': 'gencho', '施工前': 'before', '施工中': 'during',
  '施工後': 'after', 'その他': 'other',
};
function folderKey(name: string): string {
  return FOLDER_KEY[name] ?? encodeURIComponent(name).replace(/%/g, '_');
}
const DEFAULT_FOLDERS = ['現調', '施工前', '施工中', '施工後', 'その他'];

const FOLDER_COLORS: Record<string, string> = {
  '現調': '#0891b2', '施工前': '#7c3aed', '施工中': '#d97706',
  '施工後': '#059669', 'その他': '#6b7280',
};
function folderColor(name: string) {
  return FOLDER_COLORS[name] ?? '#1a56db';
}

interface Photo {
  id: string; url: string; comment: string | null;
  folder: string; created_at: string;
}
interface FolderInfo { name: string; count: number; lastDate: string | null; cover: string | null; }
interface Ledger {
  id: string; title: string; subtitle: string | null;
  file_type: 'pdf' | 'excel'; url: string; created_at: string;
}
interface Props { projectId: string; projectName?: string; navigation?: any; }

export const PhotoTab: React.FC<Props> = ({ projectId, projectName = '案件', navigation }) => {
  const { width } = useWindowDimensions();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [folders, setFolders] = useState<string[]>([...DEFAULT_FOLDERS]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [ledgers, setLedgers] = useState<Ledger[]>([]);
  const [addVisible, setAddVisible] = useState(false);
  const [viewPhoto, setViewPhoto] = useState<Photo | null>(null);
  const [comment, setComment] = useState('');
  const [savingComment, setSavingComment] = useState(false);
  const [folderModalVisible, setFolderModalVisible] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  const loadPhotos = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('project_photos').select('*').eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setPhotos(data);
        const customFolders = [...new Set(data.map((p: Photo) => p.folder))]
          .filter(f => !DEFAULT_FOLDERS.includes(f));
        setFolders([...DEFAULT_FOLDERS, ...customFolders]);
      }
    } catch (_) {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const loadLedgers = useCallback(async () => {
    const { data } = await supabase.from('project_ledgers').select('*')
      .eq('project_id', projectId).order('created_at', { ascending: false });
    if (data) setLedgers(data);
  }, [projectId]);

  useEffect(() => { loadLedgers(); }, [loadLedgers]);

  async function deleteLedger(ledger: Ledger) {
    const doDelete = async () => {
      try {
        try {
          const urlParts = ledger.url.split('/project-photos/');
          if (urlParts.length === 2) await supabase.storage.from('project-photos').remove([urlParts[1]]);
        } catch {}
        const { error } = await supabase.from('project_ledgers').delete().eq('id', ledger.id);
        if (error) throw error;
        setLedgers(prev => prev.filter(l => l.id !== ledger.id));
      } catch (e: any) { Alert.alert('エラー', '削除に失敗しました: ' + e.message); }
    };
    if (Platform.OS === 'web') {
      if (window.confirm(`「${ledger.title}」を削除しますか？`)) doDelete();
    } else {
      Alert.alert('削除確認', `「${ledger.title}」を削除しますか？`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  async function shareLedger(ledger: Ledger) {
    try {
      const ext = ledger.file_type === 'pdf' ? 'pdf' : 'xls';
      const dest = `${FileSystem.documentDirectory}ledger_${Date.now()}.${ext}`;
      await FileSystem.downloadAsync(ledger.url, dest);
      await Sharing.shareAsync(dest, {
        mimeType: ledger.file_type === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel',
      });
    } catch (e: any) { Alert.alert('エラー', '共有に失敗しました: ' + e.message); }
  }

  const folderInfos: FolderInfo[] = folders.map(name => {
    const fp = photos.filter(p => p.folder === name);
    return { name, count: fp.length, lastDate: fp[0]?.created_at ? formatDate(fp[0].created_at) : null, cover: fp[0]?.url ?? null };
  });

  const folderPhotos = selectedFolder ? photos.filter(p => p.folder === selectedFolder) : [];
  const colSize = Math.floor((width - 4) / 3);

  async function uploadBase64(base64: string, ext: string, folder: string) {
    const safeName = folderKey(folder);
    const fileName = `${projectId}/${safeName}/${Date.now()}.${ext}`;
    const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);
    const { error: upErr } = await supabase.storage.from('project-photos').upload(fileName, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(fileName);
    await supabase.from('project_photos').insert({ project_id: projectId, folder, url: urlData.publicUrl });
  }

  async function pickImage(useCamera: boolean, folder: string) {
    setAddVisible(false);
    const perm = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) { Alert.alert('権限が必要です'); return; }
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ quality: 1.0 })
      : await ImagePicker.launchImageLibraryAsync({ mediaTypes: ImagePicker.MediaTypeOptions.Images, quality: 1.0, allowsMultipleSelection: true });
    if (!result.canceled) {
      setUploading(true);
      for (const asset of result.assets) {
        try {
          const manipulated = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: Math.min(asset.width ?? 1920, 1920) } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (!manipulated.base64) throw new Error('base64データが取得できません');
          await uploadBase64(manipulated.base64, 'jpg', folder);
          await loadPhotos();
        } catch (e: any) { Alert.alert('エラー', e.message ?? 'アップロードに失敗しました'); }
      }
      setUploading(false);
    }
  }

  async function saveComment() {
    if (!viewPhoto) return;
    setSavingComment(true);
    await supabase.from('project_photos').update({ comment }).eq('id', viewPhoto.id);
    setPhotos(prev => prev.map(p => p.id === viewPhoto.id ? { ...p, comment } : p));
    setSavingComment(false);
    setViewPhoto(null);
  }

  async function deletePhoto() {
    if (!viewPhoto) return;
    const doDelete = async () => {
      await supabase.from('project_photos').delete().eq('id', viewPhoto.id);
      setPhotos(prev => prev.filter(p => p.id !== viewPhoto.id));
      setViewPhoto(null);
    };
    if (Platform.OS === 'web') {
      if (window.confirm('この写真を削除しますか？')) doDelete();
    } else {
      Alert.alert('削除', 'この写真を削除しますか？', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: doDelete },
      ]);
    }
  }

  function addFolder() {
    const name = newFolderName.trim();
    if (!name) return;
    if (!folders.includes(name)) setFolders(prev => [...prev, name]);
    setNewFolderName('');
    setFolderModalVisible(false);
    setSelectedFolder(name);
  }

  function showAddOptions(folder: string) {
    if (Platform.OS === 'ios') {
      ActionSheetIOS.showActionSheetWithOptions(
        { options: ['キャンセル', '写真撮影', 'ギャラリーから選択'], cancelButtonIndex: 0 },
        i => { if (i === 1) pickImage(true, folder); if (i === 2) pickImage(false, folder); }
      );
    } else {
      Alert.alert('写真を追加', '', [
        { text: 'キャンセル', style: 'cancel' },
        { text: '写真撮影', onPress: () => pickImage(true, folder) },
        { text: 'ギャラリーから選択', onPress: () => pickImage(false, folder) },
      ]);
    }
  }

  /* ── フォルダ一覧 ── */
  if (!selectedFolder) {
    const totalPhotos = photos.length;
    return (
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 60 }} color="#059669" size="large" />
        ) : (
          <ScrollView contentContainerStyle={styles.folderScroll}>
            {/* サマリー */}
            <View style={styles.summaryBar}>
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNum}>{totalPhotos}</Text>
                <Text style={styles.summaryLabel}>枚の写真</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryItem}>
                <Text style={styles.summaryNum}>{folders.length}</Text>
                <Text style={styles.summaryLabel}>フォルダ</Text>
              </View>
            </View>

            {/* フォルダカード */}
            <Text style={styles.sectionTitle}>フォルダ</Text>
            <View style={styles.folderGrid}>
              {folderInfos.map(fi => {
                const color = folderColor(fi.name);
                return (
                  <TouchableOpacity key={fi.name} style={styles.folderCard} onPress={() => setSelectedFolder(fi.name)} activeOpacity={0.85}>
                    {fi.cover ? (
                      <Image source={{ uri: fi.cover }} style={styles.folderCover} />
                    ) : (
                      <View style={[styles.folderCoverEmpty, { backgroundColor: color + '22' }]}>
                        <Text style={[styles.folderCoverIcon, { color }]}>📁</Text>
                      </View>
                    )}
                    <View style={[styles.folderCardFooter, { backgroundColor: color }]}>
                      <Text style={styles.folderCardName} numberOfLines={1}>{fi.name}</Text>
                      <Text style={styles.folderCardCount}>{fi.count}枚</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* 台帳 */}
            {ledgers.length > 0 && (
              <View style={styles.ledgerSection}>
                <Text style={styles.sectionTitle}>📋 保存済み台帳</Text>
                {ledgers.map(ledger => (
                  <View key={ledger.id} style={styles.ledgerCard}>
                    <View style={[styles.ledgerIconWrap, { backgroundColor: ledger.file_type === 'pdf' ? '#fef2f2' : '#f0fdf4' }]}>
                      <Text style={styles.ledgerIconText}>{ledger.file_type === 'pdf' ? '📄' : '📊'}</Text>
                    </View>
                    <View style={styles.ledgerInfo}>
                      <Text style={styles.ledgerTitle} numberOfLines={1}>{ledger.title}</Text>
                      {ledger.subtitle ? <Text style={styles.ledgerSub}>{ledger.subtitle}</Text> : null}
                      <Text style={styles.ledgerDate}>{ledger.file_type === 'pdf' ? 'PDF' : 'Excel'} · {formatDate(ledger.created_at)}</Text>
                    </View>
                    <View style={styles.ledgerActions}>
                      <TouchableOpacity style={styles.ledgerActionBtn} onPress={() => navigation?.navigate('PhotoLedger', { projectId, projectName, ledgerId: ledger.id })}>
                        <Text style={styles.ledgerActionEdit}>編集</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[styles.ledgerActionBtn, { backgroundColor: '#eff6ff' }]} onPress={() => shareLedger(ledger)}>
                        <Text style={styles.ledgerActionShare}>共有</Text>
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => deleteLedger(ledger)}>
                        <Text style={styles.ledgerActionDelete}>削除</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ))}
              </View>
            )}
            <View style={{ height: 120 }} />
          </ScrollView>
        )}

        {/* FAB */}
        <TouchableOpacity style={styles.fab} onPress={() => setAddVisible(true)}>
          <Text style={styles.fabText}>＋ 追加</Text>
        </TouchableOpacity>

        {/* 追加メニュー */}
        <Modal visible={addVisible} transparent animationType="slide">
          <TouchableOpacity style={styles.overlay} onPress={() => setAddVisible(false)} activeOpacity={1}>
            <View style={styles.addSheet}>
              <View style={styles.sheetHandle} />
              <Text style={styles.sheetTitle}>追加</Text>
              <View style={styles.sheetBtnRow}>
                {[
                  { icon: '📁', label: 'フォルダを追加', onPress: () => { setAddVisible(false); setFolderModalVisible(true); } },
                  { icon: '📷', label: '写真撮影', onPress: () => { setAddVisible(false); showAddOptions('その他'); } },
                  { icon: '🖼️', label: '写真を選択', onPress: () => { setAddVisible(false); pickImage(false, 'その他'); } },
                ].map(item => (
                  <TouchableOpacity key={item.label} style={styles.sheetBtn} onPress={item.onPress}>
                    <View style={styles.sheetBtnIcon}><Text style={styles.sheetIcon}>{item.icon}</Text></View>
                    <Text style={styles.sheetLabel}>{item.label}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* フォルダ作成 */}
        <Modal visible={folderModalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.folderModal}>
              <Text style={styles.folderModalTitle}>📁 フォルダを作成</Text>
              <TextInput
                style={styles.folderInput} value={newFolderName}
                onChangeText={setNewFolderName} placeholder="例：電気工事" autoFocus
              />
              <View style={styles.folderModalBtns}>
                <TouchableOpacity onPress={() => setFolderModalVisible(false)} style={styles.folderCancelBtn}>
                  <Text style={styles.folderCancelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addFolder} style={styles.folderOkBtn}>
                  <Text style={styles.folderOkText}>作成</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {uploading && <UploadingOverlay />}
      </View>
    );
  }

  /* ── フォルダ内写真グリッド ── */
  const color = folderColor(selectedFolder);
  return (
    <View style={styles.container}>
      <View style={[styles.gridHeader, { borderBottomColor: color + '33' }]}>
        <TouchableOpacity onPress={() => setSelectedFolder(null)} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← 戻る</Text>
        </TouchableOpacity>
        <View style={styles.gridTitleWrap}>
          <Text style={[styles.gridTitle, { color }]}>{selectedFolder}</Text>
          <Text style={styles.gridCount}>{folderPhotos.length}枚</Text>
        </View>
        <TouchableOpacity style={[styles.gridAddBtn, { backgroundColor: color }]} onPress={() => showAddOptions(selectedFolder)}>
          <Text style={styles.gridAddText}>＋</Text>
        </TouchableOpacity>
      </View>

      {folderPhotos.length === 0 ? (
        <View style={styles.emptyGrid}>
          <Text style={styles.emptyGridIcon}>📷</Text>
          <Text style={styles.emptyText}>写真がありません</Text>
          <TouchableOpacity style={[styles.emptyAddBtn, { backgroundColor: color }]} onPress={() => showAddOptions(selectedFolder)}>
            <Text style={styles.emptyAddText}>写真を追加する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={folderPhotos}
          keyExtractor={p => p.id}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { setViewPhoto(item); setComment(item.comment ?? ''); }} activeOpacity={0.9}>
              <View style={{ width: colSize, height: colSize, margin: 1 }}>
                <Image source={{ uri: item.url }} style={{ width: '100%', height: '100%' }} />
                {item.comment ? (
                  <View style={styles.photoCommentBadge}>
                    <Text style={styles.photoCommentBadgeTxt} numberOfLines={1}>💬</Text>
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* 写真詳細モーダル */}
      <Modal visible={!!viewPhoto} transparent animationType="fade">
        <View style={styles.photoOverlay}>
          <TouchableOpacity style={styles.photoClose} onPress={() => setViewPhoto(null)}>
            <View style={styles.photoCloseBtn}><Text style={styles.photoCloseTxt}>✕</Text></View>
          </TouchableOpacity>
          {viewPhoto && (
            <>
              <Image source={{ uri: viewPhoto.url }} style={styles.fullPhoto} resizeMode="contain" />
              <View style={styles.commentPanel}>
                <TextInput
                  style={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="コメントを追加..."
                  placeholderTextColor="#64748b"
                  multiline
                />
                <View style={styles.commentActions}>
                  <TouchableOpacity onPress={deletePhoto} style={styles.deleteBtn}>
                    <Text style={styles.deleteBtnTxt}>🗑 削除</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveComment} style={[styles.saveBtn, { backgroundColor: color }]}>
                    {savingComment
                      ? <ActivityIndicator color="#fff" size="small" />
                      : <Text style={styles.saveBtnTxt}>保存</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>

      {uploading && <UploadingOverlay />}
    </View>
  );
};

function UploadingOverlay() {
  return (
    <View style={styles.uploadOverlay}>
      <ActivityIndicator color="#fff" size="large" />
      <Text style={styles.uploadText}>アップロード中...</Text>
    </View>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f8fafc' },

  summaryBar: { flexDirection: 'row', backgroundColor: '#fff', marginHorizontal: 16, marginTop: 16, borderRadius: 16, padding: 16, alignItems: 'center', justifyContent: 'center', gap: 0,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.06)' } as any : { elevation: 2 }) },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryNum: { fontSize: 28, fontWeight: '800', color: '#0f172a' },
  summaryLabel: { fontSize: 12, color: '#94a3b8', fontWeight: '600', marginTop: 2 },
  summaryDivider: { width: 1, height: 36, backgroundColor: '#e2e8f0' },

  folderScroll: { padding: 16, maxWidth: 760, width: '100%', alignSelf: 'center' as any },
  sectionTitle: { fontSize: 13, fontWeight: '800', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: 1, marginTop: 20, marginBottom: 12 },
  folderGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  folderCard: { width: '47%', borderRadius: 16, overflow: 'hidden',
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.08)' } as any : { elevation: 3 }) },
  folderCover: { width: '100%', height: 110 },
  folderCoverEmpty: { width: '100%', height: 110, justifyContent: 'center', alignItems: 'center' },
  folderCoverIcon: { fontSize: 40 },
  folderCardFooter: { padding: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  folderCardName: { fontSize: 14, fontWeight: '800', color: '#fff', flex: 1 },
  folderCardCount: { fontSize: 12, color: 'rgba(255,255,255,0.8)', fontWeight: '600' },

  ledgerSection: { marginTop: 8 },
  ledgerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 14, padding: 12, marginBottom: 10,
    ...(Platform.OS === 'web' ? { boxShadow: '0 2px 8px rgba(0,0,0,0.05)' } as any : { elevation: 2 }) },
  ledgerIconWrap: { width: 44, height: 44, borderRadius: 12, justifyContent: 'center', alignItems: 'center', marginRight: 12 },
  ledgerIconText: { fontSize: 22 },
  ledgerInfo: { flex: 1 },
  ledgerTitle: { fontSize: 14, fontWeight: '700', color: '#0f172a' },
  ledgerSub: { fontSize: 12, color: '#64748b', marginTop: 1 },
  ledgerDate: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  ledgerActions: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ledgerActionBtn: { backgroundColor: '#f1f5f9', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  ledgerActionEdit: { fontSize: 12, color: '#1a56db', fontWeight: '700' },
  ledgerActionShare: { fontSize: 12, color: '#1a56db', fontWeight: '700' },
  ledgerActionDelete: { fontSize: 12, color: '#ef4444', fontWeight: '700', paddingHorizontal: 4 },

  fab: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#059669', paddingHorizontal: 40, paddingVertical: 15, borderRadius: 32,
    ...(Platform.OS === 'web' ? { boxShadow: '0 4px 16px rgba(5,150,105,0.35)' } as any : { elevation: 6 }) },
  fabText: { color: '#fff', fontSize: 16, fontWeight: '800' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  addSheet: { backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 40 },
  sheetHandle: { width: 40, height: 4, backgroundColor: '#e2e8f0', borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
  sheetTitle: { fontSize: 16, fontWeight: '800', color: '#0f172a', marginBottom: 20, textAlign: 'center' },
  sheetBtnRow: { flexDirection: 'row', justifyContent: 'space-around' },
  sheetBtn: { alignItems: 'center', gap: 8 },
  sheetBtnIcon: { width: 64, height: 64, borderRadius: 20, backgroundColor: '#f1f5f9', justifyContent: 'center', alignItems: 'center' },
  sheetIcon: { fontSize: 30 },
  sheetLabel: { fontSize: 12, color: '#374151', fontWeight: '600' },

  folderModal: { backgroundColor: '#fff', margin: 24, borderRadius: 20, padding: 24 },
  folderModalTitle: { fontSize: 17, fontWeight: '800', color: '#0f172a', marginBottom: 16 },
  folderInput: { borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12, padding: 13, fontSize: 15, marginBottom: 16, color: '#0f172a' },
  folderModalBtns: { flexDirection: 'row', gap: 10 },
  folderCancelBtn: { flex: 1, padding: 13, alignItems: 'center', borderWidth: 1.5, borderColor: '#e2e8f0', borderRadius: 12 },
  folderCancelText: { color: '#64748b', fontWeight: '600' },
  folderOkBtn: { flex: 1, padding: 13, alignItems: 'center', backgroundColor: '#059669', borderRadius: 12 },
  folderOkText: { color: '#fff', fontWeight: '800' },

  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.65)', justifyContent: 'center', alignItems: 'center', gap: 12 },
  uploadText: { color: '#fff', fontSize: 15, fontWeight: '600' },

  gridHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: '#fff', borderBottomWidth: 1, maxWidth: 760, width: '100%', alignSelf: 'center' as any },
  backBtn: { paddingRight: 12 },
  backBtnText: { color: '#059669', fontSize: 14, fontWeight: '700' },
  gridTitleWrap: { flex: 1, alignItems: 'center' },
  gridTitle: { fontSize: 16, fontWeight: '800' },
  gridCount: { fontSize: 11, color: '#94a3b8', fontWeight: '600', marginTop: 1 },
  gridAddBtn: { width: 34, height: 34, borderRadius: 17, justifyContent: 'center', alignItems: 'center' },
  gridAddText: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 26 },
  emptyGrid: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 14 },
  emptyGridIcon: { fontSize: 56 },
  emptyText: { color: '#94a3b8', fontSize: 16, fontWeight: '600' },
  emptyAddBtn: { paddingHorizontal: 28, paddingVertical: 12, borderRadius: 24 },
  emptyAddText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  photoCommentBadge: { position: 'absolute', bottom: 4, right: 4, backgroundColor: 'rgba(0,0,0,0.55)', borderRadius: 8, padding: 3 },
  photoCommentBadgeTxt: { fontSize: 12 },

  photoOverlay: { flex: 1, backgroundColor: '#0a0a0a', justifyContent: 'space-between' },
  photoClose: { position: 'absolute', top: 52, right: 16, zIndex: 10 },
  photoCloseBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: 'rgba(255,255,255,0.15)', justifyContent: 'center', alignItems: 'center' },
  photoCloseTxt: { color: '#fff', fontSize: 16, fontWeight: '700' },
  fullPhoto: { flex: 1, marginTop: 90 },
  commentPanel: { backgroundColor: '#1e293b', padding: 16, paddingBottom: 36 },
  commentInput: { color: '#e2e8f0', fontSize: 15, minHeight: 56, marginBottom: 12, borderBottomWidth: 1, borderBottomColor: '#334155', paddingBottom: 8 },
  commentActions: { flexDirection: 'row', gap: 10 },
  deleteBtn: { flex: 1, paddingVertical: 12, alignItems: 'center', borderWidth: 1.5, borderColor: '#ef4444', borderRadius: 12 },
  deleteBtnTxt: { color: '#ef4444', fontWeight: '700', fontSize: 14 },
  saveBtn: { flex: 2, paddingVertical: 12, alignItems: 'center', borderRadius: 12 },
  saveBtnTxt: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
