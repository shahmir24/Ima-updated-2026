import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart } from 'lucide-react';
import JournalPageLayout, { JournalSaveButton } from '@/components/journal/JournalPageLayout';
import { JournalPrompt, JournalPromptGroup } from '@/components/journal/JournalPrompt';
import { useJournalEntryForm } from '@/hooks/use-journal';

const SensoryCheckIn = () => {
  const navigate = useNavigate();
  // Today's entry for this journal type, loaded from Supabase so the
  // writing comes back after a refresh. The shape below is exactly what
  // journal_entries.responses stores for 'sensory-checkin'.
  const journal = useJournalEntryForm('sensory-checkin', { sensations: '', bodyAwareness: '', softenSpot: '' });
  const { sensations, bodyAwareness, softenSpot } = journal.values;

  const handleSave = async () => {
    // Navigate only once the write has landed, so a failure leaves the
    // page (and what was written) intact instead of discarding it.
    if ((await journal.save()) === 'saved') navigate('/journaling');
  };

  return (
    <JournalPageLayout
      title="Come Back to Your Body"
      backPath="/journaling"
      backLabel="Back to Journaling"
      icon={Heart}
      iconTile="bg-pink-500/20"
      iconColor="text-pink-300"
      cardTitle="Sensory Check-In"
      intro={
        <>
          <p>"Let's do a little body roll call."</p>
          <p className="text-sm">You've been carrying a lot — maybe without even noticing.</p>
        </>
      }
      action={
        <JournalSaveButton
          tone="pink"
          onClick={handleSave}
          disabled={journal.isBusy}
          saving={journal.isSaving}
          label="Save Check-In"
        />
      }
    >
      <JournalPromptGroup>
        <JournalPrompt
          label="What sensations are you noticing right now?"
          value={sensations}
          onChange={(value) => journal.setValue('sensations', value)}
          placeholder="Notice what you're feeling in your body..."
        />
        <JournalPrompt
          label="Where do you feel tight, light, heavy, warm, or buzzy?"
          value={bodyAwareness}
          onChange={(value) => journal.setValue('bodyAwareness', value)}
          placeholder="Map your body's sensations..."
        />
        <JournalPrompt
          label="Can you soften just one spot?"
          value={softenSpot}
          onChange={(value) => journal.setValue('softenSpot', value)}
          placeholder="What would it feel like to soften..."
        />
      </JournalPromptGroup>

      <p className="text-white/70 text-sm text-center italic lg:text-left">
        This is your space. No pressure. Just presence.
      </p>
    </JournalPageLayout>
  );
};

export default SensoryCheckIn;
