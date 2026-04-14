import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView,
  Image, TextInput, Alert, ActivityIndicator, Platform,
  useWindowDimensions, FlatList,
} from 'react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system/legacy';
import * as XLSX from 'xlsx';
import { supabase } from '../../lib/supabase';
import { useAuth } from '../../context/AuthContext';

const DEFAULT_FOLDERS = ['現調', '施工前', '施工中', '施工後', 'その他'];
const PHOTOS_PER_PAGE = 3;

interface Photo {
  id: string;
  url: string;
  comment: string | null;
  folder: string;
  created_at: string;
}

interface LedgerRow {
  id: string;
  photo: Photo | null;
  comment: string;
}

interface Props {
  route: any;
  navigation: any;
  embedded?: boolean;
}

export default function PhotoLedgerScreen({ route, navigation }: Props) {
  const { projectId, projectName, ledgerId } = route.params;
  const { profile } = useAuth();
  const { width, height: winH } = useWindowDimensions();
  const isDesktop = width >= 700;
  const scrollRef = useRef<ScrollView>(null);
  const [scrollOffset, setScrollOffset] = useState(0);
  const today = formatDate(new Date().toISOString());

  const [photos, setPhotos] = useState<Photo[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string>('現調');
  const [rows, setRows] = useState<LedgerRow[]>([
    { id: '1', photo: null, comment: '' },
    { id: '2', photo: null, comment: '' },
    { id: '3', photo: null, comment: '' },
  ]);

  // rows の現在順番から photoId→位置番号マップを生成（▲▼移動と連動）
  const photoPositionMap = useMemo(() => {
    const map: Record<string, number> = {};
    rows.forEach((row, idx) => {
      if (row.photo) map[row.photo.id] = idx + 1;
    });
    return map;
  }, [rows]);
  const [selectionOrder, setSelectionOrder] = useState<Record<string, number>>({});
  const [nextOrder, setNextOrder] = useState(1);
  const [selectionMode, setSelectionMode] = useState(false);
  const [editLedgerId, setEditLedgerId] = useState<string | null>(ledgerId ?? null);
  const [showPhotoNo, setShowPhotoNo] = useState(true);
  const [showDate, setShowDate] = useState(true);
  const [showCreatedAt, setShowCreatedAt] = useState(true);
  const [showPageNo, setShowPageNo] = useState(true);
  const [exporting, setExporting] = useState(false);
  const [sortOrder, setSortOrder] = useState<'new' | 'old'>('new');
  const [ledgerTitle, setLedgerTitle] = useState(`${projectName} 現場写真台帳`);
  const [ledgerSubtitle, setLedgerSubtitle] = useState('');

  const totalPhotos = rows.filter(r => r.photo !== null).length;
  const totalPages = Math.ceil(rows.length / PHOTOS_PER_PAGE);

  const loadPhotos = useCallback(async () => {
    const { data } = await supabase
      .from('project_photos')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: sortOrder === 'old' });
    if (data) setPhotos(data);
  }, [projectId, sortOrder]);

  useEffect(() => { loadPhotos(); }, [loadPhotos]);

  useEffect(() => {
    if (!editLedgerId) return;
    (async () => {
      const { data } = await supabase
        .from('project_ledgers')
        .select('*')
        .eq('id', editLedgerId)
        .single();
      if (data) {
        setLedgerTitle(data.title ?? '');
        setLedgerSubtitle(data.subtitle ?? '');
        if (data.rows_json) {
          try { setRows(JSON.parse(data.rows_json)); } catch {}
        }
      }
    })();
  }, [editLedgerId]);

  const folderPhotos = photos.filter(p => p.folder === selectedFolder);
  const folders = [...new Set(['現調', '施工前', '施工中', '施工後', 'その他', ...photos.map(p => p.folder)])];

  function togglePhotoSelection(photo: Photo) {
    if (selectionOrder[photo.id]) {
      // 解除して番号を詰め直す
      const removed = selectionOrder[photo.id];
      const newOrder: Record<string, number> = {};
      Object.entries(selectionOrder).forEach(([id, n]) => {
        if (id !== photo.id) {
          newOrder[id] = n > removed ? n - 1 : n;
        }
      });
      setSelectionOrder(newOrder);
      setNextOrder(prev => prev - 1);
      if (Object.keys(newOrder).length === 0) setSelectionMode(false);
    } else {
      setSelectionOrder(prev => ({ ...prev, [photo.id]: nextOrder }));
      setNextOrder(prev => prev + 1);
      setSelectionMode(true);
    }
  }

  function confirmSelection() {
    // 選択順にソート
    const sorted = Object.entries(selectionOrder)
      .sort(([, a], [, b]) => a - b)
      .map(([id]) => photos.find(p => p.id === id))
      .filter(Boolean) as Photo[];

    setRows(prev => {
      const newRows = [...prev];
      sorted.forEach(photo => {
        // 既に台帳に入っている写真はスキップ
        if (newRows.some(r => r.photo?.id === photo.id)) return;
        const emptyIdx = newRows.findIndex(r => r.photo === null);
        if (emptyIdx !== -1) {
          newRows[emptyIdx] = { ...newRows[emptyIdx], photo };
        } else {
          newRows.push({ id: Date.now().toString() + Math.random(), photo, comment: '' });
        }
      });
      return newRows;
    });

    setSelectionOrder({});
    setNextOrder(1);
    setSelectionMode(false);
  }

  function addRow() {
    setRows(prev => [...prev, { id: `${Date.now()}`, photo: null, comment: '' }]);
  }

  function removeRow(idx: number) {
    if (rows.length <= 1) return;
    const photo = rows[idx].photo;
    if (photo) setSelectionOrder(prev => { const n = { ...prev }; delete n[photo.id]; return n; });
    setRows(prev => prev.filter((_, i) => i !== idx));
  }

  function moveRow(idx: number, dir: -1 | 1) {
    const newIdx = idx + dir;
    if (newIdx < 0 || newIdx >= rows.length) return;
    setRows(prev => {
      const arr = [...prev];
      [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
      return arr;
    });
  }

  function updateComment(idx: number, text: string) {
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, comment: text } : r));
  }

  function clearSlot(idx: number) {
    const photo = rows[idx].photo;
    if (photo) setSelectionOrder(prev => { const n = { ...prev }; delete n[photo.id]; return n; });
    setRows(prev => prev.map((r, i) => i === idx ? { ...r, photo: null } : r));
  }

  // ── 台帳をStorageとDBに保存 ──
  async function saveLedgerToProject(filePath: string, fileType: 'pdf' | 'excel') {
    try {
      const ext = fileType === 'pdf' ? 'pdf' : 'xlsx';
      const timestamp = Date.now();
      const storagePath = `ledgers/${projectId}/${timestamp}.${ext}`;
      const fileContent = await FileSystem.readAsStringAsync(filePath, { encoding: 'base64' as any });
      const mimeType = fileType === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
      const uint8 = Uint8Array.from(atob(fileContent), c => c.charCodeAt(0));
      const { error: upErr } = await supabase.storage
        .from('project-photos')
        .upload(storagePath, uint8, { contentType: mimeType, upsert: false });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(storagePath);
      await supabase.from('project_ledgers').insert({
        project_id: projectId,
        title: ledgerTitle,
        subtitle: ledgerSubtitle || null,
        file_type: fileType,
        url: urlData.publicUrl,
        created_by: profile?.id ?? null,
      });
    } catch (e: any) {
      console.warn('台帳保存エラー:', e.message);
    }
  }

  async function saveLedger() {
    if (!ledgerSubtitle.trim()) {
      if (Platform.OS === 'web') {
        window.alert('タイトルを入れて下さい');
      } else {
        Alert.alert('入力エラー', 'タイトルを入れて下さい');
      }
      return;
    }
    setExporting(true);
    try {
      if (Platform.OS === 'web') {
        // Web: ExcelをRailway APIで生成してSupabaseに保存のみ（ダウンロードなし）
        const RAILWAY_API = 'https://employee-calendar-backend-production.up.railway.app/api/ledger/excel';
        const apiRows = rows.map((row, i) => ({
          no: i + 1, photoUrl: row.photo?.url ?? null,
          date: row.photo ? formatDate(row.photo.created_at) : null,
          comment: row.comment || '',
        }));
        const res = await fetch(RAILWAY_API, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ title: ledgerTitle, subtitle: ledgerSubtitle || undefined, rows: apiRows, showPhotoNo: true, showDate: showDate }),
        });
        if (!res.ok) throw new Error(await res.text());
        const arrayBuffer = await res.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);
        const timestamp = Date.now();
        const storagePath = `ledgers/${projectId}/${timestamp}.xlsx`;
        const { error: upErr } = await supabase.storage
          .from('project-photos')
          .upload(storagePath, uint8, { contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', upsert: false });
        if (upErr) throw upErr;
        const { data: urlData } = supabase.storage.from('project-photos').getPublicUrl(storagePath);
        const rowsJson = JSON.stringify(rows);
        if (editLedgerId) {
          await supabase.from('project_ledgers').update({
            title: ledgerTitle, subtitle: ledgerSubtitle || null, file_type: 'excel',
            url: urlData.publicUrl, rows_json: rowsJson,
          }).eq('id', editLedgerId);
        } else {
          await supabase.from('project_ledgers').insert({
            project_id: projectId, title: ledgerTitle,
            subtitle: ledgerSubtitle || null, file_type: 'excel',
            url: urlData.publicUrl, rows_json: rowsJson,
            created_by: profile?.id ?? null,
          });
        }
        navigation.goBack();
      } else {
        await exportPDF(true);
        await exportExcel(true);
        Alert.alert('保存完了', '台帳をPDF・Excelで案件に保存しました');
      }
    } catch (e: any) {
      if (Platform.OS === 'web') {
        window.alert('保存に失敗しました: ' + e.message);
      } else {
        Alert.alert('エラー', '保存に失敗しました: ' + e.message);
      }
    }
    setExporting(false);
  }

  async function downloadExcel() {
    setExporting(true);
    try {
      const RAILWAY_API = 'https://employee-calendar-backend-production.up.railway.app/api/ledger/excel';
      const apiRows = rows.map((row, i) => ({
        no: i + 1, photoUrl: row.photo?.url ?? null,
        date: row.photo ? formatDate(row.photo.created_at) : null,
        comment: row.comment || '',
      }));
      const res = await fetch(RAILWAY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: ledgerTitle, subtitle: ledgerSubtitle || undefined, rows: apiRows, showPhotoNo: true, showDate: showDate }),
      });
      if (!res.ok) throw new Error(await res.text());
      const arrayBuffer = await res.arrayBuffer();
      const blob = new Blob([new Uint8Array(arrayBuffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const dlUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = dlUrl; a.download = `${ledgerTitle}_台帳.xlsx`; a.click();
      URL.revokeObjectURL(dlUrl);
    } catch (e: any) { Alert.alert('エラー', 'Excel出力に失敗しました: ' + e.message); }
    setExporting(false);
  }

  async function downloadPDF() {
    setExporting(true);
    try {
      const apiRows = rows.map((row, i) => ({
        no: i + 1, photoUrl: row.photo?.url ?? null,
        date: row.photo ? formatDate(row.photo.created_at) : null,
        comment: row.comment || '',
      }));
      const rowsHtml = apiRows.map(row => `
        <tr>
          <td class="no">${row.no}</td>
          <td class="photo">${row.photoUrl ? `<img src="${row.photoUrl}" />` : '<span class="empty">写真なし</span>'}<div class="date">${row.date ?? ''}</div></td>
          <td class="comment">${(row.comment || '').replace(/\n/g, '<br>')}</td>
        </tr>`).join('');
      const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${ledgerTitle}</title>
        <style>
          @page { size: A4; margin: 10mm; }
          body { font-family: sans-serif; margin: 0; }
          h1 { color: #059669; font-size: 18px; margin-bottom: 2px; }
          h2 { color: #374151; font-size: 13px; font-weight: normal; margin-top: 0; margin-bottom: 8px; }
          table { width: 100%; border-collapse: collapse; }
          td { border: 1px solid #d1d5db; vertical-align: top; padding: 4px; }
          .no { width: 30px; text-align: center; font-size: 11px; color: #9ca3af; }
          .photo { width: 45%; }
          .photo img { width: 100%; height: auto; display: block; }
          .date { font-size: 10px; color: #6b7280; margin-top: 2px; }
          .comment { font-size: 12px; color: #374151; }
          .empty { color: #9ca3af; font-size: 11px; }
        </style></head><body>
        <h1>${ledgerTitle}</h1>${ledgerSubtitle ? `<h2>${ledgerSubtitle}</h2>` : ''}
        <table><tbody>${rowsHtml}</tbody></table>
        <script>window.onload=()=>{window.print();}<\/script>
        </body></html>`;
      const w = window.open('', '_blank');
      if (w) { w.document.write(html); w.document.close(); }
    } catch (e: any) { Alert.alert('エラー', 'PDF出力に失敗しました: ' + e.message); }
    setExporting(false);
  }

  // ── ファイルを保存先に書き出す ──
  async function saveToDevice(filePath: string, _fileName: string, mimeType: string) {
    await Sharing.shareAsync(filePath, { mimeType, UTI: mimeType });
  }

  // ── PDF出力 ──
  async function exportPDF(saveOnly = false) {
    if (!saveOnly) setExporting(true);
    try {
      // 写真をbase64に変換
      const rowsWithBase64 = await Promise.all(
        rows.map(async (row) => {
          if (!row.photo) return { ...row, base64: null };
          try {
            const res = await fetch(row.photo.url);
            const blob = await res.blob();
            const b64 = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                const result = reader.result as string;
                resolve(result);
              };
              reader.readAsDataURL(blob);
            });
            return { ...row, base64: b64 };
          } catch {
            return { ...row, base64: null };
          }
        })
      );

      // ページ分割
      const pages: typeof rowsWithBase64[] = [];
      for (let i = 0; i < rowsWithBase64.length; i += PHOTOS_PER_PAGE) {
        pages.push(rowsWithBase64.slice(i, i + PHOTOS_PER_PAGE));
      }

      const pageHtml = pages.map((pageRows, pageIdx) => `
        <div class="page">
          <div class="page-header">
            <div class="header-left">
              <div class="title">${ledgerTitle}</div>
              ${ledgerSubtitle ? `<div class="subtitle">${ledgerSubtitle}</div>` : ''}
            </div>
            <div class="header-right">
              ${showCreatedAt ? `<span class="header-date">${today}</span>` : ''}
              ${showPageNo ? `<span class="header-page">p.${pageIdx + 1} / ${pages.length}</span>` : ''}
            </div>
          </div>
          <div class="photo-grid">
            ${pageRows.map((row, rowIdx) => {
              const globalIdx = pageIdx * PHOTOS_PER_PAGE + rowIdx;
              return `
              <div class="photo-row">
                <div class="photo-side">
                  ${showPhotoNo ? `<div class="photo-no">No.${globalIdx + 1}</div>` : ''}
                  ${row.base64
                    ? `<img src="${row.base64}" class="photo-img" />`
                    : '<div class="photo-empty">写真なし</div>'
                  }
                </div>
                <div class="comment-side">
                  <div class="comment-label">撮影日</div>
                  <div class="comment-text">${row.photo ? formatDate(row.photo.created_at) : '-'}</div>
                  <div class="comment-label" style="margin-top:1px;">コメント</div>
                  <div class="comment-text">${(row.comment || '').trim() ? (row.comment || '').replace(/\n/g, '<br>') : '<span style="color:#9ca3af;">（なし）</span>'}</div>
                </div>
              </div>`;
            }).join('')}
          </div>
        </div>
      `).join('');

      const html = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <style>
            @page { size: A4; margin: 0; }
            * { box-sizing: border-box; margin: 0; padding: 0; }
            body { font-family: 'Hiragino Sans', 'Yu Gothic', sans-serif; font-size: 13px; background: #fff; }
            .page {
              width: 210mm; height: 297mm;
              page-break-after: always;
              break-after: page;
              display: flex; flex-direction: column;
              padding: 6mm 8mm 4mm;
              overflow: hidden;
            }
            .page:last-child {
              page-break-after: auto;
              break-after: auto;
            }
            .page-header {
              display: flex; justify-content: space-between; align-items: flex-end;
              border-bottom: 2px solid #059669; padding-bottom: 4px; margin-bottom: 4px;
              flex-shrink: 0;
            }
            .title { font-size: 15px; font-weight: bold; color: #059669; }
            .subtitle { font-size: 13px; color: #374151; margin-top: 1px; }
            .header-right { display: flex; gap: 12px; font-size: 13px; color: #6b7280; }
            .header-page { font-weight: bold; }
            .photo-grid {
              flex: 1; display: flex; flex-direction: column;
              gap: 3px; overflow: hidden;
            }
            .photo-row {
              flex: 1; display: flex; border: 1px solid #d1d5db; border-radius: 3px; overflow: hidden; min-height: 0;
            }
            .photo-side {
              width: 45%; background: #f9fafb; position: relative;
              display: flex; flex-direction: column; overflow: hidden;
            }
            .photo-no {
              position: absolute; top: 3px; left: 5px; background: rgba(5,150,105,0.85);
              color: #fff; font-size: 11px; font-weight: bold; padding: 2px 6px; border-radius: 8px; z-index: 1;
            }
            .photo-img {
              width: 100%; height: 100%; object-fit: cover;
            }
            .photo-empty {
              flex: 1; display: flex; align-items: center; justify-content: center;
              color: #9ca3af; font-size: 13px; border: 2px dashed #e5e7eb; margin: 6px; border-radius: 3px;
            }
            .photo-date {
              position: absolute; bottom: 0; left: 0; right: 0;
              background: rgba(0,0,0,0.5); color: #fff; font-size: 12px;
              padding: 3px 8px; text-align: right;
            }
            .comment-side {
              width: 55%; padding: 8px 12px; display: flex; flex-direction: column;
              border-left: 1px solid #e5e7eb; overflow: hidden;
            }
            .comment-label {
              font-size: 12px; font-weight: bold; color: #9ca3af;
              border-bottom: 1px solid #f3f4f6; padding-bottom: 2px; margin-bottom: 3px;
            }
            .comment-text {
              font-size: 14px; color: #374151; line-height: 1.4; overflow: hidden;
            }
          </style>
        </head>
        <body>${pageHtml}</body>
        </html>
      `;

      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const dest = `${FileSystem.documentDirectory}photo_ledger_${Date.now()}.pdf`;
      await FileSystem.moveAsync({ from: uri, to: dest });
      if (!saveOnly) await saveToDevice(dest, `photo_ledger_${Date.now()}.pdf`, 'application/pdf');
      else await saveLedgerToProject(dest, 'pdf');
    } catch (e: any) {
      if (!saveOnly) Alert.alert('エラー', 'PDF出力に失敗しました: ' + e.message);
      else throw e;
    }
    if (!saveOnly) setExporting(false);
  }

  // ── Excel出力（Railwayサーバーサイド・exceljsで写真埋め込み）──
  async function exportExcel(saveOnly = false) {
    if (!saveOnly) setExporting(true);
    try {
      const RAILWAY_API = 'https://employee-calendar-backend-production.up.railway.app/api/ledger/excel';

      // 写真付き行データを作成（URLはそのままサーバーに渡す）
      const apiRows = rows.map((row, i) => ({
        no: i + 1,
        photoUrl: row.photo?.url ?? null,
        date: row.photo ? formatDate(row.photo.created_at) : null,
        comment: row.comment || '',
      }));

      const res = await fetch(RAILWAY_API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: ledgerTitle,
          subtitle: ledgerSubtitle || undefined,
          rows: apiRows,
          showPhotoNo: true,
          showDate: showDate,
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        throw new Error(errText);
      }

      const arrayBuffer = await res.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);
      // バイナリをBase64に変換
      let binary = '';
      for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
      const base64 = btoa(binary);

      const fileName = `photo_ledger_${Date.now()}.xlsx`;
      const path = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });

      if (!saveOnly) {
        await saveToDevice(path, fileName, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      } else {
        await saveLedgerToProject(path, 'excel');
      }
    } catch (e: any) {
      if (!saveOnly) Alert.alert('エラー', 'Excel出力に失敗しました: ' + e.message);
      else throw e;
    }
    if (!saveOnly) setExporting(false);
  }

  const pageCount = Math.ceil(rows.length / PHOTOS_PER_PAGE);

  return (
    <View style={styles.container}>
      <View style={isDesktop ? styles.desktopBody : styles.mobileBody}>
        {/* 左パネル：フォルダ＆写真 */}
        <View style={isDesktop ? styles.leftPanel : styles.mobileLeft}>
          {/* 左パネル：件名・タイトル入力 */}
          <View style={styles.leftTitleArea}>
            <View style={styles.leftTitleRow}>
              <Text style={styles.leftTitleLabel}>件名</Text>
              <TextInput style={styles.leftTitleInput} value={ledgerTitle} onChangeText={setLedgerTitle} placeholder="件名を入力" />
            </View>
            <View style={styles.leftTitleRow}>
              <Text style={styles.leftTitleLabel}>タイトル</Text>
              <TextInput style={styles.leftTitleInput} value={ledgerSubtitle} onChangeText={setLedgerSubtitle} placeholder="タイトルを入力（必須）" />
            </View>
          </View>
          <View style={styles.panelHeader}>
            <Text style={styles.panelTitle}>写真フォルダ</Text>
          </View>
          {/* フォルダタブ（2段折り返し） */}
          <View style={styles.folderTabs}>
            {folders.map(f => (
              <TouchableOpacity key={f} style={[styles.folderTab, selectedFolder === f && styles.folderTabActive]}
                onPress={() => setSelectedFolder(f)}>
                <Text style={[styles.folderTabText, selectedFolder === f && styles.folderTabTextActive]}>📁 {f}</Text>
              </TouchableOpacity>
            ))}
          </View>
          {/* スクロール上ボタン */}
          {folderPhotos.length >= 9 && (
            <TouchableOpacity style={styles.scrollBtn} onPress={() => scrollRef.current?.scrollTo({ y: Math.max(0, scrollOffset - 300), animated: true })}>
              <Text style={styles.scrollBtnText}>▲ 上へ</Text>
            </TouchableOpacity>
          )}
          {/* 写真グリッド */}
          {Platform.OS === 'web' ? (
            <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 } as any}>
              <View style={styles.photoGridInner}>
                {folderPhotos.map(item => {
                  const badgeNum = photoPositionMap[item.id] ?? selectionOrder[item.id];
                  return (
                    <TouchableOpacity key={item.id} onPress={() => togglePhotoSelection(item)} style={styles.thumbWrap}>
                      <Image source={{ uri: item.url }} style={styles.thumb} />
                      {badgeNum !== undefined && (
                        <View style={styles.orderBadge}>
                          <Text style={styles.orderBadgeText}>{badgeNum}</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
                {folderPhotos.length === 0 && <Text style={styles.emptyText}>写真なし</Text>}
              </View>
            </div>
          ) : (
          <ScrollView
            ref={scrollRef}
            style={[styles.photoGrid, Platform.OS === 'web' ? { height: winH - 380, flex: undefined } : {}]}
            contentContainerStyle={{ paddingBottom: 8 }}
            onScroll={e => setScrollOffset(e.nativeEvent.contentOffset.y)}
            scrollEventThrottle={16}
          >
            <View style={styles.photoGridInner}>
              {folderPhotos.map(item => {
                const order = selectionOrder[item.id];
                return (
                  <TouchableOpacity key={item.id} onPress={() => togglePhotoSelection(item)} style={styles.thumbWrap}>
                    <Image source={{ uri: item.url }} style={styles.thumb} />
                    {(photoPositionMap[item.id] !== undefined || selectionOrder[item.id] !== undefined) && (
                      <View style={styles.orderBadge}>
                        <Text style={styles.orderBadgeText}>{photoPositionMap[item.id] ?? selectionOrder[item.id]}</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
              {folderPhotos.length === 0 && <Text style={styles.emptyText}>写真なし</Text>}
            </View>
          </ScrollView>
          )}
          {/* スクロール下ボタン */}
          {folderPhotos.length >= 9 && (
            <TouchableOpacity style={styles.scrollBtn} onPress={() => scrollRef.current?.scrollTo({ y: scrollOffset + 300, animated: true })}>
              <Text style={styles.scrollBtnText}>▼ 下へ</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* 右パネル：台帳レイアウト */}
        <View style={isDesktop ? styles.rightPanel : styles.mobileRight}>
          {/* タイトル＋ページ情報 横並び */}
          <View style={styles.titleRow}>
            <Text style={styles.titleLabel}>件　　名：</Text>
            <TextInput
              style={styles.titleInput}
              value={ledgerTitle}
              onChangeText={setLedgerTitle}
              placeholder="件名を入力"
            />
            <Text style={styles.ledgerInfoInline}>p.<Text style={styles.ledgerInfoVal}>{pageCount}</Text>　<Text style={styles.ledgerInfoVal}>{totalPhotos}</Text>/200枚</Text>
          </View>
          {/* 副題＋表示設定チェック 横並び */}
          <View style={styles.titleRow}>
            <Text style={styles.titleLabel}>タイトル：</Text>
            <TextInput
              style={styles.titleInput}
              value={ledgerSubtitle}
              onChangeText={setLedgerSubtitle}
              placeholder="タイトルを入力（必須）"
            />
            <View style={styles.settingsInline}>
              {[
                { label: '写真No', val: showPhotoNo, set: setShowPhotoNo },
                { label: '撮影日', val: showDate, set: setShowDate },
                { label: '作成日', val: showCreatedAt, set: setShowCreatedAt },
                { label: 'ページ数', val: showPageNo, set: setShowPageNo },
              ].map(s => (
                <TouchableOpacity key={s.label} style={styles.settingChip} onPress={() => s.set(v => !v)}>
                  <Text style={[styles.settingCheck, s.val && styles.settingCheckOn]}>{s.val ? '☑' : '☐'}</Text>
                  <Text style={styles.settingLabel}>{s.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* 行追加ボタン：タイトルの下に固定 */}
          <TouchableOpacity style={styles.addRowBtn} onPress={addRow}>
            <Text style={styles.addRowText}>＋ 行追加</Text>
          </TouchableOpacity>

          {/* 台帳本体 */}
          {Platform.OS === 'web' ? (
          <div style={{ flex: '1 1 0%', overflowY: 'auto', minHeight: 0, padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' } as any}>
            <View style={[styles.ledgerCard, { width: '100%', maxWidth: 794 } as any]}>
            {rows.map((row, idx) => {
              const showPageSep = idx % PHOTOS_PER_PAGE === 0;
              return (
                <View key={row.id}>
                  {showPageSep && (
                    <View style={styles.pageSep}>
                      <Text style={styles.pageLabel}>p.{Math.floor(idx / PHOTOS_PER_PAGE) + 1}</Text>
                    </View>
                  )}
                  <View style={styles.ledgerRow}>
                    {/* 並び替えボタン */}
                    <View style={styles.sortBtns}>
                      <TouchableOpacity
                        style={[styles.sortBtn, idx === 0 && styles.sortBtnDisabled]}
                        onPress={() => moveRow(idx, -1)}
                        disabled={idx === 0}
                      >
                        <Text style={styles.sortBtnText}>▲</Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={[styles.sortBtn, idx === rows.length - 1 && styles.sortBtnDisabled]}
                        onPress={() => moveRow(idx, 1)}
                        disabled={idx === rows.length - 1}
                      >
                        <Text style={styles.sortBtnText}>▼</Text>
                      </TouchableOpacity>
                    </View>
                    {showPhotoNo && <Text style={styles.rowNo}>No.{idx + 1}</Text>}
                    {/* 写真スロット */}
                    <TouchableOpacity style={styles.photoSlot} onLongPress={() => clearSlot(idx)}>
                      {row.photo ? (
                        <>
                          <Image source={{ uri: row.photo.url }} style={styles.slotImage} />
                        </>
                      ) : (
                        <View style={styles.emptySlot}>
                          <Text style={styles.emptySlotText}>左の写真をタップ{'\n'}して追加</Text>
                        </View>
                      )}
                    </TouchableOpacity>
                    {/* コメント */}
                    <View style={styles.commentSlot}>
                      {showDate && row.photo && (
                        <Text style={styles.slotDateAbove}>📅 {formatDate(row.photo.created_at)}</Text>
                      )}
                      <Text style={styles.commentLabel}>写真コメント</Text>
                      <TextInput
                        style={styles.commentInput}
                        value={row.comment}
                        onChangeText={t => updateComment(idx, t)}
                        multiline
                        placeholder="コメントを入力..."
                        placeholderTextColor="#d1d5db"
                      />
                    </View>
                    {/* 行削除 */}
                    <TouchableOpacity onPress={() => removeRow(idx)} style={styles.removeRowBtn}>
                      <Text style={{ color: '#9ca3af', fontSize: 18 }}>×</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })}
            </View>{/* ledgerCard end */}
          </div>
          ) : null}
          {selectionMode && (
            <View style={styles.selectionOverlay} pointerEvents="box-only">
              <Text style={styles.selectionOverlayText}>画像選択中は操作できません</Text>
            </View>
          )}

          {/* 出力ボタン（右パネルから削除） */}
        </View>
      </View>
      {/* 画面左下固定：決定バー＋保存ボタン */}
      {isDesktop && Platform.OS === 'web' && (
        <View style={styles.fixedBtns}>
          {selectionMode && (
            <View style={styles.selectionBar}>
              <Text style={styles.selectionCount}>{Object.keys(selectionOrder).length}枚選択中</Text>
              <View style={styles.selectionBtns}>
                <TouchableOpacity style={styles.cancelSelBtn} onPress={() => { setSelectionOrder({}); setNextOrder(1); setSelectionMode(false); }}>
                  <Text style={styles.cancelSelText}>キャンセル</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.confirmSelBtn} onPress={confirmSelection}>
                  <Text style={styles.confirmSelText}>決定（{Object.keys(selectionOrder).length}枚）</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          <TouchableOpacity style={styles.leftSaveBtn} onPress={saveLedger} disabled={exporting}>
            {exporting ? <ActivityIndicator color="#fff" /> : <Text style={styles.leftSaveBtnText}>💾 台帳を保存</Text>}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function formatDate(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  desktopBody: { flex: 1, flexDirection: 'row', overflow: 'hidden' as any },
  mobileBody: { flex: 1, flexDirection: 'column' },
  leftPanel: { width: 320, borderRightWidth: 1, borderRightColor: '#e5e7eb', backgroundColor: '#fff', flexDirection: 'column', overflow: 'hidden' as any, height: 'calc(100vh - 100px)' as any },
  rightPanel: { flex: 1, backgroundColor: '#e5e7eb', display: 'flex' as any, flexDirection: 'column' as any, height: 'calc(100vh - 100px)' as any, overflow: 'hidden' as any, minHeight: 0 },
  mobileLeft: { height: 240, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', backgroundColor: '#fff' },
  mobileRight: { flex: 1 },
  leftTitleArea: { borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 6, backgroundColor: '#f9fafb' },
  leftTitleRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 4 },
  leftTitleLabel: { fontSize: 11, color: '#6b7280', width: 44, fontWeight: '600' },
  leftTitleInput: { flex: 1, fontSize: 12, borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 4, paddingHorizontal: 6, paddingVertical: 3, backgroundColor: '#fff' },
  panelTitle: { fontSize: 14, fontWeight: '800', color: '#111827' },
  sortBtn: { fontSize: 13, color: '#059669', fontWeight: '600' },
  leftSaveBtn: { margin: 10, padding: 12, backgroundColor: '#059669', borderRadius: 8, alignItems: 'center', flexShrink: 0 },
  leftSaveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  leftBottomFixed: { backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  fixedBtns: { position: 'fixed' as any, bottom: 0, left: 0, width: 320, backgroundColor: '#fff', borderTopWidth: 2, borderTopColor: '#e5e7eb', zIndex: 100 },
  scrollBtn: { alignItems: 'center', paddingVertical: 4, backgroundColor: '#f3f4f6', borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#e5e7eb' },
  scrollBtnText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  folderTabs: { flexDirection: 'row', flexWrap: 'wrap', paddingHorizontal: 8, paddingVertical: 4, borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  folderTab: { paddingHorizontal: 10, paddingVertical: 6, marginRight: 6, marginBottom: 4, borderRadius: 16, backgroundColor: '#f3f4f6' },
  folderTabActive: { backgroundColor: '#059669' },
  folderTabText: { fontSize: 12, color: '#6b7280', fontWeight: '600' },
  folderTabTextActive: { color: '#fff' },
  photoGrid: { flex: 1, minHeight: 0 as any, overflow: 'auto' as any },
  photoGridInner: { flexDirection: 'row', flexWrap: 'wrap' },
  thumbWrap: { width: '33.33%' as any, aspectRatio: 1, padding: 1, position: 'relative' },
  thumb: { width: '100%', height: '100%' },
  addedBadge: { position: 'absolute', top: 4, right: 4, backgroundColor: '#059669', borderRadius: 12, minWidth: 22, height: 22, justifyContent: 'center', alignItems: 'center', paddingHorizontal: 4 },
  addedBadgeText: { color: '#fff', fontSize: 12, fontWeight: '800' },
  pageSep: { paddingHorizontal: 4, paddingTop: 6, paddingBottom: 2 },
  sortBtns: { flexDirection: 'column', justifyContent: 'center', gap: 2, marginRight: 4 },
  sortBtn: { backgroundColor: '#e5e7eb', borderRadius: 4, width: 24, height: 24, justifyContent: 'center', alignItems: 'center' },
  sortBtnDisabled: { opacity: 0.3 },
  sortBtnText: { fontSize: 10, color: '#374151', fontWeight: 'bold' },
  dragHandle: { paddingHorizontal: 6, justifyContent: 'center', alignItems: 'center' },
  dragIcon: { fontSize: 22, color: '#9ca3af' },
  emptyText: { padding: 20, color: '#9ca3af', textAlign: 'center' },
  titleRow: { flexDirection: 'row', alignItems: 'center', padding: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  titleLabel: { fontSize: 13, color: '#374151', fontWeight: '600', marginRight: 8 },
  titleInput: { flex: 1, fontSize: 14, color: '#111827', fontWeight: '700', borderWidth: 1, borderColor: '#d1d5db', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#f9fafb' },
  ledgerInfo: { padding: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  ledgerInfoText: { fontSize: 13, color: '#374151' },
  ledgerInfoVal: { fontWeight: '700', color: '#059669' },
  ledgerInfoInline: { fontSize: 12, color: '#374151', marginLeft: 10, whiteSpace: 'nowrap' } as any,
  settingsRow: { maxHeight: 44, paddingHorizontal: 10, backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#f3f4f6' },
  settingsInline: { flexDirection: 'row', flexWrap: 'wrap', marginLeft: 8 },
  settingChip: { flexDirection: 'row', alignItems: 'center', marginRight: 16, paddingVertical: 10 },
  settingCheck: { fontSize: 16, marginRight: 4, color: '#9ca3af' },
  settingCheckOn: { color: '#059669' },
  settingLabel: { fontSize: 13, color: '#374151' },
  ledgerScroll: { flex: 1, padding: 16, overflow: 'auto' as any },
  ledgerCard: {
    backgroundColor: '#fff',
    maxWidth: 794,
    width: '100%',
    alignSelf: 'center' as any,
    padding: 24,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  page: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb', marginBottom: 16, padding: 12 },
  pageLabel: { fontSize: 12, color: '#6b7280', marginBottom: 8 },
  ledgerRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6', paddingBottom: 10 },
  rowNo: { width: 36, fontSize: 11, color: '#9ca3af', paddingTop: 8 },
  photoSlot: { width: 130, height: 120, backgroundColor: '#f0f0f0', borderRadius: 6, overflow: 'hidden', borderWidth: 1, borderColor: '#e5e7eb', borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center' },
  slotImage: { width: '100%', height: '100%', resizeMode: 'contain' },
  slotDate: { position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: 'rgba(0,0,0,0.4)', color: '#fff', fontSize: 10, padding: 3, textAlign: 'center' },
  slotDateAbove: { fontSize: 12, color: '#059669', fontWeight: '600', marginBottom: 4 },
  emptySlot: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptySlotText: { color: '#9ca3af', fontSize: 11, textAlign: 'center', lineHeight: 18 },
  commentSlot: { flex: 1, marginLeft: 8 },
  commentLabel: { fontSize: 11, color: '#9ca3af', marginBottom: 4 },
  commentInput: { flex: 1, fontSize: 15, color: '#374151', borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 6, padding: 8, minHeight: 100, textAlignVertical: 'top' },
  removeRowBtn: { width: 28, alignItems: 'center', paddingTop: 8 },
  pageFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  footerText: { fontSize: 11, color: '#9ca3af' },
  addRowBtn: { backgroundColor: '#f0fdf4', borderWidth: 1, borderColor: '#059669', borderRadius: 8, alignItems: 'center', justifyContent: 'center', paddingVertical: 6, paddingHorizontal: 14, alignSelf: 'flex-start' as any, margin: 8 },
  addRowText: { color: '#059669', fontWeight: '700', fontSize: 13 },
  exportRow: { flexDirection: 'row', gap: 12, padding: 12, backgroundColor: '#fff', borderTopWidth: 1, borderTopColor: '#e5e7eb' },
  exportBtn: { flex: 1, padding: 14, borderRadius: 10, alignItems: 'center' },
  saveBtn: { backgroundColor: '#1a56db' },
  pdfBtn: { backgroundColor: '#dc2626' },
  xlsBtn: { backgroundColor: '#059669' },
  exportBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  orderBadge: { position: 'absolute', top: 4, left: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: '#059669', justifyContent: 'center', alignItems: 'center' },
  orderBadgeText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  selectionBar: { padding: 10, borderTopWidth: 1, borderTopColor: '#e5e7eb', backgroundColor: '#f9fafb', flexShrink: 0 },
  selectionCount: { fontSize: 12, color: '#6b7280', marginBottom: 6 },
  selectionBtns: { flexDirection: 'row', gap: 8 },
  cancelSelBtn: { flex: 1, padding: 8, borderRadius: 6, borderWidth: 1, borderColor: '#d1d5db', alignItems: 'center' },
  cancelSelText: { fontSize: 13, color: '#6b7280' },
  confirmSelBtn: { flex: 1, padding: 8, borderRadius: 6, backgroundColor: '#059669', alignItems: 'center' },
  confirmSelText: { fontSize: 13, color: '#fff', fontWeight: 'bold' },
  selectionOverlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 60, backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center', zIndex: 10 },
  selectionOverlayText: { color: '#fff', fontSize: 16, fontWeight: 'bold', backgroundColor: 'rgba(0,0,0,0.6)', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 8 },
});
