import { create } from 'zustand';
import { Platform } from 'react-native';
import { User } from '../types';

// Web用はlocalStorage、モバイル用はSecureStoreを使用
const storage = {
  async getItem(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      return localStorage.getItem(key);
    }
    const SecureStore = await import('expo-secure-store');
    return SecureStore.getItemAsync(key);
  },
  async setItem(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.setItem(key, value);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    return SecureStore.setItemAsync(key, value);
  },
  async deleteItem(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      localStorage.removeItem(key);
      return;
    }
    const SecureStore = await import('expo-secure-store');
    return SecureStore.deleteItemAsync(key);
  },
};

interface AuthState {
  token: string | null;
  user: User | null;
  setAuth: (token: string, user: User) => void;
  logout: () => void;
  loadToken: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  user: null,
  setAuth: async (token, user) => {
    await storage.setItem('token', token);
    await storage.setItem('user', JSON.stringify(user));
    set({ token, user });
  },
  logout: async () => {
    await storage.deleteItem('token');
    await storage.deleteItem('user');
    set({ token: null, user: null });
  },
  loadToken: async () => {
    const token = await storage.getItem('token');
    const userStr = await storage.getItem('user');
    if (token && userStr) {
      set({ token, user: JSON.parse(userStr) });
    }
  },
}));
