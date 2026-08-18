export const DEPARTMENT_COLORS: Record<string, string> = {
  '発電機事業部': '#0EA5E9',
  '電気工事事業部': '#6366F1',
  '経理部': '#F43F5E',
};

export const DEFAULT_DEPARTMENT_COLOR = '#9CA3AF';

export const getDepartmentColor = (departmentName?: string | null): string =>
  (departmentName && DEPARTMENT_COLORS[departmentName]) || DEFAULT_DEPARTMENT_COLOR;
