export interface SectorKPI {
  label: string;
  key: string;
  unit: string;
  benchmark: string;
  description: string;
}

export interface SectorTemplate {
  id: string;
  name: string;
  description: string;
  kpis: SectorKPI[];
}

export const SECTOR_TEMPLATES: Record<string, SectorTemplate> = {
  banking: {
    id: "banking",
    name: "Banking & Financial Services (BFSI)",
    description: "Tailored for Banks, NBFCs, and Housing Finance Companies.",
    kpis: [
      { label: "Net Interest Margin (NIM)", key: "nim", unit: "%", benchmark: "> 3.5%", description: "Core interest profitability" },
      { label: "Gross NPA Ratio", key: "gnpa", unit: "%", benchmark: "< 2.5%", description: "Asset quality & non-performing loans" },
      { label: "Net NPA Ratio", key: "nnpa", unit: "%", benchmark: "< 0.8%", description: "Net unprovisioned bad loans" },
      { label: "Provision Coverage Ratio (PCR)", key: "pcr", unit: "%", benchmark: "> 75%", description: "Bad debt loss protection" },
      { label: "CASA Ratio", key: "casa", unit: "%", benchmark: "> 40%", description: "Low-cost deposit share" },
    ],
  },
  it: {
    id: "it",
    name: "IT & Technology Services",
    description: "Tailored for IT services, SaaS, and ER&D companies.",
    kpis: [
      { label: "Deal Total Contract Value (TCV)", key: "tcv", unit: "$M", benchmark: "Growing YoY", description: "New deal wins pipeline" },
      { label: "LTM Attrition Rate", key: "attrition", unit: "%", benchmark: "< 14%", description: "Employee retention stability" },
      { label: "Offshore Revenue Share", key: "offshore", unit: "%", benchmark: "> 60%", description: "Cost efficiency delivery mix" },
      { label: "Utilisation Rate", key: "utilisation", unit: "%", benchmark: "> 83%", description: "Workforce billable efficiency" },
    ],
  },
  auto: {
    id: "auto",
    name: "Automobiles & Auto Components",
    description: "Tailored for Passenger Vehicles, Commercial Vehicles, and 2-Wheelers.",
    kpis: [
      { label: "Total Volume Sales", key: "volume", unit: "Units", benchmark: "YoY Growth", description: "Total vehicle units sold" },
      { label: "Realization per Vehicle (ASP)", key: "asp", unit: "₹", benchmark: "Upward Trend", description: "Average Selling Price per unit" },
      { label: "EBITDA per Vehicle", key: "ebitda_per_unit", unit: "₹", benchmark: "Margin driver", description: "Operating profit contribution per unit" },
    ],
  },
  pharma: {
    id: "pharma",
    name: "Pharmaceuticals & Healthcare",
    description: "Tailored for Formulations, APIs, and Biotech companies.",
    kpis: [
      { label: "R&D Spend % of Sales", key: "rd_spend", unit: "%", benchmark: "6 - 9%", description: "Innovation & pipeline reinvestment" },
      { label: "US FDA Approved Sites", key: "fda_approved", unit: "Sites", benchmark: "Compliant", description: "Regulatory compliance status" },
      { label: "Export Mix Share", key: "export_share", unit: "%", benchmark: "> 50%", description: "Global revenue diversification" },
    ],
  },
};

/**
 * Resolves the sector template matching a given sector name or keyword.
 */
export function getSectorTemplate(sectorName?: string | null): SectorTemplate {
  if (!sectorName) return SECTOR_TEMPLATES.banking;

  const normalized = sectorName.toLowerCase();

  if (normalized.includes("bank") || normalized.includes("finance") || normalized.includes("nbfc") || normalized.includes("bfsi")) {
    return SECTOR_TEMPLATES.banking;
  }
  if (normalized.includes("it") || normalized.includes("tech") || normalized.includes("software") || normalized.includes("computer")) {
    return SECTOR_TEMPLATES.it;
  }
  if (normalized.includes("auto") || normalized.includes("motor") || normalized.includes("vehicle")) {
    return SECTOR_TEMPLATES.auto;
  }
  if (normalized.includes("pharma") || normalized.includes("health") || normalized.includes("drug") || normalized.includes("bio")) {
    return SECTOR_TEMPLATES.pharma;
  }

  return SECTOR_TEMPLATES.banking;
}

/**
 * Generates an HTML Sector KPI Dashboard Block for injection into reports.
 */
export function generateSectorKPIHTML(sectorName?: string | null): string {
  const template = getSectorTemplate(sectorName);
  
  const kpiCards = template.kpis
    .map(
      (kpi) => `
      <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 10px; margin-bottom: 8px;">
        <div style="font-size: 10px; font-weight: bold; color: #64748b; text-transform: uppercase;">${kpi.label}</div>
        <div style="font-size: 14px; font-weight: 800; color: #0f172a; margin-top: 2px;">Target Benchmark: ${kpi.benchmark}</div>
        <div style="font-size: 9px; color: #94a3b8; margin-top: 2px;">${kpi.description}</div>
      </div>`
    )
    .join("");

  return `
    <div style="margin-top: 16px; margin-bottom: 16px;">
      <h4 style="font-size: 11px; font-weight: bold; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
        🎯 Sector KPI Framework — ${template.name}
      </h4>
      <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px;">
        ${kpiCards}
      </div>
    </div>
  `;
}
