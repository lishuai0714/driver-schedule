import React, { useMemo } from 'react';
import { Driver, ShiftCategory, ScheduleGrid } from '../types';
import { getDaysInMonth, formatDateKey, getWeekKey } from '../utils/scheduler';
import { BarChart3, TrendingUp, Sparkles, Check, AlertTriangle, Users, Award } from 'lucide-react';

interface StatsDashboardProps {
  drivers: Driver[];
  year: number;
  month: number;
  grid: ScheduleGrid;
}

export const StatsDashboard: React.FC<StatsDashboardProps> = ({ drivers, year, month, grid }) => {
  const days = getDaysInMonth(year, month);
  const totalDays = days.length;

  // Compute shift counts for each driver
  const driverStats = useMemo(() => {
    return drivers.map(dr => {
      const counts: Record<ShiftCategory, number> = {
        '白班': 0,
        '夜班': 0,
        '5吨': 0,
        'EDM': 0,
        '休息': 0,
      };

      days.forEach(d => {
        const dateKey = formatDateKey(d);
        const shift = grid[dateKey]?.[dr.id];
        if (shift) {
          counts[shift]++;
        }
      });

      const totalWork = counts['白班'] + counts['夜班'] + counts['5吨'] + counts['EDM'];
      
      return {
        driver: dr,
        counts,
        totalWork,
      };
    });
  }, [drivers, days, grid]);

  // Compute fairness indicators
  const fairnessMetrics = useMemo(() => {
    // Filter out 5-ton-only drivers as they don't do EDM and Night shifts
    const activeStats = driverStats.filter(s => !s.driver.isFiveTonOnly);
    
    if (activeStats.length === 0) return { maxNightDiff: 0, maxEdmDiff: 0, isFair: true };

    const nightStats = activeStats.map(s => s.counts['夜班']);
    const edmStats = activeStats.map(s => s.counts['EDM']);

    const maxNight = Math.max(...nightStats);
    const minNight = Math.min(...nightStats);
    
    const maxEdm = Math.max(...edmStats);
    const minEdm = Math.min(...edmStats);

    const maxNightDiff = maxNight - minNight;
    const maxEdmDiff = maxEdm - minEdm;

    // We consider it fair if variance is extremely low, e.g. differences are <= 1 or 2
    const isFair = maxNightDiff <= 2 && maxEdmDiff <= 2;

    return {
      maxNightDiff,
      maxEdmDiff,
      maxNight,
      minNight,
      maxEdm,
      minEdm,
      isFair,
    };
  }, [driverStats]);

  return (
    <div className="space-y-6" id="stats-dashboard-panel">
      {/* Metrics Badges Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1: Total month scale */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-50 text-orange-600 flex items-center justify-center font-bold">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-zinc-500 font-semibold text-xs uppercase tracking-wider">本月天数与规模</h3>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-mono text-zinc-900">{totalDays}</span>
              <span className="text-zinc-500 text-xs font-semibold">天</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              10 个固定司机，共计 {drivers.length} 席排班单位
            </p>
          </div>
        </div>

        {/* Card 2: Fair dispatch balance metrics */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center gap-4">
          <div className={`w-12 h-12 rounded-xl flex items-center justify-center font-bold ${
            fairnessMetrics.isFair ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
          }`}>
            <Award className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-zinc-500 font-semibold text-xs uppercase tracking-wider">夜班 & EDM 均衡度</h3>
            <div className="flex items-baseline gap-2 mt-1">
              <span className={`text-lg font-bold ${
                fairnessMetrics.isFair ? 'text-emerald-700' : 'text-amber-700'
              }`}>
                {fairnessMetrics.isFair ? '高度均衡' : '大体均衡'}
              </span>
              <span className="text-xs text-zinc-500">
                夜差: {fairnessMetrics.maxNightDiff}班 | EDM差: {fairnessMetrics.maxEdmDiff}班
              </span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              自动规则致力于分配让每人的硬班次数基本对等
            </p>
          </div>
        </div>

        {/* Card 3: Total dispatch count */}
        <div className="bg-white rounded-xl border border-zinc-200 p-4 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-zinc-150 text-zinc-800 flex items-center justify-center font-bold">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <h3 className="text-zinc-500 font-semibold text-xs uppercase tracking-wider">本期累计调度人次</h3>
            <div className="flex items-baseline gap-1 mt-1">
              <span className="text-2xl font-bold font-mono text-zinc-900">
                {driverStats.reduce((sum, item) => sum + item.totalWork, 0)}
              </span>
              <span className="text-zinc-500 text-xs font-semibold">车次</span>
            </div>
            <p className="text-[10px] text-zinc-400 mt-1">
              本月累计出勤：{driverStats.reduce((sum, item) => sum + item.counts['休息'], 0)} 人次调休
            </p>
          </div>
        </div>
      </div>

      {/* Main Stats Table */}
      <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-150 bg-zinc-50/50 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-zinc-800" />
            <h2 className="font-semibold text-zinc-900 text-sm">司机排班负载统计与平衡度分析</h2>
          </div>
          <p className="text-xs text-zinc-500">
            仅统计非“5吨专职”司机的 EDM 和 夜班 差值以评估公平度。
          </p>
        </div>

        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full border-collapse text-left text-xs min-w-[750px]">
            <thead className="bg-zinc-50 text-zinc-500 font-semibold">
              <tr className="border-b border-zinc-200">
                <th className="py-3.5 px-4 font-bold">司机姓名</th>
                <th className="py-3.5 px-4 text-center">总出勤天数</th>
                <th className="py-3.5 px-4 text-center bg-blue-50/40 text-blue-900 border-x border-zinc-200 font-bold">白班</th>
                <th className="py-3.5 px-4 text-center bg-zinc-900/10 text-zinc-900 border-r border-zinc-200 font-bold">夜班</th>
                <th className="py-3.5 px-4 text-center bg-emerald-50/40 text-emerald-900 border-r border-zinc-200 font-bold">EDM</th>
                <th className="py-3.5 px-4 text-center bg-amber-50/40 text-amber-900 border-r border-zinc-200 font-bold">5吨</th>
                <th className="py-3.5 px-4 text-center bg-zinc-50 text-zinc-500 font-bold">休假天数</th>
                <th className="py-3.5 px-4 text-center text-zinc-800 font-bold">夜班 + EDM 合计</th>
                <th className="py-3.5 px-4 text-center w-36">班次负载均衡对比</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {driverStats.map((item) => {
                const isSpec = item.driver.isFiveTonOnly;
                const nightPlusEdm = item.counts['夜班'] + item.counts['EDM'];
                
                // Graphical indicator calculations: relative percentage of workload (Night+EDM) among non-5ton drivers
                // Find maximum workloads for scaling
                const activeDriversWorkload = driverStats
                  .filter(s => !s.driver.isFiveTonOnly)
                  .map(s => s.counts['夜班'] + s.counts['EDM']);
                const maxWorkloadValue = activeDriversWorkload.length > 0 ? Math.max(...activeDriversWorkload) : 1;
                const workloadPercent = isSpec ? 0 : Math.min(100, Math.round((nightPlusEdm / (maxWorkloadValue || 1)) * 100));

                return (
                  <tr key={item.driver.id} className="hover:bg-zinc-50 transition-colors">
                    {/* Driver Name */}
                    <td className="py-3.5 px-4 font-semibold text-zinc-800 border-r border-zinc-100">
                      <div className="flex items-center gap-1.5">
                        <span>{item.driver.name}</span>
                        {isSpec && (
                          <span className="bg-amber-100 text-amber-805 text-[9px] px-1.5 py-0.5 rounded font-black border border-amber-200 scale-90">
                            专职5吨
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Total Work */}
                    <td className="py-3.5 px-4 text-center font-bold font-mono text-zinc-700">
                      {item.totalWork} 天
                    </td>

                    {/* Day shift counts */}
                    <td className="py-3.5 px-4 text-center font-mono text-blue-600 bg-blue-50/10 border-x border-zinc-100 font-bold">
                      {item.counts['白班']}
                    </td>

                    {/* Night shift counts */}
                    <td className="py-3.5 px-4 text-center font-mono text-zinc-900 bg-zinc-100/10 border-r border-zinc-100 font-bold">
                      {item.counts['夜班']}
                    </td>

                    {/* EDM shift counts */}
                    <td className="py-3.5 px-4 text-center font-mono text-emerald-600 bg-emerald-50/10 border-r border-zinc-100 font-bold">
                      {item.counts['EDM']}
                    </td>

                    {/* 5-Ton shift counts */}
                    <td className="py-3.5 px-4 text-center font-mono text-amber-605 bg-amber-50/10 border-r border-zinc-100 font-bold">
                      {item.counts['5吨']}
                    </td>

                    {/* Rest days counts */}
                    <td className="py-3.5 px-4 text-center font-mono text-zinc-400 bg-zinc-50 font-bold">
                      {item.counts['休息']}
                    </td>

                    {/* Combined counts */}
                    <td className="py-3.5 px-4 text-center font-mono font-bold text-zinc-900 bg-zinc-50/10">
                      {isSpec ? <span className="text-zinc-300 font-normal italic">--</span> : `${nightPlusEdm} 次`}
                    </td>

                    {/* Combined Visual load bars */}
                    <td className="py-3.5 px-4 text-center">
                      {isSpec ? (
                        <div className="text-[10px] text-zinc-400 italic">常规不参与特种轮转</div>
                      ) : (
                        <div className="flex items-center gap-2 justify-center">
                          <div className="flex-1 bg-zinc-100 h-2 rounded-full overflow-hidden w-24">
                            <div
                              className="bg-zinc-900 h-2 rounded-full transition-all duration-500 ease-out"
                              style={{ width: `${workloadPercent}%` }}
                            ></div>
                          </div>
                          <span className="text-[10px] font-bold text-zinc-500 font-mono">
                            {workloadPercent}%
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
        
        {/* Help tooltip footer */}
        <div className="p-3 bg-zinc-50 border-t border-zinc-150 flex items-center gap-1.5 text-[11px] text-zinc-500">
          <Sparkles className="w-4 h-4 text-amber-500" />
          <span>
            <b>自动平衡机制说明</b>：每次计算，系统会自动记录排班历史，将 <b>夜班</b> 和 <b>EDM班</b> 循环优先指派给本月累积对应班次最少的司机，保障长期出警公平合理。
          </span>
        </div>
      </div>
    </div>
  );
};
