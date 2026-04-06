import React, { useState } from 'react';
import { View, FlatList, StyleSheet, ActivityIndicator, Text } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';
import { DepartmentFilter } from '../components/DepartmentFilter';
import { EmployeeCard } from '../components/EmployeeCard';
import { getDepartments } from '../api/departments';
import { getEmployees } from '../api/employees';
import { RootStackParamList } from '../types';

type Nav = NativeStackNavigationProp<RootStackParamList>;

export const EmployeeListScreen: React.FC = () => {
  const navigation = useNavigation<Nav>();
  const [selectedDept, setSelectedDept] = useState<number | null>(null);

  const { data: departments = [] } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const { data: employees = [], isLoading } = useQuery({
    queryKey: ['employees', selectedDept],
    queryFn: () => getEmployees(selectedDept ?? undefined),
  });

  return (
    <View style={styles.container}>
      <DepartmentFilter departments={departments} selected={selectedDept} onSelect={setSelectedDept} />
      {isLoading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color="#3B82F6" />
      ) : employees.length === 0 ? (
        <Text style={styles.empty}>社員が見つかりません</Text>
      ) : (
        <FlatList
          data={employees}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <EmployeeCard
              employee={item}
              onPress={() => navigation.navigate('ScheduleForm', { userId: item.id })}
            />
          )}
          contentContainerStyle={styles.list}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  list: { padding: 16 },
  empty: { textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontSize: 15 },
});
