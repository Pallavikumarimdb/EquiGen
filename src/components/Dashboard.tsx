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
  Plus,
  Menu,
  Settings,
  Eye,
  EyeOff,
  RefreshCw
} from 'lucide-react';
import { EquityResearchData, CompetitorInfo } from '@/types';
import { PanelResizer } from './PanelResizer';

type PanelKey = 'sidebar' | 'config' | 'chat';

const DEFAULT_PANEL_WIDTHS: Record<PanelKey, number> = { sidebar: 256, config: 320, chat: 400 };
const PANEL_LIMITS: Record<PanelKey, { min: number; max: number }> = {
  sidebar: { min: 180, max: 420 },
  config: { min: 280, max: 640 },
  chat: { min: 320, max: 860 },
};

const clampPanelWidth = (value: number, key: PanelKey) =>
  Math.min(PANEL_LIMITS[key].max, Math.max(PANEL_LIMITS[key].min, value));

function loadPanelWidths(): Record<PanelKey, number> {
  if (typeof window === 'undefined') return { ...DEFAULT_PANEL_WIDTHS };
  try {
    const raw = localStorage.getItem('equigen_panel_widths');
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sidebar: clampPanelWidth(Number(parsed.sidebar) || DEFAULT_PANEL_WIDTHS.sidebar, 'sidebar'),
        config: clampPanelWidth(Number(parsed.config) || DEFAULT_PANEL_WIDTHS.config, 'config'),
        chat: clampPanelWidth(Number(parsed.chat) || DEFAULT_PANEL_WIDTHS.chat, 'chat'),
      };
    }
  } catch {
    // Corrupt or inaccessible storage — fall back to defaults
  }
  return { ...DEFAULT_PANEL_WIDTHS };
}

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

type UserRole = 'analyst' | 'research_analyst' | 'admin';

type HistoryApiItem = {
  id: string;
  companyName: string;
  fileName: string;
  createdAt: string;
  reportData: EquityResearchData;
  pdfBase64: string | null;
  status?: string | null;
  reviewerName?: string | null;
  sebiRegNo?: string | null;
  approvedAt?: string | null;
  modelUsedForFinancials?: string | null;
};

type Proposal = {
  id: string;
  field: string;
  status: 'pending' | 'approved' | 'rejected';
  origin: string;
  reasoning?: string;
  oldValue: unknown;
  newValue: unknown;
};

type AuditLogEntry = {
  id: string;
  action: string;
  createdAt: string;
  userId: string;
  actorType: string;
  fromState?: string;
  toState?: string;
  metadata: unknown;
};

type ChatMessage = {
  role: 'user' | 'agent';
  content: string;
  isError?: boolean;
  retryPrompt?: string;
};

// Shared duration formatter used by the live wait countdowns
function formatDuration(totalSecs: number): string {
  if (totalSecs >= 3600) {
    const hrs = Math.floor(totalSecs / 3600);
    const mins = Math.floor((totalSecs % 3600) / 60);
    return `${hrs}h ${mins}m`;
  } else if (totalSecs >= 60) {
    const mins = Math.floor(totalSecs / 60);
    const secs = totalSecs % 60;
    return `${mins}m ${secs}s`;
  }
  return `${totalSecs}s`;
}

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
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [history, setHistory] = useState<HistoryItem[]>([]);
  const saveHistoryToLocalStorage = (items: HistoryItem[]) => {
    try {
      // Exclude large PDF base64 contents to prevent localStorage quota exceeded error
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const filtered = items.map(({ reportPdfBase64, ...rest }) => rest);
      localStorage.setItem('equigen_history', JSON.stringify(filtered));
    } catch (e) {
      console.warn('Failed to save history to localStorage:', e);
    }
  };
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

// Throttle countdown state for live UI tracking
const [throttleCountdown, setThrottleCountdown] = useState<string | null>(null);
// Live countdown for internal "waiting for AI capacity" pauses (token budget waits)
const [capacityWaitUntil, setCapacityWaitUntil] = useState<number | null>(null);
const [capacityWaitSeconds, setCapacityWaitSeconds] = useState<number | null>(null);

  // Compliance & Unified Review states
  const [activeTab, setActiveTab] = useState<'preview' | 'diffs' | 'audit'>('preview');
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);

  // AI Co-Pilot Chat states
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(true);

  // Fork warning states
  const [isForkModalOpen, setIsForkModalOpen] = useState(false);
  const [pendingForkPrompt, setPendingForkPrompt] = useState('');

  // User Role & Review Queue states
  const [userRole, setUserRole] = useState<'analyst' | 'research_analyst' | 'admin'>('research_analyst');
  const [viewQueueOnly, setViewQueueOnly] = useState(false);
  const [showConfig, setShowConfig] = useState(true);

  // Resizable panel widths (sidebar, config, chat) with localStorage persistence
  const [panelWidths, setPanelWidths] = useState<Record<PanelKey, number>>(loadPanelWidths);
  const [activeResizer, setActiveResizer] = useState<PanelKey | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('equigen_panel_widths', JSON.stringify(panelWidths));
    } catch {
      // Storage unavailable — widths simply won't persist
    }
  }, [panelWidths]);

  // Load AI Settings from localStorage on mount
  useEffect(() => {
    const initSettings = async () => {
      try {
        const storedSettings = localStorage.getItem('equigen_settings');
        // Only restore provider and model preferences — never API keys from localStorage
        if (storedSettings) {
          const parsed = JSON.parse(storedSettings);
          if (parsed.provider) {
            setAiProvider(parsed.provider);
            setTempProvider(parsed.provider);
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

        // Verify if keys exist in DB and update config flags accordingly
        // NOTE: We never store API keys in localStorage — only provider/model preferences.
        //       Keys are encrypted in the database; we show a masked placeholder if configured.
        const groqDbRes = await fetch('/api/settings/keys?provider=groq').catch(() => null);
        if (groqDbRes && groqDbRes.ok) {
          const data = await groqDbRes.json();
          if (data.configured) {
            setGroqApiKey('••••••••••••••••');
            setTempGroqApiKey('••••••••••••••••');
          }
        }
        const openaiDbRes = await fetch('/api/settings/keys?provider=openai').catch(() => null);
        if (openaiDbRes && openaiDbRes.ok) {
          const data = await openaiDbRes.json();
          if (data.configured) {
            setOpenaiApiKey('••••••••••••••••');
            setTempOpenaiApiKey('••••••••••••••••');
          }
        }
      } catch (e) {
        console.error('Failed to load settings:', e);
      }
    };
    initSettings();
  }, []);

  // Clear the polling interval on component unmount to prevent memory leaks
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Live tick while the worker is internally waiting for AI capacity (token budget).
  // Server provides an absolute waitUntil timestamp — we count down to it every second.
  useEffect(() => {
    if (capacityWaitUntil === null) {
      setCapacityWaitSeconds(null);
      return;
    }
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((capacityWaitUntil - Date.now()) / 1000));
      setCapacityWaitSeconds(remaining > 0 ? remaining : null);
    };
    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [capacityWaitUntil]);

  const saveSettings = async (
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
      // Persist only non-sensitive preferences — never store API keys in localStorage
      localStorage.setItem('equigen_settings', JSON.stringify({
        provider,
        groqModel: gModel,
        openaiModel: oModel
      }));

      // Push encrypted keys server-side in database securely
      await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'groq', apiKey: gKey })
      });

      await fetch('/api/settings/keys', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'openai', apiKey: oKey })
      });

      showToast('AI configurations saved securely!', 'success');
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
          saveHistoryToLocalStorage(mapped);
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

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
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

    // Save to Database first, to verify it persists correctly
    try {
      const res = await fetch('/api/history', {
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
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.error('Failed to save to database history:', errData.message || res.statusText);
        showToast(`Warning: Report not saved to database. (${errData.message || res.statusText})`, 'error');
      }
    } catch (e) {
      console.error('Failed to save to database history:', e);
      showToast('Database connection failed. Saving locally only.', 'error');
    }

    // Save to state and local storage
    const filtered = history.filter(item => item.id !== newItem.id);
    const updated = [newItem, ...filtered];
    setHistory(updated);
    saveHistoryToLocalStorage(updated);
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
    setActiveTab('preview');
    setShowConfig(false);
    setIsChatOpen(true);

    // Fetch proposals and audit logs
    fetchProposals(item.id);
    fetchAuditLogs(item.id);
    fetchChatSession(item.id);

    showToast(`Loaded report for ${item.companyName}`, 'info');
  };

  const fetchChatSession = async (reportId: string) => {
    try {
      const res = await fetch(`/api/agent/session?reportId=${reportId}`);
      if (res.ok) {
        const session = await res.json();
        setActiveSessionId(session.id);
        setChatMessages(session.messages || []);
      }
    } catch (e) {
      console.error('Failed to load chat session:', e);
    }
  };

  const sendChatMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim() || !activeSessionId || chatLoading) return;

    const userMsg = chatInput;
    setChatInput('');

    // RULE 5.1 / 7: Intercept and prompt if report is already approved or published
    if (activeReportStatus === 'approved' || activeReportStatus === 'published') {
      setPendingForkPrompt(userMsg);
      setIsForkModalOpen(true);
      return;
    }

    await executeChatMessage(userMsg);
  };

  const executeChatMessage = async (userMsg: string) => {
    setChatMessages((prev) => [...prev, { role: 'user', content: userMsg }]);
    setChatLoading(true);

    try {
      const rawApiKey = aiProvider === 'groq' ? groqApiKey : openaiApiKey;
      const resolvedApiKey = rawApiKey && rawApiKey.includes('•') ? undefined : rawApiKey || undefined;

      const res = await fetch('/api/agent/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId: activeSessionId,
          prompt: userMsg,
          provider: aiProvider,
          modelName: aiProvider === 'groq' ? groqModel : openaiModel,
          apiKey: resolvedApiKey
        })
      });

      if (res.ok) {
        const data = await res.json();
        setChatMessages((prev) => [...prev, { role: 'agent', content: data.response }]);

        // If the report was forked to a new draft baseline, refresh active report and redirect pointers
        if (data.forkedReportId && activeReportId) {
          showToast('Report forked to a new draft for edits!', 'info');

          // Refresh report list & select the new fork
          const historyRes = await fetch('/api/history');
          if (historyRes.ok) {
            const list = await historyRes.json() as HistoryApiItem[];
            const mapped = list.map((item) => ({
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

            const forkedItem = mapped.find((h) => h.id === data.forkedReportId);
            if (forkedItem) {
              setCompanyName(forkedItem.companyName);
              setReportData(forkedItem.reportData);
              setReportPdfBase64(forkedItem.reportPdfBase64);
              setActiveReportId(forkedItem.id);
              setActiveReportStatus(forkedItem.status);

              // Refresh proposals & logs for the new fork
              fetchProposals(forkedItem.id);
              fetchAuditLogs(forkedItem.id);
              fetchChatSession(forkedItem.id);
            }
          }
        } else if (activeReportId) {
          // Reload proposals in case a new correction proposal was generated
          fetchProposals(activeReportId);
          fetchAuditLogs(activeReportId);

          // When corrections were applied in-chat, refresh the live preview and PDF
          if (data.correctionsApplied) {
            const refreshed = await refreshActiveReportFromHistory();
            await recompilePdfForActiveReport(refreshed?.reportData);
            showToast('Corrections applied — report preview & PDF updated', 'success');
          }
        }
      } else {
        const errData = await res.json().catch(() => ({}));
        const friendlyMsg = errData.message || 'Something went wrong while running the Co-Pilot. Please try again.';

        if (res.status === 429) {
          const waitMin = errData.retryAfterSeconds ? Math.ceil(Number(errData.retryAfterSeconds) / 60) : null;
          const retryNote = waitMin
            ? ` You can retry in ~${waitMin} min, or switch to the fast Freemium tier in AI Settings.`
            : ' You can switch to the fast Freemium tier in AI Settings for a speedier fallback.';
          setChatMessages((prev) => [...prev, {
            role: 'agent',
            content: '⚠️ Rate limit reached: ' + friendlyMsg + retryNote,
            isError: true,
            retryPrompt: userMsg
          }]);
          showToast('Co-Pilot rate-limited — see message in chat', 'error');
        } else {
          setChatMessages((prev) => [...prev, {
            role: 'agent',
            content: '⚠️ ' + friendlyMsg,
            isError: true,
            retryPrompt: userMsg
          }]);
          showToast(friendlyMsg, 'error');
        }
      }
    } catch (err) {
      console.error(err);
      setChatMessages((prev) => [...prev, {
        role: 'agent',
        content: '⚠️ Connection to the Co-Pilot failed. Check your network and try again.',
        isError: true,
        retryPrompt: userMsg
      }]);
      showToast('Connection failed — see message in chat', 'error');
    } finally {
      setChatLoading(false);
    }
  };

  const confirmForkChat = async () => {
    setIsForkModalOpen(false);
    const msg = pendingForkPrompt;
    setPendingForkPrompt('');
    if (msg) {
      await executeChatMessage(msg);
    }
  };

  const fetchProposals = async (reportId: string) => {
    try {
      const res = await fetch(`/api/proposals?reportId=${reportId}`);
      if (res.ok) {
        const data = await res.json();
        setProposals(data);
      }
    } catch (e) {
      console.error('Failed to load proposals:', e);
    }
  };

  const fetchAuditLogs = async (reportId: string) => {
    try {
      const res = await fetch(`/api/audit?reportId=${reportId}`);
      if (res.ok) {
        const data = await res.json();
        setAuditLogs(data);
      }
    } catch (e) {
      console.error('Failed to load audit logs:', e);
    }
  };

  const handleProposalAction = async (proposalId: string, status: 'approved' | 'rejected') => {
    try {
      const res = await fetch('/api/proposals', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ proposalId, status, reviewerName: reviewerName || 'analyst' })
      });
      if (res.ok) {
        showToast(`Proposal successfully ${status}!`, 'success');
        if (activeReportId) {
          fetchProposals(activeReportId);
          fetchAuditLogs(activeReportId);
          // Reload report history & regenerate the PDF so the preview/downloads match
          const refreshed = await refreshActiveReportFromHistory();
          await recompilePdfForActiveReport(refreshed?.reportData);
        }
      } else {
        const err = await res.json();
        showToast(err.message || 'Action failed', 'error');
      }
    } catch (e) {
      console.error(e);
      showToast('Connection failed', 'error');
    }
  };

  // Reloads the report history list and re-selects the active report so the live
  // preview always reflects corrections applied via proposals or the Co-Pilot chat.
  const refreshActiveReportFromHistory = async (preferId?: string): Promise<HistoryItem | null> => {
    try {
      const historyRes = await fetch('/api/history');
      if (!historyRes.ok) return null;
      const list = await historyRes.json() as HistoryApiItem[];
      const mapped = list.map((item) => ({
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
      const targetId = preferId || activeReportId;
      const currentItem = mapped.find((h) => h.id === targetId);
      if (currentItem) {
        setCompanyName(currentItem.companyName);
        setReportData(currentItem.reportData);
        setReportPdfBase64(currentItem.reportPdfBase64);
        setActiveReportStatus(currentItem.status);
      }
      return currentItem || null;
    } catch (e) {
      console.error('Failed to refresh report from history:', e);
      return null;
    }
  };

  // Regenerates the compiled PDF for the active report so downloads mirror the latest reportData.
  const recompilePdfForActiveReport = async (dataOverride?: EquityResearchData) => {
    const dataForPdf = dataOverride || reportData;
    if (!dataForPdf || !activeReportId) return;
    try {
      const res = await fetch('/api/report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...dataForPdf, status: activeReportStatus === 'published' ? 'published' : 'draft' })
      });
      if (res.ok) {
        const updated = await res.json();
        setReportPdfBase64(updated.pdfBase64);
        setHistory((prev) => prev.map((h) =>
          h.id === activeReportId ? { ...h, reportPdfBase64: updated.pdfBase64 } : h
        ));
      }
    } catch (e) {
      console.error('Failed to recompile PDF:', e);
    }
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
    saveHistoryToLocalStorage(updated);

    showToast('Report removed from history.', 'info');
    if (reportData?.company?.ticker === id) {
      startNewAnalysis();
    }
  };

  const [steps, setSteps] = useState<ProgressStep[]>([
    { label: 'Reading uploaded document structure', status: 'idle' },
    { label: 'Extracting key metrics using Freemium AI', status: 'idle' },
    { label: 'Formatting financial sheets & ratios', status: 'idle' },
    { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
  ]);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
    // Auto-dismiss after a few seconds (errors stay a bit longer)
    const duration = type === 'error' ? 6000 : 4000;
    setTimeout(() => removeToast(id), duration);
  };

  const removeToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Pretty-prints proposal old/new values so long arrays/objects stay readable and wrap.
  const formatDiffValue = (value: unknown): string => {
    if (value === undefined) return 'undefined';
    if (value === null) return 'null';
    if (typeof value === 'string') return value;
    try {
      const pretty = JSON.stringify(value, null, 2);
      return pretty && pretty.length > 400 ? JSON.stringify(value) : pretty;
    } catch {
      return String(value);
    }
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

  const startThrottledCountdown = (waitSeconds: number, currentSteps = steps, activeIndex = currentStepIndex) => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }

    // Keep the throttled/running step status
    const updatedSteps = [...currentSteps];
    if (updatedSteps[activeIndex]) {
      updatedSteps[activeIndex].status = 'running';
      setSteps(updatedSteps);
    }

    let remainingSeconds = waitSeconds;
    setThrottleCountdown(formatDuration(remainingSeconds));

    const intervalId = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        clearInterval(intervalId);
        setThrottleCountdown(null);
      } else {
        setThrottleCountdown(formatDuration(remainingSeconds));
      }
    }, 1000);

    setTimeout(() => {
      clearInterval(intervalId);
      setThrottleCountdown(null);
      resumeGeneration();
    }, waitSeconds * 1000);
  };

  async function startGeneration(e: React.FormEvent) {
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
      { label: `Extracting key metrics using ${aiProvider === 'groq' ? 'Freemium AI' : 'OpenAI GPT-4o'}`, status: 'idle' },
      { label: 'Formatting financial sheets & ratios', status: 'idle' },
      { label: 'Compiling Geojit-style PDF layout', status: 'idle' }
    ];
    setSteps(updatedSteps);
    showToast('Starting report generation pipeline...', 'info');

    // Helper to format duration text
    const formatDurationText = (totalSecs: number) => {
      if (totalSecs >= 3600) {
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        return `${hrs}h ${mins}m`;
      } else if (totalSecs >= 60) {
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins}m ${secs}s`;
      }
      return `${totalSecs}s`;
    };

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
        const errText = await uploadRes.text();
        let message = 'Failed to read document structure.';
        try {
          const parsed = JSON.parse(errText);
          if (parsed && parsed.message) message = parsed.message;
        } catch {
          const snippet = errText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
          if (snippet) message = `Upload failed (HTTP ${uploadRes.status}). ${snippet.slice(0, 300)}`;
        }
        throw new Error(message);
      }

      const uploadData = await uploadRes.json();
      const rawText = uploadData.text;
      const docTargeting = uploadData.targeting;
      updatedSteps[0].status = 'completed';
      setSteps([...updatedSteps]);

      // --- Step 2: Queue AI Metric Extraction Job ---
      setCurrentStepIndex(1);
      updatedSteps[1].status = 'running';
      setSteps([...updatedSteps]);

      const rawApiKey = aiProvider === 'groq' ? groqApiKey : openaiApiKey;
      // Don't send the masked placeholder — the DB already has the encrypted key
      const resolvedApiKey = rawApiKey && rawApiKey.includes('•') ? undefined : rawApiKey || undefined;

      const extractRes = await fetch('/api/extract', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          companyName,
          rawText,
          fileName: file.name,       // ← pass the real filename
          provider: aiProvider,
          modelName: aiProvider === 'groq' ? groqModel : openaiModel,
          apiKey: resolvedApiKey,
          jobId,
          documentId: docTargeting?.documentId,
          targetingVerdict: docTargeting?.verdict
        })
      });

      const extractData = await extractRes.json();
      if (!extractRes.ok && extractRes.status !== 202) {
        throw new Error(extractData.message || 'AI extraction failed.');
      }

      const activeJob = extractData.jobId;
      setCurrentJobId(activeJob);

      // Start Polling loop (stored in ref so it can be cleared on unmount)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/extract/status?jobId=${activeJob}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();

          // Sync current checkpoint index
          const activeStepIdx = statusData.stepIndex || 0;
          for (let i = 0; i < updatedSteps.length; i++) {
            if (i < activeStepIdx) {
              updatedSteps[i].status = 'completed';
            } else if (i === activeStepIdx) {
              updatedSteps[i].status = 'running';
            } else {
              updatedSteps[i].status = 'idle';
            }
          }
          setCurrentStepIndex(activeStepIdx);
          setSteps([...updatedSteps]);

          // Surface internal "waiting for AI capacity" pauses with a live countdown
          if (statusData.status === 'running' && statusData.waitSeconds != null && statusData.waitSeconds > 0) {
            setCapacityWaitUntil(new Date(statusData.waitUntil).getTime());
          } else {
            setCapacityWaitUntil(null);
          }

          if (statusData.status === 'throttled') {
            const waitSeconds = statusData.retryAfterSeconds || 20;
            // If wait time is more than 5 minutes (300 seconds), stop and request manual retry later
            if (waitSeconds > 300) {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              const resetTime = new Date(Date.now() + waitSeconds * 1000).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const durationText = formatDurationText(waitSeconds);
              const limitMsg = `Daily Groq rate limit reached. Reset window requires a wait of ${durationText}. Please retry after ${resetTime}.`;
              setError(limitMsg);
              showToast(limitMsg, 'error');
              
              // Correctly mark active running step as failed and clear others
              for (let i = 0; i < updatedSteps.length; i++) {
                if (i === activeStepIdx) {
                  updatedSteps[i].status = 'failed';
                } else if (updatedSteps[i].status === 'running') {
                  updatedSteps[i].status = 'idle';
                }
              }
              setSteps([...updatedSteps]);
              setLoading(false);
              setThrottleCountdown(null);
              return;
            }

            startThrottledCountdown(waitSeconds, updatedSteps, activeStepIdx);
            return;
          } else {
            setThrottleCountdown(null);
          }

          if (statusData.status === 'failed' || statusData.status === 'blocked_financials') {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            setError(statusData.errorMessage || 'AI generation failed');
            updatedSteps[1].status = 'failed';
            setSteps([...updatedSteps]);
            setLoading(false);
            setThrottleCountdown(null);
            setCapacityWaitUntil(null);
          }

          if (statusData.status === 'completed') {
            // The worker finalizes the report row after extraction — keep polling until reportId exists
            if (!statusData.reportId) return;
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }

            // --- Step 3: Format Financial Ratios & Generate Charts ---
            setCurrentStepIndex(2);
            updatedSteps[2].status = 'running';
            setSteps([...updatedSteps]);

            // Fetch report details created by the worker
            const historyRes = await fetch('/api/history');
            const historyData = await historyRes.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const createdReport = historyData.find((h: any) => h.id === statusData.reportId);

            if (!createdReport) {
              throw new Error('Report could not be resolved from history database.');
            }

            const extractedData = createdReport.reportData as EquityResearchData;
            setReportPdfBase64(createdReport.pdfBase64);

            // Give the user a visible beat on "Formatting financial sheets & ratios"
            await new Promise(resolve => setTimeout(resolve, 1200));
            updatedSteps[2].status = 'completed';
            setSteps([...updatedSteps]);

            // --- Step- 4: Compile Geojit PDF ---
            setCurrentStepIndex(3);
            updatedSteps[3].status = 'running';
            setSteps([...updatedSteps]);

            await new Promise(resolve => setTimeout(resolve, 1200));
            updatedSteps[3].status = 'completed';
            setSteps([...updatedSteps]);

            setReportData(extractedData);
            setActiveReportId(createdReport.id);
            setActiveReportStatus(createdReport.status || 'draft');
            fetchChatSession(createdReport.id);
            setShowConfig(false);
            setIsChatOpen(true);
            showToast('Equity report compiled successfully!', 'success');
            setLoading(false);
          }
        } catch (pollErr) {
          console.error('Status polling error:', pollErr);
        }
      }, 2000);

    } catch (err: unknown) {
      console.error('Generation pipeline failed:', err);
      const errMsg = err instanceof Error ? err.message : 'An error occurred during report generation.';

      // Detect throttled signal from API response message or error message
      const isThrottled = errMsg.toLowerCase().includes('throttled') ||
        errMsg.toLowerCase().includes('rate limit') ||
        errMsg.toLowerCase().includes('rate_limit_exceeded');

      if (isThrottled && currentJobId) {
        // Parse retry delay from error message (e.g. "auto-resume in 23s" or "try again in 23.22s")
        const matchDelay = errMsg.match(/(?:auto-resume in|try again in|in)\s+(?:(\d+)h)?(?:(\d+)m)?(?:([\d.]+)s)?/i);
        let waitSeconds = 20;

        if (matchDelay) {
          const hrs = matchDelay[1] ? parseInt(matchDelay[1], 10) : 0;
          const mins = matchDelay[2] ? parseInt(matchDelay[2], 10) : 0;
          const secs = matchDelay[3] ? parseFloat(matchDelay[3]) : 0;
          waitSeconds = (hrs * 3600) + (mins * 60) + Math.ceil(secs);
        }

        const durationText = formatDurationText(waitSeconds);

        // If wait time is more than 5 minutes (300 seconds), stop and request manual retry later
        if (waitSeconds > 300) {
          if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
          const resetTime = new Date(Date.now() + waitSeconds * 1000).toLocaleTimeString('en-IN', {
            hour: '2-digit',
            minute: '2-digit'
          });
          const limitMsg = `Daily Groq rate limit reached. Reset window requires a wait of ${durationText}. Please retry after ${resetTime}.`;
          setError(limitMsg);
          showToast(limitMsg, 'error');
          
          const activeIdx = updatedSteps.findIndex(s => s.status === 'running');
          const targetIdx = activeIdx !== -1 ? activeIdx : currentStepIndex;
          for (let i = 0; i < updatedSteps.length; i++) {
            if (i === targetIdx) {
              updatedSteps[i].status = 'failed';
            } else if (updatedSteps[i].status === 'running') {
              updatedSteps[i].status = 'idle';
            }
          }
          setSteps([...updatedSteps]);
          setLoading(false);
          setThrottleCountdown(null);
          return;
        }

        startThrottledCountdown(waitSeconds, updatedSteps, currentStepIndex);
        return;
      }

      // Genuine failure (not a rate limit)
      setError(errMsg);
      showToast(errMsg, 'error');

      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      const activeIdx = updatedSteps.findIndex(s => s.status === 'running');
      const targetIdx = activeIdx !== -1 ? activeIdx : currentStepIndex;
      for (let i = 0; i < updatedSteps.length; i++) {
        if (i === targetIdx) {
          updatedSteps[i].status = 'failed';
        } else if (updatedSteps[i].status === 'running') {
          updatedSteps[i].status = 'idle';
        }
      }
      setSteps([...updatedSteps]);
    } finally {
      setLoading(false);
    }
  }

  async function resumeGeneration() {
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

    const formatDurationText = (totalSecs: number) => {
      if (totalSecs >= 3600) {
        const hrs = Math.floor(totalSecs / 3600);
        const mins = Math.floor((totalSecs % 3600) / 60);
        return `${hrs}h ${mins}m`;
      } else if (totalSecs >= 60) {
        const mins = Math.floor(totalSecs / 60);
        const secs = totalSecs % 60;
        return `${mins}m ${secs}s`;
      }
      return `${totalSecs}s`;
    };

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
      if (!res.ok && res.status !== 202) {
        throw new Error(data.message || 'Resume extraction failed');
      }

      // Start Polling loop for resumption progress (stored in ref)
      pollIntervalRef.current = setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/extract/status?jobId=${currentJobId}`);
          if (!statusRes.ok) return;

          const statusData = await statusRes.json();

          // Sync current checkpoint steps index
          if (statusData.stepIndex > startIdx) {
            for (let i = startIdx; i < statusData.stepIndex; i++) {
              if (updatedSteps[i]) updatedSteps[i].status = 'completed';
            }
            setSteps([...updatedSteps]);
          }

          // Surface internal "waiting for AI capacity" pauses with a live countdown
          if (statusData.status === 'running' && statusData.waitSeconds != null && statusData.waitSeconds > 0) {
            setCapacityWaitUntil(new Date(statusData.waitUntil).getTime());
          } else {
            setCapacityWaitUntil(null);
          }

          if (statusData.status === 'throttled') {
            const waitSeconds = statusData.retryAfterSeconds || 20;
            // If wait time is more than 5 minutes (300 seconds), stop and request manual retry later
            if (waitSeconds > 300) {
              if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
              const resetTime = new Date(Date.now() + waitSeconds * 1000).toLocaleTimeString('en-IN', {
                hour: '2-digit',
                minute: '2-digit'
              });
              const durationText = formatDurationText(waitSeconds);
              const limitMsg = `Daily Groq rate limit reached. Reset window requires a wait of ${durationText}. Please retry after ${resetTime}.`;
              setError(limitMsg);
              showToast(limitMsg, 'error');
              
              const activeIdx = statusData.stepIndex !== undefined ? statusData.stepIndex : startIdx;
              for (let i = 0; i < updatedSteps.length; i++) {
                if (i === activeIdx) {
                  updatedSteps[i].status = 'failed';
                } else if (updatedSteps[i].status === 'running') {
                  updatedSteps[i].status = 'idle';
                }
              }
              setSteps([...updatedSteps]);
              setLoading(false);
              setThrottleCountdown(null);
              return;
            }

            const activeIdx = statusData.stepIndex !== undefined ? statusData.stepIndex : startIdx;
            startThrottledCountdown(waitSeconds, updatedSteps, activeIdx);
            return;
          } else {
            setThrottleCountdown(null);
          }

          if (statusData.status === 'failed' || statusData.status === 'blocked_financials') {
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }
            setError(statusData.errorMessage || 'Resume failed');
            
            const activeIdx = statusData.stepIndex !== undefined ? statusData.stepIndex : startIdx;
            for (let i = 0; i < updatedSteps.length; i++) {
              if (i === activeIdx) {
                updatedSteps[i].status = 'failed';
              } else if (updatedSteps[i].status === 'running') {
                updatedSteps[i].status = 'idle';
              }
            }
            setSteps([...updatedSteps]);
            setLoading(false);
          }

          if (statusData.status === 'completed') {
            // The worker finalizes the report row after extraction — keep polling until reportId exists
            if (!statusData.reportId) return;
            if (pollIntervalRef.current) { clearInterval(pollIntervalRef.current); pollIntervalRef.current = null; }

            // Complete all remaining steps in UI
            for (let i = startIdx; i < updatedSteps.length; i++) {
              updatedSteps[i].status = 'completed';
            }
            setSteps([...updatedSteps]);

            // Fetch report details created by the worker
            const historyRes = await fetch('/api/history');
            const historyData = await historyRes.json();
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            const createdReport = historyData.find((h: any) => h.id === statusData.reportId);

            if (!createdReport) {
              throw new Error('Report could not be resolved from history database.');
            }

            const extractedData = createdReport.reportData as EquityResearchData;
            setReportPdfBase64(createdReport.pdfBase64);

            setReportData(extractedData);
            setActiveReportId(createdReport.id);
            setActiveReportStatus(createdReport.status || 'draft');
            fetchChatSession(createdReport.id);
            setShowConfig(false);
            setIsChatOpen(true);
            showToast('Equity report successfully recovered and compiled!', 'success');
            setLoading(false);
          }
        } catch (pollErr) {
          console.error('Status polling error during resume:', pollErr);
        }
      }, 2000);

    } catch (err: unknown) {
      console.error('Resume pipeline failed:', err);
      const errMessage = err instanceof Error ? err.message : 'Unknown Error';
      setError(errMessage);
      showToast(errMessage, 'error');
      
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }

      const activeIdx = updatedSteps.findIndex(s => s.status === 'running');
      const targetIdx = activeIdx !== -1 ? activeIdx : startIdx;
      for (let i = 0; i < updatedSteps.length; i++) {
        if (i === targetIdx) {
          updatedSteps[i].status = 'failed';
        } else if (updatedSteps[i].status === 'running') {
          updatedSteps[i].status = 'idle';
        }
      }
      setSteps([...updatedSteps]);
      setLoading(false);
    } finally {
      setLoading(false);
    }
  }

  const triggerDownload = async (reportId: string) => {
    setIsDownloading(true);
    showToast('Preparing PDF download...', 'info');
    try {
      let blob: Blob;
      let filename = `equity-report-${reportId.toLowerCase()}.pdf`;

      if (reportPdfBase64) {
        const bytes = Uint8Array.from(atob(reportPdfBase64), (c) => c.charCodeAt(0));
        blob = new Blob([bytes], { type: 'application/pdf' });
      } else {
        const res = await fetch(`/api/download?id=${encodeURIComponent(reportId)}`);
        if (!res.ok) {
          const errData = await res.json().catch(() => ({}));
          throw new Error(errData.message || `PDF download failed (HTTP ${res.status}).`);
        }
        blob = await res.blob();
        if (blob.type !== 'application/pdf') {
          throw new Error('Server did not return a PDF. Please try again.');
        }
        const disposition = res.headers.get('content-disposition') || '';
        const match = disposition.match(/filename="?([^";]+)"?/i);
        if (match && match[1]) filename = match[1];
      }

      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);

      showToast('PDF downloaded successfully!', 'success');
    } catch (err: unknown) {
      const errMessage = err instanceof Error ? err.message : 'Failed to trigger download.';
      console.error('PDF download failed:', errMessage);
      showToast(errMessage, 'error');
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="h-screen w-screen flex bg-[#0c0c0f] text-slate-100 antialiased font-sans overflow-hidden">

      {/* ── Left Sidebar ─────────────────────────────────────────────── */}
      <aside
        className={`h-screen bg-[#111115] border-r border-white/[0.06] flex flex-col shrink-0 z-20 ${isSidebarOpen
          ? activeResizer === 'sidebar' ? '' : 'transition-all duration-300'
          : 'w-0 overflow-hidden lg:w-14'
          }`}
        style={isSidebarOpen ? { width: panelWidths.sidebar } : undefined}
      >

        {/* Logo */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-white/[0.06] shrink-0">
          <div className="p-1.5 bg-blue-600 rounded-lg shrink-0">
            <BarChart3 className="w-4 h-4 text-white" />
          </div>
          {isSidebarOpen && (
            <span className="text-sm font-black tracking-widest uppercase text-white">EquiGen</span>
          )}
        </div>

        {/* New Analysis Button */}
        <div className="px-3 pt-3 pb-2 shrink-0">
          <button
            onClick={startNewAnalysis}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs font-bold transition-all active:scale-95 shadow-lg shadow-blue-600/20 ${!isSidebarOpen && 'justify-center px-0'}`}
          >
            <Plus className="w-3.5 h-3.5 shrink-0" />
            {isSidebarOpen && <span>New Analysis</span>}
          </button>
        </div>

        {/* History */}
        <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5 min-h-0">
          {isSidebarOpen && (
            <div className="px-3 py-1 flex items-center justify-between border-b border-white/[0.04] mb-2 pb-2">
              <span className="text-[9px] font-bold uppercase tracking-widest text-slate-500">
                {viewQueueOnly ? 'Review Queue' : `Recent Reports (${history.length})`}
              </span>
              <button
                onClick={() => setViewQueueOnly(!viewQueueOnly)}
                className={`px-2 py-0.5 rounded text-[9px] font-bold transition-all border ${viewQueueOnly
                  ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                  : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                  }`}
              >
                {viewQueueOnly ? 'Show All' : 'Show Review Queue'}
              </button>
            </div>
          )}
          {!isSidebarOpen && (
            <button
              onClick={() => setViewQueueOnly(!viewQueueOnly)}
              title="Toggle Review Queue Only"
              className={`w-8 h-8 rounded-lg mx-auto mt-2 flex items-center justify-center border transition-all ${viewQueueOnly ? 'bg-amber-500/20 border-amber-500/40 text-amber-300' : 'border-transparent text-slate-500'
                }`}
            >
              <Activity className="w-4 h-4" />
            </button>
          )}
          {history.length === 0 && isSidebarOpen && (
            <div className="px-3 py-8 text-center text-[11px] text-slate-600 italic">No reports yet</div>
          )}
          {history
            .filter((item) => {
              if (!viewQueueOnly) return true;
              return item.status === 'under_review' || item.status === 'changes_requested' || item.status === 'draft';
            })
            .map((item) => (
              <div
                key={item.id}
                onClick={() => selectHistoryItem(item)}
                title={!isSidebarOpen ? `${item.companyName} (${item.status})` : undefined}
                className={`group relative flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer transition-all ${reportData?.company?.ticker === item.id
                  ? 'bg-blue-600/20 text-blue-300 border border-blue-500/20'
                  : 'hover:bg-white/[0.04] text-slate-400 hover:text-slate-200'
                  } ${!isSidebarOpen && 'justify-center px-0'}`}
              >
                <FileText className="w-3.5 h-3.5 shrink-0 opacity-60" />
                {isSidebarOpen && (
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-1.5">
                      <div className="text-[11px] font-semibold truncate">{item.companyName}</div>
                      <span className={`px-1 py-0.2 text-[8px] font-black uppercase rounded shrink-0 ${item.status === 'published' ? 'bg-emerald-500/20 text-emerald-300' :
                        item.status === 'approved' ? 'bg-blue-500/20 text-blue-300' :
                          item.status === 'changes_requested' ? 'bg-rose-500/20 text-rose-300' :
                            item.status === 'under_review' ? 'bg-amber-500/20 text-amber-300' :
                              'bg-white/[0.06] text-slate-400'
                        }`}>
                        {item.status || 'draft'}
                      </span>
                    </div>
                    <div className="text-[9px] text-slate-600 mt-0.5 truncate">{item.createdAt}</div>
                  </div>
                )}
                {isSidebarOpen && (
                  <button
                    onClick={(e) => deleteHistoryItem(item.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-white/10 rounded-lg text-slate-500 hover:text-rose-400 transition-all shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                )}
              </div>
            ))}
        </div>

        {/* Settings */}
        <div className="px-3 pb-4 pt-2 border-t border-white/[0.06] shrink-0 space-y-1">
          <button
            onClick={() => {
              setTempProvider(aiProvider);
              setTempGroqApiKey(groqApiKey);
              setTempOpenaiApiKey(openaiApiKey);
              setTempGroqModel(groqModel);
              setTempOpenaiModel(openaiModel);
              setIsSettingsOpen(true);
            }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl hover:bg-white/[0.05] text-slate-400 hover:text-slate-200 transition-all cursor-pointer active:scale-95 ${!isSidebarOpen && 'justify-center px-0'}`}
          >
            <Settings className="w-4 h-4 shrink-0" />
            {isSidebarOpen && <span className="text-xs font-semibold">Settings</span>}
          </button>
          {isSidebarOpen && (
            <div className="flex items-center gap-2 px-3 py-1.5">
              <Activity className="w-3 h-3 text-emerald-400 animate-pulse shrink-0" />
              <span className="text-[9px] font-bold text-slate-600 uppercase tracking-widest truncate">
                {aiProvider === 'groq' ? 'Freemium AI' : 'OpenAI Active'}
              </span>
            </div>
          )}
        </div>
      </aside>

      {/* Sidebar resize handle */}
      {isSidebarOpen && (
        <PanelResizer
          side="right"
          width={panelWidths.sidebar}
          defaultWidth={DEFAULT_PANEL_WIDTHS.sidebar}
          min={PANEL_LIMITS.sidebar.min}
          max={PANEL_LIMITS.sidebar.max}
          onResize={(w) => setPanelWidths((p) => ({ ...p, sidebar: w }))}
          onStart={() => setActiveResizer('sidebar')}
          onEnd={() => setActiveResizer(null)}
        />
      )}

      {/* ── Main Area ─────────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">

        {/* Top Header */}
        <header className="flex items-center justify-between px-6 py-3.5 border-b border-white/[0.06] bg-[#111115] shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-white/[0.06] rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
            >
              <Menu className="w-4 h-4" />
            </button>
            <div>
              <h1 className="text-sm font-bold text-white">AI Equity Research Generator</h1>
              <p className="text-[10px] text-slate-500 font-medium mt-0.5">Geojit-style publication-grade PDF reports from raw financials</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* User Role Indicator with Mock selector */}
            <div className="flex items-center gap-2 px-3 py-1 bg-white/[0.04] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-300">
              <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Role:</span>
              <select
                value={userRole}
                onChange={(e) => {
                  setUserRole(e.target.value as UserRole);
                  showToast(`Switched active role to ${e.target.value}`, 'info');
                }}
                className="bg-transparent border-none text-xs font-bold text-white focus:outline-none cursor-pointer"
              >
                <option value="analyst" className="bg-[#111115]">Analyst</option>
                <option value="research_analyst" className="bg-[#111115]">Research Analyst (RA)</option>
                <option value="admin" className="bg-[#111115]">Admin</option>
              </select>
            </div>

            {/* Model badge */}
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 bg-white/[0.04] border border-white/[0.08] rounded-lg">
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
              <span className="text-[10px] font-bold text-slate-400">
                {aiProvider === 'groq'
                  ? 'Freemium AI · auto-fallback'
                  : `OpenAI · ${openaiModel === 'gpt-4o-mini' ? 'GPT-4o Mini' : 'GPT-4o'}`
                }
              </span>
            </div>
            <button
              onClick={() => setShowConfig(!showConfig)}
              className={`p-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${showConfig ? 'bg-blue-600/20 border-blue-500/30 text-blue-300' : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                }`}
              title="Toggle Report Configuration Panel"
            >
              <Layers className="w-4 h-4" />
              <span className="hidden md:inline">Configuration</span>
            </button>
            {reportData && (
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                className={`p-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 border ${isChatOpen ? 'bg-blue-600/20 border-blue-500/30 text-blue-300' : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-slate-200'
                  }`}
              >
                <Sparkles className="w-4 h-4" />
                <span>AI Co-Pilot</span>
              </button>
            )}
            <button
              onClick={() => {
                setTempProvider(aiProvider);
                setTempGroqApiKey(groqApiKey);
                setTempOpenaiApiKey(openaiApiKey);
                setTempGroqModel(groqModel);
                setTempOpenaiModel(openaiModel);
                setIsSettingsOpen(true);
              }}
              className="p-2 hover:bg-white/[0.06] rounded-lg text-slate-500 hover:text-slate-200 transition-colors"
              title="AI Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* ── Toast Notifications */}
        <div className="fixed top-4 right-4 z-50 space-y-2 max-w-xs pointer-events-none">
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className={`pointer-events-auto flex items-start justify-between gap-3 p-3.5 rounded-xl shadow-2xl border text-xs font-semibold backdrop-blur-xl transition-all ${toast.type === 'success'
                ? 'bg-emerald-950/90 border-emerald-800/60 text-emerald-200'
                : toast.type === 'error'
                  ? 'bg-rose-950/90 border-rose-800/60 text-rose-200'
                  : 'bg-blue-950/90 border-blue-800/60 text-blue-200'
                }`}
            >
              <div className="flex items-center gap-2">
                {toast.type === 'success' && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                {toast.type === 'error' && <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />}
                {toast.type === 'info' && <Sparkles className="w-4 h-4 text-blue-400 shrink-0" />}
                <span className="leading-snug">{toast.message}</span>
              </div>
              <button onClick={() => removeToast(toast.id)} className="p-0.5 opacity-60 hover:opacity-100 transition-opacity shrink-0">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>

        {/* ── Main content layout */}
        <div className="flex-1 flex bg-[#0a0a0d] overflow-hidden relative">

          {/* ─── Column 1 — Configuration ─────────────────────── */}
          {showConfig && (
            <div
              className="w-full lg:w-[var(--config-w)] shrink-0 border-r border-white/[0.06] bg-[#111115]/30 flex flex-col h-full overflow-y-auto p-5 space-y-4 scrollbar-thin"
              style={{ '--config-w': `${panelWidths.config}px` } as React.CSSProperties}
            >

              {/* Report Configuration Card */}
              <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.06]">
                  <div className="flex items-center gap-2.5">
                    <div className="p-1.5 bg-blue-600/20 rounded-lg">
                      <Layers className="w-3.5 h-3.5 text-blue-400" />
                    </div>
                    <h2 className="text-sm font-bold text-white">Report Configuration</h2>
                  </div>
                </div>
                <div className="p-5 space-y-5">
                  <form onSubmit={startGeneration} className="space-y-5">

                    {/* Company name */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Company Name
                      </label>
                      <input
                        type="text"
                        value={companyName}
                        onChange={(e) => setCompanyName(e.target.value)}
                        placeholder="e.g. Tata Consultancy Services"
                        className="w-full px-4 py-3 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-white placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all text-sm font-medium"
                        disabled={loading}
                      />
                    </div>

                    {/* File Upload */}
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                        Financial Document
                      </label>

                      {!file ? (
                        <div
                          onDragEnter={handleDrag}
                          onDragOver={handleDrag}
                          onDragLeave={handleDrag}
                          onDrop={handleDrop}
                          onClick={() => fileInputRef.current?.click()}
                          className={`border-2 border-dashed rounded-xl p-7 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${isDragActive
                            ? 'border-blue-500/60 bg-blue-500/5'
                            : 'border-white/[0.08] bg-[#0f0f13] hover:border-white/[0.16] hover:bg-white/[0.02]'
                            }`}
                        >
                          <div className={`p-3 rounded-xl mb-3 transition-all ${isDragActive ? 'bg-blue-500/20' : 'bg-white/[0.04]'}`}>
                            <Upload className={`w-5 h-5 transition-colors ${isDragActive ? 'text-blue-400' : 'text-slate-500'}`} />
                          </div>
                          <span className="text-sm font-semibold text-slate-400 text-center">
                            Drop file here or <span className="text-blue-400">browse</span>
                          </span>
                          <span className="text-[11px] text-slate-600 mt-1">PDF, CSV, TXT — up to 10 MB</span>
                          <input ref={fileInputRef} type="file" accept=".pdf,.csv,.txt" onChange={handleFileChange} className="hidden" />
                        </div>
                      ) : (
                        <div className="flex items-center gap-3 p-3.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl">
                          <div className="p-2 bg-blue-500/15 rounded-lg">
                            <FileText className="w-4 h-4 text-blue-400" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-xs font-semibold text-white truncate">{file.name}</div>
                            <div className="text-[10px] text-slate-500 mt-0.5">{(file.size / (1024 * 1024)).toFixed(2)} MB</div>
                          </div>
                          <button type="button" onClick={removeFile} disabled={loading}
                            className="p-1.5 hover:bg-white/[0.06] rounded-lg text-slate-500 hover:text-rose-400 transition-colors">
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </div>

                    {/* Error */}
                    {error && (
                      <div className="flex items-start gap-2.5 p-3.5 bg-rose-950/40 border border-rose-800/40 rounded-xl">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                        <span className="text-xs text-rose-300 font-medium">{error}</span>
                      </div>
                    )}

                    {/* CTA */}
                    <button
                      type="submit"
                      disabled={loading || steps.some(s => s.status === 'running')}
                      className="w-full py-3.5 bg-blue-600 hover:bg-blue-500 disabled:bg-white/[0.04] disabled:text-slate-600 disabled:cursor-not-allowed text-white font-bold rounded-xl text-sm transition-all shadow-lg shadow-blue-600/20 active:scale-[0.98] flex items-center justify-center gap-2"
                    >
                      {loading || steps.some(s => s.status === 'running') ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          {throttleCountdown
                            ? `Resuming in ${throttleCountdown}...`
                            : capacityWaitSeconds != null
                              ? `Resuming in ${formatDuration(capacityWaitSeconds)}...`
                              : 'Processing Pipeline...'}
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4" />
                          Generate Equity Report
                        </>
                      )}
                    </button>
                  </form>
                </div>
              </div>

              {/* Quick Info Card */}
              <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl p-5 space-y-3">
                <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest">Pipeline Steps</p>
                <div className="space-y-2.5">
                  {[
                    { label: 'OCR + Text Extraction', icon: '01' },
                    { label: 'AI Metric Extraction', icon: '02' },
                    { label: 'Financial Ratio Formatting', icon: '03' },
                    { label: 'PDF Compile & Export', icon: '04' },
                  ].map((s) => (
                    <div key={s.icon} className="flex items-center gap-3">
                      <span className="text-[9px] font-black text-slate-600 tabular-nums">{s.icon}</span>
                      <span className="text-[11px] text-slate-500 font-medium">{s.label}</span>
                    </div>
                  ))}
                </div>
              </div>

            </div>
          )}

          {/* Configuration resize handle */}
          {showConfig && (
            <PanelResizer
              side="right"
              width={panelWidths.config}
              defaultWidth={DEFAULT_PANEL_WIDTHS.config}
              min={PANEL_LIMITS.config.min}
              max={PANEL_LIMITS.config.max}
              onResize={(w) => setPanelWidths((p) => ({ ...p, config: w }))}
              onStart={() => setActiveResizer('config')}
              onEnd={() => setActiveResizer(null)}
            />
          )}

          {/* ─── Column 2 — Workspace / Output ────────────────────────────── */}
          <div className="flex-1 h-full flex flex-col overflow-y-auto p-6 min-w-0 scrollbar-thin space-y-4">

            {/* Empty state */}
            {!loading && !reportData && !steps.some(s => s.status === 'failed') && !steps.some(s => s.status === 'running') && (
              <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl p-16 flex flex-col items-center justify-center text-center min-h-[420px] my-auto">
                <div className="p-5 bg-white/[0.03] border border-white/[0.06] rounded-2xl mb-5">
                  <BarChart3 className="w-10 h-10 text-slate-700" />
                </div>
                <h3 className="text-base font-bold text-slate-300">No report generated yet</h3>
                <p className="text-slate-600 text-xs mt-2 max-w-sm leading-relaxed">
                  Configure a company name and upload a financial document to start the AI extraction pipeline.
                </p>
                <div className="mt-8 grid grid-cols-3 gap-4 w-full max-w-sm">
                  {['PDF Reports', 'SWOT Analysis', 'SEBI Ready'].map((f) => (
                    <div key={f} className="p-3 bg-white/[0.02] border border-white/[0.05] rounded-xl text-center">
                      <div className="text-[10px] font-bold text-slate-500">{f}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Pipeline Progress Panel */}
            {(loading || steps.some(s => s.status === 'failed' || s.status === 'running')) && (
              <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-bold text-white">
                      {throttleCountdown
                        ? `Throttled: Resuming in ${throttleCountdown}...`
                        : capacityWaitSeconds != null
                          ? `AI at capacity — resuming in ${formatDuration(capacityWaitSeconds)}...`
                          : (loading || steps.some(s => s.status === 'running') ? 'Executing pipeline...' : 'Pipeline paused')}
                    </h3>
                    <p className="text-[10px] text-slate-600 font-mono mt-0.5">
                      {currentJobId ? `JOB · ${currentJobId}` : 'Initializing...'}
                    </p>
                  </div>
                  {(loading || steps.some(s => s.status === 'running')) && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                </div>

                <div className="p-5 space-y-3">
                  {steps.map((step, idx) => (
                    <div key={idx} className={`flex items-center gap-4 p-3.5 rounded-xl transition-all ${step.status === 'running' ? 'bg-blue-600/10 border border-blue-500/20' :
                      step.status === 'completed' ? 'bg-emerald-600/5 border border-emerald-800/20' :
                        step.status === 'failed' ? 'bg-rose-600/10 border border-rose-800/20' :
                          'bg-white/[0.02] border border-transparent'
                      }`}>
                      <div className="shrink-0">
                        {step.status === 'completed' && <CheckCircle2 className="w-4 h-4 text-emerald-400" />}
                        {step.status === 'running' && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                        {step.status === 'failed' && <AlertTriangle className="w-4 h-4 text-rose-400 animate-pulse" />}
                        {step.status === 'idle' && <div className="w-4 h-4 rounded-full border border-white/[0.1] bg-white/[0.03]" />}
                      </div>
                      <span className={`text-xs font-semibold flex-1 flex flex-col gap-0.5 ${step.status === 'running' ? 'text-blue-300' :
                        step.status === 'completed' ? 'text-slate-500' :
                          step.status === 'failed' ? 'text-rose-300' :
                            'text-slate-600'
                        }`}>
                        <span>{step.label}</span>
                        {step.status === 'running' && throttleCountdown && idx === currentStepIndex && (
                          <span className="text-[10px] text-blue-400 font-bold animate-pulse">
                            ⚠ Rate limit reached — Auto-resuming in {throttleCountdown}
                          </span>
                        )}
                        {step.status === 'running' && !throttleCountdown && capacityWaitSeconds != null && idx === currentStepIndex && (
                          <span className="text-[10px] text-amber-400 font-bold animate-pulse">
                            ⏳ AI model at capacity — auto-resuming in ~{formatDuration(capacityWaitSeconds)}
                          </span>
                        )}
                      </span>
                      {step.status === 'failed' && !loading && (
                        <button
                          type="button"
                          onClick={resumeGeneration}
                          className="flex items-center gap-1.5 px-3 py-1.5 bg-white/[0.06] hover:bg-white/[0.1] border border-white/[0.1] text-slate-300 font-bold rounded-lg text-[10px] transition-all active:scale-95"
                        >
                          <RefreshCw className="w-2.5 h-2.5 text-emerald-400 animate-spin" style={{ animationDuration: '3s' }} />
                          Resume
                        </button>
                      )}
                    </div>
                  ))}
                </div>

                {/* Skeleton */}
                {loading && (
                  <div className="px-5 pb-5 space-y-2.5 border-t border-white/[0.06] pt-4">
                    <div className="h-2.5 bg-white/[0.04] rounded-full w-full animate-pulse" />
                    <div className="h-2.5 bg-white/[0.04] rounded-full w-4/5 animate-pulse" />
                    <div className="h-2.5 bg-white/[0.04] rounded-full w-2/3 animate-pulse" />
                  </div>
                )}
              </div>
            )}

            {/* Report Result */}
            {reportData && !loading && (
              <div className="space-y-4">

                {/* Status Banner */}
                <div className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-4 rounded-2xl border ${activeReportStatus === 'published'
                  ? 'bg-emerald-950/30 border-emerald-800/40'
                  : 'bg-[#16161a] border-white/[0.07]'
                  }`}>
                  <div className="flex items-center gap-3.5">
                    <div className={`p-2.5 rounded-xl ${activeReportStatus === 'published' ? 'bg-emerald-500/20' : 'bg-blue-500/20'}`}>
                      <CheckCircle2 className={`w-4 h-4 ${activeReportStatus === 'published' ? 'text-emerald-400' : 'text-blue-400'}`} />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-white">Report Compiled</span>
                        <span className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider rounded-md ${activeReportStatus === 'published'
                          ? 'bg-emerald-500/20 text-emerald-300'
                          : 'bg-amber-500/20 text-amber-300'
                          }`}>
                          {activeReportStatus}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {activeReportStatus === 'published' ? 'Signed off by SEBI RA. Ready to publish.' : 'AI-generated draft — pending SEBI review.'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 w-full sm:w-auto">
                    {activeReportStatus !== 'approved' && activeReportStatus !== 'published' && (
                      <button
                        onClick={() => {
                          if (userRole !== 'research_analyst') {
                            showToast('Only a SEBI-registered Research Analyst can approve reports.', 'error');
                            return;
                          }
                          setIsSignoffOpen(true);
                        }}
                        className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl transition-all active:scale-95"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Approve & Sign-off
                      </button>
                    )}
                    <button
                      onClick={() => triggerDownload(activeReportId || reportData.company.ticker || '')}
                      disabled={isDownloading}
                      className="flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl transition-all shadow-lg shadow-blue-600/20 active:scale-95"
                    >
                      {isDownloading ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Downloading...</> : <><Download className="w-3.5 h-3.5" />Download PDF</>}
                    </button>
                  </div>
                </div>

                {/* Tabs Selector */}
                <div className="flex border-b border-white/[0.07] gap-4 mb-2">
                  {[
                    { id: 'preview', label: 'Report Preview' },
                    { id: 'diffs', label: `Proposed Diffs (${proposals.filter(p => p.status === 'pending').length})` },
                    { id: 'audit', label: 'Audit Trail' }
                  ].map((t) => (
                    <button
                      key={t.id}
                      onClick={() => setActiveTab(t.id as 'preview' | 'diffs' | 'audit')}
                      className={`pb-2.5 text-xs font-bold transition-all relative ${activeTab === t.id ? 'text-blue-400' : 'text-slate-500 hover:text-slate-300'
                        }`}
                    >
                      {t.label}
                      {activeTab === t.id && (
                        <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-500" />
                      )}
                    </button>
                  ))}
                </div>

                {/* Tab 1: Preview */}
                {activeTab === 'preview' && (
                  <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl overflow-hidden relative">

                    {/* Inline Draft Watermark Banner */}
                    {activeReportStatus !== 'approved' && activeReportStatus !== 'published' && (
                      <div className="bg-amber-500/10 border-b border-amber-500/20 px-6 py-2 flex items-center gap-2 text-amber-300 text-[10px] font-bold uppercase tracking-wider">
                        <AlertTriangle className="w-3.5 h-3.5 animate-pulse" />
                        AI-generated draft — pending RA review.
                      </div>
                    )}
                    {/* Dark header */}
                    <div className="bg-[#0f0f13] border-b border-white/[0.07] p-6 flex items-start justify-between">
                      <div>
                        <div className="text-[9px] uppercase tracking-widest text-amber-500 font-bold mb-1">Equity Research Division</div>
                        <h3 className="text-xl font-bold text-white tracking-tight">{reportData.company.name}</h3>
                        <p className="text-xs text-slate-500 mt-1.5">
                          {reportData.company.sector && <span>{reportData.company.sector}</span>}
                          {reportData.company.sector && reportData.company.industry && <span className="mx-2 opacity-40">·</span>}
                          {reportData.company.industry && <span>{reportData.company.industry}</span>}
                        </p>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <div className="text-[9px] text-slate-500 uppercase tracking-widest font-bold mb-1">Report Date</div>
                        <span className="text-xs font-semibold text-slate-300 bg-white/[0.06] px-2.5 py-1 rounded-lg border border-white/[0.06] inline-block">
                          {reportData.company.reportDate}
                        </span>
                      </div>
                    </div>

                    <div className="p-6 space-y-6">
                      {/* Key Metrics */}
                      <div className="grid grid-cols-3 gap-3">
                        {[
                          {
                            label: 'Recommendation',
                            value: reportData.recommendation.rating,
                            valueClass: 'text-emerald-400',
                            bgClass: 'bg-emerald-500/10 border-emerald-800/30'
                          },
                          {
                            label: 'Target Price',
                            value: `₹${reportData.recommendation.targetPrice}`,
                            sub: `+${reportData.recommendation.upsidePotential}% upside`,
                            subClass: 'text-emerald-500',
                            bgClass: 'bg-white/[0.02] border-white/[0.06]'
                          },
                          {
                            label: 'CMP',
                            value: `₹${reportData.recommendation.currentPrice}`,
                            bgClass: 'bg-white/[0.02] border-white/[0.06]'
                          },
                        ].map((m) => (
                          <div key={m.label} className={`p-4 rounded-xl border ${m.bgClass}`}>
                            <div className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-2">{m.label}</div>
                            <div className={`text-lg font-black ${m.valueClass || 'text-white'}`}>{m.value}</div>
                            {m.sub && <div className={`text-[10px] font-bold mt-0.5 ${m.subClass || 'text-slate-500'}`}>{m.sub}</div>}
                          </div>
                        ))}
                      </div>

                      {/* Executive Summary */}
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Executive Summary</h4>
                        <p className="text-slate-400 text-sm leading-relaxed">{reportData.executiveSummary}</p>
                      </div>

                      {/* Competitors */}
                      {reportData.competitors && reportData.competitors.length > 0 && (
                        <div>
                          <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Competitor Analysis</h4>
                          <div className="overflow-x-auto rounded-xl border border-white/[0.06]">
                            <table className="w-full text-left text-[11px] min-w-[540px]">
                              <thead>
                                <tr className="bg-white/[0.03] text-slate-500 text-[9px] uppercase tracking-widest">
                                  <th className="px-4 py-2.5 font-bold">Company</th>
                                  <th className="px-4 py-2.5 font-bold">Industry</th>
                                  <th className="px-4 py-2.5 font-bold">Recommendation</th>
                                  <th className="px-4 py-2.5 font-bold text-right">Target Price</th>
                                </tr>
                              </thead>
                              <tbody>
                                {reportData.competitors.map((c: CompetitorInfo, i: number) => (
                                  <tr key={i} className={`border-t border-white/[0.05] ${i % 2 === 0 ? 'bg-white/[0.01]' : ''}`}>
                                    <td className="px-4 py-2.5 text-slate-200 font-semibold">
                                      {c.name}
                                      {c.ticker && <span className="text-slate-500 font-medium text-[9px] ml-1.5">{c.ticker}</span>}
                                    </td>
                                    <td className="px-4 py-2.5 text-slate-400">{c.industry || '-'}</td>
                                    <td className="px-4 py-2.5">
                                      {c.recommendation ? (
                                        <span className={`inline-block px-2 py-0.5 rounded-md text-[9px] font-bold uppercase ${String(c.recommendation) === 'BUY'
                                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-800/30'
                                          : String(c.recommendation) === 'SELL'
                                            ? 'bg-rose-500/10 text-rose-400 border border-rose-800/30'
                                            : 'bg-amber-500/10 text-amber-400 border border-amber-800/30'
                                          }`}>
                                          {c.recommendation}
                                        </span>
                                      ) : '-'}
                                    </td>
                                    <td className="px-4 py-2.5 text-right text-slate-300 font-semibold">
                                      {c.targetPrice != null ? `₹${Number(c.targetPrice).toLocaleString('en-IN')}` : '-'}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}

                      {/* SWOT */}
                      <div>
                        <h4 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">SWOT Analysis</h4>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div className="p-4 bg-emerald-950/30 border border-emerald-800/25 rounded-xl">
                            <div className="text-[9px] font-bold text-emerald-500 uppercase tracking-widest mb-2.5">Strengths</div>
                            <ul className="space-y-1.5">
                              {reportData.swotAnalysis.strengths.map((s, i) => (
                                <li key={i} className="flex gap-2 items-start text-[11px] text-emerald-300/80">
                                  <span className="text-emerald-500 mt-0.5 shrink-0">✓</span>
                                  <span>{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                          <div className="p-4 bg-rose-950/30 border border-rose-800/25 rounded-xl">
                            <div className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mb-2.5">Weaknesses & Risks</div>
                            <ul className="space-y-1.5">
                              {reportData.swotAnalysis.weaknesses.map((w, i) => (
                                <li key={i} className="flex gap-2 items-start text-[11px] text-rose-300/80">
                                  <span className="text-rose-500 mt-0.5 shrink-0">⚠</span>
                                  <span>{w}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Tab 2: Proposed Diffs */}
                {activeTab === 'diffs' && (
                  <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl p-6 space-y-4">
                    <h3 className="text-xs font-bold text-white uppercase tracking-widest">Proposed Corrections</h3>
                    <p className="text-[11px] text-slate-500">Review discrepancies detected by the math auditor or suggestions proposed by system operators.</p>
                    {proposals.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500 italic border border-dashed border-white/5 rounded-xl bg-white/[0.01]">
                        No proposed corrections for this report.
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {proposals.map((p) => (
                          <div key={p.id} className="p-4 bg-white/[0.02] border border-white/[0.08] rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 min-w-0">
                            <div className="space-y-1 min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xs font-bold text-white font-mono">{p.field}</span>
                                <span className={`px-1.5 py-0.5 text-[8px] font-black uppercase rounded ${p.status === 'approved' ? 'bg-emerald-500/20 text-emerald-300' :
                                  p.status === 'rejected' ? 'bg-rose-500/20 text-rose-300' :
                                    'bg-amber-500/20 text-amber-300'
                                  }`}>{p.status}</span>
                              </div>
                              <p className="text-[10px] text-slate-400 italic">Origin: {p.origin}</p>
                              {p.reasoning && <p className="text-[10px] text-slate-500 break-words">Reason: {p.reasoning}</p>}
                              <div className="mt-2 bg-black/25 p-2 rounded-lg text-[10px] font-mono border border-white/5 space-y-1 min-w-0">
                                <div className="min-w-0">
                                  <span className="text-slate-500">Old:</span>{' '}
                                  <span className="text-rose-400 font-bold break-all">{formatDiffValue(p.oldValue)}</span>
                                </div>
                                <div className="flex items-center gap-1.5 text-slate-600 select-none">↓</div>
                                <div className="min-w-0">
                                  <span className="text-slate-500">New:</span>{' '}
                                  <span className="text-emerald-400 font-bold break-all">{formatDiffValue(p.newValue)}</span>
                                </div>
                              </div>
                            </div>
                            {p.status === 'pending' && (
                              <div className="flex items-center gap-2 shrink-0">
                                <button
                                  onClick={() => handleProposalAction(p.id, 'rejected')}
                                  className="px-3 py-1.5 bg-rose-600/20 hover:bg-rose-600 text-rose-300 hover:text-white rounded-lg text-[10px] font-bold border border-rose-500/25 transition-all"
                                >
                                  Reject
                                </button>
                                <button
                                  onClick={() => handleProposalAction(p.id, 'approved')}
                                  className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600 text-emerald-300 hover:text-white rounded-lg text-[10px] font-bold border border-emerald-500/25 transition-all"
                                >
                                  Approve
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Tab 3: Audit Log */}
                {activeTab === 'audit' && (
                  <div className="bg-[#16161a] border border-white/[0.07] rounded-2xl p-6 space-y-4">
                    <div className="flex items-center justify-between">
                      <h3 className="text-xs font-bold text-white uppercase tracking-widest">Immutable Audit Trail</h3>
                      <span className="text-[10px] font-mono text-slate-500">SEC / SEBI compliant logs</span>
                    </div>
                    {auditLogs.length === 0 ? (
                      <div className="text-center py-8 text-xs text-slate-500 italic">No audit records found.</div>
                    ) : (
                      <div className="relative border-l border-white/[0.08] ml-2 pl-4 space-y-4">
                        {auditLogs.map((log) => (
                          <div key={log.id} className="relative">
                            <div className="absolute -left-[21px] top-1 w-2.5 h-2.5 rounded-full bg-blue-500/80 border border-[#16161a]" />
                            <div className="text-xs font-semibold text-white flex items-center gap-2">
                              <span>{log.action.replace(/_/g, ' ').toUpperCase()}</span>
                              <span className="text-[10px] font-medium text-slate-500">{new Date(log.createdAt).toLocaleString()}</span>
                            </div>
                            <div className="text-[10px] text-slate-400 mt-0.5">
                              Actor: <span className="font-bold text-slate-300">{log.userId}</span> ({log.actorType})
                            </div>
                            {log.fromState && (
                              <div className="text-[9px] text-slate-500 font-mono mt-1">
                                State transition: {log.fromState} → {log.toState}
                              </div>
                            )}
                            <div className="bg-black/20 border border-white/5 rounded-lg p-2 mt-1.5 text-[9px] font-mono text-slate-500 overflow-x-auto">
                              {JSON.stringify(log.metadata)}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

              </div>
            )}
          </div>

          {/* ─── Column 3 — Co-Pilot Chat ────────────────────────────── */}
          {reportData && isChatOpen && !loading && (
            <PanelResizer
              side="left"
              width={panelWidths.chat}
              defaultWidth={DEFAULT_PANEL_WIDTHS.chat}
              min={PANEL_LIMITS.chat.min}
              max={PANEL_LIMITS.chat.max}
              onResize={(w) => setPanelWidths((p) => ({ ...p, chat: w }))}
              onStart={() => setActiveResizer('chat')}
              onEnd={() => setActiveResizer(null)}
            />
          )}
          {reportData && isChatOpen && !loading && (
            <div
              className="w-full lg:w-[var(--chat-w)] shrink-0 border-l border-white/[0.06] bg-[#141417]/80 backdrop-blur-xl flex flex-col h-full overflow-hidden shadow-2xl"
              style={{ '--chat-w': `${panelWidths.chat}px` } as React.CSSProperties}
            >
              {/* Premium Header */}
              <div className="p-4 border-b border-white/[0.06] flex items-center justify-between bg-gradient-to-r from-[#0f0f13] to-[#141418]">
                <div className="flex items-center gap-2.5">
                  <div className="w-6 h-6 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
                    <Sparkles className="w-3.5 h-3.5 text-blue-400 animate-pulse" />
                  </div>
                  <div>
                    <h3 className="text-xs font-bold text-white tracking-widest uppercase">AI Co-Pilot</h3>
                    <p className="text-[9px] text-slate-500 font-medium">Recompute & Analysis Agent</p>
                  </div>
                </div>
                <button onClick={() => setIsChatOpen(false)} className="text-slate-500 hover:text-white p-1.5 hover:bg-white/[0.05] rounded-lg transition-colors">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Chat feed */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-transparent to-[#0d0d10]/40 scrollbar-thin">
                {chatMessages.length === 0 && (
                  <div className="flex flex-col items-center justify-center h-full text-center p-6 space-y-6">
                    <div className="p-4 bg-blue-500/5 border border-blue-500/10 rounded-2xl">
                      <Activity className="w-8 h-8 text-blue-400/80" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-200 uppercase tracking-wider mb-2">Interactive AI Co-Pilot</h4>
                      <p className="text-[11px] text-slate-500 leading-relaxed max-w-[240px]">
                        Ask the agent to recompute ratios, change financial values, or compile peer valuations.
                      </p>
                    </div>
                    {/* Quick suggestions */}
                    <div className="w-full space-y-2">
                      {[
                        "Change target price to 650",
                        "Recalculate EBITDA margin for FY24",
                        "Verify debt-to-equity ratio errors"
                      ].map((suggest) => (
                        <button
                          key={suggest}
                          type="button"
                          onClick={() => setChatInput(suggest)}
                          className="w-full text-left p-2.5 bg-white/[0.02] hover:bg-blue-600/10 border border-white/[0.05] hover:border-blue-500/30 text-[10px] text-slate-400 hover:text-blue-300 rounded-xl transition-all font-semibold"
                        >
                          💡 &ldquo;{suggest}&rdquo;
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {chatMessages.map((msg, i) => (
                  <div key={i} className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}>
                    {/* Role label */}
                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 px-1">
                      {msg.role === 'user' ? 'You' : msg.isError ? 'Co-Pilot Agent · Error' : 'Co-Pilot Agent'}
                    </span>
                    <div className={`max-w-[90%] rounded-2xl px-4 py-3 text-xs shadow-md leading-relaxed ${msg.role === 'user'
                      ? 'bg-blue-600 text-white rounded-tr-none border border-blue-500/20'
                      : msg.isError
                        ? 'bg-rose-500/[0.06] border border-rose-500/25 text-rose-300 rounded-tl-none'
                        : 'bg-white/[0.03] border border-white/[0.08] text-slate-300 rounded-tl-none'
                      }`}>
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                    {msg.isError && msg.retryPrompt && (
                      <button
                        type="button"
                        onClick={() => executeChatMessage(msg.retryPrompt!)}
                        disabled={chatLoading}
                        className="mt-1.5 px-2.5 py-1 bg-white/[0.04] hover:bg-blue-600/15 border border-white/[0.08] hover:border-blue-500/30 text-[9px] font-bold text-slate-400 hover:text-blue-300 rounded-lg transition-all disabled:opacity-40"
                      >
                        ↻ Retry
                      </button>
                    )}
                  </div>
                ))}
                {chatLoading && (
                  <div className="flex flex-col items-start">
                    <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest mb-1 px-1">Co-Pilot Agent</span>
                    <div className="bg-white/[0.02] border border-white/[0.05] rounded-2xl rounded-tl-none px-4.5 py-3 flex items-center gap-2.5 shadow-sm">
                      <Loader2 className="w-3.5 h-3.5 text-blue-400 animate-spin" />
                      <span className="text-[10px] text-slate-500 font-semibold">Agent running tools...</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Input container */}
              <form onSubmit={sendChatMessage} className="p-4 border-t border-white/[0.06] bg-[#0c0c10] flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Ask the co-pilot or run a tool..."
                  disabled={chatLoading}
                  className="flex-1 px-4 py-3 bg-black/60 border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-200 placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                />
                <button
                  type="submit"
                  disabled={chatLoading || !chatInput.trim()}
                  className="px-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 text-white font-bold rounded-xl text-xs transition-all shadow-lg shadow-blue-600/20 active:scale-95 flex items-center gap-1.5 shrink-0"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Send</span>
                </button>
              </form>
            </div>
          )}

        </div>
      </div>


      {/* ── Settings Modal ─────────────────────────────────────────────── */}
      {isSettingsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#16161a] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-4 mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Settings className="w-4 h-4 text-blue-400" />
                AI Configuration
              </h3>
              <button onClick={() => setIsSettingsOpen(false)} className="p-1.5 hover:bg-white/[0.07] rounded-lg text-slate-500 hover:text-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">AI Provider</label>
                <select
                  value={tempProvider}
                  onChange={(e) => setTempProvider(e.target.value as 'groq' | 'openai')}
                  className="w-full px-3.5 py-2.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/40 focus:border-blue-500/40 transition-all"
                >
                  <option value="groq">Freemium AI (System Default)</option>
                  <option value="openai">OpenAI (Custom Key)</option>
                </select>
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Model</label>
                {tempProvider === 'groq' ? (
                  <select value={tempGroqModel} onChange={(e) => setTempGroqModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all">
                    <option value="llama-3.3-70b-versatile">Freemium AI (Default, auto-fallback)</option>
                    <option value="llama-3.1-8b-instant">Freemium AI (Fast tier)</option>
                  </select>
                ) : (
                  <select value={tempOpenaiModel} onChange={(e) => setTempOpenaiModel(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-200 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all">
                    <option value="gpt-4o-mini">GPT-4o Mini (Recommended)</option>
                    <option value="gpt-4o">GPT-4o (Higher quality)</option>
                  </select>
                )}
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">
                  {tempProvider === 'groq' ? 'Freemium AI API Key (Optional)' : 'OpenAI API Key'}
                </label>
                <div className="relative">
                  <input
                    type={showApiKey ? 'text' : 'password'}
                    value={tempProvider === 'groq' ? tempGroqApiKey : tempOpenaiApiKey}
                    onChange={(e) => tempProvider === 'groq' ? setTempGroqApiKey(e.target.value) : setTempOpenaiApiKey(e.target.value)}
                    placeholder={tempProvider === 'groq' ? 'Using env key...' : 'sk-proj-...'}
                    className="w-full pl-3.5 pr-10 py-2.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-xs font-medium text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-blue-500/40 transition-all"
                  />
                  <button type="button" onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute right-2.5 top-2.5 p-0.5 text-slate-600 hover:text-slate-300 rounded transition-colors">
                    {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed">
                  {tempProvider === 'groq'
                    ? 'Optional — uses server env key by default.'
                    : 'Required. Stored in browser only, never on server.'}
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/[0.07]">
              <button onClick={() => setIsSettingsOpen(false)}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-slate-400 font-bold rounded-xl text-xs transition-colors">
                Cancel
              </button>
              <button
                onClick={() => saveSettings(tempProvider, tempGroqApiKey, tempOpenaiApiKey, tempGroqModel, tempOpenaiModel)}
                disabled={tempProvider === 'openai' && !tempOpenaiApiKey}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-40 shadow-lg shadow-blue-600/20">
                Save & Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── SEBI Sign-off Modal ─────────────────────────────────────────── */}
      {isSignoffOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#16161a] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-4 mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                SEBI RA Sign-off
              </h3>
              <button onClick={() => setIsSignoffOpen(false)} disabled={isSigning}
                className="p-1.5 hover:bg-white/[0.07] rounded-lg text-slate-500 hover:text-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4">
              {activeModelUsedForFinancials === 'llama-3.1-8b-instant' && (
                <div className="flex items-start gap-3 p-3.5 bg-amber-950/40 border border-amber-800/40 rounded-xl">
                  <AlertTriangle className="w-4 h-4 text-amber-400 mt-0.5 shrink-0" />
                  <div>
                    <p className="text-xs font-bold text-amber-300 mb-0.5">Freemium AI Tier Used for Financials</p>
                    <p className="text-[10px] text-amber-500 leading-relaxed">
                      Revenue, EBITDA and PAT were extracted by the <span className="font-bold text-amber-300">Freemium fallback tier</span>.
                      Verify all numbers carefully before signing.
                    </p>
                  </div>
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">Reviewer Full Name</label>
                <input type="text" value={reviewerName} onChange={(e) => setReviewerName(e.target.value)}
                  placeholder="e.g. Ritesh Kumar"
                  className="w-full px-3.5 py-2.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all" />
              </div>

              <div>
                <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-2">SEBI Registration Number</label>
                <input type="text" value={sebiRegNo} onChange={(e) => setSebiRegNo(e.target.value)}
                  placeholder="e.g. INH000012345"
                  className="w-full px-3.5 py-2.5 bg-[#0f0f13] border border-white/[0.08] rounded-xl text-xs font-semibold text-slate-200 placeholder-slate-700 focus:outline-none focus:ring-1 focus:ring-emerald-500/40 transition-all" />
              </div>

              <div className="flex items-start gap-3 p-3.5 bg-white/[0.02] border border-white/[0.07] rounded-xl">
                <input type="checkbox" id="attestation-checkbox"
                  className="mt-0.5 rounded border-white/20 bg-[#0f0f13] text-emerald-500 focus:ring-emerald-500/20" />
                <label htmlFor="attestation-checkbox" className="text-[10px] text-slate-500 leading-relaxed">
                  I confirm I have reviewed all financial data and conclusions and take responsibility under my SEBI Research Analyst registration.
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 mt-6 pt-4 border-t border-white/[0.07]">
              <button onClick={() => setIsSignoffOpen(false)} disabled={isSigning}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-slate-400 font-bold rounded-xl text-xs transition-colors">
                Cancel
              </button>
              <button
                onClick={() => {
                  const checkbox = document.getElementById('attestation-checkbox') as HTMLInputElement;
                  if (!reviewerName.trim() || !sebiRegNo.trim()) {
                    showToast('Enter reviewer name and SEBI registration number.', 'error');
                    return;
                  }
                  if (!checkbox?.checked) {
                    showToast('Please agree to the attestation.', 'error');
                    return;
                  }
                  approveReport(reviewerName, sebiRegNo);
                }}
                disabled={isSigning}
                className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl text-xs transition-colors disabled:opacity-50 shadow-lg shadow-emerald-600/20 flex items-center gap-1.5">
                {isSigning ? <><Loader2 className="w-3.5 h-3.5 animate-spin" />Signing...</> : 'Sign & Publish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Fork Warning Modal ─────────────────────────────────────────── */}
      {isForkModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm">
          <div className="bg-[#16161a] border border-white/[0.1] rounded-2xl p-6 w-full max-w-md shadow-2xl mx-4">
            <div className="flex items-center justify-between border-b border-white/[0.07] pb-4 mb-5">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                Fork Approved Report?
              </h3>
              <button onClick={() => { setIsForkModalOpen(false); setPendingForkPrompt(''); }}
                className="p-1.5 hover:bg-white/[0.07] rounded-lg text-slate-500 hover:text-slate-200 transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-400 leading-relaxed mb-5">
              This report is already <span className="font-bold text-white">{activeReportStatus}</span>. Any changes will fork a new draft version, leaving the signed-off document intact and published. The report will return to <span className="text-amber-400 font-bold">changes_requested</span> status for review.
            </p>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-white/[0.07]">
              <button onClick={() => { setIsForkModalOpen(false); setPendingForkPrompt(''); }}
                className="px-4 py-2 bg-white/[0.05] hover:bg-white/[0.09] border border-white/[0.08] text-slate-400 font-bold rounded-xl text-xs transition-colors">
                Cancel
              </button>
              <button
                onClick={confirmForkChat}
                className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white font-bold rounded-xl text-xs transition-colors shadow-lg shadow-amber-600/20">
                Confirm Fork
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
export default Dashboard;
