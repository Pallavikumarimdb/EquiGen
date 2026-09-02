/**
 * plan4.md — Autonomous AI Equity Research Analyst
 * TypeScript types for the Master Planner, Subagent Swarm, and Execution Environment.
 */

// ─── Research Goal ─────────────────────────────────────────────────────────────

export type ResearchDepth = "quick" | "standard" | "deep";

export interface ResearchGoal {
  /** Plain-language description of the research intent */
  goalText: string;
  /** Primary company ticker (e.g. "TATAMOTORS") */
  ticker: string;
  /** Company name for display */
  companyName: string;
  /** ISIN for exchange filing lookups */
  isin?: string;
  /** Research depth setting */
  depth: ResearchDepth;
  /** sessionId (ResearchSession FK) */
  sessionId: string;
}

// ─── Research Plan Milestones ──────────────────────────────────────────────────

export type MilestoneType =
  | "fetch_documents"
  | "extract_financials"
  | "build_financial_model"
  | "peer_benchmark"
  | "synthesise"
  | "compliance_audit";

export interface BaseMilestone {
  id: string;
  type: MilestoneType;
  label: string;
  description: string;
  agentType: SubagentType;
  estimatedMinutes: number;
  estimatedCostUsd: number;
  dependsOn?: string[]; // milestone ids
  status: MilestoneStatus;
}

export type MilestoneStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export interface FetchDocumentsMilestone extends BaseMilestone {
  type: "fetch_documents";
  config: {
    sourceTypes: ("annual_report" | "quarterly_results" | "concall_transcript" | "drhp" | "credit_rating")[];
    yearsBack: number;
  };
}

export interface ExtractFinancialsMilestone extends BaseMilestone {
  type: "extract_financials";
  config: {
    fieldsToExtract: string[];
    fiscalYears: string[];
  };
}

export interface BuildFinancialModelMilestone extends BaseMilestone {
  type: "build_financial_model";
  config: {
    modelType: "dcf" | "three_statement" | "sotp" | "ev_ebitda";
    projectionYears: number;
    runMonteCarlo: boolean;
    runSensitivity: boolean;
  };
}

export interface PeerBenchmarkMilestone extends BaseMilestone {
  type: "peer_benchmark";
  config: {
    peerTickers: string[];
    metrics: string[];
  };
}

export interface SynthesiseMilestone extends BaseMilestone {
  type: "synthesise";
  config: {
    sections: ReportSectionName[];
  };
}

export interface ComplianceAuditMilestone extends BaseMilestone {
  type: "compliance_audit";
  config: {
    checkSEBIRules: boolean;
    checkMathAudit: boolean;
    checkWatermark: boolean;
  };
}

export type MilestonePlan =
  | FetchDocumentsMilestone
  | ExtractFinancialsMilestone
  | BuildFinancialModelMilestone
  | PeerBenchmarkMilestone
  | SynthesiseMilestone
  | ComplianceAuditMilestone;

// ─── Research Plan ─────────────────────────────────────────────────────────────

export interface ResearchPlanRecord {
  id: string;
  sessionId: string;
  goalText: string;
  milestones: MilestonePlan[];
  depth: ResearchDepth;
  costEstimate: number;  // USD total
  latencyEstS: number;   // seconds total
  status: ResearchPlanStatus;
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdAt: string;
}

export type ResearchPlanStatus =
  | "pending"
  | "approved"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

// ─── Subagent Types ────────────────────────────────────────────────────────────

export type SubagentType = "document" | "modeling" | "market_intel" | "compliance" | "synthesis";

export interface SubagentRunRecord {
  id: string;
  planId: string;
  agentType: SubagentType;
  milestoneRef?: string | null;
  status: "running" | "completed" | "failed";
  inputJson?: unknown;
  outputJson?: unknown;
  latencyMs?: number | null;
  costUsd?: number | null;
  createdAt: string;
}

// ─── Sandbox Artifacts ─────────────────────────────────────────────────────────

export type SandboxArtifactType =
  | "python_script"
  | "chart_png"
  | "csv"
  | "json"
  | "compliance_report_json";

export interface SandboxArtifactRecord {
  id: string;
  runId: string;
  artifactType: SandboxArtifactType;
  storageUrl?: string | null;
  codeText?: string | null;
  stdout?: string | null;
  stderr?: string | null;
  exitCode?: number | null;
  createdAt: string;
}

// ─── Steering Events ───────────────────────────────────────────────────────────

export type SteeringEventType =
  | "pause"
  | "resume"
  | "redirect"
  | "cancel"
  | "approve_milestone"
  | "skip_milestone";

export interface SteeringEventRecord {
  id: string;
  planId: string;
  actorId?: string | null;
  eventType: SteeringEventType;
  payload?: Record<string, unknown> | null;
  createdAt: string;
}

// ─── Report Sections (Synthesis Agent) ────────────────────────────────────────

export type ReportSectionName =
  | "executive_summary"
  | "business_description"
  | "financial_analysis"
  | "valuation"
  | "investment_catalysts"
  | "key_risks"
  | "swot"
  | "management_qa_highlights"
  | "disclosures";

export interface ReportSection {
  name: ReportSectionName;
  content: string;
  citations: string[];         // source_doc_ref IDs
  lastUpdatedAt: string;
  agentConfidence?: number;    // 0-1
}

// ─── SSE Trajectory Stream Event Types ────────────────────────────────────────

export type TrajectoryEventType =
  | "planner_thought"
  | "subagent_start"
  | "tool_call"
  | "tool_result"
  | "sandbox_exec"
  | "sandbox_result"
  | "milestone_done"
  | "draft_updated"
  | "plan_complete"
  | "steering_applied"
  | "error";

export interface TrajectoryEvent {
  eventType: TrajectoryEventType;
  timestamp: string;
  planId: string;
  milestoneRef?: string;
  data: Record<string, unknown>;
}

// ─── Compliance Report (Phase 15) ─────────────────────────────────────────────

export type ComplianceCheckSeverity = "critical" | "warning" | "info";

export interface ComplianceCheck {
  id: string;
  label: string;
  category: "sebi_rules" | "math_audit" | "watermark" | "source_citation" | "completeness";
  passed: boolean;
  severity: ComplianceCheckSeverity;
  details?: string;
  affectedSection?: ReportSectionName;
}

export interface ComplianceReport {
  runId: string;
  timestamp: string;
  checks: ComplianceCheck[];
  passed: boolean;
  criticalFailures: string[];
}

// ─── DCF / Modeling Output (Phase 11) ─────────────────────────────────────────

export interface SensitivityMatrix {
  rowLabel: string;   // e.g. "WACC"
  colLabel: string;   // e.g. "Terminal Growth Rate"
  rowValues: number[];
  colValues: number[];
  matrix: number[][];  // targetPrice at each (row, col) combination
}

export interface MonteCarloResult {
  simulations: number;
  meanTargetPrice: number;
  medianTargetPrice: number;
  p10TargetPrice: number;
  p90TargetPrice: number;
  chartUrl?: string;
}

export interface ModelingOutput {
  modelType: "dcf" | "three_statement" | "sotp" | "ev_ebitda";
  baseTargetPrice: number;
  bullCasePrice: number;
  bearCasePrice: number;
  assumptions: Record<string, number | string>;
  sensitivityMatrix?: SensitivityMatrix;
  monteCarlo?: MonteCarloResult;
  chartUrls: string[];
}
