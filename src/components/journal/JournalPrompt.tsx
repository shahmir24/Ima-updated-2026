import React, { useId } from 'react';
import { Textarea } from '@/components/ui/textarea';

interface JournalPromptProps {
  /** The question, without the decorative emoji. */
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
  /** While today's entry loads: visible and focusable, not yet editable. */
  readOnly?: boolean;
}

/**
 * One journal question and its writing area.
 *
 * The label is tied to the textarea by a generated id, so each writing area
 * is announced with its question, and two prompts on a page can never share
 * an id. The ✍️ is decoration and is hidden from screen readers; on screen
 * the label reads exactly as before.
 */
export const JournalPrompt = ({ label, value, onChange, placeholder, readOnly = false }: JournalPromptProps) => {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="text-white/90 text-sm block mb-2 lg:text-base">
        <span aria-hidden="true">✍️ </span>
        {label}
      </label>
      <Textarea
        id={id}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        readOnly={readOnly}
        aria-busy={readOnly || undefined}
        className="bg-secondary/60 border-white/20 text-white placeholder:text-white/50 min-h-[120px] lg:min-h-[10rem] lg:text-base"
      />
    </div>
  );
};

/**
 * The questions of one screen. Stacked, as on phones; `columns={2}` puts two
 * parallel questions side by side from xl, where each column is still wide
 * enough to write in.
 */
export const JournalPromptGroup = ({ columns = 1, children }: { columns?: 1 | 2; children: React.ReactNode }) => (
  <div className={columns === 2 ? 'space-y-4 xl:grid xl:grid-cols-2 xl:gap-6 xl:space-y-0' : 'space-y-4'}>{children}</div>
);

export default JournalPrompt;
