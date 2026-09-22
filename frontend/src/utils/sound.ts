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
 * Play a notification chime when a task is submitted for review (notifies Super Admins)
 */
export function playReviewSubmittedSound(force = false): void {
  if (!force && !isTaskSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - lastPlayedTime < 1000) return;
  lastPlayedTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const startTime = ctx.currentTime + 0.02;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.4, startTime);
    masterGain.connect(ctx.destination);

    // Three pleasant rising chimes: C5 (523.25), E5 (659.25), G5 (783.99)
    const tones = [523.25, 659.25, 783.99];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + idx * 0.1);

      gain.gain.setValueAtTime(0.0001, startTime + idx * 0.1);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + idx * 0.1 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + idx * 0.1 + 0.2);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime + idx * 0.1);
      osc.stop(startTime + idx * 0.1 + 0.22);
    });

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([120, 80, 160]);
    }
  } catch {
    playTaskAllocationSound(force);
  }
}

/**
 * Play a celebratory confirmation chime when a task is approved as completed (notifies Employee)
 */
export function playTaskApprovedSound(force = false): void {
  if (!force && !isTaskSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - lastPlayedTime < 1000) return;
  lastPlayedTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const startTime = ctx.currentTime + 0.02;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.4, startTime);
    masterGain.connect(ctx.destination);

    // Upbeat major arpeggio: D5 (587.33), F#5 (739.99), A5 (880.0), D6 (1174.66)
    const tones = [587.33, 739.99, 880.0, 1174.66];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, startTime + idx * 0.08);

      gain.gain.setValueAtTime(0.0001, startTime + idx * 0.08);
      gain.gain.exponentialRampToValueAtTime(0.35, startTime + idx * 0.08 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + idx * 0.08 + 0.25);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime + idx * 0.08);
      osc.stop(startTime + idx * 0.08 + 0.27);
    });

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([100, 50, 100, 50, 200]);
    }
  } catch {
    playTaskAllocationSound(force);
  }
}

/**
 * Play an alert tone when a task review is rejected (notifies Employee)
 */
export function playTaskRejectedSound(force = false): void {
  if (!force && !isTaskSoundEnabled()) return;
  const now = Date.now();
  if (!force && now - lastPlayedTime < 1000) return;
  lastPlayedTime = now;

  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});

    const startTime = ctx.currentTime + 0.02;
    const masterGain = ctx.createGain();
    masterGain.gain.setValueAtTime(0.4, startTime);
    masterGain.connect(ctx.destination);

    // Two warning tones: E5 (659.25) -> B4 (493.88)
    const tones = [659.25, 493.88];
    tones.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, startTime + idx * 0.15);

      gain.gain.setValueAtTime(0.0001, startTime + idx * 0.15);
      gain.gain.exponentialRampToValueAtTime(0.3, startTime + idx * 0.15 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, startTime + idx * 0.15 + 0.2);

      osc.connect(gain);
      gain.connect(masterGain);
      osc.start(startTime + idx * 0.15);
      osc.stop(startTime + idx * 0.15 + 0.22);
    });

    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate([200, 100, 200]);
    }
  } catch {
    playTaskAllocationSound(force);
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

