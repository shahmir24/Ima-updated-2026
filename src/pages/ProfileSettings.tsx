
import React, { useState } from 'react';
import { ArrowLeft, Camera, Upload, Smile, User, Settings, Moon, Sun, Volume2, Zap, Clock, Shield, MessageSquare, HelpCircle } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';

const ProfileSettings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';
  
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [useEmojiProfile, setUseEmojiProfile] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('😊');
  const [darkMode, setDarkMode] = useState(false);
  const [adhdMode, setAdhdMode] = useState(false);
  const [soundVolume, setSoundVolume] = useState([75]);
  const [animationSpeed, setAnimationSpeed] = useState('normal');
  const [focusBlockLength, setFocusBlockLength] = useState('25');
  const [bufferTime, setBufferTime] = useState('5');

  const moodEmojis = ['😊', '🥰', '😌', '🤗', '✨', '🌈', '🦋', '🌸'];
  const preferredModes = [
    { id: 'focus', icon: '🧠', label: 'Focus', color: 'from-purple-400 to-purple-600' },
    { id: 'calm', icon: '😌', label: 'Calm', color: 'from-blue-400 to-teal-400' },
    { id: 'sleep', icon: '😴', label: 'Sleep', color: 'from-indigo-400 to-purple-500' }
  ];

  const [selectedMode, setSelectedMode] = useState('calm');

  const handleImageUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = () => {
        setProfilePicture(reader.result as string);
        setUseEmojiProfile(false);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleBackClick = () => {
    navigate('/');
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="w-full max-w-lg mx-auto p-4 flex items-center justify-between border-b border-border/20">
        <Button 
          variant="ghost" 
          size="icon" 
          className="rounded-full"
          onClick={handleBackClick}
        >
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-semibold">Profile & Settings</h1>
        <div className="w-10" />
      </header>

      <div className="max-w-lg mx-auto px-4 py-6">
        <Tabs value={initialTab} className="w-full">
          <TabsList className="grid w-full grid-cols-2 mb-8 bg-secondary/50 rounded-2xl p-1">
            <TabsTrigger 
              value="profile" 
              className="rounded-xl font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              onClick={() => navigate('/profile-settings?tab=profile')}
            >
              <User className="h-4 w-4 mr-2" />
              Profile Info
            </TabsTrigger>
            <TabsTrigger 
              value="settings" 
              className="rounded-xl font-medium data-[state=active]:bg-background data-[state=active]:shadow-sm"
              onClick={() => navigate('/profile-settings?tab=settings')}
            >
              <Settings className="h-4 w-4 mr-2" />
              App Settings
            </TabsTrigger>
          </TabsList>

          <TabsContent value="profile" className="space-y-6 mt-0">
            {/* Profile Picture Section */}
            <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
              <div className="flex flex-col items-center space-y-4">
                <div className="relative">
                  <Avatar className="h-24 w-24">
                    {useEmojiProfile ? (
                      <AvatarFallback className="text-3xl bg-gradient-to-br from-blue-100 to-purple-100">
                        {selectedEmoji}
                      </AvatarFallback>
                    ) : profilePicture ? (
                      <AvatarImage src={profilePicture} />
                    ) : (
                      <AvatarFallback className="bg-gradient-to-br from-blue-100 to-purple-100">
                        <User className="h-8 w-8 text-muted-foreground" />
                      </AvatarFallback>
                    )}
                  </Avatar>
                  <Button
                    size="icon"
                    className="absolute -bottom-2 -right-2 h-8 w-8 rounded-full bg-primary hover:bg-primary/90"
                    onClick={() => document.getElementById('photo-upload')?.click()}
                  >
                    <Camera className="h-4 w-4" />
                  </Button>
                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handleImageUpload}
                  />
                </div>
                
                <div className="text-center">
                  <p className="text-sm text-muted-foreground mb-3">Tap to upload a profile photo</p>
                  
                  <div className="space-y-3">
                    <div className="flex items-center justify-center space-x-2">
                      <Switch
                        checked={useEmojiProfile}
                        onCheckedChange={(checked) => {
                          setUseEmojiProfile(checked);
                          if (checked) setProfilePicture(null);
                        }}
                      />
                      <Label className="text-sm">Use my favorite mood emoji instead</Label>
                    </div>
                    
                    {useEmojiProfile && (
                      <div className="flex justify-center space-x-2">
                        {moodEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => setSelectedEmoji(emoji)}
                            className={`text-2xl p-2 rounded-full transition-all ${
                              selectedEmoji === emoji ? 'bg-primary/20 scale-110' : 'hover:bg-secondary'
                            }`}
                          >
                            {emoji}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </Card>

            {/* About You Section */}
            <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Smile className="h-5 w-5 mr-2 text-primary" />
                About You
              </h3>
              <div className="space-y-4">
                <div>
                  <Label htmlFor="firstName">First Name</Label>
                  <Input id="firstName" placeholder="e.g. Zara" className="mt-1 rounded-xl" />
                </div>
                
                <div>
                  <Label htmlFor="pronouns">Pronouns</Label>
                  <Select>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="Select pronouns" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="she-her">She/Her</SelectItem>
                      <SelectItem value="he-him">He/Him</SelectItem>
                      <SelectItem value="they-them">They/Them</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="dob">Date of Birth</Label>
                  <Input id="dob" type="date" className="mt-1 rounded-xl" />
                </div>

                <div>
                  <Label>Mood Check-in Frequency</Label>
                  <Select>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue placeholder="How often?" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="daily">Daily</SelectItem>
                      <SelectItem value="weekly">Weekly</SelectItem>
                      <SelectItem value="on-demand">On demand</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label htmlFor="focusGoals">Focus Goals</Label>
                  <Input id="focusGoals" placeholder="✨ reduce overwhelm" className="mt-1 rounded-xl" />
                </div>

                <div>
                  <Label>Preferred Mode</Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {preferredModes.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => setSelectedMode(mode.id)}
                        className={`p-4 rounded-2xl border-2 transition-all ${
                          selectedMode === mode.id
                            ? 'border-primary bg-primary/10'
                            : 'border-border hover:border-primary/50'
                        }`}
                      >
                        <div className="text-center">
                          <div className="text-2xl mb-1">{mode.icon}</div>
                          <div className="text-sm font-medium">{mode.label}</div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </Card>

            {/* Your Flow at a Glance */}
            <Card className="p-6 rounded-3xl border-0 bg-gradient-to-br from-green-50 to-blue-50 dark:from-green-950/20 dark:to-blue-950/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Zap className="h-5 w-5 mr-2 text-primary" />
                Your Flow at a Glance
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between p-3 bg-background/60 rounded-xl">
                  <span className="text-sm">💚 You've journaled 3 days in a row!</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-background/60 rounded-xl">
                  <span className="text-sm">Most Used Tool:</span>
                  <Badge variant="secondary" className="rounded-full">
                    🌬️ Breathing • 2h ago
                  </Badge>
                </div>
                <div className="p-3 bg-background/60 rounded-xl">
                  <div className="text-sm mb-2">Time Spent This Week</div>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <div className="text-center">
                      <div className="font-medium">12m</div>
                      <div className="text-muted-foreground">Breathing</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">8m</div>
                      <div className="text-muted-foreground">Journaling</div>
                    </div>
                    <div className="text-center">
                      <div className="font-medium">25m</div>
                      <div className="text-muted-foreground">Soundscape</div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="settings" className="space-y-6 mt-0">
            {/* Personalization */}
            <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Smile className="h-5 w-5 mr-2 text-primary" />
                ✨ Personalization
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Theme</Label>
                    <p className="text-sm text-muted-foreground">Light / Soft Dark Mode</p>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Sun className="h-4 w-4" />
                    <Switch checked={darkMode} onCheckedChange={setDarkMode} />
                    <Moon className="h-4 w-4" />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <Label>Sound Volume</Label>
                    <Volume2 className="h-4 w-4" />
                  </div>
                  <Slider
                    value={soundVolume}
                    onValueChange={setSoundVolume}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground mt-1">{soundVolume[0]}%</div>
                </div>

                <div>
                  <Label>Animation Speed</Label>
                  <Select value={animationSpeed} onValueChange={setAnimationSpeed}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="normal">Normal</SelectItem>
                      <SelectItem value="reduced">Reduced (for sensory sensitivity)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </Card>

            {/* Wellness Settings */}
            <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Zap className="h-5 w-5 mr-2 text-primary" />
                🧠 Wellness Settings
              </h3>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>ADHD Mode</Label>
                    <p className="text-sm text-muted-foreground">Adds focus nudges & reminders</p>
                  </div>
                  <Switch checked={adhdMode} onCheckedChange={setAdhdMode} />
                </div>

                <div>
                  <Label>Panic Mode Shortcut</Label>
                  <p className="text-sm text-muted-foreground mb-2">Quick-access gesture</p>
                  <Button variant="outline" className="w-full rounded-xl">
                    Set Shortcut
                  </Button>
                </div>

                <div>
                  <Label htmlFor="aiName">AI Body Double Name</Label>
                  <Input id="aiName" placeholder="e.g. Zoe" className="mt-1 rounded-xl" />
                  <p className="text-xs text-muted-foreground mt-1">Personalize your AI companion</p>
                </div>
              </div>
            </Card>

            {/* Time Boxing Settings */}
            <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Clock className="h-5 w-5 mr-2 text-primary" />
                🕓 Time Boxing Settings
              </h3>
              <div className="space-y-4">
                <div>
                  <Label>Default Block Length</Label>
                  <Select value={focusBlockLength} onValueChange={setFocusBlockLength}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="25">25 minutes</SelectItem>
                      <SelectItem value="45">45 minutes</SelectItem>
                      <SelectItem value="90">90 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Buffer Time Between Blocks</Label>
                  <Select value={bufferTime} onValueChange={setBufferTime}>
                    <SelectTrigger className="mt-1 rounded-xl">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="5">5 minutes</SelectItem>
                      <SelectItem value="10">10 minutes</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Timeboxing Style</Label>
                  <div className="grid grid-cols-3 gap-2 mt-2">
                    <Button variant="outline" className="rounded-xl text-xs">
                      🍅 Pomodoro
                    </Button>
                    <Button variant="outline" className="rounded-xl text-xs">
                      🌊 Deep Dive
                    </Button>
                    <Button variant="outline" className="rounded-xl text-xs">
                      🧠 Custom
                    </Button>
                  </div>
                </div>

                <div>
                  <Label htmlFor="dailyGoal">Daily Focus Goal</Label>
                  <Input 
                    id="dailyGoal" 
                    placeholder="How much work do you want to aim for today?" 
                    className="mt-1 rounded-xl" 
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Encouragement</Label>
                    <p className="text-sm text-muted-foreground">Send me a little boost before I begin</p>
                  </div>
                  <Switch />
                </div>
              </div>
            </Card>

            {/* Account & Privacy */}
            <Card className="p-6 rounded-3xl border-0 bg-secondary/30">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <Shield className="h-5 w-5 mr-2 text-primary" />
                🔐 Account & Privacy
              </h3>
              <div className="space-y-3">
                <Button variant="outline" className="w-full rounded-xl justify-start">
                  Email & Password Reset
                </Button>
                <Button variant="outline" className="w-full rounded-xl justify-start">
                  Export Data (journals, mood)
                </Button>
                <Button variant="outline" className="w-full rounded-xl justify-start">
                  Clear Emotional History
                </Button>
                <Button variant="outline" className="w-full rounded-xl justify-start text-red-600 hover:text-red-700">
                  Delete Account
                </Button>
              </div>
            </Card>

            {/* Feedback & Support */}
            <Card className="p-6 rounded-3xl border-0 bg-gradient-to-br from-blue-50 to-purple-50 dark:from-blue-950/20 dark:to-purple-950/20">
              <h3 className="text-lg font-semibold mb-4 flex items-center">
                <MessageSquare className="h-5 w-5 mr-2 text-primary" />
                📩 Feedback & Support
              </h3>
              <div className="space-y-3">
                <Button variant="outline" className="w-full rounded-xl justify-start">
                  <HelpCircle className="h-4 w-4 mr-2" />
                  Bug Report
                </Button>
                <Button variant="outline" className="w-full rounded-xl justify-start">
                  <Zap className="h-4 w-4 mr-2" />
                  Suggest a Feature
                </Button>
                <Button variant="outline" className="w-full rounded-xl justify-start">
                  <MessageSquare className="h-4 w-4 mr-2" />
                  Talk to Team iMA
                </Button>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default ProfileSettings;
