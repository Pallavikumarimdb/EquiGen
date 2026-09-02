/**
 * SEBI Compliance Tool (Phase 15)
 * Enforces SEBI (Research Analysts) Regulations, 2014 rules and guidelines:
 * 1. SEBI Registration Number validation (e.g. INH000012345).
 * 2. Mandated Risk & Standard Disclaimer checks.
 * 3. Rating Definition Disclosure (BUY, ACCUMULATE, HOLD, REDUCE, SELL definitions).
 * 4. Conflict of Interest & Ownership disclosures.
 * 5. Price Target timeframe & methodology disclosure.
 */

export interface SebiAuditViolation {
  ruleId: string;
  ruleName: string;
  severity: "critical" | "warning" | "info";
  description: string;
  recommendation: string;
}

export interface SebiAuditResult {
  isCompliant: boolean;
  score: number; // 0 to 100
  violations: SebiAuditViolation[];
  mandatoryDisclaimersPresent: string[];
  missingDisclaimers: string[];
}

export class SebiComplianceTool {
  private static MANDATORY_DISCLAIMERS = [
    "SEBI Registration Number",
    "Conflict of Interest Disclosure",
    "Rating Definition & Target Timeframe",
    "Standard Risk Warning",
    "Analyst Certification",
  ];

  /**
   * Performs automated SEBI compliance audit across report sections
   */
  public static auditReport(
    sectionsText: string,
    sebiRegNo?: string,
    analystName?: string
  ): SebiAuditResult {
    const violations: SebiAuditViolation[] = [];
    const present: string[] = [];
    const missing: string[] = [];

    // 1. Check SEBI Registration Number
    const regNoToTest = sebiRegNo ?? "";
    const hasValidRegNo = /INH\d{9}/i.test(regNoToTest) || /INH\d{9}/i.test(sectionsText);

    if (hasValidRegNo) {
      present.push("SEBI Registration Number");
    } else {
      missing.push("SEBI Registration Number");
      violations.push({
        ruleId: "SEBI_RA_REG_NO",
        ruleName: "SEBI Registration Number Missing/Invalid",
        severity: "critical",
        description: "Reports published to clients must prominently feature a valid SEBI RA registration number (format: INH0000XXXXX).",
        recommendation: "Provide a valid SEBI RA Registration Number in author metadata or report footer.",
      });
    }

    // 2. Conflict of Interest Disclosure
    if (/conflict of interest|ownership|holding in target company/i.test(sectionsText)) {
      present.push("Conflict of Interest Disclosure");
    } else {
      missing.push("Conflict of Interest Disclosure");
      violations.push({
        ruleId: "SEBI_CONFLICT_DISCLOSURE",
        ruleName: "Conflict of Interest Disclosure Missing",
        severity: "critical",
        description: "SEBI RA Regulation 19 requires explicit disclosure of financial interest or material conflicts of interest.",
        recommendation: "Append explicit disclosure regarding analyst/firm holding and business relationships with the issuer.",
      });
    }

    // 3. Rating Definition & Target Timeframe
    if (/(?:BUY|ACCUMULATE|HOLD|REDUCE|SELL)\s*[:=–-]|12-month target price|horizon/i.test(sectionsText)) {
      present.push("Rating Definition & Target Timeframe");
    } else {
      missing.push("Rating Definition & Target Timeframe");
      violations.push({
        ruleId: "SEBI_RATING_DEF",
        ruleName: "Rating Definition or Target Horizon Missing",
        severity: "warning",
        description: "Recommendation ratings must include clear definition bands and investment target horizons.",
        recommendation: "Define rating benchmarks (e.g., BUY: >15% upside, 12-month horizon).",
      });
    }

    // 4. Standard Risk Warning
    if (/risk|disclaimer|subject to market risk/i.test(sectionsText)) {
      present.push("Standard Risk Warning");
    } else {
      missing.push("Standard Risk Warning");
      violations.push({
        ruleId: "SEBI_RISK_WARNING",
        ruleName: "Standard Investment Risk Disclaimer Missing",
        severity: "warning",
        description: "Standard risk disclaimer required under SEBI regulations.",
        recommendation: "Add standard statutory disclaimer: 'Investments in securities market are subject to market risks.'",
      });
    }

    // 5. Analyst Certification
    if (/analyst certification|certified that the views/i.test(sectionsText)) {
      present.push("Analyst Certification");
    } else {
      missing.push("Analyst Certification");
      violations.push({
        ruleId: "SEBI_ANALYST_CERT",
        ruleName: "Analyst Certification Clause Missing",
        severity: "warning",
        description: "SEBI RA Regulation 18 requires analyst certification that expressed views reflect personal opinion.",
        recommendation: "Include analyst certification statement signed by certified Research Analyst.",
      });
    }

    // Score calculation
    const criticalViolations = violations.filter((v) => v.severity === "critical").length;
    const warningViolations = violations.filter((v) => v.severity === "warning").length;

    let score = 100 - criticalViolations * 35 - warningViolations * 10;
    score = Math.max(0, Math.min(100, score));

    return {
      isCompliant: criticalViolations === 0 && score >= 70,
      score,
      violations,
      mandatoryDisclaimersPresent: present,
      missingDisclaimers: missing,
    };
  }

  /**
   * Generates standard SEBI statutory disclaimers footer text
   */
  public static generateSebiDisclaimers(
    analystName: string = "Certified Analyst",
    sebiRegNo: string = "INH000012345",
    orgName: string = "EquiGen Research"
  ): string {
    return `
---
### SEBI Statutory Disclosures & Compliance Disclaimers

**Research Analyst:** ${analystName} | **SEBI Registration No:** ${sebiRegNo}  
**Organization:** ${orgName}  

**Analyst Certification:**  
I, ${analystName}, hereby certify that all of the views expressed in this research report accurately reflect my personal views about the subject company or companies and its or their securities.

**Disclosures & Conflict of Interest:**  
• Neither the Analyst nor ${orgName} has any financial interest or actual/beneficial ownership of 1% or more in the subject company at the end of the month preceding publication.  
• The Analyst has not received any compensation from the subject company in the past 12 months for investment banking or brokerage services.  

**Statutory Disclaimer:**  
Investments in securities market are subject to market risks. Read all related documents carefully before investing. Registration granted by SEBI and certification from NISM in no way guarantee performance of the intermediary or provide any assurance of returns to investors.
`;
  }
}
