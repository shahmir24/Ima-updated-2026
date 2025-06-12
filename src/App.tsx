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
import JournalingMenu from "./pages/JournalingMenu";
import SafeSpaceMenu from "./pages/SafeSpaceMenu";
import BodyScanIntro from "./pages/BodyScanIntro";
import BodyScanSession from "./pages/BodyScanSession";
import NotFound from "./pages/NotFound";
import MeditationMenu from "./pages/MeditationMenu";
import FocusReset from "./pages/FocusReset";
import AnchorGrounding from "./pages/AnchorGrounding";

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
          <Route path="/meditation" element={<MeditationMenu />} />
          <Route path="/meditation/focus-reset" element={<FocusReset />} />
          <Route path="/meditation/anchor" element={<AnchorGrounding />} />
          <Route path="/mindfulness/body-scan" element={<BodyScanIntro />} />
          <Route path="/mindfulness/body-scan/session" element={<BodyScanSession />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
