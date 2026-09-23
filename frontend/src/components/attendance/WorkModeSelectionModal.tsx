import { useState } from "react";
import { createPortal } from "react-dom";
import { Building2, Home, CheckCircle2, Camera, Wifi, Monitor } from "lucide-react";

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
    <div
      className="modal-overlay"
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: "100vw",
        height: "100vh",
        backgroundColor: "rgba(0, 0, 0, 0.72)",
        backdropFilter: "blur(12px)",
        WebkitBackdropFilter: "blur(12px)",
        zIndex: 99999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "20px",
        overflowY: "auto",
      }}
    >
      <div
        className="modal"
        style={{
          background: "var(--bg-surface, #ffffff)",
          border: "1px solid var(--border-default, rgba(0, 0, 0, 0.12))",
          borderRadius: "24px",
          boxShadow: "0 25px 60px -15px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(0, 0, 0, 0.08)",
          width: "100%",
          maxWidth: "540px",
          overflow: "hidden",
          animation: "slideUp 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
        }}
      >
        {/* Header */}
        <div style={{ padding: "28px 28px 16px", textAlign: "center" }}>
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              justifyContent: "center",
              width: "56px",
              height: "56px",
              borderRadius: "16px",
              background: "rgba(99, 102, 241, 0.1)",
              border: "1px solid rgba(99, 102, 241, 0.2)",
              color: "#6366f1",
              marginBottom: "16px",
            }}
          >
            <Building2 size={28} />
          </div>
          <h2
            style={{
              fontSize: "20px",
              fontWeight: 800,
              color: "var(--text-foreground, #0f172a)",
              letterSpacing: "-0.02em",
              margin: 0,
            }}
          >
            Where are you working today?
          </h2>
          <p
            style={{
              fontSize: "13px",
              color: "var(--text-muted, #64748b)",
              marginTop: "8px",
              marginBottom: 0,
              lineHeight: 1.5,
            }}
          >
            Select your work location. This determines how your working hours and attendance are tracked today.
          </p>
        </div>

        {/* Mode Cards */}
        <div style={{ padding: "0 28px 20px", display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
          {/* Office Card */}
          <button
            id="work-mode-office-btn"
            type="button"
            onClick={() => setSelectedMode("OFFICE")}
            disabled={isSubmitting}
            style={{
              cursor: isSubmitting ? "not-allowed" : "pointer",
              background: selectedMode === "OFFICE" ? "rgba(245, 158, 11, 0.08)" : "var(--bg-muted, rgba(0, 0, 0, 0.02))",
              border: selectedMode === "OFFICE" ? "2px solid #f59e0b" : "1.5px solid var(--border-default, rgba(0, 0, 0, 0.08))",
              borderRadius: "18px",
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              position: "relative",
              textAlign: "left",
              transition: "all 0.18s ease",
              boxShadow: selectedMode === "OFFICE" ? "0 10px 25px -5px rgba(245, 158, 11, 0.25)" : "none",
              transform: selectedMode === "OFFICE" ? "translateY(-2px)" : "none",
            }}
          >
            {selectedMode === "OFFICE" && (
              <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                <CheckCircle2 size={20} color="#f59e0b" />
              </div>
            )}
            <div
              style={{
                padding: "12px",
                borderRadius: "14px",
                background: selectedMode === "OFFICE" ? "rgba(245, 158, 11, 0.2)" : "rgba(0, 0, 0, 0.04)",
                color: selectedMode === "OFFICE" ? "#d97706" : "var(--text-muted, #64748b)",
                transition: "colors 0.18s ease",
              }}
            >
              <Building2 size={30} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "14px",
                  color: selectedMode === "OFFICE" ? "#d97706" : "var(--text-foreground, #0f172a)",
                }}
              >
                Working from Office
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px", lineHeight: 1.4 }}>
                Time tracked via button clicks. No camera required.
              </div>
            </div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted, #64748b)" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                <span>No camera monitoring</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted, #64748b)" }}>
                <Monitor size={10} color="#f59e0b" style={{ flexShrink: 0 }} />
                <span>Activity & screen tracking</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted, #64748b)" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#f59e0b", flexShrink: 0 }} />
                <span>Auto end-of-day alert at 7PM</span>
              </div>
            </div>
          </button>

          {/* WFH Card */}
          <button
            id="work-mode-wfh-btn"
            type="button"
            onClick={() => setSelectedMode("WFH")}
            disabled={isSubmitting}
            style={{
              cursor: isSubmitting ? "not-allowed" : "pointer",
              background: selectedMode === "WFH" ? "rgba(99, 102, 241, 0.08)" : "var(--bg-muted, rgba(0, 0, 0, 0.02))",
              border: selectedMode === "WFH" ? "2px solid #6366f1" : "1.5px solid var(--border-default, rgba(0, 0, 0, 0.08))",
              borderRadius: "18px",
              padding: "20px 16px",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "12px",
              position: "relative",
              textAlign: "left",
              transition: "all 0.18s ease",
              boxShadow: selectedMode === "WFH" ? "0 10px 25px -5px rgba(99, 102, 241, 0.25)" : "none",
              transform: selectedMode === "WFH" ? "translateY(-2px)" : "none",
            }}
          >
            {selectedMode === "WFH" && (
              <div style={{ position: "absolute", top: "12px", right: "12px" }}>
                <CheckCircle2 size={20} color="#6366f1" />
              </div>
            )}
            <div
              style={{
                padding: "12px",
                borderRadius: "14px",
                background: selectedMode === "WFH" ? "rgba(99, 102, 241, 0.2)" : "rgba(0, 0, 0, 0.04)",
                color: selectedMode === "WFH" ? "#6366f1" : "var(--text-muted, #64748b)",
                transition: "colors 0.18s ease",
              }}
            >
              <Home size={30} />
            </div>
            <div style={{ textAlign: "center" }}>
              <div
                style={{
                  fontWeight: 800,
                  fontSize: "14px",
                  color: selectedMode === "WFH" ? "#6366f1" : "var(--text-foreground, #0f172a)",
                }}
              >
                Work from Home
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted, #64748b)", marginTop: "4px", lineHeight: 1.4 }}>
                Time tracked via face presence & camera.
              </div>
            </div>
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "6px", marginTop: "4px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted, #64748b)" }}>
                <Camera size={11} color="#6366f1" style={{ flexShrink: 0 }} />
                <span>Face presence monitoring</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted, #64748b)" }}>
                <Wifi size={11} color="#6366f1" style={{ flexShrink: 0 }} />
                <span>Live admin camera view</span>
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: "6px", fontSize: "10px", color: "var(--text-muted, #64748b)" }}>
                <div style={{ width: "5px", height: "5px", borderRadius: "50%", background: "#6366f1", flexShrink: 0 }} />
                <span>Real-time face verification</span>
              </div>
            </div>
          </button>
        </div>

        {/* Confirm Button */}
        <div style={{ padding: "0 28px 28px" }}>
          <button
            id="work-mode-confirm-btn"
            type="button"
            onClick={handleConfirm}
            disabled={!selectedMode || isSubmitting}
            style={{
              width: "100%",
              padding: "14px 20px",
              borderRadius: "16px",
              fontWeight: 800,
              fontSize: "14px",
              border: "none",
              cursor: (!selectedMode || isSubmitting) ? "not-allowed" : "pointer",
              background: selectedMode
                ? "linear-gradient(135deg, #6366f1, #4f46e5)"
                : "rgba(0, 0, 0, 0.08)",
              color: selectedMode ? "#ffffff" : "var(--text-muted, #94a3b8)",
              boxShadow: selectedMode ? "0 10px 25px -5px rgba(99, 102, 241, 0.4)" : "none",
              transition: "all 0.18s ease",
            }}
          >
            {isSubmitting
              ? "Marking Attendance..."
              : selectedMode
                ? `Confirm — ${selectedMode === "OFFICE" ? "Working from Office" : "Work from Home"}`
                : "Select your work location"}
          </button>
          <p
            style={{
              textAlign: "center",
              fontSize: "11px",
              color: "var(--text-muted, #94a3b8)",
              marginTop: "10px",
              marginBottom: 0,
            }}
          >
            This selection applies to today only. Your administrator can change it if needed.
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
}
