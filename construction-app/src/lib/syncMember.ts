/**
 * syncMember.ts
 * Supabase profiles → Railway users の一方向同期ユーティリティ
 *
 * admin credentials はフロントに持たず、Edge Function 経由で実行する。
 * エラーはすべて console.warn でサイレント処理。
 */

import { supabase } from './supabase';

// ---- 公開 API ----

/**
 * 単一メンバーを Railway users テーブルに同期する（Edge Function 経由）。
 * - エラーは console.warn でサイレント（メイン操作をブロックしない）
 */
export async function syncMemberToCalendar(profile: {
  email: string;
  full_name: string;
  role: string;
  department: string | null;
}): Promise<void> {
  try {
    const { error } = await supabase.functions.invoke('sync-member', {
      body: profile,
    });
    if (error) {
      console.warn('[syncMember] sync-member Edge Function エラー:', error.message);
    }
  } catch (err) {
    console.warn('[syncMember] syncMemberToCalendar エラー（サイレント）:', err);
  }
}

/**
 * Supabase profiles の全メンバーを Railway users テーブルに一括同期する。
 * - Railway 側にしか存在しないメンバーは削除しない（一方向同期）
 * - エラーは console.warn でサイレント
 */
export async function syncAllMembersToCalendar(): Promise<void> {
  try {
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('email, full_name, role, department');

    if (error) {
      console.warn('[syncMember] Supabase profiles 取得エラー:', error.message);
      return;
    }
    if (!profiles || profiles.length === 0) return;

    // 各メンバーを順番に Edge Function 経由で同期
    for (const profile of profiles) {
      await syncMemberToCalendar({
        email: profile.email as string,
        full_name: profile.full_name as string,
        role: profile.role as string,
        department: profile.department as string | null,
      });
    }
  } catch (err) {
    console.warn('[syncMember] syncAllMembersToCalendar エラー（サイレント）:', err);
  }
}
