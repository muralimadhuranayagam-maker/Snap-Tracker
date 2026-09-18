import { useState, useEffect } from 'react';
import { Download, X, Check, ExternalLink, Laptop } from 'lucide-react';

export function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [showModal, setShowModal] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Check if running already in standalone desktop window mode
    const inStandalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as any).standalone ||
      document.referrer.includes('android-app://') ||
      !!(window as any).electronAPI?.isDesktop;

    setIsStandalone(inStandalone);

    const handleBeforeInstallPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
      (window as any).deferredInstallPrompt = e;

      // Automatically pop up modal on initial visit if not dismissed or installed
      const dismissed = sessionStorage.getItem('pwa_banner_dismissed');
      if (!dismissed && !inStandalone) {
        setShowModal(true);
      }
    };

    const handleOpenBannerEvent = () => {
      setShowModal(true);
    };

    const handleAppInstalled = () => {
      setShowModal(false);
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
      try {
        const { outcome } = await promptObj.userChoice;
        if (outcome === 'accepted') {
          setShowModal(false);
          setInstalled(true);
        }
      } catch (err) {
        console.error('PWA install prompt error:', err);
      }
      setDeferredPrompt(null);
      (window as any).deferredInstallPrompt = null;
    }
  };

  const handleDismiss = () => {
    setShowModal(false);
    sessionStorage.setItem('pwa_banner_dismissed', 'true');
  };

  if (isStandalone || (!showModal && !installed)) return null;

  const activePrompt = deferredPrompt || (window as any).deferredInstallPrompt;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100vh',
        backgroundColor: 'rgba(0, 0, 0, 0.75)',
        backdropFilter: 'blur(8px)',
        WebkitBackdropFilter: 'blur(8px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '20px',
        boxSizing: 'border-box',
      }}
      onClick={handleDismiss}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '480px',
          backgroundColor: 'var(--bg-surface, #09090b)',
          color: 'var(--text-primary, #f4f4f5)',
          border: '1px solid var(--border-default, #27272a)',
          borderRadius: '16px',
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.5)',
          padding: '24px',
          position: 'relative',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={handleDismiss}
          style={{
            position: 'absolute',
            top: '16px',
            right: '16px',
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted, #71717a)',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '8px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
          title="Close dialog"
        >
          <X size={18} />
        </button>

        {/* Modal Content */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
          <div
            style={{
              padding: '12px',
              borderRadius: '12px',
              backgroundColor: 'rgba(59, 130, 246, 0.15)',
              color: '#3b82f6',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              flexShrink: 0,
            }}
          >
            <Laptop size={28} />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h3 style={{ margin: 0, fontSize: '17px', fontWeight: 700 }}>
                Install SnapServe Desktop App
              </h3>
              <span
                style={{
                  fontSize: '10px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '12px',
                  backgroundColor: 'rgba(59, 130, 246, 0.2)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59, 130, 246, 0.3)',
                  textTransform: 'uppercase',
                }}
              >
                PWA Desktop
              </span>
            </div>

            <p
              style={{
                margin: '10px 0 16px 0',
                fontSize: '13px',
                lineHeight: '1.5',
                color: 'var(--text-secondary, #a1a1aa)',
              }}
            >
              Install SnapServe Tracker on your Windows laptop/PC for 1-click desktop launch, full-screen workspace, and seamless activity tracking.
            </p>

            {installed ? (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  color: '#22c55e',
                  fontWeight: 600,
                  fontSize: '13px',
                  padding: '10px 14px',
                  backgroundColor: 'rgba(34, 197, 94, 0.1)',
                  borderRadius: '10px',
                  border: '1px solid rgba(34, 197, 94, 0.2)',
                }}
              >
                <Check size={16} /> App Installed Successfully on Desktop!
              </div>
            ) : activePrompt ? (
              <div style={{ display: 'flex', gap: '10px' }}>
                <button
                  onClick={handleInstallClick}
                  className="btn btn-primary"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    padding: '10px 18px',
                    fontSize: '13px',
                    fontWeight: 600,
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  <Download size={15} />
                  Install Now
                </button>
                <button
                  onClick={handleDismiss}
                  className="btn btn-ghost"
                  style={{
                    padding: '10px 14px',
                    fontSize: '13px',
                    fontWeight: 500,
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                >
                  Maybe Later
                </button>
              </div>
            ) : (
              <div
                style={{
                  backgroundColor: 'var(--bg-elevated, #18181b)',
                  border: '1px solid var(--border-default, #27272a)',
                  borderRadius: '10px',
                  padding: '12px 14px',
                  fontSize: '12px',
                  color: 'var(--text-secondary, #a1a1aa)',
                  lineHeight: '1.5',
                }}
              >
                <div style={{ fontWeight: 600, color: 'var(--text-primary, #f4f4f5)', marginBottom: '6px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <ExternalLink size={14} className="text-blue" />
                  How to Install in your Browser:
                </div>
                <ol style={{ margin: '4px 0 0 18px', padding: 0 }}>
                  <li>Look at the right end of your browser's address bar for the <b>"Install SnapServe"</b> icon (or click Chrome <b>⋮</b> menu).</li>
                  <li>Click <b>"Install SnapServe..."</b> (or <i>Save & Share → Install page as app</i>).</li>
                </ol>
                <div style={{ marginTop: '12px', textAlign: 'right' }}>
                  <button
                    onClick={handleDismiss}
                    className="btn btn-primary btn-sm"
                    style={{ padding: '6px 14px', fontSize: '12px', cursor: 'pointer' }}
                  >
                    Got It
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

