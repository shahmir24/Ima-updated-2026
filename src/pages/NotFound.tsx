import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error(
      "404 Error: User attempted to access non-existent route:",
      location.pathname
    );
  }, [location.pathname]);

  // The app's own dark theme and button, so a mistyped or outdated link lands
  // somewhere that looks like iMA. Home is an in-app link: no full reload.
  return (
    <main className="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-white mb-4">404</h1>
        <p className="text-xl text-white/70 mb-6">Oops! Page not found</p>
        <Button asChild className="rounded-2xl">
          <Link to="/">Return to Home</Link>
        </Button>
      </div>
    </main>
  );
};

export default NotFound;
