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
 */
export const findBackupFile = async (token: string): Promise<string | null> => {
  try {
    const res = await fetch(
      `https://www.googleapis.com/drive/v3/files?q=name='driver_scheduler_backup.json' and trashed=false&fields=files(id,name)`,
      {
        headers: { Authorization: `Bearer ${token}` },
      }
    );
    if (!res.ok) {
      const err = await res.text();
      console.error('搜索云端备份文件失败:', err);
      return null;
    }
    const data = await res.json();
    if (data.files && data.files.length > 0) {
      return data.files[0].id;
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
 * Creates or updates the driver_scheduler_backup.json on Google Drive.
 */
export const saveBackupToDrive = async (token: string, content: any): Promise<boolean> => {
  try {
    const existingFileId = await findBackupFile(token);

    if (existingFileId) {
      // Perform PATCH to update content
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
        return false;
      }
      return true;
    } else {
      // Create new file with multipart body (metadata + media content)
      const metadata = {
        name: 'driver_scheduler_backup.json',
        mimeType: 'application/json',
      };
      
      const boundary = 'drive_scheduler_sync_boundary';
      const bodyParts = [
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(metadata),
        `--${boundary}`,
        'Content-Type: application/json; charset=UTF-8',
        '',
        JSON.stringify(content),
        `--${boundary}--`
      ];
      
      const res = await fetch(
        'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart',
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': `multipart/related; boundary=${boundary}`,
          },
          body: bodyParts.join('\r\n'),
        }
      );
      
      if (!res.ok) {
        const err = await res.text();
        console.error('创建云端备份文件失败:', err);
        return false;
      }
      return true;
    }
  } catch (error) {
    console.error('上传云端备份失败:', error);
    return false;
  }
};
