import { describe, expect, it } from 'vitest';
import {
  instagramProfileUrl,
  mailtoHref,
  normalizeInstagramHandle,
  supportMessageHref,
  telHref
} from './safe-contact-links';

describe('Instagram handles', () => {
  it.each([
    ['sam.hype', 'sam.hype'],
    ['@sam_hype', 'sam_hype'],
    ['  @Sam  ', 'Sam'],
    ['instagram.com/sam', 'sam'],
    ['https://www.instagram.com/sam.hype/', 'sam.hype'],
    ['https://instagram.com/sam?igsh=abc', 'sam']
  ])('%s → %s', (raw, handle) => {
    expect(normalizeInstagramHandle(raw)).toBe(handle);
  });

  it.each(['', '   ', '@', 'sam hype', 'sam/../../evil', 'javascript:alert(1)', 'https://evil.example/sam', 'a'.repeat(31), null, undefined])(
    'rejects %j',
    (raw) => {
      expect(normalizeInstagramHandle(raw)).toBeNull();
      expect(instagramProfileUrl(raw)).toBeNull();
    }
  );

  it('always builds an instagram.com profile URL', () => {
    expect(instagramProfileUrl('@sam.hype')).toBe('https://www.instagram.com/sam.hype/');
  });
});

describe('phone and email links', () => {
  it('a phone number keeps only its digits and a leading +', () => {
    expect(telHref('+44 7700 900123')).toBe('tel:+447700900123');
    expect(telHref('(555) 010-2030')).toBe('tel:5550102030');
    expect(telHref('call me')).toBeNull();
    expect(telHref(null)).toBeNull();
  });

  it('an email must be one plain address', () => {
    expect(mailtoHref(' lee@example.com ')).toBe('mailto:lee@example.com');
    for (const bad of ['not-an-email', 'a@b', 'a@b.com?bcc=x@y.com', 'a@b.com&cc=x', 'two words@x.com', '']) {
      expect(mailtoHref(bad), bad).toBeNull();
    }
  });
});

describe('Support Message', () => {
  it('texts a phone number first, then falls back to email', () => {
    expect(supportMessageHref({ phone: '+44 7700', email: 'lee@example.com' })).toMatch(/^sms:\+447700\?body=Hey%2C/);
    expect(supportMessageHref({ phone: null, email: 'lee@example.com' })).toMatch(/^mailto:lee@example\.com\?subject=Need%20support&body=/);
  });

  it('has no link for an Instagram-only contact, so no dead button is shown', () => {
    expect(supportMessageHref({ phone: null, email: null })).toBeNull();
    expect(supportMessageHref({ phone: 'n/a', email: 'nope' })).toBeNull();
  });
});
