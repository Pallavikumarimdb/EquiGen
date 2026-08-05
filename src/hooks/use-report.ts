import { useState } from 'react';
import { EquityResearchData } from '@/types';

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
      formData.append('companyName', companyName);
      formData.append('file', file);

      const response = await fetch('/api/report/generate', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errJson = await response.json().catch(() => ({}));
        throw new Error(errJson.message || 'Failed to generate equity report');
      }

      const reportData: EquityResearchData = await response.json();
      setData(reportData);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred');
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (reportId: string) => {
    try {
      window.open(`/api/report/download?id=${reportId}`, '_blank');
    } catch (err: any) {
      console.error('Failed to download PDF:', err);
    }
  };

  return {
    generateReport,
    downloadPDF,
    loading,
    error,
    data,
  };
}
