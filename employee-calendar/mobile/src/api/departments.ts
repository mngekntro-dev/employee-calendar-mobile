import { client } from './client';
import { Department } from '../types';

export const getDepartments = async (): Promise<Department[]> => {
  const res = await client.get('/departments');
  return res.data;
};

export const createDepartment = async (name: string): Promise<Department> => {
  const res = await client.post('/departments', { name });
  return res.data;
};

export const updateDepartment = async (id: number, name: string): Promise<Department> => {
  const res = await client.put(`/departments/${id}`, { name });
  return res.data;
};

export const deleteDepartment = async (id: number): Promise<void> => {
  await client.delete(`/departments/${id}`);
};
