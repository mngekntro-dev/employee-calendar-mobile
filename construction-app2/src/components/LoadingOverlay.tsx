import React from 'react';
import { View, ActivityIndicator, StyleSheet, Text } from 'react-native';

interface Props {
  message?: string;
}

export default function LoadingOverlay({ message = '読み込み中...' }: Props) {
  return (
    <View style={styles.overlay}>
      <ActivityIndicator size="large" color="#1a56db" />
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f9fafb',
  },
  text: {
    marginTop: 12,
    fontSize: 15,
    color: '#6b7280',
  },
});
