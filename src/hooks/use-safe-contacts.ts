import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/auth-context';
import type { Database } from '@/integrations/supabase/types';
import { mailtoHref, normalizeInstagramHandle, telHref } from '@/lib/safe-contact-links';

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

/**
 * The sentences this module throws. They are written for the user, so the
 * screen may show them as they are; any other error gets fixed wording from
 * friendlySafeContactsError instead of its own text.
 */
export const SAFE_CONTACT_MESSAGES = {
  signedOut: 'You must be signed in to change your safe contacts.',
  nameRequired: 'Give this person a name first.',
  methodRequired: 'Add a phone number, email or Instagram handle so you can actually reach them.',
  phoneInvalid: 'That phone number has no digits in it — check it, or leave it blank.',
  emailInvalid: 'That email address doesn’t look right — check it, or leave it blank.',
  instagramInvalid: 'That Instagram handle doesn’t look right — use just the username, like @name.'
} as const;

export const SAFE_CONTACT_MESSAGE_LIST: readonly string[] = Object.values(SAFE_CONTACT_MESSAGES);

/**
 * What is wrong with a new contact, or null if it can be saved. Every field
 * that is filled in must make a working link, so no contact is saved with a
 * button that would do nothing.
 */
export function contactInputProblem(input: NewSafeContactInput): string | null {
  if (!input.name.trim()) return SAFE_CONTACT_MESSAGES.nameRequired;
  if (!hasContactMethod(input)) return SAFE_CONTACT_MESSAGES.methodRequired;
  if (input.phone?.trim() && !telHref(input.phone)) return SAFE_CONTACT_MESSAGES.phoneInvalid;
  if (input.email?.trim() && !mailtoHref(input.email)) return SAFE_CONTACT_MESSAGES.emailInvalid;
  if (input.instagram?.trim() && !normalizeInstagramHandle(input.instagram)) return SAFE_CONTACT_MESSAGES.instagramInvalid;
  return null;
}

/**
 * One retry, a second later. React Query's default is three retries with
 * backoff, which left "Loading your circle…" on screen for about eight
 * seconds before a failure could be shown.
 */
export const SAFE_CONTACTS_RETRIES = 1;
export const SAFE_CONTACTS_RETRY_DELAY_MS = 1000;

export function useSafeContacts() {
  const { user } = useAuth();
  const userId = user?.id ?? null;

  return useQuery({
    queryKey: safeContactsKey(userId),
    enabled: !!userId,
    retry: SAFE_CONTACTS_RETRIES,
    retryDelay: SAFE_CONTACTS_RETRY_DELAY_MS,
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
      if (!user) throw new Error(SAFE_CONTACT_MESSAGES.signedOut);

      const problem = contactInputProblem(input);
      if (problem) throw new Error(problem);

      const { data, error } = await supabase
        .from('safe_contacts')
        .insert({
          user_id: user.id,
          name: input.name.trim(),
          // Matches the column default rather than sending an empty string.
          label: input.label?.trim() || 'Support Person',
          phone: input.phone?.trim() || null,
          email: input.email?.trim() || null,
          // Stored as the bare username, so "@name" and a pasted profile URL
          // both become "name".
          instagram: normalizeInstagramHandle(input.instagram),
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
      if (!user) throw new Error(SAFE_CONTACT_MESSAGES.signedOut);

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
