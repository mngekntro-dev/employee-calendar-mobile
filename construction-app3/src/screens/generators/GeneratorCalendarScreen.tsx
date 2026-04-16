import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Modal, Alert,
  useWindowDimensions, Platform,
} from 'react-native';
import { supabase } from '../../lib/supabase';

const MAIN = '#1D9E75';
const DAYS = ['日', '月', '火', '水', '木', '金', '土'];
type Mode = '年間' | '6ヶ月' | '3ヶ月' | '1ヶ月';

interface CaseItem { id: string; name: string; work_date: string; status: string; }

// ── ユーティリティ ──────────────────────────────
function daysInMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}
function firstDayOfMonth(year: number, month: number) {
  return new Date(year, month, 1).getDay();
}
function pad2(n: number) { return String(n).padStart(2, '0'); }
function toDateStr(y: number, m: number, d: number) {
  return `${y}-${pad2(m + 1)}-${pad2(d)}`;
}

// ── ミニカレンダー（1ヶ月分）──────────────────
function MiniMonth({
  year, month, caseMap, isLarge, onDayPress,
}: {
  year: number; month: number;
  caseMap: Record<string, CaseItem[]>;
  isLarge: boolean;
  onDayPress: (dateStr: string, cases: CaseItem[]) => void;
}) {
  const today = new Date();
  const todayStr = toDateStr(today.getFullYear(), today.getMonth(), today.getDate());
  const total = daysInMonth(year, month);
  const startDay = firstDayOfMonth(year, month);
  const cells: (number | null)[] = [...Array(startDay).fill(null), ...Array.from({ length: total }, (_, i) => i + 1)];
  while (cells.length % 7 !== 0) cells.push(null);

  const cellSize = isLarge ? 44 : 28;
  const fontSize = isLarge ? 14 : 10;

  return (
    <View style={[styles.monthBox, isLarge && styles.monthBoxLarge]}>
      <Text style={[styles.monthTitle, isLarge && styles.monthTitleLarge]}>
        {month + 1}月
      </Text>
      {/* 曜日ヘッダー */}
      <View style={styles.weekRow}>
        {DAYS.map((d, i) => (
          <Text key={d} style={[
            styles.weekLabel,
            { width: cellSize, fontSize: isLarge ? 12 : 9 },
            i === 0 && { color: '#ef4444' },
            i === 6 && { color: '#3b82f6' },
          ]}>{d}</Text>
        ))}
      </View>
      {/* 日付グリッド */}
      {Array.from({ length: cells.length / 7 }, (_, wi) => (
        <View key={wi} style={styles.weekRow}>
          {cells.slice(wi * 7, wi * 7 + 7).map((day, di) => {
            if (!day) return <View key={di} style={{ width: cellSize, height: cellSize }} />;
            const dateStr = toDateStr(year, month, day);
            const dayCases = caseMap[dateStr] ?? [];
            const isToday = dateStr === todayStr;
            return (
              <TouchableOpacity
                key={di}
                onPress={() => dayCases.length > 0 && onDayPress(dateStr, dayCases)}
                style={[
                  styles.dayCell,
                  { width: cellSize, height: cellSize },
                  isToday && styles.todayCell,
                ]}
              >
                <Text style={[
                  styles.dayText,
                  { fontSize },
                  isToday && styles.todayText,
                  di === 0 && { color: '#ef4444' },
                  di === 6 && { color: '#3b82f6' },
                ]}>{day}</Text>
                {dayCases.length > 0 && (
                  <Text style={[styles.dot, { fontSize: isLarge ? 10 : 7 }]}>●</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      ))}
    </View>
  );
}

// ── メイン画面 ─────────────────────────────────
export default function GeneratorCalendarScreen() {
  const { width } = useWindowDimensions();
  const today = new Date();
  const [mode, setMode] = useState<Mode>('年間');
  const [year, setYear] = useState(today.getFullYear());
  const [baseMonth, setBaseMonth] = useState(today.getMonth()); // 1ヶ月/3ヶ月/6ヶ月の起点
  const [caseMap, setCaseMap] = useState<Record<string, CaseItem[]>>({});
  const [popup, setPopup] = useState<{ date: string; cases: CaseItem[] } | null>(null);

  // 表示する月リストを計算
  const months: { year: number; month: number }[] = (() => {
    if (mode === '年間') return Array.from({ length: 12 }, (_, i) => ({ year, month: i }));
    const count = mode === '6ヶ月' ? 6 : mode === '3ヶ月' ? 3 : 1;
    return Array.from({ length: count }, (_, i) => {
      const m = baseMonth + i;
      return { year: year + Math.floor(m / 12), month: m % 12 };
    });
  })();

  const startDate = `${months[0].year}-${pad2(months[0].month + 1)}-01`;
  const lastM = months[months.length - 1];
  const endDate = `${lastM.year}-${pad2(lastM.month + 1)}-${pad2(daysInMonth(lastM.year, lastM.month))}`;

  const fetchCases = useCallback(async () => {
    const { data, error } = await supabase
      .from('cases')
      .select('id, name, work_date, status')
      .gte('work_date', startDate)
      .lte('work_date', endDate);
    if (error) { console.error(error); return; }
    const map: Record<string, CaseItem[]> = {};
    (data ?? []).forEach((c: CaseItem) => {
      if (!c.work_date) return;
      const d = c.work_date.slice(0, 10);
      map[d] = [...(map[d] ?? []), c];
    });
    setCaseMap(map);
  }, [startDate, endDate]);

  useEffect(() => { fetchCases(); }, [fetchCases]);

  // ナビゲーション
  const prev = () => {
    if (mode === '年間') { setYear(y => y - 1); return; }
    const step = mode === '6ヶ月' ? 6 : mode === '3ヶ月' ? 3 : 1;
    let m = baseMonth - step;
    if (m < 0) { setYear(y => y - 1); m += 12; }
    setBaseMonth(m);
  };
  const next = () => {
    if (mode === '年間') { setYear(y => y + 1); return; }
    const step = mode === '6ヶ月' ? 6 : mode === '3ヶ月' ? 3 : 1;
    let m = baseMonth + step;
    if (m >= 12) { setYear(y => y + 1); m -= 12; }
    setBaseMonth(m);
  };

  // ヘッダーラベル
  const headerLabel = mode === '年間'
    ? `${year}年`
    : mode === '1ヶ月'
    ? `${year}年 ${baseMonth + 1}月`
    : `${months[0].year}年${months[0].month + 1}月 〜 ${lastM.year}年${lastM.month + 1}月`;

  // グリッド列数
  const cols = mode === '年間' ? 3 : mode === '6ヶ月' ? 2 : 1;
  const isLarge = mode === '1ヶ月';

  const MODES: Mode[] = ['年間', '6ヶ月', '3ヶ月', '1ヶ月'];

  return (
    <View style={styles.container}>
      {/* ヘッダー */}
      <View style={styles.header}>
        <TouchableOpacity onPress={prev} style={styles.navBtn}>
          <Text style={styles.navText}>‹</Text>
        </TouchableOpacity>
        <Text style={styles.headerLabel}>{headerLabel}</Text>
        <TouchableOpacity onPress={next} style={styles.navBtn}>
          <Text style={styles.navText}>›</Text>
        </TouchableOpacity>
      </View>

      {/* モード切り替えボタン */}
      <View style={styles.modeRow}>
        {MODES.map(m => (
          <TouchableOpacity
            key={m}
            onPress={() => {
              setMode(m);
              setBaseMonth(today.getMonth());
              setYear(today.getFullYear());
            }}
            style={[styles.modeBtn, mode === m && styles.modeBtnActive]}
          >
            <Text style={[styles.modeBtnText, mode === m && styles.modeBtnTextActive]}>{m}</Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* カレンダーグリッド */}
      <ScrollView contentContainerStyle={styles.grid}>
        {Array.from({ length: Math.ceil(months.length / cols) }, (_, ri) => (
          <View key={ri} style={styles.gridRow}>
            {months.slice(ri * cols, ri * cols + cols).map(({ year: y, month: mo }) => (
              <MiniMonth
                key={`${y}-${mo}`}
                year={y} month={mo}
                caseMap={caseMap}
                isLarge={isLarge}
                onDayPress={(d, c) => setPopup({ date: d, cases: c })}
              />
            ))}
          </View>
        ))}
      </ScrollView>

      {/* 案件ポップアップ */}
      <Modal visible={!!popup} transparent animationType="fade" onRequestClose={() => setPopup(null)}>
        <TouchableOpacity style={styles.overlay} onPress={() => setPopup(null)} activeOpacity={1}>
          <View style={styles.popupBox}>
            <Text style={styles.popupDate}>{popup?.date}</Text>
            {popup?.cases.map(c => (
              <Text key={c.id} style={styles.popupItem}>● {c.name}（{c.status}）</Text>
            ))}
            <TouchableOpacity onPress={() => setPopup(null)} style={styles.popupClose}>
              <Text style={{ color: MAIN, fontWeight: 'bold' }}>閉じる</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f9fafb' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: MAIN, paddingHorizontal: 16, paddingVertical: 10 },
  headerLabel: { fontSize: 18, fontWeight: 'bold', color: '#fff' },
  navBtn: { padding: 8 },
  navText: { fontSize: 28, color: '#fff', fontWeight: 'bold' },
  modeRow: { flexDirection: 'row', backgroundColor: '#fff', borderBottomWidth: 1, borderBottomColor: '#e5e7eb', paddingHorizontal: 8, paddingVertical: 6, gap: 6 },
  modeBtn: { flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center', backgroundColor: '#f3f4f6' },
  modeBtnActive: { backgroundColor: MAIN },
  modeBtnText: { fontSize: 13, color: '#374151', fontWeight: '600' },
  modeBtnTextActive: { color: '#fff' },
  grid: { padding: 8, gap: 8 },
  gridRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  monthBox: { flex: 1, backgroundColor: '#fff', borderRadius: 10, padding: 6, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  monthBoxLarge: { padding: 12 },
  monthTitle: { fontSize: 12, fontWeight: 'bold', color: MAIN, marginBottom: 4, textAlign: 'center' },
  monthTitleLarge: { fontSize: 18, marginBottom: 8 },
  weekRow: { flexDirection: 'row' },
  weekLabel: { textAlign: 'center', color: '#6b7280', fontWeight: '600', paddingVertical: 2 },
  dayCell: { alignItems: 'center', justifyContent: 'center', borderRadius: 4 },
  todayCell: { backgroundColor: MAIN, borderRadius: 20 },
  dayText: { color: '#111827' },
  todayText: { color: '#fff', fontWeight: 'bold' },
  dot: { color: MAIN, lineHeight: 10 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'center', alignItems: 'center' },
  popupBox: { backgroundColor: '#fff', borderRadius: 12, padding: 20, minWidth: 260, maxWidth: 320 },
  popupDate: { fontSize: 16, fontWeight: 'bold', color: MAIN, marginBottom: 10 },
  popupItem: { fontSize: 14, color: '#374151', marginBottom: 6 },
  popupClose: { marginTop: 12, alignItems: 'center' },
});
