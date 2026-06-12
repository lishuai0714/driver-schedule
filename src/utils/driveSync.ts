import { initializeApp } from 'firebase/app';
import { getAuth, signInWithPopup, GoogleAuthProvider, onAuthStateChanged, User } from 'firebase/auth';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

const provider = new GoogleAuthProvider();
provider.addScope('https://www.googleapis.com/auth/drive.file');

let isSigningIn = false;
let cachedAccessToken: string | null = null;

/**
 * Initialize Firebase auth listener.
 */
export const initAuth = (
  onAuthSuccess?: (user: User, token: string) => void,
  onAuthFailure?: () => void
) => {
  return onAuthStateChanged(auth, async (user: User | null) => {
    if (user) {
      if (cachedAccessToken) {
        if (onAuthSuccess) onAuthSuccess(user, cachedAccessToken);
      } else if (!isSigningIn) {
        cachedAccessToken = null;
        if (onAuthFailure) onAuthFailure();
      }
    } else {
      cachedAccessToken = null;
      if (onAuthFailure) onAuthFailure();
    }
  });
};

/**
 * Sign in using Google OAuth with Drive scopes.
 */
export const googleSignIn = async (): Promise<{ user: User; accessToken: string } | null> => {
  try {
    isSigningIn = true;
    const result = await signInWithPopup(auth, provider);
    const credential = GoogleAuthProvider.credentialFromResult(result);
    if (!credential?.accessToken) {
      throw new Error('获取 Google Drive 访问令牌失败');
    }

    cachedAccessToken = credential.accessToken;
    return { user: result.user, accessToken: cachedAccessToken };
  } catch (error: any) {
    console.error('Firebase Google Sign In Error:', error);
    throw error;
  } finally {
    isSigningIn = false;
  }
};

/**
 * Get the cached access token.
 */
export const getAccessToken = async (): Promise<string | null> => {
  return cachedAccessToken;
};

/**
 * Sign out of current Google session.
 */
export const googleSignOut = async () => {
  await auth.signOut();
  cachedAccessToken = null;
};

/**
 * Searches for the driver_scheduler_backup.json file on user's Google Drive.
 * Looks inside the target folder first, with a fallback to a general search.
 */
export const findBackupFile = async (
  token: string,
  folderId: string = '1RaWqQ7ekhBbxm8ENqsrZMQ_JRL0y1H-r'
): Promise<string | null> => {
  try {
    // 1. Try searching inside the target folder first
    const folderQuery = `name='driver_scheduler_backup.json' and '${folderId}' in parents and trashed=false`;
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(folderQuery)}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (res.ok) {
      const data = await res.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }

    // 2. Fallback to a global search across Drive in case it's located elsewhere/root
    const globalQuery = `name='driver_scheduler_backup.json' and trashed=false`;
    const globalRes = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(globalQuery)}&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (globalRes.ok) {
      const data = await globalRes.json();
      if (data.files && data.files.length > 0) {
        return data.files[0].id;
      }
    }
    
    return null;
  } catch (error) {
    console.error('搜索云端备份文件时发生未知错误:', error);
    return null;
  }
};

/**
 * Downloads the backup file contents.
 */
export const downloadBackupFromDrive = async (token: string, fileId: string): Promise<any | null> => {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('下载云端备份文件内容失败:', err);
      return null;
    }
    return await res.json();
  } catch (error) {
    console.error('下载云端备份文件时发生未知错误:', error);
    return null;
  }
};

/**
 * Saves and uploads driver_scheduler_backup.json on Google Drive.
 * Dynamically targets the designated folder or falls back if necessary.
 */
export const saveBackupToDrive = async (
  token: string,
  content: any,
  folderId: string = '1RaWqQ7ekhBbxm8ENqsrZMQ_JRL0y1H-r'
): Promise<{ success: boolean; savedIntoTargetFolder: boolean; error?: string }> => {
  try {
    // Check if there is already an existing backup file anywhere in the drive
    const existingFileId = await findBackupFile(token, folderId);

    if (existingFileId) {
      // Perform patch update to existing file content
      const res = await fetch(
        `https://www.googleapis.com/upload/drive/v3/files/${existingFileId}?uploadType=media`,
        {
          method: 'PATCH',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json; charset=UTF-8',
          },
          body: JSON.stringify(content),
        }
      );
      if (!res.ok) {
        const err = await res.text();
        console.error('更新云端备份文件失败:', err);
        return { success: false, savedIntoTargetFolder: false, error: err };
      }
      return { success: true, savedIntoTargetFolder: true };
    } else {
      // Try to create the backup inside the user's requested folder
      const metadataWithTarget = {
        name: 'driver_scheduler_backup.json',
        mimeType: 'application/json',
        parents: [folderId],
      };
      
      const boundary = 'drive_scheduler_sync_boundary';
      const makeBody = (metadata: any) => [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(content),
        `--${boundary}--`
      ].join('\r\n');

      let res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: makeBody(metadataWithTarget),
        }
      );

      if (res.ok) {
        return { success: true, savedIntoTargetFolder: true };
      }

      // If posting into the specific folder failed (e.g., due to folder write restrictions),
      // we fallback and create the backup directly in the user's "My Drive" (no parents specified)
      console.warn('保存到特定文件夹权限受限，尝试备份到跟目录下...', await res.clone().text());
      const fallbackMetadata = {
        name: 'driver_scheduler_backup.json',
        mimeType: 'application/json',
      };

      const fallbackRes = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: makeBody(fallbackMetadata),
        }
      );

      if (!fallbackRes.ok) {
        const err = await fallbackRes.text();
        console.error('备份到主根目录依然失败:', err);
        return { success: false, savedIntoTargetFolder: false, error: err };
      }

      return { success: true, savedIntoTargetFolder: false };
    }
  } catch (error: any) {
    console.error('上传云端备份失败:', error);
    return { success: false, savedIntoTargetFolder: false, error: error?.message || '未知异常' };
  }
};
