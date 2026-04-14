import React from 'react';
import { Text, StyleSheet, ViewStyle } from 'react-native';
import { UserRole, ROLE_LABEL } from '../types';

interface BadgeProps {
  role: UserRole;
  style?: ViewStyle;
}

const ROLE_BG: Record<UserRole, string> = {
  admin: '#fde68a',
  employee: '#dbeafe',
  partner: '#d1fae5',
};

const ROLE_TEXT: Record<UserRole, string> = {
  admin: '#92400e',
  employee: '#1e40af',
  partner: '#065f46',
};

export default function Badge({ role, style }: BadgeProps) {
  return (
    <Text
      style={[
        styles.badge,
        { backgroundColor: ROLE_BG[role], color: ROLE_TEXT[role] },
        style,
      ]}
    >
      {ROLE_LABEL[role]}
    </Text>
  );
}

const styles = StyleSheet.create({
  badge: {
    fontSize: 12,
    fontWeight: '700',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 20,
    overflow: 'hidden',
    alignSelf: 'flex-start',
  },
});
