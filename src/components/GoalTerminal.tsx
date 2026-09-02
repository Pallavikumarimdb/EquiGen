"use client";

import React, { useState } from "react";
import {
  Target,
  Loader2,
  ChevronRight,
  DollarSign,
  Clock,
  CheckCircle2,
  XCircle,
  Zap,
  Search,
  BarChart3,
  FileText,
  Shield,
  BookOpen,
  AlertTriangle,
} from "lucide-react";
import { ResearchPlanRecord, MilestonePlan, ResearchDepth } from "@/types/plan4";

// ─── Milestone Icon Map ────────────────────────────────────────────────────────

const MILESTONE_ICONS: Record<string, React.ReactNode> = {
  fetch_documents:       <FileText size={16} />,
  extract_financials:    <BarChart3 size={16} />,
  build_financial_model: <Zap size={16} />,
  peer_benchmark:        <Search size={16} />,
  synthesise:            <BookOpen size={16} />,
  compliance_audit:      <Shield size={16} />,
};

// ─── Depth Selector ────────────────────────────────────────────────────────────

const DEPTH_OPTIONS: { value: ResearchDepth; label: string; description: string; color: string }[] = [
  {
    value: "quick",
    label: "Quick",
    description: "~10 min · $0.45 · 2yr filings, EV/EBITDA comparable",
    color: "#3b82f6",
  },
  {
    value: "standard",
    label: "Standard",
    description: "~25 min · $1.10 · 4yr filings, DCF, concalls, 3Y projection",
    color: "#8b5cf6",
  },
  {
    value: "deep",
    label: "Deep Dive",
    description: "~55 min · $2.40 · 6yr filings, Monte Carlo, DRHP, full synthesis",
    color: "#f59e0b",
  },
];

// ─── Component ─────────────────────────────────────────────────────────────────

interface GoalTerminalProps {
  sessionId: string;
  onPlanApproved: (plan: ResearchPlanRecord) => void;
}

export function GoalTerminal({ sessionId, onPlanApproved }: GoalTerminalProps) {
  const [goalText, setGoalText] = useState("");
  const [ticker, setTicker] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [depth, setDepth] = useState<ResearchDepth>("standard");
  const [phase, setPhase] = useState<"input" | "planning" | "review" | "approved">("input");
  const [plan, setPlan] = useState<ResearchPlanRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [approving, setApproving] = useState(false);

  const handleGeneratePlan = async () => {
    if (!goalText.trim() || !ticker.trim() || !companyName.trim()) return;
    setPhase("planning");
    setError(null);
    try {
      const res = await fetch("/api/agent/plan", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ goalText, ticker: ticker.toUpperCase(), companyName, depth, sessionId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to create plan.");
      setPlan(data.plan as ResearchPlanRecord);
      setPhase("review");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Unknown error");
      setPhase("input");
    }
  };

  const handleApprove = async () => {
    if (!plan) return;
    setApproving(true);
    try {
      const res = await fetch(`/api/agent/plan/${plan.id}/approve`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "x-api-secret": "equigen-internal" },
        body: JSON.stringify({ actorId: "analyst" }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message ?? "Failed to approve plan.");
      setPlan(data.plan as ResearchPlanRecord);
      setPhase("approved");
      onPlanApproved(data.plan as ResearchPlanRecord);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Approval failed.");
    } finally {
      setApproving(false);
    }
  };

  const handleEdit = () => {
    setPhase("input");
    setPlan(null);
  };

  const totalCost = plan?.costEstimate ?? 0;
  const totalMinutes = plan ? Math.ceil((plan.latencyEstS ?? 0) / 60) : 0;

  return (
    <div style={{
      background: "linear-gradient(135deg, #0f0f1a 0%, #1a1a2e 50%, #0f0f1a 100%)",
      border: "1px solid rgba(139, 92, 246, 0.25)",
      borderRadius: "16px",
      padding: "28px",
      fontFamily: "'Inter', sans-serif",
      maxWidth: "760px",
      width: "100%",
    }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "24px" }}>
        <div style={{
          width: "40px", height: "40px", borderRadius: "10px",
          background: "linear-gradient(135deg, #8b5cf6, #3b82f6)",
          display: "flex", alignItems: "center", justifyContent: "center",
        }}>
          <Target size={20} color="white" />
        </div>
        <div>
          <h2 style={{ margin: 0, fontSize: "18px", fontWeight: 700, color: "#f1f5f9" }}>
            Autonomous Research Goal
          </h2>
          <p style={{ margin: 0, fontSize: "13px", color: "#94a3b8" }}>
            Tell EquiGen what to research. It figures out how.
          </p>
        </div>
      </div>

      {/* ── Input Phase ── */}
      {(phase === "input" || phase === "planning") && (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {/* Ticker + Company */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 2fr", gap: "12px" }}>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                NSE / BSE Ticker
              </label>
              <input
                value={ticker}
                onChange={(e) => setTicker(e.target.value.toUpperCase())}
                placeholder="TATAMOTORS"
                disabled={phase === "planning"}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(15, 15, 26, 0.8)", color: "#f1f5f9", fontSize: "14px",
                  outline: "none", boxSizing: "border-box",
                  fontFamily: "'JetBrains Mono', 'Fira Code', monospace",
                }}
              />
            </div>
            <div>
              <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
                Company Name
              </label>
              <input
                value={companyName}
                onChange={(e) => setCompanyName(e.target.value)}
                placeholder="Tata Motors Limited"
                disabled={phase === "planning"}
                style={{
                  width: "100%", padding: "10px 14px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.2)",
                  background: "rgba(15, 15, 26, 0.8)", color: "#f1f5f9", fontSize: "14px",
                  outline: "none", boxSizing: "border-box",
                }}
              />
            </div>
          </div>

          {/* Goal Text */}
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "6px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Research Goal
            </label>
            <textarea
              value={goalText}
              onChange={(e) => setGoalText(e.target.value)}
              disabled={phase === "planning"}
              rows={4}
              placeholder={`e.g. "Initiation coverage on Tata Motors — deep dive with 5-year DCF, compare EV and ICE segments vs M&M and Eicher Motors, fetch latest concall guidance on margin recovery timeline."`}
              style={{
                width: "100%", padding: "12px 14px", borderRadius: "8px", border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "rgba(15, 15, 26, 0.8)", color: "#f1f5f9", fontSize: "14px",
                outline: "none", resize: "vertical", boxSizing: "border-box", lineHeight: "1.6",
                fontFamily: "'Inter', sans-serif",
              }}
            />
          </div>

          {/* Depth Selector */}
          <div>
            <label style={{ display: "block", fontSize: "12px", color: "#94a3b8", marginBottom: "8px", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em" }}>
              Research Depth
            </label>
            <div style={{ display: "flex", gap: "10px" }}>
              {DEPTH_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  onClick={() => setDepth(opt.value)}
                  disabled={phase === "planning"}
                  style={{
                    flex: 1, padding: "12px 10px", borderRadius: "10px", cursor: "pointer",
                    border: depth === opt.value ? `1.5px solid ${opt.color}` : "1px solid rgba(148, 163, 184, 0.15)",
                    background: depth === opt.value ? `${opt.color}18` : "rgba(15, 15, 26, 0.6)",
                    color: depth === opt.value ? opt.color : "#94a3b8",
                    textAlign: "center", transition: "all 0.2s",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "14px", marginBottom: "4px" }}>{opt.label}</div>
                  <div style={{ fontSize: "11px", lineHeight: "1.4", opacity: 0.8 }}>{opt.description}</div>
                </button>
              ))}
            </div>
          </div>

          {error && (
            <div style={{ display: "flex", alignItems: "center", gap: "8px", padding: "12px", borderRadius: "8px", background: "rgba(239, 68, 68, 0.1)", border: "1px solid rgba(239, 68, 68, 0.3)", color: "#fca5a5" }}>
              <AlertTriangle size={16} />
              <span style={{ fontSize: "13px" }}>{error}</span>
            </div>
          )}

          <button
            onClick={handleGeneratePlan}
            disabled={phase === "planning" || !goalText.trim() || !ticker.trim() || !companyName.trim()}
            style={{
              padding: "14px 24px", borderRadius: "10px", border: "none", cursor: "pointer",
              background: phase === "planning" ? "rgba(139, 92, 246, 0.3)" : "linear-gradient(135deg, #8b5cf6, #3b82f6)",
              color: "white", fontWeight: 700, fontSize: "15px", display: "flex", alignItems: "center",
              justifyContent: "center", gap: "8px", transition: "all 0.2s", width: "100%",
            }}
          >
            {phase === "planning" ? (
              <><Loader2 size={18} style={{ animation: "spin 1s linear infinite" }} /> Generating Research Plan…</>
            ) : (
              <><ChevronRight size={18} /> Generate Research Plan</>
            )}
          </button>
        </div>
      )}

      {/* ── Review Phase ── */}
      {phase === "review" && plan && (
        <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {/* Plan Header */}
          <div style={{ padding: "16px", borderRadius: "10px", background: "rgba(139, 92, 246, 0.08)", border: "1px solid rgba(139, 92, 246, 0.2)" }}>
            <div style={{ fontSize: "13px", color: "#c4b5fd", fontWeight: 600, marginBottom: "4px" }}>Research Plan — {plan.depth.charAt(0).toUpperCase() + plan.depth.slice(1)} Depth</div>
            <div style={{ fontSize: "15px", color: "#f1f5f9", lineHeight: "1.5" }}>{plan.goalText}</div>
          </div>

          {/* Cost + Latency */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
            <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(15,15,26,0.6)", border: "1px solid rgba(148,163,184,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
              <DollarSign size={18} color="#34d399" />
              <div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Estimated Cost</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#34d399" }}>${totalCost.toFixed(3)}</div>
              </div>
            </div>
            <div style={{ padding: "14px", borderRadius: "8px", background: "rgba(15,15,26,0.6)", border: "1px solid rgba(148,163,184,0.1)", display: "flex", alignItems: "center", gap: "10px" }}>
              <Clock size={18} color="#60a5fa" />
              <div>
                <div style={{ fontSize: "12px", color: "#64748b" }}>Estimated Time</div>
                <div style={{ fontSize: "18px", fontWeight: 700, color: "#60a5fa" }}>~{totalMinutes} min</div>
              </div>
            </div>
          </div>

          {/* Milestones */}
          <div>
            <div style={{ fontSize: "12px", color: "#94a3b8", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "10px" }}>
              Execution Milestones ({plan.milestones.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              {plan.milestones.map((m: MilestonePlan, i: number) => (
                <div key={m.id} style={{
                  display: "flex", alignItems: "flex-start", gap: "12px", padding: "12px 14px",
                  borderRadius: "8px", background: "rgba(15, 15, 26, 0.5)", border: "1px solid rgba(148, 163, 184, 0.08)",
                }}>
                  <div style={{ color: "#8b5cf6", marginTop: "2px", flexShrink: 0 }}>
                    {MILESTONE_ICONS[m.type] ?? <ChevronRight size={16} />}
                  </div>
                  <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <span style={{ fontSize: "12px", color: "#64748b", fontWeight: 600, minWidth: "20px" }}>{i + 1}.</span>
                      <span style={{ fontSize: "14px", fontWeight: 600, color: "#e2e8f0" }}>{m.label}</span>
                    </div>
                    <div style={{ fontSize: "12px", color: "#64748b", marginTop: "3px", marginLeft: "28px" }}>{m.description}</div>
                  </div>
                  <div style={{ textAlign: "right", flexShrink: 0 }}>
                    <div style={{ fontSize: "11px", color: "#475569" }}>~{m.estimatedMinutes}m</div>
                    <div style={{ fontSize: "11px", color: "#34d399" }}>${m.estimatedCostUsd.toFixed(3)}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Approve / Edit */}
          <div style={{ display: "flex", gap: "12px" }}>
            <button
              onClick={handleEdit}
              style={{
                flex: 1, padding: "12px 20px", borderRadius: "10px", border: "1px solid rgba(148, 163, 184, 0.2)",
                background: "transparent", color: "#94a3b8", fontWeight: 600, fontSize: "14px", cursor: "pointer",
              }}
            >
              Edit Goal
            </button>
            <button
              onClick={handleApprove}
              disabled={approving}
              style={{
                flex: 2, padding: "12px 20px", borderRadius: "10px", border: "none",
                background: approving ? "rgba(34, 197, 94, 0.3)" : "linear-gradient(135deg, #22c55e, #16a34a)",
                color: "white", fontWeight: 700, fontSize: "14px", cursor: "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: "8px",
              }}
            >
              {approving ? <><Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> Approving…</> : <><CheckCircle2 size={16} /> Approve & Execute Plan</>}
            </button>
          </div>
        </div>
      )}

      {/* ── Approved Phase ── */}
      {phase === "approved" && (
        <div style={{
          padding: "24px", borderRadius: "12px", textAlign: "center",
          background: "rgba(34, 197, 94, 0.08)", border: "1px solid rgba(34, 197, 94, 0.3)",
        }}>
          <CheckCircle2 size={40} color="#22c55e" style={{ marginBottom: "12px" }} />
          <div style={{ fontSize: "18px", fontWeight: 700, color: "#f1f5f9", marginBottom: "6px" }}>
            Research Plan Approved!
          </div>
          <div style={{ fontSize: "13px", color: "#94a3b8" }}>
            EquiGen is now executing your research plan. Monitor progress in the Trajectory Feed →
          </div>
        </div>
      )}

      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
