import { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { 
  Cloud, 
  CloudUpload, 
  CloudDownload, 
  RefreshCw, 
  LogOut, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  FileSpreadsheet,
  ExternalLink,
  Info
} from 'lucide-react';
import { 
  initAuth, 
  googleSignIn, 
  googleSignOut, 
  saveBackupToDrive, 
  findBackupFile, 
  downloadBackupFromDrive 
} from '../utils/driveSync';
import { 
  loadDataFromGoogleSheet, 
  saveDataToGoogleSheet, 
  extractSpreadsheetId 
} from '../utils/sheetsSync';
import { Driver, ManualLocks } from '../types';

interface DriveSyncPanelProps {
  drivers: Driver[];
  onUpdateDrivers: (drivers: Driver[]) => void;
  locks: ManualLocks;
  onUpdateLocks: (locks: ManualLocks) => void;
}

export function DriveSyncPanel({
  drivers,
  onUpdateDrivers,
  locks,
  onUpdateLocks,
}: DriveSyncPanelProps) {
  // Authentication states
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  
  // Tab control: default to 'sheets' since user requested Google Sheet connectivity
  const [syncMode, setSyncMode] = useState<'sheets' | 'drive'>('sheets');

  // Google Sheets state
  const [sheetUrl, setSheetUrl] = useState<string>(() => {
    return localStorage.getItem('scheduler_sheet_url') || 
           'https://docs.google.com/spreadsheets/d/1v-eBKhtWRQORxLaFfAkXr2s4wwLGbt3E2cIXbfpu8sI/edit?usp=sharing';
  });

  // Action loaders and statuses
  const [syncing, setSyncing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });

  // Drive Backup specific states
  const [cloudBackupExists, setCloudBackupExists] = useState(false);
  const [cloudBackupId, setCloudBackupId] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  // Auto-persist Google Sheets URL link
  useEffect(() => {
    localStorage.setItem('scheduler_sheet_url', sheetUrl);
  }, [sheetUrl]);

  // Clean sync status when tab changes
  useEffect(() => {
    setSyncStatus({ type: null, message: '' });
  }, [syncMode]);

  // Initialize Auth state listener
  useEffect(() => {
    const unsubscribe = initAuth(
      (currentUser, accessToken) => {
        setUser(currentUser);
        setToken(accessToken);
        setAuthInitialized(true);
        checkCloudBackup(accessToken);
      },
      () => {
        setUser(null);
        setToken(null);
        setAuthInitialized(true);
      }
    );
    return () => unsubscribe();
  }, []);

  // Check if a Drive json backup already exists
  const checkCloudBackup = async (accessToken: string) => {
    setSearching(true);
    const fileId = await findBackupFile(accessToken);
    if (fileId) {
      setCloudBackupExists(true);
      setCloudBackupId(fileId);
      try {
        const metadataRes = await fetch(
          `https://www.googleapis.com/drive/v3/files/${fileId}?fields=modifiedTime`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        if (metadataRes.ok) {
          const meta = await metadataRes.json();
          if (meta.modifiedTime) {
            const date = new Date(meta.modifiedTime);
            setLastSyncedTime(date.toLocaleString('zh-CN'));
          }
        }
      } catch (e) {
        console.error('获取备份元数据失败:', e);
      }
    } else {
      setCloudBackupExists(false);
      setCloudBackupId(null);
    }
    setSearching(false);
  };

  const handleLogin = async () => {
    setSyncStatus({ type: null, message: '' });
    try {
      const result = await googleSignIn();
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        await checkCloudBackup(result.accessToken);
        setSyncStatus({
          type: 'success',
          message: '登录成功！已成功连接 Google 账户及 Google Sheets 权限。'
        });
      }
    } catch (err: any) {
      console.error('Google Sign-In failed', err);
      setSyncStatus({
        type: 'error',
        message: `登录失败: ${err.message || '请检查您的网络并确保您同意了所有的权限请求。'}`
      });
    }
  };

  const handleLogout = async () => {
    if (confirm('确定要断开 Google 云端连接吗？')) {
      try {
        await googleSignOut();
        setUser(null);
        setToken(null);
        setCloudBackupExists(false);
        setCloudBackupId(null);
        setLastSyncedTime(null);
        setSyncStatus({ type: 'success', message: '已成功断开 Google 云端服务。' });
      } catch (err) {
        console.error('Google Sign-Out failed', err);
      }
    }
  };

  // --- Google Sheets Sync Handlers ---
  const handlePushToSheets = async () => {
    if (!token) return;
    if (!sheetUrl.trim()) {
      setSyncStatus({ type: 'error', message: '请提供有效的 Google Sheets 表格链接或 ID。' });
      return;
    }

    const confirmed = confirm(
      '确定要将当前的司机配置以及所有的手动改派班次，一键推送并覆盖写入您的 Google Sheets 表格吗？\n\n这将会清空云端表格对应的 "drivers" 与 "locks" 标签页内容。'
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncStatus({ type: 'info', message: '正在推送数据到 Google Sheet...' });

    const result = await saveDataToGoogleSheet(token, sheetUrl, drivers, locks);
    if (result.success) {
      setSyncStatus({
        type: 'success',
        message: '✅ 数据已成功推送到 Google Sheet 表格中！您可以直接到表格中刷新查看新数据。'
      });
    } else {
      setSyncStatus({
        type: 'error',
        message: `推送失败: ${result.error || '可能对该表格暂无编辑权限，请检查共享设置。'}`
      });
    }
    setSyncing(false);
  };

  const handlePullFromSheets = async () => {
    if (!token) return;
    if (!sheetUrl.trim()) {
      setSyncStatus({ type: 'error', message: '请提供有效的 Google Sheets 表格链接或 ID。' });
      return;
    }

    const confirmed = confirm(
      '确定要从您的 Google Sheets 载入最新的排班数据吗？\n\n这将会完全覆盖您此设备当前的本地数据（包括司机列表配置、所有的手动锁定排班等）。此操作无法撤销！'
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncStatus({ type: 'info', message: '正在从 Google Sheet 读取最新数据...' });

    const result = await loadDataFromGoogleSheet(token, sheetUrl);
    if (result.success) {
      if (result.drivers) {
        onUpdateDrivers(result.drivers);
      }
      if (result.locks) {
        onUpdateLocks(result.locks);
      }

      const totalLoadedDrivers = result.drivers ? result.drivers.length : 0;
      const totalLoadedLocks = result.locks 
        ? Object.values(result.locks).reduce((sum, dLocks) => sum + Object.keys(dLocks).length, 0)
        : 0;

      setSyncStatus({
        type: 'success',
        message: `🎉 已成功同步恢复！成功加载了 ${totalLoadedDrivers} 位司机配置和 ${totalLoadedLocks} 个锁定班次。`
      });
    } else {
      setSyncStatus({
        type: 'error',
        message: `载入失败: ${result.error || '读取表格出错，请核对链接与权限。'}`
      });
    }
    setSyncing(false);
  };

  // --- Google Drive File Backup Handlers ---
  const handleUploadBackup = async () => {
    if (!token) return;
    
    const confirmed = confirm(
      '确定要将当前的司机配置以及所有锁定班次，作为 JSON 备份文件保存到您的 Google Drive 云端吗？这将覆写现有的备份文件。'
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncStatus({ type: 'info', message: '正在备份到 Cloud Drive...' });

    const payload = {
      drivers,
      locks,
      syncedAt: new Date().toISOString(),
      version: '1.0'
    };

    const result = await saveBackupToDrive(token, payload);
    if (result.success) {
      const folderMsg = result.savedIntoTargetFolder
        ? '已保存在目标专用文件夹 (1RaWqQ7ekhBbxm8ENqsrZMQ_JRL0y1H-r)。'
        : '已保存在云盘根目录 My Drive 。';
      
      setSyncStatus({
        type: 'success',
        message: `数据已成功备份！${folderMsg}`
      });
      setLastSyncedTime(new Date().toLocaleString('zh-CN'));
      await checkCloudBackup(token);
    } else {
      setSyncStatus({
        type: 'error',
        message: `备份到云端失败: ${result.error || '请稍后重试。'}`
      });
    }
    setSyncing(false);
  };

  const handleDownloadBackup = async () => {
    if (!token) return;

    if (!cloudBackupId) {
      setSyncStatus({
        type: 'error',
        message: '未在您的 Drive 中搜索到备份文件。'
      });
      return;
    }

    const confirmed = confirm(
      '确定要从 Google Drive 云端主备份文件恢复排班数据吗？这将会覆盖此设备当前的本地修改。此操作不可逆！'
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncStatus({ type: 'info', message: '正在从 Cloud 恢复备份数据...' });

    const data = await downloadBackupFromDrive(token, cloudBackupId);
    if (data) {
      if (Array.isArray(data.drivers)) {
        onUpdateDrivers(data.drivers);
      }
      if (data.locks) {
        onUpdateLocks(data.locks);
      }
      
      setSyncStatus({
        type: 'success',
        message: '已成功从 Google Drive 云端同步并恢复最新的数据！'
      });

      if (data.syncedAt) {
        const date = new Date(data.syncedAt);
        setLastSyncedTime(date.toLocaleString('zh-CN'));
      }
    } else {
      setSyncStatus({
        type: 'error',
        message: '下载云端备份文件失败。'
      });
    }
    setSyncing(false);
  };

  if (!authInitialized) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col justify-center items-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        <span className="text-xs text-zinc-500 mt-2">正在初始化云端状态...</span>
      </div>
    );
  }

  // Google Standard Button style helper
  const renderGoogleButton = () => (
    <button 
      onClick={handleLogin}
      className="w-full flex items-center justify-center gap-2.5 bg-zinc-900 border border-zinc-850 hover:bg-zinc-800 text-white font-bold py-2 px-3 rounded-lg text-xs cursor-pointer shadow-sm transition-all"
    >
      <svg version="1.1" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="w-4 h-4 block">
        <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"></path>
        <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"></path>
        <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"></path>
        <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"></path>
        <path fill="none" d="M0 0h48v48H0z"></path>
      </svg>
      <span>授权 Google 账号并连接云端</span>
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col justify-between" id="google-drive-sync-panel">
      <div>
        <div className="flex items-center justify-between mb-2">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cloud className="w-4 h-4 text-zinc-850" />
            云数据交互中心
          </h2>
          {user && (
            <button 
              onClick={handleLogout}
              className="text-[10px] text-zinc-450 hover:text-rose-600 transition-colors flex items-center gap-1 font-semibold cursor-pointer"
              title="退出登录并断开云端"
            >
              <LogOut className="w-3 h-3" />
              断开
            </button>
          )}
        </div>

        {/* Tab Selection */}
        <div className="flex bg-zinc-100 p-1 rounded-lg mb-4.5 gap-1">
          <button
            onClick={() => setSyncMode('sheets')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
              syncMode === 'sheets'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Sheets 数据库同步
          </button>
          <button
            onClick={() => setSyncMode('drive')}
            className={`flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md text-[11px] font-semibold transition-all ${
              syncMode === 'drive'
                ? 'bg-white text-zinc-900 shadow-xs'
                : 'text-zinc-500 hover:text-zinc-800'
            }`}
          >
            <Cloud className="w-3.5 h-3.5" />
            Drive 全盘备份
          </button>
        </div>

        {!user ? (
          <div className="space-y-3.5">
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              为了实现多台设备（手机、电脑、平板等）的协同排班，或使用 Google Sheets 替代后台数据库，您可以一键进行安全授权。我们仅向 Google 申请此项目创建/更新的文件夹及表格权限。
            </p>
            {renderGoogleButton()}
          </div>
        ) : (
          <div className="space-y-4">
            {/* User Details Block */}
            <div className="bg-zinc-50 rounded-lg p-2.5 border border-zinc-100 flex items-center gap-2">
              <img 
                src={user.photoURL || 'https://www.gstatic.com/images/branding/product/2x/avatar_square_blue_120dp.png'} 
                alt={user.displayName || 'Google Member'} 
                className="w-7 h-7 rounded-full border border-zinc-200"
                referrerPolicy="no-referrer"
              />
              <div className="overflow-hidden">
                <p className="text-[11px] font-bold text-zinc-800 truncate leading-none">
                  {user.displayName || '已授权用户'}
                </p>
                <p className="text-[9px] text-zinc-400 truncate mt-1">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Render Tab Mode Content */}
            {syncMode === 'sheets' ? (
              <div className="space-y-3.5">
                {/* Spreadsheet ID Input field */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest block">
                    Google Sheets 链接或 ID
                  </label>
                  <div className="relative">
                    <input
                      type="text"
                      className="w-full bg-zinc-50 border border-zinc-200 rounded-lg py-1.5 px-2.5 text-[10px] font-mono text-zinc-800 focus:outline-none focus:ring-1 focus:ring-zinc-900 focus:bg-white pr-7"
                      placeholder="粘贴您的 Google 表格地址"
                      value={sheetUrl}
                      onChange={(e) => setSheetUrl(e.target.value)}
                    />
                    {sheetUrl && (
                      <a 
                        href={sheetUrl.startsWith('http') ? sheetUrl : `https://docs.google.com/spreadsheets/d/${extractSpreadsheetId(sheetUrl)}`}
                        target="_blank"
                        rel="noreferrer"
                        className="absolute right-2 top-2 text-zinc-400 hover:text-zinc-800 cursor-pointer"
                        title="在新页面打开此 Google 表格"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                </div>

                {/* Control Action Buttons for Sheets */}
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handlePullFromSheets}
                    disabled={syncing}
                    className="flex items-center justify-center gap-1.5 bg-white hover:bg-zinc-50 disabled:bg-zinc-50 border border-zinc-200 disabled:border-zinc-150 text-zinc-800 disabled:text-zinc-305 text-[11px] py-2 rounded-lg font-bold cursor-pointer transition-all shadow-xs"
                    title="从 Google 表格拉取配置和手动改班重载列表"
                  >
                    {syncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudDownload className="w-3.5 h-3.5 text-zinc-500" />
                    )}
                    从表格拉取
                  </button>

                  <button
                    onClick={handlePushToSheets}
                    disabled={syncing}
                    className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 text-white disabled:text-zinc-450 text-[11px] py-2 rounded-lg font-bold cursor-pointer transition-all border border-zinc-850 shadow-sm"
                    title="推送我当下的配置覆盖到云端表格"
                  >
                    {syncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5" />
                    )}
                    推送到表格
                  </button>
                </div>

                {/* Tip block */}
                <div className="text-[10px] text-zinc-500 leading-relaxed bg-zinc-50 border border-zinc-100 p-2.5 rounded-lg space-y-1.5">
                  <div className="flex items-start gap-1">
                    <Info className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />
                    <span className="font-semibold text-zinc-700">表格数据库运作提示：</span>
                  </div>
                  <p>
                    1. 本操作将直接读写您指定的表格。<br />
                    2. 表格内部需包含 <b>drivers</b> 标签和 <b>locks</b> 标签来储存司机架构和排程修改锁。<br />
                    3. <b>如果标签不存在，系统会自动帮您创建</b>。
                  </p>
                </div>
              </div>
            ) : (
              // Google Drive file backup view
              <div className="space-y-3.5">
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    onClick={handleUploadBackup}
                    disabled={syncing}
                    className="flex items-center justify-center gap-1.5 bg-zinc-900 hover:bg-zinc-800 disabled:bg-zinc-200 text-white disabled:text-zinc-450 text-[11px] py-2 rounded-lg font-bold cursor-pointer transition-all border border-zinc-850 shadow-sm"
                  >
                    {syncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudUpload className="w-3.5 h-3.5" />
                    )}
                    备份到云端
                  </button>

                  <button
                    onClick={handleDownloadBackup}
                    disabled={syncing || (!cloudBackupExists && !searching)}
                    className="flex items-center justify-center gap-1.5 bg-white hover:bg-zinc-50 disabled:bg-zinc-50 border border-zinc-200 disabled:border-zinc-150 text-zinc-800 disabled:text-zinc-350 text-[11px] py-2 rounded-lg font-bold cursor-pointer transition-all shadow-xs"
                  >
                    {syncing ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CloudDownload className="w-3.5 h-3.5 animate-spin" />
                    )}
                    自云端恢复
                  </button>
                </div>

                {/* Cloud Backup status */}
                <div className="text-[10px] text-zinc-400 space-y-1.5 bg-zinc-50/50 p-2.5 rounded-lg border border-zinc-100 border-dashed">
                  <div className="flex justify-between items-center">
                    <span>主备份文件状态：</span>
                    <span className="font-semibold text-zinc-750">
                      {searching ? '正在查询...' : (cloudBackupExists ? '有历史备份 ✅' : '暂无备份 ❌')}
                    </span>
                  </div>
                  {lastSyncedTime && (
                    <div className="flex justify-between items-center">
                      <span>最后同步时间：</span>
                      <span className="font-semibold text-zinc-750">{lastSyncedTime}</span>
                    </div>
                  )}
                  <div className="flex flex-col gap-0.5 pt-1.5 border-t border-zinc-100 mt-1">
                    <span className="text-[9px] text-zinc-405">同步目标备份文件夹：</span>
                    <a 
                      href="https://drive.google.com/drive/folders/1RaWqQ7ekhBbxm8ENqsrZMQ_JRL0y1H-r" 
                      target="_blank"
                      rel="noreferrer"
                      className="text-[9px] text-zinc-500 hover:text-zinc-800 underline truncate font-mono block"
                      title="点击查看目标云端文件夹"
                    >
                      1RaWqQ7ekhBbxm8ENqsrZMQ_JRL0y1H-r
                    </a>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Sync Status Notifications messages feedback */}
      {syncStatus.type && (
        <div className={`mt-3 p-2.5 rounded-lg text-[10px] leading-relaxed flex items-start gap-1.5 border transition-all ${
          syncStatus.type === 'success' 
            ? 'bg-emerald-50 border-emerald-100 text-emerald-800' 
            : syncStatus.type === 'error'
              ? 'bg-rose-50 border-rose-100 text-rose-800'
              : 'bg-zinc-50 border-zinc-150 text-zinc-750'
        }`}>
          {syncStatus.type === 'success' && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />}
          {syncStatus.type === 'error' && <AlertCircle className="w-3.5 h-3.5 text-rose-500 flex-shrink-0 mt-0.5" />}
          {syncStatus.type === 'info' && <RefreshCw className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0 mt-0.5" />}
          <div>{syncStatus.message}</div>
        </div>
      )}
    </div>
  );
}
