import React, { useState } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity,
  Alert, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { getDepartments, createDepartment, updateDepartment, deleteDepartment } from '../api/departments';
import { Department } from '../types';

export const DepartmentManageScreen: React.FC = () => {
  const queryClient = useQueryClient();
  const { data: departments = [], isLoading } = useQuery({ queryKey: ['departments'], queryFn: getDepartments });
  const [modalVisible, setModalVisible] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState('');
  const [saving, setSaving] = useState(false);

  const openCreate = () => { setEditing(null); setName(''); setModalVisible(true); };
  const openEdit = (d: Department) => { setEditing(d); setName(d.name); setModalVisible(true); };

  const handleSave = async () => {
    if (!name.trim()) { Alert.alert('エラー', '部署名を入力してください'); return; }
    setSaving(true);
    try {
      if (editing) { await updateDepartment(editing.id, name.trim()); }
      else { await createDepartment(name.trim()); }
      queryClient.invalidateQueries({ queryKey: ['departments'] });
      setModalVisible(false);
    } catch { Alert.alert('エラー', '保存に失敗しました'); }
    finally { setSaving(false); }
  };

  const handleDelete = (d: Department) => {
    Alert.alert('削除確認', `「${d.name}」を削除しますか？`, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: async () => {
        try {
          await deleteDepartment(d.id);
          queryClient.invalidateQueries({ queryKey: ['departments'] });
        } catch { Alert.alert('エラー', '削除できません（社員が所属している可能性があります）'); }
      }},
    ]);
  };

  return (
    <View style={styles.container}>
      <TouchableOpacity style={styles.addButton} onPress={openCreate}>
        <Text style={styles.addButtonText}>+ 部署を追加</Text>
      </TouchableOpacity>
      {isLoading ? <ActivityIndicator style={{ marginTop: 40 }} color="#3B82F6" /> : (
        <FlatList
          data={departments}
          keyExtractor={(item) => item.id.toString()}
          renderItem={({ item }) => (
            <View style={styles.row}>
              <Text style={styles.rowName}>{item.name}</Text>
              <View style={styles.rowActions}>
                <TouchableOpacity style={styles.editBtn} onPress={() => openEdit(item)}>
                  <Text style={styles.editBtnText}>編集</Text>
                </TouchableOpacity>
                <TouchableOpacity style={styles.deleteBtn} onPress={() => handleDelete(item)}>
                  <Text style={styles.deleteBtnText}>削除</Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
          contentContainerStyle={{ padding: 16 }}
        />
      )}
      <Modal visible={modalVisible} transparent animationType="fade">
        <View style={styles.overlay}>
          <View style={styles.modal}>
            <Text style={styles.modalTitle}>{editing ? '部署を編集' : '部署を追加'}</Text>
            <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="部署名" />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.cancelBtn} onPress={() => setModalVisible(false)}>
                <Text style={styles.cancelBtnText}>キャンセル</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveBtn} onPress={handleSave} disabled={saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveBtnText}>保存</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F9FAFB' },
  addButton: { margin: 16, backgroundColor: '#3B82F6', padding: 14, borderRadius: 10, alignItems: 'center' },
  addButtonText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#fff', padding: 16, borderRadius: 10, marginBottom: 8 },
  rowName: { flex: 1, fontSize: 16, color: '#111827' },
  rowActions: { flexDirection: 'row', gap: 8 },
  editBtn: { backgroundColor: '#EFF6FF', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  editBtnText: { color: '#3B82F6', fontWeight: '600', fontSize: 13 },
  deleteBtn: { backgroundColor: '#FEE2E2', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6 },
  deleteBtnText: { color: '#DC2626', fontWeight: '600', fontSize: 13 },
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', padding: 32 },
  modal: { backgroundColor: '#fff', borderRadius: 16, padding: 24 },
  modalTitle: { fontSize: 18, fontWeight: '700', color: '#111827', marginBottom: 16 },
  input: { borderWidth: 1, borderColor: '#E5E7EB', borderRadius: 8, padding: 12, fontSize: 15, marginBottom: 16 },
  modalActions: { flexDirection: 'row', gap: 12 },
  cancelBtn: { flex: 1, padding: 12, borderRadius: 8, borderWidth: 1, borderColor: '#E5E7EB', alignItems: 'center' },
  cancelBtnText: { color: '#6B7280', fontWeight: '600' },
  saveBtn: { flex: 1, padding: 12, borderRadius: 8, backgroundColor: '#3B82F6', alignItems: 'center' },
  saveBtnText: { color: '#fff', fontWeight: '600' },
});
