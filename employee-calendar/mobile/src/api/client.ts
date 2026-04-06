import axios from 'axios';
import { useAuthStore } from '../store/authStore';

const BASE_URL = 'https://employee-calendar-backend-production.up.railway.app/api';

export const client = axios.create({ baseURL: BASE_URL });

client.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

client.interceptors.response.use(
  (res) => res,
  (error) => {
    if (error.response?.status === 401) {
      useAuthStore.getState().logout();
    }
    return Promise.reject(error);
  }
);
