import React, { useState } from 'react';
import { RuleViolation } from '../types';
import { ShieldCheck, ShieldAlert, AlertCircle, RefreshCw, Layers, CheckSquare, Settings } from 'lucide-react';

interface AuditPanelProps {
  violations: RuleViolation[];
}

export const AuditPanel: React.FC<AuditPanelProps> = ({ violations }) => {
  const [filterType, setFilterType] = useState<'all' | 'error' | 'warning'>('all');

  const filteredViolations = violations.filter(v => {
    if (filterType === 'all') return true;
    return v.type === filterType;
  });

  const errors = violations.filter(v => v.type === 'error');
  const warnings = violations.filter(v => v.type === 'warning');

  // Custom static representation of our core rules list to display matching checklists
  const SYSTEM_RULES = [
    {
      id: 'rule1',
      title: '每日核心班次全覆盖 (白班+夜班+EDM+5吨)',
      priority: '最高优先级',
      desc: '每天必须保证调度中至少有一人负责白班、夜班、EDM跑单和5吨厢货班次。',
      status: violations.some(v => v.id.startsWith('daily-') && !v.id.includes('extra')) ? 'violated' : 'passed',
    },
    {
      id: 'rule2',
      title: '夜班连退休息制 (夜班后必须排休息)',
      priority: '硬性健康安全规则',
      desc: '司机值完大夜班后，次日绝对禁止承接任何白班、5吨、EDM任务，必须安排调休。',
      status: violations.some(v => v.id.startsWith('night-rest-')) ? 'violated' : 'passed',
    },
    {
      id: 'rule3',
      title: '每周固定双休保障队',
      priority: '每周结算规则',
      desc: '保障每个在档期内的司机在任意一个完整日历周内有至少 2 天的安排。',
      status: violations.some(v => v.id.startsWith('weekly-rest-low-')) ? 'violated' : 'passed',
    },
    {
      id: 'rule4',
      title: '特职司机专车专用制',
      priority: '司机条件约束规则',
      desc: '对标记为“只能排5吨”的专职司机，只能对其下派「5吨」或排「休息」。',
      status: violations.some(v => v.id.startsWith('fiveton-restriction-')) ? 'violated' : 'passed',
    },
    {
      id: 'rule5',
      title: '全天班次削峰填谷 (溢出限制)',
      priority: '补充效率规则',
      desc: '如多余运力充足，每天可增设额外的白班或EDM班次运作（单日每类最高限2个班）。',
      status: violations.some(v => v.id.includes('-extra-')) ? 'violated' : 'passed',
    },
  ];

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="audit-log-panel">
      {/* Left Column: Rules Master Checklist */}
      <div className="lg:col-span-1 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden p-4 space-y-4">
        <h3 className="font-semibold text-zinc-900 text-sm flex items-center gap-2 pb-2 border-b border-zinc-150">
          <Settings className="w-4 h-4 text-zinc-800" />
          系统自动审计规则集
        </h3>
        
        <div className="space-y-3">
          {SYSTEM_RULES.map((rule) => (
            <div
              key={rule.id}
              className={`p-3 rounded-xl border transition-all ${
                rule.status === 'passed'
                  ? 'border-emerald-100 bg-emerald-50/10'
                  : 'border-rose-100 bg-rose-50/10'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                  rule.id === 'rule1' ? 'bg-red-105 text-red-800' : 'bg-zinc-100 text-zinc-650'
                }`}>
                  {rule.priority}
                </span>

                <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                  rule.status === 'passed'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}>
                  {rule.status === 'passed' ? '✔ 完美合规' : '✘ 规则打破'}
                </span>
              </div>

              <h4 className="font-bold text-zinc-805 text-xs mt-1.5 leading-tight">
                {rule.title}
              </h4>
              <p className="text-[10px] text-zinc-400 mt-1 leading-normal">
                {rule.desc}
              </p>
            </div>
          ))}
        </div>
      </div>

      {/* Right Column: Violation Logs List */}
      <div className="lg:col-span-2 bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col">
        {/* Header section with Stats filters */}
        <div className="p-4 border-b border-zinc-150 bg-zinc-50/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            {violations.length === 0 ? (
              <ShieldCheck className="w-5 h-5 text-emerald-600" />
            ) : (
              <ShieldAlert className="w-5 h-5 text-rose-500" />
            )}
            <div>
              <h3 className="font-semibold text-zinc-900 text-sm">排班合规诊断日志</h3>
              <p className="text-xs text-zinc-500 mt-0.5">
                {violations.length === 0
                  ? '检测完成，当前排班完全符合排班规则规范！'
                  : `诊断出 ${errors.length} 项硬性违规，${warnings.length} 项效率偏离。`}
              </p>
            </div>
          </div>

          {/* Filter Toolbar */}
          {violations.length > 0 && (
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setFilterType('all')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                  filterType === 'all'
                    ? 'bg-zinc-900 text-white shadow-sm'
                    : 'bg-zinc-100 hover:bg-zinc-200 text-zinc-600'
                }`}
              >
                全部 ({violations.length})
              </button>
              <button
                onClick={() => setFilterType('error')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                  filterType === 'error'
                    ? 'bg-rose-600 text-white'
                    : 'bg-rose-50 hover:bg-rose-100 text-rose-700'
                }`}
              >
                硬性漏洞 ({errors.length})
              </button>
              <button
                onClick={() => setFilterType('warning')}
                className={`px-2.5 py-1 rounded text-xs font-semibold cursor-pointer transition-colors ${
                  filterType === 'warning'
                    ? 'bg-amber-600 text-white'
                    : 'bg-amber-50 hover:bg-amber-100 text-amber-700'
                }`}
              >
                温和警告 ({warnings.length})
              </button>
            </div>
          )}
        </div>

        {/* List scroll panel */}
        <div className="flex-1 overflow-y-auto max-h-[380px] p-4 space-y-2.5 custom-scrollbar">
          {filteredViolations.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <ShieldCheck className="w-12 h-12 text-emerald-500 stroke-1 mb-2 animate-bounce-short" />
              <p className="text-zinc-700 font-bold text-sm">合规审查极其完美！</p>
              <p className="text-xs text-zinc-400 mt-1 max-w-sm">
                当前排班方案在所选参数配置下 100% 契合各项营运条件。请放心导出！
              </p>
            </div>
          ) : (
            filteredViolations.map((v) => {
              const isError = v.type === 'error';
              return (
                <div
                  key={v.id}
                  className={`flex items-start gap-3 p-3 rounded-xl border text-xs leading-normal transition-all ${
                    isError
                      ? 'border-rose-150 bg-rose-50/50 text-rose-900 hover:bg-rose-50'
                      : 'border-amber-150 bg-amber-50/50 text-amber-900 hover:bg-amber-50'
                  }`}
                >
                  <AlertCircle className={`w-4 h-4 flex-shrink-0 mt-0.5 ${
                    isError ? 'text-rose-600' : 'text-amber-600'
                  }`} />
                  <div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold uppercase tracking-wider text-[9px] px-1.5 py-0.5 rounded ${
                        isError ? 'bg-rose-100 text-rose-800' : 'bg-amber-100 text-amber-800'
                      }`}>
                        {isError ? '硬性违规' : '效率警告'}
                      </span>
                      <span className="font-semibold text-zinc-400">{v.date}</span>
                    </div>
                    <p className="font-semibold mt-1 text-zinc-705">
                      {v.message}
                    </p>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
