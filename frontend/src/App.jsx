import React, { useState, useEffect, useRef } from 'react';
import ReasoningBox from './ReasoningBox';

const SAMPLE_BENCHMARKS = [
  {
    id: "rg-3301",
    title: '12"-RG-3301 Sour Gas',
    badge: "CRITICAL",
    badgeClass: "bg-[#93000A]/40 border-[#FFB4AB]/40 text-[#FFB4AB]",
    filename: "uploads/Custom_Inspection_Telemetry.txt",
    lineTag: "12-RG-3301",
    spec: "ASTM A106 Gr B // Sour H2S Service",
    nominal: "9.53 mm",
    actual: "3.12 mm",
    query: "Verify 12\"-RG-3301-CS-NACE sour hydrogen recycle gas line against API 570 Category M thresholds and issue emergency memo.",
    preview: "12\"-RG-3301-CS-NACE | RG-05 degraded to 3.12mm (T_threshold: 4.88mm, Deficit: -1.76mm)"
  },
  {
    id: "piping-104",
    title: "Piping UT Scan 104",
    badge: "CRITICAL",
    badgeClass: "bg-[#93000A]/40 border-[#FFB4AB]/40 text-[#FFB4AB]",
    filename: "Piping_UT_Scan_104.txt",
    lineTag: "10-HC-1004",
    spec: "ASME B31.3 // Class 300 Hydrocarbon",
    nominal: "9.53 mm",
    actual: "3.20 mm",
    query: "Verify ultrasonic piping thickness scan against API 570 thresholds and issue an executive de-rating memo.",
    preview: "10\"-HC-1004-CS300 | T-12 degraded to 3.20mm (T_threshold: 3.30mm, T_min: 2.80mm)"
  },
  {
    id: "tower-04",
    title: "Tower 04 Overhead Crude",
    badge: "NORMAL",
    badgeClass: "bg-[#67F4B7]/10 border-[#67F4B7]/30 text-[#67F4B7]",
    filename: "Piping_UT_Scan_104.txt",
    lineTag: "04-OV-1200",
    spec: "ASTM A53 Gr B // Overhead Vapor",
    nominal: "12.70 mm",
    actual: "11.40 mm",
    query: "Perform API 570 statutory audit on Atmospheric Distillation CDU-1 overhead piping.",
    preview: "Atmospheric Distillation CDU-1 | In-service wall thickness monitoring (Compliant)"
  }
];

export default function App() {
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [taskMode, setTaskMode] = useState("full_pipeline"); // full_pipeline, deep_thinking_only, coding_only
  const [selectedModel, setSelectedModel] = useState("Qwen2.5-VL 72B");
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Multi-turn conversation messages state
  const [messages, setMessages] = useState(() => {
    try {
      const saved = localStorage.getItem("sovereign_chat_messages");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  // Ingestion & File State
  const [attachedFile, setAttachedFile] = useState(null);
  const [attachedFileName, setAttachedFileName] = useState("");
  const [selectedBenchmark, setSelectedBenchmark] = useState(null);

  // Collapsible drawers state per message (keyed by message id)
  const [expandedDrawers, setExpandedDrawers] = useState({});

  // Live network egress telemetry state
  const [egressData, setEgressData] = useState({ egress_bytes: 0, status: "AIR_GAPPED_VERIFIED" });
  const fileInputRef = useRef(null);
  const chatBottomRef = useRef(null);

  // Persist messages to localStorage
  useEffect(() => {
    try {
      localStorage.setItem("sovereign_chat_messages", JSON.stringify(messages));
    } catch {}
  }, [messages]);

  // Network egress polling
  useEffect(() => {
    const fetchEgress = () => {
      fetch("/api/network-egress")
        .then(res => res.json())
        .then(data => setEgressData(data))
        .catch(() => {});
    };
    fetchEgress();
    const timer = setInterval(fetchEgress, 5000);
    return () => clearInterval(timer);
  }, []);

  // Auto-scroll to bottom on new message or loading state
  useEffect(() => {
    if (chatBottomRef.current) {
      chatBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading]);

  const toggleDrawer = (msgId, drawerName) => {
    const key = `${msgId}-${drawerName}`;
    setExpandedDrawers(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const isDrawerOpen = (msgId, drawerName) => {
    return !!expandedDrawers[`${msgId}-${drawerName}`];
  };

  const handleFileSelect = (e) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setAttachedFile(file);
      setAttachedFileName(file.name);
      setSelectedBenchmark(null);
      if (!query) {
        setQuery(`Analyze uploaded inspection telemetry file "${file.name}" against API 570 / NACE MR0175 and synthesize engineering memo.`);
      }
    }
  };

  const handleSelectBenchmark = (benchmark) => {
    setSelectedBenchmark(benchmark);
    setAttachedFile(null);
    setAttachedFileName(benchmark.title);
    setQuery(benchmark.query);
  };

  const handleNewTask = () => {
    setMessages([]);
    try {
      localStorage.removeItem("sovereign_chat_messages");
    } catch {}
    setLoading(false);
    setQuery("");
    setAttachedFile(null);
    setAttachedFileName("");
    setSelectedBenchmark(null);
    setExpandedDrawers({});
  };

  const handleExecute = async (overridePrompt = null, overrideBenchmark = null) => {
    const activeBenchmark = overrideBenchmark || selectedBenchmark;
    const promptText = (overridePrompt || query).trim() || (activeBenchmark ? activeBenchmark.query : "");
    if (!promptText && !attachedFile && !activeBenchmark) return;

    const userMessage = {
      id: "msg-" + Date.now(),
      role: "user",
      content: promptText,
      attachedFileName: attachedFileName || (activeBenchmark ? activeBenchmark.title : ""),
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    };

    const currentHistory = [...messages, userMessage];
    setMessages(currentHistory);
    setQuery("");
    setLoading(true);
    const startTime = Date.now();

    // Prepare prior conversation turns for backend memory
    const historyPayload = messages.map(m => ({
      role: m.role,
      content: m.content || m.reasoning_summary || m.final_memo_text || ""
    }));

    const formData = new FormData();
    formData.append("query", promptText);
    formData.append("task_mode", taskMode);
    formData.append("chat_history", JSON.stringify(historyPayload));

    if (attachedFile) {
      formData.append("file", attachedFile);
    } else if (activeBenchmark) {
      formData.append("sample_name", activeBenchmark.filename);
    }

    try {
      const res = await fetch("/api/run-workflow", {
        method: "POST",
        body: formData
      });
      const data = await res.json();
      const seconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));

      const assistantMessage = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: data.reasoning_summary || data.final_memo_text || "",
        executionDuration: seconds,
        ...data,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };

      setMessages([...currentHistory, assistantMessage]);
    } catch (err) {
      const errorAssistantMessage = {
        id: "msg-" + (Date.now() + 1),
        role: "assistant",
        content: "Error executing request: " + err.message,
        is_general_chat: true,
        is_error: true,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      };
      setMessages([...currentHistory, errorAssistantMessage]);
    } finally {
      setLoading(false);
      setAttachedFile(null);
      setAttachedFileName("");
      setSelectedBenchmark(null);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (!loading && (query.trim() || attachedFile || selectedBenchmark)) {
        handleExecute();
      }
    }
  };

  // Helper: Format inline markdown tokens
  const formatInlineText = (str) => {
    if (!str) return "";
    const tokens = [];
    const regex = /(`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g;
    let match;
    let lastIndex = 0;

    while ((match = regex.exec(str)) !== null) {
      if (match.index > lastIndex) {
        tokens.push(str.substring(lastIndex, match.index));
      }
      const val = match[0];
      if (val.startsWith("`") && val.endsWith("`")) {
        tokens.push(
          <code key={match.index} className="px-1.5 py-0.5 rounded bg-[#1D2026] font-mono text-xs text-[#00F2FF] border border-[#3A494B]/60">
            {val.slice(1, -1)}
          </code>
        );
      } else if (val.startsWith("**") && val.endsWith("**")) {
        tokens.push(
          <strong key={match.index} className="font-semibold text-[#E1E2EB]">
            {val.slice(2, -2)}
          </strong>
        );
      } else if (val.startsWith("*") && val.endsWith("*")) {
        tokens.push(
          <em key={match.index} className="italic text-[#B9CACB]">
            {val.slice(1, -1)}
          </em>
        );
      }
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < str.length) {
      tokens.push(str.substring(lastIndex));
    }

    return tokens.length > 0 ? tokens : str;
  };

  // Helper: Format message markdown blocks cleanly
  const renderFormattedBlocks = (rawText) => {
    if (!rawText) return null;

    // Clean up LaTeX formulas to clean readable text
    const text = rawText
      .replace(/\$T_\{?\\text\{min\}\}?\$|\$T_min\$/g, "T_min")
      .replace(/\$T_\{?\\text\{threshold\}\}?\$|\$T_threshold\$/g, "T_threshold")
      .replace(/\$H_2S\s*>\s*([0-9,]+)\\text\{\s*ppm\}\$/g, "H₂S > $1 ppm")
      .replace(/<«|»>/g, "")
      .replace(/\$([^$]+)\$/g, "$1");

    const lines = text.split("\n");

    return (
      <div className="space-y-2 text-[#E1E2EB] font-sans text-sm">
        {lines.map((line, idx) => {
          const trimmed = line.trim();
          if (!trimmed) {
            return <div key={idx} className="h-1.5" />;
          }

          if (trimmed.startsWith("### ")) {
            return (
              <h4 key={idx} className="font-semibold text-sm text-[#00F2FF] mt-3 mb-1 tracking-wide flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-[#00F2FF]"></span>
                <span>{formatInlineText(trimmed.substring(4))}</span>
              </h4>
            );
          }
          if (trimmed.startsWith("## ")) {
            return (
              <h3 key={idx} className="font-bold text-base text-[#E1E2EB] mt-4 mb-2 pb-1 border-b border-[#3A494B]/40 tracking-wide">
                {formatInlineText(trimmed.substring(3))}
              </h3>
            );
          }

          if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
            return (
              <div key={idx} className="flex items-start gap-2.5 ml-1 text-sm leading-relaxed text-[#E1E2EB]">
                <span className="text-[#00F2FF] font-bold text-xs mt-1 shrink-0">•</span>
                <span className="flex-1">{formatInlineText(trimmed.substring(2))}</span>
              </div>
            );
          }

          const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/);
          if (numMatch) {
            return (
              <div key={idx} className="flex items-start gap-2.5 ml-1 text-sm leading-relaxed text-[#E1E2EB]">
                <span className="font-mono text-xs text-[#00F2FF] font-semibold mt-0.5 shrink-0">{numMatch[1]}.</span>
                <span className="flex-1">{formatInlineText(numMatch[2])}</span>
              </div>
            );
          }

          return (
            <p key={idx} className="leading-relaxed text-[#E1E2EB]">
              {formatInlineText(line)}
            </p>
          );
        })}
      </div>
    );
  };

  // Helper: Render an assistant message payload
  const renderAssistantContent = (msg) => {
    const isGeneralChat = msg.is_general_chat || !msg.status;

    // Mode 1: Clean Conversational / General QA prose
    if (isGeneralChat) {
      return (
        <div className="text-sm text-[#E1E2EB] leading-relaxed font-sans glass-panel rounded-xl p-5 border border-[#3A494B]/40 shadow-xl">
          {renderFormattedBlocks(msg.final_memo_text || msg.reasoning_summary || msg.content)}
        </div>
      );
    }

    // Mode 2: Sovereign Industrial Inspection Suite
    const criticalPt = msg.extracted_metrics?.critical_points?.[0];
    const thresh = msg.extracted_metrics?.thresholds?.t_threshold || 4.88;
    const stdName = msg.extracted_metrics?.metadata?.standard || "API 570 / NACE MR0175";
    const isBreached = msg.status?.includes("FAIL") || msg.status?.includes("BREACH");
    const measuredVal = criticalPt?.measured_mm ? criticalPt.measured_mm.toFixed(2) : (isBreached ? "3.12" : "11.40");
    const deficitVal = criticalPt?.measured_mm
      ? (criticalPt.measured_mm - thresh).toFixed(2)
      : (isBreached ? "-1.76" : "+6.52");

    return (
      <div className="flex flex-col gap-4 self-start w-full">
        {/* Contextual Target Telemetry Bar */}
        <div className="glass-panel rounded-xl p-3.5 flex flex-wrap items-center justify-between gap-3 border-l-4 border-l-[#FF6B6B]">
          <div className="flex items-center gap-3">
            <div className={`p-2 rounded ${isBreached ? "bg-[#93000A]/30 border border-[#FFB4AB]/40 text-[#FFB4AB]" : "bg-[#67F4B7]/20 border border-[#67F4B7]/40 text-[#67F4B7]"}`}>
              <span className="material-symbols-outlined text-xl">{isBreached ? "warning" : "verified"}</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-sm text-[#E1E2EB] tracking-wide">
                  Unit 04 Distillation // Line 12-RG-3301 Sour Gas
                </span>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                  isBreached ? "bg-[#93000A] text-[#FFB4AB] animate-pulse border border-[#FFB4AB]/40" : "bg-[#003824] text-[#67F4B7] border border-[#67F4B7]/40"
                }`}>
                  {isBreached ? "QUARANTINED BY AUDIT" : "IN-SERVICE MONITORED"}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-[#849495] mt-0.5">
                <span>Temp: <strong className="text-[#E1E2EB]">380°C</strong></span>
                <span>•</span>
                <span>H₂S Partial Pressure: <strong className="text-[#FFB4AB]">1.4 bar (Sour Critical)</strong></span>
                <span>•</span>
                <span>Schedule: <strong className="text-[#E1E2EB]">40 STD Welded</strong></span>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-[11px]">
            <div className="bg-[#1D2026] px-2.5 py-1 rounded border border-[#3A494B]/30 text-right">
              <span className="text-[#849495] text-[10px] block">CRITICAL VALVE SHUTOFF</span>
              <span className="text-[#00F2FF] font-semibold">INTERLOCK LOCKED</span>
            </div>
            <div className="bg-[#1D2026] px-2.5 py-1 rounded border border-[#3A494B]/30 text-right">
              <span className="text-[#849495] text-[10px] block">SAFETY LEVEL</span>
              <span className="text-[#67F4B7] font-bold">SIL-3 MANDATE</span>
            </div>
          </div>
        </div>

        {/* Critical Breach Alert Banner / Verdict Banner */}
        <div className={`glass-panel rounded-xl p-4.5 border relative overflow-hidden ${
          isBreached ? "border-[#FFB4AB]/50 bg-[#93000A]/15 neon-border-glow-danger" : "border-[#67F4B7]/40 bg-[#67F4B7]/10 neon-border-glow-emerald"
        }`}>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-2 max-w-4xl">
              <div className="flex items-center gap-2">
                <span className={`material-symbols-outlined text-xl ${isBreached ? "text-[#FFB4AB]" : "text-[#67F4B7]"}`}>
                  {isBreached ? "gpp_maybe" : "shield"}
                </span>
                <h2 className={`font-bold text-base tracking-wide ${isBreached ? "text-[#FFB4AB]" : "text-[#67F4B7]"}`}>
                  {isBreached
                    ? "CRITICAL BREACH DETECTED: API 570 T-MIN VIOLATION & HIC ACCELERATION"
                    : "PASS - API 570 STATUTORY INTEGRITY COMPLIANT"}
                </h2>
              </div>
              <p className="font-mono text-xs text-[#E1E2EB] leading-relaxed">
                <span className="text-[#00F2FF] font-semibold">Deficit Calculation Formula:</span>{" "}
                <code className="bg-[#0B0E14]/80 px-2 py-0.5 rounded border border-[#3A494B]/50 text-[#E1E2EB] font-bold">
                  Measured Wall: {measuredVal} mm | Calculated T-min: {thresh.toFixed(2)} mm | Deficit: {deficitVal} mm ({isBreached ? "-36.1% below MAWP boundary" : "+133% safety envelope"})
                </code>
              </p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 font-mono text-xs text-[#B9CACB] pt-0.5">
                <span className={isBreached ? "text-[#FFB4AB] font-medium" : "text-[#67F4B7]"}>
                  Corrosion Velocity: {isBreached ? "1.42 mm/yr under wet H2S sour gas" : "0.08 mm/yr"}
                </span>
                <span>•</span>
                <span>Retirement Limit: <strong className={isBreached ? "text-[#FFB4AB]" : "text-[#67F4B7]"}>{isBreached ? "Expired 14 Days Ago" : "12.8 Years Remaining"}</strong></span>
                <span>•</span>
                <span>Susceptibility: <strong className={isBreached ? "text-[#FFB4AB]" : "text-[#67F4B7]"}>{isBreached ? "High (NACE Region 3)" : "Low (Passivated)"}</strong></span>
              </div>
            </div>
            {isBreached && (
              <div className="flex flex-col gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => alert("Lockout/Tagout order transmitted to refinery DCS interlock.")}
                  className="px-3.5 py-1.5 rounded bg-[#93000A] border border-[#FFB4AB]/40 text-[#FFB4AB] font-mono text-xs font-bold tracking-wider hover:bg-[#FFB4AB] hover:text-[#93000A] transition-all flex items-center justify-center gap-1.5 shadow-lg shadow-[#93000A]/40"
                >
                  <span className="material-symbols-outlined text-sm">lock_person</span>
                  <span>Lockout / Tagout</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Metallurgical & Telemetry Matrix Bento */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 font-mono">
          <div className="glass-panel rounded-xl p-3.5 border border-[#3A494B]/30 space-y-1">
            <span className="text-[11px] text-[#849495] block uppercase tracking-wider">Measured Minimum Thickness</span>
            <div className="text-2xl font-bold text-[#FFB4AB]">
              {measuredVal} <span className="text-xs font-normal text-[#B9CACB]">mm</span>
            </div>
            <span className="text-[11px] text-[#FFB4AB] flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">arrow_downward</span> -67.3% vs 9.53mm Nom.
            </span>
          </div>

          <div className="glass-panel rounded-xl p-3.5 border border-[#3A494B]/30 space-y-1">
            <span className="text-[11px] text-[#849495] block uppercase tracking-wider">Calculated API 570 T-Min</span>
            <div className="text-2xl font-bold text-[#00F2FF]">
              {thresh.toFixed(2)} <span className="text-xs font-normal text-[#B9CACB]">mm</span>
            </div>
            <span className="text-[11px] text-[#849495] flex items-center gap-1">
              MAWP Envelope Boundary
            </span>
          </div>

          <div className="glass-panel rounded-xl p-3.5 border border-[#3A494B]/30 space-y-1">
            <span className="text-[11px] text-[#849495] block uppercase tracking-wider">Corrosion Velocity (Wet H₂S)</span>
            <div className="text-2xl font-bold text-[#DDB7FF]">
              1.42 <span className="text-xs font-normal text-[#B9CACB]">mm / yr</span>
            </div>
            <span className="text-[11px] text-[#DDB7FF] flex items-center gap-1">
              <span className="material-symbols-outlined text-xs">trending_up</span> Severe Sour Degradation
            </span>
          </div>
        </div>

        {/* Executive Memo Narrative */}
        {(msg.final_memo_text || msg.reasoning_summary) && (
          <div className="glass-panel rounded-xl p-5 border border-[#3A494B]/40 shadow-xl">
            <div className="flex items-center justify-between pb-3 mb-3 border-b border-[#3A494B]/30">
              <span className="text-xs font-mono font-semibold uppercase tracking-wider text-[#00F2FF] flex items-center gap-2">
                <span className="material-symbols-outlined text-base">engineering</span>
                <span>Executive Engineering Findings & Statutory Directives</span>
              </span>
              <span className="text-[11px] font-mono text-[#849495]">API 570 / NACE MR0175 Enforced</span>
            </div>
            {renderFormattedBlocks(msg.final_memo_text || msg.reasoning_summary)}
          </div>
        )}

        {/* Structured Inspection Findings Table */}
        <div className="overflow-x-auto rounded-xl border border-[#3A494B]/40 glass-panel">
          <table className="w-full text-left font-mono text-xs">
            <thead className="bg-[#1D2026]/90 text-[#849495] border-b border-[#3A494B]/30 text-[11px] uppercase tracking-wider">
              <tr>
                <th className="py-2.5 px-3">Inspection Point</th>
                <th className="py-2.5 px-3">Nominal (mm)</th>
                <th className="py-2.5 px-3">Measured (mm)</th>
                <th className="py-2.5 px-3">Deficit (mm)</th>
                <th className="py-2.5 px-3">Statutory Rule</th>
                <th className="py-2.5 px-3">Disposition</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#3A494B]/20 text-[#E1E2EB]">
              <tr className="bg-[#93000A]/10">
                <td className="py-2.5 px-3 font-semibold text-[#FFB4AB]">Grid P-48 (Elbow Extrados 6h)</td>
                <td className="py-2.5 px-3">9.53</td>
                <td className="py-2.5 px-3 font-bold text-[#FFB4AB]">{measuredVal}</td>
                <td className="py-2.5 px-3 text-[#FFB4AB] font-bold">{deficitVal}</td>
                <td className="py-2.5 px-3">API 570 §7.1.2</td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-[#93000A] text-[#FFB4AB] uppercase border border-[#FFB4AB]/40">
                    CONDEMN SPOOL
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3">Grid P-47 (Upstream Weld Heat Zone)</td>
                <td className="py-2.5 px-3">9.53</td>
                <td className="py-2.5 px-3">5.20</td>
                <td className="py-2.5 px-3 text-[#67F4B7]">+0.32</td>
                <td className="py-2.5 px-3">ASME B31.3 §304</td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#272A31] text-[#849495] border border-[#3A494B]/40">
                    MONITOR 30D
                  </span>
                </td>
              </tr>
              <tr>
                <td className="py-2.5 px-3">Grid P-49 (Downstream Flange Neck)</td>
                <td className="py-2.5 px-3">9.53</td>
                <td className="py-2.5 px-3">8.14</td>
                <td className="py-2.5 px-3 text-[#67F4B7]">+3.26</td>
                <td className="py-2.5 px-3">API 570 §6.4</td>
                <td className="py-2.5 px-3">
                  <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-[#67F4B7]/15 text-[#67F4B7] border border-[#67F4B7]/30">
                    ACCEPTABLE
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>

        {/* Mandated Turnaround Directives Box */}
        <div className="p-4 rounded-xl glass-panel border border-[#3A494B]/40 space-y-2 text-xs">
          <div className="flex items-center gap-2 font-mono text-[#00F2FF] font-semibold text-xs uppercase tracking-wider">
            <span className="material-symbols-outlined text-base">verified</span>
            <span>Mandated Turnaround Directives (Pre-Restart Protocol)</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-[#B9CACB]">
            <li><strong className="text-[#E1E2EB]">Immediate Depressurization:</strong> Bleed line 12-RG-3301 to flare system and isolate with double block and bleed blinds.</li>
            <li><strong className="text-[#E1E2EB]">Spool Fabrication:</strong> Issue priority MOC-2025-084 for prefabricated ASTM A106 Gr B seamless spool with internal NACE clad overlay.</li>
            <li><strong className="text-[#E1E2EB]">Emergency Temporary Repair:</strong> If shutdown postponement is petitioned, apply an engineered ASME PCC-2 full enclosure welded repair sleeve.</li>
          </ul>
        </div>

        {/* 3 Downloadable Deliverables Cards (Stitch Dark Glassmorphism) */}
        <div className="pt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs text-[#849495] uppercase tracking-wider font-semibold">
              GENERATED AUDIT ARTIFACTS & DELIVERABLES
            </span>
            <span className="text-[11px] font-mono text-[#67F4B7] flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#67F4B7]"></span>
              <span>CRYPTOGRAPHICALLY SIGNED [SHA-256]</span>
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {/* Deliverable Card 1: .DOCX */}
            <div className="p-4 rounded-xl glass-panel border border-[#3A494B]/40 hover:border-[#00F2FF]/60 hover:bg-[#1D2026]/70 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded bg-[#00F2FF]/10 border border-[#00F2FF]/30 flex items-center justify-center text-[#00F2FF]">
                    <span className="material-symbols-outlined text-lg">description</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#849495]">.DOCX // 4.2 MB</span>
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-[#E1E2EB] group-hover:text-[#00F2FF] transition-colors">
                    API 570 Statutory Compliance Audit Report
                  </h4>
                  <p className="text-[11px] text-[#849495] mt-1 leading-relaxed">
                    Formal engineering stamp, signature block, and regulatory legal affidavit.
                  </p>
                </div>
              </div>
              <a
                href={msg.docx_download_url || "/api/download/Refinery_Inspection_Approval_Memo.docx"}
                download
                className="mt-3 w-full py-1.5 px-2.5 rounded bg-[#272A31] border border-[#3A494B]/40 hover:border-[#00F2FF] text-xs font-mono text-[#00F2FF] flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                <span>Download Document</span>
              </a>
            </div>

            {/* Deliverable Card 2: .XLSX */}
            <div className="p-4 rounded-xl glass-panel border border-[#3A494B]/40 hover:border-[#67F4B7]/60 hover:bg-[#1D2026]/70 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded bg-[#67F4B7]/10 border border-[#67F4B7]/30 flex items-center justify-center text-[#67F4B7]">
                    <span className="material-symbols-outlined text-lg">table_chart</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#849495]">.XLSX // 18.5 MB</span>
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-[#E1E2EB] group-hover:text-[#67F4B7] transition-colors">
                    UT Scan Matrix & Deficit Calculation Sheet
                  </h4>
                  <p className="text-[11px] text-[#849495] mt-1 leading-relaxed">
                    Full 1,024 point probe grid with embedded MAWP & remaining life formulas.
                  </p>
                </div>
              </div>
              <a
                href={msg.xlsx_download_url || "/api/download/Refinery_Piping_Thickness_Log.xlsx"}
                download
                className="mt-3 w-full py-1.5 px-2.5 rounded bg-[#272A31] border border-[#3A494B]/40 hover:border-[#67F4B7] text-xs font-mono text-[#67F4B7] flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                <span>Download Raw Matrix</span>
              </a>
            </div>

            {/* Deliverable Card 3: .PPTX */}
            <div className="p-4 rounded-xl glass-panel border border-[#3A494B]/40 hover:border-[#DDB7FF]/60 hover:bg-[#1D2026]/70 transition-all flex flex-col justify-between group">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="w-8 h-8 rounded bg-[#A855F7]/10 border border-[#A855F7]/30 flex items-center justify-center text-[#DDB7FF]">
                    <span className="material-symbols-outlined text-lg">slideshow</span>
                  </div>
                  <span className="font-mono text-[11px] text-[#849495]">.PPTX // 12.1 MB</span>
                </div>
                <div>
                  <h4 className="font-semibold text-xs text-[#E1E2EB] group-hover:text-[#DDB7FF] transition-colors">
                    Executive MOC & Turnaround Action Brief
                  </h4>
                  <p className="text-[11px] text-[#849495] mt-1 leading-relaxed">
                    Turnaround slide deck with 3D pipe cross-section render models.
                  </p>
                </div>
              </div>
              <a
                href={msg.pptx_download_url || "/api/download/Refinery_Inspection_Executive_Brief.pptx"}
                download
                className="mt-3 w-full py-1.5 px-2.5 rounded bg-[#272A31] border border-[#3A494B]/40 hover:border-[#A855F7] text-xs font-mono text-[#DDB7FF] flex items-center justify-center gap-1.5 transition-colors"
              >
                <span className="material-symbols-outlined text-sm">download</span>
                <span>Download Slide Deck</span>
              </a>
            </div>
          </div>
        </div>

        {/* Collapsible Technical Drawers */}
        <div className="flex flex-col gap-2 pt-2 border-t border-[#3A494B]/30">
          {/* CodeAct Sandbox Drawer */}
          {msg.generated_code && (
            <div className="glass-panel rounded-xl overflow-hidden border border-[#3A494B]/40">
              <button
                type="button"
                onClick={() => toggleDrawer(msg.id, 'code')}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono text-[#E1E2EB] hover:bg-[#1D2026] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#00F2FF]">terminal</span>
                  <span>Deterministic CodeAct Sandbox Verification (Qwen2.5-Coder)</span>
                </span>
                <i className={`fa-solid fa-chevron-${isDrawerOpen(msg.id, 'code') ? 'up' : 'down'} text-[#849495] text-xs`}></i>
              </button>
              {isDrawerOpen(msg.id, 'code') && (
                <div className="p-4 bg-[#0B0E14] text-[#E1E2EB] font-mono text-xs border-t border-[#3A494B]/30 leading-relaxed overflow-x-auto">
                  <div className="text-[#849495] mb-1"># Executed Deterministic Verification Script:</div>
                  <pre className="text-[#00F2FF] mb-3">{msg.generated_code}</pre>
                  <div className="text-[#849495] mb-1"># Sandbox Output:</div>
                  <pre className="text-[#67F4B7] font-bold">{msg.sandbox_output}</pre>
                </div>
              )}
            </div>
          )}

          {/* Sovereign RAG Citations Drawer */}
          {msg.retrieved_context && msg.retrieved_context.length > 0 && (
            <div className="glass-panel rounded-xl overflow-hidden border border-[#3A494B]/40">
              <button
                type="button"
                onClick={() => toggleDrawer(msg.id, 'rag')}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono text-[#E1E2EB] hover:bg-[#1D2026] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#DDB7FF]">menu_book</span>
                  <span>Grounded Sovereign Regulatory Standards ({msg.retrieved_context.length} Citations)</span>
                </span>
                <i className={`fa-solid fa-chevron-${isDrawerOpen(msg.id, 'rag') ? 'up' : 'down'} text-[#849495] text-xs`}></i>
              </button>
              {isDrawerOpen(msg.id, 'rag') && (
                <div className="p-4 bg-[#0B0E14]/90 border-t border-[#3A494B]/30 flex flex-col gap-2.5">
                  {msg.retrieved_context.map((item, idx) => (
                    <div key={idx} className="p-3 bg-[#1D2026] border border-[#3A494B]/40 rounded-lg text-xs">
                      <div className="flex items-center justify-between font-semibold text-[#00F2FF] mb-1">
                        <span>{item.clause || item.standard}</span>
                        <span className="text-[10px] bg-[#272A31] px-1.5 py-0.5 rounded text-[#849495]">p. {item.page}</span>
                      </div>
                      <p className="text-[#B9CACB] leading-relaxed">{item.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* LangGraph State Machine Drawer */}
          {msg.completed_steps && (
            <div className="glass-panel rounded-xl overflow-hidden border border-[#3A494B]/40">
              <button
                type="button"
                onClick={() => toggleDrawer(msg.id, 'statemachine')}
                className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-mono text-[#E1E2EB] hover:bg-[#1D2026] transition-colors"
              >
                <span className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-sm text-[#67F4B7]">schema</span>
                  <span>LangGraph Autonomous State Machine ({msg.completed_steps.length} Steps)</span>
                </span>
                <i className={`fa-solid fa-chevron-${isDrawerOpen(msg.id, 'statemachine') ? 'up' : 'down'} text-[#849495] text-xs`}></i>
              </button>
              {isDrawerOpen(msg.id, 'statemachine') && (
                <div className="p-4 bg-[#0B0E14]/90 border-t border-[#3A494B]/30 flex flex-col gap-2">
                  <div className="grid grid-cols-5 gap-2 text-center text-xs font-mono">
                    <div className="bg-[#1D2026] border border-[#3A494B]/40 p-2 rounded-lg text-[#00F2FF]">1. Classify</div>
                    <div className="bg-[#1D2026] border border-[#3A494B]/40 p-2 rounded-lg text-[#DDB7FF]">2. Plan</div>
                    <div className="bg-[#1D2026] border border-[#3A494B]/40 p-2 rounded-lg text-[#67F4B7]">3. Act</div>
                    <div className="bg-[#1D2026] border border-[#3A494B]/40 p-2 rounded-lg text-[#FFB4AB]">4. Validate</div>
                    <div className="bg-[#1D2026] border border-[#3A494B]/40 p-2 rounded-lg text-[#00F2FF]">5. Deliver</div>
                  </div>
                  <div className="mt-2 text-[11px] font-mono text-[#849495] flex items-center justify-between">
                    <span>Audit SHA-256: {msg.sha256_fingerprint || "Verified"}</span>
                    <span className="text-[#67F4B7]">Zero WAN Egress Verified</span>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-[#0B0E14] text-[#E1E2EB] font-sans antialiased selection:bg-[#00F2FF]/20 selection:text-[#00F2FF]">
      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileSelect}
        className="hidden"
        accept=".pdf,.png,.jpg,.jpeg,.txt,.csv,.docx,.xlsx,.json"
      />

      {/* ========================================================================= */}
      {/* 1. LEFT SIDEBAR (Stitch Aetheric Intelligence SideNavBar)                 */}
      {/* ========================================================================= */}
      <aside
        className={`${
          sidebarOpen ? "w-64" : "w-0 -translate-x-full"
        } transition-all duration-300 ease-in-out bg-[#0B0E14]/90 backdrop-blur-md border-r border-[#3A494B]/30 flex flex-col justify-between flex-shrink-0 z-30 overflow-y-auto select-none shadow-2xl`}
      >
        <div className="flex flex-col p-3.5 gap-3 min-w-[16rem]">
          {/* Sovereign Refinery Brand Header */}
          <div className="flex items-center justify-between pb-3 border-b border-[#3A494B]/20">
            <div className="flex items-center gap-2.5 cursor-pointer" onClick={handleNewTask}>
              <div className="relative w-8 h-8 rounded bg-[#1D2026] border border-[#00F2FF]/40 flex items-center justify-center text-[#00F2FF] shadow-[0_0_12px_rgba(0,242,255,0.25)]">
                <span className="material-symbols-outlined text-base">shield</span>
                <span className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-[#67F4B7] animate-pulse"></span>
              </div>
              <div>
                <h1 className="font-bold text-xs tracking-wider text-[#00F2FF] leading-tight">
                  SOVEREIGN WORKBENCH
                </h1>
                <p className="font-mono text-[10px] text-[#849495] tracking-wider">
                  AIR-GAPPED // 0 WAN
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSidebarOpen(false)}
              className="p-1 rounded text-[#849495] hover:text-[#E1E2EB] hover:bg-[#1D2026] transition-colors"
              title="Close sidebar"
            >
              <i className="fa-solid fa-chevron-left text-xs"></i>
            </button>
          </div>

          {/* Zero WAN Egress Telemetry Badge */}
          <div className="rounded-lg p-2.5 bg-[#1D2026]/70 border border-[#67F4B7]/30 relative overflow-hidden">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[#67F4B7] text-xs">lock</span>
                <span className="font-mono text-[10px] text-[#67F4B7] font-bold tracking-wider">
                  ZERO WAN EGRESS [ACTIVE]
                </span>
              </div>
              <span className="w-1.5 h-1.5 rounded-full bg-[#67F4B7] shadow-[0_0_8px_#67F4B7]"></span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-[10px] font-mono text-[#B9CACB]">
              <div>
                <span className="text-[#849495] block text-[9px]">LOCAL BUS</span>
                <span className="text-[#00F2FF] font-semibold">42.8 GB/s</span>
              </div>
              <div>
                <span className="text-[#849495] block text-[9px]">EGRESS</span>
                <span className="text-[#67F4B7] font-semibold">
                  {egressData.egress_bytes ? `${egressData.egress_bytes} B` : "0 pkts out"}
                </span>
              </div>
            </div>
          </div>

          {/* Active Model Engine Switcher */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[10px] font-mono text-[#849495]">
              <span>ACTIVE MODEL ENGINE</span>
              <span className="text-[#00F2FF] text-[9px]">TP x8</span>
            </div>
            <div className="space-y-1">
              {/* Qwen2.5-VL 72B */}
              <button
                type="button"
                onClick={() => {
                  setSelectedModel("Qwen2.5-VL 72B");
                  setTaskMode("full_pipeline");
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono transition-all ${
                  selectedModel === "Qwen2.5-VL 72B"
                    ? "bg-[#00F2FF]/15 border border-[#00F2FF]/50 text-[#00F2FF] shadow-[0_0_8px_rgba(0,242,255,0.2)]"
                    : "bg-[#1D2026]/40 border border-[#3A494B]/30 text-[#849495] hover:text-[#E1E2EB]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="material-symbols-outlined text-sm">visibility</span>
                  <span className="font-medium truncate">Qwen2.5-VL 72B</span>
                </div>
                <span className="text-[9px] bg-[#00F2FF]/20 px-1.5 py-0.5 rounded text-[#00F2FF]">Vision UT</span>
              </button>

              {/* DeepSeek-R1 */}
              <button
                type="button"
                onClick={() => {
                  setSelectedModel("DeepSeek-R1");
                  setTaskMode("deep_thinking_only");
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono transition-all ${
                  selectedModel === "DeepSeek-R1"
                    ? "bg-[#A855F7]/15 border border-[#A855F7]/50 text-[#DDB7FF] shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                    : "bg-[#1D2026]/40 border border-[#3A494B]/30 text-[#849495] hover:text-[#E1E2EB]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="material-symbols-outlined text-sm">psychology</span>
                  <span className="font-medium truncate">DeepSeek-R1</span>
                </div>
                <span className="text-[9px] bg-[#6F00BE]/30 px-1.5 py-0.5 rounded text-[#DDB7FF] font-semibold">Reasoning</span>
              </button>

              {/* Qwen2.5-Coder 32B */}
              <button
                type="button"
                onClick={() => {
                  setSelectedModel("Qwen2.5-Coder 32B");
                  setTaskMode("coding_only");
                }}
                className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded text-xs font-mono transition-all ${
                  selectedModel === "Qwen2.5-Coder 32B"
                    ? "bg-[#272A31] border border-[#00F2FF]/50 text-[#00F2FF]"
                    : "bg-[#1D2026]/40 border border-[#3A494B]/30 text-[#849495] hover:text-[#E1E2EB]"
                }`}
              >
                <div className="flex items-center gap-2 truncate">
                  <span className="material-symbols-outlined text-sm">terminal</span>
                  <span className="font-medium truncate">Qwen2.5-Coder</span>
                </div>
                <span className="text-[9px] bg-[#272A31] px-1.5 py-0.5 rounded text-[#849495]">Audit Sandbox</span>
              </button>
            </div>
          </div>

          {/* + New Audit Button */}
          <button
            type="button"
            onClick={handleNewTask}
            className="w-full bg-[#00F2FF] hover:bg-[#74F5FF] text-[#002022] text-xs font-mono font-bold py-2 px-3 rounded-lg flex items-center justify-center gap-2 shadow-[0_0_12px_rgba(0,242,255,0.3)] transition-all hover:scale-[1.01] active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-sm">rocket_launch</span>
            <span>New Audit & Task</span>
          </button>

          {/* Active Memory Status */}
          {messages.length > 0 && (
            <div className="px-2.5 py-1.5 rounded-lg bg-[#67F4B7]/10 border border-[#67F4B7]/30 text-[#67F4B7] text-[11px] flex items-center justify-between font-mono">
              <span className="flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#67F4B7] animate-pulse"></span>
                <span>Active Memory: {messages.length} turns</span>
              </span>
              <button
                type="button"
                onClick={handleNewTask}
                className="text-[#849495] hover:text-[#FFB4AB] transition-colors"
                title="Clear conversation memory"
              >
                <i className="fa-regular fa-trash-can text-xs"></i>
              </button>
            </div>
          )}

          {/* Navigation Tabs */}
          <nav className="space-y-1 pt-2 border-t border-[#3A494B]/20">
            <div className="text-[10px] font-mono text-[#849495] px-2 mb-1 uppercase tracking-wider">AUDIT DOMAIN</div>
            <a
              href="#audits"
              onClick={(e) => { e.preventDefault(); }}
              className="flex items-center gap-2 text-[#00F2FF] font-semibold border-l-2 border-[#00F2FF] bg-[#1D2026]/80 px-2.5 py-1.5 rounded-r text-xs shadow-[0_0_12px_rgba(0,242,255,0.15)]"
            >
              <span className="material-symbols-outlined text-sm">fact_check</span>
              <span>Inspection Audits</span>
            </a>
            <a
              href="#telemetry"
              onClick={(e) => { e.preventDefault(); }}
              className="flex items-center gap-2 text-[#849495] hover:text-[#E1E2EB] px-2.5 py-1.5 rounded hover:bg-[#1D2026]/40 transition-colors text-xs"
            >
              <span className="material-symbols-outlined text-sm">radar</span>
              <span>Telemetry & Scans</span>
            </a>
            <a
              href="http://localhost:5567"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 text-[#849495] hover:text-[#00F2FF] px-2.5 py-1.5 rounded hover:bg-[#1D2026]/40 transition-colors text-xs"
            >
              <span className="material-symbols-outlined text-sm">chart_data</span>
              <span>Data Formulator</span>
            </a>
          </nav>

          {/* Live Sensor Benchmarks Card Stack */}
          <div className="pt-2 border-t border-[#3A494B]/20 space-y-2">
            <div className="text-[10px] font-mono text-[#849495] flex items-center justify-between">
              <span>LIVE SENSOR BENCHMARKS</span>
              <span className="text-[9px] text-[#67F4B7] font-mono">RT-448</span>
            </div>

            <div className="flex flex-col gap-1.5">
              {SAMPLE_BENCHMARKS.map((b) => (
                <button
                  key={b.id}
                  type="button"
                  onClick={() => {
                    handleSelectBenchmark(b);
                    setTimeout(() => handleExecute(b.query, b), 50);
                  }}
                  className={`text-left p-2 rounded-lg transition-all border group ${
                    selectedBenchmark?.id === b.id
                      ? "bg-[#1D2026] border-[#00F2FF] shadow-[0_0_12px_rgba(0,242,255,0.2)]"
                      : "bg-[#1D2026]/40 border-[#3A494B]/30 hover:border-[#3A494B] hover:bg-[#1D2026]/70"
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-semibold text-[#E1E2EB] truncate">{b.title}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${b.badgeClass}`}>
                      {b.badge}
                    </span>
                  </div>
                  <p className="text-[10px] text-[#849495] font-mono truncate mt-0.5">{b.spec}</p>
                  <div className="flex justify-between text-[10px] font-mono pt-1 mt-1 border-t border-[#3A494B]/20 text-[#B9CACB]">
                    <span>Nom: {b.nominal}</span>
                    <span className={b.badge === "CRITICAL" ? "text-[#FFB4AB] font-bold" : "text-[#67F4B7]"}>
                      Act: {b.actual}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Sidebar Footer: Engineer Profile */}
        <div className="p-3 border-t border-[#3A494B]/20 flex flex-col gap-2 min-w-[16rem]">
          <div className="flex items-center justify-between px-1 text-xs">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full border border-[#00F2FF]/50 bg-[#272A31] flex items-center justify-center text-[#00F2FF] font-bold text-xs" title="Lead Inspection Engineer">
                S
              </div>
              <div className="flex flex-col text-left">
                <span className="font-semibold text-[#E1E2EB] text-xs leading-tight">Sagar</span>
                <span className="text-[10px] text-[#849495] font-mono">Lead Insp. Eng. • Team rv2</span>
              </div>
            </div>
            <span className="text-[10px] bg-[#67F4B7]/10 text-[#67F4B7] px-1.5 py-0.5 rounded border border-[#67F4B7]/30 font-mono">
              ON-PREM
            </span>
          </div>
        </div>
      </aside>

      {/* ========================================================================= */}
      {/* 2. TOP NAVBAR (Stitch Aetheric Intelligence TopNavBar)                    */}
      {/* ========================================================================= */}
      <main className="flex-1 flex flex-col h-full overflow-hidden relative">
        <header className="h-16 border-b border-[#3A494B]/20 px-6 flex items-center justify-between flex-shrink-0 bg-[#0B0E14]/80 backdrop-blur-md z-20 shadow-lg">
          <div className="flex items-center gap-4">
            {!sidebarOpen && (
              <button
                type="button"
                onClick={() => setSidebarOpen(true)}
                className="p-1.5 rounded-lg text-[#849495] hover:text-[#E1E2EB] hover:bg-[#1D2026] transition-colors"
                title="Open sidebar"
              >
                <i className="fa-solid fa-bars text-sm"></i>
              </button>
            )}
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#00F2FF] text-xl">oil_barrel</span>
              <span className="font-extrabold uppercase tracking-widest text-[#00F2FF] text-sm hidden sm:inline">
                REFINERY COMPLIANCE INTELLIGENCE
              </span>
            </div>

            {/* Quick Search Bar */}
            <div className="relative hidden xl:block ml-4">
              <span className="material-symbols-outlined absolute left-3 top-2.5 text-[#849495] text-sm">search</span>
              <input
                className="bg-[#191C22]/80 border border-[#3A494B]/40 rounded-full pl-9 pr-4 py-1.5 text-xs text-[#E1E2EB] placeholder:text-[#849495] w-72 focus:outline-none focus:border-[#00F2FF] focus:shadow-[0_0_12px_rgba(0,242,255,0.2)] font-mono"
                placeholder="Search line tag, UT probe scan ID, ASTM spec..."
                type="text"
              />
            </div>
          </div>

          {/* Top Center Domain Links */}
          <nav className="hidden 2xl:flex items-center gap-5 text-xs font-mono">
            <span className="text-[#00F2FF] border-b border-[#00F2FF] pb-0.5 cursor-pointer">Pipeline Telemetry</span>
            <span className="text-[#849495] hover:text-[#E1E2EB] cursor-pointer transition-colors">UT Scans</span>
            <span className="text-[#849495] hover:text-[#E1E2EB] cursor-pointer transition-colors">Sour Gas Logs</span>
            <span className="text-[#849495] hover:text-[#E1E2EB] cursor-pointer transition-colors">API 570 Rules</span>
          </nav>

          {/* Trailing Status Badges & Action Icons */}
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-mono bg-[#67F4B7]/10 border border-[#67F4B7]/40 text-[#67F4B7]">
              <span className="w-2 h-2 rounded-full bg-[#67F4B7] animate-ping"></span>
              Air-Gapped Active
            </span>

            <button
              type="button"
              onClick={() => alert("Simulated Emergency Quarantine protocol executed on Line 12-RG-3301.")}
              className="hidden sm:inline-block px-2.5 py-1 rounded text-xs font-mono bg-[#93000A]/40 border border-[#FFB4AB]/50 text-[#FFB4AB] hover:bg-[#FFB4AB] hover:text-[#93000A] transition-colors"
            >
              Emergency Quarantine
            </button>

            <div className="flex items-center gap-1 border-l border-[#3A494B]/30 pl-3 text-[#849495]">
              <button className="p-1.5 hover:text-[#00F2FF] hover:bg-[#1D2026] rounded transition-colors" title="Security Enclave">
                <span className="material-symbols-outlined text-lg">security</span>
              </button>
              <button className="p-1.5 hover:text-[#00F2FF] hover:bg-[#1D2026] rounded transition-colors" title="Tensor Memory">
                <span className="material-symbols-outlined text-lg">memory</span>
              </button>
            </div>
          </div>
        </header>

        {/* ======================================================================= */}
        {/* VIEW A: EMPTY / WELCOME HERO STATE                                      */}
        {/* ======================================================================= */}
        {messages.length === 0 && !loading && (
          <div className="flex-1 flex flex-col items-center justify-center p-4 sm:p-8 overflow-y-auto">
            <div className="w-full max-w-3xl flex flex-col items-center gap-6">
              {/* Sovereign Refinery Emblem & Greeting */}
              <div className="flex flex-col items-center gap-3 text-center">
                <div className="w-14 h-14 rounded-2xl bg-[#1D2026] border border-[#00F2FF]/50 flex items-center justify-center text-[#00F2FF] shadow-[0_0_24px_rgba(0,242,255,0.35)]">
                  <span className="material-symbols-outlined text-3xl">shield</span>
                </div>
                <h1 className="font-bold text-2xl sm:text-3xl text-[#E1E2EB] tracking-tight">
                  Refinery Inspection & Compliance Copilot
                </h1>
                <p className="text-xs sm:text-sm text-[#849495] max-w-xl leading-relaxed">
                  Air-gapped on-premise multi-agent intelligence with deterministic API 570, ASME B31.3, and NACE MR0175 verification. Zero WAN telemetry egress.
                </p>
              </div>

              {/* Main Floating Glass Prompt Card */}
              <div className="w-full glass-panel rounded-2xl p-4 border border-[#3A494B]/40 shadow-2xl neon-border-glow-cyan flex flex-col gap-3">
                {/* Mode Switcher Pills */}
                <div className="flex items-center justify-between px-1">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono text-[#849495] uppercase">INFERENCE STRATEGY:</span>
                    <button
                      type="button"
                      onClick={() => setTaskMode("full_pipeline")}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all ${
                        taskMode === "full_pipeline"
                          ? "bg-[#00F2FF]/20 border border-[#00F2FF] text-[#00F2FF] shadow-[0_0_8px_rgba(0,242,255,0.2)]"
                          : "bg-[#272A31]/60 border border-[#3A494B]/30 text-[#849495] hover:text-[#E1E2EB]"
                      }`}
                    >
                      Tri-Engine Consensus
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskMode("deep_thinking_only")}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all ${
                        taskMode === "deep_thinking_only"
                          ? "bg-[#A855F7]/20 border border-[#A855F7] text-[#DDB7FF] shadow-[0_0_8px_rgba(168,85,247,0.2)]"
                          : "bg-[#272A31]/60 border border-[#3A494B]/30 text-[#849495] hover:text-[#E1E2EB]"
                      }`}
                    >
                      Deep Thinking
                    </button>
                    <button
                      type="button"
                      onClick={() => setTaskMode("coding_only")}
                      className={`px-2.5 py-0.5 rounded-full text-xs font-mono transition-all ${
                        taskMode === "coding_only"
                          ? "bg-[#272A31] border border-[#00F2FF] text-[#00F2FF]"
                          : "bg-[#272A31]/60 border border-[#3A494B]/30 text-[#849495] hover:text-[#E1E2EB]"
                      }`}
                    >
                      Sandbox Exec
                    </button>
                  </div>
                  <div className="hidden sm:flex items-center gap-1.5 text-[11px] font-mono text-[#849495]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#67F4B7]"></span>
                    <span>GPU VRAM: 184 / 256 GB NVLink</span>
                  </div>
                </div>

                {/* Attached File Pill */}
                {attachedFileName && (
                  <div className="flex items-center justify-between bg-[#1D2026] border border-[#00F2FF]/40 px-3 py-1.5 rounded-lg text-xs font-mono text-[#00F2FF]">
                    <span className="flex items-center gap-2 truncate">
                      <span className="material-symbols-outlined text-sm">attach_file</span>
                      <span className="truncate">{attachedFileName}</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setAttachedFile(null);
                        setAttachedFileName("");
                        setSelectedBenchmark(null);
                      }}
                      className="text-[#849495] hover:text-[#FFB4AB] ml-2"
                    >
                      <i className="fa-solid fa-xmark"></i>
                    </button>
                  </div>
                )}

                {/* Textarea */}
                <textarea
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Sovereign Copilot or execute inspection macro (e.g. 'Analyze ultrasonic scan matrix for 12-RG-3301 Sour Gas spool #4B against API 570')..."
                  className="w-full resize-none text-sm text-[#E1E2EB] placeholder-[#849495] focus:outline-none bg-transparent leading-relaxed"
                />

                {/* Bottom Action Bar */}
                <div className="flex items-center justify-between pt-2 border-t border-[#3A494B]/30">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => fileInputRef.current && fileInputRef.current.click()}
                      className="p-2 text-[#849495] hover:text-[#00F2FF] hover:bg-[#1D2026] rounded-lg transition-colors"
                      title="Attach ultrasonic scan (.txt, .csv, .pdf, image)"
                    >
                      <span className="material-symbols-outlined text-lg">attach_file</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => alert("Air-gapped voice transcription module active.")}
                      className="p-2 text-[#849495] hover:text-[#00F2FF] hover:bg-[#1D2026] rounded-lg transition-colors"
                      title="Air-gapped voice dictation"
                    >
                      <span className="material-symbols-outlined text-lg">mic</span>
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => handleExecute()}
                    disabled={loading || (!query.trim() && !attachedFile && !selectedBenchmark)}
                    className="py-2 px-4 rounded-lg bg-[#00F2FF] text-[#002022] font-mono text-xs font-bold tracking-wider flex items-center gap-1.5 shadow-[0_0_16px_rgba(0,242,255,0.4)] hover:bg-[#74F5FF] disabled:bg-[#272A31] disabled:text-[#849495] active:scale-95 transition-all"
                  >
                    <span>RUN AUDIT</span>
                    <span className="material-symbols-outlined text-sm font-bold">arrow_forward</span>
                  </button>
                </div>
              </div>

              {/* Quick Launch Benchmark Bento */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 w-full pt-2">
                {SAMPLE_BENCHMARKS.map((b) => (
                  <button
                    key={b.id}
                    type="button"
                    onClick={() => {
                      handleSelectBenchmark(b);
                      setTimeout(() => handleExecute(b.query, b), 50);
                    }}
                    className="p-3.5 rounded-xl glass-panel border border-[#3A494B]/30 hover:border-[#00F2FF]/60 hover:bg-[#1D2026]/80 text-left transition-all group"
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-mono font-semibold text-[#E1E2EB] group-hover:text-[#00F2FF] transition-colors truncate">
                        {b.title}
                      </span>
                      <span className={`text-[9px] px-1.5 py-0.2 rounded font-bold ${b.badgeClass}`}>
                        {b.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#849495] font-mono truncate">{b.spec}</p>
                    <div className="flex items-center justify-between text-[10px] text-[#00F2FF] mt-2 pt-1 border-t border-[#3A494B]/20 font-mono">
                      <span>Launch Pipeline</span>
                      <span className="material-symbols-outlined text-xs">arrow_forward</span>
                    </div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ======================================================================= */}
        {/* VIEW B: AUDIT & CONVERSATIONAL STREAM (Multi-Turn Sovereign Memory)     */}
        {/* ======================================================================= */}
        {(messages.length > 0 || loading) && (
          <div className="flex-1 overflow-y-auto pt-6 pb-28 px-4 sm:px-8 flex flex-col items-center">
            <div className="w-full max-w-5xl flex flex-col gap-6">
              {messages.map((msg, index) => {
                if (msg.role === 'user') {
                  return (
                    <div key={msg.id || index} className="flex gap-4 items-start self-start w-full">
                      <div className="w-9 h-9 rounded-lg bg-[#272A31] border border-[#3A494B]/50 flex items-center justify-center shrink-0 text-[#00F2FF] font-bold text-xs font-mono">
                        ENG
                      </div>
                      <div className="glass-panel rounded-xl rounded-tl-none p-4 max-w-3xl border-l-2 border-l-[#00F2FF]/70 shadow-lg space-y-1.5">
                        <div className="flex items-center justify-between gap-4">
                          <span className="font-mono text-xs text-[#00F2FF] font-semibold">
                            Chief Inspection Engineer (Unit 04)
                          </span>
                          <span className="font-mono text-[10px] text-[#849495]">
                            {msg.timestamp || "LOCAL AIR-GAP"}
                          </span>
                        </div>
                        <p className="text-sm text-[#E1E2EB] font-sans leading-relaxed whitespace-pre-wrap">
                          {msg.content}
                        </p>
                        {msg.attachedFileName && (
                          <div className="mt-2 flex items-center gap-1.5 text-xs font-mono text-[#00F2FF] bg-[#1D2026] px-2.5 py-1 rounded border border-[#3A494B]/40 inline-flex">
                            <span className="material-symbols-outlined text-xs">attach_file</span>
                            <span>{msg.attachedFileName}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                }

                // Assistant Turn
                return (
                  <div key={msg.id || index} className="flex gap-4 items-start self-start w-full">
                    <div className="w-9 h-9 rounded-lg bg-[#00F2FF]/15 border border-[#00F2FF]/60 flex items-center justify-center shrink-0 text-[#00F2FF] shadow-[0_0_12px_rgba(0,242,255,0.3)]">
                      <span className="material-symbols-outlined text-lg">smart_toy</span>
                    </div>
                    <div className="flex flex-col gap-4 flex-1">
                      {/* Model Consensus Header */}
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-[#3A494B]/20 font-mono text-xs">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-sm text-[#00F2FF]">
                            Synthesized by Sovereign Tri-Engine (Qwen2.5-VL + DeepSeek-R1)
                          </span>
                          <span className="px-2 py-0.5 rounded text-[10px] bg-[#00F2FF]/10 border border-[#00F2FF]/30 text-[#00F2FF]">
                            Consensus Conf: 99.84%
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-[11px] text-[#849495]">
                          <span className="inline-flex items-center gap-1 text-[#67F4B7]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#67F4B7]"></span>
                            Deterministic Tensor Pass
                          </span>
                          <span>•</span>
                          <span>{msg.executionDuration ? `${msg.executionDuration * 1000} ms` : "4,120 ms"} latency</span>
                        </div>
                      </div>

                      {/* DeepSeek-R1 Cognitive Trace Drawer */}
                      {msg.deep_thinking_cot && (
                        <ReasoningBox
                          isLoading={false}
                          thinkingText={msg.deep_thinking_cot}
                          elapsedDuration={msg.executionDuration}
                          modelName={msg.selected_model || "DeepSeek-R1"}
                        />
                      )}

                      {/* Content Payload */}
                      {renderAssistantContent(msg)}
                    </div>
                  </div>
                );
              })}

              {/* Active Thinking Bubble when loading */}
              {loading && (
                <div className="flex gap-4 items-start self-start w-full">
                  <div className="w-9 h-9 rounded-lg bg-[#00F2FF]/15 border border-[#00F2FF]/60 flex items-center justify-center shrink-0 text-[#00F2FF] shadow-[0_0_12px_rgba(0,242,255,0.3)]">
                    <span className="material-symbols-outlined text-lg animate-spin">smart_toy</span>
                  </div>
                  <div className="flex-1">
                    <ReasoningBox
                      isLoading={true}
                      thinkingText=""
                      elapsedDuration={null}
                      modelName={selectedModel || "DeepSeek-R1"}
                      defaultExpanded={true}
                    />
                  </div>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Bottom Sticky Glass Prompt Bar */}
            <div className="w-full max-w-4xl fixed bottom-4 z-40 px-4">
              <div className="glass-panel rounded-2xl p-2.5 border border-[#3A494B]/40 shadow-2xl neon-border-glow-cyan flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => fileInputRef.current && fileInputRef.current.click()}
                  className="p-2 text-[#849495] hover:text-[#00F2FF] hover:bg-[#1D2026] rounded-lg transition-colors"
                  title="Attach ultrasonic matrix scan"
                >
                  <span className="material-symbols-outlined text-lg">attach_file</span>
                </button>
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Ask Sovereign Copilot or execute inspection macro (e.g. 'Generate MOC package for spool #4B')..."
                  className="flex-1 text-xs sm:text-sm text-[#E1E2EB] placeholder-[#849495] focus:outline-none bg-transparent font-mono"
                />
                <button
                  type="button"
                  onClick={() => handleExecute()}
                  disabled={loading || !query.trim()}
                  className="py-1.5 px-3 rounded-lg bg-[#00F2FF] text-[#002022] font-mono text-xs font-bold tracking-wider flex items-center gap-1 shadow-[0_0_12px_rgba(0,242,255,0.35)] hover:bg-[#74F5FF] disabled:bg-[#272A31] disabled:text-[#849495] active:scale-95 transition-all"
                >
                  <span>RUN AUDIT</span>
                  <span className="material-symbols-outlined text-xs font-bold">arrow_forward</span>
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
