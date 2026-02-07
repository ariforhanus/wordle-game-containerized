import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import Header from "./components/Header";
import "./App.css";

export default function App() {
  // Prevent double-tap zoom and gesture zoom on mobile (especially Safari)
  useEffect(() => {
    let lastTouchEnd = 0;

    function preventDoubleTapZoom(e: TouchEvent) {
      const now = Date.now();
      if (now - lastTouchEnd < 200) {
        e.preventDefault();
      }
      lastTouchEnd = now;
    }

    function preventGestureZoom(e: Event) {
      e.preventDefault();
    }

    document.addEventListener("touchend", preventDoubleTapZoom, { passive: false });
    document.addEventListener("gesturestart", preventGestureZoom, { passive: false } as EventListenerOptions);

    return () => {
      document.removeEventListener("touchend", preventDoubleTapZoom);
      document.removeEventListener("gesturestart", preventGestureZoom);
    };
  }, []);

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-nav">
        Skip to content
      </a>
      <Header />
      <main id="main-content" className="app-main" role="main">
        <Outlet />
      </main>
    </div>
  );
}
