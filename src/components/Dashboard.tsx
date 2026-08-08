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
  X,
  Loader2,
  History,
  Plus,
  Menu,
  ChevronLeft,
  Settings,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';
import { EquityResearchData } from '@/types';

type HistoryItem = {
  id: string;
  companyName: string;
  fileName: string;
  createdAt: string;
  reportData: EquityResearchData;
  reportPdfBase64: string | null;
  status?: string;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
  /** Tracks which model ran financials extraction — null/undefined = 70B (standard) */
  modelUsedForFinancials?: string | null;
};

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
  const [reportPdfBase64, setReportPdfBase64] = useState<string | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Active Report Details for sign-off
  const [activeReportId, setActiveReportId] = useState<string | null>(null);
  const [activeReportStatus, setActiveReportStatus] = useState<string>('draft');
  const [isSignoffOpen, setIsSignoffOpen] = useState(false);
  const [reviewerName, setReviewerName] = useState('');
  const [sebiRegNo, setSebiRegNo] = useState('');
  const [isSigning, setIsSigning] = useState(false);
  const [currentJobId, setCurrentJobId] = useState<string | null>(null);
  // Tracks which model ran financials extraction for the currently open report
  const [activeModelUsedForFinancials, setActiveModelUsedForFinancials] = useState<string | null>(null);

  // AI Settings State
  const [aiProvider, setAiProvider] = useState<'groq' | 'openai'>('groq');
  const [groqApiKey, setGroqApiKey] = useState('');
  const [openaiApiKey, setOpenaiApiKey] = useState('');
  const [groqModel, setGroqModel] = useState('llama-3.3-70b-versatile');
  const [openaiModel, setOpenaiModel] = useState('gpt-4o-mini');
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);

  // Temporary form states for settings modal
  const [tempProvider, setTempProvider] = useState<'groq' | 'openai'>('groq');
  const [tempGroqApiKey, setTempGroqApiKey] = useState('');
  const [tempOpenaiApiKey, setTempOpenaiApiKey] = useState('');
  const [tempGroqModel, setTempGroqModel] = useState('llama-3.3-70b-versatile');
  const [tempOpenaiModel, setTempOpenaiModel] = useState('gpt-4o-mini');

  // Load AI Settings from localStorage on mount
  useEffect(() => {
    try {
      const storedSettings = localStorage.getItem('equigen_settings');
      if (storedSettings) {
        const parsed = JSON.parse(storedSettings);
        if (parsed.provider) {
          setAiProvider(parsed.provider);
          setTempProvider(parsed.provider);
        }
        if (parsed.groqApiKey !== undefined) {
          setGroqApiKey(parsed.groqApiKey);
          setTempGroqApiKey(parsed.groqApiKey);
        }
        if (parsed.openaiApiKey !== undefined) {
          setOpenaiApiKey(parsed.openaiApiKey);
          setTempOpenaiApiKey(parsed.openaiApiKey);
        }
        if (parsed.groqModel) {
          setGroqModel(parsed.groqModel);
          setTempGroqModel(parsed.groqModel);
        }
        if (parsed.openaiModel) {
          setOpenaiModel(parsed.openaiModel);
          setTempOpenaiModel(parsed.openaiModel);
        }
      }
    } catch (e) {
      console.error('Failed to load settings:', e);
    }
  }, []);

  const saveSettings = (
    provider: 'groq' | 'openai', 
    gKey: string, 
    oKey: string, 
    gModel: string, 
    oModel: string
  ) => {
    setAiProvider(provider);
    setGroqApiKey(gKey);
    setOpenaiApiKey(oKey);
    setGroqModel(gModel);
    setOpenaiModel(oModel);
    try {
      localStorage.setItem('equigen_settings', JSON.stringify({
        provider,
        groqApiKey: gKey,
        openaiApiKey: oKey,
        groqModel: gModel,
        openaiModel: oModel
      }));
      showToast('AI configurations saved successfully!', 'success');
      setIsSettingsOpen(false);
    } catch (e) {
      console.error('Failed to save settings:', e);
      showToast('Failed to save configurations.', 'error');
    }
  };

  // Load history from API on mount, with localStorage as fallback
  useEffect(() => {
    const fetchHistory = async () => {
      try {
        const res = await fetch('/api/history');
        if (res.ok) {
          const data = await res.json();
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const mapped = data.map((item: any) => ({
            id: item.id,
            companyName: item.companyName,
            fileName: item.fileName,
            createdAt: new Date(item.createdAt).toLocaleDateString('en-IN', {
              day: 'numeric',
              month: 'short',
              year: 'numeric',
              hour: '2-digit',
              minute: '2-digit'
            }),
            reportData: item.reportData,
            reportPdfBase64: item.pdfBase64,
            status: item.status || 'draft',
            reviewerName: item.reviewerName,
            sebiRegNo: item.sebiRegNo,
            approvedAt: item.approvedAt,
            modelUsedForFinancials: item.modelUsedForFinancials || null
          }));
          setHistory(mapped);
          localStorage.setItem('equigen_history', JSON.stringify(mapped));
          return;
        }
      } catch (e) {
        console.warn('Could not fetch from database history, trying local cache:', e);
      }

      // Fallback to localStorage
      try {
        const stored = localStorage.getItem('equigen_history');
        if (stored) {
          setHistory(JSON.parse(stored));
        }
      } catch (e) {
        console.error('Failed to load history from localStorage:', e);
      }
    };

    fetchHistory();
  }, []);

  const addToHistory = async (name: string, fName: string, data: EquityResearchData, pdfBase64: string | null) => {
    // Generate a completely unique ID for every report entry to prevent overwriting existing ones
    const uniqueId = 'rep_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    const newItem: HistoryItem = {
      id: uniqueId,
      companyName: name,
      fileName: fName,
      createdAt: new Date().toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      reportData: data,
      reportPdfBase64: pdfBase64,
      status: 'draft',
      modelUsedForFinancials: data.modelUsedForFinancials || null
    };

    // Set active model flag so sign-off modal can show the warning immediately
    setActiveModelUsedForFinancials(data.modelUsedForFinancials || null);

    // Save to Database
    try {
      await fetch('/api/history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: uniqueId,
          companyName: name,
          fileName: fName,
          reportData: data,
          pdfBase64,
          status: 'draft',
          modelUsedForFinancials: data.modelUsedForFinancials || null
        })
      });
    } catch (e) {
      console.warn('Failed to save to database history:', e);
    }

    // Save to state and local storage
    const filtered = history.filter(item => item.id !== newItem.id);
    const updated = [newItem, ...filtered];
    setHistory(updated);
    try {
      localStorage.setItem('equigen_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save history to localStorage:', e);
    }
    return uniqueId;
  };

  const selectHistoryItem = (item: HistoryItem) => {
    setCompanyName(item.companyName);
    setReportData(item.reportData);
    setReportPdfBase64(item.reportPdfBase64);
    setActiveReportId(item.id);
    setActiveReportStatus(item.status || 'draft');
    setActiveModelUsedForFinancials(item.modelUsedForFinancials || null);
    setFile(null);
    setError(null);
    setLoading(false);
    showToast(`Loaded report for ${item.companyName}`, 'info');
  };

  const startNewAnalysis = () => {
    setCompanyName('');
    setFile(null);
    setReportData(null);
    setReportPdfBase64(null);
    setActiveReportId(null);
    setActiveReportStatus('draft');
    setError(null);
    setLoading(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
    showToast('Ready for a new analysis!', 'info');
  };

  const approveReport = async (reviewer: string, regNo: string) => {
    if (!activeReportId) return;
    setIsSigning(true);
    showToast('Submitting SEBI Research Analyst sign-off...', 'info');
    try {
      const res = await fetch('/api/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reportId: activeReportId,
          reviewerName: reviewer,
          sebiRegNo: regNo
        })
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.message || 'Approval failed.');
      }

      const updated = await res.json();
      setReportPdfBase64(updated.pdfBase64);
      setActiveReportStatus(updated.status);
      
      // Update item inside history state
      setHistory(prev => prev.map(item => {
        if (item.id === activeReportId) {
          return {
            ...item,
            status: updated.status,
            reviewerName: updated.reviewerName,
            sebiRegNo: updated.sebiRegNo,
            approvedAt: updated.approvedAt,
            reportPdfBase64: updated.pdfBase64
          };
        }
        return item;
      }));

      showToast('Report signed off and published successfully!', 'success');
      setIsSignoffOpen(false);
    } catch (err) {
      console.error('Approve failed:', err);
      showToast(err instanceof Error ? err.message : 'Sign-off approval failed.', 'error');
    } finally {
      setIsSigning(false);
    }
  };

  const deleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();

    // Delete from Database
    try {
      await fetch(`/api/history?id=${id}`, { method: 'DELETE' });
    } catch (e) {
      console.warn('Failed to delete from database history:', e);
    }

    // Delete from state and local storage
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    try {
      localStorage.setItem('equigen_history', JSON.stringify(updated));
    } catch (e) {
      console.error('Failed to save history to localStorage:', e);
    }

    showToast('Report removed from history.', 'info');
    if (reportData?.company?.ticker === id) {
      startNewAnalysis();
    }
  };

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

    const jobId = 'job_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
    setCurrentJobId(jobId);

    setLoading(true);
    setError(null);
    setReportData(null);
    setReportPdfBase64(null);
    
    const updatedSteps: ProgressStep[] = [
      { label: 'Reading uploaded document structure', status: 'idle' },
      { label: `Extracting key metrics using ${aiProvider === 'groq' ? 'Groq Llama 3.3 70B' : 'OpenAI GPT-4o'}`, status: 'idle' },
      { label: 'Formatting financial sheets & ratios', status: 'idle' },
      { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
    ];
    setSteps(updatedSteps);
    showToast('Starting report generation pipeline...', 'info');

    let rawText = '';
    let extractedData: EquityResearchData | null = null;
    let reportResponse: { reportId: string; pdfBase64: string } | null = null;

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
        body: JSON.stringify({ 
          companyName, 
          rawText,
          provider: aiProvider,
          modelName: aiProvider === 'groq' ? groqModel : openaiModel,
          apiKey: (aiProvider === 'groq' ? groqApiKey : openaiApiKey) || undefined,
          jobId
        })
      });

      const extractData = await extractRes.json();

      // --- Throttled (429): auto-resume after Groq's suggested delay ---
      if (extractRes.status === 429 && extractData.status === 'throttled') {
        const waitSeconds: number = extractData.retryAfterSeconds || 20;
        setCurrentJobId(extractData.jobId || jobId);
        showToast(`Rate limit reached — auto-resuming in ${waitSeconds}s...`, 'info');

        // Keep step as 'running' — it will seamlessly resume, no crash/failure UI
        if (updatedSteps[currentStepIndex]) {
          updatedSteps[currentStepIndex].status = 'running';
          setSteps([...updatedSteps]);
        }

        // Auto-trigger resume after the exact wait time Groq suggested
        setTimeout(() => resumeGeneration(), waitSeconds * 1000);
        return; // skip the generic error handling entirely
      }

      if (!extractRes.ok) {
        setCurrentJobId(extractData.jobId || jobId);
        throw new Error(extractData.message || 'AI extraction failed.');
      }

      extractedData = extractData.reportData as EquityResearchData;
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

      reportResponse = await reportRes.json();
      if (reportResponse && extractedData && extractedData.company) {
        extractedData.company.ticker = reportResponse.reportId;
      }
      if (reportResponse && typeof reportResponse.pdfBase64 === 'string' && reportResponse.pdfBase64) {
        setReportPdfBase64(reportResponse.pdfBase64);
      }
      updatedSteps[2].status = 'completed';
      setSteps([...updatedSteps]);

      // --- Step 4: Compile Geojit PDF ---
      setCurrentStepIndex(3);
      updatedSteps[3].status = 'running';
      setSteps([...updatedSteps]);

      await new Promise(resolve => setTimeout(resolve, 800));
      updatedSteps[3].status = 'completed';
      setSteps([...updatedSteps]);

      setReportData(extractedData);
      // Save to history & state
      const createdId = await addToHistory(companyName, file.name, extractedData!, reportResponse?.pdfBase64 || null);
      setActiveReportId(createdId);
      setActiveReportStatus('draft');
      showToast('Equity report compiled successfully!', 'success');
    } catch (err: unknown) {
      console.error('Generation pipeline failed:', err);

      // --- Check if the extract API returned a throttled status ---
      // The extract API populates extractData.status = 'throttled' when Groq rate-limits us
      // In that case, we auto-resume after the suggested delay instead of showing a hard failure
      const errMsg = err instanceof Error ? err.message : 'An error occurred during report generation.';

      // Detect throttled signal from API response message or error message
      const isThrottled = errMsg.toLowerCase().includes('throttled') ||
        errMsg.toLowerCase().includes('rate limit') ||
        errMsg.toLowerCase().includes('rate_limit_exceeded');

      if (isThrottled && currentJobId) {
        // Parse retry delay from error message (e.g. "auto-resume in 23s" or "try again in 23.22s")
        const matchDelay = errMsg.match(/(?:auto-resume in|try again in|in)\s+([\d.]+)s/i);
        const waitSeconds = matchDelay ? Math.ceil(parseFloat(matchDelay[1])) : 20;

        showToast(`Rate limit reached — automatically resuming in ${waitSeconds}s...`, 'info');
        
        // Keep the throttled step as 'running' (no red failure state — it will resume)
        if (updatedSteps[currentStepIndex]) {
          updatedSteps[currentStepIndex].status = 'running';
          setSteps([...updatedSteps]);
        }

        // Auto-trigger resume after the exact wait time Groq suggested
        setTimeout(() => {
          resumeGeneration();
        }, waitSeconds * 1000);

        // Don't fall through to generic error toast or stop loading
        return;
      }

      // Genuine failure (not a rate limit)
      setError(errMsg);
      showToast(errMsg, 'error');
      
      if (updatedSteps[currentStepIndex]) {
        updatedSteps[currentStepIndex].status = 'failed';
        setSteps([...updatedSteps]);
      }
    } finally {
      setLoading(false);
    }
  };

  const resumeGeneration = async () => {
    if (!currentJobId) return;
    setLoading(true);
    setError(null);
    showToast('Resuming extraction from last checkpoint...', 'info');

    const updatedSteps = [...steps];
    
    // Find the failed step index and mark it as running
    const failedIdx = updatedSteps.findIndex(s => s.status === 'failed');
    const startIdx = failedIdx !== -1 ? failedIdx : 0;

    // Reset steps status to idle/running
    for (let i = startIdx; i < updatedSteps.length; i++) {
      updatedSteps[i].status = i === startIdx ? 'running' : 'idle';
    }
    setSteps([...updatedSteps]);
    setCurrentStepIndex(startIdx);

    try {
      const res = await fetch('/api/extract/resume', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: currentJobId,
          provider: aiProvider,
          modelName: aiProvider === 'groq' ? groqModel : openaiModel,
          apiKey: aiProvider === 'groq' ? groqApiKey : openaiApiKey
        })
      });

      const data = await res.json();
      if (!res.ok) {
        setCurrentJobId(data.jobId || currentJobId);
        throw new Error(data.message || 'Resume extraction failed');
      }

      const extractedData = data.reportData as EquityResearchData;

      // Complete all remaining steps in UI
      for (let i = startIdx; i < updatedSteps.length; i++) {
        updatedSteps[i].status = 'completed';
      }
      setSteps([...updatedSteps]);

      // Compile report PDF
      const reportRes = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(extractedData)
      });

      if (!reportRes.ok) {
        const errData = await reportRes.json().catch(() => ({}));
        throw new Error(errData.message || 'PDF compile failed');
      }

      const reportResponse = await reportRes.json();
      if (extractedData && extractedData.company) {
        extractedData.company.ticker = reportResponse.reportId;
      }
      if (typeof reportResponse.pdfBase64 === 'string' && reportResponse.pdfBase64) {
        setReportPdfBase64(reportResponse.pdfBase64);
      }

      setReportData(extractedData);
      const createdId = await addToHistory(companyName, file?.name || 'document.pdf', extractedData, reportResponse.pdfBase64);
      setActiveReportId(createdId);
      setActiveReportStatus('draft');
      showToast('Equity report successfully recovered and compiled!', 'success');

    } catch (err: unknown) {
      console.error('Resume pipeline failed:', err);
      const errMessage = err instanceof Error ? err.message : 'Unknown Error';
      setError(errMessage);
      showToast(errMessage, 'error');

      const currentIdx = steps.findIndex(s => s.status === 'running');
      if (currentIdx !== -1) {
        updatedSteps[currentIdx].status = 'failed';
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
      if (reportPdfBase64) {
        const bytes = Uint8Array.from(atob(reportPdfBase64), (c) => c.charCodeAt(0));
        const blob = new Blob([bytes], { type: 'application/pdf' });
        const url = URL.createObjectURL(blob);
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download = `equity-report-${reportId.toLowerCase()}.pdf`;
        document.body.appendChild(anchor);
        anchor.click();
        anchor.remove();
        URL.revokeObjectURL(url);
      } else {
        window.open(`/api/download?id=${reportId}`, '_blank');
      }
      showToast('PDF downloaded successfully!', 'success');
    } catch {
      showToast('Failed to trigger download.', 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-slate-50/30 text-slate-800 antialiased font-sans overflow-hidden w-full">
      
      {/* Collapsible Sidebar */}
      <aside 
        className={`bg-slate-900 text-slate-100 flex flex-col shrink-0 transition-all duration-300 border-r border-slate-800 shadow-xl z-20 ${
          isSidebarOpen ? 'w-72' : 'w-0 -translate-x-full lg:w-16 lg:translate-x-0'
        }`}
      >
        <div className="p-4 flex items-center justify-between border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5 overflow-hidden">
            <span className="p-1.5 bg-gradient-to-tr from-blue-600 to-indigo-500 text-white rounded-lg shadow-md shrink-0">
              <BarChart3 className="w-5 h-5" />
            </span>
            <span className={`text-sm font-extrabold tracking-wider uppercase transition-opacity duration-200 ${
              isSidebarOpen ? 'opacity-100' : 'opacity-0 lg:hidden'
            }`}>
              EquiGen
            </span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-100 transition-colors"
            title="Collapse Sidebar"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>

        {/* New Report Button */}
        <div className="p-3 shrink-0">
          <button
            onClick={startNewAnalysis}
            className={`w-full flex items-center gap-2 px-3 py-2.5 bg-slate-800 hover:bg-slate-700/80 text-slate-200 border border-slate-750 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-sm active:scale-95 ${
              !isSidebarOpen && 'justify-center lg:px-0'
            }`}
          >
            <Plus className="w-4 h-4 text-blue-400 shrink-0" />
            {isSidebarOpen && <span>New Analysis</span>}
          </button>
        </div>

        {/* History List */}
        <div className="flex-1 overflow-y-auto px-2 py-3 space-y-1 scrollbar-thin scrollbar-thumb-slate-800 scrollbar-track-transparent">
          {isSidebarOpen ? (
            <>
              <div className="px-3 pb-2 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                Analysis History ({history.length})
              </div>
              {history.length === 0 ? (
                <div className="px-3 py-8 text-center text-xs text-slate-500 italic">
                  No previous reports
                </div>
              ) : (
                history.map((item) => (
                  <div
                    key={item.id}
                    onClick={() => selectHistoryItem(item)}
                    className={`group relative flex items-center justify-between p-2.5 rounded-xl cursor-pointer transition-all ${
                      reportData?.company?.ticker === item.id 
                        ? 'bg-slate-800 text-white font-semibold' 
                        : 'hover:bg-slate-850/60 text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0 pr-6">
                      <FileText className="w-4 h-4 text-slate-500 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs truncate font-medium">{item.companyName}</div>
                        <div className="text-[10px] text-slate-500 mt-0.5 truncate">{item.createdAt}</div>
                      </div>
                    </div>
                    <button
                      onClick={(e) => deleteHistoryItem(item.id, e)}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-slate-700/80 rounded-lg text-slate-400 hover:text-rose-400 transition-all absolute right-2"
                      title="Delete report"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))
              )}
            </>
          ) : (
            <div className="flex flex-col items-center gap-4 py-4">
              <History className="w-5 h-5 text-slate-500" />
              {history.map((item) => (
                <button
                  key={item.id}
                  onClick={() => selectHistoryItem(item)}
                  className={`p-2 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-100 relative group transition-colors ${
                    reportData?.company?.ticker === item.id ? 'bg-slate-800 text-blue-450' : ''
                  }`}
                  title={item.companyName}
                >
                  <FileText className="w-4 h-4" />
                  <span className="absolute left-full ml-2 px-2 py-1 bg-slate-950 text-slate-100 text-[10px] rounded shadow-md opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap z-50">
                    {item.companyName}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Settings & Footer Status Section */}
        <div className="p-3 border-t border-slate-850 shrink-0 bg-slate-950/20 space-y-2.5">
          <button
            onClick={() => {
              setTempProvider(aiProvider);
              setTempGroqApiKey(groqApiKey);
              setTempOpenaiApiKey(openaiApiKey);
              setTempGroqModel(groqModel);
              setTempOpenaiModel(openaiModel);
              setIsSettingsOpen(true);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-slate-800 text-slate-400 hover:text-slate-200 transition-all cursor-pointer active:scale-95 ${
              !isSidebarOpen && 'justify-center lg:px-0'
            }`}
            title="Configure AI Provider & API Keys"
          >
            <Settings className="w-4 h-4 text-slate-500 shrink-0" />
            {isSidebarOpen && <span className="text-xs font-bold">Settings</span>}
          </button>

          {isSidebarOpen && (
            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider px-3 pt-1">
              <Activity className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              <span>{aiProvider === 'groq' ? 'Groq Llama 3.3 Online' : 'OpenAI Model Active'}</span>
            </div>
          )}
        </div>
      </aside>

      {/* Toggle button when sidebar is collapsed */}
      {!isSidebarOpen && (
        <button
          onClick={() => setIsSidebarOpen(true)}
          className="fixed top-6 left-6 z-30 p-2.5 bg-slate-900 hover:bg-slate-850 text-white rounded-xl shadow-lg border border-slate-800 transition-all active:scale-95 cursor-pointer flex items-center justify-center"
          title="Expand Sidebar"
        >
          <Menu className="w-5 h-5" />
        </button>
      )}

      {/* Main Dashboard Content Area */}
      <div className="flex-1 overflow-y-auto h-screen transition-all duration-300">
        <div className="max-w-6xl mx-auto px-6 py-10">
      
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
            <span className="text-xs font-extrabold tracking-widest text-blue-600 uppercase">EQUIGEN SUITE</span>
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight text-slate-900 mt-3">AI Equity Research Report Generator</h1>
          <p className="text-slate-500 mt-1.5 text-sm max-w-2xl leading-relaxed">
            Upload financial structures and extract publication-grade Geojit style equity analytics inside high-fidelity PDF documents automatically.
          </p>
        </div>
        <div className="mt-5 md:mt-0 flex items-center gap-2 px-3.5 py-2 bg-slate-55 border border-slate-200 rounded-full text-xs font-semibold text-slate-600 shadow-sm">
          <Activity className="w-4 h-4 text-emerald-500 animate-pulse" />
          {aiProvider === 'groq' 
            ? `Groq ${groqModel === 'llama-3.3-70b-versatile' ? 'Llama 3.3 70B' : 'Llama 3.1 8B'} Online` 
            : `OpenAI ${openaiModel === 'gpt-4o-mini' ? 'GPT-4o Mini' : 'GPT-4o'} Active`
          }
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

          {/* Loading or Failed Steps Panel */}
          {(loading || steps.some(s => s.status === 'failed')) && (
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-sm font-bold text-slate-800">
                    {loading ? 'Executing pipeline nodes...' : 'Pipeline execution paused'}
                  </h3>
                  <p className="text-[10px] text-slate-400 font-semibold mt-1">
                    Job ID: {currentJobId}
                  </p>
                </div>
                {loading && <Loader2 className="w-5 h-5 text-blue-600 animate-spin shrink-0" />}
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
                        <AlertTriangle className="w-5 h-5 text-rose-500 shrink-0 animate-pulse" />
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
                        : step.status === 'failed'
                        ? 'text-rose-600 font-bold animate-pulse'
                        : 'text-slate-400'
                    }`}>
                      {step.label}
                    </span>
                    {step.status === 'failed' && !loading && (
                      <button
                        type="button"
                        onClick={resumeGeneration}
                        className="ml-auto px-2.5 py-1.5 bg-slate-900 hover:bg-slate-805 text-white font-bold rounded-lg text-[9px] flex items-center gap-1 transition-all border border-slate-750 active:scale-95 shadow-sm"
                      >
                        <RefreshCw className="w-2.5 h-2.5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
                        Resume Node
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Skeleton lines for report preview preview */}
              {loading && (
                <div className="pt-6 border-t border-slate-100 space-y-3">
                  <div className="h-3.5 w-full bg-slate-150 rounded-lg"></div>
                  <div className="h-3.5 w-5/6 bg-slate-150 rounded-lg"></div>
                  <div className="h-3.5 w-2/3 bg-slate-150 rounded-lg"></div>
                </div>
              )}
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
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-emerald-950 text-sm">Report Compiled Successfully</h4>
                      <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${
                        activeReportStatus === 'published' 
                          ? 'bg-emerald-100 text-emerald-800' 
                          : 'bg-rose-100 text-rose-800 animate-pulse'
                      }`}>
                        {activeReportStatus}
                      </span>
                    </div>
                    <p className="text-xs text-emerald-750 font-medium mt-0.5">
                      {activeReportStatus === 'published' 
                        ? 'Approved & signed off by a SEBI Registered Analyst.' 
                        : 'AI-generated draft. Pending review and attestation.'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 w-full sm:w-auto">
                  {activeReportStatus === 'draft' && (
                    <button
                      onClick={() => setIsSignoffOpen(true)}
                      className="flex-1 sm:flex-none px-4 py-2.5 bg-slate-900 hover:bg-slate-805 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-1.5 transition-all active:scale-95 border border-slate-750"
                    >
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      Approve & Sign-off
                    </button>
                  )}
                  <button
                    onClick={() => triggerDownload(reportData.company.ticker || '')}
                    disabled={isDownloading}
                    className="flex-1 sm:flex-none px-5 py-2.5 bg-gradient-to-tr from-emerald-600 to-teal-500 hover:from-emerald-700 hover:to-teal-600 text-white font-bold rounded-xl text-xs flex items-center justify-center gap-2 shadow-md shadow-emerald-500/10 transition-all active:scale-95"
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
          {/* Settings Modal */}
        {isSettingsOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-scaleIn mx-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <Settings className="w-4 h-4 text-blue-600" />
                  AI Configuration Settings
                </h3>
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-5">
                {/* Provider Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    AI Provider
                  </label>
                  <select
                    value={tempProvider}
                    onChange={(e) => setTempProvider(e.target.value as 'groq' | 'openai')}
                    className="w-full px-3.5 py-2.5 bg-slate-55 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  >
                    <option value="groq">Groq (System Default)</option>
                    <option value="openai">OpenAI (Custom Key)</option>
                  </select>
                </div>

                {/* Model Selection */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Model Selection
                  </label>
                  {tempProvider === 'groq' ? (
                    <select
                      value={tempGroqModel}
                      onChange={(e) => setTempGroqModel(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    >
                      <option value="llama-3.3-70b-versatile">Llama 3.3 70B Versatile (Default)</option>
                      <option value="llama-3.1-8b-instant">Llama 3.1 8B Instant</option>
                    </select>
                  ) : (
                    <select
                      value={tempOpenaiModel}
                      onChange={(e) => setTempOpenaiModel(e.target.value)}
                      className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    >
                      <option value="gpt-4o-mini">GPT-4o Mini (Default - Recommended)</option>
                      <option value="gpt-4o">GPT-4o (Higher Quality)</option>
                    </select>
                  )}
                </div>

                {/* API Key Input */}
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    {tempProvider === 'groq' ? 'Groq API Key (Optional)' : 'OpenAI API Key'}
                  </label>
                  <div className="relative">
                    <input
                      type={showApiKey ? 'text' : 'password'}
                      value={tempProvider === 'groq' ? tempGroqApiKey : tempOpenaiApiKey}
                      onChange={(e) => {
                        if (tempProvider === 'groq') {
                          setTempGroqApiKey(e.target.value);
                        } else {
                          setTempOpenaiApiKey(e.target.value);
                        }
                      }}
                      placeholder={
                        tempProvider === 'groq' 
                          ? 'Using system configured API key...' 
                          : 'sk-proj-...'
                      }
                      className="w-full pl-3.5 pr-10 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                    />
                    <button
                      type="button"
                      onClick={() => setShowApiKey(!showApiKey)}
                      className="absolute right-2.5 top-2.5 p-0.5 text-slate-400 hover:text-slate-600 rounded"
                    >
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                  <p className="text-[10px] text-slate-450 mt-1.5 leading-relaxed">
                    {tempProvider === 'groq' 
                      ? 'Leave empty to use the server-side environment variables configured on launch.' 
                      : 'Required. Custom keys are kept in your browser storage and never saved permanently on our server.'
                    }
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsSettingsOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={() => saveSettings(tempProvider, tempGroqApiKey, tempOpenaiApiKey, tempGroqModel, tempOpenaiModel)}
                  disabled={tempProvider === 'openai' && !tempOpenaiApiKey}
                  className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-md shadow-blue-500/10"
                >
                  Save Configurations
                </button>
              </div>
            </div>
          </div>
        )}

        {/* SEBI Compliance Sign-off Modal */}
        {isSignoffOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm animate-fadeIn">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 w-full max-w-md shadow-2xl animate-scaleIn mx-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-4 mb-5">
                <h3 className="text-base font-bold text-slate-800 flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  SEBI RA Sign-off Attestation
                </h3>
                <button
                  onClick={() => setIsSignoffOpen(false)}
                  className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400 hover:text-slate-600"
                  disabled={isSigning}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-4">
                {/* Fallback model warning — shown only when 8B was used for financials */}
                {activeModelUsedForFinancials === 'llama-3.1-8b-instant' && (
                  <div className="flex items-start gap-3 p-3.5 bg-amber-50 border border-amber-200 rounded-xl">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <div>
                      <p className="text-xs font-bold text-amber-700 mb-0.5">Financials Extracted by Lighter Model</p>
                      <p className="text-[10px] text-amber-600 leading-relaxed">
                        The document was too large for the high-accuracy model. Revenue, EBITDA, and PAT figures were extracted 
                        by <span className="font-bold">llama-3.1-8b-instant</span> (fallback). Numbers may be less precise on 
                        dense tables. <span className="font-bold">Please verify all financial figures before signing off.</span>
                      </p>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    Reviewer Full Name
                  </label>
                  <input
                    type="text"
                    value={reviewerName}
                    onChange={(e) => setReviewerName(e.target.value)}
                    placeholder="e.g. Ritesh Kumar"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">
                    SEBI Registration Number
                  </label>
                  <input
                    type="text"
                    value={sebiRegNo}
                    onChange={(e) => setSebiRegNo(e.target.value)}
                    placeholder="e.g. INH000012345"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/10 focus:border-blue-500 transition-all"
                  />
                </div>

                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-100 flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    id="attestation-checkbox"
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500/10"
                  />
                  <label htmlFor="attestation-checkbox" className="text-[10px] text-slate-550 leading-relaxed font-semibold">
                    I confirm I have reviewed the financial data, calculations, and conclusions and take responsibility for this report content under my SEBI Research Analyst registration.
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-slate-100">
                <button
                  onClick={() => setIsSignoffOpen(false)}
                  className="px-4 py-2 bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-600 font-bold rounded-xl text-xs transition-colors"
                  disabled={isSigning}
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    const checkbox = document.getElementById('attestation-checkbox') as HTMLInputElement;
                    if (!reviewerName.trim() || !sebiRegNo.trim()) {
                      showToast('Please enter reviewer name and SEBI registration number.', 'error');
                      return;
                    }
                    if (!checkbox?.checked) {
                      showToast('Please verify and agree to the attestation.', 'error');
                      return;
                    }
                    approveReport(reviewerName, sebiRegNo);
                  }}
                  disabled={isSigning}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 shadow-md shadow-emerald-500/10 flex items-center gap-1.5"
                >
                  {isSigning ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Signing...
                    </>
                  ) : (
                    'Sign & Publish'
                  )}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  </div>
</div>
  );
}
export default Dashboard;
