import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';
import { FacePresenceDetector } from '../services/faceDetection';
import { globalActivityTracker } from '../services/activityTracker';
import { useAuthStore } from '../store/authStore';
import { useWebSocket } from './WebSocketContext';
import api from '../lib/api';

interface AttendanceSessionContextType {
  isVideoActive: boolean;
  isFaceDetected: boolean;
  faceConfidence: number;
  gracePeriodCountdown: number | null;
  gracePeriodConfig: number;
  setGracePeriodConfig: (sec: number) => void;
  cameraError: string | null;
  startCamera: () => Promise<boolean>;
  stopCamera: () => void;
  attachVisibleVideo: (el: HTMLVideoElement | null) => void;
  mediaStream: MediaStream | null;
  isScreenShareActive: boolean;
  requestInitialScreenShare: () => Promise<boolean>;
}

const AttendanceSessionContext = createContext<AttendanceSessionContextType | null>(null);

export function AttendanceSessionProvider({ children }: { children: React.ReactNode }) {
  const { user: currentUser } = useAuthStore();
  const isSuperAdmin = currentUser?.role === 'SUPER_ADMIN';

  const [isVideoActive, setIsVideoActive] = useState(false);
  const [isFaceDetected, setIsFaceDetected] = useState(false);
  const [faceConfidence, setFaceConfidence] = useState(0);
  const [gracePeriodCountdown, setGracePeriodCountdown] = useState<number | null>(null);
  const [gracePeriodConfig, setGracePeriodConfig] = useState<number>(4);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [isScreenShareActive, setIsScreenShareActive] = useState(false);

  // Background stream and hidden video element for continuous background tab & navigation tracking
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const bgVideoRef = useRef<HTMLVideoElement | null>(null);
  const visibleVideoRef = useRef<HTMLVideoElement | null>(null);
  const detectorRef = useRef<FacePresenceDetector>(new FacePresenceDetector());

  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const detectionIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const syncIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Setup background video element on mount
  useEffect(() => {
    const bgVideo = document.createElement('video');
    bgVideo.autoplay = true;
    bgVideo.playsInline = true;
    bgVideo.muted = true;
    bgVideo.style.position = 'fixed';
    bgVideo.style.bottom = '0';
    bgVideo.style.right = '0';
    bgVideo.style.width = '4px';
    bgVideo.style.height = '4px';
    bgVideo.style.opacity = '0.01';
    bgVideo.style.zIndex = '-9999';
    bgVideo.style.pointerEvents = 'none';
    document.body.appendChild(bgVideo);
    bgVideoRef.current = bgVideo;

    return () => {
      // Clean up camera tracks on unmount
      if (mediaStreamRef.current) {
        mediaStreamRef.current.getTracks().forEach((track) => {
          track.stop();
          track.enabled = false;
        });
        mediaStreamRef.current = null;
      }
      if (document.body.contains(bgVideo)) {
        document.body.removeChild(bgVideo);
      }
    };
  }, []);

  // Dedicated multi-tab broadcast channel & cancellation ref
  const broadcastRef = useRef<BroadcastChannel | null>(null);
  const shouldBeActiveRef = useRef(false);

  const stopCameraInternal = useCallback((broadcast: boolean = true) => {
    shouldBeActiveRef.current = false;

    // 1. Close WebRTC peer connection & stop active senders
    if (peerConnRef.current) {
      try {
        peerConnRef.current.getSenders().forEach((s) => {
          if (s.track) {
            try {
              s.track.enabled = false;
              s.track.stop();
            } catch {}
          }
        });
        peerConnRef.current.close();
      } catch {}
      peerConnRef.current = null;
    }
    pendingIceCandidatesRef.current = [];

    if (screenPeerConnRef.current) {
      try {
        screenPeerConnRef.current.getSenders().forEach((s) => {
          if (s.track) {
            try {
              s.track.enabled = false;
              s.track.stop();
            } catch {}
          }
        });
        screenPeerConnRef.current.close();
      } catch {}
      screenPeerConnRef.current = null;
    }
    screenPendingCandidatesRef.current = [];

    if (screenStreamRef.current) {
      try {
        screenStreamRef.current.getTracks().forEach((t) => {
          t.enabled = false;
          t.stop();
        });
      } catch {}
      screenStreamRef.current = null;
    }

    // 2. Force stop all tracks in mediaStreamRef
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }

    // 3. Stop and clear bgVideo
    if (bgVideoRef.current) {
      if (bgVideoRef.current.srcObject) {
        try {
          const s = bgVideoRef.current.srcObject as MediaStream;
          s.getTracks().forEach((t) => {
            t.enabled = false;
            t.stop();
          });
        } catch {}
        bgVideoRef.current.srcObject = null;
      }
      bgVideoRef.current.pause();
      try { bgVideoRef.current.load(); } catch {}
    }

    // 4. Stop and clear visibleVideo
    if (visibleVideoRef.current) {
      if (visibleVideoRef.current.srcObject) {
        try {
          const s = visibleVideoRef.current.srcObject as MediaStream;
          s.getTracks().forEach((t) => {
            t.enabled = false;
            t.stop();
          });
        } catch {}
        visibleVideoRef.current.srcObject = null;
      }
      visibleVideoRef.current.pause();
      try { visibleVideoRef.current.load(); } catch {}
    }

    // 5. Force stop any other video element in DOM that might hold a camera stream
    try {
      document.querySelectorAll('video').forEach((v) => {
        if (v.srcObject) {
          try {
            const s = v.srcObject as MediaStream;
            s.getTracks().forEach((t) => {
              t.enabled = false;
              t.stop();
            });
          } catch {}
          v.srcObject = null;
          v.pause();
          try { v.load(); } catch {}
        }
      });
    } catch {}

    setIsVideoActive(false);
    setIsFaceDetected(false);
    setFaceConfidence(0);
    setGracePeriodCountdown(null);

    if (graceTimerRef.current) clearTimeout(graceTimerRef.current);
    if (graceTickRef.current) clearInterval(graceTickRef.current);
    if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
    if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);

    // 6. Broadcast to any other open SnapServe tabs so they immediately shut down camera hardware as well
    if (broadcast && broadcastRef.current) {
      try {
        broadcastRef.current.postMessage({ type: 'STOP_CAMERA_ALL_TABS' });
      } catch {}
    }
  }, []);

  const stopCamera = useCallback(() => {
    stopCameraInternal(true);
  }, [stopCameraInternal]);

  // Setup broadcast channel listener
  useEffect(() => {
    try {
      const channel = new BroadcastChannel('snapserve_camera_sync');
      broadcastRef.current = channel;
      channel.onmessage = (e) => {
        if (e.data?.type === 'STOP_CAMERA_ALL_TABS') {
          stopCameraInternal(false);
        }
      };
      return () => {
        channel.close();
      };
    } catch {}
  }, [stopCameraInternal]);

  const startCamera = useCallback(async (): Promise<boolean> => {
    // Super admin is exempt from camera tracking
    if (isSuperAdmin) {
      return true;
    }

    shouldBeActiveRef.current = true;
    setCameraError(null);
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Your browser does not support camera access.');
      }

      // If stream is already active and healthy, reuse it
      if (mediaStreamRef.current && mediaStreamRef.current.active && mediaStreamRef.current.getVideoTracks().some(t => t.readyState === 'live')) {
        setIsVideoActive(true);
        return true;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      // Cancellation check: If stopCamera() was triggered while getUserMedia was awaiting
      if (!shouldBeActiveRef.current) {
        stream.getTracks().forEach((track) => {
          try {
            track.enabled = false;
            track.stop();
          } catch {}
        });
        return false;
      }

      mediaStreamRef.current = stream;

      // Handle Windows lock screen (Win + L) or camera hardware disconnection
      stream.getVideoTracks().forEach((track) => {
        track.onmute = () => {
          // Hardware muted / locked
          setIsFaceDetected(false);
        };
        track.onended = () => {
          stopCamera();
        };
      });

      if (bgVideoRef.current) {
        bgVideoRef.current.srcObject = stream;
        await bgVideoRef.current.play().catch(() => {});
      }

      if (visibleVideoRef.current) {
        visibleVideoRef.current.srcObject = stream;
        await visibleVideoRef.current.play().catch(() => {});
      }

      setIsVideoActive(true);
      detectorRef.current.reset();
      return true;
    } catch (err: any) {
      shouldBeActiveRef.current = false;
      const msg =
        err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError'
          ? 'Camera access is required to verify working time.'
          : err.name === 'NotFoundError'
          ? 'No camera found on this device.'
          : err.message || 'Unable to access camera.';
      setCameraError(msg);
      return false;
    }
  }, [isSuperAdmin, stopCamera]);

  const attachVisibleVideo = useCallback((el: HTMLVideoElement | null) => {
    visibleVideoRef.current = el;
    if (el && mediaStreamRef.current && mediaStreamRef.current.active) {
      el.srcObject = mediaStreamRef.current;
      el.play().catch(() => {});
    }
  }, []);

  const isFaceDetectedRef = useRef(isFaceDetected);
  const faceConfidenceRef = useRef(faceConfidence);
  const gracePeriodConfigRef = useRef(gracePeriodConfig);

  useEffect(() => {
    isFaceDetectedRef.current = isFaceDetected;
  }, [isFaceDetected]);

  useEffect(() => {
    faceConfidenceRef.current = faceConfidence;
  }, [faceConfidence]);

  useEffect(() => {
    gracePeriodConfigRef.current = gracePeriodConfig;
  }, [gracePeriodConfig]);

  // Continuous background face detection loop
  useEffect(() => {
    if (!isVideoActive || isSuperAdmin) {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
      return;
    }

    // Runs every 400ms across background tabs and pages
    detectionIntervalRef.current = setInterval(async () => {
      const video = bgVideoRef.current || visibleVideoRef.current;
      if (!video || video.paused || video.ended || !video.videoWidth) return;

      try {
        const result = await detectorRef.current.detect(video);
        setFaceConfidence(result.confidence);
        faceConfidenceRef.current = result.confidence;

        if (result.isDetected) {
          // Clear any active grace countdown
          if (graceTimerRef.current) {
            clearTimeout(graceTimerRef.current);
            graceTimerRef.current = null;
          }
          if (graceTickRef.current) {
            clearInterval(graceTickRef.current);
            graceTickRef.current = null;
          }
          setGracePeriodCountdown(null);

          if (!isFaceDetectedRef.current) {
            isFaceDetectedRef.current = true;
            setIsFaceDetected(true);
            api.post('/attendance/face-status', { isFaceDetected: true, confidence: result.confidence })
              .catch(() => {});
          }
        } else {
          // Face NOT detected
          if (isFaceDetectedRef.current && !graceTimerRef.current) {
            let remaining = gracePeriodConfigRef.current;
            setGracePeriodCountdown(remaining);

            graceTickRef.current = setInterval(() => {
              remaining--;
              if (remaining <= 0) {
                if (graceTickRef.current) clearInterval(graceTickRef.current);
                setGracePeriodCountdown(null);
              } else {
                setGracePeriodCountdown(remaining);
              }
            }, 1000);

            graceTimerRef.current = setTimeout(async () => {
              isFaceDetectedRef.current = false;
              setIsFaceDetected(false);
              setGracePeriodCountdown(null);
              try {
                await api.post('/attendance/face-status', {
                  isFaceDetected: false,
                  confidence: 0,
                });
              } catch {}
            }, gracePeriodConfigRef.current * 1000);
          }
        }
      } catch {
        // Ignore detection errors
      }
    }, 400);

    // Periodic 20-second authoritative server sync
    syncIntervalRef.current = setInterval(() => {
      if (isFaceDetectedRef.current) {
        api.post('/attendance/face-status', {
          isFaceDetected: true,
          confidence: faceConfidenceRef.current,
          timeDiffSeconds: 20,
        }).catch(() => {});
      }
    }, 20000);

    return () => {
      if (detectionIntervalRef.current) clearInterval(detectionIntervalRef.current);
      if (syncIntervalRef.current) clearInterval(syncIntervalRef.current);
    };
  }, [isVideoActive, isSuperAdmin]);

  // Clean up ONLY on window close/beforeunload
  useEffect(() => {
    const handleBeforeUnload = () => {
      stopCamera();
      globalActivityTracker.flush();
    };

    window.addEventListener('beforeunload', handleBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [stopCamera]);

  // WebRTC Streaming State (Employee Side)
  const { sendMessage, subscribe } = useWebSocket();
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const screenPeerConnRef = useRef<RTCPeerConnection | null>(null);
  const screenPendingCandidatesRef = useRef<RTCIceCandidateInit[]>([]);
  const screenStreamRef = useRef<MediaStream | null>(null);

  const requestInitialScreenShare = useCallback(async (): Promise<boolean> => {
    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        return false;
      }
      let stream = screenStreamRef.current;
      if (stream && stream.active && stream.getVideoTracks().some((t) => t.readyState === 'live')) {
        setIsScreenShareActive(true);
        return true;
      }
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: 'always' } as any,
        audio: false,
      });
      screenStreamRef.current = stream;
      setIsScreenShareActive(true);
      stream.getVideoTracks().forEach((track) => {
        track.onended = () => {
          if (screenPeerConnRef.current) {
            try { screenPeerConnRef.current.close(); } catch {}
            screenPeerConnRef.current = null;
          }
          screenStreamRef.current = null;
          setIsScreenShareActive(false);
        };
      });
      return true;
    } catch (err) {
      console.warn('[Employee Screen Share] User skipped or declined initial screen authorization:', err);
      setIsScreenShareActive(false);
      return false;
    }
  }, []);

  const startScreenShareAndConnect = useCallback(async (targetSenderId: string) => {
    const rtcConfig: RTCConfiguration = {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
      ],
    };

    let screenStream = screenStreamRef.current;
    if (!screenStream || !screenStream.active || !screenStream.getVideoTracks().some((t) => t.readyState === 'live')) {
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({
          video: { cursor: 'always' } as any,
          audio: false,
        });
        screenStreamRef.current = screenStream;
        setIsScreenShareActive(true);
        screenStream.getVideoTracks().forEach((track) => {
          track.onended = () => {
            if (screenPeerConnRef.current) {
              try { screenPeerConnRef.current.close(); } catch {}
              screenPeerConnRef.current = null;
            }
            screenStreamRef.current = null;
            setIsScreenShareActive(false);
          };
        });
      } catch (err) {
        console.error('[Employee WebRTC] Failed to acquire screen display stream:', err);
        setIsScreenShareActive(false);
        sendMessage({
          type: 'WEBRTC_SCREEN_ERROR',
          targetUserId: targetSenderId,
          payload: { error: 'Employee declined screen share or display stream failed.' },
        });
        return;
      }
    }

    if (screenPeerConnRef.current) {
      try { screenPeerConnRef.current.close(); } catch {}
    }

    const pc = new RTCPeerConnection(rtcConfig);
    screenPeerConnRef.current = pc;
    screenPendingCandidatesRef.current = [];

    if (screenStream && screenStream.active) {
      screenStream.getTracks().forEach((track) => {
        try {
          pc.addTrack(track, screenStream!);
        } catch {}
      });
    }

    pc.onicecandidate = (e) => {
      if (e.candidate) {
        sendMessage({
          type: 'WEBRTC_SCREEN_ICE_CANDIDATE',
          targetUserId: targetSenderId,
          payload: { candidate: e.candidate },
        });
      }
    };

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      sendMessage({
        type: 'WEBRTC_SCREEN_OFFER',
        targetUserId: targetSenderId,
        payload: { offer },
      });
    } catch (err) {
      console.error('[Employee WebRTC] Screen offer creation failed:', err);
    }
  }, [sendMessage]);

  useEffect(() => {
    const unsubscribe = subscribe(async (event) => {
      const rtcConfig: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
      };

      if (event.type === 'WEBRTC_REQUEST_STREAM') {
        const { senderId } = event.payload || {};

        // Strict Privacy Guard: Never turn on camera hardware if employee is on break, lunch, or off-duty
        if (!shouldBeActiveRef.current) {
          sendMessage({
            type: 'WEBRTC_CAMERA_OFF',
            targetUserId: senderId,
            payload: { reason: 'Employee is currently on break or off-duty. Camera hardware is turned off.' },
          });
          return;
        }

        // Ensure employee camera stream is active
        let stream = mediaStreamRef.current;
        if (!stream || !stream.active || !stream.getVideoTracks().some((t) => t.readyState === 'live')) {
          try {
            stream = await navigator.mediaDevices.getUserMedia({
              video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
              audio: false,
            });
            mediaStreamRef.current = stream;
            if (bgVideoRef.current) {
              bgVideoRef.current.srcObject = stream;
              bgVideoRef.current.play().catch(() => {});
            }
          } catch (err) {
            console.error('[Employee WebRTC] Failed to acquire camera stream:', err);
          }
        }

        if (peerConnRef.current) {
          try { peerConnRef.current.close(); } catch {}
        }

        const pc = new RTCPeerConnection(rtcConfig);
        peerConnRef.current = pc;
        pendingIceCandidatesRef.current = [];

        if (stream && stream.active) {
          stream.getTracks().forEach((track) => {
            try {
              pc.addTrack(track, stream!);
            } catch {}
          });
        }

        pc.onicecandidate = (e) => {
          if (e.candidate) {
            sendMessage({
              type: 'WEBRTC_ICE_CANDIDATE',
              targetUserId: senderId,
              payload: { candidate: e.candidate },
            });
          }
        };

        try {
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          sendMessage({
            type: 'WEBRTC_OFFER',
            targetUserId: senderId,
            payload: { offer },
          });
        } catch (err) {
          console.error('[Employee WebRTC] Offer creation failed:', err);
        }
      } else if (
        ['ATTENDANCE_BREAK_STARTED', 'ATTENDANCE_LUNCH_STARTED', 'ATTENDANCE_CLOCKED_OUT', 'ATTENDANCE_LOGOFF'].includes(event.type)
      ) {
        const payloadUserId = event.payload?.record?.userId || event.payload?.userId;
        if (payloadUserId && String(payloadUserId) === String(currentUser?.id)) {
          stopCameraInternal(true);
        }
      } else if (event.type === 'WEBRTC_REQUEST_SCREEN_STREAM') {
        const { senderId } = event.payload || {};

        let screenStream = screenStreamRef.current;
        if (screenStream && screenStream.active && screenStream.getVideoTracks().some((t) => t.readyState === 'live')) {
          await startScreenShareAndConnect(senderId);
        } else {
          // If screen stream was not pre-authorized, send WEBRTC_SCREEN_ERROR silently without showing any UI popup banner
          sendMessage({
            type: 'WEBRTC_SCREEN_ERROR',
            targetUserId: senderId,
            payload: { error: 'Employee screen stream is not currently authorized or active.' },
          });
        }
      } else if (event.type === 'WEBRTC_ANSWER' && peerConnRef.current) {
        const pc = peerConnRef.current;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(event.payload.answer));
          while (pendingIceCandidatesRef.current.length > 0) {
            const cand = pendingIceCandidatesRef.current.shift();
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }
        } catch (err) {
          console.error('[Employee WebRTC] Failed to set remote answer:', err);
        }
      } else if (event.type === 'WEBRTC_SCREEN_ANSWER' && screenPeerConnRef.current) {
        const pc = screenPeerConnRef.current;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(event.payload.answer));
          while (screenPendingCandidatesRef.current.length > 0) {
            const cand = screenPendingCandidatesRef.current.shift();
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }
        } catch (err) {
          console.error('[Employee WebRTC] Failed to set remote screen answer:', err);
        }
      } else if (event.type === 'WEBRTC_ICE_CANDIDATE' && peerConnRef.current) {
        const pc = peerConnRef.current;
        const candidate = event.payload?.candidate;
        if (candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else {
            pendingIceCandidatesRef.current.push(candidate);
          }
        }
      } else if (event.type === 'WEBRTC_SCREEN_ICE_CANDIDATE' && screenPeerConnRef.current) {
        const pc = screenPeerConnRef.current;
        const candidate = event.payload?.candidate;
        if (candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else {
            screenPendingCandidatesRef.current.push(candidate);
          }
        }
      } else if (event.type === 'WEBRTC_STOP_STREAM') {
        if (peerConnRef.current) {
          peerConnRef.current.close();
          peerConnRef.current = null;
        }
        pendingIceCandidatesRef.current = [];
      } else if (event.type === 'WEBRTC_STOP_SCREEN_STREAM') {
        if (screenPeerConnRef.current) {
          try { screenPeerConnRef.current.close(); } catch {}
          screenPeerConnRef.current = null;
        }
        if (screenStreamRef.current) {
          screenStreamRef.current.getTracks().forEach((t) => t.stop());
          screenStreamRef.current = null;
        }
        screenPendingCandidatesRef.current = [];
      }
    });

    return () => {
      unsubscribe();
    };
  }, [sendMessage, subscribe, startScreenShareAndConnect]);

  return (
    <AttendanceSessionContext.Provider
      value={{
        isVideoActive,
        isFaceDetected,
        faceConfidence,
        gracePeriodCountdown,
        gracePeriodConfig,
        setGracePeriodConfig,
        cameraError,
        startCamera,
        stopCamera,
        attachVisibleVideo,
        mediaStream: mediaStreamRef.current,
        isScreenShareActive,
        requestInitialScreenShare,
      }}
    >
      {children}
    </AttendanceSessionContext.Provider>
  );
}

export function useAttendanceSession() {
  const context = useContext(AttendanceSessionContext);
  if (!context) {
    throw new Error('useAttendanceSession must be used within an AttendanceSessionProvider');
  }
  return context;
}
