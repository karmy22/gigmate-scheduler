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

const firebaseEnvRequirements = [
  ['VITE_FIREBASE_API_KEY', firebaseConfig.apiKey, (value: string) => value.startsWith('AIza') && value.length >= 35],
  ['VITE_FIREBASE_AUTH_DOMAIN', firebaseConfig.authDomain],
  ['VITE_FIREBASE_PROJECT_ID', firebaseConfig.projectId],
  ['VITE_FIREBASE_STORAGE_BUCKET', firebaseConfig.storageBucket],
  ['VITE_FIREBASE_MESSAGING_SENDER_ID', firebaseConfig.messagingSenderId],
  ['VITE_FIREBASE_APP_ID', firebaseConfig.appId],
] as const;

function isPlaceholder(value: string): boolean {
  const normalized = value.toLowerCase();
  return (
    normalized.includes('paste_') ||
    normalized.includes('your-') ||
    normalized.includes('your_') ||
    normalized.includes('replace') ||
    normalized.includes('1234567890') ||
    normalized.includes('abcdef')
  );
}

function isUsableEnvValue(value: string | undefined, validator?: (value: string) => boolean): value is string {
  return Boolean(value && !isPlaceholder(value) && (!validator || validator(value)));
}

export const isFirebaseConfigured =
  firebaseEnvRequirements.every(([, value, validator]) => isUsableEnvValue(value, validator));

export function getMissingFirebaseEnv(): string[] {
  const missing: string[] = [];
  firebaseEnvRequirements.forEach(([name, value, validator]) => {
    if (!isUsableEnvValue(value, validator)) missing.push(name);
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
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerIds?: string[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: authInstance?.currentUser?.uid,
      emailVerified: authInstance?.currentUser?.emailVerified,
      isAnonymous: authInstance?.currentUser?.isAnonymous,
      tenantId: authInstance?.currentUser?.tenantId,
      providerIds: authInstance?.currentUser?.providerData?.map(provider => provider.providerId) || []
    },
    operationType,
    path
  }
  if (import.meta.env.DEV) {
    console.error('Firestore Error: ', JSON.stringify(errInfo));
  } else {
    console.error('Firestore Error: ', errInfo.error, errInfo.operationType, errInfo.path);
  }
  throw new Error(`Firestore ${operationType} failed${path ? ` for ${path}` : ''}`);
}
