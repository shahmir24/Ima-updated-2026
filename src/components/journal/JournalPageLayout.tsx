import React from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Save, type LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import BottomNavigation from '@/components/productivity/BottomNavigation';

/**
 * The shared frame of the six journal screens.
 *
 * Phones get exactly the markup the screens always had (header, a max-w-lg
 * card, a centred intro, the questions, a full-width save button); every
 * class added here is lg- or xl-only. On desktop the page becomes a left-
 * aligned writing column of about 640–680px, wide enough to write in and
 * narrow enough to keep lines readable.
 *
 * Layout only: each page keeps its own words, its own fields and its own
 * useJournalEntryForm call, so loading, saving and validation are untouched.
 */

/**
 *   standard — one writing column (≈656px writing areas).
 *   narrow   — Morning Intention's single short answer.
 *   pair     — two parallel questions, side by side from xl.
 */
export type JournalWidth = 'standard' | 'narrow' | 'pair';

const WIDTH: Record<JournalWidth, string> = {
  standard: 'lg:max-w-3xl',
  narrow: 'lg:max-w-2xl',
  pair: 'lg:max-w-3xl xl:max-w-5xl'
};

interface JournalPageLayoutProps {
  /** The page title, as the journal menu names it. */
  title: string;
  backPath: string;
  /** Accessible name of the back button: where it goes. */
  backLabel: string;
  icon: LucideIcon;
  /** Tile and icon colours, e.g. 'bg-orange-500/20' and 'text-orange-300'. */
  iconTile: string;
  iconColor: string;
  cardTitle: string;
  /** The prompt's opening lines. */
  intro: React.ReactNode;
  width?: JournalWidth;
  /** Spacing between the card's sections, as each screen always had it. */
  contentSpacing?: 'space-y-4' | 'space-y-6';
  /** The questions, then any closing line. */
  children: React.ReactNode;
  action: React.ReactNode;
}

const JournalPageLayout = ({
  title,
  backPath,
  backLabel,
  icon: Icon,
  iconTile,
  iconColor,
  cardTitle,
  intro,
  width = 'standard',
  contentSpacing = 'space-y-6',
  children,
  action
}: JournalPageLayoutProps) => {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-10">
      {/* The Wellness header's markup, with the title left beside the back
          arrow on desktop. Kept here rather than changing WellnessHeader,
          which eighteen other screens share. */}
      <header className={`w-full max-w-lg mx-auto p-4 flex items-center justify-between lg:justify-start lg:gap-3 lg:px-8 ${WIDTH[width]}`}>
        <Button
          variant="ghost"
          size="icon"
          onClick={() => navigate(backPath)}
          aria-label={backLabel}
          className="h-11 w-11 rounded-full p-0 hover:bg-white/10"
        >
          <ArrowLeft className="h-6 w-6 text-white" />
        </Button>

        <h1 className="text-2xl font-bold text-white lg:text-3xl">{title}</h1>

        <div className="w-10 lg:hidden"></div>
      </header>

      <main className={`flex-1 max-w-lg w-full mx-auto px-4 space-y-6 lg:px-8 ${WIDTH[width]}`}>
        <Card className="bg-secondary/40 border-0">
          <CardHeader className="text-center lg:flex-row lg:items-center lg:gap-4 lg:space-y-0 lg:text-left">
            <div className={`w-16 h-16 rounded-2xl ${iconTile} flex items-center justify-center mx-auto mb-4 lg:mx-0 lg:mb-0 lg:h-14 lg:w-14 lg:shrink-0`}>
              <Icon className={`h-8 w-8 ${iconColor}`} />
            </div>
            <CardTitle className="text-white text-xl lg:text-2xl">{cardTitle}</CardTitle>
          </CardHeader>
          <CardContent className={contentSpacing}>
            <div className="text-white/80 space-y-3 text-center lg:text-left">{intro}</div>
            {children}
            {action}
          </CardContent>
        </Card>
      </main>

      <BottomNavigation />
    </div>
  );
};

/**
 * Save button colours. Dark text, not white: white on these 500 shades
 * measured 1.9–3.7:1, below WCAG AA's 4.5:1 for text this size. The hover
 * shade goes lighter rather than darker so the text keeps its contrast.
 */
const SAVE_TONE = {
  orange: 'bg-orange-500 hover:bg-orange-400',
  blue: 'bg-blue-500 hover:bg-blue-400',
  green: 'bg-green-500 hover:bg-green-400',
  yellow: 'bg-yellow-500 hover:bg-yellow-400',
  pink: 'bg-pink-500 hover:bg-pink-400'
} as const;

interface JournalSaveButtonProps {
  tone: keyof typeof SAVE_TONE;
  onClick: () => void;
  disabled: boolean;
  /** Shown while the entry is being written. */
  saving: boolean;
  label: string;
}

/** Full width on phones, as before; on desktop a right-aligned button. */
export const JournalSaveButton = ({ tone, onClick, disabled, saving, label }: JournalSaveButtonProps) => (
  <Button
    onClick={onClick}
    disabled={disabled}
    className={`w-full h-12 ${SAVE_TONE[tone]} text-slate-950 lg:ml-auto lg:flex lg:w-auto lg:min-w-[14rem]`}
  >
    <Save className="h-4 w-4 mr-2" />
    {saving ? 'Saving…' : label}
  </Button>
);

export default JournalPageLayout;
