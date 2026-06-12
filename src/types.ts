export type ShiftCategory = '白班' | '夜班' | '5吨' | 'EDM' | '休息';

export interface Driver {
  id: string;
  name: string;
  isFiveTonOnly: boolean; // 是否只能排5吨
  fixedRestDays: number[]; // 固定排休的星期天数 (0-6, 如 [0, 6] 表示每个周日和周六休息)
  mandatoryRestDays?: number[]; // 必定排休的星期天数 (0-6, 如 [0] 表示每个周日必须休息，硬性必须排休)
}

export type ScheduleGrid = Record<string, Record<string, ShiftCategory>>; 
// dateKey (YYYY-MM-DD) -> driverId -> ShiftCategory

export type ManualLocks = Record<string, Record<string, ShiftCategory>>;
// dateKey (YYYY-MM-DD) -> driverId -> ShiftCategory (if manually overridden)

export interface RuleViolation {
  id: string;
  type: 'error' | 'warning' | 'info';
  date: string;
  driverId?: string;
  message: string;
}
