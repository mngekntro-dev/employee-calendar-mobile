import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

interface Props {
  projectId: string;
  projectName: string;
  navigation: any;
}

export default function LedgerListTab({ }: Props) {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>この機能は現場管理アプリで使用できます。</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  text: { color: '#6b7280', fontSize: 14 },
});
