export interface WhiteLabelConfig {
  orgName: string;
  logoUrl?: string | null;
  primaryColor: string; // e.g. "#0f172a"
  accentColor: string;  // e.g. "#10b981"
  headerText?: string | null;
  footerText?: string | null;
  sebiRegNo?: string | null;
}

export const DEFAULT_WHITE_LABEL: WhiteLabelConfig = {
  orgName: "EquiGen Institutional Research",
  primaryColor: "#0f172a",
  accentColor: "#10b981",
  headerText: "EQUITY RESEARCH REPORT",
  footerText: "SEBI Registered Research Analyst Firm — Confidential & Proprietary",
  sebiRegNo: "INH000001234",
};

/**
   Injects custom white-label CSS variables and corporate headers into HTML string.
 */
export function applyWhiteLabelBranding(
  html: string,
  config: Partial<WhiteLabelConfig> = {}
): string {
  const merged: WhiteLabelConfig = {
    ...DEFAULT_WHITE_LABEL,
    ...config,
  };

  const brandingStyle = `
    <style id="equigen-white-label-branding">
      :root {
        --equigen-primary-color: ${merged.primaryColor};
        --equigen-accent-color: ${merged.accentColor};
      }
      .brand-header { background-color: var(--equigen-primary-color) !important; color: #ffffff !important; }
      .brand-accent { color: var(--equigen-accent-color) !important; }
      .brand-accent-bg { background-color: var(--equigen-accent-color) !important; }
    </style>
  `;

  // Inject logo if present
  let brandedHtml = html;
  if (merged.logoUrl && brandedHtml.includes('<header class="brand-header">')) {
    brandedHtml = brandedHtml.replace(
      '<header class="brand-header">',
      `<header class="brand-header"><img src="${merged.logoUrl}" alt="${merged.orgName}" class="h-8 mb-2 object-contain" />`
    );
  }

  return brandedHtml.replace("</head>", `${brandingStyle}</head>`);
}
