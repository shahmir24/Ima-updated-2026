import { describe, expect, it, vi } from 'vitest';

// No network: the Supabase client must never be reached from these tests.
vi.mock('@/integrations/supabase/client', () => ({
  supabase: new Proxy({}, { get: () => { throw new Error('Supabase must not be reached'); } })
}));

import { saveTimezoneBestEffort } from './use-user-settings';

describe('saveTimezoneBestEffort — the Notifications card’s separate time zone save', () => {
  it('writes only the time zone, and reports success', async () => {
    const save = vi.fn(async () => ({}));
    expect(await saveTimezoneBestEffort(save, 'Asia/Karachi')).toBe(true);
    expect(save).toHaveBeenCalledWith({ timezone: 'Asia/Karachi' });
  });

  it('a rejected save (a zone the database refuses) resolves false and never rejects', async () => {
    const save = vi.fn(async () => {
      throw new Error('Unknown time zone: Mars/Olympus');
    });
    await expect(saveTimezoneBestEffort(save, 'Mars/Olympus')).resolves.toBe(false);
  });

  it('a save that throws synchronously resolves false too', async () => {
    const save = vi.fn(() => {
      throw new Error('boom');
    });
    await expect(saveTimezoneBestEffort(save, 'UTC')).resolves.toBe(false);
  });
});
