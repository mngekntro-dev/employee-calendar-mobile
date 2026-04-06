import { client } from './client';
import { User } from '../types';

export const login = async (email: string, password: string): Promise<{ token: string; user: User }> => {
  const res = await client.post('/auth/login', { email, password });
  return res.data;
};
