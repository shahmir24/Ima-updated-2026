/**
 * Desktop placement for the app's bottom-sheet dialogs (task form, Quick
 * Capture). Phones keep the sheet exactly as it was; from `lg` the sheet
 * becomes a centred dialog with all corners rounded.
 *
 * The overlay still covers the whole window, but from `lg` its left padding
 * clears the desktop sidebar (DesktopSidebar is `lg:w-64`), so the dialog is
 * centred in the workspace beside the sidebar rather than in the window.
 */
export const DESKTOP_DIALOG_OVERLAY = 'lg:items-center lg:justify-center lg:py-8 lg:pr-8 lg:pl-[calc(16rem+2rem)]';

/** From `lg`: a floating panel that scrolls inside the overlay instead of a sheet glued to the bottom. */
export const DESKTOP_DIALOG_PANEL = 'lg:mx-0 lg:min-h-0 lg:max-h-full lg:overflow-y-auto lg:rounded-3xl lg:border lg:border-border lg:shadow-2xl';
