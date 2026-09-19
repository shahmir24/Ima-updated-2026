import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';

export type SafeContactRow = Database['public']['Tables']['safe_contacts']['Row'];

export interface NewSafeContactInput {
  name: string;
  /** Free text; the column defaults to 'Support Person'. */
  label?: string;
  phone?: string | null;
  email?: string | null;
  instagram?: string | null;
  note?: string | null;
}

/**
 * Cache key is per user, so switching accounts cannot show the previous
 * account's support circle from cache. RLS already scopes every query
 * server-side; the explicit .eq('user_id', ...) below is a second,
 * client-side guard.
 *
 * This table holds third-party PII — other people's phone numbers and emails,
 * given by the user and never consented to by the contact. It is the most
 * sensitive table in the schema; nothing here logs its contents.
 */
const safeContactsKey = (userId: string | null) => ['safe-contacts', userId ?? 'anonymous'] as const;

/**
 * The `safe_contacts_reachable` CHECK requires at least one of phone, email or
 * instagram. A contact nobody can reach is worse than no contact in a crisis
 * feature, so the same rule is enforced here — before a request is sent — to
 * turn a constraint violation into a sentence the user can act on.
 */
export function hasContactMethod(input: NewSafeContactInput): boolean {
  return Boolean(input.phone?.trim() || input.email?.trim() || input.instagram?.trim());
}

export function useSafeContacts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: safeContactsKey(userId),
    enabled: !!userId,
    queryFn: async (): Promise<SafeContactRow[]> => {
      const { data, error } = await supabase
        .from('safe_contacts')
        .select('*')
        .eq('user_id', userId as string)
        .order('position', { ascending: true })
        .order('created_at', { ascending: true });

      if (error) throw error;
      return data ?? [];
    }
  });
}

function useSafeContactsInvalidator() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const userId = user?.id ?? null;
  return () => queryClient.invalidateQueries({ queryKey: safeContactsKey(userId) });
}

export function useCreateSafeContact() {
  const { user } = useAuth();
  const invalidate = useSafeContactsInvalidator();

  return useMutation({
    mutationFn: async (input: NewSafeContactInput): Promise<SafeContactRow> => {
      if (!user) throw new Error('You must be signed in to add a safe contact.');

      if (!input.name.trim()) {
        throw new Error('Give this person a name first.');
      }
      if (!hasContactMethod(input)) {
        throw new Error(
          'Add a phone number, email or Instagram handle — otherwise there is no way to reach them.'
        );
      }

      const { data, error } = await supabase
        .from('safe_contacts')
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          // Matches the column default rather than sending an empty string.
          label: input.label?.trim() || 'Support Person',
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          instagram: input.instagram?.trim() || null,
          note: input.note?.trim() || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: invalidate
  });
}

export function useDeleteSafeContact() {
  const { user } = useAuth();
  const invalidate = useSafeContactsInvalidator();

  return useMutation({
    mutationFn: async (id: string): Promise<void> => {
      if (!user) throw new Error('You must be signed in to remove a safe contact.');

      const { error } = await supabase
        .from('safe_contacts')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);

      if (error) throw error;
    },
    onSuccess: invalidate
  });
}
