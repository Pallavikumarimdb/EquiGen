/**
 * Model Context Protocol (MCP) Registry & Tool Interface
 * Provides standardized schema for connecting external equity research tools,
 * live market feeds, and Python execution environments.
 */

export interface MCPToolDefinition {
  name: string;
  description: string;
  category: "market_data" | "filing_scraper" | "valuation" | "compliance" | "custom";
  version: string;
  status: "active" | "connecting" | "offline";
  endpointUrl?: string;
  parameters: Record<string, { type: string; description: string; required?: boolean }>;
}

export interface MCPServerConfig {
  id: string;
  name: string;
  endpointUrl: string;
  authType: "none" | "bearer" | "api_key";
  apiKey?: string;
  status: "connected" | "disconnected" | "error";
  tools: MCPToolDefinition[];
  lastPingAt?: string;
}

export const DEFAULT_CONNECTED_MCP_TOOLS: MCPToolDefinition[] = [
  {
    name: "bse_nse_disclosure_mcp",
    description: "Fetches live regulatory corporate filings, credit rating announcements, and investor presentations from BSE & NSE India.",
    category: "filing_scraper",
    version: "1.2.0",
    status: "active",
    parameters: {
      ticker: { type: "string", description: "BSE/NSE stock ticker", required: true },
      filingType: { type: "string", description: "annual_report | concall | credit_rating" },
    },
  },
  {
    name: "dcf_valuation_sandbox_mcp",
    description: "Runs quantitative 3-tier Discounted Cash Flow models in an isolated sandbox with sensitivity analysis.",
    category: "valuation",
    version: "2.0.1",
    status: "active",
    parameters: {
      wacc: { type: "number", description: "Weighted Average Cost of Capital (e.g. 12.0)" },
      terminalGrowth: { type: "number", description: "Perpetual terminal growth rate" },
      marginDeltaBps: { type: "number", description: "Operating margin shift in bps" },
    },
  },
  {
    name: "concall_transcript_mcp",
    description: "Parses earnings conference call audio and transcripts to extract management guidance and tone sentiment.",
    category: "market_data",
    version: "1.0.4",
    status: "active",
    parameters: {
      companyName: { type: "string", description: "Company legal name", required: true },
      quarter: { type: "string", description: "e.g. Q3 FY25" },
    },
  },
  {
    name: "sebi_compliance_auditor_mcp",
    description: "Audits report disclosures and certifications against SEBI (Research Analysts) Regulations, 2014.",
    category: "compliance",
    version: "1.4.0",
    status: "active",
    parameters: {
      reportId: { type: "string", description: "Research note identifier", required: true },
    },
  },
];
