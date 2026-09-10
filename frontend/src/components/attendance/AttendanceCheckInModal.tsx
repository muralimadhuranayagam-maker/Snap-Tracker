import { useState, useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Camera, AlertTriangle, CheckCircle2, RefreshCw, X, ShieldCheck } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../lib/api';

interface AttendanceCheckInModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AttendanceCheckInModal({ isOpen, onClose }: AttendanceCheckInModalProps) {
  const queryClient = useQueryClient();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [isInitializingCamera, setIsInitializingCamera] = useState(false);

  // Initialize camera when modal opens
  useEffect(() => {
    if (isOpen) {
      startCamera();
    } else {
      stopCamera();
      setCapturedImage(null);
      setCameraError(null);
    }
    return () => {
      stopCamera();
    };
  }, [isOpen]);

  const startCamera = async () => {
    setIsInitializingCamera(true);
    setCameraError(null);
    stopCamera();

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera device API is not supported on this browser or connection.');
      }

      const mediaStream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640 },
          height: { ideal: 480 },
          facingMode: 'user',
        },
        audio: false,
      });

      setStream(mediaStream);
      if (videoRef.current) {
        videoRef.current.srcObject = mediaStream;
        videoRef.current.play();
      }
    } catch (err: any) {
      console.error('Failed to open camera:', err);
      let msg = 'Camera access was denied or no camera device was found.';
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        msg = 'Camera permission was denied. Please allow camera permissions in your browser address bar to proceed.';
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        msg = 'No camera device detected on your system. A camera is strictly required for attendance.';
      } else if (err.name === 'NotReadableError' || err.name === 'TrackStartError') {
        msg = 'Camera is currently in use by another application. Please close other camera apps and retry.';
      }
      setCameraError(msg);
    } finally {
      setIsInitializingCamera(false);
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => {
        track.stop();
      });
      setStream(null);
    }
  };

  const handleCapture = () => {
    if (!videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;

    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Flip horizontally to match mirror preview
    ctx.translate(canvas.width, 0);
    ctx.scale(-1, 1);
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
    setCapturedImage(dataUrl);
    stopCamera();
  };

  const handleRetake = () => {
    setCapturedImage(null);
    startCamera();
  };

  const checkInMutation = useMutation({
    mutationFn: async (image: string) => {
      const res = await api.post('/attendance/check-in', {
        image,
        deviceInfo: navigator.userAgent,
      });
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Morning attendance verified successfully!');
      queryClient.invalidateQueries({ queryKey: ['attendance-today'] });
      queryClient.invalidateQueries({ queryKey: ['attendance-overview'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      stopCamera();
      onClose();
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to check in. Please try again.');
    },
  });

  const handleConfirmCheckIn = () => {
    if (!capturedImage) {
      toast.error('Please capture your verification photo first.');
      return;
    }
    checkInMutation.mutate(capturedImage);
  };

  if (!isOpen) return null;

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal modal-md" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="modal-header border-b border-subtle pb-3">
          <div className="flex items-center gap-2">
            <div className="p-1.5 rounded bg-surface border border-subtle text-primary">
              <Camera size={18} />
            </div>
            <div>
              <h3 className="font-semibold text-base text-primary flex items-center gap-2">
                Morning Attendance Check-In
                <span className="badge bg-green-subtle text-green border border-green/30 text-[10px]">
                  <ShieldCheck size={10} /> Camera Verified
                </span>
              </h3>
              <p className="text-xs text-muted">
                Daily presence verification requires an active camera snapshot before starting your shift.
              </p>
            </div>
          </div>
          <button className="btn-icon btn-ghost text-muted hover:text-primary" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* Camera Error Alert */}
          {cameraError && !capturedImage && (
            <div className="p-4 rounded-lg bg-red-subtle/40 border border-red/30 flex items-start gap-3">
              <AlertTriangle className="text-red shrink-0 mt-0.5" size={18} />
              <div className="space-y-1">
                <div className="font-semibold text-xs text-red">Camera Access Required</div>
                <div className="text-xs text-secondary leading-relaxed">{cameraError}</div>
                <div className="pt-2">
                  <button
                    onClick={startCamera}
                    className="btn btn-secondary btn-xs flex items-center gap-1.5"
                    disabled={isInitializingCamera}
                  >
                    <RefreshCw size={12} className={isInitializingCamera ? 'animate-spin' : ''} />
                    <span>Retry Camera Access</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Video / Snapshot Viewport */}
          <div className="relative rounded-lg overflow-hidden bg-black aspect-video flex items-center justify-center border border-subtle shadow-inner">
            {/* Live Video Preview */}
            {!capturedImage && (
              <>
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className={`w-full h-full object-cover transform -scale-x-100 ${
                    !stream || cameraError ? 'hidden' : 'block'
                  }`}
                />
                {isInitializingCamera && (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-black/80 text-muted text-xs">
                    <RefreshCw size={24} className="animate-spin text-primary" />
                    <span>Starting camera sensor...</span>
                  </div>
                )}
                {!stream && !isInitializingCamera && !cameraError && (
                  <div className="text-muted text-xs text-center p-4">
                    Waiting for camera initialization...
                  </div>
                )}
                {/* Viewfinder Target Graphic */}
                {stream && !cameraError && (
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className="w-48 h-48 rounded-full border-2 border-dashed border-white/40 flex items-center justify-center">
                      <div className="w-4 h-4 rounded-full bg-white/20"></div>
                    </div>
                    <span className="absolute bottom-3 bg-black/60 backdrop-blur-sm px-2.5 py-1 rounded text-[11px] text-zinc-300 font-medium">
                      Align face in center
                    </span>
                  </div>
                )}
              </>
            )}

            {/* Captured Image Review */}
            {capturedImage && (
              <div className="relative w-full h-full">
                <img
                  src={capturedImage}
                  alt="Attendance Snapshot"
                  className="w-full h-full object-cover"
                />
                <div className="absolute top-3 left-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded border border-white/10 flex items-center gap-1.5 text-xs text-green font-semibold">
                  <CheckCircle2 size={13} />
                  <span>Snapshot Captured</span>
                </div>
                <div className="absolute bottom-3 right-3 bg-black/70 backdrop-blur-md px-2.5 py-1 rounded border border-white/10 text-[11px] text-zinc-300 font-mono">
                  {new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
            )}
          </div>

          {/* Hidden Canvas for Frame Capture */}
          <canvas ref={canvasRef} className="hidden" />

          {/* Guidelines info */}
          <div className="p-3 rounded-lg bg-surface border border-subtle text-xs text-muted flex items-center justify-between">
            <span>Verify your identity and timestamp before commencing work.</span>
            <span className="font-mono text-primary font-semibold">
              {new Date().toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
            </span>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-2 pt-3 border-t border-subtle">
            <button type="button" className="btn btn-ghost text-xs" onClick={onClose}>
              Cancel
            </button>

            {!capturedImage ? (
              <button
                type="button"
                className="btn btn-primary text-xs flex items-center gap-1.5"
                onClick={handleCapture}
                disabled={!stream || !!cameraError || isInitializingCamera}
                title={cameraError ? 'Camera required to start attendance' : 'Capture photo'}
              >
                <Camera size={14} />
                <span>Capture Snapshot</span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  className="btn btn-secondary text-xs flex items-center gap-1.5"
                  onClick={handleRetake}
                  disabled={checkInMutation.isPending}
                >
                  <RefreshCw size={13} />
                  <span>Retake</span>
                </button>
                <button
                  type="button"
                  className="btn btn-primary text-xs flex items-center gap-1.5"
                  onClick={handleConfirmCheckIn}
                  disabled={checkInMutation.isPending}
                >
                  <CheckCircle2 size={14} />
                  <span>{checkInMutation.isPending ? 'Verifying & Saving...' : 'Confirm & Start Shift'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
