/**
 * Links built from a safe contact's details.
 *
 * Phone, email and Instagram are free text typed by the user, so nothing here
 * pastes them into a URL as they are: each is reduced to what its link can
 * safely carry, and a value that cannot make a working link gives null — the
 * button for it is then not shown, rather than shown and doing nothing.
 */

const SUPPORT_MESSAGE = 'Hey, I could use some support right now. Are you available to chat?';

/** Instagram usernames: letters, digits, full stops and underscores, at most 30. */
const INSTAGRAM_HANDLE = /^[A-Za-z0-9._]{1,30}$/;

/**
 * "@name", "name", "instagram.com/name" or a full profile URL → "name".
 * Anything that is not a plausible username gives null.
 */
export function normalizeInstagramHandle(raw: string | null | undefined): string | null {
  let value = (raw ?? '').trim();
  if (!value) return null;

  const url = value.match(/^(?:https?:\/\/)?(?:www\.)?instagram\.com\/([^/?#]+)\/?(?:[?#].*)?$/i);
  if (url) value = url[1];
  value = value.replace(/^@/, '');

  return INSTAGRAM_HANDLE.test(value) ? value : null;
}

export function instagramProfileUrl(raw: string | null | undefined): string | null {
  const handle = normalizeInstagramHandle(raw);
  return handle ? `https://www.instagram.com/${encodeURIComponent(handle)}/` : null;
}

/** Keeps only what a dialler understands: digits, and a leading +. */
function dialable(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  const digits = value.replace(/\D/g, '');
  if (!digits) return null;
  return value.startsWith('+') ? `+${digits}` : digits;
}

export function telHref(phone: string | null | undefined): string | null {
  const number = dialable(phone);
  return number ? `tel:${number}` : null;
}

/** Rejects anything that is not one plain address, so it cannot add headers to the link. */
function plainEmail(raw: string | null | undefined): string | null {
  const value = (raw ?? '').trim();
  return /^[^\s@?&#/:]+@[^\s@?&#/:]+\.[^\s@?&#/:]+$/.test(value) ? value : null;
}

export function mailtoHref(email: string | null | undefined): string | null {
  const address = plainEmail(email);
  return address ? `mailto:${address}` : null;
}

/**
 * The "Support Message" link: a text when there is a phone number, otherwise
 * an email. Instagram has no link that pre-fills a message, so a contact with
 * only Instagram gets null here and keeps just the Instagram button.
 */
export function supportMessageHref(contact: { phone?: string | null; email?: string | null }): string | null {
  const number = dialable(contact.phone);
  if (number) return `sms:${number}?body=${encodeURIComponent(SUPPORT_MESSAGE)}`;
  const address = plainEmail(contact.email);
  if (address) {
    return `mailto:${address}?subject=${encodeURIComponent('Need support')}&body=${encodeURIComponent(SUPPORT_MESSAGE)}`;
  }
  return null;
}
