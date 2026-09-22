"use client";

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExternalLink } from "lucide-react";

interface FormattedChatMessageProps {
  content: string;
  isUser?: boolean;
}

/**
 * Preprocesses raw content to normalize LaTeX math display blocks \[ ... \] and \( ... \)
 * into standard markdown code/math blocks for clean rendering.
 */
function preprocessMarkdown(raw: string): string {
  if (!raw) return "";

  // Convert \[ formula \] into a clean markdown blockquote with mathematical formatting
  let processed = raw.replace(/\\\[([\s\S]*?)\\\]/g, (_, formula) => {
    const cleaned = formula
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1 ÷ $2)")
      .replace(/\\approx/g, "≈")
      .replace(/\\times/g, "×")
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .trim();
    return `\n\n> 📐 **Formula:** \`${cleaned}\`\n\n`;
  });

  // Convert inline \( formula \) into inline code
  processed = processed.replace(/\\\(([\s\S]*?)\\\)/g, (_, formula) => {
    const cleaned = formula
      .replace(/\\frac\{([^}]+)\}\{([^}]+)\}/g, "($1 ÷ $2)")
      .replace(/\\approx/g, "≈")
      .replace(/\\times/g, "×")
      .replace(/\\text\{([^}]+)\}/g, "$1")
      .trim();
    return ` \`${cleaned}\` `;
  });

  return processed;
}

export function FormattedChatMessage({ content, isUser = false }: FormattedChatMessageProps) {
  if (isUser) {
    return <div className="leading-relaxed whitespace-pre-wrap">{content}</div>;
  }

  const processedContent = preprocessMarkdown(content);

  return (
    <div className="prose prose-sm max-w-none text-[#1A1917] select-text">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ children }) => (
            <h1 className="text-lg font-black text-[#1A1917] mt-4 mb-2 pb-1.5 border-b border-[#E3DFD5] tracking-tight">
              {children}
            </h1>
          ),
          h2: ({ children }) => (
            <h2 className="text-base font-extrabold text-[#1A1917] mt-3.5 mb-1.5 pb-1 border-b border-[#EAE7DE] tracking-tight">
              {children}
            </h2>
          ),
          h3: ({ children }) => (
            <h3 className="text-sm font-bold text-[#1A1917] mt-3 mb-1 tracking-tight">
              {children}
            </h3>
          ),
          h4: ({ children }) => (
            <h4 className="text-xs font-bold uppercase tracking-wider text-[#59554A] mt-2.5 mb-1">
              {children}
            </h4>
          ),
          p: ({ children }) => (
            <p className="my-1.5 text-sm leading-relaxed text-[#2C2A26]">
              {children}
            </p>
          ),
          ul: ({ children }) => (
            <ul className="my-2 ml-4 list-disc space-y-1 text-sm text-[#2C2A26]">
              {children}
            </ul>
          ),
          ol: ({ children }) => (
            <ol className="my-2 ml-4 list-decimal space-y-1 text-sm text-[#2C2A26]">
              {children}
            </ol>
          ),
          li: ({ children }) => (
            <li className="leading-relaxed pl-1">{children}</li>
          ),
          blockquote: ({ children }) => (
            <blockquote className="my-3 border-l-4 border-amber-400/80 bg-[#FAF8F5] px-3.5 py-2 rounded-r-xl text-xs text-[#3D3A33] shadow-2xs">
              {children}
            </blockquote>
          ),
          table: ({ children }) => (
            <div className="my-3.5 overflow-x-auto rounded-xl border border-[#E3DFD5] shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                {children}
              </table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="bg-[#F4F1EA] text-[#1A1917] border-b border-[#E3DFD5]">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-[#EAE7DE] bg-white">{children}</tbody>
          ),
          tr: ({ children }) => (
            <tr className="hover:bg-[#FAF8F5] transition-colors">{children}</tr>
          ),
          th: ({ children }) => (
            <th className="px-3.5 py-2.5 font-bold text-[#1A1917] tracking-tight whitespace-nowrap">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-3.5 py-2 text-[#3D3A33] font-medium leading-normal whitespace-nowrap">
              {children}
            </td>
          ),
          code: ({ children, className }) => {
            const isBlock = className?.includes("language-");
            if (isBlock) {
              return (
                <div className="my-2 p-3 rounded-xl bg-[#1A1917] text-amber-200 font-mono text-xs overflow-x-auto">
                  <code>{children}</code>
                </div>
              );
            }
            return (
              <code className="px-1.5 py-0.5 rounded bg-[#EFECE6] text-[#1A1917] font-mono text-xs border border-[#DDD9CE]">
                {children}
              </code>
            );
          },
          hr: () => <hr className="my-3.5 border-t border-[#E3DFD5]" />,
          strong: ({ children }) => (
            <strong className="font-bold text-[#1A1917]">{children}</strong>
          ),
          em: ({ children }) => (
            <em className="italic text-[#3D3A33]">{children}</em>
          ),
          a: ({ href, children }) => {
            // XSS protection: strictly allow only safe URL protocols
            const isSafe =
              typeof href === "string" &&
              (href.startsWith("http://") ||
                href.startsWith("https://") ||
                href.startsWith("/") ||
                href.startsWith("#"));
            const safeHref = isSafe ? href : "#";

            return (
              <a
                href={safeHref}
                target={isSafe && href.startsWith("http") ? "_blank" : undefined}
                rel={isSafe && href.startsWith("http") ? "noopener noreferrer" : undefined}
                className="inline-flex items-center gap-1 font-semibold text-blue-600 hover:text-blue-800 underline decoration-blue-300 hover:decoration-blue-600 transition-colors mx-0.5"
              >
                <span>{children}</span>
                {isSafe && href.startsWith("http") && (
                  <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-80" />
                )}
              </a>
            );
          },
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
