import React, { useState } from 'react';
import { Driver } from '../types';
import { WEEKDAYS_CN } from '../utils/scheduler';
import { User, ToggleLeft, ToggleRight, CalendarDays, Edit, Trash2, Plus, Info } from 'lucide-react';

interface DriverConfigProps {
  drivers: Driver[];
  onUpdateDrivers: (drivers: Driver[]) => void;
  isAuthorized?: boolean;
}

export const DriverConfig: React.FC<DriverConfigProps> = ({ drivers, onUpdateDrivers, isAuthorized = true }) => {
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editFiveTonOnly, setEditFiveTonOnly] = useState(false);
  const [editRestDays, setEditRestDays] = useState<number[]>([]);
  const [editMandatoryRestDays, setEditMandatoryRestDays] = useState<number[]>([]);

  const handleStartEdit = (driver: Driver) => {
    if (!isAuthorized) {
      alert('当前处于安全只读模式下，无法编辑司机属性。请首先在页面上方“安全编辑锁”中输入正确的编辑密码解锁！');
      return;
    }
    setEditingDriverId(driver.id);
    setEditName(driver.name);
    setEditFiveTonOnly(driver.isFiveTonOnly);
    setEditRestDays([...driver.fixedRestDays]);
    setEditMandatoryRestDays([...(driver.mandatoryRestDays || [])]);
  };

  const handleSaveEdit = () => {
    if (!editName.trim()) return;
    
    const updated = drivers.map(d => {
      if (d.id === editingDriverId) {
        return {
          ...d,
          name: editName.trim(),
          isFiveTonOnly: editFiveTonOnly,
          fixedRestDays: editRestDays,
          mandatoryRestDays: editMandatoryRestDays,
        };
      }
      return d;
    });

    onUpdateDrivers(updated);
    setEditingDriverId(null);
  };

  const handleCancelEdit = () => {
    setEditingDriverId(null);
  };

  const handleToggleRestDay = (dayIndex: number) => {
    if (editRestDays.includes(dayIndex)) {
      setEditRestDays(editRestDays.filter(d => d !== dayIndex));
    } else {
      // Move out of mandatory if it's there
      setEditMandatoryRestDays(editMandatoryRestDays.filter(d => d !== dayIndex));
      setEditRestDays([...editRestDays, dayIndex]);
    }
  };

  const handleToggleMandatoryRestDay = (dayIndex: number) => {
    if (editMandatoryRestDays.includes(dayIndex)) {
      setEditMandatoryRestDays(editMandatoryRestDays.filter(d => d !== dayIndex));
    } else {
      // Move this day out of preferred rest days if it's there
      setEditRestDays(editRestDays.filter(d => d !== dayIndex));
      setEditMandatoryRestDays([...editMandatoryRestDays, dayIndex]);
    }
  };

  const handleAddDriver = () => {
    if (!isAuthorized) {
      alert('当前处于安全只读模式下，无法添加新司机。请首先在页面上方“安全编辑锁”中输入正确的编辑密码解锁！');
      return;
    }
    const nextNum = drivers.length + 1;
    const newDriver: Driver = {
      id: `driver-${Date.now()}`,
      name: `司机 ${nextNum}`,
      isFiveTonOnly: false,
      fixedRestDays: [0, 6], // Default rest on Sat/Sun
      mandatoryRestDays: [],
    };
    onUpdateDrivers([...drivers, newDriver]);
    handleStartEdit(newDriver);
  };

  const handleDeleteDriver = (id: string) => {
    if (!isAuthorized) {
      alert('当前处于安全只读模式下，无法删除司机。请首先在页面上方“安全编辑锁”中输入正确的编辑密码解锁！');
      return;
    }
    if (drivers.length <= 4) {
      alert('为了保证日常班次（白、夜、EDM、5吨）最基本的人力需求，系统至少需要保留4名司机。');
      return;
    }
    if (confirm('确定要删除这名司机吗？已排的班次将被自动重新分配。')) {
      onUpdateDrivers(drivers.filter(d => d.id !== id));
      if (editingDriverId === id) {
        setEditingDriverId(null);
      }
    }
  };

  return (
    <div className="bg-white rounded-xl border border-zinc-200 shadow-sm overflow-hidden flex flex-col h-full" id="driver-config-panel">
      {/* Panel Header */}
      <div className="p-4 border-b border-zinc-150 flex items-center justify-between bg-zinc-50/50">
        <div>
          <h2 className="font-semibold text-zinc-950 text-base flex items-center gap-2">
            <User className="w-5 h-5 text-zinc-850" />
            司机管理 & 规则设定
          </h2>
          <p className="text-xs text-zinc-500 mt-0.5">当前司机总数：{drivers.length} 人</p>
        </div>
        <button
          onClick={handleAddDriver}
          title="添加新司机"
          className="flex items-center gap-1.5 text-xs font-semibold bg-zinc-900 hover:bg-zinc-800 text-white px-3 py-2 rounded-lg cursor-pointer transition-all shadow-sm"
        >
          <Plus className="w-3.5 h-3.5" />
          增添司机
        </button>
      </div>

      {/* Main Content Area */}
      <div className="p-4 overflow-y-auto flex-1 space-y-3 max-h-[500px] custom-scrollbar">
        {/* Editing sub-form */}
        {editingDriverId ? (
          <div className="bg-zinc-50 rounded-xl p-4 border border-zinc-200 space-y-4 animate-fade-in">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-800 flex items-center gap-1.5">
              <Edit className="w-3.5 h-3.5" />
              编辑司机属性
            </h3>

            {/* Driver Name Input */}
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1">司机姓名</label>
              <input
                type="text"
                value={editName}
                onChange={e => setEditName(e.target.value)}
                maxLength={10}
                className="w-full text-sm border border-zinc-200 rounded-lg px-3 py-2 bg-white outline-zinc-950 focus:ring-1 focus:ring-zinc-950 focus:border-zinc-950"
                placeholder="例如: 张师傅"
              />
            </div>

            {/* Five Ton Only Toggle */}
            <div className="flex items-center justify-between p-2.5 bg-white border border-zinc-200 rounded-lg">
              <div>
                <label className="text-sm font-semibold text-zinc-700 flex items-center gap-1">
                  只排5吨班次
                </label>
                <p className="text-xs text-zinc-500 mt-0.5">勾选后，该司机将只承担「5吨」或「休息」</p>
              </div>
              <button
                type="button"
                onClick={() => setEditFiveTonOnly(!editFiveTonOnly)}
                className="text-zinc-900 focus:outline-none cursor-pointer"
              >
                {editFiveTonOnly ? (
                  <ToggleRight className="w-10 h-6 text-zinc-900" />
                ) : (
                  <ToggleLeft className="w-10 h-6 text-zinc-400" />
                )}
              </button>
            </div>

            {/* Weekly Preferred Rest Days */}
            <div className="bg-white border border-zinc-200 rounded-lg p-3 space-y-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-750">
                  <CalendarDays className="w-4 h-4 text-sky-600" />
                  <span>优先固定排休星期 (优先安排)</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  系统在排班时会优先安排该司机在所选星期休息。如遇人力极其紧张可能作调整。
                </p>
              </div>
              
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map(dayIndex => {
                  const isPref = editRestDays.includes(dayIndex);
                  const isWeekend = dayIndex === 0 || dayIndex === 6;
                  return (
                    <button
                      type="button"
                      key={dayIndex}
                      onClick={() => handleToggleRestDay(dayIndex)}
                      className={`text-xs py-1.5 rounded-md font-semibold border cursor-pointer transition-all ${
                        isPref
                          ? 'bg-sky-50 text-sky-700 border-sky-200 shadow-sm font-bold'
                          : isWeekend
                          ? 'bg-rose-50/50 text-rose-700 border-rose-100 hover:bg-rose-100/60'
                          : 'bg-zinc-50 text-zinc-650 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {WEEKDAYS_CN[dayIndex]}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Weekly Mandatory Rest Days */}
            <div className="bg-white border border-zinc-200 rounded-lg p-3 space-y-2">
              <div>
                <div className="flex items-center gap-1.5 text-sm font-semibold text-zinc-750">
                  <CalendarDays className="w-4 h-4 text-emerald-600" />
                  <span>硬性必须周休星期 (绝对强制)</span>
                </div>
                <p className="text-xs text-zinc-500 mt-0.5">
                  系统在此星期天数必定强制休假，绝对不会为该司机派发任何班次。
                </p>
              </div>
              
              <div className="grid grid-cols-4 gap-1.5">
                {[1, 2, 3, 4, 5, 6, 0].map(dayIndex => {
                  const isMandatory = editMandatoryRestDays.includes(dayIndex);
                  const isWeekend = dayIndex === 0 || dayIndex === 6;
                  return (
                    <button
                      type="button"
                      key={dayIndex}
                      onClick={() => handleToggleMandatoryRestDay(dayIndex)}
                      className={`text-xs py-1.5 rounded-md font-semibold border cursor-pointer transition-all ${
                        isMandatory
                          ? 'bg-emerald-600 text-white border-emerald-600 shadow-sm font-bold'
                          : isWeekend
                          ? 'bg-rose-50/50 text-rose-700 border-rose-100 hover:bg-rose-100/60'
                          : 'bg-zinc-50 text-zinc-650 border-zinc-200 hover:bg-zinc-100'
                      }`}
                    >
                      {WEEKDAYS_CN[dayIndex]}
                    </button>
                  );
                })}
              </div>
            </div>

            {(editRestDays.length + editMandatoryRestDays.length) !== 2 && (
              <p className="text-xs text-emerald-600 mt-2 flex items-center gap-1 font-medium bg-emerald-50/50 p-1.5 rounded border border-emerald-100">
                <Info className="w-3.5 h-3.5" />
                友情提示：建议设定共计 2 天固定排休（优先排休 + 必须排休总和 2 日）以适应轮休要求
              </p>
            )}

            {/* Action buttons */}
            <div className="flex gap-2 justify-end pt-1">
              <button
                type="button"
                onClick={handleCancelEdit}
                className="px-3.5 py-1.5 text-xs font-semibold text-zinc-650 bg-zinc-150 hover:bg-zinc-200 rounded-lg cursor-pointer transition-all"
              >
                取消
              </button>
              <button
                type="button"
                onClick={handleSaveEdit}
                className="px-4 py-1.5 text-xs font-bold text-white bg-zinc-900 hover:bg-zinc-800 rounded-lg cursor-pointer shadow-sm transition-all"
              >
                保存修改
              </button>
            </div>
          </div>
        ) : null}

        {/* Drivers List */}
        <div className="space-y-2">
          {drivers.map((driver, index) => {
            const isEditing = editingDriverId === driver.id;
            return (
              <div
                key={driver.id}
                className={`group flex items-center justify-between p-3 rounded-xl border transition-all ${
                  isEditing
                    ? 'border-zinc-950 bg-zinc-100/30 shadow-sm'
                    : 'border-zinc-200 hover:border-zinc-300 bg-white hover:shadow-sm'
                }`}
              >
                <div className="flex items-center gap-3">
                  {/* Driver Index Badge */}
                  <span className="w-6 h-6 flex items-center justify-center rounded-lg bg-zinc-100 text-zinc-500 text-xs font-bold font-mono border border-zinc-150">
                    {index + 1}
                  </span>
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-zinc-800 text-sm leading-tight">
                        {driver.name}
                      </span>
                      {driver.isFiveTonOnly && (
                        <span className="bg-amber-100 text-amber-805 text-[10px] font-bold px-1.5 py-0.5 rounded-full border border-amber-200">
                          专职5吨
                        </span>
                      )}
                    </div>
                    {/* Rest Info */}
                    <div className="text-[11px] text-zinc-500 mt-0.5 flex flex-col gap-1 sm:flex-row sm:items-center sm:gap-3 flex-wrap">
                      <div className="flex items-center gap-1">
                        <span className="font-medium text-zinc-400">优先排休:</span>
                        {driver.fixedRestDays.length > 0 ? (
                          <div className="flex gap-1">
                            {driver.fixedRestDays.map(dIndex => (
                              <span key={dIndex} className="bg-sky-50 text-sky-700 font-semibold px-1.5 py-0.2 rounded text-[10px] border border-sky-100">
                                {WEEKDAYS_CN[dIndex]}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-zinc-400 text-[10px]">-</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1">
                        <span className="font-medium text-zinc-400">强排必定休:</span>
                        {driver.mandatoryRestDays && driver.mandatoryRestDays.length > 0 ? (
                          <div className="flex gap-1">
                            {driver.mandatoryRestDays.map(dIndex => (
                              <span key={dIndex} className="bg-emerald-50 text-emerald-700 font-bold px-1.5 py-0.2 rounded text-[10px] border border-emerald-100">
                                {WEEKDAYS_CN[dIndex]} (必休)
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span className="italic text-zinc-400 text-[10px]">-</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                {!isEditing && (
                  <div className="flex gap-1 items-center opacity-70 group-hover:opacity-100 transition-opacity">
                    <button
                      onClick={() => handleStartEdit(driver)}
                      title="配置司机规则"
                      className="p-1.5 hover:bg-zinc-100 text-zinc-500 hover:text-zinc-950 rounded-lg cursor-pointer transition-all"
                    >
                      <Edit className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => handleDeleteDriver(driver.id)}
                      title="删除司机"
                      className="p-1.5 hover:bg-zinc-100 text-zinc-500 hover:text-rose-600 rounded-lg cursor-pointer transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
