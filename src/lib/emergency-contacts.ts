/**
 * Emergency service numbers shown in the Safe Space help dialog.
 *
 * PROVENANCE — these are not new values. All three already existed in
 * src/pages/SafeSpaceMenu.tsx, in the `emergencyNumbers` map that the old
 * auto-dial path used:
 *
 *   const emergencyNumbers = { US: '911', UK: '999', EU: '112' };
 *
 * and again in that function's (unreachable) alert() fallback. Nothing has
 * been added, and no helpline or crisis-line number has been invented. If more
 * regions are needed, they must come from a verified source and be reviewed —
 * do not guess them.
 *
 * This is STATIC APP DATA. It is deliberately not stored in safe_contacts,
 * which holds the user's own people.
 */
export interface EmergencyNumber {
  /** Stable key for React lists. */
  id: string;
  /** Region this number serves, shown to the user. */
  region: string;
  /** The number itself, always displayed before any call is possible. */
  number: string;
}

export const EMERGENCY_NUMBERS: readonly EmergencyNumber[] = [
  { id: 'us', region: 'United States', number: '911' },
  { id: 'uk', region: 'United Kingdom', number: '999' },
  { id: 'eu', region: 'European Union', number: '112' }
] as const;
