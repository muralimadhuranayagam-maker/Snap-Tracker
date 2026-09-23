import { useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Home, CheckCircle2, Camera, Wifi } from "lucide-react";

interface WorkModeSelectionModalProps {
  onSelect: (mode: "OFFICE" | "WFH") => void;
  isSubmitting?: boolean;
}

export function WorkModeSelectionModal({ onSelect, isSubmitting }: WorkModeSelectionModalProps) {
  const [selectedMode, setSelectedMode] = useState<"OFFICE" | "WFH" | null>(null);

  const handleConfirm = () => {
    if (!selectedMode || isSubmitting) return;
    onSelect(selectedMode);
  };

  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="w-full max-w-lg bg-card border border-border/60 rounded-3xl shadow-2xl shadow-black/50 overflow-hidden animate-in zoom-in-95 duration-300">
        {/* Header */}
        <div className="px-7 pt-7 pb-4 text-center">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-4">
            <Building2 size={26} className="text-primary" />
          </div>
          <h2 className="text-xl font-extrabold text-foreground tracking-tight">Where are you working today?</h2>
          <p className="text-sm text-muted-foreground mt-1.5">
            Select your work location. This determines how your working hours are tracked.
          </p>
        </div>

        {/* Mode Cards */}
        <div className="px-7 pb-5 grid grid-cols-2 gap-4">
          {/* Office Card */}
          <button
            id="work-mode-office-btn"
            onClick={() => setSelectedMode("OFFICE")}
            disabled={isSubmitting}
            style={{ cursor: "pointer" }}
            className={`group relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 text-left
              ${selectedMode === "OFFICE"
                ? "border-amber-500 bg-amber-500/10 shadow-lg shadow-amber-500/10 scale-[1.02]"
                : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
              }`}
          >
            {selectedMode === "OFFICE" && (
              <div className="absolute top-3 right-3">
                <CheckCircle2 size={18} className="text-amber-400" />
              </div>
            )}
            <div className={`p-3.5 rounded-xl border transition-colors ${
              selectedMode === "OFFICE"
                ? "bg-amber-500/20 border-amber-500/40 text-amber-400"
                : "bg-muted/40 border-border/40 text-muted-foreground group-hover:text-foreground"
            }`}>
              <Building2 size={28} />
            </div>
            <div className="text-center">
              <div className={`font-bold text-sm ${selectedMode === "OFFICE" ? "text-amber-400" : "text-foreground"}`}>
                Working from Office
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Time tracked via button clicks. No camera required.
              </div>
            </div>
            <div className="w-full flex flex-col gap-1.5 mt-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
                <span>No camera monitoring</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
                <span>Activity & screen tracking</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-amber-400/60 shrink-0" />
                <span>Auto end-of-day alert at 7PM</span>
              </div>
            </div>
          </button>

          {/* WFH Card */}
          <button
            id="work-mode-wfh-btn"
            onClick={() => setSelectedMode("WFH")}
            disabled={isSubmitting}
            style={{ cursor: "pointer" }}
            className={`group relative flex flex-col items-center gap-3 p-5 rounded-2xl border-2 transition-all duration-200 text-left
              ${selectedMode === "WFH"
                ? "border-primary bg-primary/10 shadow-lg shadow-primary/10 scale-[1.02]"
                : "border-border/50 bg-muted/20 hover:border-border hover:bg-muted/40"
              }`}
          >
            {selectedMode === "WFH" && (
              <div className="absolute top-3 right-3">
                <CheckCircle2 size={18} className="text-primary" />
              </div>
            )}
            <div className={`p-3.5 rounded-xl border transition-colors ${
              selectedMode === "WFH"
                ? "bg-primary/20 border-primary/40 text-primary"
                : "bg-muted/40 border-border/40 text-muted-foreground group-hover:text-foreground"
            }`}>
              <Home size={28} />
            </div>
            <div className="text-center">
              <div className={`font-bold text-sm ${selectedMode === "WFH" ? "text-primary" : "text-foreground"}`}>
                Work from Home
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
                Time tracked via face presence detection & camera.
              </div>
            </div>
            <div className="w-full flex flex-col gap-1.5 mt-1">
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Camera size={10} className="text-primary/60 shrink-0" />
                <span>Face presence monitoring</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <Wifi size={10} className="text-primary/60 shrink-0" />
                <span>Live admin camera view</span>
              </div>
              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-primary/60 shrink-0" />
                <span>Real-time face verification</span>
              </div>
            </div>
          </button>
        </div>

        {/* Confirm Button */}
        <div className="px-7 pb-7">
          <button
            id="work-mode-confirm-btn"
            onClick={handleConfirm}
            disabled={!selectedMode || isSubmitting}
            className={`w-full py-3.5 rounded-2xl font-bold text-sm transition-all duration-200
              ${selectedMode
                ? "bg-primary hover:bg-primary/90 text-primary-foreground shadow-md shadow-primary/20 hover:shadow-lg active:scale-[0.99]"
                : "bg-muted/30 text-muted-foreground cursor-not-allowed"
              }`}
          >
            {isSubmitting
              ? "Marking Attendance..."
              : selectedMode
                ? `Confirm — ${selectedMode === "OFFICE" ? "Working from Office" : "Work from Home"}`
                : "Select your work location"}
          </button>
          <p className="text-center text-[10px] text-muted-foreground/60 mt-2.5">
            This selection applies to today only. Your administrator can change it if needed.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
