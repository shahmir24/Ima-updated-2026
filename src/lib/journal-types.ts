import type { JournalType } from '@/hooks/use-journal';

/**
 * What each journal type is called, and what each of its stored fields was
 * asking.
 *
 * `journal_entries.responses` is jsonb keyed by short camelCase names — a
 * history screen that printed `whatHappened` verbatim would be useless, and
 * the questions themselves live only as JSX labels inside the six journal
 * pages. This module is the one place that maps a stored key back to the
 * question it answers.
 *
 * The six pages deliberately still own their own copy of their labels. This
 * duplicates that wording, which is a real cost — but rewiring six working
 * screens buys the user nothing, so it is not part of this change. If a
 * question is reworded, both places need it.
 */
export interface JournalField {
  /** Key inside `journal_entries.responses`. */
  key: string;
  question: string;
}

export interface JournalTypeMeta {
  type: JournalType;
  /** The name the user tapped in the journaling menu. */
  title: string;
  /** Field order as the journal screen asks them, not as jsonb stores them. */
  fields: JournalField[];
}

export const JOURNAL_TYPE_META: Record<JournalType, JournalTypeMeta> = {
  'morning-intention': {
    type: 'morning-intention',
    title: 'Set the Tone',
    fields: [{ key: 'intention', question: 'How do you want to feel today?' }]
  },
  'daily-journal': {
    type: 'daily-journal',
    title: 'Where Am I, Really?',
    fields: [
      { key: 'onMind', question: "What's on your mind right now?" },
      { key: 'energy', question: "How's your energy — physically, emotionally, mentally?" },
      { key: 'letGoLeanIn', question: 'Is there anything you want to let go of, or lean into?' }
    ]
  },
  'post-panic': {
    type: 'post-panic',
    title: 'Name It to Tame It',
    fields: [
      { key: 'whatHappened', question: 'What just happened?' },
      { key: 'howItFelt', question: 'How did it make you feel — really?' },
      { key: 'whatNeeded', question: 'What do you need right now?' }
    ]
  },
  'focus-reset': {
    type: 'focus-reset',
    title: 'Zoom In',
    fields: [
      { key: 'whatMatters', question: 'What actually matters right now?' },
      { key: 'justNoise', question: "What's just noise?" }
    ]
  },
  gratitude: {
    type: 'gratitude',
    title: 'Tiny Wins, Soft Joys',
    fields: [
      { key: 'smile', question: 'What made you smile, even a little?' },
      { key: 'warmth', question: 'What felt safe, sweet, or warm today?' }
    ]
  },
  'body-double': {
    type: 'body-double',
    title: 'Body Double Session',
    fields: [
      { key: 'didWell', question: 'What went well?' },
      { key: 'toImprove', question: 'What would I like to improve?' }
    ]
  },
  'sensory-checkin': {
    type: 'sensory-checkin',
    title: 'Come Back to Your Body',
    fields: [
      { key: 'sensations', question: 'What sensations are you noticing right now?' },
      { key: 'bodyAwareness', question: 'Where do you feel tight, light, heavy, warm, or buzzy?' },
      { key: 'softenSpot', question: 'Can you soften just one spot?' }
    ]
  }
};

/**
 * The column is plain `text`, so a row could in principle hold a type this
 * build does not know. Showing the raw id beats showing nothing.
 */
export function journalTypeTitle(entryType: string): string {
  return JOURNAL_TYPE_META[entryType as JournalType]?.title ?? entryType;
}

export interface JournalAnswer {
  key: string;
  question: string;
  answer: string;
}

/**
 * The non-empty answers in an entry, in the order the screen asked them.
 *
 * One function serves both the list excerpt (the first answer) and the
 * expanded entry (all of them), so the two can never disagree about which
 * answer comes first. Nothing in the database guarantees the shape of
 * `responses`, so anything missing, blank or not a string is skipped; an
 * unrecognised type falls back to whatever keys the row itself carries.
 */
export function readJournalAnswers(entryType: string, responses: unknown): JournalAnswer[] {
  const source =
    responses && typeof responses === 'object' && !Array.isArray(responses)
      ? (responses as Record<string, unknown>)
      : {};

  const meta = JOURNAL_TYPE_META[entryType as JournalType];
  const fields: JournalField[] = meta
    ? meta.fields
    : Object.keys(source).map((key) => ({ key, question: key }));

  const answers: JournalAnswer[] = [];
  for (const field of fields) {
    const value = source[field.key];
    if (typeof value !== 'string') continue;
    const answer = value.trim();
    if (!answer) continue;
    answers.push({ key: field.key, question: field.question, answer });
  }
  return answers;
}
