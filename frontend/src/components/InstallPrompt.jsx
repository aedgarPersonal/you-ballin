/**
 * InstallPrompt — prompts users to install the PWA.
 *
 * Two display modes:
 *   - "banner": A bottom sheet / toast-style banner (shown once after login)
 *   - "button": A compact button for embedding in the navbar or menu
 *
 * Captures the browser's `beforeinstallprompt` event and exposes it via
 * a shared module-level variable so both modes stay in sync.
 */

import { useState, useEffect, useCallback } from "react";

const DISMISS_KEY = "install-prompt-dismissed";
const DISMISS_DAYS = 14;

// Module-level state shared across component instances
let deferredPrompt = null;
const listeners = new Set();

function notify() {
  listeners.forEach((fn) => fn(deferredPrompt));
}

// Capture the event globally (runs once on module load)
if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferredPrompt = e;
    notify();
  });

  window.addEventListener("appinstalled", () => {
    deferredPrompt = null;
    notify();
  });
}

function useDeferredPrompt() {
  const [prompt, setPrompt] = useState(deferredPrompt);

  useEffect(() => {
    const handler = (p) => setPrompt(p);
    listeners.add(handler);
    return () => listeners.delete(handler);
  }, []);

  return prompt;
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    window.navigator.standalone === true
  );
}

/**
 * Banner variant — shows a prominent bottom banner encouraging install.
 */
export function InstallBanner() {
  const prompt = useDeferredPrompt();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!prompt || isStandalone()) return;

    const dismissed = localStorage.getItem(DISMISS_KEY);
    if (dismissed) {
      const daysSince =
        (Date.now() - new Date(dismissed).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSince < DISMISS_DAYS) return;
    }

    setVisible(true);
  }, [prompt]);

  const handleInstall = useCallback(async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      notify();
    }
    setVisible(false);
  }, [prompt]);

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, new Date().toISOString());
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-[420px] z-50 animate-slide-up">
      <div className="bg-gradient-to-r from-court-600 to-court-700 rounded-2xl shadow-2xl p-4 text-white">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-white/20 backdrop-blur-sm flex items-center justify-center flex-shrink-0">
            <svg viewBox="0 0 64 64" className="w-8 h-8">
              <defs>
                <linearGradient id="ib" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#fff" stopOpacity="0.9" />
                  <stop offset="100%" stopColor="#fed7aa" />
                </linearGradient>
              </defs>
              <circle cx="32" cy="32" r="29" fill="url(#ib)" />
              <path d="M32 3 Q32 32 32 61" fill="none" stroke="#c2410c" strokeWidth="1.8" />
              <path d="M3 32 Q32 32 61 32" fill="none" stroke="#c2410c" strokeWidth="1.8" />
              <path d="M10 10 Q32 24 54 10" fill="none" stroke="#c2410c" strokeWidth="1.8" />
              <path d="M10 54 Q32 40 54 54" fill="none" stroke="#c2410c" strokeWidth="1.8" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-sm">
              Install Double Dribble
            </p>
            <p className="text-xs text-white/80 mt-0.5">
              Add to your home screen for the best experience — quick access, offline support, and instant notifications.
            </p>
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleInstall}
                className="bg-white text-court-700 font-bold text-xs py-2 px-4 rounded-lg hover:bg-white/90 transition-all shadow-sm"
              >
                Install App
              </button>
              <button
                onClick={handleDismiss}
                className="text-xs text-white/70 hover:text-white py-2 px-3 transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Button variant — compact install button for navbar / mobile menu.
 */
export function InstallButton({ className = "" }) {
  const prompt = useDeferredPrompt();

  const handleInstall = useCallback(async () => {
    if (!prompt) return;
    prompt.prompt();
    const { outcome } = await prompt.userChoice;
    if (outcome === "accepted") {
      deferredPrompt = null;
      notify();
    }
  }, [prompt]);

  if (!prompt || isStandalone()) return null;

  return (
    <button
      onClick={handleInstall}
      className={`inline-flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-800 px-3 py-2.5 rounded-lg transition-all ${className}`}
    >
      <svg className="w-5 h-5 text-court-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
      Install Mobile App
    </button>
  );
}
