
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import Index from "./pages/Index";
import Productivity from "./pages/Productivity";
import Focus from "./pages/Focus";
import Soundscape from "./pages/Soundscape";
import Stats from "./pages/Stats";
import Tasks from "./pages/Tasks";
import Wellness from "./pages/Wellness";
import MindfulnessMenu from "./pages/MindfulnessMenu";
import BreathingMenu from "./pages/BreathingMenu";
import SteadySquare from "./pages/breathing/SteadySquare";
import TriangleCalm from "./pages/breathing/TriangleCalm";
import DeepReset from "./pages/breathing/DeepReset";
import SleepSwitch from "./pages/breathing/SleepSwitch";
import RideTheWave from "./pages/breathing/RideTheWave";
import JournalingMenu from "./pages/JournalingMenu";
import SafeSpaceMenu from "./pages/SafeSpaceMenu";
import SafeSpaceChat from "./pages/SafeSpaceChat";
import SafeContacts from "./pages/SafeContacts";
import BodyScanIntro from "./pages/BodyScanIntro";
import BodyScanSession from "./pages/BodyScanSession";
import NotFound from "./pages/NotFound";
import MeditationMenu from "./pages/MeditationMenu";
import FocusReset from "./pages/FocusReset";
import AnchorGrounding from "./pages/AnchorGrounding";
import BreathSyncWalk from "./pages/BreathSyncWalk";
import BreakLoopWalk from "./pages/BreakLoopWalk";
import MindfulWalkingMenu from "./pages/MindfulWalkingMenu";
import MorningIntention from "./pages/MorningIntention";
import PostPanicJournal from "./pages/PostPanicJournal";
import FocusResetJournal from "./pages/FocusResetJournal";
import GratitudeJournal from "./pages/GratitudeJournal";
import SensoryCheckIn from "./pages/SensoryCheckIn";
import DailyJournal from "./pages/DailyJournal";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/productivity" element={<Productivity />} />
          <Route path="/focus" element={<Focus />} />
          <Route path="/soundscape" element={<Soundscape />} />
          <Route path="/stats" element={<Stats />} />
          <Route path="/tasks" element={<Tasks />} />
          <Route path="/wellness" element={<Wellness />} />
          <Route path="/wellness/mindfulness" element={<MindfulnessMenu />} />
          <Route path="/breathing" element={<BreathingMenu />} />
          <Route path="/breathing/steady-square" element={<SteadySquare />} />
          <Route path="/breathing/triangle-calm" element={<TriangleCalm />} />
          <Route path="/breathing/deep-reset" element={<DeepReset />} />
          <Route path="/breathing/sleep-switch" element={<SleepSwitch />} />
          <Route path="/breathing/ride-the-wave" element={<RideTheWave />} />
          <Route path="/meditation" element={<MeditationMenu />} />
          <Route path="/meditation/focus-reset" element={<FocusReset />} />
          <Route path="/meditation/anchor" element={<AnchorGrounding />} />
          <Route path="/mindfulness/body-scan" element={<BodyScanIntro />} />
          <Route path="/mindfulness/body-scan/session" element={<BodyScanSession />} />
          <Route path="/mindfulness/walking" element={<MindfulWalkingMenu />} />
          <Route path="/mindfulness/walking/breath-sync" element={<BreathSyncWalk />} />
          <Route path="/mindfulness/walking/break-loop" element={<BreakLoopWalk />} />
          <Route path="/journaling" element={<JournalingMenu />} />
          <Route path="/journaling/morning-intention" element={<MorningIntention />} />
          <Route path="/journaling/daily-journal" element={<DailyJournal />} />
          <Route path="/journaling/post-panic" element={<PostPanicJournal />} />
          <Route path="/journaling/focus-reset" element={<FocusResetJournal />} />
          <Route path="/journaling/gratitude" element={<GratitudeJournal />} />
          <Route path="/journaling/sensory-checkin" element={<SensoryCheckIn />} />
          <Route path="/safe-space" element={<SafeSpaceMenu />} />
          <Route path="/safe-space/chat" element={<SafeSpaceChat />} />
          <Route path="/safe-space/contacts" element={<SafeContacts />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
