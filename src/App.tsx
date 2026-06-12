import { useState, useMemo, useEffect } from 'react';
import { Driver, ScheduleGrid, ManualLocks, ShiftCategory } from './types';
import { generateSchedule, auditSchedule, getDaysInMonth, formatDateKey, WEEKDAYS_CN } from './utils/scheduler';
import { DriverConfig } from './components/DriverConfig';
import { RosterGrid } from './components/ScheduleGrid';
import { StatsDashboard } from './components/StatsDashboard';
import { AuditPanel } from './components/AuditPanel';
import { 
  Users, 
  Settings2, 
  BarChart3, 
  ShieldAlert, 
  Sparkles, 
  CalendarRange, 
  Download, 
  Upload, 
  RotateCcw,
  BookOpen,
  CheckCircle,
  HelpCircle,
  LayoutGrid
} from 'lucide-react';

const DEFAULT_DRIVERS: Driver[] = [
  { id: 'dr-1', name: '张师傅 (张三)', isFiveTonOnly: false, fixedRestDays: [0, 6] },
  { id: 'dr-2', name: '李师傅 (李四)', isFiveTonOnly: false, fixedRestDays: [0, 6] },
  { id: 'dr-3', name: '王师傅 (王五)', isFiveTonOnly: false, fixedRestDays: [0, 6] },
  { id: 'dr-4', name: '赵师傅 (赵六)', isFiveTonOnly: false, fixedRestDays: [1, 2] },
  { id: 'dr-5', name: '陈师傅 (陈七)', isFiveTonOnly: false, fixedRestDays: [2, 3] },
  { id: 'dr-6', name: '孙师傅 (孙八)', isFiveTonOnly: false, fixedRestDays: [3, 4] },
  { id: 'dr-7', name: '周师傅 (周九)', isFiveTonOnly: false, fixedRestDays: [4, 5] },
  { id: 'dr-8', name: '吴师傅', isFiveTonOnly: false, fixedRestDays: [5, 6] },
  { id: 'dr-9', name: '郑师傅', isFiveTonOnly: false, fixedRestDays: [0, 1] },
  { id: 'dr-10', name: '韩师傅 (5吨专职)', isFiveTonOnly: true, fixedRestDays: [0, 6] },
];

export default function App() {
  // --- Persistent State Hooks ---
  const [drivers, setDrivers] = useState<Driver[]>(() => {
    const cached = localStorage.getItem('scheduler_drivers');
    return cached ? JSON.parse(cached) : DEFAULT_DRIVERS;
  });

  const [currentYear, setCurrentYear] = useState<number>(() => {
    return new Date().getFullYear(); // e.g. 2026 or current
  });

  const [currentMonth, setCurrentMonth] = useState<number>(() => {
    return new Date().getMonth() + 1; // 1-indexed, e.g. 6 (June)
  });

  const [locks, setLocks] = useState<ManualLocks>(() => {
    const cached = localStorage.getItem('scheduler_locks');
    return cached ? JSON.parse(cached) : {};
  });

  const [activeTab, setActiveTab] = useState<'grid' | 'drivers' | 'stats' | 'rules'>('grid');
  const [showHelp, setShowHelp] = useState<boolean>(true);

  // Save states to localStorage when updated
  useEffect(() => {
    localStorage.setItem('scheduler_drivers', JSON.stringify(drivers));
  }, [drivers]);

  useEffect(() => {
    localStorage.setItem('scheduler_locks', JSON.stringify(locks));
  }, [locks]);

  // --- Real-Time Roster Engine & Auditor ---
  // Calculates grid with memoization, reacting to locks and drivers settings in real-time
  const { prevGrid, grid } = useMemo(() => {
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const prevYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    
    const prevG = generateSchedule({
      drivers,
      year: prevYear,
      month: prevMonth,
      locks,
    });

    const g = generateSchedule({
      drivers,
      year: currentYear,
      month: currentMonth,
      locks,
      existingGrid: prevG,
    });

    return { prevGrid: prevG, grid: g };
  }, [drivers, currentYear, currentMonth, locks]);

  // Audits the grid for core constraint violations dynamically
  const violations = useMemo(() => {
    return auditSchedule(grid, drivers, currentYear, currentMonth, prevGrid);
  }, [grid, drivers, currentYear, currentMonth, prevGrid]);

  const errorCount = violations.filter(v => v.type === 'error').length;
  const warningCount = violations.filter(v => v.type === 'warning').length;

  // Memoize days array of the selected month
  const days = useMemo(() => getDaysInMonth(currentYear, currentMonth), [currentYear, currentMonth]);

  // Derived real-time indicators for Bento cards
  const bentoStats = useMemo(() => {
    let totalEdm = 0;
    let totalNight = 0;
    let activeDriverCount = 0;
    let hanFiveTonCount = 0;

    drivers.forEach(dr => {
      if (!dr.isFiveTonOnly) {
        activeDriverCount++;
      }
    });

    Object.keys(grid).forEach(dateKey => {
      const dayGrid = grid[dateKey] || {};
      Object.keys(dayGrid).forEach(drId => {
        const shift = dayGrid[drId];
        const dr = drivers.find(d => d.id === drId);
        if (shift === 'EDM') {
          totalEdm++;
        } else if (shift === '夜班') {
          totalNight++;
        } else if (shift === '5吨') {
          if (dr?.isFiveTonOnly) {
            hanFiveTonCount++;
          }
        }
      });
    });

    const avgEdm = activeDriverCount > 0 ? (totalEdm / activeDriverCount).toFixed(1) : '0';
    const avgNight = activeDriverCount > 0 ? (totalNight / activeDriverCount).toFixed(1) : '0';

    return {
      avgEdm,
      avgNight,
      hanFiveTonCount,
    };
  }, [grid, drivers]);

  // --- Controller Handlers ---
  const handleCellOverride = (dateKey: string, driverId: string, shift: ShiftCategory | null) => {
    setLocks((prev) => {
      const next = { ...prev };
      if (shift === null) {
        // Clear override
        if (next[dateKey]) {
          delete next[dateKey][driverId];
          if (Object.keys(next[dateKey]).length === 0) {
            delete next[dateKey];
          }
        }
      } else {
        // Set override
        if (!next[dateKey]) {
          next[dateKey] = {};
        }
        next[dateKey][driverId] = shift;
      }
      return next;
    });
  };

  const handleClearAllLocks = () => {
    if (confirm('确定要清空本月所有的手动修改，并全部恢复为智能自动排班吗？')) {
      setLocks((prev) => {
        const next = { ...prev };
        const prefix = `${currentYear}-${String(currentMonth).padStart(2, '0')}-`;
        Object.keys(next).forEach(dateKey => {
          if (dateKey.startsWith(prefix)) {
            delete next[dateKey];
          }
        });
        return next;
      });
    }
  };

  // Safe Excel CSV Exporter (includes UTF-8 BOM to avoid Mojibake in Excel)
  const handleExportCSV = () => {
    const headers = ['日期', '生肖/星期', ...drivers.map(d => d.name)];
    
    const rows = days.map(d => {
      const dateKey = formatDateKey(d);
      const dayGrid = grid[dateKey] || {};
      return [
        `${d.getDate()}日`,
        WEEKDAYS_CN[d.getDay()],
        ...drivers.map(dr => dayGrid[dr.id] || '休息')
      ];
    });

    const csvContent = "\uFEFF" + [headers, ...rows].map(e => e.join(",")).join("\n");
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `物流司机排班表_${currentYear}年${currentMonth}月.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Quick reset to default settings
  const handleResetToDefaults = () => {
    if (confirm('确认重置吗？这将清空所有自定义司机设置、偏好、以及手动锁定班次。')) {
      localStorage.removeItem('scheduler_drivers');
      localStorage.removeItem('scheduler_locks');
      setDrivers(DEFAULT_DRIVERS);
      setLocks({});
      alert('已成功重置至系统默认设定。');
    }
  };

  // Generate Year & Month picks (current year +/- 1)
  const years = [currentYear - 1, currentYear, currentYear + 1];
  const months = Array.from({ length: 12 }, (_, i) => i + 1);

  return (
    <div className="min-h-screen bg-zinc-50 text-zinc-900 font-sans flex flex-col antialiased">
      {/* Top Stylish Branding Header */}
      <header className="bg-white border-b border-zinc-200/80 py-4 px-6 md:px-8 shrink-0">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-zinc-900 rounded-xl flex items-center justify-center shadow-md">
              <CalendarRange className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-zinc-950 flex items-center gap-2">
                司机智能排班系统
                <span className="text-zinc-400 font-normal text-sm">/ {currentYear}年{currentMonth}月</span>
              </h1>
              <p className="text-xs text-zinc-500 mt-0.5">
                基于物流调度约束规则，白班/夜班/EDM/5吨秒级排定，伴随手动锁定时连锁实时重排
              </p>
            </div>
          </div>

          {/* Quick Date Select Dashboard */}
          <div className="flex items-center gap-2">
            {/* Year Selector */}
            <select
              value={currentYear}
              onChange={(e) => {
                setCurrentYear(Number(e.target.value));
              }}
              className="bg-white text-zinc-800 border border-zinc-200 text-xs font-bold px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-950 cursor-pointer text-center shadow-sm"
            >
              {years.map(y => (
                <option key={y} value={y}>{y} 年</option>
              ))}
            </select>

            {/* Month Selector */}
            <select
              value={currentMonth}
              onChange={(e) => {
                setCurrentMonth(Number(e.target.value));
              }}
              className="bg-white text-zinc-800 border border-zinc-200 text-xs font-bold px-3 py-2 rounded-lg focus:outline-none focus:ring-1 focus:ring-zinc-950 cursor-pointer text-center shadow-sm"
            >
              {months.map(m => (
                <option key={m} value={m}>{String(m).padStart(2, '0')} 月</option>
              ))}
            </select>

            {/* Export CSV action button */}
            <button
              onClick={handleExportCSV}
              className="flex items-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 text-white text-xs font-bold px-3.5 py-2 rounded-lg transition-all cursor-pointer shadow-sm"
              title="导出当前排班表到 CSV"
            >
              <Download className="w-3.5 h-3.5" />
              导出排班
            </button>

            {/* Reset Defaults button */}
            <button
              onClick={handleResetToDefaults}
              className="p-2 bg-white hover:bg-zinc-50 text-zinc-500 hover:text-rose-600 rounded-lg transition-all border border-zinc-200 cursor-pointer shadow-sm"
              title="初始化原始数据"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Body Layout */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 md:p-6 lg:p-8 flex flex-col gap-5">
        {/* Real-time Instructions Collapse card */}
        {showHelp && (
          <div className="bg-zinc-900 text-zinc-100 rounded-2xl p-5 border border-zinc-955 relative shadow-md" id="rules-guide-banner">
            <button
              className="absolute top-4 right-4 text-zinc-400 hover:text-white text-sm font-bold opacity-75 cursor-pointer"
              onClick={() => setShowHelp(false)}
            >
              不再显示 ×
            </button>
            <h2 className="flex items-center gap-2 font-bold text-sm text-white">
              <Sparkles className="w-5 h-5 text-yellow-400" />
              排班三大核心规则与自动补偿机制说明
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mt-4 text-xs">
              <div className="space-y-1.5 border-r border-zinc-800 pr-4">
                <p className="font-bold text-yellow-400 flex items-center gap-1">
                  <span>1. 基础人力达标（最高优先限制）</span>
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  系统每日确保调度中<b>至少有</b>一个<b>白班</b>、一个<b>EDM</b>、一个<b>夜班</b>和一个<b>5吨</b>班次覆盖。多余运力自动倾斜给白班或EDM。
                </p>
              </div>
              <div className="space-y-1.5 border-r border-zinc-800 px-4">
                <p className="font-bold text-zinc-300 flex items-center gap-1">
                  <span>2. 夜班大修保障与专职限制</span>
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  依据硬性规则，司机值完大夜班次之后<b>次日只能休整休息</b>，保障路途安全。专职5吨的司机只承接5吨货运。
                </p>
              </div>
              <div className="space-y-1.5 pl-4">
                <p className="font-bold text-emerald-300 flex items-center gap-1">
                  <span>3. 双休优先匹配与实时联动重算</span>
                </p>
                <p className="text-zinc-300 leading-relaxed">
                  系统最大化优先保障极高优固定休息（周休 2 天）。对其中任何网格进行微调改写时，<b>之后的全月班次会在瞬间重新求解重绘</b>！
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Tab Selection Row */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-zinc-200 pb-1">
          {/* Tabs switch */}
          <div className="flex items-center gap-1 bg-zinc-200/60 p-1 rounded-xl self-start">
            <button
              onClick={() => setActiveTab('grid')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'grid'
                  ? 'bg-white shadow-sm text-zinc-950 font-bold'
                  : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-150'
              }`}
            >
              <LayoutGrid className="w-3.5 h-3.5" />
              主排班对照表
            </button>
            <button
              onClick={() => setActiveTab('drivers')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'drivers'
                  ? 'bg-white shadow-sm text-zinc-950'
                  : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-150'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              司机参数设置 ({drivers.length})
            </button>
            <button
              onClick={() => setActiveTab('stats')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'stats'
                  ? 'bg-white shadow-sm text-zinc-950'
                  : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-150'
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              出勤负载平衡分析
            </button>
            <button
              onClick={() => setActiveTab('rules')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'rules'
                  ? 'bg-white shadow-sm text-zinc-950'
                  : 'text-zinc-650 hover:text-zinc-900 hover:bg-zinc-150'
              }`}
            >
              <ShieldAlert className="w-3.5 h-3.5" />
              合规性诊断审计
              {violations.length > 0 && (
                <span className={`ml-1.5 px-1.5 py-0.2 rounded-full text-[9px] font-bold text-white ${
                  errorCount > 0 ? 'bg-rose-500' : 'bg-amber-500'
                }`}>
                  {violations.length}
                </span>
              )}
            </button>
          </div>

          {/* Quick Realtime stats tag */}
          <div className="flex items-center gap-3">
            {!showHelp && (
              <button
                onClick={() => setShowHelp(true)}
                className="text-xs text-zinc-600 font-semibold hover:underline cursor-pointer flex items-center gap-1"
              >
                <HelpCircle className="w-3.5 h-3.5" />
                规则指南
              </button>
            )}

            <div className="flex items-center gap-2">
              {violations.length === 0 ? (
                <div className="flex items-center gap-1.5 text-xs/none font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1.5 rounded-full border border-emerald-100 shadow-sm">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span>排班完全合规</span>
                </div>
              ) : (
                <div
                  onClick={() => setActiveTab('rules')}
                  className="flex items-center gap-1.5 text-xs/none font-bold text-rose-700 bg-rose-50 px-2.5 py-1.5 rounded-full border border-rose-100 cursor-pointer hover:bg-rose-100 transition-colors shadow-sm"
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-rose-500 animate-pulse"></span>
                  <span>诊断出 {errorCount} 处违规与 {warningCount} 处偏离</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Dynamic Panels Viewport */}
        <div className="flex-1">
          {activeTab === 'grid' && (
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
              {/* Main Scheduling Grid (takes col-span-9) */}
              <div className="lg:col-span-9 flex flex-col h-full space-y-4">
                <RosterGrid
                  drivers={drivers}
                  year={currentYear}
                  month={currentMonth}
                  grid={grid}
                  locks={locks}
                  onCellOverride={handleCellOverride}
                  onClearAllLocks={handleClearAllLocks}
                  violationsCount={violations.length}
                  onYearChange={setCurrentYear}
                  onMonthChange={setCurrentMonth}
                />
                
                {/* Usage Tips panel below */}
                <div className="bg-zinc-150/30 border border-zinc-200 rounded-xl p-4 text-xs text-zinc-500 leading-relaxed shadow-sm">
                  💡 <b>使用技巧提示</b>：您可以直接在上述对照表的任意方格上，点击并改派班次（如将某天某师傅的排班改为<b>休息</b>）。改派后，系统将自动锁定，并触发物流智编引擎重算后续班次，全力兼顾并保障每日及每月的均衡分布！
                </div>
              </div>

              {/* Right Bento Sidebar (takes col-span-3) */}
              <div className="lg:col-span-3 flex flex-col gap-4">
                
                {/* Card 1: Real-time Rule Check */}
                <div className="bg-zinc-900 text-white rounded-xl p-5 border border-zinc-950 flex flex-col justify-between shadow-md">
                  <div>
                    <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-widest mb-4">
                      实时规则校验
                    </h2>
                    <div className="space-y-4 text-xs">
                      <div className="flex items-center gap-2.5">
                        <div className={`w-2.5 h-2.5 rounded-full ${violations.length === 0 ? 'bg-emerald-400' : 'bg-amber-400'}`}></div>
                        <span className="font-bold">排班规则达标率 {violations.length === 0 ? '100%' : `${Math.max(50, 100 - violations.length * 10)}%`}</span>
                      </div>
                      
                      <div className="flex items-center gap-2.5 text-zinc-305">
                        <div className={`w-2 h-2 rounded-full ${violations.some(v => v.id.startsWith('night-rest-')) ? 'bg-rose-500' : 'bg-emerald-400'}`}></div>
                        <span>夜班次日强制休息 ({violations.some(v => v.id.startsWith('night-rest-')) ? '发现冲突' : '完美通过'})</span>
                      </div>

                      <div className="flex items-center gap-2.5 text-zinc-305">
                        <div className={`w-2 h-2 rounded-full ${violations.some(v => v.id.startsWith('weekly-rest-low-')) ? 'bg-amber-400' : 'bg-emerald-400'}`}></div>
                        <span>周固定休2天限制 ({drivers.length - violations.filter(v => v.id.startsWith('weekly-rest-low-')).length}/{drivers.length} 达标)</span>
                      </div>
                    </div>
                  </div>
                  
                  <div className="mt-8 pt-4 border-t border-zinc-800">
                    <p className="text-[10px] leading-relaxed text-zinc-500">
                      后台算法会自动响应任何修改，实时重新调度计算，在不改变专职限性的同时追求全月夜班/EDM指标的大致相同。
                    </p>
                  </div>
                </div>

                {/* Card 2: Current Month Average Stats & Legends */}
                <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col">
                  <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest mb-4">
                    本月核心偏载率
                  </h2>
                  <div className="space-y-4">
                    <div>
                      <div className="flex justify-between text-[11px] mb-1.5 text-zinc-600">
                        <span className="font-semibold">EDM 任务分配 (平均)</span>
                        <span className="font-mono font-semibold text-zinc-800">{bentoStats.avgEdm} 次 / 人</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-emerald-500 h-full transition-all duration-500" style={{ width: `${Math.min(100, Number(bentoStats.avgEdm) * 12)}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1.5 text-zinc-650">
                        <span className="font-semibold">夜班 任务分配 (平均)</span>
                        <span className="font-mono font-semibold text-zinc-800">{bentoStats.avgNight} 次 / 人</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-zinc-900 h-full transition-all duration-500" style={{ width: `${Math.min(100, Number(bentoStats.avgNight) * 15)}%` }}></div>
                      </div>
                    </div>

                    <div>
                      <div className="flex justify-between text-[11px] mb-1.5 text-zinc-650">
                        <span className="font-semibold">专职5吨厢货覆盖</span>
                        <span className="font-mono font-semibold text-zinc-800">{bentoStats.hanFiveTonCount} / {days.length} 天</span>
                      </div>
                      <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                        <div className="bg-amber-400 h-full transition-all duration-500" style={{ width: `${Math.min(100, (bentoStats.hanFiveTonCount / days.length) * 100)}%` }}></div>
                      </div>
                    </div>
                  </div>

                  <div className="mt-5 pt-4 border-t border-zinc-150">
                    <span className="text-[10px] font-bold block text-zinc-400 mb-2.5 uppercase tracking-wide">排班类别标识</span>
                    <div className="grid grid-cols-2 gap-2 text-[10px]">
                      <div className="flex items-center gap-1.5 text-zinc-650 font-medium">
                        <span className="w-2.5 h-2.5 rounded bg-blue-50 border border-blue-200"></span>
                        <span>☀️ 白班</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-650 font-medium">
                        <span className="w-2.5 h-2.5 rounded bg-zinc-900"></span>
                        <span>🌙 夜班</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-650 font-medium">
                        <span className="w-2.5 h-2.5 rounded bg-amber-50 border border-amber-200"></span>
                        <span>🚚 5吨</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-650 font-medium">
                        <span className="w-2.5 h-2.5 rounded bg-emerald-50 border border-emerald-200"></span>
                        <span>⚡ EDM</span>
                      </div>
                      <div className="flex items-center gap-1.5 text-zinc-650 font-medium col-span-2">
                        <span className="w-2.5 h-2.5 rounded bg-zinc-50 border border-zinc-200 border-dashed"></span>
                        <span>💤 休息 / 固定休</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Card 3: Dynamic tip block */}
                <div className="bg-emerald-50/50 rounded-xl p-4 border border-emerald-100 flex items-start gap-2.5 shadow-sm">
                  <div className="p-1 px-1.5 bg-zinc-900 rounded-lg text-white font-bold text-[10px] flex-shrink-0">
                    ⚡
                  </div>
                  <div>
                    <p className="text-[11px] font-bold text-zinc-900 leading-tight">安全与公平自补偿机制</p>
                    <p className="text-[10px] text-zinc-600 leading-relaxed mt-1">
                      调度一旦发生手动重编，系统会自动向更符合条件的可用未锁司机委派大夜及EDM，确保司机间工作量公平。
                    </p>
                  </div>
                </div>

              </div>
            </div>
          )}

          {activeTab === 'drivers' && (
            <div className="grid grid-cols-1 gap-6">
              <DriverConfig
                drivers={drivers}
                onUpdateDrivers={setDrivers}
              />
            </div>
          )}

          {activeTab === 'stats' && (
            <StatsDashboard
              drivers={drivers}
              year={currentYear}
              month={currentMonth}
              grid={grid}
            />
          )}

          {activeTab === 'rules' && (
            <AuditPanel
              violations={violations}
            />
          )}
        </div>
      </main>

      {/* Humble Footer */}
      <footer className="bg-zinc-100 border-t border-zinc-200 py-4 px-6 text-center text-xs text-zinc-400 shrink-0">
        物流运输司机智能排班管理系统 版权所有 © 2026. 基于 Google AI Studio 容器专线。
      </footer>
    </div>
  );
}
