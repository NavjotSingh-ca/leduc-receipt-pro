import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';

export const getUserRole = async (userId: string): Promise<UserRole> => {
  if (!userId) return 'Owner'; // Default to Owner per 9 Star Labs spec
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  // Default to Owner if no role is found (new users are Owners)
  if (error || !data) return 'Owner';
  return data.role as UserRole;
};

export const setUserRole = async (userId: string, role: UserRole): Promise<void> => {
  const { error } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role }, { onConflict: 'user_id' });

  if (error) throw error;
};
