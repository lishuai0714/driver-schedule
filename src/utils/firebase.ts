import { initializeApp } from 'firebase/app';
import { 
  getFirestore, 
  doc, 
  getDoc, 
  setDoc, 
  updateDoc,
  onSnapshot, 
  serverTimestamp 
} from 'firebase/firestore';
import { Driver, ManualLocks } from '../types';
import firebaseConfig from '../../firebase-applet-config.json';

// Initialize the Firebase client SDK using our applet configuration
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

/**
 * Parses and throws structured Firestore error information as required by security guidelines
 */
export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: null,
      email: null,
      emailVerified: null,
      isAnonymous: null,
      tenantId: null,
      providerInfo: []
    },
    operationType,
    path
  };
  console.error('Structured Firestore Error Logs:', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

/**
 * Clears access passcodes of spaces or tabs to make sure they are DB safe names
 */
export function sanitizePasscode(code: string): string {
  return code.trim().replace(/[^a-zA-Z0-9_\-]/g, '').toLowerCase();
}

/**
 * Saves/overwrites a schedule document with drivers and lock overrides
 */
export async function saveScheduleToFirestore(passcode: string, drivers: Driver[], locks: ManualLocks): Promise<boolean> {
  const cleanId = sanitizePasscode(passcode);
  if (!cleanId) return false;
  const docRef = doc(db, 'schedules', cleanId);
  try {
    await setDoc(docRef, {
      passcode: cleanId,
      drivers,
      locks,
      updatedAt: serverTimestamp()
    });
    return true;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `schedules/${cleanId}`);
    return false;
  }
}

/**
 * Pulls a schedule document
 */
export async function getScheduleFromFirestore(passcode: string): Promise<{ drivers: Driver[], locks: ManualLocks } | null> {
  const cleanId = sanitizePasscode(passcode);
  if (!cleanId) return null;
  const docRef = doc(db, 'schedules', cleanId);
  try {
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return {
        drivers: data.drivers || [],
        locks: data.locks || {}
      };
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `schedules/${cleanId}`);
    return null;
  }
}

/**
 * Real-time listener subscription to a passcode spreadsheet
 */
export function subscribeToScheduleFirestore(
  passcode: string, 
  onUpdate: (data: { drivers: Driver[], locks: ManualLocks, lastUpdatedBySelf?: boolean }) => void,
  onError: (err: any) => void
) {
  const cleanId = sanitizePasscode(passcode);
  const docRef = doc(db, 'schedules', cleanId);

  return onSnapshot(docRef, (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data();
      onUpdate({
        drivers: data.drivers || [],
        locks: data.locks || {}
      });
    } else {
      // Document does not exist yet (first connection for this passcode)
      onUpdate({ drivers: [], locks: {} });
    }
  }, (error) => {
    onError(error);
    handleFirestoreError(error, OperationType.GET, `schedules/${cleanId}`);
  });
}
