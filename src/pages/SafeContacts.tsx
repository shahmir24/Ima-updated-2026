
import React, { useId, useState } from 'react';
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
import { SAFE_SPACE_HEADER_ALIGN } from '@/components/safe-space/layout';
import { EMERGENCY_NUMBERS } from '@/lib/emergency-contacts';
import {
  useSafeContacts,
  useCreateSafeContact,
  useDeleteSafeContact,
  contactInputProblem,
  SAFE_CONTACT_MESSAGE_LIST
} from '@/hooks/use-safe-contacts';
import { friendlySafeContactsError } from '@/lib/safe-contacts-errors';
import { instagramProfileUrl, mailtoHref, supportMessageHref, telHref } from '@/lib/safe-contact-links';

/**
 * Desktop only: on a wide card the text actions stop stretching to fill the
 * row and keep a comfortable fixed width instead. Phones keep flex-1.
 */
const DESKTOP_ACTION = 'lg:flex-none lg:min-w-[10rem]';

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
  const { data: contacts = [], isPending, isError, isSuccess, isFetching, error, refetch } = useSafeContacts();
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

  const fieldId = useId();
  const ids = {
    name: `${fieldId}-name`,
    label: `${fieldId}-label`,
    phone: `${fieldId}-phone`,
    email: `${fieldId}-email`,
    instagram: `${fieldId}-instagram`,
    note: `${fieldId}-note`,
    hint: `${fieldId}-hint`,
    error: `${fieldId}-error`
  };

  const handleAddContact = async () => {
    setFormError(null);

    // Adding is only offered once the list has loaded, so a person is never
    // added on top of a circle the screen could not show.
    if (!isSuccess) return;

    // Mirrors the safe_contacts_reachable CHECK, and also turns away a phone,
    // email or handle that could not make a working link.
    const problem = contactInputProblem(newContact);
    if (problem) {
      setFormError(problem);
      return;
    }

    try {
      await createContact.mutateAsync(newContact);
      // Reset only after a confirmed write, so a failure keeps what was typed.
      setNewContact({ name: '', label: '', phone: '', email: '', instagram: '', note: '' });
      setShowAddForm(false);
    } catch (err) {
      setFormError(friendlySafeContactsError(err, 'add', SAFE_CONTACT_MESSAGE_LIST));
    }
  };

  // Every link below is built from the stored text by safe-contact-links, and
  // a button is shown only when its link would actually work.
  const openLink = (href: string) => {
    window.location.href = href;
  };

  const openInstagram = (url: string) => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20 lg:pb-8">
      <div className={SAFE_SPACE_HEADER_ALIGN}>
        <WellnessHeader title="Safe Contacts" backPath="/safe-space" />
      </div>

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

          {/* A failed removal. Adding reports inside the form instead, next to
              what was typed. Never the database's own text. */}
          {deleteContact.isError && (
            <p role="alert" className="text-red-300 text-sm text-center">
              {friendlySafeContactsError(deleteContact.error, 'remove', SAFE_CONTACT_MESSAGE_LIST)}
            </p>
          )}

          {isPending && (
            <p role="status" className="text-white/60 text-sm text-center py-6">Loading your circle…</p>
          )}

          {isError && (
            <div className="text-center py-6 space-y-3">
              <p role="alert" className="text-red-300 text-sm">
                {friendlySafeContactsError(error, 'load', SAFE_CONTACT_MESSAGE_LIST)}
              </p>
              <Button
                onClick={() => refetch()}
                disabled={isFetching}
                className="bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 rounded-2xl disabled:opacity-60"
              >
                {isFetching ? 'Trying again…' : 'Try again'}
              </Button>
            </div>
          )}

          {/* Welcome Message */}
          {isSuccess && contacts.length === 0 && !showAddForm && (
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

          {/* Add Contact Button — only once the list has loaded */}
          {isSuccess && !showAddForm && (
            <Button
              onClick={() => {
                // A new add starts clean: an old "nobody was removed" message
                // no longer describes what the user is doing.
                deleteContact.reset();
                setShowAddForm(true);
              }}
              className="w-full bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 p-4 rounded-2xl"
            >
              <Plus className="h-5 w-5 mr-2" />
              Add Someone to Your Circle
            </Button>
          )}

          {/* Add Contact Form */}
          {isSuccess && showAddForm && (
            <div className="bg-secondary/40 rounded-3xl p-6 space-y-4 animate-fade-in">
              <h3 className="text-white responsive-subtitle font-semibold mb-4">Add a Safe Contact</h3>

              <div className="space-y-4">
                <label htmlFor={ids.name} className="sr-only">Name</label>
                <Input
                  id={ids.name}
                  placeholder="Their name"
                  value={newContact.name}
                  onChange={(e) => setNewContact({ ...newContact, name: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <div role="group" aria-label="Suggested labels" className="grid grid-cols-2 gap-2">
                  {predefinedLabels.map((label) => (
                    <Button
                      key={label}
                      type="button"
                      aria-pressed={newContact.label === label}
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

                <label htmlFor={ids.label} className="sr-only">Label (optional)</label>
                <Input
                  id={ids.label}
                  placeholder="Custom label (optional)"
                  value={newContact.label}
                  onChange={(e) => setNewContact({ ...newContact, label: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <label htmlFor={ids.phone} className="sr-only">Phone number</label>
                <Input
                  id={ids.phone}
                  type="tel"
                  inputMode="tel"
                  aria-describedby={ids.hint}
                  placeholder="Phone number"
                  value={newContact.phone}
                  onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <label htmlFor={ids.email} className="sr-only">Email</label>
                <Input
                  id={ids.email}
                  type="email"
                  aria-describedby={ids.hint}
                  placeholder="Email"
                  value={newContact.email}
                  onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <label htmlFor={ids.instagram} className="sr-only">Instagram handle</label>
                <Input
                  id={ids.instagram}
                  aria-describedby={ids.hint}
                  placeholder="Instagram handle"
                  value={newContact.instagram}
                  onChange={(e) => setNewContact({ ...newContact, instagram: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                />

                <p id={ids.hint} className="text-white/50 text-xs">
                  Add at least one of phone, email or Instagram so you can reach them.
                </p>

                <label htmlFor={ids.note} className="sr-only">Personal note (optional)</label>
                <Textarea
                  id={ids.note}
                  placeholder="Personal note about this person (e.g., 'This is who I go to when I feel overwhelmed')"
                  value={newContact.note}
                  onChange={(e) => setNewContact({ ...newContact, note: e.target.value })}
                  className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                  rows={3}
                />
              </div>

              {formError && (
                <p id={ids.error} role="alert" className="text-red-300 text-sm">
                  {formError}
                </p>
              )}

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
                    createContact.reset();
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
            {contacts.map((contact, index) => {
              const callHref = telHref(contact.phone);
              const supportHref = supportMessageHref(contact);
              const emailHref = mailtoHref(contact.email);
              const instagramUrl = instagramProfileUrl(contact.instagram);
              // Instagram on its own gets a full-width labelled button, so the
              // card never ends with a lone icon and no obvious action.
              const instagramOnly = !callHref && !supportHref && !emailHref;
              const hasAction = Boolean(callHref || supportHref || emailHref || instagramUrl);
              return (
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
                          <Trash2 className="h-5 w-5" aria-hidden="true" />
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
                  {hasAction ? (
                    <div className="flex flex-wrap gap-2">
                      {/* Wraps instead of overflowing: four actions do not fit
                          one row on a phone. gap-2 keeps the old 8px spacing
                          between buttons, and between rows when they wrap. */}
                      {callHref && (
                        <Button
                          onClick={() => openLink(callHref)}
                          size="sm"
                          aria-label={`Call ${contact.name}`}
                          className={`bg-green-500/20 hover:bg-green-500/30 border border-green-500/50 text-green-300 flex-1 ${DESKTOP_ACTION}`}
                        >
                          <Phone className="h-4 w-4 mr-1" aria-hidden="true" />
                          Call
                        </Button>
                      )}

                      {supportHref && (
                        <Button
                          onClick={() => openLink(supportHref)}
                          size="sm"
                          aria-label={`Send ${contact.name} a support message`}
                          className={`bg-blue-500/20 hover:bg-blue-500/30 border border-blue-500/50 text-blue-300 flex-1 ${DESKTOP_ACTION}`}
                        >
                          <MessageCircle className="h-4 w-4 mr-1" aria-hidden="true" />
                          Support Message
                        </Button>
                      )}

                      {emailHref && (
                        <Button
                          onClick={() => openLink(emailHref)}
                          size="sm"
                          aria-label={`Email ${contact.name}`}
                          className="bg-orange-500/20 hover:bg-orange-500/30 border border-orange-500/50 text-orange-300"
                        >
                          <Mail className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      )}

                      {instagramUrl && (
                        <Button
                          onClick={() => openInstagram(instagramUrl)}
                          size="sm"
                          aria-label={`Open ${contact.name}’s Instagram (opens in a new tab)`}
                          className={`bg-pink-500/20 hover:bg-pink-500/30 border border-pink-500/50 text-pink-300 ${
                            instagramOnly ? `flex-1 ${DESKTOP_ACTION}` : ''
                          }`}
                        >
                          <Instagram className={`h-4 w-4 ${instagramOnly ? 'mr-1' : ''}`} aria-hidden="true" />
                          {instagramOnly && 'Instagram'}
                        </Button>
                      )}
                    </div>
                  ) : (
                    // Only possible for a contact saved before these checks
                    // existed, with details that cannot make a working link.
                    <p className="text-white/50 text-sm">
                      No working phone number, email or Instagram handle is saved for {contact.name}.
                    </p>
                  )}
                </div>
              );
            })}
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
