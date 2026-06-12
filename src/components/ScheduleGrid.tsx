import React, { useState, useRef, useEffect } from 'react';
import { Driver, ShiftCategory, ScheduleGrid, ManualLocks } from '../types';
import { getDaysInMonth, formatDateKey, WEEKDAYS_CN, getWeekKey } from '../utils/scheduler';
import { Lock, Unlock, Moon, Sun, ShieldAlert, CheckCircle2, ChevronRight, RefreshCw, Calendar, Sparkles } from 'lucide-react';

interface ScheduleGridProps {
  drivers: Driver[];
  year: number;
  month: number;
  grid: ScheduleGrid;
  locks: ManualLocks;
  onCellOverride: (dateKey: string, driverId: string, shift: ShiftCategory | null) => void;
  onClearAllLocks: () => void;
  violationsCount: number;
  onYearChange?: (year: number) => void;
  onMonthChange?: (month: number) => void;
}

export const RosterGrid: React.FC<ScheduleGridProps> = ({
  drivers,
  year,
  month,
  grid,
  locks,
  onCellOverride,
  onClearAllLocks,
  violationsCount,
  onYearChange,
  onMonthChange,
}) => {
  const days = getDaysInMonth(year, month);
  const [activeCell, setActiveCell] = useState<{ dateKey: string; driverId: string } | null>(null);
  const [unlockPastDates, setUnlockPastDates] = useState(false);
  
  // Ref for clicking outside the dropdown to close it
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setActiveCell(null);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const today = React.useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const SHIFT_INFO: Record<ShiftCategory, { name: string; bg: string; text: string; border: string; icon: string }> = {
    '白班': { name: '白班', bg: 'bg-blue-50/80 hover:bg-blue-100/90', text: 'text-blue-600', border: 'border-blue-200/60', icon: '☀️' },
    '夜班': { name: '夜班', bg: 'bg-zinc-900 hover:bg-zinc-800', text: 'text-white font-bold', border: 'border-zinc-900', icon: '🌙' },
    '5吨': { name: '5吨', bg: 'bg-amber-50/80 hover:bg-amber-100/95', text: 'text-amber-750', border: 'border-amber-200/60', icon: '🚚' },
    'EDM': { name: 'EDM', bg: 'bg-emerald-50/80 hover:bg-emerald-100/95', text: 'text-emerald-750', border: 'border-emerald-200/60', icon: '⚡' },
    '休息': { name: '休息', bg: 'bg-zinc-50/60 hover:bg-zinc-100/80', text: 'text-zinc-400', border: 'border-zinc-200 border-dashed', icon: '💤' },
  };

  // Helper to audit a single day's coverage (returns missing shifts and status)
  const getDailyCoverageStatus = (dateKey: string) => {
    const dayGrid = grid[dateKey] || {};
    const shiftsToday = Object.values(dayGrid);
    
    const missing: string[] = [];
    if (!shiftsToday.includes('白班')) missing.push('白班');
    if (!shiftsToday.includes('夜班')) missing.push('夜班');
    if (!shiftsToday.includes('EDM')) missing.push('EDM');
    if (!shiftsToday.includes('5吨')) missing.push('5吨');

    return {
      isValid: missing.length === 0,
      missing,
    };
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col h-full" id="schedule-grid-panel">
      {/* Grid Header Card */}
      <div className="p-4 border-b border-zinc-250 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg bg-zinc-800 flex items-center justify-center text-white">
            <Calendar className="w-5 h-5" />
          </div>
          <div>
            <h2 className="font-semibold text-zinc-900 text-base flex items-center gap-2 flex-wrap">
              <span>排班月历明细表</span>
              <div className="flex items-center gap-1 ml-1">
                {onYearChange ? (
                  <select
                    value={year}
                    onChange={(e) => onYearChange(Number(e.target.value))}
                    className="bg-zinc-900 text-white border-none text-[10px] font-bold px-2.5 py-0.5 rounded-full focus:outline-none focus:ring-1 focus:ring-zinc-600 cursor-pointer text-center shadow-sm select-none"
                  >
                    {[year - 1, year, year + 1].map(y => (
                      <option key={y} value={y} className="bg-white text-zinc-900">{y}年</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] bg-zinc-900 text-white font-bold px-2.5 py-0.5 rounded-full">
                    {year}年
                  </span>
                )}
                {onMonthChange ? (
                  <select
                    value={month}
                    onChange={(e) => onMonthChange(Number(e.target.value))}
                    className="bg-zinc-900 text-white border-none text-[10px] font-bold px-2.5 py-0.5 rounded-full focus:outline-none focus:ring-1 focus:ring-zinc-600 cursor-pointer text-center shadow-sm select-none"
                  >
                    {Array.from({ length: 12 }, (_, i) => i + 1).map(m => (
                      <option key={m} value={m} className="bg-white text-zinc-900">{String(m).padStart(2, '0')}月</option>
                    ))}
                  </select>
                ) : (
                  <span className="text-[10px] bg-zinc-900 text-white font-bold px-2.5 py-0.5 rounded-full">
                    {month}月
                  </span>
                )}
              </div>
            </h2>
            <p className="text-xs text-zinc-500 mt-0.5">
              点击排班单元格可手动改班（过去日期已默认锁定，点击右侧按钮可解锁修改），智能重算后后续排班将自动联动调整。
            </p>
          </div>
        </div>

        {/* Global actions */}
        <div className="flex items-center gap-2 flex-wrap self-end sm:self-auto">
          <button
            onClick={() => setUnlockPastDates(!unlockPastDates)}
            className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg border cursor-pointer transition-all shadow-sm ${
              unlockPastDates
                ? 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100'
                : 'bg-white text-zinc-700 border-zinc-200 hover:bg-zinc-50 hover:text-zinc-955'
            }`}
            title="开启/关闭历史过去日期的手工改班干预功能"
          >
            {unlockPastDates ? <Unlock className="w-3.5 h-3.5 text-amber-600" /> : <Lock className="w-3.5 h-3.5 text-zinc-400" />}
            <span>{unlockPastDates ? '历史已解锁' : '解锁历史修改'}</span>
          </button>

          {Object.keys(locks).length > 0 && (
            <button
              onClick={onClearAllLocks}
              className="flex items-center gap-1.5 text-xs font-semibold bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 px-3 py-1.5 rounded-lg cursor-pointer transition-colors shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              重置并清空手动修改 (已改 {Object.values(locks).reduce((acc: number, curr) => acc + Object.keys(curr).length, 0)} 处)
            </button>
          )}

          <div className="text-xs bg-zinc-100 text-zinc-700 px-3 py-2 rounded-lg font-medium flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />
            <span>智能自动编排</span>
          </div>
        </div>
      </div>

      {/* Grid Container */}
      <div className="overflow-x-auto relative flex-1 custom-scrollbar" style={{ maxHeight: '680px' }}>
        <table className="w-full border-collapse text-left text-xs min-w-[1000px]">
          {/* Table Head */}
          <thead className="bg-zinc-50 text-zinc-500 sticky top-0 z-20 shadow-sm border-b border-zinc-200">
            <tr>
              {/* Date Column */}
              <th className="py-3 px-4 font-bold border-r border-zinc-200 bg-zinc-50 w-28 sticky left-0 z-30">
                日期 / 星期
              </th>
              
              {/* Drivers Columns */}
              {drivers.map(dr => (
                <th key={dr.id} className="py-3 px-3 font-semibold border-r border-zinc-200 text-center select-none">
                  <div className="flex flex-col items-center justify-center">
                    <span className="text-zinc-800 font-bold text-sm">{dr.name}</span>
                    {dr.isFiveTonOnly && (
                      <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded scale-90 translate-y-0.5 font-bold">
                        专职5吨
                      </span>
                    )}
                  </div>
                </th>
              ))}

              {/* Day Validation Status */}
              <th className="py-3 px-4 font-bold text-center last:border-r-0 w-36">
                每天班次覆盖率
              </th>
            </tr>
          </thead>

          {/* Table Body */}
          <tbody className="divide-y divide-zinc-100">
            {days.map((date, index) => {
              const dateKey = formatDateKey(date);
              const dayOfMonth = date.getDate();
              const dayOfWeek = date.getDay(); // 0 is Sunday, 6 is Saturday
              const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
              const { isValid, missing } = getDailyCoverageStatus(dateKey);

              // Clone date and set hours to 0 to compare purely by date
              const compareDate = new Date(date);
              compareDate.setHours(0, 0, 0, 0);
              const isPastDate = compareDate < today && !unlockPastDates;

              return (
                <tr
                  key={dateKey}
                  className={`hover:bg-zinc-50/70 transition-colors ${
                    isWeekend ? 'bg-zinc-50/40' : ''
                  }`}
                >
                  {/* Date Badge */}
                  <td className="py-2.5 px-4 font-bold border-r border-zinc-205 bg-white sticky left-0 z-10 shadow-sm flex-col">
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-800 font-mono text-sm">
                        {String(dayOfMonth).padStart(2, '0')}日
                      </span>
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded font-bold ${
                          isWeekend
                            ? 'bg-rose-50 text-rose-600'
                            : 'bg-zinc-100 text-zinc-650'
                        }`}
                      >
                        {WEEKDAYS_CN[dayOfWeek]}
                      </span>
                    </div>
                  </td>

                  {/* Driver Shift cells */}
                  {drivers.map(dr => {
                    const shift = grid[dateKey]?.[dr.id] || '休息';
                    const isLocked = !!locks[dateKey]?.[dr.id];
                    const cfg = SHIFT_INFO[shift];
                    const isActive = activeCell?.dateKey === dateKey && activeCell?.driverId === dr.id;

                    return (
                      <td
                        key={dr.id}
                        onClick={() => {
                          if (isPastDate) return;
                          setActiveCell({ dateKey, driverId: dr.id });
                        }}
                        className={`p-1.5 border-r border-zinc-200 text-center relative select-none transition-all ${
                          isPastDate
                            ? 'cursor-not-allowed bg-zinc-50/10'
                            : 'cursor-pointer hover:bg-zinc-100/30'
                        } ${
                          isActive ? 'outline-2 outline-zinc-805 z-10 shadow-md bg-zinc-100/40' : ''
                        }`}
                        title={isPastDate ? '历史班次，无法改动' : undefined}
                      >
                        <div
                          className={`w-full py-2 px-1 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1 shadow-sm transition-all ${cfg.bg} ${cfg.text} ${cfg.border} ${
                            isPastDate ? 'opacity-55 saturate-50' : ''
                          }`}
                        >
                          <span className="text-xs flex items-center justify-center">
                            {isPastDate ? <Lock className="w-3 h-3 text-zinc-400" /> : cfg.icon}
                          </span>
                          <span>{cfg.name}</span>
                          {isLocked && !isPastDate && (
                            <span title="点击清除手动锁定" className="absolute top-1 right-1 text-[9px] bg-amber-500 text-white rounded p-0.5 shadow-sm">
                              <Lock className="w-2.5 h-2.5" />
                            </span>
                          )}
                        </div>

                        {/* Dropdown Menu on Click */}
                        {isActive && (
                          <div
                            ref={dropdownRef}
                            className="absolute left-1/2 bottom-full mb-2 -translate-x-1/2 bg-white rounded-xl shadow-xl border border-zinc-200 p-2 z-40 w-44 space-y-1 text-left animate-fade-in"
                          >
                            <div className="px-2 py-1 border-b border-zinc-100 mb-1">
                              <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider">
                                指定排班: {String(dayOfMonth).padStart(2, '0')}日 - {dr.name}
                              </p>
                            </div>

                            {/* Shift list */}
                            {(Object.keys(SHIFT_INFO) as ShiftCategory[]).map(cat => {
                              const itemCfg = SHIFT_INFO[cat];
                              // Disable non-5-ton options for 5-ton-only drivers to protect consistency,
                              // but let them override if they really want, we show warnings later.
                              const isDisabled = dr.isFiveTonOnly && cat !== '5吨' && cat !== '休息';

                              return (
                                <button
                                  key={cat}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onCellOverride(dateKey, dr.id, cat);
                                    setActiveCell(null);
                                  }}
                                  disabled={isDisabled}
                                  className={`w-full flex items-center justify-between px-2 py-1.5 rounded-lg text-left text-xs font-medium cursor-pointer transition-colors ${
                                    shift === cat
                                      ? 'bg-zinc-100 text-zinc-900 font-bold'
                                      : 'hover:bg-zinc-50 text-zinc-600'
                                  } ${isDisabled ? 'opacity-30 cursor-not-allowed' : ''}`}
                                >
                                  <span className="flex items-center gap-1.5">
                                    <span>{itemCfg.icon}</span>
                                    <span>{itemCfg.name}</span>
                                  </span>
                                  {shift === cat && <span className="w-1.5 h-1.5 bg-zinc-950 rounded-full"></span>}
                                </button>
                              );
                            })}

                            {isLocked && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onCellOverride(dateKey, dr.id, null); // Clear lock
                                  setActiveCell(null);
                                }}
                                className="w-full flex items-center gap-1.5 px-2 py-1.5 rounded-lg text-left text-xs text-rose-600 hover:bg-rose-50 font-bold cursor-pointer transition-colors mt-1.5 border-t border-zinc-100 pt-1.5"
                              >
                                <Unlock className="w-3.5 h-3.5" />
                                恢复为智能自动编排
                              </button>
                            )}
                          </div>
                        )}
                      </td>
                    );
                  })}

                  {/* Day Validation Check */}
                  <td className="py-2 px-3 border-l border-r-0 text-center w-36">
                    {isValid ? (
                      <div className="flex items-center justify-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 py-1.5 px-2 rounded-full border border-emerald-100">
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-650" />
                        <span>编排已达标</span>
                      </div>
                    ) : (
                      <div
                        className="flex flex-col items-center justify-center gap-0.5 text-[9px] font-bold text-rose-750 bg-rose-50 py-1 px-1.5 rounded-lg border border-rose-100"
                        title={`缺少以下必排班次：${missing.join(', ')}`}
                      >
                        <div className="flex items-center gap-1">
                          <ShieldAlert className="w-3 h-3 text-rose-500" />
                          <span>今日覆盖不足</span>
                        </div>
                        <span className="text-[8px] font-medium text-zinc-500">
                          缺: {missing.join('+')}
                        </span>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
