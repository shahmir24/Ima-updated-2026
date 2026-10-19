/**
 * Desktop only: wraps the shared WellnessHeader so its row takes the same
 * width and side padding as the `.responsive-container` below it, and the
 * back button lines up with the cards. Applied from outside so WellnessHeader
 * itself, used by many other screens, is unchanged. Phones are untouched.
 */
export const SAFE_SPACE_HEADER_ALIGN = 'lg:[&>header]:max-w-xl xl:[&>header]:max-w-2xl lg:[&>header]:px-8';
