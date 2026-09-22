/**
 * Sound Utility for SnapServe Tracker
 * Uses the Web Audio API to synthesize clean, crisp notification alerts
 * without relying on external audio assets, network requests, or CDN dependencies.
 */

let audioCtx: AudioContext | null = null;
let lastPlayedTime = 0;
const STORAGE_KEY = 'snap_task_sound_enabled';

/**
 * Lazily initialize and return the AudioContext
 */
function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!audioCtx) {
    audioCtx = new AudioContextClass();
  }
  return audioCtx;
}

// Auto-unlock AudioContext on first user interaction (required by modern browser autoplay policies)
if (typeof window !== 'undefined') {
  const unlockAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(() => {});
    }
  };
  window.addEventListener('click', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio, { passive: true });
  window.addEventListener('touchstart', unlockAudio, { passive: true });
}

/**
 * Check whether task sound notifications are enabled in local settings
 */
export function isTaskSoundEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored !== 'false'; // Enabled by default
}

/**
 * Toggle or set task sound notifications
 */
export function setTaskSoundEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, enabled ? 'true' : 'false');
}

/**
 * Play an audible notification chime/beep when a task is allocated to the user.
 * Synthesizes a pleasant two-tone chime (D5 -> A5) with smooth exponential gain fading.
 */
export function playTaskAllocationSound(force = false): void {
  if (!force && !isTaskSoundEnabled()) {
    return;
  }

  const now = Date.now();
  // Cooldown of 1200ms to avoid audio stutter if multiple events arrive in parallel
  if (!force && now - lastPlayedTime < 1200) {
    return;
  }
  lastPlayedTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;

    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    const startTime = ctx.currentTime + 0.02;

    // Master gain node
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.35, startTime);
    masterGain.connect(ctx.destination);

    // Tone 1: 587.33 Hz (D5 note) - crisp introductory chime
    const osc1 = ctx.createOscillator();
    const gain1 = ctx.createGain();
    osc1.type = 'sine';
    osc1.frequency.setValueAtTime(587.33, startTime);

    gain1.gain.setValueAtTime(0.0001, startTime);
    gain1.gain.exponentialRampToValueAtTime(0.3, startTime + 0.02);
    gain1.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.15);

    osc1.connect(gain1);
    gain1.connect(masterGain);

    osc1.start(startTime);
    osc1.stop(startTime + 0.16);

    // Tone 2: 880.00 Hz (A5 note) - bright resonant confirmation tone
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.setValueAtTime(880.0, startTime + 0.12);

    gain2.gain.setValueAtTime(0.0001, startTime + 0.12);
    gain2.gain.exponentialRampToValueAtTime(0.35, startTime + 0.14);
    gain2.gain.exponentialRampToValueAtTime(0.0001, startTime + 0.38);

    osc2.connect(gain2);
    gain2.connect(masterGain);

    osc2.start(startTime + 0.12);
    osc2.stop(startTime + 0.4);

    // Also vibrate mobile devices if hardware vibration is supported
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 50, 150]);
    }
  } catch (err) {
    console.warn('[Audio] Failed to synthesize task allocation sound:', err);
  }
}

/**
 * Test the task sound immediately (forces playback ignoring cooldown)
 */
export function testTaskSound(): void {
  playTaskAllocationSound(true);
}

/**
 * Request OS desktop notification permission
 */
export async function requestDesktopNotificationPermission(): Promise<boolean> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return false;
  }
  if (Notification.permission === 'granted') {
    return true;
  }
  if (Notification.permission !== 'denied') {
    const perm = await Notification.requestPermission();
    return perm === 'granted';
  }
  return false;
}
