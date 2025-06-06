
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
import WellnessInnerMenu from "./pages/WellnessInnerMenu";
import MindfulnessMenu from "./pages/MindfulnessMenu";
import BreathingMenu from "./pages/BreathingMenu";
import JournalingMenu from "./pages/JournalingMenu";
import SafeSpaceMenu from "./pages/SafeSpaceMenu";
import NotFound from "./pages/NotFound";

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
          <Route path="/wellness/inner-menu" element={<WellnessInnerMenu />} />
          <Route path="/wellness/mindfulness" element={<MindfulnessMenu />} />
          <Route path="/wellness/breathing" element={<BreathingMenu />} />
          <Route path="/wellness/journaling" element={<JournalingMenu />} />
          <Route path="/wellness/safe-space" element={<SafeSpaceMenu />} />
          {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
