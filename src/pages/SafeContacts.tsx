
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Heart, Phone, MessageCircle, Edit3, Mail, Instagram } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import WellnessHeader from '@/components/wellness/WellnessHeader';
import BottomNavigation from '@/components/productivity/BottomNavigation';

interface Contact {
  id: string;
  name: string;
  label: string;
  phone?: string;
  email?: string;
  instagram?: string;
  note: string;
}

const SafeContacts = () => {
  const navigate = useNavigate();
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newContact, setNewContact] = useState({
    name: '',
    label: '',
    phone: '',
    email: '',
    instagram: '',
    note: ''
  });

  const predefinedLabels = [
    'Panic Pal',
    'Body Double',
    'Hype Friend',
    'Therapist',
    'Family',
    'Crisis Support',
    'Accountability Buddy'
  ];

  const handleAddContact = () => {
    if (newContact.name.trim()) {
      const contact: Contact = {
        id: Date.now().toString(),
        name: newContact.name,
        label: newContact.label || 'Support Person',
        phone: newContact.phone,
        email: newContact.email,
        instagram: newContact.instagram,
        note: newContact.note
      };
      
      setContacts([...contacts, contact]);
      setNewContact({ name: '', label: '', phone: '', email: '', instagram: '', note: '' });
      setShowAddForm(false);
    }
  };

  const handleCall = (phone: string) => {
    if (phone) {
      window.location.href = `tel:${phone}`;
    }
  };

  const handleSendSupportMessage = (contact: Contact) => {
    const message = "Hey, I could use some support right now. Are you available to chat?";
    
    if (contact.phone) {
      window.location.href = `sms:${contact.phone}?body=${encodeURIComponent(message)}`;
    } else if (contact.email) {
      window.location.href = `mailto:${contact.email}?subject=Need Support&body=${encodeURIComponent(message)}`;
    }
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-20">
      <WellnessHeader title="Safe Contacts" backPath="/safe-space" />

      <main className="flex-1 responsive-container space-y-6">
        {/* Welcome Message */}
        {contacts.length === 0 && !showAddForm && (
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
                placeholder="Phone number (optional)"
                value={newContact.phone}
                onChange={(e) => setNewContact({ ...newContact, phone: e.target.value })}
                className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
              />
              
              <Input
                placeholder="Email (optional)"
                value={newContact.email}
                onChange={(e) => setNewContact({ ...newContact, email: e.target.value })}
                className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
              />
              
              <Input
                placeholder="Instagram handle (optional)"
                value={newContact.instagram}
                onChange={(e) => setNewContact({ ...newContact, instagram: e.target.value })}
                className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
              />
              
              <Textarea
                placeholder="Personal note about this person (e.g., 'This is who I go to when I feel overwhelmed')"
                value={newContact.note}
                onChange={(e) => setNewContact({ ...newContact, note: e.target.value })}
                className="bg-secondary/20 border-secondary/40 text-white placeholder:text-white/50"
                rows={3}
              />
            </div>
            
            <div className="flex space-x-3">
              <Button
                onClick={handleAddContact}
                className="flex-1 bg-green-500 hover:bg-green-600 text-white"
              >
                Add to Circle
              </Button>
              <Button
                onClick={() => setShowAddForm(false)}
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
      </main>

      <BottomNavigation />
    </div>
  );
};

export default SafeContacts;
