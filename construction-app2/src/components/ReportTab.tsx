import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  Modal, TextInput, Alert, Image, ActivityIndicator,
  KeyboardAvoidingView, Platform,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as ImageManipulator from 'expo-image-manipulator';
import WebView from 'react-native-webview';
import { supabase } from '../lib/supabase';

const SPEECH_HTML = `
<!DOCTYPE html>
<html>
<head>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:space-between;
         height:100vh; background:#1a56db; font-family:sans-serif; color:#fff; padding:40px 24px 48px; }
  .top { display:flex; flex-direction:column; align-items:center; }
  .icon { font-size:72px; margin-bottom:16px; }
  .status { font-size:20px; font-weight:bold; margin-bottom:8px; }
  .pulse { animation: pulse 1.2s infinite; }
  @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.3} }
  .textbox { width:100%; background:rgba(255,255,255,0.15); border-radius:16px;
             padding:16px; min-height:120px; font-size:18px; line-height:1.6;
             text-align:center; word-break:break-all; color:#fff; margin-top:16px; }
  .textbox.empty { color:rgba(255,255,255,0.5); font-size:15px; }
  .btnRow { display:flex; gap:16px; width:100%; }
  .btn { flex:1; padding:16px; border-radius:30px; border:none; font-size:17px;
         font-weight:bold; cursor:pointer; }
  .btnRetry { background:rgba(255,255,255,0.25); color:#fff; }
  .btnConfirm { background:#fff; color:#1a56db; }
  .btnClose { background:rgba(255,255,255,0.15); color:#fff; font-size:15px;
              padding:12px 32px; border-radius:30px; border:none; cursor:pointer; }
  .hidden { display:none; }
</style>
</head>
<body>
<div class="top">
  <div class="icon pulse" id="icon">🎤</div>
  <div class="status" id="status">話してください...</div>
  <div class="textbox empty" id="textbox">認識したテキストがここに表示されます</div>
</div>

<div style="display:flex;flex-direction:column;align-items:center;gap:16px;width:100%">
  <div class="btnRow hidden" id="actionBtns">
    <button class="btn btnRetry" onclick="retry()">🔄 もう一度</button>
    <button class="btn btnConfirm" onclick="confirm()">✓ 確定</button>
  </div>
  <button class="btnClose" onclick="closeMe()">✕ 閉じる</button>
</div>

<script>
  var recognition;
  var finalText = '';

  function setRecording(active) {
    var icon = document.getElementById('icon');
    if (active) {
      icon.classList.add('pulse');
      document.getElementById('status').textContent = '話してください...';
      document.getElementById('actionBtns').classList.add('hidden');
    } else {
      icon.classList.remove('pulse');
    }
  }

  function updateText(text, interim) {
    var box = document.getElementById('textbox');
    var display = text || interim;
    if (display) {
      box.textContent = display;
      box.classList.remove('empty');
    } else {
      box.textContent = '認識したテキストがここに表示されます';
      box.classList.add('empty');
    }
  }

  function start() {
    finalText = '';
    updateText('', '');
    setRecording(true);

    var R = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!R) {
      document.getElementById('status').textContent = '音声認識非対応';
      return;
    }
    recognition = new R();
    recognition.lang = 'ja-JP';
    recognition.continuous = false;
    recognition.interimResults = true;

    recognition.onresult = function(e) {
      var interim = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) finalText += e.results[i][0].transcript;
        else interim += e.results[i][0].transcript;
      }
      updateText(finalText, interim);
    };

    recognition.onend = function() {
      setRecording(false);
      if (finalText) {
        document.getElementById('status').textContent = '認識完了';
        document.getElementById('actionBtns').classList.remove('hidden');
      } else {
        document.getElementById('status').textContent = '認識できませんでした';
        document.getElementById('actionBtns').classList.remove('hidden');
      }
    };

    recognition.onerror = function(e) {
      setRecording(false);
      document.getElementById('status').textContent = 'エラー: ' + e.error;
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'error',error:e.error}));
    };

    recognition.start();
  }

  function retry() {
    start();
  }

  function confirm() {
    if (finalText) {
      window.ReactNativeWebView.postMessage(JSON.stringify({type:'result',text:finalText}));
    } else {
      closeMe();
    }
  }

  function closeMe() {
    if (recognition) try { recognition.stop(); } catch(e) {}
    window.ReactNativeWebView.postMessage(JSON.stringify({type:'close'}));
  }

  window.onload = start;
</script>
</body>
</html>
`;

const REPORT_TYPES = ['現場調査報告', '開始報告', '進捗報告', '終了報告'] as const;
type ReportType = typeof REPORT_TYPES[number];

const TYPE_COLOR: Record<ReportType, string> = {
  '現場調査報告': '#6b7280',
  '開始報告':     '#1a56db',
  '進捗報告':     '#e3a008',
  '終了報告':     '#057a55',
};

interface Report {
  id: string;
  report_type: string;
  content: string | null;
  photos: string[] | null;
  created_at: string;
  reporter_name?: string;
}

interface Props {
  projectId: string;
  userId: string;
}

export default function ReportTab({ projectId, userId }: Props) {
  const [reports, setReports] = useState<Report[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalVisible, setModalVisible] = useState(false);
  const [reportType, setReportType] = useState<ReportType>('現場調査報告');
  const [content, setContent] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [voiceVisible, setVoiceVisible] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('project_reports')
        .select('id, report_type, content, photos, created_at, created_by')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('fetchReports error:', error.message);
        setReports([]);
        return;
      }

      // プロファイル名を個別取得
      const rows: Report[] = [];
      for (const row of (data ?? [])) {
        let name = '';
        if (row.created_by) {
          const { data: p } = await supabase
            .from('profiles')
            .select('full_name')
            .eq('id', row.created_by)
            .single();
          name = p?.full_name ?? '';
        }
        rows.push({ ...row, reporter_name: name });
      }
      setReports(rows);
    } catch (e) {
      console.warn('fetchReports exception:', e);
      setReports([]);
    } finally {
      setLoading(false);
    }
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
      {
        text: 'カメラ', onPress: async () => {
          const perm = await ImagePicker.requestCameraPermissionsAsync();
          if (!perm.granted) { Alert.alert('カメラの許可が必要です'); return; }
          const result = await ImagePicker.launchCameraAsync({ quality: 1.0 });
          if (!result.canceled && result.assets[0]) {
            const a = result.assets[0];
            const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width ?? 1920, 1920) } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
            setPhotos(prev => [...prev, m.uri]);
          }
        },
      },
      {
        text: 'ギャラリー', onPress: async () => {
          const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
          if (!perm.granted) { Alert.alert('ギャラリーの許可が必要です'); return; }
          const result = await ImagePicker.launchImageLibraryAsync({
            quality: 1.0, allowsMultipleSelection: true, selectionLimit: 5,
          });
          if (!result.canceled) {
            const uris: string[] = [];
            for (const a of result.assets) {
              const m = await ImageManipulator.manipulateAsync(a.uri, [{ resize: { width: Math.min(a.width ?? 1920, 1920) } }], { compress: 0.6, format: ImageManipulator.SaveFormat.JPEG });
              uris.push(m.uri);
            }
            setPhotos(prev => [...prev, ...uris]);
          }
        },
      },
      { text: 'キャンセル', style: 'cancel' },
    ]);
  };

  const uploadPhoto = async (uri: string): Promise<string | null> => {
    try {
      const ext = 'jpg';
      const path = `${projectId}/${Date.now()}.${ext}`;
      const formData = new FormData();
      formData.append('file', { uri, name: `photo.${ext}`, type: 'image/jpeg' } as any);
      const { error } = await supabase.storage
        .from('report-photos')
        .upload(path, formData, { contentType: 'multipart/form-data' });
      if (error) return null;
      const { data } = supabase.storage.from('report-photos').getPublicUrl(path);
      return data.publicUrl;
    } catch {
      return null;
    }
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
        project_id: projectId,
        report_type: reportType,
        content: content.trim() || null,
        photos: uploadedUrls.length > 0 ? uploadedUrls : null,
        created_by: userId || null,
      });
      if (error) throw error;
      setModalVisible(false);
      fetchReports();
    } catch (e: any) {
      Alert.alert('エラー', e.message ?? '送信に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const formatDate = (iso: string) => {
    try {
      const d = new Date(iso);
      return `${d.getMonth() + 1}/${d.getDate()}`;
    } catch { return ''; }
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>報告一覧</Text>
        <TouchableOpacity style={styles.addBtn} onPress={openModal}>
          <Text style={styles.addBtnText}>＋ 追加</Text>
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color="#1a56db" />
        </View>
      ) : reports.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyIcon}>📋</Text>
          <Text style={styles.emptyText}>報告がありません</Text>
          <Text style={styles.emptySub}>＋追加から報告を作成してください</Text>
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16 }}>
          {reports.map(item => {
            const color = TYPE_COLOR[item.report_type as ReportType] ?? '#6b7280';
            return (
              <View key={item.id} style={styles.card}>
                <View style={styles.cardHeader}>
                  <View style={[styles.typeBadge, { backgroundColor: color + '22' }]}>
                    <Text style={[styles.typeText, { color }]}>{item.report_type}</Text>
                  </View>
                  <Text style={styles.metaText}>
                    {formatDate(item.created_at)}{item.reporter_name ? `　${item.reporter_name}` : ''}
                  </Text>
                </View>
                {item.content ? (
                  <Text style={styles.contentText} numberOfLines={2}>{item.content}</Text>
                ) : null}
                {item.photos && item.photos.length > 0 && (
                  <View style={styles.photoRow}>
                    {item.photos.slice(0, 3).map((url, i) => (
                      <Image key={i} source={{ uri: url }} style={styles.thumb} />
                    ))}
                    {item.photos.length > 3 && (
                      <View style={styles.moreBox}>
                        <Text style={styles.moreText}>+{item.photos.length - 3}</Text>
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
        </ScrollView>
      )}

      {/* 追加モーダル */}
      <Modal visible={modalVisible} transparent animationType="slide">
        <KeyboardAvoidingView
          style={styles.overlay}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        >
          <View style={styles.modalBox}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>報告を追加</Text>
              <TouchableOpacity onPress={() => setModalVisible(false)} style={styles.closeBtn}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView keyboardShouldPersistTaps="handled">
              <Text style={styles.label}>報告種別（必須）</Text>
              <View style={styles.typeRow}>
                {REPORT_TYPES.map(t => {
                  const active = reportType === t;
                  const c = TYPE_COLOR[t];
                  return (
                    <TouchableOpacity
                      key={t}
                      style={[styles.typeChip, active && { backgroundColor: c, borderColor: c }]}
                      onPress={() => setReportType(t)}
                    >
                      <Text style={[styles.typeChipText, active && { color: '#fff' }]}>{t}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>報告内容</Text>
              <View style={styles.inputRow}>
                <TextInput
                  style={[styles.textInput, { flex: 1, marginBottom: 0 }]}
                  placeholder="報告内容を入力..."
                  value={content}
                  onChangeText={setContent}
                  multiline
                  numberOfLines={5}
                  textAlignVertical="top"
                />
                <TouchableOpacity style={styles.micBtn} onPress={() => {
                  Alert.alert(
                    '音声入力',
                    '音声入力は本番アプリでご利用いただけます。\n現在はキーボードの🎤マイクボタンをご使用ください。',
                    [{ text: 'OK' }]
                  );
                }}>
                  <Text style={styles.micIcon}>🎤</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 16 }} />

              <Text style={styles.label}>写真</Text>
              <View style={styles.photoGrid}>
                {photos.map((uri, i) => (
                  <View key={i} style={styles.photoWrapper}>
                    <Image source={{ uri }} style={styles.photoPreview} />
                    <TouchableOpacity
                      style={styles.removeBtn}
                      onPress={() => setPhotos(prev => prev.filter((_, idx) => idx !== i))}
                    >
                      <Text style={styles.removeBtnText}>✕</Text>
                    </TouchableOpacity>
                  </View>
                ))}
                <TouchableOpacity style={styles.addPhoto} onPress={pickImage}>
                  <Text style={styles.addPhotoIcon}>＋</Text>
                  <Text style={styles.addPhotoText}>写真追加</Text>
                </TouchableOpacity>
              </View>

              <TouchableOpacity
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
                onPress={submit}
                disabled={submitting}
              >
                {submitting
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={styles.submitBtnText}>送信する</Text>
                }
              </TouchableOpacity>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </Modal>
      {/* 音声入力モーダル */}
      <Modal visible={voiceVisible} transparent animationType="slide">
        <View style={styles.voiceOverlay}>
          <WebView
            style={styles.webview}
            source={{ uri: 'https://employee-calendar-backend-production.up.railway.app/speech' }}
            originWhitelist={['*']}
            mediaPlaybackRequiresUserAction={false}
            allowsInlineMediaPlayback
            javaScriptEnabled
            domStorageEnabled
            allowsProtectedMedia
            onPermissionRequest={(request: any) => {
              request.grant(request.resources);
            }}
            mediaCapturePermissionGrantType="grant"
            onMessage={(e) => {
              try {
                const msg = JSON.parse(e.nativeEvent.data);
                if (msg.type === 'result' && msg.text) {
                  setContent(prev => prev ? prev + '\n' + msg.text : msg.text);
                  setVoiceVisible(false);
                } else if (msg.type === 'close') {
                  setVoiceVisible(false);
                } else if (msg.type === 'error') {
                  Alert.alert('音声認識エラー', msg.error ?? '不明なエラー');
                  setVoiceVisible(false);
                }
              } catch {}
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 12 },
  emptyText: { fontSize: 17, fontWeight: '700', color: '#374151', marginBottom: 4 },
  emptySub: { fontSize: 13, color: '#9ca3af', textAlign: 'center' },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  headerTitle: { fontSize: 17, fontWeight: '700', color: '#111827' },
  addBtn: { backgroundColor: '#1a56db', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 20 },
  addBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },

  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10, elevation: 2, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 4 },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  typeBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12 },
  typeText: { fontSize: 12, fontWeight: '700' },
  metaText: { fontSize: 12, color: '#9ca3af' },
  contentText: { fontSize: 14, color: '#374151', lineHeight: 20, marginBottom: 8 },
  photoRow: { flexDirection: 'row', gap: 6 },
  thumb: { width: 60, height: 60, borderRadius: 6 },
  moreBox: { width: 60, height: 60, borderRadius: 6, backgroundColor: '#f3f4f6', justifyContent: 'center', alignItems: 'center' },
  moreText: { fontSize: 13, fontWeight: '700', color: '#6b7280' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalBox: { backgroundColor: '#fff', borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, maxHeight: '90%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 },
  modalTitle: { fontSize: 18, fontWeight: '800', color: '#111827' },
  closeBtn: { padding: 6 },
  closeBtnText: { fontSize: 18, color: '#6b7280' },

  label: { fontSize: 13, fontWeight: '700', color: '#6b7280', marginBottom: 8 },
  typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  typeChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1.5, borderColor: '#e5e7eb' },
  typeChipText: { fontSize: 13, fontWeight: '600', color: '#6b7280' },

  textInput: { borderWidth: 1.5, borderColor: '#e5e7eb', borderRadius: 10, padding: 12, fontSize: 14, minHeight: 100, marginBottom: 16 },

  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 20 },
  photoWrapper: { position: 'relative' },
  photoPreview: { width: 80, height: 80, borderRadius: 8 },
  removeBtn: { position: 'absolute', top: -6, right: -6, backgroundColor: '#ef4444', borderRadius: 10, width: 20, height: 20, justifyContent: 'center', alignItems: 'center' },
  removeBtnText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  addPhoto: { width: 80, height: 80, borderRadius: 8, borderWidth: 2, borderColor: '#e5e7eb', borderStyle: 'dashed', justifyContent: 'center', alignItems: 'center' },
  addPhotoIcon: { fontSize: 24, color: '#9ca3af' },
  addPhotoText: { fontSize: 11, color: '#9ca3af', marginTop: 2 },

  submitBtn: { backgroundColor: '#1a56db', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  submitBtnText: { color: '#fff', fontSize: 16, fontWeight: '800' },
  inputRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 16 },
  micBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: '#1a56db', justifyContent: 'center', alignItems: 'center', marginTop: 4 },
  micIcon: { fontSize: 22 },
  voiceOverlay: { flex: 1, backgroundColor: '#000' },
  webview: { flex: 1 },
});
