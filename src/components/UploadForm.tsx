'use client';

import React, { useState } from 'react';
import { useReport } from '@/hooks/use-report';

/**
 * File upload and company selection form component.
 */
export function UploadForm() {
  const [companyName, setCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const { generateReport, loading, error } = useReport();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName || !file) return;
    await generateReport(companyName, file);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 bg-white rounded-lg border border-slate-200 shadow-sm space-y-4">
      <h2 className="text-xl font-bold text-slate-800">Generate Equity Research Report</h2>
      
      <div>
        <label className="block text-sm font-medium text-slate-700">Company Name</label>
        <input
          type="text"
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="e.g. Reliance Industries"
          className="mt-1 block w-full px-3 py-2 border border-slate-300 rounded-md focus:outline-none focus:ring-blue-500 focus:border-blue-500"
          required
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-slate-700">Financial Document (PDF, CSV, TXT)</label>
        <input
          type="file"
          accept=".pdf,.csv,.txt"
          onChange={(e) => setFile(e.target.files?.[0] || null)}
          className="mt-1 block w-full text-sm text-slate-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
          required
        />
      </div>

      {error && <div className="text-red-600 text-sm">{error}</div>}

      <button
        type="submit"
        disabled={loading}
        className="w-full py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:bg-slate-400"
      >
        {loading ? 'Processing & Extracting...' : 'Generate Geojit-Style Report'}
      </button>
    </form>
  );
}
export default UploadForm;
