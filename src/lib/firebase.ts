import { initializeApp } from 'firebase/app';
import type { FirebaseApp, FirebaseOptions } from 'firebase/app';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import type { Firestore } from 'firebase/firestore';

export class FirebaseConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FirebaseConfigError';
  }
}

function requireEnv(name: keyof ImportMetaEnv): string | undefined {
  const value = import.meta.env[name];
  return value || undefined;
}

const firebaseConfig: FirebaseOptions = {
  apiKey: requireEnv('VITE_FIREBASE_API_KEY'),
  authDomain: requireEnv('VITE_FIREBASE_AUTH_DOMAIN'),
  projectId: requireEnv('VITE_FIREBASE_PROJECT_ID'),
  storageBucket: requireEnv('VITE_FIREBASE_STORAGE_BUCKET'),
  messagingSenderId: requireEnv('VITE_FIREBASE_MESSAGING_SENDER_ID'),
  appId: requireEnv('VITE_FIREBASE_APP_ID'),
  measurementId: requireEnv('VITE_FIREBASE_MEASUREMENT_ID'),
};

function isValidFirebaseApiKey(value: string | undefined): value is string {
  return Boolean(
    value &&
      value.startsWith('AIza') &&
      !value.toLowerCase().includes('replace') &&
      !value.toLowerCase().includes('your_') &&
      value.length >= 35
  );
}

export const isFirebaseConfigured =
  isValidFirebaseApiKey(firebaseConfig.apiKey) &&
  Boolean(
    firebaseConfig.authDomain &&
      firebaseConfig.projectId &&
      firebaseConfig.storageBucket &&
      firebaseConfig.messagingSenderId &&
      firebaseConfig.appId
  );

export function getMissingFirebaseEnv(): string[] {
  const required: Array<keyof typeof firebaseConfig> = [
    'apiKey',
    'authDomain',
    'projectId',
    'storageBucket',
    'messagingSenderId',
    'appId'
  ];
  const missing: string[] = [];
  required.forEach(k => {
    const v = firebaseConfig[k];
    if (!v) missing.push(k);
    if (k === 'apiKey' && !isValidFirebaseApiKey(v)) missing.push('apiKey (invalid)');
  });
  return missing;
}

let appInstance: FirebaseApp | null = null;
let dbInstance: Firestore | null = null;
let authInstance: Auth | null = null;
let googleProvider: GoogleAuthProvider | null = null;

if (isFirebaseConfigured) {
  try {
    appInstance = initializeApp(firebaseConfig);
    const firestoreDatabaseId = requireEnv('VITE_FIRESTORE_DATABASE_ID');
    dbInstance = getFirestore(appInstance, firestoreDatabaseId || '(default)');
    authInstance = getAuth(appInstance);
    googleProvider = new GoogleAuthProvider();
  } catch (error) {
    console.error('Firebase initialization error:', error);
  }
} else {
  console.warn('Firebase not configured. Using demo mode.');
}

export const db = dbInstance as Firestore;
export const auth = authInstance as Auth;
export { googleProvider };

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
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
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance?.currentUser?.uid,
      email: authInstance?.currentUser?.email,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerInfo: authInstance?.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
