
import React, { useEffect, useRef, useState } from 'react';
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
import { useToast } from '@/hooks/use-toast';
import { useAutoSave } from '@/hooks/use-autosave';
import { useProfile, useUpdateProfile, type ProfilePatch } from '@/hooks/use-profile';
import { useUserSettings, useUpdateUserSettings, type UserSettingsPatch } from '@/hooks/use-user-settings';

/** Local YYYY-MM-DD, so "today" is the user's calendar day. */
const toLocalISODate = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * The profiles_dob_sane CHECK requires a date after 1900-01-01 and strictly
 * before today. Validating here keeps a mistyped year out of the request
 * instead of surfacing a raw constraint violation.
 */
const isStorableDateOfBirth = (value: string) =>
  value > '1900-01-01' && value < toLocalISODate(new Date());

const ProfileSettings = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'profile';
  
  const { toast } = useToast();

  // --- persistence -------------------------------------------------------
  // This screen has no Save button, so every control writes its own column as
  // it changes. Saves are fired from the change handlers rather than from an
  // effect, so hydrating the form below can never write over what was loaded.
  const { data: profile, isError: profileFailed, error: profileError } = useProfile();
  const { data: settings, isError: settingsFailed, error: settingsError } = useUserSettings();
  const updateProfile = useUpdateProfile();
  const updateSettings = useUpdateUserSettings();

  const reportSaveFailure = (what: string, error: unknown) => {
    toast({
      title: `Could not save your ${what}`,
      description: error instanceof Error ? error.message : 'Please try again.',
      variant: 'destructive'
    });
  };

  const profileSave = useAutoSave<ProfilePatch>(async (patch) => {
    try {
      await updateProfile.mutateAsync(patch);
    } catch (error) {
      reportSaveFailure('profile', error);
    }
  });

  const settingsSave = useAutoSave<UserSettingsPatch>(async (patch) => {
    try {
      await updateSettings.mutateAsync(patch);
    } catch (error) {
      reportSaveFailure('settings', error);
    }
  });

  // --- profile fields ----------------------------------------------------
  // Local only: the column stores a Storage object path in the private
  // `avatars` bucket, not an image, and this page has no upload pipeline.
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  const [useEmojiProfile, setUseEmojiProfile] = useState(false);
  const [selectedEmoji, setSelectedEmoji] = useState('😊');
  const [firstName, setFirstName] = useState('');
  const [pronouns, setPronouns] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [moodFrequency, setMoodFrequency] = useState('');
  const [focusGoal, setFocusGoal] = useState('');

  // --- settings fields ---------------------------------------------------
  // Defaults match the schema's, so a user whose settings row is somehow
  // missing sees what the database would actually give them. The app's
  // palette is dark (--background is near-black) and user_settings.theme
  // defaults to 'dark'; useState(false) claimed light and matched neither.
  const [darkMode, setDarkMode] = useState(true);
  const [adhdMode, setAdhdMode] = useState(false);
  const [encouragement, setEncouragement] = useState(true);
  const [soundVolume, setSoundVolume] = useState([75]);
  const [animationSpeed, setAnimationSpeed] = useState('normal');
  const [aiCompanionName, setAiCompanionName] = useState('');
  const [focusBlockLength, setFocusBlockLength] = useState('25');
  const [bufferTime, setBufferTime] = useState('5');
  const [timeboxingStyle, setTimeboxingStyle] = useState('');
  const [dailyFocusGoal, setDailyFocusGoal] = useState('');

  const moodEmojis = ['😊', '🥰', '😌', '🤗', '✨', '🌈', '🦋', '🌸'];
  const preferredModes = [
    { id: 'focus', icon: '🧠', label: 'Focus', color: 'from-purple-400 to-purple-600' },
    { id: 'calm', icon: '😌', label: 'Calm', color: 'from-blue-400 to-teal-400' },
    { id: 'sleep', icon: '😴', label: 'Sleep', color: 'from-indigo-400 to-purple-500' }
  ];

  const [selectedMode, setSelectedMode] = useState('calm');

  // Fill the form from the saved row, once. Re-applying it on a later render
  // would overwrite whatever the user has changed since.
  const profileHydrated = useRef(false);
  useEffect(() => {
    if (profileHydrated.current || !profile) return;
    profileHydrated.current = true;

    setFirstName(profile.first_name ?? '');
    setPronouns(profile.pronouns ?? '');
    setDateOfBirth(profile.date_of_birth ?? '');
    setMoodFrequency(profile.mood_checkin_frequency ?? '');
    setFocusGoal(profile.focus_goal ?? '');
    setUseEmojiProfile(profile.use_emoji_avatar);
    if (profile.avatar_emoji) setSelectedEmoji(profile.avatar_emoji);
    if (profile.preferred_mode) setSelectedMode(profile.preferred_mode);
  }, [profile]);

  const settingsHydrated = useRef(false);
  useEffect(() => {
    if (settingsHydrated.current || !settings) return;
    settingsHydrated.current = true;

    setDarkMode(settings.theme === 'dark');
    setAdhdMode(settings.adhd_mode);
    setEncouragement(settings.encouragement);
    setSoundVolume([settings.sound_volume]);
    setAnimationSpeed(settings.animation_speed);
    setAiCompanionName(settings.ai_companion_name ?? '');
    setFocusBlockLength(String(settings.focus_block_minutes));
    setBufferTime(String(settings.buffer_minutes));
    setTimeboxingStyle(settings.timeboxing_style ?? '');
    setDailyFocusGoal(settings.daily_focus_goal ?? '');
  }, [settings]);

  const loadFailureShown = useRef(false);
  useEffect(() => {
    if (loadFailureShown.current || (!profileFailed && !settingsFailed)) return;
    loadFailureShown.current = true;
    const cause = profileFailed ? profileError : settingsError;
    toast({
      title: 'Could not load your profile',
      description:
        cause instanceof Error
          ? cause.message
          : 'Showing defaults. Changes you make can still be saved.',
      variant: 'destructive'
    });
  }, [profileFailed, settingsFailed, profileError, settingsError, toast]);

  const handleDateOfBirthChange = (value: string) => {
    setDateOfBirth(value);

    if (!value) {
      profileSave.saveSoon({ date_of_birth: null });
      return;
    }

    if (isStorableDateOfBirth(value)) {
      profileSave.saveSoon({ date_of_birth: value });
    } else if (value.length === 10) {
      // Only complain about a complete date, not about one mid-entry.
      toast({
        title: 'Check that date of birth',
        description: 'It needs to be a past date after 1900.',
        variant: 'destructive'
      });
    }
  };

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
                          profileSave.saveNow(
                            checked
                              ? { use_emoji_avatar: true, avatar_emoji: selectedEmoji }
                              : { use_emoji_avatar: false }
                          );
                        }}
                      />
                      <Label className="text-sm">Use my favorite mood emoji instead</Label>
                    </div>
                    
                    {useEmojiProfile && (
                      <div className="flex justify-center space-x-2">
                        {moodEmojis.map((emoji) => (
                          <button
                            key={emoji}
                            onClick={() => {
                              setSelectedEmoji(emoji);
                              profileSave.saveNow({ avatar_emoji: emoji, use_emoji_avatar: true });
                            }}
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
                  <Input
                    id="firstName"
                    placeholder="e.g. Zara"
                    className="mt-1 rounded-xl"
                    value={firstName}
                    onChange={(e) => {
                      setFirstName(e.target.value);
                      profileSave.saveSoon({ first_name: e.target.value.trim() || null });
                    }}
                  />
                </div>
                
                <div>
                  <Label htmlFor="pronouns">Pronouns</Label>
                  <Select
                    value={pronouns || undefined}
                    onValueChange={(value) => {
                      setPronouns(value);
                      profileSave.saveNow({ pronouns: value });
                    }}
                  >
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
                  <Input
                    id="dob"
                    type="date"
                    className="mt-1 rounded-xl"
                    value={dateOfBirth}
                    onChange={(e) => handleDateOfBirthChange(e.target.value)}
                  />
                </div>

                <div>
                  <Label>Mood Check-in Frequency</Label>
                  <Select
                    value={moodFrequency || undefined}
                    onValueChange={(value) => {
                      setMoodFrequency(value);
                      profileSave.saveNow({ mood_checkin_frequency: value });
                    }}
                  >
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
                  <Input
                    id="focusGoals"
                    placeholder="✨ reduce overwhelm"
                    className="mt-1 rounded-xl"
                    value={focusGoal}
                    onChange={(e) => {
                      setFocusGoal(e.target.value);
                      profileSave.saveSoon({ focus_goal: e.target.value.trim() || null });
                    }}
                  />
                </div>

                <div>
                  <Label>Preferred Mode</Label>
                  <div className="grid grid-cols-3 gap-3 mt-2">
                    {preferredModes.map((mode) => (
                      <button
                        key={mode.id}
                        onClick={() => {
                          setSelectedMode(mode.id);
                          profileSave.saveNow({ preferred_mode: mode.id });
                        }}
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
                    <Switch
                      checked={darkMode}
                      onCheckedChange={(checked) => {
                        setDarkMode(checked);
                        settingsSave.saveNow({ theme: checked ? 'dark' : 'light' });
                      }}
                    />
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
                    onValueCommit={(value) => settingsSave.saveNow({ sound_volume: value[0] })}
                    max={100}
                    step={1}
                    className="w-full"
                  />
                  <div className="text-xs text-muted-foreground mt-1">{soundVolume[0]}%</div>
                </div>

                <div>
                  <Label>Animation Speed</Label>
                  <Select
                    value={animationSpeed}
                    onValueChange={(value) => {
                      setAnimationSpeed(value);
                      settingsSave.saveNow({ animation_speed: value });
                    }}
                  >
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
                  <Switch
                    checked={adhdMode}
                    onCheckedChange={(checked) => {
                      setAdhdMode(checked);
                      settingsSave.saveNow({ adhd_mode: checked });
                    }}
                  />
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
                  <Input
                    id="aiName"
                    placeholder="e.g. Zoe"
                    className="mt-1 rounded-xl"
                    value={aiCompanionName}
                    onChange={(e) => {
                      setAiCompanionName(e.target.value);
                      settingsSave.saveSoon({ ai_companion_name: e.target.value.trim() || null });
                    }}
                  />
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
                  <Select
                    value={focusBlockLength}
                    onValueChange={(value) => {
                      setFocusBlockLength(value);
                      settingsSave.saveNow({ focus_block_minutes: Number(value) });
                    }}
                  >
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
                  <Select
                    value={bufferTime}
                    onValueChange={(value) => {
                      setBufferTime(value);
                      settingsSave.saveNow({ buffer_minutes: Number(value) });
                    }}
                  >
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
                    {[
                      { id: 'pomodoro', label: '🍅 Pomodoro' },
                      { id: 'deep-dive', label: '🌊 Deep Dive' },
                      { id: 'custom', label: '🧠 Custom' }
                    ].map((style) => (
                      <Button
                        key={style.id}
                        variant={timeboxingStyle === style.id ? 'default' : 'outline'}
                        className="rounded-xl text-xs"
                        onClick={() => {
                          setTimeboxingStyle(style.id);
                          settingsSave.saveNow({ timeboxing_style: style.id });
                        }}
                      >
                        {style.label}
                      </Button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label htmlFor="dailyGoal">Daily Focus Goal</Label>
                  <Input
                    id="dailyGoal"
                    placeholder="How much work do you want to aim for today?"
                    className="mt-1 rounded-xl"
                    value={dailyFocusGoal}
                    onChange={(e) => {
                      setDailyFocusGoal(e.target.value);
                      settingsSave.saveSoon({ daily_focus_goal: e.target.value.trim() || null });
                    }}
                  />
                </div>

                <div className="flex items-center justify-between">
                  <div>
                    <Label>Encouragement</Label>
                    <p className="text-sm text-muted-foreground">Send me a little boost before I begin</p>
                  </div>
                  <Switch
                    checked={encouragement}
                    onCheckedChange={(checked) => {
                      setEncouragement(checked);
                      settingsSave.saveNow({ encouragement: checked });
                    }}
                  />
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
