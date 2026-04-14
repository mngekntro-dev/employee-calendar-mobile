import React from 'react';
import { TouchableOpacity, View, Text, StyleSheet } from 'react-native';
import { Project, STATUS_LABEL, STATUS_COLOR } from '../types';

const AVATAR_COLORS = ['#1a56db', '#059669', '#d97706', '#dc2626', '#7c3aed', '#0891b2'];

const getUserColor = (userId: string) => {
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = (hash * 31 + userId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
};

interface Props {
  project: Project & { members?: { user_id: string; profile: { full_name: string } | null }[] };
  onPress: () => void;
}

export default function ProjectCard({ project, onPress }: Props) {
  const statusColor = STATUS_COLOR[project.status];
  const members = project.members ?? [];

  return (
    <TouchableOpacity style={styles.card} onPress={onPress} activeOpacity={0.8}>
      <View style={styles.header}>
        <Text style={styles.name} numberOfLines={1}>{project.name}</Text>
        <View style={[styles.statusBadge, { backgroundColor: statusColor + '22' }]}>
          <Text style={[styles.statusText, { color: statusColor }]}>
            {STATUS_LABEL[project.status]}
          </Text>
        </View>
      </View>

      {project.description.length > 0 && (
        <Text style={styles.description} numberOfLines={2}>{project.description}</Text>
      )}

      <View style={styles.footer}>
        {project.start_date && (
          <Text style={styles.date}>
            📅 {project.start_date}
            {project.end_date ? ` 〜 ${project.end_date}` : ''}
          </Text>
        )}
        {members.length > 0 && (
          <View style={styles.avatars}>
            {members.slice(0, 5).map((m, i) => {
              const name = m.profile?.full_name ?? '?';
              const initial = name[0];
              const color = getUserColor(m.user_id);
              return (
                <View key={i} style={[styles.avatar, { backgroundColor: color, marginLeft: i === 0 ? 0 : -8 }]}>
                  <Text style={styles.avatarText}>{initial}</Text>
                </View>
              );
            })}
            {members.length > 5 && (
              <View style={[styles.avatar, { backgroundColor: '#9ca3af', marginLeft: -8 }]}>
                <Text style={styles.avatarText}>+{members.length - 5}</Text>
              </View>
            )}
          </View>
        )}
      </View>
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    borderLeftWidth: 4,
    borderLeftColor: '#1a56db',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  name: {
    fontSize: 17,
    fontWeight: '700',
    color: '#111827',
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  description: {
    fontSize: 14,
    color: '#6b7280',
    marginBottom: 10,
    lineHeight: 20,
  },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  date: {
    fontSize: 13,
    color: '#9ca3af',
    flex: 1,
  },
  avatars: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#fff',
  },
  avatarText: {
    color: '#fff',
    fontSize: 11,
    fontWeight: '700',
  },
});
