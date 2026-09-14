
import React, { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import { useJournalHistory, JOURNAL_HISTORY_LIMIT, type JournalEntryRow } from '@/hooks/use-journal';
import { journalTypeTitle, readJournalAnswers } from '@/lib/journal-types';

/**
 * Supabase rejects with a PostgrestError — a plain object with a `message`,
 * not an Error instance — so `instanceof Error` alone would silently swallow
 * the only useful part of a failure.
 */
function errorMessage(cause: unknown): string | null {
  if (cause instanceof Error) return cause.message;
  if (cause && typeof cause === 'object' && 'message' in cause) {
    const message = (cause as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message;
  }
  return null;
}

/**
 * The user's own locale and timezone, not the server's. A journal entry is
 * anchored to the moment it was written, so it has to read back in the same
 * clock the user wrote it in.
 */
function formatWrittenAt(createdAt: string): string {
  const written = new Date(createdAt);
  if (Number.isNaN(written.getTime())) return createdAt;
  return written.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

const JournalHistory = () => {
  const { data: entries, isFetched, isError, error } = useJournalHistory();

  // One open entry at a time: the list is the point, and it keeps the screen
  // from turning into a wall of text.
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const renderEntry = (entry: JournalEntryRow) => {
    const answers = readJournalAnswers(entry.entry_type, entry.responses);
    const isExpanded = expandedId === entry.id;

    return (
      <button
        key={entry.id}
        type="button"
        onClick={() => setExpandedId(isExpanded ? null : entry.id)}
        aria-expanded={isExpanded}
        className="w-full text-left bg-secondary/40 rounded-3xl p-6 hover:bg-secondary/60 transition-all duration-300 card-hover"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-semibold text-white">{journalTypeTitle(entry.entry_type)}</h3>
            <p className="text-white/50 text-xs mt-1">{formatWrittenAt(entry.created_at)}</p>

            {!isExpanded && (
              <p className="text-white/70 text-sm mt-3 leading-relaxed line-clamp-2 break-words">
                {answers.length > 0 ? (
                  answers[0].answer
                ) : (
                  <span className="italic text-white/40">This entry was left blank.</span>
                )}
              </p>
            )}
          </div>

          <ChevronDown
            className={`h-5 w-5 text-white/40 shrink-0 transition-transform duration-300 ${
              isExpanded ? 'rotate-180' : ''
            }`}
          />
        </div>

        {isExpanded && (
          <div className="mt-4 pt-4 border-t border-white/10 space-y-4">
            {answers.length > 0 ? (
              answers.map((answer) => (
                <div key={answer.key}>
                  <p className="text-white/50 text-xs mb-1">{answer.question}</p>
                  <p className="text-white/90 text-sm leading-relaxed whitespace-pre-wrap break-words">
                    {answer.answer}
                  </p>
                </div>
              ))
            ) : (
              <p className="text-white/40 text-sm italic">
                Nothing was written in this entry.
              </p>
            )}
          </div>
        )}
      </button>
    );
  };

  const renderBody = () => {
    if (!isFetched) {
      return <p className="text-white/50 text-sm text-center py-10">Loading your entries…</p>;
    }

    if (isError) {
      return (
        <div className="bg-secondary/40 rounded-3xl p-6 text-center">
          <p className="text-white/90 text-sm mb-2">We couldn’t load your entries.</p>
          <p className="text-white/50 text-xs">
            {errorMessage(error) ?? 'Please try again in a moment.'}
          </p>
        </div>
      );
    }

    const rows = entries ?? [];

    if (rows.length === 0) {
      return (
        <div className="bg-secondary/40 rounded-3xl p-6 text-center">
          <p className="text-white/90 text-sm mb-2">No entries yet.</p>
          <p className="text-white/50 text-xs">
            Anything you write in a journal will show up here.
          </p>
        </div>
      );
    }

    return (
      <>
        {rows.map(renderEntry)}

        {/* Only shown when the cap is actually hit, so it is never a claim
            about something the user cannot see. */}
        {rows.length === JOURNAL_HISTORY_LIMIT && (
          <p className="text-white/40 text-xs text-center pt-2">
            Showing your {JOURNAL_HISTORY_LIMIT} most recent entries.
          </p>
        )}
      </>
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Past Entries" backPath="/journaling" />

      <main className="flex-1 max-w-lg w-full mx-auto px-4 space-y-4">{renderBody()}</main>

      <BottomNavigation />
    </div>
  );
};

export default JournalHistory;
