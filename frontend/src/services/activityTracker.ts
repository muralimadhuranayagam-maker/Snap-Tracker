/**
 * Production Client Activity Tracker.
 * 
 * STRICT PRIVACY BOUNDARIES:
 * - DO NOT capture actual keyboard characters, key names, or key codes.
 * - DO NOT inspect text inputs, passwords, form fields, or clipboard.
 * - DO NOT capture screenshots or screen recordings.
 * - Records ONLY aggregate event counts and active seconds.
 * - Sends throttled batches every 20-30 seconds to the backend.
 * - In accordance with web browser sandboxing, only observes activity within the SnapServe web application.
 * - Activity metrics are for SUPER_ADMIN analytics only and NEVER contribute to official working hours.
 */

import api from '../lib/api';

export interface ActivityBatch {
  mouseActiveSeconds: number;
  keyboardActiveSeconds: number;
  idleSeconds: number;
  mouseEventCount: number;
  mouseClickCount: number;
  scrollCount: number;
  keyboardEventCount: number;
}

export class ActivityTracker {
  private isTracking = false;
  private timer: ReturnType<typeof setInterval> | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  // Real-time second accumulator
  private currentSecondHasMouse = false;
  private currentSecondHasKeyboard = false;
  private secondsSinceLastInteraction = 0;

  // Unsent batch accumulators
  private mouseActiveSeconds = 0;
  private keyboardActiveSeconds = 0;
  private idleSeconds = 0;
  private mouseEventCount = 0;
  private mouseClickCount = 0;
  private scrollCount = 0;
  private keyboardEventCount = 0;

  private onMouseMoveBound = this.onMouseMove.bind(this);
  private onMouseDownBound = this.onMouseDown.bind(this);
  private onScrollBound = this.onScroll.bind(this);
  private onKeyDownBound = this.onKeyDown.bind(this);

  public start() {
    if (this.isTracking) return;
    this.isTracking = true;

    // Attach passive window listeners (NEVER reading key values)
    window.addEventListener('mousemove', this.onMouseMoveBound, { passive: true });
    window.addEventListener('mousedown', this.onMouseDownBound, { passive: true });
    window.addEventListener('wheel', this.onScrollBound, { passive: true });
    window.addEventListener('keydown', this.onKeyDownBound, { passive: true });

    // 1-second ticker to determine active seconds vs idle seconds
    this.timer = setInterval(() => {
      if (this.currentSecondHasMouse) {
        this.mouseActiveSeconds++;
        this.secondsSinceLastInteraction = 0;
      }
      if (this.currentSecondHasKeyboard) {
        this.keyboardActiveSeconds++;
        this.secondsSinceLastInteraction = 0;
      }

      if (!this.currentSecondHasMouse && !this.currentSecondHasKeyboard) {
        this.secondsSinceLastInteraction++;
        // Considered idle if no interaction in the last 45 seconds
        if (this.secondsSinceLastInteraction >= 45) {
          this.idleSeconds++;
        }
      }

      // Reset current second flags
      this.currentSecondHasMouse = false;
      this.currentSecondHasKeyboard = false;
    }, 1000);

    // 20-second heartbeat to flush aggregate metrics to server
    this.heartbeatTimer = setInterval(() => {
      this.flush();
    }, 20000);
  }

  public stop() {
    if (!this.isTracking) return;
    this.isTracking = false;

    window.removeEventListener('mousemove', this.onMouseMoveBound);
    window.removeEventListener('mousedown', this.onMouseDownBound);
    window.removeEventListener('wheel', this.onScrollBound);
    window.removeEventListener('keydown', this.onKeyDownBound);

    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    // Flush any pending metrics
    this.flush();
  }

  private onMouseMove() {
    this.mouseEventCount++;
    this.currentSecondHasMouse = true;
  }

  private onMouseDown() {
    this.mouseClickCount++;
    this.mouseEventCount++;
    this.currentSecondHasMouse = true;
  }

  private onScroll() {
    this.scrollCount++;
    this.mouseEventCount++;
    this.currentSecondHasMouse = true;
  }

  /**
   * IMPORTANT: We intentionally DO NOT read event.key, event.code, or event.target.value.
   * Only count the event existence.
   */
  private onKeyDown() {
    this.keyboardEventCount++;
    this.currentSecondHasKeyboard = true;
  }

  public async flush() {
    if (
      this.mouseActiveSeconds === 0 &&
      this.keyboardActiveSeconds === 0 &&
      this.idleSeconds === 0 &&
      this.mouseEventCount === 0 &&
      this.keyboardEventCount === 0
    ) {
      return;
    }

    const payload: ActivityBatch = {
      mouseActiveSeconds: this.mouseActiveSeconds,
      keyboardActiveSeconds: this.keyboardActiveSeconds,
      idleSeconds: this.idleSeconds,
      mouseEventCount: this.mouseEventCount,
      mouseClickCount: this.mouseClickCount,
      scrollCount: this.scrollCount,
      keyboardEventCount: this.keyboardEventCount,
    };

    // Reset local batch
    this.mouseActiveSeconds = 0;
    this.keyboardActiveSeconds = 0;
    this.idleSeconds = 0;
    this.mouseEventCount = 0;
    this.mouseClickCount = 0;
    this.scrollCount = 0;
    this.keyboardEventCount = 0;

    try {
      await api.post('/attendance/activity-heartbeat', payload);
    } catch {
      // Re-accumulate in case of network disconnect
      this.mouseActiveSeconds += payload.mouseActiveSeconds;
      this.keyboardActiveSeconds += payload.keyboardActiveSeconds;
      this.idleSeconds += payload.idleSeconds;
      this.mouseEventCount += payload.mouseEventCount;
      this.mouseClickCount += payload.mouseClickCount;
      this.scrollCount += payload.scrollCount;
      this.keyboardEventCount += payload.keyboardEventCount;
    }
  }
}

export const globalActivityTracker = new ActivityTracker();
