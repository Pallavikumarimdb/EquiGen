"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { EquityResearchData } from "@/types";

export interface ChatNode {
  id: string;
  parentId: string | null;
  childrenIds: string[];
  role: "user" | "agent";
  content: string;
  timestamp: string;
  status?: "idle" | "streaming" | "stopped" | "error";
  appliedChanges?: { field: string; from: unknown; to: unknown; reason: string }[];
  modelUsed?: string;
  source?: string;
}

export interface BranchInfo {
  currentIndex: number;
  totalVersions: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export interface ConversationState {
  nodes: Record<string, ChatNode>;
  rootIds: string[];
  activeLeafId: string | null;
}

export interface UseConversationManagerOptions {
  sessionId?: string | null;
  reportId?: string | null;
  companyName?: string;
  ticker?: string;
  reportData?: EquityResearchData | null;
  onUpdateReportData?: (data: EquityResearchData) => void;
  storagePrefix?: string;
}

function generateId(prefix = "msg"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export function extractActiveThread(state: ConversationState): ChatNode[] {
  const { nodes, rootIds, activeLeafId } = state;
  if (!activeLeafId || !nodes[activeLeafId]) {
    if (rootIds.length === 0) return [];
    const firstRoot = nodes[rootIds[0]];
    return firstRoot ? [firstRoot] : [];
  }

  const path: ChatNode[] = [];
  let curr: ChatNode | undefined = nodes[activeLeafId];
  const visited = new Set<string>();

  while (curr && !visited.has(curr.id)) {
    visited.add(curr.id);
    path.unshift(curr);
    if (!curr.parentId) break;
    curr = nodes[curr.parentId];
  }

  return path;
}

export function useConversationManager({
  sessionId,
  reportId,
  companyName = "",
  ticker = "",
  reportData,
  storagePrefix = "equigen_chat_tree",
}: UseConversationManagerOptions) {
  const cleanId = sessionId || (reportId ? reportId.replace(/^rep_/, "") : "session-demo");
  const storageKey = `${storagePrefix}_${cleanId}`;

  const getInitialState = useCallback((key: string, cName: string, tkr: string): ConversationState => {
    if (typeof window !== "undefined") {
      try {
        const saved = localStorage.getItem(key);
        if (saved) {
          const parsed = JSON.parse(saved);
          if (parsed?.nodes && Object.keys(parsed.nodes).length > 0) {
            // Clean up any stale streaming or stopped nodes with empty content
            Object.values(parsed.nodes).forEach((n: unknown) => {
              const node = n as ChatNode;
              if (node.status === "stopped" && !node.content?.trim()) {
                node.content = "Analysis generation stopped by analyst.";
              }
              if (node.status === "streaming") {
                node.status = "stopped";
                if (!node.content?.trim()) {
                  node.content = "Analysis generation stopped by analyst.";
                }
              }
            });
            return parsed;
          }
        }
      } catch {}
    }

    const welcomeId = generateId("init");
    const welcomeContent = !cName
      ? `Hello! I am your **AI Research Agent**.\n\nSelect a company from your coverage universe on the left or click **New Research** to initiate an autonomous research note, extract company filings, and generate 5-year DCF models.`
      : `Hello! I am your **AI Research Agent** for **${cName}**${tkr ? ` (${tkr})` : ""}.\n\nI have complete access to this company's financial model, DCF valuation, exchange filings, and research draft. You can chat with me, ask deep analytical questions, or instruct me to **update, fix, or modify** any part of the report in real time.`;

    const welcomeNode: ChatNode = {
      id: welcomeId,
      parentId: null,
      childrenIds: [],
      role: "agent",
      content: welcomeContent,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "idle",
    };

    return {
      nodes: { [welcomeId]: welcomeNode },
      rootIds: [welcomeId],
      activeLeafId: welcomeId,
    };
  }, []);

  const [state, setState] = useState<ConversationState>(() =>
    getInitialState(storageKey, companyName, ticker)
  );

  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const stateRef = useRef<ConversationState>(state);

  // Synchronously keep stateRef up to date on every render
  stateRef.current = state;

  // Save to localStorage whenever tree changes
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (Object.keys(state.nodes).length === 0) return;
    try {
      localStorage.setItem(storageKey, JSON.stringify(state));
    } catch (err) {
      console.warn("[ConversationManager] LocalStorage write failed:", err);
    }
  }, [state, storageKey]);

  // Sync state whenever storageKey, companyName, or ticker changes
  useEffect(() => {
    setState(getInitialState(storageKey, companyName, ticker));
  }, [storageKey, companyName, ticker, getInitialState]);

  // Reconstruct active linear thread directly from state
  const activeThread = useMemo((): ChatNode[] => {
    const { nodes, rootIds, activeLeafId } = state;
    if (!activeLeafId || !nodes[activeLeafId]) {
      if (rootIds.length === 0) return [];
      const firstRoot = nodes[rootIds[0]];
      return firstRoot ? [firstRoot] : [];
    }

    // Traverse upwards from active leaf to root
    const path: ChatNode[] = [];
    let curr: ChatNode | undefined = nodes[activeLeafId];
    const visited = new Set<string>();

    while (curr && !visited.has(curr.id)) {
      visited.add(curr.id);
      path.unshift(curr);
      if (!curr.parentId) break;
      curr = nodes[curr.parentId];
    }

    return path;
  }, [state]);

  // Compute branch info for a given node (its siblings among its parent's children)
  const getBranchInfo = useCallback(
    (nodeId: string): BranchInfo => {
      const { nodes, rootIds } = state;
      const target = nodes[nodeId];
      if (!target) {
        return { currentIndex: 0, totalVersions: 1, hasPrevious: false, hasNext: false };
      }

      const siblingIds = target.parentId
        ? nodes[target.parentId]?.childrenIds || [nodeId]
        : rootIds;

      const currentIndex = siblingIds.indexOf(nodeId);
      const totalVersions = siblingIds.length;

      return {
        currentIndex: Math.max(0, currentIndex),
        totalVersions: Math.max(1, totalVersions),
        hasPrevious: currentIndex > 0,
        hasNext: currentIndex < totalVersions - 1,
      };
    },
    [state],
  );

  // Switch to sibling branch version
  const switchBranch = useCallback((nodeId: string, direction: "prev" | "next") => {
    const { nodes, rootIds } = stateRef.current;
    const target = nodes[nodeId];
    if (!target) return;

    const siblingIds = target.parentId
      ? nodes[target.parentId]?.childrenIds || [nodeId]
      : rootIds;

    const currentIndex = siblingIds.indexOf(nodeId);
    if (currentIndex === -1) return;

    const newIndex = direction === "prev" ? currentIndex - 1 : currentIndex + 1;
    if (newIndex < 0 || newIndex >= siblingIds.length) return;

    const targetSiblingId = siblingIds[newIndex];
    if (!targetSiblingId) return;

    // Follow target sibling down its deepest active path
    let leafId = targetSiblingId;
    while (nodes[leafId]?.childrenIds.length > 0) {
      const children = nodes[leafId].childrenIds;
      leafId = children[children.length - 1];
    }

    setState((prev) => ({
      ...prev,
      activeLeafId: leafId,
    }));
  }, []);

  // Stop active AI generation mid-stream
  const stopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    if (streamingMessageId) {
      setState((prev) => {
        const existing = prev.nodes[streamingMessageId];
        if (!existing) return prev;
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [streamingMessageId]: {
              ...existing,
              content: existing.content?.trim() || "Analysis generation stopped by analyst.",
              status: "stopped",
            },
          },
        };
      });
    }

    setIsStreaming(false);
    setStreamingMessageId(null);
  }, [streamingMessageId]);

  // Execute conversation turn (supports initial send, editing past turns, and regenerating)
  const sendPrompt = useCallback(
    async (
      promptText: string,
      options?: {
        parentOverrideId?: string | null;
        isRegeneration?: boolean;
      },
    ) => {
      const cleanPrompt = promptText.trim();
      if (!cleanPrompt || isStreaming) return;

      const currentState = stateRef.current;
      const parentId =
        options?.parentOverrideId !== undefined
          ? options.parentOverrideId
          : currentState.activeLeafId;

      const userMsgId = generateId("usr");
      const agentMsgId = generateId("agt");
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      // 1. Build User Node
      const userNode: ChatNode = {
        id: userMsgId,
        parentId,
        childrenIds: [agentMsgId],
        role: "user",
        content: cleanPrompt,
        timestamp,
        status: "idle",
      };

      // 2. Build Agent Placeholder Node
      const agentNode: ChatNode = {
        id: agentMsgId,
        parentId: userMsgId,
        childrenIds: [],
        role: "agent",
        content: "",
        timestamp,
        status: "streaming",
      };

      // 3. Update tree state
      setState((prev) => {
        const nextNodes = { ...prev.nodes, [userMsgId]: userNode, [agentMsgId]: agentNode };
        const nextRootIds = [...prev.rootIds];
        if (parentId && nextNodes[parentId]) {
          const parentNode = nextNodes[parentId];
          nextNodes[parentId] = {
            ...parentNode,
            childrenIds: [...parentNode.childrenIds, userMsgId],
          };
        } else if (!parentId) {
          nextRootIds.push(userMsgId);
        }

        return {
          nodes: nextNodes,
          rootIds: nextRootIds,
          activeLeafId: agentMsgId,
        };
      });

      setIsStreaming(true);
      setStreamingMessageId(agentMsgId);

      // Create new AbortController
      const controller = new AbortController();
      abortControllerRef.current = controller;

      // Extract prior turns in this branch for multi-turn context
      const currentThread = extractActiveThread(currentState);
      const priorHistory = currentThread.map((m: ChatNode) => ({
        role: m.role as "user" | "agent",
        content: m.content,
      }));

      try {
        // Read local provider preferences
        let userProvider: string | undefined;
        let userModelName: string | undefined;
        let userBaseUrl: string | undefined;
        try {
          if (typeof window !== "undefined") {
            userProvider = localStorage.getItem("equigen_ai_provider") || undefined;
            userModelName = localStorage.getItem("equigen_groq_model") || undefined;
            userBaseUrl = localStorage.getItem("equigen_ollama_base_url") || undefined;
          }
        } catch {}

        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream, application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: cleanId,
            prompt: cleanPrompt,
            history: priorHistory,
            companyName,
            ticker,
            reportData,
            currentPersona: "institutional",
            provider: userProvider,
            baseUrl: userBaseUrl,
            modelName: userModelName,
            stream: true,
          }),
        });

        if (!response.ok) {
          const errData = await response.json().catch(() => null);
          const errMsg =
            errData?.response ||
            errData?.message ||
            `⚠️ Research Service Notice: Server returned error HTTP ${response.status}. Synthetic unverified answers are strictly suppressed.`;

          setState((prev) => ({
            ...prev,
            nodes: {
              ...prev.nodes,
              [agentMsgId]: {
                ...prev.nodes[agentMsgId],
                content: errMsg,
                status: "error",
              },
            },
          }));
          return;
        }

        const contentType = response.headers.get("content-type") || "";

        if (contentType.includes("text/event-stream") && response.body) {
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let accumulated = "";
          let buffer = "";
          let modelUsed: string | undefined;
          let source: string | undefined;

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";

            for (const block of blocks) {
              const trimmed = block.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;

              try {
                const ev = JSON.parse(jsonStr);
                if (ev.type === "meta") {
                  modelUsed = ev.modelUsed;
                  source = ev.source;
                } else if (ev.type === "delta" && typeof ev.text === "string") {
                  accumulated += ev.text;
                  setState((prev) => {
                    const node = prev.nodes[agentMsgId];
                    if (!node) return prev;
                    return {
                      ...prev,
                      nodes: {
                        ...prev.nodes,
                        [agentMsgId]: {
                          ...node,
                          content: accumulated,
                          modelUsed,
                          source,
                        },
                      },
                    };
                  });
                } else if (ev.type === "error") {
                  accumulated += (accumulated ? "\n\n" : "") + `⚠️ **Error**: ${ev.error}`;
                  setState((prev) => ({
                    ...prev,
                    nodes: {
                      ...prev.nodes,
                      [agentMsgId]: {
                        ...prev.nodes[agentMsgId],
                        content: accumulated,
                        status: "error",
                      },
                    },
                  }));
                }
              } catch {}
            }
          }

          // Mark message completed
          setState((prev) => ({
            ...prev,
            nodes: {
              ...prev.nodes,
              [agentMsgId]: {
                ...prev.nodes[agentMsgId],
                content: accumulated.trim() || "Analysis processed.",
                status: "idle",
              },
            },
          }));
          return;
        }

        // Non-streaming JSON fallback
        const jsonRes = await response.json();
        const replyText = jsonRes.response || jsonRes.reply || "Analysis processed.";
        setState((prev) => ({
          ...prev,
          nodes: {
            ...prev.nodes,
            [agentMsgId]: {
              ...prev.nodes[agentMsgId],
              content: replyText,
              status: "idle",
              modelUsed: jsonRes.modelUsed,
              source: jsonRes.source,
            },
          },
        }));
      } catch (_err: unknown) {
        if (controller.signal.aborted) {
          // Handled gracefully in stopGeneration
          return;
        }
        const errMsg = `⚠️ **Connection Notice**: Unable to reach the EquiGen AI research engine. Please verify your network connection or model configuration.`;
        setState((prev) => ({
          ...prev,
          nodes: {
            ...prev.nodes,
            [agentMsgId]: {
              ...prev.nodes[agentMsgId],
              content: prev.nodes[agentMsgId]?.content || errMsg,
              status: "error",
            },
          },
        }));
      } finally {
        setIsStreaming(false);
        setStreamingMessageId(null);
        abortControllerRef.current = null;
      }
    },
    [cleanId, companyName, ticker, reportData, isStreaming],
  );

  // Edit a previous user message: forks from that message's parent
  const editUserMessage = useCallback(
    async (nodeId: string, newContent: string) => {
      const target = stateRef.current.nodes[nodeId];
      if (!target || target.role !== "user") return;
      await sendPrompt(newContent, { parentOverrideId: target.parentId });
    },
    [sendPrompt],
  );

  // Regenerate an assistant response: re-triggers turn using its parent user node
  const regenerateMessage = useCallback(
    async (agentNodeId: string) => {
      const agentNode = stateRef.current.nodes[agentNodeId];
      if (!agentNode || agentNode.role !== "agent" || !agentNode.parentId) return;

      const userParent = stateRef.current.nodes[agentNode.parentId];
      if (!userParent || userParent.role !== "user") return;

      // Create new agent sibling under the user parent
      const newAgentId = generateId("agt");
      const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

      const newAgentNode: ChatNode = {
        id: newAgentId,
        parentId: userParent.id,
        childrenIds: [],
        role: "agent",
        content: "",
        timestamp,
        status: "streaming",
      };

      setState((prev) => {
        const parent = prev.nodes[userParent.id];
        return {
          ...prev,
          nodes: {
            ...prev.nodes,
            [userParent.id]: {
              ...parent,
              childrenIds: [...parent.childrenIds, newAgentId],
            },
            [newAgentId]: newAgentNode,
          },
          activeLeafId: newAgentId,
        };
      });

      setIsStreaming(true);
      setStreamingMessageId(newAgentId);

      const controller = new AbortController();
      abortControllerRef.current = controller;

      try {
        const response = await fetch("/api/agent/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Accept: "text/event-stream, application/json",
          },
          signal: controller.signal,
          body: JSON.stringify({
            sessionId: cleanId,
            prompt: userParent.content,
            companyName,
            ticker,
            reportData,
            currentPersona: "institutional",
            stream: true,
          }),
        });

        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }

        const reader = response.body?.getReader();
        const decoder = new TextDecoder();
        let accumulated = "";
        let buffer = "";

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });
            const blocks = buffer.split("\n\n");
            buffer = blocks.pop() || "";

            for (const block of blocks) {
              const trimmed = block.trim();
              if (!trimmed.startsWith("data:")) continue;
              const jsonStr = trimmed.slice(5).trim();
              if (!jsonStr) continue;
              try {
                const ev = JSON.parse(jsonStr);
                if (ev.type === "delta" && typeof ev.text === "string") {
                  accumulated += ev.text;
                  setState((prev) => ({
                    ...prev,
                    nodes: {
                      ...prev.nodes,
                      [newAgentId]: {
                        ...prev.nodes[newAgentId],
                        content: accumulated,
                      },
                    },
                  }));
                }
              } catch {}
            }
          }
        }

        setState((prev) => ({
          ...prev,
          nodes: {
            ...prev.nodes,
            [newAgentId]: {
              ...prev.nodes[newAgentId],
              content: accumulated.trim() || "Analysis processed.",
              status: "idle",
            },
          },
        }));
      } catch {
        if (!controller.signal.aborted) {
          setState((prev) => ({
            ...prev,
            nodes: {
              ...prev.nodes,
              [newAgentId]: {
                ...prev.nodes[newAgentId],
                content: "⚠️ Failed to regenerate response. Please try again.",
                status: "error",
              },
            },
          }));
        }
      } finally {
        setIsStreaming(false);
        setStreamingMessageId(null);
        abortControllerRef.current = null;
      }
    },
    [cleanId, companyName, ticker, reportData],
  );

  // Add completed custom turn (e.g. for deterministic report modifications)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const addCustomTurn = useCallback((userContent: string, agentReply: string, appliedChanges?: any[]) => {
    const currentState = stateRef.current;
    const parentId = currentState.activeLeafId;
    const userMsgId = generateId("usr");
    const agentMsgId = generateId("agt");
    const timestamp = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

    const userNode: ChatNode = {
      id: userMsgId,
      parentId,
      childrenIds: [agentMsgId],
      role: "user",
      content: userContent,
      timestamp,
      status: "idle",
    };

    const agentNode: ChatNode = {
      id: agentMsgId,
      parentId: userMsgId,
      childrenIds: [],
      role: "agent",
      content: agentReply,
      timestamp,
      status: "idle",
      appliedChanges,
    };

    setState((prev) => {
      const nextNodes = { ...prev.nodes, [userMsgId]: userNode, [agentMsgId]: agentNode };
      const nextRootIds = [...prev.rootIds];
      if (parentId && nextNodes[parentId]) {
        const parent = nextNodes[parentId];
        nextNodes[parentId] = {
          ...parent,
          childrenIds: [...parent.childrenIds, userMsgId],
        };
      } else if (!parentId) {
        nextRootIds.push(userMsgId);
      }

      return {
        nodes: nextNodes,
        rootIds: nextRootIds,
        activeLeafId: agentMsgId,
      };
    });
  }, []);

  // Clear conversation history
  const clearHistory = useCallback(() => {
    stopGeneration();
    try {
      localStorage.removeItem(storageKey);
    } catch {}

    const initId = generateId("init");
    const initNode: ChatNode = {
      id: initId,
      parentId: null,
      childrenIds: [],
      role: "agent",
      content: `Hello! I am your **AI Research Agent** for **${companyName || "the target equity"}**.\n\nYou can ask questions or ask to update and modify assumptions in real time.`,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      status: "idle",
    };

    setState({
      nodes: { [initId]: initNode },
      rootIds: [initId],
      activeLeafId: initId,
    });
  }, [storageKey, companyName, stopGeneration]);

  return {
    state,
    activeThread,
    isStreaming,
    streamingMessageId,
    sendPrompt,
    stopGeneration,
    editUserMessage,
    regenerateMessage,
    switchBranch,
    getBranchInfo,
    addCustomTurn,
    clearHistory,
  };
}
