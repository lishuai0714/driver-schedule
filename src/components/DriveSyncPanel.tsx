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
  Loader2
} from 'lucide-react';
import { 
  initAuth, 
  googleSignIn, 
  googleSignOut, 
  saveBackupToDrive, 
  findBackupFile, 
  downloadBackupFromDrive 
} from '../utils/driveSync';
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
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [authInitialized, setAuthInitialized] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [searching, setSearching] = useState(false);
  const [syncStatus, setSyncStatus] = useState<{
    type: 'success' | 'error' | 'info' | null;
    message: string;
  }>({ type: null, message: '' });
  const [cloudBackupExists, setCloudBackupExists] = useState(false);
  const [cloudBackupId, setCloudBackupId] = useState<string | null>(null);
  const [lastSyncedTime, setLastSyncedTime] = useState<string | null>(null);

  // Initialize auth state
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

  // Check if a backup already exists on the user's Drive
  const checkCloudBackup = async (accessToken: string) => {
    setSearching(true);
    const fileId = await findBackupFile(accessToken);
    if (fileId) {
      setCloudBackupExists(true);
      setCloudBackupId(fileId);
      setSyncStatus({
        type: 'info',
        message: '在您的 Google Drive 中发现了历史排班备份。'
      });
      // Optionally request details of the file (e.g. modify time)
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
          message: '登录成功！已成功连接到 Google Drive。'
        });
      }
    } catch (err: any) {
      console.error('Google Sign-In failed', err);
      setSyncStatus({
        type: 'error',
        message: `登录失败: ${err.message || '未知错误'}`
      });
    }
  };

  const handleLogout = async () => {
    if (confirm('确定要退出登录吗？退出登录后将无法继续同步云端数据。')) {
      try {
        await googleSignOut();
        setUser(null);
        setToken(null);
        setCloudBackupExists(false);
        setCloudBackupId(null);
        setLastSyncedTime(null);
        setSyncStatus({ type: 'success', message: '已安全退出登录。' });
      } catch (err) {
        console.error('Google Sign-Out failed', err);
      }
    }
  };

  const handleUploadBackup = async () => {
    if (!token) return;
    
    // Explicit user confirmation before mutative write operation
    const confirmed = confirm(
      '确定要将当前的司机配置以及所有锁定班次保存(覆盖)到您的 Google Drive 云端吗？这将覆盖以前存在的云端备份。'
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncStatus({ type: null, message: '' });

    const payload = {
      drivers,
      locks,
      syncedAt: new Date().toISOString(),
      version: '1.0'
    };

    const success = await saveBackupToDrive(token, payload);
    if (success) {
      setSyncStatus({
        type: 'success',
        message: '数据已备份并保存至您的 Google Drive 云端。'
      });
      setLastSyncedTime(new Date().toLocaleString('zh-CN'));
      await checkCloudBackup(token);
    } else {
      setSyncStatus({
        type: 'error',
        message: '同步到云端失败，请稍后重试。'
      });
    }
    setSyncing(false);
  };

  const handleDownloadBackup = async () => {
    if (!token) return;

    if (!cloudBackupId) {
      setSyncStatus({
        type: 'error',
        message: '未能在您的云端找到排班备份文件。请先备份当前数据到云端。'
      });
      return;
    }

    const confirmed = confirm(
      '确定要从您的 Google Drive 云端恢复排班数据吗？这将会覆盖您此设备当前的本地修改（包括司机列表与所有的手动锁定）。此操作不可逆。'
    );
    if (!confirmed) return;

    setSyncing(true);
    setSyncStatus({ type: null, message: '' });

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
        message: '从云端下载恢复备份失败。'
      });
    }
    setSyncing(false);
  };

  if (!authInitialized) {
    return (
      <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col justify-center items-center py-8">
        <Loader2 className="w-6 h-6 text-zinc-500 animate-spin" />
        <span className="text-xs text-zinc-505 mt-2">正在初始化云端状态...</span>
      </div>
    );
  }

  // GSI Custom Google Standard styled Button
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
      <span>使用 Google 账号连接云端</span>
    </button>
  );

  return (
    <div className="bg-white rounded-xl border border-zinc-200 p-5 shadow-sm flex flex-col justify-between" id="google-drive-sync-panel">
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <h2 className="text-xs font-bold text-zinc-500 uppercase tracking-widest flex items-center gap-1.5">
            <Cloud className="w-4 h-4 text-zinc-800" />
            Google Drive 多端同步
          </h2>
          {user && (
            <button 
              onClick={handleLogout}
              className="text-[10px] text-zinc-450 hover:text-rose-600 transition-colors flex items-center gap-1 font-semibold cursor-pointer"
              title="退出登录"
            >
              <LogOut className="w-3 h-3" />
              断开连接
            </button>
          )}
        </div>

        {!user ? (
          <div className="space-y-3.5">
            <p className="text-[10px] text-zinc-500 leading-relaxed">
              为了实现多台电脑、手机或平板间的数据互连，您可以授权本项目访问您的 Google 云端硬盘（仅限此应用自己创建的数据文件，绝对安全）。
            </p>
            {renderGoogleButton()}
          </div>
        ) : (
          <div className="space-y-4">
            {/* User Logged In Info */}
            <div className="bg-zinc-50 rounded-lg p-2 px-3 border border-zinc-100 flex items-center gap-2">
              <img 
                src={user.photoURL || 'https://www.gstatic.com/images/branding/product/2x/avatar_square_blue_120dp.png'} 
                alt={user.displayName || 'User'} 
                className="w-7 h-7 rounded-full border border-zinc-200"
                referrerPolicy="no-referrer"
              />
              <div className="overflow-hidden">
                <p className="text-[11px] font-bold text-zinc-800 truncate leading-none">
                  {user.displayName || '已连接用户'}
                </p>
                <p className="text-[9px] text-zinc-400 truncate mt-1">
                  {user.email}
                </p>
              </div>
            </div>

            {/* Sync Control Buttons */}
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
                  <CloudDownload className="w-3.5 h-3.5" />
                )}
                自云端恢复
              </button>
            </div>

            {/* Cloud Backup Found Status Indicators */}
            <div className="text-[10px] text-zinc-400 space-y-1 bg-zinc-50/50 p-2 rounded-lg border border-zinc-100 border-dashed">
              <div className="flex justify-between items-center">
                <span>云端备份状态：</span>
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
            </div>
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
