import { createClient } from '@supabase/supabase-js';
import { avatarIndexForUser, getAbstractAvatar } from '@/utils/avatars';
import type { MockUser } from '@/components/LoginModal';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

export const supabase = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null;

export function authUserToProfile(user: {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
}): MockUser {
  const metadata = user.user_metadata || {};
  const email = user.email || 'user@example.com';
  const savedAvatar = typeof metadata.avatar_url === 'string' ? metadata.avatar_url : '';
  const avatar = savedAvatar || getAbstractAvatar(avatarIndexForUser(user.id));
  const birthDate = typeof metadata.birth_date === 'string' ? metadata.birth_date : '';
  const profileCompleted = metadata.profile_completed === true;

  return {
    id: user.id,
    name: String(metadata.full_name || metadata.name || email.split('@')[0] || 'User'),
    email,
    avatar,
    birthDate,
    profileCompleted,
  };
}

export function profileKey(userId: string, field: string): string {
  return `doculabai.${field}.${userId}`;
}

export async function getAccessToken(): Promise<string | null> {
  if (!supabase) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
