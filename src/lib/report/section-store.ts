/**
 * Section Store & Version History Engine
 * Manages section revisions, stores section versions in memory/cache,
 * and generates clean markdown diffs between section iterations.
 */

import { ReportSection, ReportSectionName } from "@/types/plan4";

export interface SectionVersion {
  versionId: string;
  sectionName: ReportSectionName;
  content: string;
  citations: string[];
  updatedAt: string;
  author: "synthesis_subagent" | "analyst_steer" | "compliance_subagent";
}

export interface SectionDiff {
  sectionName: ReportSectionName;
  previousVersionId?: string;
  newVersionId: string;
  addedLines: number;
  removedLines: number;
  diffSummary: string;
}

export class SectionStore {
  private static versionHistory: Map<string, SectionVersion[]> = new Map();

  /**
   * Saves a new version of a report section
   */
  public static saveSectionVersion(
    planId: string,
    sectionName: ReportSectionName,
    content: string,
    citations: string[] = [],
    author: SectionVersion["author"] = "synthesis_subagent"
  ): SectionVersion {
    const key = `${planId}:${sectionName}`;
    const history = this.versionHistory.get(key) ?? [];

    const newVersion: SectionVersion = {
      versionId: `v${history.length + 1}_${Date.now()}`,
      sectionName,
      content,
      citations,
      updatedAt: new Date().toISOString(),
      author,
    };

    history.push(newVersion);
    this.versionHistory.set(key, history);

    return newVersion;
  }

  /**
   * Retrieves all versions of a section
   */
  public static getSectionHistory(planId: string, sectionName: ReportSectionName): SectionVersion[] {
    const key = `${planId}:${sectionName}`;
    return this.versionHistory.get(key) ?? [];
  }

  /**
   * Retrieves latest versions of all sections for a plan
   */
  public static getLatestSections(planId: string): ReportSection[] {
    const sections: ReportSection[] = [];
    const sectionNames: ReportSectionName[] = [
      "executive_summary",
      "business_description",
      "financial_analysis",
      "valuation",
      "investment_catalysts",
      "key_risks",
      "swot",
      "management_qa_highlights",
      "disclosures",
    ];

    for (const name of sectionNames) {
      const history = this.getSectionHistory(planId, name);
      if (history.length > 0) {
        const latest = history[history.length - 1];
        sections.push({
          name: latest.sectionName,
          content: latest.content,
          citations: latest.citations,
          lastUpdatedAt: latest.updatedAt,
        });
      }
    }

    return sections;
  }

  /**
   * Computes diff summary between two section text contents
   */
  public static computeDiff(
    sectionName: ReportSectionName,
    oldText: string,
    newText: string
  ): SectionDiff {
    const oldLines = oldText ? oldText.split("\n") : [];
    const newLines = newText ? newText.split("\n") : [];

    let addedLines = 0;
    let removedLines = 0;

    const oldSet = new Set(oldLines);
    const newSet = new Set(newLines);

    for (const line of newLines) {
      if (!oldSet.has(line) && line.trim().length > 0) addedLines++;
    }
    for (const line of oldLines) {
      if (!newSet.has(line) && line.trim().length > 0) removedLines++;
    }

    return {
      sectionName,
      newVersionId: `v_${Date.now()}`,
      addedLines,
      removedLines,
      diffSummary: `+${addedLines} lines added, -${removedLines} lines modified in ${sectionName.replace("_", " ")}`,
    };
  }
}
