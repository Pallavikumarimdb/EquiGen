import { useState } from "react";
import { EquityResearchData } from "@/types";

/**
 * Custom hook to handle report generation state and trigger API.
 */
export function useReport() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<EquityResearchData | null>(null);

  const generateReport = async (companyName: string, file: File) => {
    setLoading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append("companyName", companyName);
      formData.append("file", file);

      const response = await fetch("/api/report/generate", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || "Failed to generate equity report");
      }

      const reportData: EquityResearchData = await response.json();
      setData(reportData);
    } catch (err: unknown) {
      const errMsg =
        err instanceof Error ? err.message : "An unexpected error occurred";
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (reportId: string) => {
    const res = await fetch(`/api/download?id=${encodeURIComponent(reportId)}`);
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(
        errData.message || `PDF download failed (HTTP ${res.status}).`,
      );
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `equity-report-${reportId.toLowerCase()}.pdf`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  };

  return {
    generateReport,
    downloadPDF,
    loading,
    error,
    data,
  };
}
