import { useState, useEffect } from 'react';
import { Download, Monitor, X, Check } from 'lucide-react';

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showBanner, setShowBanner] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if running already in standalone mode (desktop window)
    const inStandalone = window.matchMedia('(display-mode: standalone)').matches || (window.navigator as any).standalone || document.referrer.includes('android-app://');
    setIsStandalone(inStandalone);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredInstallPrompt = e;
      // Show banner if not already installed/dismissed in this session
      const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
      if (!dismissed && !inStandalone) {
        setShowBanner(true);
      }
    };

    const handleOpenBannerEvent = () => {
      setShowBanner(true);
    };

    const handleAppInstalled = () => {
      setShowBanner(false);
      setInstalled(true);
      setDeferredPrompt(null);
      (window as any).deferredInstallPrompt = null;
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener('open-pwa-install-banner', handleOpenBannerEvent);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener('open-pwa-install-banner', handleOpenBannerEvent);
    };
  }, []);

  const handleInstallClick = async () => {
    const promptObj = deferredPrompt || (window as any).deferredInstallPrompt;
    if (promptObj) {
      promptObj.prompt();
      const { outcome } = await promptObj.userChoice;
      if (outcome === 'accepted') {
        setShowBanner(false);
        setInstalled(true);
      }
      setDeferredPrompt(null);
      (window as any).deferredInstallPrompt = null;
    } else {
      alert('To install SnapServe Tracker as a desktop application:\n\n1. In your browser (Chrome/Edge), look at the right end of the address bar for the "Install SnapServe" icon (or click the three dots menu ⋮).\n2. Click "Install SnapServe..." or "Save and share" -> "Install page as app".');
    }
  };

  const handleDismiss = () => {
    setShowBanner(false);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (isStandalone || (!showBanner && !installed)) return null;

  return (
    <div className="fixed bottom-4 right-4 z-[999999] max-w-md bg-slate-900/95 text-white border-2 border-primary/50 rounded-2xl p-4 shadow-2xl backdrop-blur-md animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex items-start gap-3.5">
        <div className="p-3 rounded-xl bg-primary/20 text-primary shrink-0 mt-0.5">
          <Monitor size={24} className="animate-pulse" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-1.5">
              Install SnapServe App
              <span className="text-[10px] bg-primary/20 text-primary border border-primary/30 px-1.5 py-0.2 rounded font-mono">DESKTOP</span>
            </h4>
            <button
              onClick={handleDismiss}
              className="text-slate-400 hover:text-white p-1 rounded-lg transition"
            >
              <X size={16} />
            </button>
          </div>
          <p className="text-xs text-slate-300 mt-1 leading-relaxed">
            Install SnapServe Tracker on your Windows Desktop for 1-click launch and uninterrupted activity tracking.
          </p>
          <div className="flex items-center gap-2 mt-3">
            {installed ? (
              <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                <Check size={14} /> Installed Successfully on Desktop!
              </span>
            ) : (
              <>
                <button
                  onClick={handleInstallClick}
                  className="px-4 py-2 rounded-xl text-xs font-bold bg-primary hover:bg-primary/90 text-primary-foreground shadow-lg transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5 cursor-pointer"
                >
                  <Download size={14} />
                  Install App
                </button>
                <button
                  onClick={handleDismiss}
                  className="px-3 py-2 rounded-xl text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
                >
                  Maybe Later
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
