import { EquityResearchData } from "@/types";
export type { ResearchPlanRecord } from "@/types/plan4";

export type PersonaType = "buyside" | "sellside" | "individual";

export type DashboardMode = "workspace" | "autonomous";

export type HistoryFilterType = "all" | "autonomous" | "manual";

export interface DashboardHistoryItem {
  id: string;
  companyName: string;
  fileName: string;
  createdAt: string;
  reportData: EquityResearchData;
  reportPdfBase64: string | null;
  status?: string;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
  modelUsedForFinancials?: string | null;
  sourceType?: "autonomous" | "manual";
}

/** Org-level plan entitlements, returned alongside the profile by /api/auth/me. */
export interface UserPlanInfo {
  id: string;
  name: string;
  reportsPerMonth: number | null;
  status: string;
}

export interface UserSessionProfile {
  id: string;
  name: string;
  email: string;
  role: string;
  sebiRegNo: string | null;
  orgName: string;
  plan?: UserPlanInfo | null;
}

export interface DashboardToast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

export interface PersonaConfig {
  id: PersonaType;
  title: string;
  subtitle: string;
  badge: string;
  icon: string;
  color: string;
  focusMetrics: string[];
}
