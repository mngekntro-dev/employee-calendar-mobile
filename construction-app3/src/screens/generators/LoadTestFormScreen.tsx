import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Alert,
  ActivityIndicator,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { supabase } from '../../lib/supabase';
import { fetchCase, GeneratorCase, getCaseStaffFieldByWorkType, getCaseStaffNameByWorkType, syncToCalendar } from '../../lib/generators';
import { fetchCaseTasks, updateTaskStatus as updateCaseTaskStatus } from '../../lib/caseTasks';
import { exportLoadTestExcel } from '../../lib/exportLoadTest';
import { CalendarPicker, DateBox } from '../../components/CalendarPicker';
import LoadingOverlay from '../../components/LoadingOverlay';
import { useAuth } from '../../context/AuthContext';
import {
  LoadTestMeasurement,
  RatedLoadRecord,
  OverallJudgment,
} from '../../types';
import {
  saveDraftLocally,
  loadDraftLocally,
  upsertToSupabase,
  subscribeNetworkStatus,
} from '../../lib/offlineStorage';
import { loadChartLocally, ProcessChart, ProcessChartNew } from '../generators/GeneratorProcessScreen';
import { fetchPhotos } from '../../lib/photoStorage';

// ─── 担当者事業部ロジック ────────────────────────────────────
const DEPARTMENTS = ['電気工事事業部', '発電機事業部', '経理部'] as const;
type Department = typeof DEPARTMENTS[number];

function memberBelongsToDept(
  member: { full_name: string; company_id?: string | null; department?: string | null },
  dept: Department,
  _currentUserCompanyId: string | null
): boolean {
  const d = member.department?.trim();
  if (d === '発電機事業部' || d === '電気工事事業部' || d === '経理部') {
    return d === dept;
  }
  return false;
}

// ─── 定数 ───────────────────────────────────────────────────
const C = '#1D9E75';

const STATUS_LIST = [
  { value: 'draft',     label: '下書き' },
  { value: 'active',   label: '実施中' },
  { value: 'completed', label: '完了' },
  { value: 'cancelled', label: '中止' },
] as const;
type CaseStatus = typeof STATUS_LIST[number]['value'];

// 検査要領チェック項目
const INSPECTION_ITEMS = [
  { key: 'check1', label: '外観・周辺確認', desc: '発電機装置外観に異常はあるか、周辺異物等確認' },
  { key: 'check2', label: '発電機設備内部確認', desc: '発電機内部の設備異常、表示灯の点灯状態の確認' },
  { key: 'check3', label: '手動運転（無負荷）', desc: '発電機始動、表示灯、電流、電圧等数値確認' },
  { key: 'check4', label: '負荷試験運転', desc: '10%、20%、30%の負荷試験実施' },
  { key: 'check5', label: '終了確認', desc: '停止できるか、その他異常警告はないか確認' },
  { key: 'check6', label: '復旧確認', desc: '施工前状態になっているか確認する' },
] as const;
type InspectionKey = typeof INSPECTION_ITEMS[number]['key'];
type InspectionCheckMap = Record<InspectionKey, '✓' | '×' | ''>;

// 負荷試験ステージ（7段階）
const STAGES: { pct: number; label: string }[] = [
  { pct: 0,   label: '0%' },
  { pct: 10,  label: '10%' },
  { pct: 20,  label: '20%' },
  { pct: 30,  label: '30%' },
  { pct: 50,  label: '50%' },
  { pct: 75,  label: '75%' },
  { pct: 100, label: '100%' },
];

// 定格負荷試験の測定タイミング（分）
const RATED_MINUTES = [0, 10, 20, 30, 45, 60];

// 0%基準の自動計算オフセット（ステージindex → 加算分数）
const AUTO_RUN_TIME_OFFSETS: Record<number, number> = { 1: 5, 2: 10, 3: 40 };

const JUDGMENT_OPTIONS: { value: OverallJudgment; label: string; color: string }[] = [
  { value: 'normal',        label: '異常なし', color: '#16a34a' },
  { value: 'caution',       label: '要注意',   color: '#d97706' },
  { value: 'repair_needed', label: '要修繕',   color: '#dc2626' },
];

// ─── 保存ステータス型 ─────────────────────────────────────────
type SaveStatus = 'idle' | 'saving' | 'saved' | 'offline' | 'error';

// ─── 初期値生成 ──────────────────────────────────────────────
function initInspectionChecks(): InspectionCheckMap {
  return { check1: '', check2: '', check3: '', check4: '', check5: '', check6: '' };
}

function initMeasurements(): LoadTestMeasurement[] {
  return STAGES.map(s => ({
    stage: s.pct as LoadTestMeasurement['stage'],
    run_time: '',
    output: '',
    voltage: '',
    current: '',
    frequency: '',
    rpm: '',
    notes: '',
    current_calc: null,
  }));
}

function initRatedRecords(): RatedLoadRecord[] {
  return RATED_MINUTES.map(m => ({
    minute: m,
    voltage: '',
    current: '',
    battery_voltage: '',
    frequency: '',
    water_temp: '',
    oil_temp: '',
    oil_pressure: '',
    rpm: '',
  }));
}

// ─── 電流計算 ─────────────────────────────────────────────────
function calcCurrent(
  ratedKw: number | null,
  pct: number,
  voltageV: number,
  powerFactor: number
): number | null {
  if (ratedKw === null || pct === 0 || voltageV === 0 || powerFactor === 0) return null;
  const effectiveKw = ratedKw * powerFactor;
  return Math.round(((effectiveKw * pct) / 100 * 1000) / (voltageV * Math.sqrt(3)) * 10) / 10;
}

// ─── 保存ステータスバー ───────────────────────────────────────
interface SaveStatusBarProps { status: SaveStatus; savedTime: string | null; }
function SaveStatusBar({ status, savedTime }: SaveStatusBarProps) {
  if (status === 'idle') return null;

  let text = '';
  let barStyle: object = {};
  let textColor = '#fff';

  if (status === 'saving') {
    text = '保存中...';
    barStyle = s.statusBarSaving;
  } else if (status === 'saved') {
    text = savedTime ? `自動保存済み ✓ ${savedTime}` : '自動保存済み ✓';
    barStyle = s.statusBarSaved;
  } else if (status === 'offline') {
    text = 'オフライン保存済み（電波復帰後に同期します）';
    barStyle = s.statusBarOffline;
  } else if (status === 'error') {
    text = '保存エラー（再試行中）';
    barStyle = s.statusBarError;
  }

  return (
    <View style={[s.statusBar, barStyle]}>
      {status === 'saving' && (
        <ActivityIndicator color="#fff" size="small" style={{ marginRight: 6 }} />
      )}
      <Text style={[s.statusBarText, { color: textColor }]}>{text}</Text>
    </View>
  );
}

// ─── アコーディオンセクション ──────────────────────────────────
interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}
function Section({ title, children, defaultOpen = false }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <View style={s.section}>
      <TouchableOpacity style={s.sectionHeader} onPress={() => setOpen(v => !v)} activeOpacity={0.7}>
        <Text style={s.sectionTitle}>{title}</Text>
        <Text style={s.sectionChevron}>{open ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {open && (
        <View style={s.sectionBody}>
          {children}
        </View>
      )}
    </View>
  );
}

// ─── ラベル付き入力 ───────────────────────────────────────────
interface FieldProps {
  label: string;
  value: string;
  onChangeText?: (v: string) => void;
  placeholder?: string;
  keyboardType?: 'default' | 'numeric' | 'decimal-pad';
  editable?: boolean;
  hint?: string;
}
function Field({ label, value, onChangeText, placeholder, keyboardType = 'default', editable = true, hint }: FieldProps) {
  return (
    <View style={s.fieldWrap}>
      <Text style={s.fieldLabel}>{label}</Text>
      <TextInput
        style={[s.fieldInput, !editable && s.fieldInputReadonly]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#9ca3af"
        keyboardType={keyboardType}
        editable={editable}
      />
      {hint ? <Text style={s.fieldHint}>{hint}</Text> : null}
    </View>
  );
}

// ─── メイン画面 ───────────────────────────────────────────────
interface Props { route: any; navigation: any; }

export default function LoadTestFormScreen({ route, navigation }: Props) {
  const { caseId } = route.params as { caseId: string };
  const { profile } = useAuth();
  const [loading, setLoading]   = useState(true);
  const [caseData, setCaseData] = useState<GeneratorCase | null>(null);
  const recordIdRef             = useRef<string | null>(null);

  // 保存ステータス
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('idle');
  const [savedTime, setSavedTime]   = useState<string | null>(null);
  const [isOnline, setIsOnline]     = useState(true);

  // ステータス
  const [caseStatus, setCaseStatus] = useState<CaseStatus>('draft');

  // フォーム状態
  const [licenseNumber, setLicenseNumber] = useState('');
  const [workDate, setWorkDate]           = useState('');
  const [showWorkDateCal, setShowWorkDateCal] = useState(false);

  // 検査要領チェック
  const [inspectionChecks, setInspectionChecks] = useState<InspectionCheckMap>(initInspectionChecks());

  // 試験機情報
  const [machineCapacityKw, setMachineCapacityKw]           = useState('');
  const [machineVoltageV, setMachineVoltageV]                 = useState('');
  const [machinePowerFactor, setMachinePowerFactor]           = useState<'80' | '100' | ''>('');
  const [machineNoiseDb, setMachineNoiseDb]                   = useState('');
  const [machineExhaustTemp, setMachineExhaustTemp]           = useState('');
  const [machineCapacitySetting, setMachineCapacitySetting]   = useState('');

  // 測定値
  const [measurements, setMeasurements]   = useState<LoadTestMeasurement[]>(initMeasurements());
  const [ratedRecords, setRatedRecords]   = useState<RatedLoadRecord[]>(initRatedRecords());
  const [judgment, setJudgment]           = useState<OverallJudgment | null>(null);
  const [resultComment, setResultComment] = useState('負荷運転に異常ありませんでした。');

  // 担当者選択
  const [members, setMembers] = useState<{ id: string; full_name: string; company_id?: string | null; department?: string | null }[]>([]);
  const [selectedStaffNames, setSelectedStaffNames] = useState<string[]>([]);
  const [expandedDept, setExpandedDept] = useState<Department | null>('電気工事事業部');

  // Excel出力中フラグ
  const [exporting, setExporting] = useState(false);

  // 写真枚数（写真台帳から戻った時に更新）
  const [photoCount, setPhotoCount] = useState<number>(0);

  // ─── Excel出力ハンドラ ───
  const handleExportExcel = useCallback(async () => {
    if (!caseData) return;
    setExporting(true);
    try {
      // 工程表データを取得（Supabase → ローカルフォールバック）
      let processChart: ProcessChartNew | null = null;
      if (caseData.process_data) {
        const raw = caseData.process_data as ProcessChart;
        if ('bars' in raw) {
          processChart = raw as ProcessChartNew;
        } else {
          processChart = { bars: raw as Record<string, number[]> };
        }
      }
      if (!processChart) {
        processChart = await loadChartLocally(caseId);
      }
      await exportLoadTestExcel({
        caseData,
        licenseNumber,
        workDate,
        selectedStaffNames,
        inspectionChecks,
        machineCapacityKw,
        machineVoltageV,
        machinePowerFactor,
        machineNoiseDb,
        machineExhaustTemp,
        machineCapacitySetting,
        measurements,
        ratedRecords,
        judgment,
        resultComment,
        processChart,
      });
    } catch (e: any) {
      Alert.alert('Excel出力エラー', e.message ?? '出力に失敗しました');
    } finally {
      setExporting(false);
    }
  }, [
    caseData, licenseNumber, workDate, selectedStaffNames,
    inspectionChecks, machineCapacityKw, machineVoltageV, machinePowerFactor,
    machineNoiseDb, machineExhaustTemp, machineCapacitySetting,
    measurements, ratedRecords, judgment, resultComment,
    caseId,
  ]);

  // デバウンス用タイマー
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // 初回ロード完了フラグ（ロード中はデバウンス起動しない）
  const isInitializedRef = useRef(false);
  // オフラインキューフラグ
  const pendingSyncRef = useRef(false);
  // 最新フォーム状態の ref（ネットワーク復帰時の同期に使用）
  const latestStateRef = useRef<{
    caseData: GeneratorCase | null;
    licenseNumber: string;
    workDate: string;
    selectedStaffNames: string[];
    inspectionChecks: InspectionCheckMap;
    machineCapacityKw: string;
    machineVoltageV: string;
    machinePowerFactor: '80' | '100' | '';
    machineNoiseDb: string;
    machineExhaustTemp: string;
    machineCapacitySetting: string;
    measurements: LoadTestMeasurement[];
    ratedRecords: RatedLoadRecord[];
    judgment: OverallJudgment | null;
    resultComment: string;
    caseStatus: CaseStatus;
  } | null>(null);

  // ─── 初回ロード ───
  useEffect(() => {
    navigation.setOptions({ title: '負荷試験入力' });
    (async () => {
      try {
        const c = await fetchCase(caseId);
        setCaseData(c);
        if (c?.status) setCaseStatus(c.status as CaseStatus);

        // 負荷試験タスクが'none'の場合、フォームを開いた時点でdraftに自動更新
        try {
          const tasks = await fetchCaseTasks(caseId);
          const loadTestTask = tasks.find(t => t.task_type === '負荷試験');
          if (loadTestTask && loadTestTask.status === 'none') {
            await updateCaseTaskStatus(caseId, '負荷試験', 'draft');
          }
        } catch { /* タスクステータス更新は任意 */ }
        const initialStaffName = c ? getCaseStaffNameByWorkType(c, '負荷試験') : null;
        if (initialStaffName) {
          setSelectedStaffNames(
            initialStaffName.split(',').map((s: string) => s.trim()).filter(Boolean)
          );
        }

        const { data: existing } = await supabase
          .from('load_test_records')
          .select('*')
          .eq('case_id', caseId)
          .maybeSingle();

        if (existing) {
          recordIdRef.current = existing.id;
          setLicenseNumber(existing.license_number ?? '');
          setWorkDate(existing.work_date ?? '');
          if (existing.extra_data?.inspection_checks) {
            setInspectionChecks(existing.extra_data.inspection_checks);
          }
          if (existing.extra_data?.machine) {
            const m = existing.extra_data.machine;
            setMachineCapacityKw(m.capacity_kw ?? '');
            setMachineVoltageV(m.voltage_v ?? '');
            const pf = m.power_factor ?? '';
            setMachinePowerFactor(pf === '80' || pf === '100' ? pf : '');
            setMachineNoiseDb(m.noise_db ?? '');
            setMachineExhaustTemp(m.exhaust_temp ?? '');
            setMachineCapacitySetting(m.capacity_setting ?? '');
          } else {
            setMachineCapacityKw(c?.gen_rated_output_kw != null ? String(c.gen_rated_output_kw) : '');
            setMachineVoltageV(c?.gen_rated_voltage_v != null ? String(c.gen_rated_voltage_v) : '');
            if (c?.output_unit === 'kva') {
              setMachinePowerFactor('80');
            } else {
              setMachinePowerFactor('100');
            }
          }
          if (Array.isArray(existing.measurements) && existing.measurements.length > 0)
            setMeasurements(existing.measurements);
          if (Array.isArray(existing.rated_load_records) && existing.rated_load_records.length > 0)
            setRatedRecords(existing.rated_load_records);
          setJudgment(existing.overall_judgment ?? null);
          setResultComment(existing.result_comment ?? '負荷運転に異常ありませんでした。');
        } else {
          // ローカルドラフトの復元を試みる
          const draft = await loadDraftLocally(caseId);
          if (draft) {
            if (draft.license_number != null) setLicenseNumber(draft.license_number);
            if (draft.work_date != null) setWorkDate(draft.work_date);
            if (draft.inspection_checks) setInspectionChecks(draft.inspection_checks);
            if (draft.machine) {
              const m = draft.machine;
              setMachineCapacityKw(m.capacity_kw ?? '');
              setMachineVoltageV(m.voltage_v ?? '');
              const pf = m.power_factor ?? '';
              setMachinePowerFactor(pf === '80' || pf === '100' ? pf : '');
              setMachineNoiseDb(m.noise_db ?? '');
              setMachineExhaustTemp(m.exhaust_temp ?? '');
              setMachineCapacitySetting(m.capacity_setting ?? '');
            }
            if (Array.isArray(draft.measurements) && draft.measurements.length > 0)
              setMeasurements(draft.measurements);
            if (Array.isArray(draft.rated_load_records) && draft.rated_load_records.length > 0)
              setRatedRecords(draft.rated_load_records);
            if (draft.overall_judgment) setJudgment(draft.overall_judgment);
            if (draft.result_comment) setResultComment(draft.result_comment);
            if (draft.staff_name) {
              setSelectedStaffNames(
                (draft.staff_name as string).split(',').map((s: string) => s.trim()).filter(Boolean)
              );
            }
            if (draft.case_status) setCaseStatus(draft.case_status as CaseStatus);
          } else {
            // 新規: caseDataから初期値
            setMachineCapacityKw(c?.gen_rated_output_kw != null ? String(c.gen_rated_output_kw) : '');
            setMachineVoltageV(c?.gen_rated_voltage_v != null ? String(c.gen_rated_voltage_v) : '');
            if (c?.output_unit === 'kva') {
              setMachinePowerFactor('80');
            } else {
              setMachinePowerFactor('100');
            }
          }
        }
      } catch (e: any) {
        Alert.alert('エラー', e.message ?? '読み込み失敗');
      } finally {
        setLoading(false);
        // 少し遅延させてからデバウンスを有効化（setState が全て終わった後）
        setTimeout(() => { isInitializedRef.current = true; }, 300);
      }
    })();

    supabase
      .from('profiles')
      .select('id, full_name, company_id, department')
      .order('full_name')
      .then(({ data }) => setMembers(data ?? []));
  }, [caseId, navigation]);

  // ─── 現在時刻を HH:MM 形式で返す ───
  const getCurrentTimeHHMM = useCallback((): string => {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  }, []);

  // ─── HH:MM に分を加算して HH:MM を返す ───
  const addMinutesToHHMM = useCallback((hhMm: string, minutes: number): string => {
    const parts = hhMm.split(':');
    if (parts.length !== 2) return hhMm;
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (isNaN(h) || isNaN(m)) return hhMm;
    const total = h * 60 + m + minutes;
    const newH = Math.floor(total / 60) % 24;
    const newM = total % 60;
    return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
  }, []);

  // ─── 0%の時刻を基準に後続ステージの時刻を自動計算 ───
  const applyAutoRunTimes = useCallback(
    (baseTime: string, prev: LoadTestMeasurement[]): LoadTestMeasurement[] => {
      const next = [...prev];
      const ratedKw = caseData?.gen_rated_output_kw ?? null;
      const voltageV = parseFloat(machineVoltageV) || (caseData?.gen_rated_voltage_v ?? 0);
      const powerFactor = machinePowerFactor === '80' ? 0.8 : machinePowerFactor === '100' ? 1.0 : 0.8;
      [1, 2, 3].forEach(idx => {
        const offset = AUTO_RUN_TIME_OFFSETS[idx];
        const newTime = addMinutesToHHMM(baseTime, offset);
        const pct = STAGES[idx].pct;
        next[idx] = {
          ...next[idx],
          run_time: newTime,
          current_calc: calcCurrent(ratedKw, pct, voltageV, powerFactor),
        } as LoadTestMeasurement;
      });
      return next;
    },
    [caseData, machineVoltageV, machinePowerFactor, addMinutesToHHMM]
  );

  // ─── 運転時間フィールドのフォーカス時: 空なら現在時刻を自動入力 ───
  const handleRunTimeFocus = useCallback(
    (idx: number) => {
      setMeasurements(prev => {
        const row = prev[idx];
        if (row.run_time !== '') return prev;
        const next = [...prev];
        const newTime = getCurrentTimeHHMM();
        const pct = STAGES[idx].pct;
        const ratedKw = caseData?.gen_rated_output_kw ?? null;
        const voltageV = parseFloat(machineVoltageV) || (caseData?.gen_rated_voltage_v ?? 0);
        const powerFactor = machinePowerFactor === '80' ? 0.8 : machinePowerFactor === '100' ? 1.0 : 0.8;
        const updated = { ...next[idx], run_time: newTime };
        updated.current_calc = calcCurrent(ratedKw, pct, voltageV, powerFactor);
        next[idx] = updated as LoadTestMeasurement;
        if (idx === 0) {
          return applyAutoRunTimes(newTime, next);
        }
        return next;
      });
    },
    [caseData, machineVoltageV, machinePowerFactor, getCurrentTimeHHMM, applyAutoRunTimes]
  );

  // ─── 測定値の更新 ───
  const updateMeasurement = useCallback(
    (idx: number, field: keyof LoadTestMeasurement, value: string) => {
      setMeasurements(prev => {
        const next = [...prev];
        const row  = { ...next[idx], [field]: value };
        const pct  = STAGES[idx].pct;
        const ratedKw = caseData?.gen_rated_output_kw ?? null;
        const voltageV = parseFloat(machineVoltageV) || (caseData?.gen_rated_voltage_v ?? 0);
        const powerFactor = machinePowerFactor === '80' ? 0.8 : machinePowerFactor === '100' ? 1.0 : 0.8;
        row.current_calc = calcCurrent(ratedKw, pct, voltageV, powerFactor);
        next[idx] = row as LoadTestMeasurement;
        if (idx === 0 && field === 'run_time') {
          return applyAutoRunTimes(value, next);
        }
        return next;
      });
    },
    [caseData, machineVoltageV, machinePowerFactor, applyAutoRunTimes]
  );

  // ─── 定格負荷試験の更新 ───
  const updateRated = useCallback(
    (idx: number, field: keyof RatedLoadRecord, value: string) => {
      setRatedRecords(prev => {
        const next = [...prev];
        next[idx] = { ...next[idx], [field]: value } as RatedLoadRecord;
        return next;
      });
    },
    []
  );

  // ─── フォームデータをオブジェクトにまとめる ───
  // （最新の state を受け取る形にして deps を回避）
  const buildPayload = useCallback((
    cd: GeneratorCase,
    opts: {
      licenseNumber: string;
      workDate: string;
      selectedStaffNames: string[];
      inspectionChecks: InspectionCheckMap;
      machineCapacityKw: string;
      machineVoltageV: string;
      machinePowerFactor: '80' | '100' | '';
      machineNoiseDb: string;
      machineExhaustTemp: string;
      machineCapacitySetting: string;
      measurements: LoadTestMeasurement[];
      ratedRecords: RatedLoadRecord[];
      judgment: OverallJudgment | null;
      resultComment: string;
      caseStatus: CaseStatus;
    }
  ) => {
    const staffName = opts.selectedStaffNames.length > 0 ? opts.selectedStaffNames.join(', ') : null;
    return {
      case_id:             caseId,
      name:                cd.name,
      address:             cd.address ?? null,
      work_date:           opts.workDate || null,
      staff_name:          staffName,
      contractor:          cd.contractor ?? null,
      license_number:      opts.licenseNumber || null,
      gen_model:           cd.gen_model ?? null,
      gen_rated_output_kw: cd.gen_rated_output_kw ?? null,
      gen_rated_voltage_v: cd.gen_rated_voltage_v ?? null,
      gen_rated_current_a: cd.gen_rated_current_a ?? null,
      gen_manufacturer:    cd.gen_manufacturer ?? null,
      gen_serial_number:   cd.gen_serial_number ?? null,
      gen_battery_model:   cd.gen_battery_model ?? null,
      gen_battery_count:   cd.gen_battery_count ?? null,
      measurements:        opts.measurements,
      rated_load_records:  opts.ratedRecords,
      overall_judgment:    opts.judgment,
      result_comment:      opts.resultComment || null,
      extra_data: {
        inspection_checks: opts.inspectionChecks,
        machine: {
          capacity_kw:      opts.machineCapacityKw,
          voltage_v:        opts.machineVoltageV,
          power_factor:     opts.machinePowerFactor,
          noise_db:         opts.machineNoiseDb,
          exhaust_temp:     opts.machineExhaustTemp,
          capacity_setting: opts.machineCapacitySetting,
        },
      },
    };
  }, [caseId]);

  // ─── サーバー保存実装（最新 state を引数で受け取る）───
  const doServerSave = useCallback(async (
    cd: GeneratorCase,
    currentState: Parameters<typeof buildPayload>[1] & { caseStatus: CaseStatus }
  ) => {
    const payload = buildPayload(cd, currentState);
    setSaveStatus('saving');
    try {
      console.log('[LoadTestFormScreen] doServerSave start', {
        caseId,
        recordId: recordIdRef.current,
        workDate: currentState.workDate || null,
        selectedStaffNames: currentState.selectedStaffNames,
        caseStatus: currentState.caseStatus,
      });
      await upsertToSupabase({
        caseId,
        recordId: recordIdRef.current,
        caseName: cd.name,
        payload,
        onRecordCreated: (id) => { recordIdRef.current = id; },
      });
      // cases テーブルも更新
      const staffName = currentState.selectedStaffNames.length > 0
        ? currentState.selectedStaffNames.join(', ')
        : null;
      const staffField = getCaseStaffFieldByWorkType('負荷試験');
      const caseUpdatePayload = {
        status: currentState.caseStatus,
        [staffField]: staffName,
        work_date: currentState.workDate || null,
      };
      const { error: caseUpdateError } = await supabase
        .from('cases')
        .update(caseUpdatePayload)
        .eq('id', caseId);
      if (caseUpdateError) {
        console.error('[LoadTestFormScreen] cases update failed', {
          caseId,
          caseUpdatePayload,
          message: caseUpdateError.message,
        });
        throw caseUpdateError;
      }
      console.log('[LoadTestFormScreen] cases update succeeded', {
        caseId,
        caseUpdatePayload,
      });
      // カレンダー同期
      await syncToCalendar({
        ...cd,
        status: currentState.caseStatus,
        work_date: currentState.workDate || null,
        staff_name: staffName,
      }, '負荷試験');
      console.log('[LoadTestFormScreen] syncToCalendar completed', {
        caseId,
        workDate: currentState.workDate || null,
        staffName,
      });

      const now = new Date();
      const hh  = String(now.getHours()).padStart(2, '0');
      const mm  = String(now.getMinutes()).padStart(2, '0');
      setSavedTime(`${hh}:${mm}`);
      setSaveStatus('saved');
    } catch (error) {
      console.error('[LoadTestFormScreen] doServerSave failed', {
        caseId,
        message: error instanceof Error ? error.message : String(error),
      });
      if (!isOnline) {
        pendingSyncRef.current = true;
        setSaveStatus('offline');
      } else {
        setSaveStatus('error');
        // エラー時は次回デバウンスで再試行させる
        pendingSyncRef.current = true;
      }
    }
  }, [caseId, buildPayload, isOnline]);

  // ─── 写真枚数の取得（フォーカス時に更新） ───
  useFocusEffect(
    useCallback(() => {
      fetchPhotos(caseId)
        .then(photos => setPhotoCount(photos.length))
        .catch(() => {/* ignore */});
    }, [caseId])
  );

  // ─── 警告メッセージ生成 ───
  const buildWarningMessages = useCallback((): string[] => {
    const msgs: string[] = [];
    const RECOMMENDED_PHOTOS = 20;
    if (photoCount === 0) {
      msgs.push('写真が撮影されていません');
    } else if (photoCount < RECOMMENDED_PHOTOS) {
      msgs.push(`写真が${photoCount}枚しか撮影されていません（推奨: ${RECOMMENDED_PHOTOS}枚）`);
    }
    const uncheckedCount = Object.values(inspectionChecks).filter(v => v === '').length;
    if (uncheckedCount > 0) {
      msgs.push(`検査要領に${uncheckedCount}件の未チェック項目があります`);
    }
    return msgs;
  }, [photoCount, inspectionChecks]);

  // ─── 保存実行ロジック（警告確認後に呼ぶ） ───
  const executeSave = useCallback(async () => {
    if (!caseData || !latestStateRef.current) return;
    await doServerSave(caseData, latestStateRef.current);
  }, [caseData, doServerSave]);

  // ─── 保存ボタンハンドラ ───
  const handleSave = useCallback(async () => {
    const warnings = buildWarningMessages();
    console.log('[LoadTestFormScreen] handleSave triggered', {
      caseId,
      warningsCount: warnings.length,
      workDate,
      selectedStaffNames,
      saveStatus,
    });
    if (warnings.length === 0) {
      await executeSave();
      navigation.goBack();
      return;
    }
    const message = warnings.join('\n') + '\n\nこのまま保存しますか？';
    if (Platform.OS === 'web') {
      if (window.confirm(message)) {
        await executeSave();
        navigation.goBack();
      }
    } else {
      Alert.alert('保存前の確認', message, [
        { text: '戻る', style: 'cancel' },
        { text: '保存する', onPress: async () => { await executeSave(); navigation.goBack(); } },
      ]);
    }
  }, [buildWarningMessages, executeSave, navigation]);

  // ─── ネットワーク状態監視 ───
  useEffect(() => {
    const cleanup = subscribeNetworkStatus((online) => {
      setIsOnline(online);
      // オンライン復帰 + 未同期データあり → 最新 state を使って同期実行
      if (online && pendingSyncRef.current && isInitializedRef.current && latestStateRef.current) {
        pendingSyncRef.current = false;
        const snap = latestStateRef.current;
        if (snap.caseData) {
          doServerSave(snap.caseData, snap);
        }
      }
    });
    return cleanup;
  }, [doServerSave]);

  // ─── デバウンス自動保存のトリガー ───
  // フォームのあらゆる変化を監視し、初期化後のみ実行
  useEffect(() => {
    if (!isInitializedRef.current || !caseData) return;

    const currentState = {
      caseData,
      licenseNumber,
      workDate,
      selectedStaffNames,
      inspectionChecks,
      machineCapacityKw,
      machineVoltageV,
      machinePowerFactor,
      machineNoiseDb,
      machineExhaustTemp,
      machineCapacitySetting,
      measurements,
      ratedRecords,
      judgment,
      resultComment,
      caseStatus,
    };

    // 常に最新状態を ref に保存（ネットワーク復帰時の同期用）
    latestStateRef.current = currentState;

    // ローカルに即時保存
    const localData = {
      license_number: licenseNumber,
      work_date: workDate,
      inspection_checks: inspectionChecks,
      machine: {
        capacity_kw: machineCapacityKw,
        voltage_v: machineVoltageV,
        power_factor: machinePowerFactor,
        noise_db: machineNoiseDb,
        exhaust_temp: machineExhaustTemp,
        capacity_setting: machineCapacitySetting,
      },
      measurements,
      rated_load_records: ratedRecords,
      overall_judgment: judgment,
      result_comment: resultComment,
      staff_name: selectedStaffNames.join(', '),
      case_status: caseStatus,
    };
    saveDraftLocally(caseId, localData).catch(() => {/* ignore */});

    // デバウンス: 3秒後にサーバー保存
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      if (!isOnline) {
        pendingSyncRef.current = true;
        setSaveStatus('offline');
        return;
      }
      doServerSave(caseData, currentState);
    }, 3000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    licenseNumber, workDate, inspectionChecks,
    machineCapacityKw, machineVoltageV, machinePowerFactor,
    machineNoiseDb, machineExhaustTemp, machineCapacitySetting,
    measurements, ratedRecords, judgment, resultComment,
    selectedStaffNames, caseStatus,
    // 以下は変化しないが依存関係の完全性のために含める
    caseId, caseData, doServerSave, isOnline,
  ]);

  // ─── ローディング ───
  if (loading) return <LoadingOverlay />;
  if (!caseData) {
    return (
      <View style={s.center}>
        <Text>台帳が見つかりません</Text>
      </View>
    );
  }

  const ratedKw = caseData.gen_rated_output_kw;
  const ratedOutputUnitLabel = caseData.output_unit === 'kva' ? 'kVA' : 'kW';
  const calcVoltageV    = parseFloat(machineVoltageV) || (caseData.gen_rated_voltage_v ?? 0);
  const calcPowerFactor = machinePowerFactor === '80' ? 0.8 : machinePowerFactor === '100' ? 1.0 : 0.8;

  // ─── レンダリング ───
  return (
    <ScrollView style={s.container} contentContainerStyle={s.content} keyboardShouldPersistTaps="handled">

      {/* 保存ステータスバー */}
      <SaveStatusBar status={saveStatus} savedTime={savedTime} />

      {/* ヘッダーバナー */}
      <View style={s.banner}>
        <Text style={s.bannerIcon}>⚡</Text>
        <View style={{ flex: 1 }}>
          <Text style={s.bannerTitle}>{caseData.name}</Text>
          <Text style={s.bannerSub}>負荷試験入力フォーム</Text>
        </View>
        <TouchableOpacity
          style={[s.excelBtnSmall, exporting && s.excelBtnDisabled]}
          onPress={handleExportExcel}
          disabled={exporting}
          activeOpacity={0.8}
        >
          {exporting
            ? <ActivityIndicator color={C} size="small" />
            : <Text style={s.excelBtnSmallIcon}>📊</Text>
          }
          <Text style={s.excelBtnSmallText}>{exporting ? '出力中' : 'Excel'}</Text>
        </TouchableOpacity>
      </View>

      {/* ─── 基本情報 ─── */}
      <Section title="1. 基本情報" defaultOpen>
        <Field label="件名"   value={caseData.name ?? ''}       editable={false} />
        <Field label="住所"   value={caseData.address ?? ''}    editable={false} />

        <View style={s.workDateRow}>
          <View style={{ flex: 1 }}>
            <DateBox
              label="施工実施日"
              value={workDate}
              onPress={() => setShowWorkDateCal(v => !v)}
              placeholder="指定なし"
            />
          </View>
          <TouchableOpacity
            style={s.processBtn}
            onPress={() => navigation.navigate('GeneratorProcess', { caseId })}
            activeOpacity={0.8}
          >
            <Text style={s.processBtnIcon}>📋</Text>
            <Text style={s.processBtnText}>工程表</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={s.processBtn}
            onPress={() => navigation.navigate('PhotoLedger', { caseId, caseName: caseData?.name ?? '' })}
            activeOpacity={0.8}
          >
            <Text style={s.processBtnIcon}>📷</Text>
            <Text style={s.processBtnText}>写真台帳</Text>
          </TouchableOpacity>
        </View>
        {showWorkDateCal && (
          <CalendarPicker
            value={workDate}
            onChange={d => { setWorkDate(d); setShowWorkDateCal(false); }}
            onClose={() => setShowWorkDateCal(false)}
            allowClear
          />
        )}
        <Field label="請負者"   value={caseData.contractor ?? ''} editable={false} />
        <Field
          label={`定格出力 (${ratedOutputUnitLabel})`}
          value={ratedKw != null ? String(ratedKw) : ''}
          editable={false}
        />
        <Field
          label="資格者番号"
          value={licenseNumber}
          onChangeText={setLicenseNumber}
          placeholder="例：第12345号"
        />
      </Section>

      {/* ─── 担当者選択 ─── */}
      <View style={s.section}>
        <View style={s.sectionHeader}>
          <Text style={s.sectionTitle}>担当者 <Text style={{ fontSize: 12, fontWeight: '400', color: '#9ca3af' }}>（複数選択可）</Text></Text>
        </View>
        <View style={s.sectionBody}>
          {DEPARTMENTS.map(dept => {
            const deptMembers = members.filter(m => memberBelongsToDept(m, dept, profile?.company_id ?? null));
            const isOpen = expandedDept === dept;
            const selectedCount = deptMembers.filter(m => selectedStaffNames.includes(m.full_name)).length;
            return (
              <View key={dept} style={s.deptAccordion}>
                <TouchableOpacity
                  style={[s.deptHeader, isOpen && s.deptHeaderOpen]}
                  onPress={() => setExpandedDept(isOpen ? null : dept)}
                  activeOpacity={0.8}
                >
                  <View style={s.deptHeaderLeft}>
                    <Text style={[s.deptHeaderText, isOpen && s.deptHeaderTextOpen]}>{dept}</Text>
                    {selectedCount > 0 && (
                      <View style={s.deptBadge}>
                        <Text style={s.deptBadgeText}>{selectedCount}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[s.deptChevron, isOpen && s.deptChevronOpen]}>›</Text>
                </TouchableOpacity>
                {isOpen && (
                  <View style={s.deptMembersWrap}>
                    {deptMembers.length === 0 ? (
                      <Text style={s.deptEmptyText}>社員が登録されていません</Text>
                    ) : (
                      <View style={s.staffChipGrid}>
                        {deptMembers.map(m => {
                          const isSelected = selectedStaffNames.includes(m.full_name);
                          return (
                            <TouchableOpacity
                              key={m.id}
                              style={[s.staffChip, isSelected && s.staffChipActive]}
                              onPress={() => setSelectedStaffNames(prev =>
                                isSelected
                                  ? prev.filter(n => n !== m.full_name)
                                  : [...prev, m.full_name]
                              )}
                            >
                              <Text style={[s.staffChipText, isSelected && s.staffChipTextActive]}>
                                {isSelected ? '✓ ' : ''}{m.full_name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          })}
          {selectedStaffNames.length > 0 && (
            <TouchableOpacity onPress={() => setSelectedStaffNames([])} style={s.clearStaffBtn}>
              <Text style={s.clearStaffBtnText}>選択をクリア</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ─── 発電機情報 ─── */}
      <Section title="2. 発電機情報">
        <Field label="装置型式"   value={caseData.gen_model ?? ''}             editable={false} />
        <Field
          label="定格出力"
          value={ratedKw != null ? `${ratedKw} ${ratedOutputUnitLabel}` : ''}
          editable={false}
        />
        <Field label="定格電圧"   value={caseData.gen_rated_voltage_v != null ? `${caseData.gen_rated_voltage_v} V` : ''} editable={false} />
        <Field label="定格電流"   value={caseData.gen_rated_current_a != null ? `${caseData.gen_rated_current_a} A` : ''} editable={false} />
        <Field label="製造者"     value={caseData.gen_manufacturer ?? ''}      editable={false} />
        <Field label="製造番号"   value={caseData.gen_serial_number ?? ''}     editable={false} />
        <Field label="蓄電池型式" value={caseData.gen_battery_model ?? ''}     editable={false} />
        <Field label="蓄電池個数" value={caseData.gen_battery_count != null ? `${caseData.gen_battery_count} 個` : ''} editable={false} />
      </Section>

      {/* ─── 検査要領 ─── */}
      <Section title="3. 検査要領" defaultOpen>
        <Text style={s.checkGuide}>各項目を確認し ✓ / × を選択してください</Text>
        {INSPECTION_ITEMS.map(item => {
          const key = item.key as InspectionKey;
          const val = inspectionChecks[key];
          return (
            <View key={key} style={s.checkRow}>
              <View style={s.checkLabelWrap}>
                <Text style={s.checkLabel}>{item.label}</Text>
                <Text style={s.checkDesc}>{item.desc}</Text>
              </View>
              <View style={s.checkBtnRow}>
                <TouchableOpacity
                  style={[s.checkBtn, val === '✓' && s.checkBtnOk]}
                  onPress={() => setInspectionChecks(prev => ({ ...prev, [key]: val === '✓' ? '' : '✓' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[s.checkBtnText, val === '✓' && s.checkBtnTextOk]}>✓</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.checkBtn, val === '×' && s.checkBtnNg]}
                  onPress={() => setInspectionChecks(prev => ({ ...prev, [key]: val === '×' ? '' : '×' }))}
                  activeOpacity={0.7}
                >
                  <Text style={[s.checkBtnText, val === '×' && s.checkBtnTextNg]}>×</Text>
                </TouchableOpacity>
              </View>
            </View>
          );
        })}
      </Section>

      {/* ─── 試験機情報 ─── */}
      <Section title="4. 試験機情報">
        <Text style={s.machineTypeLabel}>負荷試験を行った疑似負荷試験機: 可搬式乾式負荷試験装置</Text>
        <View style={s.machineGrid}>
          <View style={s.machineCell}>
            <Field label="容量(kW)"     value={machineCapacityKw}     onChangeText={setMachineCapacityKw}     keyboardType="decimal-pad" placeholder="例: 100" />
          </View>
          <View style={s.machineCell}>
            <Field label="電圧(V)"      value={machineVoltageV}       onChangeText={setMachineVoltageV}       keyboardType="decimal-pad" placeholder="例: 200" />
          </View>
          <View style={s.machineCell}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>力率</Text>
              <View style={s.powerFactorRow}>
                {(['80', '100'] as const).map(pf => (
                  <TouchableOpacity
                    key={pf}
                    style={[s.powerFactorBtn, machinePowerFactor === pf && s.powerFactorBtnActive]}
                    onPress={() => setMachinePowerFactor(prev => prev === pf ? '' : pf)}
                    activeOpacity={0.7}
                  >
                    <Text style={[s.powerFactorBtnText, machinePowerFactor === pf && s.powerFactorBtnTextActive]}>
                      {pf}%
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
          <View style={s.machineCell}>
            <Field label="予定騒音(dB)" value={machineNoiseDb}       onChangeText={setMachineNoiseDb}       keyboardType="decimal-pad" placeholder="例: 65" />
          </View>
          <View style={s.machineCell}>
            <Field label="排気温度(℃)" value={machineExhaustTemp}   onChangeText={setMachineExhaustTemp}   keyboardType="decimal-pad" placeholder="例: 150" />
          </View>
          <View style={s.machineCell}>
            <Field label="容量設定"     value={machineCapacitySetting} onChangeText={setMachineCapacitySetting} placeholder="ステップ式" />
          </View>
        </View>
      </Section>

      {/* ─── 負荷試験測定値（カード形式） ─── */}
      <Section title="5. 負荷試験測定値">
        {ratedKw && (
          <Text style={s.calcHint}>
            ※ 電流計算値 = ((定格出力 × 力率) × 負荷率/100 × 1000) ÷ (電圧 × √3)
          </Text>
        )}
        {STAGES.map((stage, idx) => {
          const row = measurements[idx];
          const autoCalc =
            ratedKw != null && stage.pct > 0
              ? calcCurrent(ratedKw, stage.pct, calcVoltageV, calcPowerFactor)
              : null;
          return (
            <View key={stage.pct} style={s.measureCard}>
              <View style={s.measureCardHeader}>
                <Text style={s.measureCardTitle}>負荷率 {stage.label}</Text>
                {autoCalc != null && (
                  <View style={s.calcBadge}>
                    <Text style={s.calcBadgeText}>計算電流: {autoCalc} A</Text>
                  </View>
                )}
              </View>
              <View style={s.measureRow}>
                <View style={s.measureHalf}>
                  {(() => {
                    const prevOffset = AUTO_RUN_TIME_OFFSETS[idx - 1] ?? 0;
                    const curOffset  = AUTO_RUN_TIME_OFFSETS[idx] ?? 0;
                    const diff = curOffset - prevOffset;
                    return (
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <Text style={s.measureFieldLabel}>運転時間（HH:MM）</Text>
                        {diff > 0 && (
                          <Text style={{ fontSize: 11, color: '#9ca3af', marginLeft: 4, fontWeight: '400' }}>
                            +{diff}分
                          </Text>
                        )}
                      </View>
                    );
                  })()}
                  <TextInput
                    style={s.measureInput}
                    value={row?.run_time ?? ''}
                    onChangeText={v => updateMeasurement(idx, 'run_time', v)}
                    onFocus={() => handleRunTimeFocus(idx)}
                    keyboardType="default"
                    placeholderTextColor="#d1d5db"
                    placeholder="例: 09:30"
                  />
                </View>
                <View style={s.measureHalf}>
                  <Text style={s.measureFieldLabel}>出力(kW)</Text>
                  <TextInput
                    style={s.measureInput}
                    value={row?.output ?? ''}
                    onChangeText={v => updateMeasurement(idx, 'output', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#d1d5db"
                    placeholder="0"
                  />
                </View>
              </View>
              <View style={s.measureRow}>
                <View style={s.measureHalf}>
                  <Text style={s.measureFieldLabel}>電圧(V)</Text>
                  <TextInput
                    style={s.measureInput}
                    value={row?.voltage ?? ''}
                    onChangeText={v => updateMeasurement(idx, 'voltage', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#d1d5db"
                    placeholder="0"
                  />
                </View>
                <View style={s.measureHalf}>
                  <Text style={s.measureFieldLabel}>電流(A)</Text>
                  <TextInput
                    style={s.measureInput}
                    value={row?.current ?? ''}
                    onChangeText={v => updateMeasurement(idx, 'current', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#d1d5db"
                    placeholder="0"
                  />
                </View>
              </View>
              <View style={s.measureRow}>
                <View style={s.measureHalf}>
                  <Text style={s.measureFieldLabel}>周波数(Hz)</Text>
                  <TextInput
                    style={s.measureInput}
                    value={row?.frequency ?? ''}
                    onChangeText={v => updateMeasurement(idx, 'frequency', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#d1d5db"
                    placeholder="0"
                  />
                </View>
                <View style={s.measureHalf}>
                  <Text style={s.measureFieldLabel}>回転数(rpm)</Text>
                  <TextInput
                    style={s.measureInput}
                    value={row?.rpm ?? ''}
                    onChangeText={v => updateMeasurement(idx, 'rpm', v)}
                    keyboardType="decimal-pad"
                    placeholderTextColor="#d1d5db"
                    placeholder="0"
                  />
                </View>
              </View>
              <View style={s.measureFull}>
                <Text style={s.measureFieldLabel}>備考</Text>
                <TextInput
                  style={[s.measureInput, s.measureInputNotes]}
                  value={row?.notes ?? ''}
                  onChangeText={v => updateMeasurement(idx, 'notes', v)}
                  keyboardType="default"
                  placeholderTextColor="#d1d5db"
                  placeholder="特記事項があれば入力"
                />
              </View>
            </View>
          );
        })}
      </Section>

      {/* ─── 定格負荷試験測定値 ─── */}
      <Section title="6. 定格負荷試験測定値（30%負荷・30分記録）">
        <View style={s.ratedInfoRow}>
          <View style={s.ratedInfoBadge}><Text style={s.ratedInfoBadgeText}>負荷率: 30%</Text></View>
          <View style={s.ratedInfoBadge}><Text style={s.ratedInfoBadgeText}>電流値: {ratedKw ? `${calcCurrent(ratedKw, 30, calcVoltageV, calcPowerFactor)} A` : '─'}</Text></View>
          <View style={s.ratedInfoBadge}><Text style={s.ratedInfoBadgeText}>運転時間: 30分</Text></View>
        </View>
        {ratedRecords.map((rec, idx) => (
          <View key={rec.minute} style={s.measureCard}>
            <View style={s.measureCardHeader}>
              <Text style={s.measureCardTitle}>経過 {rec.minute} 分</Text>
            </View>
            <View style={s.measureRow}>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>電圧(V)</Text>
                <TextInput style={s.measureInput} value={rec.voltage} onChangeText={v => updateRated(idx, 'voltage', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>電流(A)</Text>
                <TextInput style={s.measureInput} value={rec.current} onChangeText={v => updateRated(idx, 'current', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
            </View>
            <View style={s.measureRow}>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>蓄電池電圧(V)</Text>
                <TextInput style={s.measureInput} value={rec.battery_voltage} onChangeText={v => updateRated(idx, 'battery_voltage', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>周波数(Hz)</Text>
                <TextInput style={s.measureInput} value={rec.frequency} onChangeText={v => updateRated(idx, 'frequency', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
            </View>
            <View style={s.measureRow}>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>水温(℃)</Text>
                <TextInput style={s.measureInput} value={rec.water_temp} onChangeText={v => updateRated(idx, 'water_temp', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>油温(℃)</Text>
                <TextInput style={s.measureInput} value={rec.oil_temp} onChangeText={v => updateRated(idx, 'oil_temp', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
            </View>
            <View style={s.measureRow}>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>油圧(kPa等)</Text>
                <TextInput style={s.measureInput} value={rec.oil_pressure} onChangeText={v => updateRated(idx, 'oil_pressure', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
              <View style={s.measureHalf}>
                <Text style={s.measureFieldLabel}>回転数(rpm)</Text>
                <TextInput style={s.measureInput} value={rec.rpm} onChangeText={v => updateRated(idx, 'rpm', v)} keyboardType="decimal-pad" placeholderTextColor="#d1d5db" placeholder="0" />
              </View>
            </View>
          </View>
        ))}
      </Section>

      {/* ─── 結果報告 ─── */}
      <Section title="7. 結果報告" defaultOpen>
        <Text style={s.fieldLabel}>総合判定</Text>
        <View style={s.judgmentRow}>
          {JUDGMENT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.value}
              style={[
                s.judgmentBtn,
                judgment === opt.value && { backgroundColor: opt.color, borderColor: opt.color },
              ]}
              onPress={() => setJudgment(opt.value)}
              activeOpacity={0.7}
            >
              <Text style={[s.judgmentBtnText, judgment === opt.value && { color: '#fff' }]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={[s.fieldLabel, { marginTop: 12 }]}>結果報告</Text>
        <TextInput
          style={[s.fieldInput, s.textarea]}
          value={resultComment}
          onChangeText={setResultComment}
          placeholder="負荷運転に異常ありませんでした。"
          placeholderTextColor="#9ca3af"
          multiline
          numberOfLines={4}
          textAlignVertical="top"
        />
      </Section>

      {/* ─── アクションボタン ─── */}
      <View style={s.actionRow}>
        <TouchableOpacity style={s.saveBtn} onPress={handleSave} activeOpacity={0.8} disabled={saveStatus === 'saving'}>
          <Text style={s.saveBtnText}>{saveStatus === 'saving' ? '保存中...' : '保存する'}</Text>
        </TouchableOpacity>
      </View>

    </ScrollView>
  );
}

// ─── テーブル用インライン入力 ────────────────────────────────
interface TableInputProps {
  value: string;
  onChange: (v: string) => void;
  wide?: boolean;
}
function TableInput({ value, onChange, wide }: TableInputProps) {
  return (
    <View style={[s.tdCell, wide ? s.colNote : s.colNum]}>
      <TextInput
        style={s.tableInput}
        value={value}
        onChangeText={onChange}
        keyboardType="decimal-pad"
        placeholderTextColor="#d1d5db"
      />
    </View>
  );
}

// ─── スタイル ─────────────────────────────────────────────────
const COL_STAGE = 70;
const COL_MIN   = 70;
const COL_NUM   = 90;
const COL_NOTE  = 120;

const s = StyleSheet.create({
  container:  { flex: 1, backgroundColor: '#f3f4f6' },
  content:    {
    padding: 16, paddingBottom: 60,
    ...(Platform.OS === 'web' ? { maxWidth: 720, width: '100%', alignSelf: 'center' } as any : {}),
  },
  center:     { flex: 1, alignItems: 'center', justifyContent: 'center' },

  // 保存ステータスバー
  statusBar: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 7,
    borderRadius: 8, marginBottom: 10,
  },
  statusBarSaving: { backgroundColor: '#6b7280' },
  statusBarSaved:  { backgroundColor: '#16a34a' },
  statusBarOffline:{ backgroundColor: '#d97706' },
  statusBarError:  { backgroundColor: '#dc2626' },
  statusBarText:   { fontSize: 12, fontWeight: '600' },

  // Banner
  banner: {
    flexDirection: 'row', alignItems: 'center', backgroundColor: C,
    borderRadius: 14, padding: 16, marginBottom: 16,
  },
  bannerIcon:  { fontSize: 32, marginRight: 12 },
  bannerTitle: { fontSize: 16, fontWeight: '800', color: '#fff' },
  bannerSub:   { fontSize: 12, color: '#d1fae5', marginTop: 2 },

  // Section
  section: {
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 14,
    shadowColor: '#000', shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
    overflow: 'hidden',
  },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 14,
    borderBottomWidth: 1, borderBottomColor: '#e5e7eb',
  },
  sectionTitle:   { fontSize: 14, fontWeight: '800', color: C },
  sectionChevron: { fontSize: 12, color: '#9ca3af' },
  sectionBody:    { padding: 16 },

  // Field
  fieldWrap:  { marginBottom: 10 },
  fieldLabel: { fontSize: 13, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  fieldInput: {
    backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1,
    borderColor: '#e5e7eb', paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 14, color: '#111827',
  },
  fieldInputReadonly: { backgroundColor: '#f3f4f6', color: '#6b7280' },
  fieldHint: { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  textarea:  { height: 100, textAlignVertical: 'top' },

  // 検査要領チェック
  checkGuide: { fontSize: 12, color: '#6b7280', marginBottom: 10 },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#f3f4f6',
  },
  checkLabelWrap: { flex: 1, marginRight: 10 },
  checkLabel: { fontSize: 13, fontWeight: '700', color: '#111827' },
  checkDesc:  { fontSize: 11, color: '#9ca3af', marginTop: 2 },
  checkBtnRow: { flexDirection: 'row', gap: 8 },
  checkBtn: {
    width: 44, height: 44, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db',
    backgroundColor: '#f9fafb',
    alignItems: 'center', justifyContent: 'center',
  },
  checkBtnOk: { borderColor: C, backgroundColor: '#ecfdf5' },
  checkBtnNg: { borderColor: '#dc2626', backgroundColor: '#fef2f2' },
  checkBtnText: { fontSize: 16, fontWeight: '700', color: '#9ca3af' },
  checkBtnTextOk: { color: C },
  checkBtnTextNg: { color: '#dc2626' },

  // 試験機情報
  machineTypeLabel: { fontSize: 13, fontWeight: '600', color: '#374151', marginBottom: 12 },
  machineGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  machineCell: { width: '48%' },

  // 力率ボタン
  powerFactorRow: { flexDirection: 'row', gap: 8 },
  powerFactorBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  powerFactorBtnActive: { borderColor: C, backgroundColor: '#ecfdf5' },
  powerFactorBtnText: { fontSize: 14, fontWeight: '700', color: '#6b7280' },
  powerFactorBtnTextActive: { color: C },

  // Table
  calcHint: { fontSize: 11, color: '#6b7280', marginBottom: 8 },
  tableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  tableRowAlt: { backgroundColor: '#f9fafb' },
  tableHead:   { backgroundColor: '#f0fdf9' },
  thCell: {
    paddingHorizontal: 6, paddingVertical: 8,
    fontSize: 11, fontWeight: '700', color: C, textAlign: 'center',
    borderRightWidth: 1, borderRightColor: '#e5e7eb',
  },
  tdCell: {
    paddingHorizontal: 4, paddingVertical: 4,
    justifyContent: 'center', alignItems: 'center',
    borderRightWidth: 1, borderRightColor: '#e5e7eb',
  },
  colStage: { width: COL_STAGE },
  colMin:   { width: COL_MIN },
  colNum:   { width: COL_NUM },
  colNote:  { width: COL_NOTE },

  stageCell:  { backgroundColor: '#f0fdf9', justifyContent: 'center', alignItems: 'center' },
  stageLabel: { fontSize: 12, fontWeight: '700', color: C, textAlign: 'center' },

  tableInput: {
    width: '100%', backgroundColor: '#fff', borderRadius: 4,
    borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 6, paddingVertical: 6,
    fontSize: 13, color: '#111827', textAlign: 'center',
  },

  calcCell: { backgroundColor: '#f0fdf9' },
  calcText: { fontSize: 12, fontWeight: '600', color: C, textAlign: 'center' },

  // 測定値カード
  measureCard: {
    borderRadius: 10, borderWidth: 1.5, borderColor: '#d1fae5',
    backgroundColor: '#fff', marginBottom: 10, overflow: 'hidden',
  },
  measureCardHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#ecfdf5', paddingHorizontal: 12, paddingVertical: 8,
    borderBottomWidth: 1, borderBottomColor: '#d1fae5',
  },
  measureCardTitle: { fontSize: 14, fontWeight: '800', color: C },
  calcBadge: {
    backgroundColor: '#d1fae5', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
  },
  calcBadgeText: { fontSize: 11, fontWeight: '700', color: C },
  measureRow: {
    flexDirection: 'row', gap: 8, paddingHorizontal: 10, paddingTop: 8,
  },
  measureHalf: { flex: 1 },
  measureFull: { paddingHorizontal: 10, paddingTop: 8, paddingBottom: 10 },
  measureFieldLabel: { fontSize: 11, fontWeight: '600', color: '#6b7280', marginBottom: 4 },
  measureInput: {
    backgroundColor: '#f9fafb', borderRadius: 8, borderWidth: 1, borderColor: '#e5e7eb',
    paddingHorizontal: 10, paddingVertical: 9, fontSize: 14, color: '#111827', textAlign: 'center',
    marginBottom: 8,
  },
  measureInputNotes: { textAlign: 'left', fontSize: 13 },

  // 定格負荷試験ヘッダー情報
  ratedInfoRow: { flexDirection: 'row', gap: 8, marginBottom: 12, flexWrap: 'wrap' },
  ratedInfoBadge: {
    backgroundColor: '#ecfdf5', borderRadius: 8, borderWidth: 1, borderColor: '#6ee7b7',
    paddingHorizontal: 10, paddingVertical: 6,
  },
  ratedInfoBadgeText: { fontSize: 12, fontWeight: '700', color: C },

  // Judgment
  judgmentRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  judgmentBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 8,
    borderWidth: 2, borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  judgmentBtnText: { fontSize: 13, fontWeight: '700', color: '#374151' },

  // Section save button (kept in styles for compatibility, no longer rendered)
  sectionSaveBtn: {
    alignSelf: 'flex-end', marginTop: 12,
    backgroundColor: C, borderRadius: 8,
    paddingHorizontal: 20, paddingVertical: 8,
    minWidth: 72, alignItems: 'center',
    shadowColor: C, shadowOpacity: 0.2, shadowRadius: 4, elevation: 2,
  },
  sectionSaveBtnDisabled: { opacity: 0.6 },
  sectionSaveBtnText: { color: '#fff', fontSize: 13, fontWeight: '700' },

  // Status chips
  statusRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  statusChip: {
    paddingHorizontal: 16, paddingVertical: 10, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  statusChipActive: { borderColor: C, backgroundColor: '#ecfdf5' },
  statusChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  statusChipTextActive: { color: C },

  // 担当者選択
  processBtn: {
    backgroundColor: '#ecfdf5', borderRadius: 10,
    paddingHorizontal: 14, paddingVertical: 10,
    borderWidth: 1.5, borderColor: '#6ee7b7',
    alignItems: 'center', justifyContent: 'center',
    alignSelf: 'flex-end', marginBottom: 16, marginLeft: 10,
    minWidth: 72,
  },
  processBtnIcon: { fontSize: 20, marginBottom: 2 },
  processBtnText: { fontSize: 12, fontWeight: '700', color: C },
  workDateRow: {
    flexDirection: 'row', alignItems: 'flex-end',
  },
  deptAccordion: {
    borderRadius: 10, borderWidth: 1.5, borderColor: '#e5e7eb',
    backgroundColor: '#fff', marginBottom: 8, overflow: 'hidden',
  },
  deptHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 14, paddingVertical: 12, backgroundColor: '#f9fafb',
  },
  deptHeaderOpen: { backgroundColor: '#ecfdf5', borderBottomWidth: 1, borderBottomColor: '#d1fae5' },
  deptHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  deptHeaderText: { fontSize: 14, fontWeight: '700', color: '#374151' },
  deptHeaderTextOpen: { color: C },
  deptBadge: {
    backgroundColor: C, borderRadius: 10, minWidth: 20, height: 20,
    alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6,
  },
  deptBadgeText: { fontSize: 11, fontWeight: '800', color: '#fff' },
  deptChevron: { fontSize: 22, color: '#9ca3af', transform: [{ rotate: '90deg' }] },
  deptChevronOpen: { color: C, transform: [{ rotate: '-90deg' }] },
  deptMembersWrap: { padding: 12 },
  deptEmptyText: { fontSize: 13, color: '#9ca3af', textAlign: 'center', paddingVertical: 8 },
  staffChipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 8 },
  staffChip: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
  },
  staffChipActive: { borderColor: C, backgroundColor: '#ecfdf5' },
  staffChipText: { fontSize: 14, fontWeight: '600', color: '#6b7280' },
  staffChipTextActive: { color: C },
  clearStaffBtn: {
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 6, backgroundColor: '#fee2e2', alignSelf: 'flex-end', marginTop: 4,
  },
  clearStaffBtnText: { fontSize: 12, color: '#dc2626', fontWeight: '600' },

  // Excel出力ボタン（ヘッダー内小ボタン）
  excelBtnSmall: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 6,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.4)',
    marginLeft: 8,
  },
  excelBtnDisabled: { opacity: 0.5 },
  excelBtnSmallIcon: { fontSize: 14, marginRight: 4 },
  excelBtnSmallText: { fontSize: 12, fontWeight: '700', color: '#fff' },

  // アクションボタン（保存・戻る）
  actionRow: {
    flexDirection: 'row', gap: 12, marginTop: 8, marginBottom: 8,
  },
  backActionBtn: {
    flex: 1, paddingVertical: 14, borderRadius: 10,
    borderWidth: 1.5, borderColor: '#d1d5db', backgroundColor: '#f9fafb',
    alignItems: 'center',
  },
  backActionBtnText: { fontSize: 15, fontWeight: '700', color: '#6b7280' },
  saveBtn: {
    flex: 2, paddingVertical: 14, borderRadius: 10,
    backgroundColor: C,
    alignItems: 'center',
    shadowColor: C, shadowOpacity: 0.25, shadowRadius: 6, elevation: 3,
  },
  saveBtnText: { fontSize: 15, fontWeight: '800', color: '#fff' },
});
