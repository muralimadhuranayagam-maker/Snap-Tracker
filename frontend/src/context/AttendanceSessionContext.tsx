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

    // 1. Force stop all tracks in mediaStreamRef
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach((track) => {
        try {
          track.enabled = false;
          track.stop();
        } catch {}
      });
      mediaStreamRef.current = null;
    }

    // 2. Stop and clear bgVideo
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

    // 3. Stop and clear visibleVideo
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

    // 4. Force stop any other video element in DOM that might hold a camera stream
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

    // 5. Broadcast to any other open SnapServe tabs so they immediately shut down camera hardware as well
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
  const { lastEvent, sendMessage } = useWebSocket();
  const [isBeingStreamed, setIsBeingStreamed] = useState(false);
  const [streamedByAdminName, setStreamedByAdminName] = useState('');
  const peerConnRef = useRef<RTCPeerConnection | null>(null);
  const pendingIceCandidatesRef = useRef<RTCIceCandidateInit[]>([]);

  useEffect(() => {
    if (!lastEvent) return;

    const handleWebRTC = async () => {
      const rtcConfig: RTCConfiguration = {
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
          { urls: 'stun:stun2.l.google.com:19302' },
          { urls: 'stun:stun3.l.google.com:19302' },
          { urls: 'stun:stun4.l.google.com:19302' },
        ],
      };

      if (lastEvent.type === 'WEBRTC_REQUEST_STREAM') {
        const { senderId, senderName } = lastEvent.payload || {};
        setStreamedByAdminName(senderName || 'Super Admin');
        setIsBeingStreamed(true);

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
      } else if (lastEvent.type === 'WEBRTC_ANSWER' && peerConnRef.current) {
        const pc = peerConnRef.current;
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(lastEvent.payload.answer));
          while (pendingIceCandidatesRef.current.length > 0) {
            const cand = pendingIceCandidatesRef.current.shift();
            if (cand) {
              await pc.addIceCandidate(new RTCIceCandidate(cand)).catch(() => {});
            }
          }
        } catch (err) {
          console.error('[Employee WebRTC] Failed to set remote answer:', err);
        }
      } else if (lastEvent.type === 'WEBRTC_ICE_CANDIDATE' && peerConnRef.current) {
        const pc = peerConnRef.current;
        const candidate = lastEvent.payload?.candidate;
        if (candidate) {
          if (pc.remoteDescription && pc.remoteDescription.type) {
            pc.addIceCandidate(new RTCIceCandidate(candidate)).catch(() => {});
          } else {
            pendingIceCandidatesRef.current.push(candidate);
          }
        }
      } else if (lastEvent.type === 'WEBRTC_STOP_STREAM') {
        if (peerConnRef.current) {
          peerConnRef.current.close();
          peerConnRef.current = null;
        }
        pendingIceCandidatesRef.current = [];
        setIsBeingStreamed(false);
      }
    };

    handleWebRTC();
  }, [lastEvent, sendMessage]);

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
      }}
    >
      {/* Active Live Stream Notification Banner (Transparent & Visible for Employee) */}
      {isBeingStreamed && (
        <div
          style={{
            position: 'fixed',
            top: '16px',
            right: '16px',
            zIndex: 999999,
            background: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
            color: '#ffffff',
            padding: '10px 18px',
            borderRadius: '30px',
            boxShadow: '0 10px 30px rgba(220, 38, 38, 0.6)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '12px',
            fontWeight: 700,
            border: '1px solid rgba(255, 255, 255, 0.2)',
          }}
        >
          <span style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#ffffff', animation: 'ping 1s cubic-bezier(0, 0, 0.2, 1) infinite' }} />
          <span>🔴 LIVE STREAMING ACTIVE — {streamedByAdminName} is viewing your live camera feed</span>
        </div>
      )}
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
