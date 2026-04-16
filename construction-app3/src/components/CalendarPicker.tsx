import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';

const DAY_LABELS = ['日', '月', '火', '水', '木', '金', '土'];

export const todayStr = () => {
  const t = new Date();
  return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
};

interface Props {
  value: string;
  onChange: (date: string) => void;
  onClose: () => void;
  allowClear?: boolean;
}

export function CalendarPicker({ value, onChange, onClose, allowClear = true }: Props) {
  const init = value ? new Date(value + 'T00:00:00') : new Date();
  const [year, setYear] = useState(init.getFullYear());
  const [month, setMonth] = useState(init.getMonth());

  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const fmt = (d: number) =>
    `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  const today = todayStr();

  return (
    <View style={styles.container}>
      <View style={styles.nav}>
        <TouchableOpacity onPress={() => { if (month === 0) { setMonth(11); setYear(y => y - 1); } else setMonth(m => m - 1); }}>
          <Text style={styles.arrow}>◀</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{year}年{month + 1}月</Text>
        <TouchableOpacity onPress={() => { if (month === 11) { setMonth(0); setYear(y => y + 1); } else setMonth(m => m + 1); }}>
          <Text style={styles.arrow}>▶</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.weekRow}>
        {DAY_LABELS.map((d, i) => (
          <Text key={d} style={[styles.weekLabel, i === 0 && { color: '#dc2626' }, i === 6 && { color: '#1a56db' }]}>{d}</Text>
        ))}
      </View>
      <View style={styles.grid}>
        {cells.map((day, i) => {
          const dateStr = day ? fmt(day) : '';
          const isSelected = dateStr === value;
          const isToday = dateStr === today;
          const col = i % 7;
          return (
            <TouchableOpacity
              key={i}
              onPress={() => { if (day) { onChange(fmt(day)); onClose(); } }}
              disabled={!day}
              style={[styles.cell, isSelected && styles.selectedCell, isToday && !isSelected && styles.todayCell]}
            >
              {day ? (
                <Text style={[
                  styles.dayNum,
                  isSelected && { color: '#fff', fontWeight: '800' },
                  isToday && !isSelected && { color: '#1a56db', fontWeight: '800' },
                  col === 0 && !isSelected && { color: '#dc2626' },
                  col === 6 && !isSelected && { color: '#1a56db' },
                ]}>{day}</Text>
              ) : null}
            </TouchableOpacity>
          );
        })}
      </View>
      {allowClear && (
        <TouchableOpacity onPress={() => { onChange(''); onClose(); }} style={styles.clearBtn}>
          <Text style={styles.clearBtnText}>指定なし</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

// 日付フィールドのタップボックス
interface DateBoxProps {
  label: string;
  value: string;
  onPress: () => void;
  placeholder?: string;
}

export function DateBox({ label, value, onPress, placeholder = '指定なし' }: DateBoxProps) {
  return (
    <View style={styles.dateBoxWrapper}>
      <Text style={styles.dateBoxLabel}>{label}</Text>
      <TouchableOpacity style={styles.dateBox} onPress={onPress}>
        <Text style={styles.dateBoxIcon}>📅</Text>
        <Text style={[styles.dateBoxText, !value && { color: '#9ca3af' }]}>{value || placeholder}</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#fff', borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: '#e5e7eb', marginTop: 4,
  },
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
  arrow: { fontSize: 16, color: '#1a56db', paddingHorizontal: 12 },
  title: { fontSize: 15, fontWeight: '800', color: '#111827' },
  weekRow: { flexDirection: 'row', marginBottom: 4 },
  weekLabel: { flex: 1, textAlign: 'center', fontSize: 12, color: '#9ca3af', fontWeight: '600' },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, height: 36, justifyContent: 'center', alignItems: 'center', borderRadius: 18 },
  selectedCell: { backgroundColor: '#1a56db' },
  todayCell: { backgroundColor: '#eff6ff' },
  dayNum: { fontSize: 14, fontWeight: '600', color: '#374151' },
  clearBtn: { alignItems: 'center', marginTop: 8, paddingVertical: 8 },
  clearBtnText: { fontSize: 13, color: '#9ca3af' },
  dateBoxWrapper: { marginBottom: 16 },
  dateBoxLabel: { fontSize: 14, fontWeight: '600', color: '#374151', marginBottom: 8 },
  dateBox: {
    flexDirection: 'row', alignItems: 'center',
    borderWidth: 1, borderColor: '#e5e7eb', borderRadius: 10, padding: 14,
  },
  dateBoxIcon: { fontSize: 16, marginRight: 8 },
  dateBoxText: { fontSize: 15, color: '#111827', fontWeight: '600' },
});
