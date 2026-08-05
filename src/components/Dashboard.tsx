'use client';

import React, { useState, useRef } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  BarChart3, 
  Activity, 
  TrendingUp, 
  Briefcase, 
  Layers, 
  Trash2 
} from 'lucide-react';
import { EquityResearchData } from '@/types';

type ProgressStep = {
  label: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
};

export function Dashboard() {
  const [companyName, setCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [reportData, setReportData] = useState<EquityResearchData | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: 'Reading uploaded document structure', status: 'idle' },
    { label: 'Extracting key metrics using Groq Llama 3.3 70B', status: 'idle' },
    { label: 'Formatting financial sheets & ratios', status: 'idle' },
    { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
  ]);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      validateAndSetFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      validateAndSetFile(e.target.files[0]);
    }
  };

  const validateAndSetFile = (selectedFile: File) => {
    setError(null);
    const validExtensions = ['.pdf', '.csv', '.txt'];
    const fileExtension = selectedFile.name.substring(selectedFile.name.lastIndexOf('.')).toLowerCase();

    if (!validExtensions.includes(fileExtension)) {
      setError('Unsupported file type. Please upload a PDF, CSV, or TXT document.');
      setFile(null);
      return;
    }
    setFile(selectedFile);
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const startGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setError('Please enter a company name.');
      return;
    }
    if (!file) {
      setError('Please upload a financial document.');
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);
    
    // Reset steps to idle
    const updatedSteps: ProgressStep[] = [
      { label: 'Reading uploaded document structure', status: 'idle' },
      { label: 'Extracting key metrics using Groq Llama 3.3 70B', status: 'idle' },
      { label: 'Formatting financial sheets & ratios', status: 'idle' },
      { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
    ];
    setSteps(updatedSteps);

    let rawText = '';
    let extractedData: any = null;

    try {
      // --- Step 1: Upload & Extract Raw Text ---
      setCurrentStepIndex(0);
      updatedSteps[0].status = 'running';
      setSteps([...updatedSteps]);

      const uploadFormData = new FormData();
      uploadFormData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: uploadFormData
      });

      if (!uploadRes.ok) {
        const errData = await uploadRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Failed to read document structure.');
      }

      const uploadData = await uploadRes.json();
      rawText = uploadData.text;

      updatedSteps[0].status = 'completed';
      setSteps([...updatedSteps]);

      // --- Step 2: AI Metric Extraction ---
      setCurrentStepIndex(1);
      updatedSteps[1].status = 'running';
      setSteps([...updatedSteps]);

      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ companyName, rawText })
      });

      if (!extractRes.ok) {
        const errData = await extractRes.json().catch(() => ({}));
        throw new Error(errData.message || 'AI extraction failed.');
      }

      extractedData = await extractRes.json();

      updatedSteps[1].status = 'completed';
      setSteps([...updatedSteps]);

      // --- Step 3: Format Financial Ratios & Generate Charts ---
      setCurrentStepIndex(2);
      updatedSteps[2].status = 'running';
      setSteps([...updatedSteps]);

      const reportRes = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractedData)
      });

      if (!reportRes.ok) {
        const errData = await reportRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Formatting financial ratios failed.');
      }

      const reportResponse = await reportRes.json();
      
      // Keep reportId stored on the extractedData object for dynamic downloads
      extractedData.company.ticker = reportResponse.reportId;

      updatedSteps[2].status = 'completed';
      setSteps([...updatedSteps]);

      // --- Step 4: Compile Geojit PDF ---
      setCurrentStepIndex(3);
      updatedSteps[3].status = 'running';
      setSteps([...updatedSteps]);

      // The PDF was successfully generated and saved by /api/report!
      // Add a slight delay for visual transition satisfaction
      await new Promise(resolve => setTimeout(resolve, 800));

      updatedSteps[3].status = 'completed';
      setSteps([...updatedSteps]);

      setReportData(extractedData);
    } catch (err: any) {
      console.error('Generation pipeline failed:', err);
      setError(err.message || 'An error occurred during report generation.');
      
      // Set failed status on the active step
      if (updatedSteps[currentStepIndex]) {
        updatedSteps[currentStepIndex].status = 'failed';
        setSteps([...updatedSteps]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Page Title */}
      <header className="mb-10 text-center md:text-left flex flex-col md:flex-row items-center justify-between border-b border-slate-200 pb-6">
        <div>
          <div className="flex items-center gap-2 justify-center md:justify-start">
            <span className="p-2 bg-primary text-white rounded-lg">
              <BarChart3 className="w-6 h-6" />
            </span>
            <span className="text-sm font-semibold tracking-wider text-secondary uppercase">BULL AI</span>
          </div>
          <h1 className="text-3xl font-extrabold text-primary mt-2">AI Equity Research Report Generator</h1>
          <p className="text-muted-foreground mt-1 text-sm md:text-base">
            Create publication-grade Geojit-style equity research reports instantly using Llama 3.3.
          </p>
        </div>
        <div className="mt-4 md:mt-0 flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full text-xs font-medium text-slate-600 border border-slate-200">
          <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
          Groq Llama 3.3 70B Active
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Column: Form Inputs */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <h2 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
              <Layers className="w-5 h-5 text-secondary" />
              Report Configuration
            </h2>
            <form onSubmit={startGeneration} className="space-y-5">
              {/* Company Name Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Tata Consultancy Services"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-secondary/20 focus:border-secondary transition-all text-sm"
                  disabled={loading}
                />
              </div>

              {/* Document Upload Input */}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">
                  Upload Financial Document
                </label>
                
                {!file ? (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-200 ${
                      isDragActive 
                        ? 'border-secondary bg-secondary/5' 
                        : 'border-slate-300 bg-slate-50 hover:bg-slate-100/70'
                    }`}
                  >
                    <Upload className="w-8 h-8 text-slate-400 mb-3" />
                    <span className="text-sm font-medium text-slate-700">
                      Drag & drop your file here, or <span className="text-secondary hover:underline">browse</span>
                    </span>
                    <span className="text-xs text-slate-400 mt-1">
                      Supports PDF, CSV, TXT up to 10MB
                    </span>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".pdf,.csv,.txt"
                      onChange={handleFileChange}
                      className="hidden"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-between p-3.5 bg-slate-50 border border-slate-200 rounded-xl">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-slate-800 truncate max-w-[200px] sm:max-w-[280px]">
                          {file.name}
                        </span>
                        <span className="text-xs text-slate-400">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-slate-200/50 transition-colors"
                      disabled={loading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Error Box */}
              {error && (
                <div className="p-3 bg-red-50 border border-red-100 rounded-xl flex items-start gap-2.5 text-red-700 text-xs">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 px-4 bg-primary text-white font-semibold rounded-xl hover:bg-primary/95 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-primary disabled:bg-slate-200 disabled:text-slate-400 transition-all text-sm shadow-md flex items-center justify-center gap-2"
              >
                {loading ? 'Processing Document...' : 'Generate Report'}
              </button>
            </form>
          </div>
        </div>

        {/* Right Column: Results & Loading Skeletons */}
        <div className="lg:col-span-7">
          {/* Empty State */}
          {!loading && !reportData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center flex flex-col items-center justify-center min-h-[350px]">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-full text-slate-400 mb-4">
                <Briefcase className="w-10 h-10" />
              </div>
              <h3 className="text-lg font-bold text-slate-800">No report generated yet</h3>
              <p className="text-muted-foreground text-sm max-w-sm mt-2">
                Enter a company name and upload a financial document in the configuration panel to build your equity research report.
              </p>
            </div>
          )}

          {/* Loading Indicator & Progress State */}
          {loading && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="font-bold text-slate-800 text-lg">Generating Equity Report</h3>
                  <p className="text-xs text-muted-foreground mt-0.5">Please wait while the AI extracts and structures the information</p>
                </div>
                <div className="w-6 h-6 border-2 border-secondary border-t-transparent rounded-full animate-spin"></div>
              </div>

              {/* Progress Indicator Steps */}
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center">
                      {step.status === 'completed' && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      )}
                      {step.status === 'running' && (
                        <div className="w-5 h-5 border-2 border-secondary border-t-transparent rounded-full animate-spin shrink-0"></div>
                      )}
                      {step.status === 'idle' && (
                        <div className="w-5 h-5 border-2 border-slate-200 rounded-full shrink-0 bg-slate-50"></div>
                      )}
                    </div>
                    <span className={`text-sm ${
                      step.status === 'running' 
                        ? 'text-slate-800 font-semibold' 
                        : step.status === 'completed' 
                          ? 'text-slate-500' 
                          : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Success Result View */}
          {reportData && !loading && (
            <div className="space-y-6 animate-fadeIn">
              {/* Success Notification Bar */}
              <div className="bg-emerald-50 border border-emerald-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <span className="p-2 bg-emerald-500 text-white rounded-xl">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="font-bold text-emerald-900 text-sm">Report Generated Successfully</h4>
                    <p className="text-xs text-emerald-700">Geojit-style layout compiled based on financial input.</p>
                  </div>
                </div>
                <button
                  onClick={() => window.open(`/api/download?id=${reportData.company.ticker}`, '_blank')}
                  className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl text-xs flex items-center justify-center gap-2 shadow-sm transition-all"
                >
                  <Download className="w-4 h-4" />
                  Download PDF
                </button>
              </div>

              {/* Geojit-style Live Preview Grid */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                {/* Geojit Header */}
                <div className="bg-primary text-white p-5 flex items-center justify-between">
                  <div>
                    <span className="text-xs uppercase tracking-wider text-accent font-bold">Equity Research Division</span>
                    <h3 className="text-xl font-bold">{reportData.company.name}</h3>
                    <p className="text-xs text-slate-300 mt-0.5">
                      Sector: {reportData.company.sector} | Industry: {reportData.company.industry}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-xs text-slate-300 block">Date</span>
                    <span className="text-sm font-semibold">{reportData.company.reportDate}</span>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Recommendation Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 rounded-xl p-5 border border-slate-100">
                    <div className="text-center md:text-left md:border-r border-slate-200 md:pr-6">
                      <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Recommendation</span>
                      <div className="mt-1">
                        <span className="px-3.5 py-1 bg-emerald-100 text-emerald-800 font-bold rounded-lg text-sm inline-block">
                          {reportData.recommendation.rating}
                        </span>
                      </div>
                    </div>
                    <div className="text-center md:text-left md:border-r border-slate-200 md:px-6">
                      <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Target Price</span>
                      <p className="text-2xl font-black text-primary mt-0.5">₹{reportData.recommendation.targetPrice}</p>
                      <p className="text-xs text-emerald-600 font-medium">Upside: +{reportData.recommendation.upsidePotential}%</p>
                    </div>
                    <div className="text-center md:text-left md:pl-6">
                      <span className="text-xs text-slate-500 uppercase tracking-wider font-semibold">Current Market Price</span>
                      <p className="text-2xl font-black text-slate-800 mt-0.5">₹{reportData.recommendation.currentPrice}</p>
                    </div>
                  </div>

                  {/* Executive Summary */}
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 mb-2.5">
                      Executive Summary
                    </h4>
                    <p className="text-slate-600 text-sm leading-relaxed">{reportData.executiveSummary}</p>
                  </div>

                  {/* Rationale Bullet points */}
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 mb-2.5">
                      Investment Rationale
                    </h4>
                    <ul className="space-y-2">
                      {reportData.recommendation.rationale.map((item, idx) => (
                        <li key={idx} className="flex gap-2.5 text-slate-600 text-sm">
                          <span className="text-accent font-bold mt-0.5">✓</span>
                          <span>{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* SWOT Analysis Grid */}
                  <div>
                    <h4 className="text-sm font-extrabold text-slate-800 uppercase tracking-wider border-b border-slate-100 pb-2 mb-3.5">
                      SWOT Analysis
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-100/50">
                        <h5 className="font-bold text-emerald-800 text-xs uppercase mb-1.5">Strengths</h5>
                        <ul className="text-xs text-emerald-700 space-y-1 list-disc list-inside">
                          {reportData.swotAnalysis.strengths.map((s, idx) => <li key={idx}>{s}</li>)}
                        </ul>
                      </div>
                      <div className="bg-red-50/50 p-4 rounded-xl border border-red-100/50">
                        <h5 className="font-bold text-red-800 text-xs uppercase mb-1.5">Weaknesses</h5>
                        <ul className="text-xs text-red-700 space-y-1 list-disc list-inside">
                          {reportData.swotAnalysis.weaknesses.map((w, idx) => <li key={idx}>{w}</li>)}
                        </ul>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
export default Dashboard;
