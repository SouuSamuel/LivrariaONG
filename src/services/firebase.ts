import { initializeApp } from 'firebase/app';
import { getAuth, initializeAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { Platform } from 'react-native';
import { createAsyncStorage } from '@react-native-async-storage/async-storage';

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const app = initializeApp(firebaseConfig);

const getReactNativePersistence = (storage: ReturnType<typeof createAsyncStorage>) => {
  return class ReactNativePersistence {
    static type = 'LOCAL';
    type = 'LOCAL';

    async _isAvailable() {
      try {
        await storage.setItem('__firebase_auth_available__', '1');
        await storage.removeItem('__firebase_auth_available__');
        return true;
      } catch {
        return false;
      }
    }

    _set(key: string, value: unknown) {
      return storage.setItem(key, JSON.stringify(value));
    }

    async _get(key: string) {
      const json = await storage.getItem(key);
      return json ? JSON.parse(json) : null;
    }

    _remove(key: string) {
      return storage.removeItem(key);
    }

    _addListener() {}

    _removeListener() {}
  };
};

const criarAuth = () => {
  if (Platform.OS === 'web') return getAuth(app);

  try {
    const appStorage = createAsyncStorage('app');
    return initializeAuth(app, {
      persistence: getReactNativePersistence(appStorage) as any,
    });
  } catch {
    return getAuth(app);
  }
};

export const auth = criarAuth();
export const db = getFirestore(app);
