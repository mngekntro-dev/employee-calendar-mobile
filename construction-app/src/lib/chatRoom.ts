import { supabase } from './supabase';

export async function getOrCreateRoom(type: 'global' | 'project', projectId?: string): Promise<string> {
  let query = supabase.from('chat_rooms').select('id').eq('type', type);
  if (projectId) query = query.eq('project_id', projectId);
  else query = query.is('project_id', null);

  const { data } = await query.maybeSingle();
  if (data) return data.id;

  const { data: newRoom, error } = await supabase
    .from('chat_rooms')
    .insert({ type, project_id: projectId ?? null })
    .select('id')
    .single();
  if (error) throw error;
  return newRoom.id;
}
