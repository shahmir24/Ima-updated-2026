
import React, { useState } from 'react';
import { Plus, Heart, Phone, MessageCircle, Mail, Instagram, Trash2, Shield } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger
} from '@/components/ui/alert-dialog';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';
import EmergencyHelpDialog from '@/components/safe-space/EmergencyHelpDialog';
import { EMERGENCY_NUMBERS } from '@/lib/emergency-contacts';
import {
  useSafeContacts,
  useCreateSafeContact,
  useDeleteSafeContact,
  hasContactMethod,
  type SafeContactRow
} from '@/hooks/use-safe-contacts';

const SafeContacts = () => {
  const [showAddForm, setShowAddForm] = useState(false);
  const [emergencyHelpOpen, setEmergencyHelpOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [newContact, setNewContact] = useState({
    name: '',
    label: '',
    phone: '',
    email: '',
    instagram: '',
    note: ''
  });

  // The user's own circle lives in safe_contacts, scoped to them by RLS.
  // The emergency numbers above are static app data and are deliberately NOT
  // written to that table: they are not this user's people, they are the same
  // for everyone, and they must never be deletable.
  const { data: contacts = [], isPending, isError, error, refetch } = useSafeContacts();
  const createContact = useCreateSafeContact();
  const deleteContact = useDeleteSafeContact();

  const predefinedLabels = [
    'Panic Pal',
    'Body Double',
    'Hype Friend',
    'Therapist',
    'Family',
    'Crisis Support',
    'Accountability Buddy'
  ];

  const handleAddContact = async () => {
    setFormError(null);

    if (!newContact.name.trim()) {
      setFormError('Give this person a name first.');
      return;
    }

    // Mirrors the safe_contacts_reachable CHECK. Caught here so the user gets
    // a sentence rather than a constraint violation.
    if (!hasContactMethod(newContact)) {
      setFormError('Add a phone number, email or Instagram handle so you can actually reach them.');
      return;
    }

    try {
      await createContact.mutateAsync(newContact);
      // Reset only after a confirmed write, so a failure keeps what was typed.
      setNewContact({ name: '', label: '', phone: '', email: '', instagram: '', note: '' });
      setShowAddForm(false);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Could not save this contact.');
    }
  };

  const handleCall = (phone: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleSendSupportMessage = (contact: SafeContactRow) => {
    const message = "Hey, I could use some support right now. Are you available to chat?";

    if (contact.phone) {
      window.location.href = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
    } else if (contact.email) {
      window.location.href = `mailto:${contact.email}?subject=Need Support&body=${encodeURIComponent(message)}`;
    }
  };

  const mutationError = createContact.error || deleteContact.error;

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Safe Contacts" backPath="/safe-space" />

      <main className="flex-1 responsive-container space-y-6">
        {/* ---------------------------------------------------------------
            A. Emergency & Support — static app data, always here, never
            deletable, and never mixed into the user's own contacts.
            --------------------------------------------------------------- */}
        <section className="space-y-3">
          <div className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-300" />
            <h2 className="text-white responsive-subtitle font-semibold">Emergency &amp; Support</h2>
          </div>

          <div className="bg-red-500/20 border border-red-500/30 rounded-3xl p-4">
            <p className="text-red-300 responsive-body text-center">
              If you are in immediate danger, call emergency services or go to your
              nearest emergency room. iMA cannot contact them for you.
            </p>
          </div>

          {EMERGENCY_NUMBERS.map((entry) => (
            <div key={entry.id} className="bg-secondary/40 rounded-3xl p-4 sm:p-6">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-white/70 text-sm">{entry.region}</p>
                  {/* The number is always visible, before any call is possible,
                      and stays readable on a device that cannot dial. */}
                  <p className="text-white select-text text-2xl font-semibold tracking-wide">
                    {entry.number}
                  </p>
                </div>
                <Button
                  onClick={() => setEmergencyHelpOpen(true)}
                  aria-label={`Emergency numbers, including ${entry.number} for ${entry.region}`}
                  className="bg-red-500/20 hover:bg-red-500/30 border border-red-500/50 text-red-300"
                >
                  <Phone className="h-4 w-4 mr-1" />
                  Call
                </Button>
              </div>
            </div>
          ))}
        </section>

        {/* ---------------------------------------------------------------
            B. My Safe Contacts — the user's own people, from Supabase.
            --------------------------------------------------------------- */}
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <Heart className="h-5 w-5 text-purple-300" />
            <h2 className="text-white responsive-subtitle font-semibold">My Safe Contacts</h2>
          </div>

          {mutationError && (
            <p className="text-red-300 text-sm text-center">
              {(mutationError as Error).message}
            </p>
          )}

          {isPending && (
            <p className="text-white/60 text-sm text-center py-6">Loading your circle…</p>
          )}

          {isError && (
            <div className="text-center py-6 space-y-3">
              <p className="text-red-300 text-sm">
                {(error as Error)?.message || 'Could not load your safe contacts.'}
              </p>
              <Button
                onClick={() => refetch()}
                className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-2xl"
              >
                Try again
              </Button>
            </div>
          )}

          {/* Welcome Message */}
          {!isPending && !isError && contacts.length === 0 && !showAddForm && (
            <div className="bg-gradient-to-r from-purple-500/20 to-pink-500/20 rounded-3xl p-6 text-center">
              <Heart className="h-12 w-12 text-purple-300 mx-auto mb-4" />
              <h3 className="text-white responsive-subtitle font-semibold mb-2">
                Build Your Support Circle
              </h3>
              <p className="text-white/70 responsive-body leading-relaxed">
                Add the people who make you feel safe and supported. They're just a tap away when you need them.
              </p>
            </div>
          )}

          {/* Add Contact Button */}
          {!showAddForm && (
            <Button
              onClick={() => setShowAddForm(true)}
              className="w-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 p-4 rounded-2xl"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Someone to Your Circle
            </Button>
          )}

          {/* Add Contact Form */}
          {showAddForm && (
            <div className="bg-secondary/40 rounded-3xl p-6 space-y-4 animate-fade-in">
              <h3 className="text-white responsive-subtitle font-semibold mb-4">Add a Safe Contact</h3>

              <div className="space-y-4">
                <Input
                  placeholder="Their name"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <div className="grid grid-cols-2 gap-2">
                  {predefinedLabels.map((label) => (
                    <Button
                      key={label}
                      onClick={() => setNewContact({ ...newContact, label })}
                      variant={newContact.label === label ? "default" : "outline"}
                      size="sm"
                      className={`text-xs ${
                        newContact.label === label
                          ? 'bg-purple-500 text-white'
                          : 'bg-secondary/20 border-secondary/40 text-white/70 hover:bg-secondary/40'
                      }`}
                    >
                      {label}
                    </Button>
                  ))}
                </div>

                <Input
                  placeholder="Custom label (optional)"
                  value={newContact.label}
                  onChange={(e) => setNewContact({ ...newContact, label: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <Input
                  placeholder="Phone number"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <Input
                  placeholder="Email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <Input
                  placeholder="Instagram handle"
                  value={newContact.instagram}
                  onChange={(e) => setNewContact({ ...newContact, instagram: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <p className="text-white/50 text-xs">
                  Add at least one of phone, email or Instagram so you can reach them.
                </p>

                <Textarea
                  placeholder="Personal note about this person (e.g., 'This is who I go to when I feel overwhelmed')"
                  value={newContact.note}
                  onChange={(e) => setNewContact({ ...newContact, note: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                  rows={3}
                />
              </div>

              {formError && <p className="text-red-300 text-sm">{formError}</p>}

              <div className="flex space-x-3">
                <Button
                  onClick={handleAddContact}
                  disabled={createContact.isPending}
                  className="flex-1 bg-green-500 hover:bg-green-600 text-white disabled:opacity-60"
                >
                  {createContact.isPending ? 'Saving…' : 'Add to Circle'}
                </Button>
                <Button
                  onClick={() => {
                    setShowAddForm(false);
                    setFormError(null);
                  }}
                  variant="outline"
                  className="bg-secondary/20 border-secondary/40 text-white/70 hover:bg-secondary/40"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}

          {/* Contacts List */}
          <div className="space-y-4">
            {contacts.map((contact, index) => (
              <div
                key={contact.id}
                className="bg-secondary/40 rounded-3xl p-6 animate-fade-in"
                style={{ animationDelay: `${index * 0.1}s` }}
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1">
                    <div className="flex items-center space-x-3 mb-2">
                      <div className="w-10 h-10 bg-purple-500/20 rounded-full flex items-center justify-center">
                        <Heart className="h-5 w-5 text-purple-300" />
                      </div>
                      <div>
                        <h3 className="text-white responsive-subtitle font-semibold">{contact.name}</h3>
                        <p className="text-purple-300 text-sm">{contact.label}</p>
                      </div>
                    </div>

                    {contact.note && (
                      <p className="text-white/70 text-sm italic mb-3 pl-13">
                        "{contact.note}"
                      </p>
                    )}
                  </div>

                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        disabled={deleteContact.isPending}
                        aria-label={`Remove ${contact.name} from your circle`}
                        className="h-10 w-10 rounded-full text-white/60 hover:text-white hover:bg-white/10"
                      >
                        <Trash2 className="h-5 w-5" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Remove {contact.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                          They will be taken out of your support circle. You can add them
                          again at any time.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => deleteContact.mutate(contact.id)}>
                          Remove
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>

                {/* Quick Actions */}
                <div className="flex space-x-2">
                  {contact.phone && (
                    <Button
                      onClick={() => handleCall(contact.phone!)}
                      size="sm"
                      className="bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-300 flex-1"
                    >
                      <Phone className="h-4 w-4 mr-1" />
                      Call
                    </Button>
                  )}

                  <Button
                    onClick={() => handleSendSupportMessage(contact)}
                    size="sm"
                    className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 flex-1"
                  >
                    <MessageCircle className="h-4 w-4 mr-1" />
                    Support Message
                  </Button>

                  {contact.email && (
                    <Button
                      onClick={() => window.location.href = `mailto:${contact.email}`}
                      size="sm"
                      className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-300"
                    >
                      <Mail className="h-4 w-4" />
                    </Button>
                  )}

                  {contact.instagram && (
                    <Button
                      onClick={() => window.open(`https://instagram.com/${contact.instagram}`, '_blank')}
                      size="sm"
                      className="bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/50 text-pink-300"
                    >
                      <Instagram className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Encouragement */}
          {contacts.length > 0 && (
            <div className="bg-gradient-to-r from-green-500/20 to-blue-500/20 rounded-3xl p-6 text-center">
              <p className="text-white/80 italic responsive-subtitle mb-2">
                "You are surrounded by love and support."
              </p>
              <p className="text-white/50 responsive-body">— Your Safe Circle</p>
            </div>
          )}
        </section>
      </main>

      <EmergencyHelpDialog open={emergencyHelpOpen} onOpenChange={setEmergencyHelpOpen} />

      <BottomNavigation />
    </div>
  );
};

export default SafeContacts;
