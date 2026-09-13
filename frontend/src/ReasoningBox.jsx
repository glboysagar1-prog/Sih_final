import React, { useState, useEffect, useRef } from 'react';

// Rotating thinking phases matching Sovereign agent pipeline & DeepSeek-R1 CoT
const THINKING_PHASES = [
  "Ingesting B-scan ultrasonic point cloud from NVMe cache",
  "Evaluating localized wall thinning & HIC damage mechanisms",
  "Cross-referencing ASME B31.3 §304 allowable stress limits",
  "Grounding API 570 Table 1 formulas via local ChromaDB RAG",
  "Formulating deterministic CodeAct Python verification script",
  "Computing T-min structural floor & remaining service life",
  "Executing isolated sandbox verification (0 WAN Egress)",
  "Synthesizing statutory engineering memo & MOC package",
];

/**
 * Aetheric Intelligence Cognitive Trace Component
 * Styled after Stitch Dark Glassmorphism with glowing Amethyst (#A855F7 / #DDB7FF) HUD accents.
 */
export default function ReasoningBox({
  thinkingText = "",
  isLoading = false,
  elapsedDuration = null,
  modelName = "DeepSeek-R1",
  defaultExpanded = false
}) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [elapsedTime, setElapsedTime] = useState(0);
  const [phaseIndex, setPhaseIndex] = useState(0);
  const [copied, setCopied] = useState(false);
  const contentRef = useRef(null);
  const startTimeRef = useRef(Date.now());

  // Timer & Phase Rotation while active
  useEffect(() => {
    if (isLoading) {
      startTimeRef.current = Date.now();
      setElapsedTime(0);
      setPhaseIndex(0);

      const timerInterval = setInterval(() => {
        setElapsedTime(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 1000);

      const phaseInterval = setInterval(() => {
        setPhaseIndex((prev) => (prev + 1) % THINKING_PHASES.length);
      }, 2400);

      return () => {
        clearInterval(timerInterval);
        clearInterval(phaseInterval);
      };
    } else if (elapsedDuration !== null && elapsedDuration !== undefined) {
      setElapsedTime(elapsedDuration);
    }
  }, [isLoading, elapsedDuration]);

  // Auto-scroll when expanded and receiving new text
  useEffect(() => {
    if (isExpanded && contentRef.current) {
      contentRef.current.scrollTop = contentRef.current.scrollHeight;
    }
  }, [thinkingText, isExpanded]);

  const handleCopy = (e) => {
    e.stopPropagation();
    if (thinkingText) {
      navigator.clipboard.writeText(thinkingText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const finalSeconds = elapsedDuration ?? Math.max(elapsedTime, 4);

  // Helper to render formatted thoughts with step chips
  const renderFormattedThoughts = (text) => {
    if (!text) return null;
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} className="h-1.5" />;

      const stepMatch = trimmed.match(/^(?:###\s*)?(?:Step\s*(\d+)[:.]?|\[STEP\s*(\d+)\])(.*)$/i);
      if (stepMatch) {
        const stepNum = (stepMatch[1] || stepMatch[2]).padStart(2, '0');
        const rest = stepMatch[3];
        return (
          <div key={idx} className="flex items-start gap-2.5 my-2">
            <span className="px-1.5 py-0.5 rounded bg-[#6F00BE]/40 border border-[#A855F7]/40 text-[#DDB7FF] font-bold text-[10px] shrink-0 font-mono tracking-wider">
              STEP {stepNum}
            </span>
            <span className="text-[#E1E2EB] font-medium leading-relaxed">
              {rest}
            </span>
          </div>
        );
      }

      if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
        return (
          <div key={idx} className="flex items-start gap-2 ml-2 my-0.5 text-xs text-[#B9CACB] leading-relaxed">
            <span className="text-[#A855F7] font-bold text-xs mt-0.5 shrink-0">•</span>
            <span className="flex-1">{trimmed.substring(2)}</span>
          </div>
        );
      }

      return (
        <p key={idx} className="leading-relaxed text-[#B9CACB] my-0.5">
          {line}
        </p>
      );
    });
  };

  return (
    <div className="w-full my-2 font-sans select-none">
      {/* Header Button Pill with Amethyst HUD Glow */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="group inline-flex items-center gap-2.5 text-xs font-mono py-1.5 px-3 rounded-lg bg-[#1D2026]/90 border border-[#A855F7]/30 hover:border-[#A855F7]/60 text-[#DDB7FF] hover:text-[#E1E2EB] transition-all shadow-[0_0_12px_rgba(168,85,247,0.15)] cursor-pointer focus:outline-none"
        title={isExpanded ? "Collapse cognitive trace" : "Expand cognitive trace"}
      >
        {/* Brain / Neurology Icon with glow */}
        <span className={`material-symbols-outlined text-sm text-[#DDB7FF] ${isLoading ? "animate-pulse" : ""}`}>
          psychology
        </span>

        {/* Phase Text or Completed Trace */}
        <span className="font-semibold tracking-wide">
          {isLoading ? (
            <span className="flex items-center gap-2">
              <span className="text-[#E1E2EB]">{THINKING_PHASES[phaseIndex]}</span>
              <i className="fa-solid fa-circle-notch fa-spin text-xs text-[#00F2FF]"></i>
            </span>
          ) : (
            <span>
              {modelName} Cognitive Trace (Thought for {finalSeconds}s
              {thinkingText ? ` // ${thinkingText.length.toLocaleString()} chars` : ""})
            </span>
          )}
        </span>

        {/* Live Timer */}
        {isLoading && (
          <span className="text-[#00F2FF] font-mono text-[11px] bg-[#00F2FF]/10 px-1.5 py-0.2 rounded border border-[#00F2FF]/30">
            {elapsedTime}s
          </span>
        )}

        {/* Expand / Collapse Chevron */}
        <span
          className={`text-[#DDB7FF]/70 group-hover:text-[#DDB7FF] text-xs transition-transform duration-200 ${
            isExpanded ? "rotate-90" : ""
          }`}
        >
          ›
        </span>
      </button>

      {/* Expandable Cognitive Trace Drawer */}
      {isExpanded && (
        <div className="mt-2.5 rounded-xl border border-[#A855F7]/40 bg-[#0B0E14]/90 backdrop-blur-md overflow-hidden neon-border-glow-amethyst transition-all duration-300">
          {/* Drawer Header */}
          <div className="flex items-center justify-between px-4 py-2.5 bg-[#1D2026]/80 border-b border-[#A855F7]/30 text-xs font-mono text-[#DDB7FF]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#A855F7] shadow-[0_0_8px_#A855F7]"></span>
              <span className="font-semibold tracking-wider uppercase text-[11px]">
                {modelName} Autonomous Cognitive Path
              </span>
              {thinkingText && (
                <span className="text-[#849495] text-[11px]">
                  ({thinkingText.length.toLocaleString()} chars • Deterministic)
                </span>
              )}
            </div>

            {thinkingText && (
              <button
                type="button"
                onClick={handleCopy}
                className="hover:text-white text-[#DDB7FF] transition-colors flex items-center gap-1.5 text-[11px] bg-[#6F00BE]/30 hover:bg-[#6F00BE]/50 px-2.5 py-1 rounded border border-[#A855F7]/30"
              >
                <i className={`fa-solid ${copied ? "fa-check text-[#67F4B7]" : "fa-copy"}`}></i>
                <span>{copied ? "Copied" : "Copy Trace"}</span>
              </button>
            )}
          </div>

          {/* Trace Body */}
          <div
            ref={contentRef}
            className="p-4 font-mono text-xs bg-[#0B0E14]/95 text-[#B9CACB] max-h-96 overflow-y-auto leading-relaxed whitespace-pre-wrap select-text scroll-smooth"
          >
            {thinkingText ? (
              renderFormattedThoughts(thinkingText)
            ) : isLoading ? (
              <div className="flex flex-col gap-2.5 text-xs text-[#849495] py-2">
                <div className="flex items-center gap-2 text-[#00F2FF] font-semibold">
                  <i className="fa-solid fa-spinner fa-spin text-sm"></i>
                  <span>Evaluating engineering constraints & localized wall thinning...</span>
                </div>
                <div className="text-outline pl-4 border-l border-[#3A494B] space-y-1 mt-1 text-[11px]">
                  <div className="flex items-center gap-1.5 text-[#E1E2EB]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#67F4B7]"></span>
                    <span>1. Ingesting B-scan ultrasonic array point cloud (10mm grid spacing)</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#E1E2EB]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#00F2FF]"></span>
                    <span>2. Grounding API 570 Table 1 and ASME B31.3 allowable stress</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[#E1E2EB]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#A855F7]"></span>
                    <span>3. Synthesizing deterministic CodeAct script for sandbox validation</span>
                  </div>
                </div>
              </div>
            ) : (
              <span className="text-[#849495] italic">No reasoning trace logged for this step.</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
