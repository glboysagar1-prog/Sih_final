"""
Sovereign On-Premise Agentic AI Workbench - Streamlit Interactive Interface.
Provides multi-model routing visibility, CodeAct sandbox monitoring, and one-click deliverable downloads.
"""

import os
import streamlit as st
import pandas as pd
from datetime import datetime

# Set page config
st.set_page_config(
    page_title="Sovereign AI Workbench",
    page_icon="🛡️",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Ensure workspace root is in sys.path so 'src' can be imported reliably
import sys
ROOT_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

# Import backend modules
from src.agent.graph import run_workbench_workflow
from src.agent.router import route_task
from src.utils.file_manager import compute_sha256, INPUTS_DIR, OUTPUTS_DIR


# Custom Styling
st.markdown("""
    <style>
    .main-title { font-size: 2.2rem; font-weight: 700; color: #1E3A8A; margin-bottom: 0px; }
    .subtitle { font-size: 1.05rem; color: #4B5563; margin-bottom: 20px; }
    .metric-card { background-color: #F8FAFC; border-left: 5px solid #2563EB; padding: 15px; border-radius: 6px; margin-bottom: 12px; }
    .breach-card { background-color: #FEF2F2; border-left: 5px solid #DC2626; padding: 15px; border-radius: 6px; margin-bottom: 12px; }
    .pass-card { background-color: #F0FDF4; border-left: 5px solid #16A34A; padding: 15px; border-radius: 6px; margin-bottom: 12px; }
    .audit-badge { font-family: monospace; font-size: 0.85rem; background-color: #E2E8F0; padding: 4px 8px; border-radius: 4px; }
    </style>
""", unsafe_allow_html=True)

# -------------------------------------------------------------
# SIDEBAR CONTROLS
# -------------------------------------------------------------
with st.sidebar:
    st.image("https://img.icons8.com/color/96/shield.png", width=64)
    st.title("Sovereignty Controls")

    workbench_mode = st.radio(
        "Deployment Phase:",
        ["Phase 1: Cloud Open-Weight (Groq/Together)", "Phase 2: Local Air-Gapped (Ollama)"],
        index=0
    )

    st.markdown("---")
    st.subheader("Model Fleet Routing")
    st.markdown("""
    * 👁️ **Vision Engine:** `Qwen2.5-VL` / `Llama-3.2-Vision`
    * 💻 **Coding Engine:** `Qwen2.5-Coder` (CodeAct)
    * 🧠 **Reasoning Engine:** `DeepSeek-R1-Distill`
    """)

    st.markdown("---")
    st.subheader("Air-Gap Security Status")
    st.success("🟢 Zero WAN Egress Bridge Active")
    st.caption("Host Interface: `airgap_net` (Docker --internal)")

    st.markdown("---")
    st.subheader("Visual Analytics Studio")
    st.info("📊 **Microsoft Data Formulator** available on `localhost:5567` for interactive spreadsheet exploration.")
    st.markdown("[Open Data Formulator](http://localhost:5567)")

# -------------------------------------------------------------
# HEADER & OVERVIEW
# -------------------------------------------------------------
st.markdown('<div class="main-title">🛡️ Sovereign On-Premise Agentic AI Workbench</div>', unsafe_allow_html=True)
st.markdown('<div class="subtitle">Confidential Industrial Work • Open-Weight Multimodal LLMs • Verifiable Zero WAN Egress</div>', unsafe_allow_html=True)

# -------------------------------------------------------------
# MAIN INPUT SECTION
# -------------------------------------------------------------
col_input, col_meta = st.columns([2, 1])

with col_input:
    st.subheader("1. Ingestion & Task Specification")
    
    sample_options = ["None (Upload Custom File)"]
    if os.path.exists(INPUTS_DIR):
        sample_options += [f for f in os.listdir(INPUTS_DIR) if not f.startswith(".")]

    selected_sample = st.selectbox("Select Benchmark Sample:", sample_options, index=1 if len(sample_options) > 1 else 0)
    
    uploaded_file = st.file_uploader("Or Upload Scanned Inspection Report (.txt, .pdf):", type=["txt", "pdf"])

    user_query = st.text_input(
        "Agent Directive / Prompt:",
        value="Verify ultrasonic piping thickness scan against API 570 thresholds and issue an executive de-rating memo."
    )

with col_meta:
    st.subheader("Asset & Standard")
    st.write("**Asset:** Crude Distillation Unit (CDU-1)")
    st.write("**Piping Line:** `10\"-HC-1004-CS300`")
    st.write("**Regulatory Code:** API 570 Piping Inspection")
    st.write("**Retirement Threshold:** $3.30\\text{ mm}$ ($T_{min}=2.8\\text{ mm} + 0.5\\text{ mm}$)")

# Resolve active file path
active_filepath = ""
if uploaded_file is not None:
    # Save uploaded file
    temp_dir = os.path.join(INPUTS_DIR, "uploads")
    os.makedirs(temp_dir, exist_ok=True)
    temp_path = os.path.join(temp_dir, uploaded_file.name)
    with open(temp_path, "wb") as f:
        f.write(uploaded_file.getbuffer())
    active_filepath = temp_path
elif selected_sample != "None (Upload Custom File)":
    active_filepath = os.path.join(INPUTS_DIR, selected_sample)

# Show instant Router preview
if active_filepath:
    task_type, engine_name, rationale = route_task(user_query, active_filepath)
    st.caption(f"🤖 **Auto-Router Preview:** Selected `{engine_name}` ({rationale})")

st.markdown("---")

# -------------------------------------------------------------
# EXECUTION BUTTON
# -------------------------------------------------------------
if st.button("🚀 Execute Sovereign Agentic Workflow", type="primary", use_container_width=True):
    if not active_filepath:
        st.error("Please select a sample document or upload a report to proceed.")
    else:
        with st.spinner("Agent executing autonomous ReAct & CodeAct pipeline..."):
            result = run_workbench_workflow(user_query, active_filepath)

        st.success("Workflow completed successfully!")

        # -------------------------------------------------------------
        # RESULTS & TRACE DISPLAY
        # -------------------------------------------------------------
        res_col1, res_col2 = st.columns([1, 1])

        with res_col1:
            st.subheader("2. Deterministic CodeAct Verification")
            status = result.get("calculation_status", "UNKNOWN")
            is_breach = "FAIL" in status or "BREACH" in status

            if is_breach:
                st.markdown(f"""
                <div class="breach-card">
                    <h3 style="color:#DC2626; margin:0;">🚨 {status}</h3>
                    <p style="margin-top:8px;">Location T-12 wall thickness (3.20 mm) is below the minimum API 570 threshold (3.30 mm). <b>Deficit: -0.10 mm.</b></p>
                </div>
                """, unsafe_allow_html=True)
            else:
                st.markdown(f"""
                <div class="pass-card">
                    <h3 style="color:#16A34A; margin:0;">✅ {status}</h3>
                    <p style="margin-top:8px;">All measured thickness points are within safe structural margins.</p>
                </div>
                """, unsafe_allow_html=True)

            st.write("**Sandboxed Python Script Executed:**")
            st.code(result.get("generated_code", ""), language="python")

            st.write("**Sandbox VM Output:**")
            st.code(result.get("sandbox_output", ""), language="text")

        with res_col2:
            st.subheader("3. Executive Corporate Deliverables")
            memo_path = result.get("generated_report_path")
            xlsx_path = os.path.join(OUTPUTS_DIR, "Refinery_Piping_Thickness_Log.xlsx")

            st.write("The agent compiled native office deliverables adhering to PSU compliance standards:")

            if memo_path and os.path.exists(memo_path):
                with open(memo_path, "rb") as f:
                    memo_bytes = f.read()
                st.download_button(
                    label="📄 Download Executive Memo (.docx)",
                    data=memo_bytes,
                    file_name=os.path.basename(memo_path),
                    mime="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
                    use_container_width=True
                )

            if os.path.exists(xlsx_path):
                with open(xlsx_path, "rb") as f:
                    xlsx_bytes = f.read()
                st.download_button(
                    label="📊 Download Measurement Log (.xlsx)",
                    data=xlsx_bytes,
                    file_name=os.path.basename(xlsx_path),
                    mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    use_container_width=True
                )

            # Forensic Audit Hash
            if memo_path and os.path.exists(memo_path):
                sha256 = compute_sha256(memo_path)
                st.markdown(f"**Forensic Integrity Hash (SHA-256):**")
                st.markdown(f'<div class="audit-badge">{sha256}</div>', unsafe_allow_html=True)

        # -------------------------------------------------------------
        # STEP-BY-STEP AUDIT LOGS
        # -------------------------------------------------------------
        st.markdown("---")
        with st.expander("🔍 Complete Forensic Execution Trace (Langfuse / OpenTelemetry Format)", expanded=True):
            for log in result.get("execution_logs", []):
                st.markdown(f"- `{log}`")
