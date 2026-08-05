'use client';

import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  FileText, 
  CheckCircle2, 
  AlertTriangle, 
  Download, 
  BarChart3, 
  Activity, 
  Layers, 
  Trash2, 
  Sparkles,
  TrendingUp,
  X,
  Loader2
} from 'lucide-react';
import { EquityResearchData } from '@/types';

type ProgressStep = {
  label: string;
  status: 'idle' | 'running' | 'completed' | 'failed';
};

type Toast = {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info';
};

export function Dashboard() {
  const [companyName, setCompanyName] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [reportData, setReportData] = useState<EquityResearchData | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: 'Reading uploaded document structure', status: 'idle' },
    { label: 'Extracting key metrics using Groq Llama 3.3 70B', status: 'idle' },
    { label: 'Formatting financial sheets & ratios', status: 'idle' },
    { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
  ]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

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
      showToast('Unsupported file format. Please upload PDF, CSV, or TXT.', 'error');
      setError('Unsupported file type. Please upload a PDF, CSV, or TXT document.');
      setFile(null);
      return;
    }
    setFile(selectedFile);
    showToast(`File "${selectedFile.name}" selected successfully!`, 'success');
  };

  const removeFile = () => {
    setFile(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('File removed.', 'info');
  };

  const startGeneration = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      showToast('Please enter a company name.', 'error');
      setError('Please enter a company name.');
      return;
    }
    if (!file) {
      showToast('Please upload a financial document.', 'error');
      setError('Please upload a financial document.');
      return;
    }

    setLoading(true);
    setError(null);
    setReportData(null);
    
    const updatedSteps: ProgressStep[] = [
      { label: 'Reading uploaded document structure', status: 'idle' },
      { label: 'Extracting key metrics using Groq Llama 3.3 70B', status: 'idle' },
      { label: 'Formatting financial sheets & ratios', status: 'idle' },
      { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
    ];
    setSteps(updatedSteps);
    showToast('Starting report generation pipeline...', 'info');

    let rawText = '';
    let extractedData: any = null;

    try {
      // Step 1: Upload & Extract Raw Text
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

      // Step 2: AI Metric Extraction
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

      // Step 3: Format Financial Ratios & Generate Charts
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
      extractedData.company.ticker = reportResponse.reportId;
      updatedSteps[2].status = 'completed';
      setSteps([...updatedSteps]);

      // Step 4: Compile Geojit PDF
      setCurrentStepIndex(3);
      updatedSteps[3].status = 'running';
      setSteps([...updatedSteps]);

      await new Promise(resolve => setTimeout(resolve, 800));
      updatedSteps[3].status = 'completed';
      setSteps([...updatedSteps]);

      setReportData(extractedData);
      showToast('Equity report compiled successfully!', 'success');
    } catch (err: any) {
      console.error('Generation pipeline failed:', err);
      setError(err.message || 'An error occurred during report generation.');
      showToast(err.message || 'Report generation failed.', 'error');
      
      if (updatedSteps[currentStepIndex]) {
        updatedSteps[currentStepIndex].status = 'failed';
        setSteps([...updatedSteps]);
      }
    } finally {
      setLoading(false);
    }
  };

  const triggerDownload = async (reportId: string) => {
    setIsDownloading(true);
    showToast('Preparing PDF download...', 'info');
    try {
      await new Promise((resolve) => setTimeout(resolve, 1500)); // Visual download transition
      window.open(`/api/download?id=${reportId}`, '_blank');
      showToast('PDF downloaded successfully!', 'success');
    } catch (err) {
      showToast('Failed to trigger download.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-6 py-10 antialiased font-sans">
      
      {/* Floating Toast Notification Box */}
      <div className="fixed top-6 right-6 z-50 space-y-3.5 max-w-sm pointer-events-none">
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className={`pointer-events-auto flex items-center justify-between gap-3 p-4 rounded-2xl shadow-xl border backdrop-blur-md transition-all duration-300 transform translate-y-0 animate-fadeIn ${
              toast.type === 'success'
                ? 'bg-emerald-50/95 border-emerald-200 text-emerald-900'
                : toast.type === 'error'
                ? 'bg-rose-50/95 border-rose-200 text-rose-900'
                : 'bg-blue-50/95 border-blue-200 text-blue-900'
            }`}
          >
            <div className="flex items-center gap-2">
              {toast.type === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />}
              {toast.type === 'error' && <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />}
              {toast.type === 'info' && <Sparkles className="w-5 h-5 text-blue-600 shrink-0 animate-pulse" />}
              <span className="text-xs font-semibold">{toast.message}</span>
            </div>
            <button
              onClick={() => removeToast(toast.id)}
              className="p-1 hover:bg-slate-200/50 rounded-lg transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        ))}
      </div>

      {/* Header Panel */}
      <header className="mb-10 flex flex-col md:flex-row items-center justify-between border-b border-slate-100 pb-8">
        <div className="text-center md:text-left">
          <div className="flex items-center gap-2.5 justify-center md:justify-start">
            <span className="p-2 bg-gradient-to-tr from-blue-700 to-indigo-600 text-white rounded-xl shadow-lg shadow-blue-500/10">
              <BarChart3 className="w-6 h-6" />
            </span>
            <span className="text-xs font-extrabold tracking-widest text-blue-600 uppercase">BULL AI SUITE</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mt-3">AI Equity Research Report Generator</h1>
          <p className="text-slate-500 mt-1.5 text-sm max-w-2xl leading-relaxed">
            Upload financial structures and extract publication-grade Geojit style equity analytics inside high-fidelity PDF documents automatically.
          </p>
        </div>
        <div className="mt-5 md:mt-0 flex items-center gap-2 px-3.5 py-2 bg-slate-55 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          Groq Llama 3.3 70B Engine Online
        </div>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Input Configuration Column */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm hover:shadow-md transition-shadow duration-300 p-6">
            <h2 className="text-base font-bold text-slate-800 mb-5 flex items-center gap-2">
              <Layers className="w-4 h-4 text-blue-600" />
              Report Configuration
            </h2>
            <form onSubmit={startGeneration} className="space-y-6">
              {/* Company Input */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Company Name
                </label>
                <input
                  type="text"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  placeholder="e.g. Tata Consultancy Services"
                  className="w-full px-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-sm font-medium"
                  disabled={loading}
                />
              </div>

              {/* Upload Input */}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                  Upload Financial Document
                </label>
                
                {!file ? (
                  <div
                    onDragEnter={handleDrag}
                    onDragOver={handleDrag}
                    onDragLeave={handleDrag}
                    onDrop={handleDrop}
                    onClick={() => fileInputRef.current?.click()}
                    className={`border-2 border-dashed rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 group ${
                      isDragActive 
                        ? 'border-blue-500 bg-blue-50/40 shadow-inner' 
                        : 'border-slate-300 bg-slate-50/50 hover:bg-slate-100/60 hover:border-slate-400'
                    }`}
                  >
                    <div className="p-3 bg-white rounded-xl shadow-sm border border-slate-100 group-hover:scale-110 transition-transform duration-300 mb-3">
                      <Upload className="w-6 h-6 text-slate-400 group-hover:text-blue-500 transition-colors" />
                    </div>
                    <span className="text-sm font-semibold text-slate-700">
                      Drag & drop your file here, or <span className="text-blue-600 hover:underline">browse</span>
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
                  <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl animate-fadeIn">
                    <div className="flex items-center gap-3">
                      <div className="p-2.5 bg-blue-100 text-blue-700 rounded-xl">
                        <FileText className="w-5 h-5" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-sm font-semibold text-slate-800 truncate max-w-[180px] sm:max-w-[240px]">
                          {file.name}
                        </span>
                        <span className="text-xs text-slate-400 font-medium">
                          {(file.size / (1024 * 1024)).toFixed(2)} MB
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={removeFile}
                      className="p-2 text-slate-400 hover:text-rose-500 rounded-xl hover:bg-slate-200/50 transition-colors"
                      disabled={loading}
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </div>

              {/* Error Box */}
              {error && (
                <div className="p-3.5 bg-rose-50 border border-rose-100 rounded-xl flex items-start gap-3 text-rose-700 text-xs font-semibold animate-pulse">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Action Button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full py-3.5 px-4 bg-gradient-to-tr from-blue-700 to-indigo-600 hover:from-blue-800 hover:to-indigo-700 text-white font-semibold rounded-xl disabled:from-slate-100 disabled:to-slate-100 disabled:text-slate-400 transition-all text-sm shadow-lg shadow-blue-500/10 active:scale-98 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Running Extraction Pipeline...
                  </>
                ) : (
                  'Generate Equity Report'
                )}
              </button>
            </form>
          </div>
        </div>

        {/* Right Output Results Column */}
        <div className="lg:col-span-7">
          {/* Empty State */}
          {!loading && !reportData && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-12 text-center flex flex-col items-center justify-center min-h-[380px] animate-fadeIn">
              <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl text-slate-400 mb-4 shadow-sm">
                <FileText className="w-10 h-10 text-slate-400" />
              </div>
              <h3 className="text-base font-bold text-slate-800">No report compiled yet</h3>
              <p className="text-slate-400 text-xs max-w-sm mt-1.5 leading-relaxed font-medium">
                Enter a company name and upload a financial statement document on the left panel to trigger the AI analysis.
              </p>
            </div>
          )}

          {/* Loading Skeleton */}
          {loading && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6 animate-pulse">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <div className="h-5 w-40 bg-slate-200 rounded-lg"></div>
                  <div className="h-3 w-64 bg-slate-100 rounded-lg mt-2"></div>
                </div>
                <div className="w-5 h-5 bg-slate-200 rounded-full"></div>
              </div>

              {/* Progress Steps UI */}
              <div className="space-y-4">
                {steps.map((step, idx) => (
                  <div key={idx} className="flex items-center gap-3.5">
                    <div className="flex items-center justify-center">
                      {step.status === 'completed' && (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      )}
                      {step.status === 'running' && (
                        <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />
                      )}
                      {step.status === 'failed' && (
                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0" />
                      )}
                      {step.status === 'idle' && (
                        <div className="w-5 h-5 border-2 border-slate-200 rounded-full shrink-0 bg-slate-50"></div>
                      )}
                    </div>
                    <span className={`text-xs font-semibold ${
                      step.status === 'running' 
                        ? 'text-blue-700 font-bold' 
                        : step.status === 'completed' 
                        ? 'text-slate-500' 
                        : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                  </div>
                ))}
              </div>

              {/* Skeleton lines for report preview preview */}
              <div className="pt-6 border-t border-slate-100 space-y-3">
                <div className="h-3.5 w-full bg-slate-150 rounded-lg"></div>
                <div className="h-3.5 w-5/6 bg-slate-150 rounded-lg"></div>
                <div className="h-3.5 w-2/3 bg-slate-150 rounded-lg"></div>
              </div>
            </div>
          )}

          {/* Success Screen View */}
          {reportData && !loading && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Success Notification Banner */}
              <div className="bg-emerald-50/70 border border-emerald-100 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-sm animate-scaleIn">
                <div className="flex items-center gap-3">
                  <span className="p-2.5 bg-emerald-500 text-white rounded-xl shadow-md shadow-emerald-500/10">
                    <CheckCircle2 className="w-5 h-5" />
                  </span>
                  <div>
                    <h4 className="font-extrabold text-emerald-950 text-sm">Report Compiled Successfully</h4>
                    <p className="text-xs text-emerald-700 font-medium">Headless PDF compiler written to temporary file.</p>
                  </div>
                </div>
                <button
                  onClick={() => triggerDownload(reportData.company.ticker || '')}
                  disabled={isDownloading}
                  className="w-full sm:w-auto px-5 py-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/10 transition-all active:scale-95"
                >
                  {isDownloading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Downloading...
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Download PDF
                    </>
                  )}
                </button>
              </div>

              {/* Live Preview Paper Canvas */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden animate-scaleIn">
                {/* Visual Header */}
                <div className="bg-gradient-to-tr from-slate-900 to-slate-800 text-white p-6 flex items-center justify-between border-b border-slate-800">
                  <div>
                    <span className="text-[10px] uppercase tracking-widest text-amber-500 font-bold block mb-1">Equity Research Division</span>
                    <h3 className="text-xl font-bold tracking-tight">{reportData.company.name}</h3>
                    <p className="text-xs text-slate-400 mt-1 font-medium">
                      Sector: {reportData.company.sector} | Industry: {reportData.company.industry}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="text-[10px] text-slate-400 uppercase tracking-widest block font-bold mb-1">Date</span>
                    <span className="text-xs font-semibold bg-slate-800 px-2.5 py-1 rounded-lg border border-slate-700/50 inline-block">{reportData.company.reportDate}</span>
                  </div>
                </div>

                <div className="p-6 space-y-6">
                  {/* Recommendation Card */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-slate-50 border border-slate-200/60 rounded-2xl p-5 shadow-sm">
                    <div className="text-center md:text-left md:border-r border-slate-200/80 md:pr-6 flex flex-col justify-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">Recommendation</span>
                      <div className="mt-1.5">
                        <span className="px-3.5 py-1 bg-emerald-100 text-emerald-800 font-extrabold rounded-lg text-xs tracking-wider inline-block">
                          {reportData.recommendation.rating}
                        </span>
                      </div>
                    </div>
                    <div className="text-center md:text-left md:border-r border-slate-200/80 md:px-6 flex flex-col justify-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">Target Price</span>
                      <p className="text-2xl font-black text-slate-900 mt-0.5">₹{reportData.recommendation.targetPrice}</p>
                      <p className="text-xs text-emerald-600 font-bold mt-0.5">Upside: +{reportData.recommendation.upsidePotential}%</p>
                    </div>
                    <div className="text-center md:text-left md:pl-6 flex flex-col justify-center">
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider font-extrabold block">CMP</span>
                      <p className="text-2xl font-black text-slate-800 mt-0.5">₹{reportData.recommendation.currentPrice}</p>
                    </div>
                  </div>

                  {/* Executive Summary */}
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2 mb-3">
                      Executive Summary
                    </h4>
                    <p className="text-slate-600 text-sm leading-relaxed font-medium">{reportData.executiveSummary}</p>
                  </div>

                  {/* SWOT Analysis */}
                  <div>
                    <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-widest border-b border-slate-100 pb-2 mb-4.5">
                      SWOT Analysis
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-emerald-50/40 p-4 rounded-xl border border-emerald-100">
                        <h5 className="font-extrabold text-emerald-800 text-[10px] uppercase tracking-wider mb-2">Strengths</h5>
                        <ul className="text-xs text-emerald-800/90 space-y-1.5 list-none font-medium">
                          {reportData.swotAnalysis.strengths.map((s, idx) => (
                            <li key={idx} className="flex gap-2 items-start">
                              <span className="text-emerald-500 font-bold">✓</span>
                              <span>{s}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                      <div className="bg-rose-50/40 p-4 rounded-xl border border-rose-100">
                        <h5 className="font-extrabold text-rose-800 text-[10px] uppercase tracking-wider mb-2">Weaknesses</h5>
                        <ul className="text-xs text-rose-800/90 space-y-1.5 list-none font-medium">
                          {reportData.swotAnalysis.weaknesses.map((w, idx) => (
                            <li key={idx} className="flex gap-2 items-start">
                              <span className="text-rose-400 font-bold">⚠</span>
                              <span>{w}</span>
                            </li>
                          ))}
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
