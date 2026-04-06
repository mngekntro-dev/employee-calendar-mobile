import { client } from './client';
import { Schedule } from '../types';

export const getSchedules = async (params: {
  user_id?: number;
  start?: string;
  end?: string;
}): Promise<Schedule[]> => {
  const res = await client.get('/schedules', { params });
  return res.data;
};

export const createSchedule = async (data: {
  title: string;
  description?: string;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  user_id?: number;
}): Promise<Schedule> => {
  const res = await client.post('/schedules', data);
  return res.data;
};

export const updateSchedule = async (
  id: number,
  data: { title: string; description?: string; start_at: string; end_at: string; is_all_day: boolean }
): Promise<Schedule> => {
  const res = await client.put(`/schedules/${id}`, data);
  return res.data;
};

export const deleteSchedule = async (id: number): Promise<void> => {
  await client.delete(`/schedules/${id}`);
};
