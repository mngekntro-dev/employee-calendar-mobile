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

interface Photo {
  id: string;
  url: string;
  comment: string | null;
  folder: string;
  created_at: string;
}

interface FolderInfo {
  name: string;
  count: number;
  lastDate: string | null;
}

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
  projectName?: string;
  navigation?: any;
}

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
        .from('project_photos')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });
      if (!error && data) {
        setPhotos(data);
        // カスタムフォルダも追加
        const customFolders = [...new Set(data.map((p: Photo) => p.folder))]
          .filter(f => !DEFAULT_FOLDERS.includes(f));
        setFolders([...DEFAULT_FOLDERS, ...customFolders]);
      }
    } catch (_) {}
    setLoading(false);
  }, [projectId]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  const loadLedgers = useCallback(async () => {
    const { data } = await supabase
      .from('project_ledgers')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (data) setLedgers(data);
  }, [projectId]);

  useEffect(() => { loadLedgers(); }, [loadLedgers]);

  async function deleteLedger(ledger: Ledger) {
    Alert.alert('削除確認', `「${ledger.title}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          try {
            // Storage削除は失敗しても続行
            try {
              const urlParts = ledger.url.split('/project-photos/');
              if (urlParts.length === 2) {
                await supabase.storage.from('project-photos').remove([urlParts[1]]);
              }
            } catch {}
            const { error } = await supabase.from('project_ledgers').delete().eq('id', ledger.id);
            if (error) throw error;
            setLedgers(prev => prev.filter(l => l.id !== ledger.id));
          } catch (e: any) {
            Alert.alert('エラー', '削除に失敗しました: ' + e.message);
          }
        }
      }
    ]);
  }

  async function shareLedger(ledger: Ledger) {
    try {
      const ext = ledger.file_type === 'pdf' ? 'pdf' : 'xls';
      const dest = `${FileSystem.documentDirectory}ledger_${Date.now()}.${ext}`;
      await FileSystem.downloadAsync(ledger.url, dest);
      await Sharing.shareAsync(dest, {
        mimeType: ledger.file_type === 'pdf' ? 'application/pdf' : 'application/vnd.ms-excel',
      });
    } catch (e: any) {
      Alert.alert('エラー', '共有に失敗しました: ' + e.message);
    }
  }

  const folderInfos: FolderInfo[] = folders.map(name => {
    const folderPhotos = photos.filter(p => p.folder === name);
    const last = folderPhotos[0]?.created_at ?? null;
    return {
      name,
      count: folderPhotos.length,
      lastDate: last ? formatDate(last) : null,
    };
  });

  const folderPhotos = selectedFolder
    ? photos.filter(p => p.folder === selectedFolder)
    : [];

  const colSize = Math.floor((width - 4) / 3);

  async function uploadBase64(base64: string, ext: string, folder: string) {
    const safeName = folderKey(folder);
    const fileName = `${projectId}/${safeName}/${Date.now()}.${ext}`;
    const contentType = `image/${ext === 'jpg' ? 'jpeg' : ext}`;
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const { error: upErr } = await supabase.storage
      .from('project-photos')
      .upload(fileName, bytes, { contentType, upsert: true });
    if (upErr) throw upErr;
    const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(fileName);
    await supabase.from('project_photos').insert({ project_id: projectId, folder, url: urlData.publicUrl });
  }

  async function uploadPhoto(uri: string, folder: string) {
    setUploading(true);
    try {
      const ext = (uri.split('.').pop() ?? 'jpg').toLowerCase();
      await uploadBase64('', ext, folder); // unused now
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? 'アップロードに失敗しました');
    }
    setUploading(false);
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
          // リサイズ（最大幅1920px）＋圧縮（quality 0.6）
          const manipulated = await ImageManipulator.manipulateAsync(
            asset.uri,
            [{ resize: { width: Math.min(asset.width ?? 1920, 1920) } }],
            { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG, base64: true }
          );
          if (!manipulated.base64) throw new Error('base64データが取得できません');
          await uploadBase64(manipulated.base64, 'jpg', folder);
          await loadPhotos();
        } catch (e: any) {
          Alert.alert('エラー', e.message ?? 'アップロードに失敗しました');
        }
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
    Alert.alert('削除', 'この写真を削除しますか？', [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除', style: 'destructive', onPress: async () => {
          await supabase.from('project_photos').delete().eq('id', viewPhoto.id);
          setPhotos(prev => prev.filter(p => p.id !== viewPhoto.id));
          setViewPhoto(null);
        },
      },
    ]);
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
    return (
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator style={{ marginTop: 40 }} color="#1a56db" />
        ) : (
          <ScrollView>
            {folderInfos.map(fi => (
              <TouchableOpacity key={fi.name} style={styles.folderRow} onPress={() => setSelectedFolder(fi.name)}>
                <Text style={styles.folderIcon}>📁</Text>
                <View style={styles.folderMeta}>
                  <Text style={styles.folderName}>{fi.name}</Text>
                  <Text style={styles.folderSub}>
                    {fi.count}枚　{fi.lastDate ?? '-'}
                  </Text>
                </View>
                <Text style={styles.folderDots}>・・・</Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}

        {/* 保存済み台帳一覧 */}
        {!selectedFolder && ledgers.length > 0 && (
          <View style={styles.ledgerSection}>
            <Text style={styles.ledgerSectionTitle}>📋 保存済み台帳</Text>
            {ledgers.map(ledger => (
              <View key={ledger.id} style={styles.ledgerCard}>
                <Text style={styles.ledgerIcon}>
                  {ledger.file_type === 'pdf' ? '📄' : '📊'}
                </Text>
                <View style={styles.ledgerInfo}>
                  <Text style={styles.ledgerTitle} numberOfLines={1}>{ledger.title}</Text>
                  {ledger.subtitle ? <Text style={styles.ledgerSub}>{ledger.subtitle}</Text> : null}
                  <Text style={styles.ledgerDate}>
                    {ledger.file_type === 'pdf' ? 'PDF' : 'Excel'} · {formatDate(ledger.created_at)}
                  </Text>
                </View>
                <TouchableOpacity style={styles.ledgerEditBtn} onPress={() => navigation?.navigate('PhotoLedger', { projectId, projectName, ledgerId: ledger.id })}>
                  <Text style={styles.ledgerEditText}>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ledgerShareBtn} onPress={() => shareLedger(ledger)}>
                  <Text style={styles.ledgerShareTxt}>共有</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.ledgerDelBtn} onPress={() => deleteLedger(ledger)}>
                  <Text style={styles.ledgerDelTxt}>削除</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {/* 追加ボタン */}
        <TouchableOpacity style={styles.addBtn} onPress={() => setAddVisible(true)}>
          <Text style={styles.addBtnText}>＋ 追加</Text>
        </TouchableOpacity>


        {/* 追加メニュー */}
        <Modal visible={addVisible} transparent animationType="slide">
          <TouchableOpacity style={styles.overlay} onPress={() => setAddVisible(false)} activeOpacity={1}>
            <View style={styles.addSheet}>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => { setAddVisible(false); setFolderModalVisible(true); }}>
                <Text style={styles.sheetIcon}>📁</Text>
                <Text style={styles.sheetLabel}>フォルダを追加</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => { setAddVisible(false); showAddOptions('その他'); }}>
                <Text style={styles.sheetIcon}>📷</Text>
                <Text style={styles.sheetLabel}>写真撮影</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.sheetBtn} onPress={() => { setAddVisible(false); pickImage(false, 'その他'); }}>
                <Text style={styles.sheetIcon}>🖼️</Text>
                <Text style={styles.sheetLabel}>写真選択</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* フォルダ作成モーダル */}
        <Modal visible={folderModalVisible} transparent animationType="fade">
          <View style={styles.overlay}>
            <View style={styles.folderModal}>
              <Text style={styles.folderModalTitle}>フォルダ名を入力</Text>
              <TextInput
                style={styles.folderInput}
                value={newFolderName}
                onChangeText={setNewFolderName}
                placeholder="例：電気工事"
                autoFocus
              />
              <View style={styles.folderModalBtns}>
                <TouchableOpacity onPress={() => setFolderModalVisible(false)} style={styles.folderCancelBtn}>
                  <Text style={{ color: '#6b7280' }}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={addFolder} style={styles.folderOkBtn}>
                  <Text style={{ color: '#fff', fontWeight: '700' }}>作成</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {uploading && (
          <View style={styles.uploadOverlay}>
            <ActivityIndicator color="#fff" size="large" />
            <Text style={{ color: '#fff', marginTop: 12 }}>アップロード中...</Text>
          </View>
        )}
      </View>
    );
  }

  /* ── フォルダ内写真グリッド ── */
  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.gridHeader}>
        <TouchableOpacity onPress={() => setSelectedFolder(null)} style={styles.backBtn}>
          <Text style={styles.backBtnText}>← フォルダ</Text>
        </TouchableOpacity>
        <Text style={styles.gridTitle}>{selectedFolder}</Text>
        <TouchableOpacity style={styles.gridAddBtn} onPress={() => showAddOptions(selectedFolder)}>
          <Text style={styles.gridAddText}>＋</Text>
        </TouchableOpacity>
      </View>

      {folderPhotos.length === 0 ? (
        <View style={styles.emptyGrid}>
          <Text style={styles.emptyText}>写真がありません</Text>
          <TouchableOpacity style={styles.emptyAddBtn} onPress={() => showAddOptions(selectedFolder)}>
            <Text style={styles.emptyAddText}>写真を追加する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={folderPhotos}
          keyExtractor={p => p.id}
          numColumns={3}
          renderItem={({ item }) => (
            <TouchableOpacity onPress={() => { setViewPhoto(item); setComment(item.comment ?? ''); }}>
              <Image source={{ uri: item.url }} style={{ width: colSize, height: colSize, margin: 1 }} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* 写真拡大モーダル */}
      <Modal visible={!!viewPhoto} transparent animationType="fade">
        <View style={styles.photoOverlay}>
          <TouchableOpacity style={styles.photoClose} onPress={() => setViewPhoto(null)}>
            <Text style={{ color: '#fff', fontSize: 24 }}>✕</Text>
          </TouchableOpacity>
          {viewPhoto && (
            <>
              <Image source={{ uri: viewPhoto.url }} style={styles.fullPhoto} resizeMode="contain" />
              <View style={styles.commentBox}>
                <TextInput
                  style={styles.commentInput}
                  value={comment}
                  onChangeText={setComment}
                  placeholder="コメントを追加..."
                  placeholderTextColor="#9ca3af"
                  multiline
                />
                <View style={styles.commentActions}>
                  <TouchableOpacity onPress={deletePhoto} style={styles.deleteBtn}>
                    <Text style={{ color: '#ef4444', fontWeight: '700' }}>削除</Text>
                  </TouchableOpacity>
                  <TouchableOpacity onPress={saveComment} style={styles.saveBtn}>
                    {savingComment ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '700' }}>保存</Text>}
                  </TouchableOpacity>
                </View>
              </View>
            </>
          )}
        </View>
      </Modal>

      {uploading && (
        <View style={styles.uploadOverlay}>
          <ActivityIndicator color="#fff" size="large" />
          <Text style={{ color: '#fff', marginTop: 12 }}>アップロード中...</Text>
        </View>
      )}
    </View>
  );
};

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  folderRow: { flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  folderIcon: { fontSize: 28, marginRight: 14 },
  folderMeta: { flex: 1 },
  folderName: { fontSize: 16, fontWeight: '700', color: '#059669' },
  folderSub: { fontSize: 13, color: '#6b7280', marginTop: 2 },
  folderDots: { fontSize: 18, color: '#9ca3af' },
  addBtn: { position: 'absolute', bottom: 80, alignSelf: 'center', backgroundColor: '#059669', paddingHorizontal: 48, paddingVertical: 16, borderRadius: 32 },
  addBtnText: { color: '#fff', fontSize: 17, fontWeight: '800' },
  ledgerBtn: { position: 'absolute', bottom: 24, alignSelf: 'center', backgroundColor: '#1a56db', paddingHorizontal: 48, paddingVertical: 14, borderRadius: 32 },
  ledgerBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  addSheet: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, flexDirection: 'row', justifyContent: 'space-around', paddingBottom: 40 },
  sheetBtn: { alignItems: 'center', gap: 8 },
  sheetIcon: { fontSize: 36 },
  sheetLabel: { fontSize: 13, color: '#374151', fontWeight: '600' },
  folderModal: { backgroundColor: '#fff', margin: 32, borderRadius: 16, padding: 24 },
  folderModalTitle: { fontSize: 17, fontWeight: '800', color: '#111827', marginBottom: 16 },
  folderInput: { borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 16, marginBottom: 16 },
  folderModalBtns: { flexDirection: 'row', gap: 12 },
  folderCancelBtn: { flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10 },
  folderOkBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#059669', borderRadius: 10 },
  uploadOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'center', alignItems: 'center' },
  gridHeader: { flexDirection: 'row', alignItems: 'center', padding: 12, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  backBtn: { paddingRight: 12 },
  backBtnText: { color: '#059669', fontSize: 15, fontWeight: '600' },
  gridTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: '#111827', textAlign: 'center' },
  gridAddBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center' },
  gridAddText: { color: '#fff', fontSize: 22, fontWeight: '300' },
  emptyGrid: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  emptyText: { color: '#9ca3af', fontSize: 16 },
  emptyAddBtn: { backgroundColor: '#059669', paddingHorizontal: 32, paddingVertical: 12, borderRadius: 24 },
  emptyAddText: { color: '#fff', fontWeight: '700' },
  photoOverlay: { flex: 1, backgroundColor: '#000', justifyContent: 'space-between' },
  photoClose: { position: 'absolute', top: 48, right: 20, zIndex: 10, padding: 8 },
  fullPhoto: { flex: 1, marginTop: 80 },
  commentBox: { backgroundColor: '#1f2937', padding: 16 },
  commentInput: { color: '#fff', fontSize: 15, minHeight: 60, marginBottom: 12 },
  commentActions: { flexDirection: 'row', gap: 12 },
  deleteBtn: { flex: 1, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#ef4444', borderRadius: 10 },
  saveBtn: { flex: 1, padding: 12, alignItems: 'center', backgroundColor: '#059669', borderRadius: 10 },
  ledgerSection: { marginHorizontal: 12, marginBottom: 160 },
  ledgerSectionTitle: { fontSize: 14, fontWeight: '700', color: '#374151', marginBottom: 8 },
  ledgerCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: '#e5e7eb' },
  ledgerIcon: { fontSize: 28, marginRight: 10 },
  ledgerInfo: { flex: 1 },
  ledgerTitle: { fontSize: 14, fontWeight: '700', color: '#111827' },
  ledgerSub: { fontSize: 12, color: '#6b7280', marginTop: 1 },
  ledgerDate: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  ledgerShareBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#1a56db', borderRadius: 8, marginLeft: 6 },
  ledgerShareTxt: { color: '#fff', fontSize: 12, fontWeight: '700' },
  ledgerDelBtn: { paddingHorizontal: 10, paddingVertical: 6, borderWidth: 1, borderColor: '#ef4444', borderRadius: 8, marginLeft: 6 },
  ledgerDelTxt: { color: '#ef4444', fontSize: 12, fontWeight: '700' },
  ledgerEditBtn: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 4, backgroundColor: '#dbeafe', marginRight: 4 },
  ledgerEditText: { fontSize: 12, color: '#1d4ed8' },
});
