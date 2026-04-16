export interface User {
  id: number;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  department_id: number | null;
}

export interface Department {
  id: number;
  name: string;
}

export interface Employee {
  id: number;
  name: string;
  email: string;
  role: string;
  department_id: number | null;
  department_name: string | null;
  color: string | null;
}

export interface Schedule {
  id: number;
  user_id: number;
  user_name: string;
  department_name: string | null;
  title: string;
  description: string | null;
  start_at: string;
  end_at: string;
  is_all_day: boolean;
  created_by: number;
}

export type RootStackParamList = {
  Login: undefined;
  Main: undefined;
  ScheduleDetail: { schedule: Schedule };
  ScheduleForm: { schedule?: Schedule; userId?: number };
  EmployeeForm: { employee?: Employee };
  DepartmentManage: undefined;
};

export type MainTabParamList = {
  Calendar: undefined;
  Todo: undefined;
  EmployeeList: undefined;
  Admin: undefined;
};
