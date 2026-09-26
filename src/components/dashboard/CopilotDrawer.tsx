"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  X,
  Send,
  Bot,
  User,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { PersonaType } from "./types";

interface ChatMessage {
  role: "user" | "agent";
  content: string;
  isError?: boolean;
}

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  currentPersona: PersonaType;
  companyName?: string;
  ticker?: string;
  initialPrompt?: string;
  onClearInitialPrompt?: () => void;
  reportContext?: unknown;
}

export function CopilotDrawer({
  isOpen,
  onClose,
  currentPersona,
  companyName = "Target Company",
  ticker,
  initialPrompt,
  onClearInitialPrompt,
  reportContext,
}: CopilotDrawerProps) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      role: "agent",
      content: `Hello! I am your AI Equity Analyst Co-Pilot for **${companyName}**${ticker ? ` (${ticker})` : ""}. Ask me anything about valuation, margin drivers, balance sheet leverage, or concall takeaways.`,
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // If an external prompt was passed (e.g. from clicking a question chip in IndividualView)
  useEffect(() => {
    if (initialPrompt && initialPrompt.trim()) {
      handleSendMessage(initialPrompt.trim());
      if (onClearInitialPrompt) onClearInitialPrompt();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialPrompt]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) {
      scrollToBottom();
    }
  }, [messages, isOpen]);

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || input.trim();
    if (!textToSend || loading) return;

    const userMessage: ChatMessage = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Read any configured BYOK from localStorage if present
      let userProvider: string | undefined;
      let userApiKey: string | undefined;
      let userModelName: string | undefined;
      try {
        if (typeof window !== "undefined") {
          userProvider = localStorage.getItem("equigen_ai_provider") || undefined;
          if (userProvider) {
            userApiKey = localStorage.getItem(`equigen_${userProvider}_api_key`) || undefined;
            if (userProvider === "groq") {
              userModelName = localStorage.getItem("equigen_groq_model") || undefined;
            }
          }
        }
      } catch {}

      // Route to centralized chat endpoint /api/agent/chat
      const res = await fetch("/api/agent/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: textToSend,
          companyName,
          ticker,
          currentPersona,
          reportData: reportContext,
          provider: userProvider,
          apiKey: userApiKey,
          modelName: userModelName,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const reply = data.reply || data.response || "Analysis complete.";
        setMessages((prev) => [...prev, { role: "agent", content: reply }]);
      } else {
        const errData = await res.json().catch(() => null);
        const serverError = errData?.response || errData?.message || `Server returned HTTP ${res.status}`;
        setMessages((prev) => [
          ...prev,
          {
            role: "agent",
            content: `⚠️ **Research Service Notice**: ${serverError}. In accordance with strict financial data integrity guidelines, unverified estimates or synthetic figures are suppressed.`,
          },
        ]);
      }
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "agent",
          content: `⚠️ **Connection Error**: Unable to reach the EquiGen AI research engine. To guarantee financial accuracy, unverified placeholder estimates are disabled. Please check your network connection or API configuration.`,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  if (!isOpen) return null;

  return (
    <aside className="fixed top-[68px] right-0 bottom-0 w-full sm:w-[420px] bg-[#141311] border-l border-[#2E2B24] text-white flex flex-col z-40 shadow-2xl animate-fadeIn font-sans select-none">
      {/* Drawer Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[#2E2B24] bg-[#181614]">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-amber-400/20 text-amber-400 flex items-center justify-center">
            <Bot className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-extrabold text-white">AI Research Co-Pilot</span>
              <span className="text-[9px] font-mono px-1.5 py-0.2 rounded bg-amber-400/10 text-amber-300 font-bold">
                PRO
              </span>
            </div>
            <p className="text-[10px] text-[#8C877D] truncate max-w-[220px]">
              Active target: {companyName}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button
            onClick={() =>
              setMessages([
                {
                  role: "agent",
                  content: `Context reset for ${companyName}. How can I assist with your investment thesis?`,
                },
              ])
            }
            title="Reset Chat"
            className="p-1.5 rounded-lg text-[#8C877D] hover:text-white hover:bg-white/5 transition-all"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={onClose}
            title="Close Drawer"
            className="p-1.5 rounded-lg text-[#8C877D] hover:text-white hover:bg-white/5 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Messages Feed */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3.5 text-xs">
        {messages.map((m, idx) => (
          <div
            key={idx}
            className={`flex items-start gap-2.5 ${m.role === "user" ? "flex-row-reverse" : "flex-row"}`}
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 text-[10px] ${
                m.role === "user" ? "bg-amber-400 text-black font-bold" : "bg-[#2E2B24] text-amber-400"
              }`}
            >
              {m.role === "user" ? <User className="w-3 h-3" /> : <Bot className="w-3.5 h-3.5" />}
            </div>

            <div
              className={`max-w-[85%] rounded-2xl p-3 leading-relaxed ${
                m.role === "user"
                  ? "bg-amber-400 text-black font-medium"
                  : "bg-[#1E1C18] border border-[#2E2B24] text-[#E0DDD5]"
              }`}
            >
              {m.content}
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex items-center gap-2 text-[#8C877D] text-xs p-2">
            <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
            <span>Analyzing research disclosures...</span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Field */}
      <div className="p-3 border-t border-[#2E2B24] bg-[#181614]">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="relative flex items-center"
        >
          <input
            type="text"
            placeholder={`Ask Co-Pilot about ${companyName}...`}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={loading}
            className="w-full bg-[#1F1D19] border border-[#2E2B24] rounded-xl pl-3.5 pr-10 py-2.5 text-xs text-white placeholder-[#6C675E] focus:outline-none focus:border-amber-400"
          />
          <button
            type="submit"
            disabled={!input.trim() || loading}
            className="absolute right-1.5 p-1.5 rounded-lg bg-amber-400 disabled:opacity-40 text-black transition-all hover:bg-amber-300"
          >
            <Send className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        </form>
      </div>
    </aside>
  );
}
