import { client } from './client';
import { Employee } from '../types';

export const getEmployees = async (departmentId?: number): Promise<Employee[]> => {
  const params = departmentId ? { department_id: departmentId } : {};
  const res = await client.get('/employees', { params });
  return res.data;
};

export const createEmployee = async (data: {
  name: string; email: string; password: string;
  department_id?: number | null; role: string; color?: string;
}): Promise<Employee> => {
  const res = await client.post('/employees', data);
  return res.data;
};

export const updateEmployee = async (id: number, data: {
  name: string; email: string; password?: string;
  department_id?: number | null; role: string; color?: string;
}): Promise<Employee> => {
  const res = await client.put(`/employees/${id}`, data);
  return res.data;
};

export const deleteEmployee = async (id: number): Promise<void> => {
  await client.delete(`/employees/${id}`);
};
