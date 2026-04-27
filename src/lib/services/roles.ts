import { supabase } from '@/lib/supabase';
import type { UserRole } from '@/lib/types';

export const getUserRole = async (userId: string): Promise<UserRole> => {
  if (!userId) return 'Employee';
  const { data, error } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .single();

  if (error || !data) return 'Employee'; // Default to Employee if no role is found
  return data.role as UserRole;
};
