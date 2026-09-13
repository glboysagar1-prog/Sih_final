"""
Dynamic Task Classifier & Model Router for Sovereign Agentic AI Workbench.
Autonomously dispatches heterogeneous tasks to specialized open-weight models.
Supports 2-stage classification: Stage 1 (Fast Rule Heuristics) -> Stage 2 (LLM Fallback).
"""

import json
from typing import Dict, Any, Tuple, Optional

# Official Model Registry as defined in Section 4.2 of Build Brief
MODEL_REGISTRY: Dict[str, Dict[str, Any]] = {
    "coding": {
        "model": "qwen2.5-coder-7b",
        "endpoint": "http://vllm:8001",
        "cloud_model": "groq/qwen/qwen3.8-27b",
        "engine_alias": "coding-engine",
        "rationale": "High-precision deterministic Python code generation and mathematical verification."
    },
    "document_qa": {
        "model": "qwen3-8b",
        "endpoint": "http://vllm:8002",
        "cloud_model": "groq/qwen/qwen3.6-27b",
        "engine_alias": "reasoning-engine",
        "rationale": "Grounded document analysis, compliance checks, and regulatory QA."
    },
    "vision_document": {
        "model": "qwen2.5-vl-7b",
        "endpoint": "http://vllm:8003",
        "cloud_model": "groq/qwen/qwen3.8-27b",
        "engine_alias": "vision-engine",
        "rationale": "Multimodal visual parsing for engineering drawings, P&IDs, and scanned forms."
    },
    "general_reasoning": {
        "model": "qwen3-8b",
        "endpoint": "http://vllm:8002",
        "cloud_model": "groq/qwen/qwen3.6-27b",
        "engine_alias": "reasoning-engine",
        "rationale": "General reasoning, multi-step synthesis, and executive briefing drafting."
    }
}

def classify_stage1_rules(user_query: str, file_path: str = "") -> Optional[Tuple[str, str]]:
    """
    Stage 1: Fast deterministic rule-based heuristic classification.
    Returns (task_type, rationale) or None if inconclusive.
    """
    query_lower = (user_query or "").lower()
    file_lower = (file_path or "").lower()

    # Rule 1: Visual / Multimodal files or keywords
    visual_extensions = [".png", ".jpg", ".jpeg", ".tiff", ".bmp", ".pdf"]
    visual_keywords = ["scan", "drawing", "p&id", "image", "schematic", "visual", "ocr", "layout", "diagram"]
    if any(file_lower.endswith(ext) for ext in visual_extensions) or any(k in query_lower for k in visual_keywords):
        return ("vision_document", "Stage 1 Rule: Visual extension or diagram/scan keywords detected.")

    # Rule 2: Code files or computational keywords
    code_extensions = [".py", ".csv", ".json", ".sql", ".sh", ".ts", ".js"]
    code_keywords = ["code", "calculate", "math", "verify", "formula", "python", "deficit", "thickness", "simulation", "equation"]
    if any(file_lower.endswith(ext) for ext in code_extensions) or any(k in query_lower for k in code_keywords):
        return ("coding", "Stage 1 Rule: Code/data extension or computational keywords detected.")

    # Rule 3: Document QA / Regulatory keywords
    doc_keywords = ["memo", "policy", "standard", "compliance", "executive", "board", "sop", "draft", "clause", "summarize", "approval note", "qa"]
    if any(k in query_lower for k in doc_keywords):
        return ("document_qa", "Stage 1 Rule: Regulatory, policy, or memo drafting keywords detected.")

    return None

def classify_two_stage(user_query: str, file_path: str = "") -> Tuple[str, Dict[str, Any], str]:
    """
    Two-Stage Task Classifier:
    1. Stage 1: Deterministic rules (file extensions + keyword heuristics).
    2. Stage 2: Small LLM fallback with strict JSON schema if Stage 1 is inconclusive.
    Returns: (task_type, model_config, rationale)
    """
    # Stage 1: Rule-based
    rule_match = classify_stage1_rules(user_query, file_path)
    if rule_match:
        task_type, rationale = rule_match
        config = MODEL_REGISTRY.get(task_type, MODEL_REGISTRY["general_reasoning"])
        return task_type, config, rationale

    # Stage 2: Fallback to LLM classifier or general reasoning
    try:
        from src.agent.llm_client import llm_gateway
        prompt = (
            f"Classify the following request into exactly ONE task type: 'coding', 'document_qa', 'vision_document', or 'general_reasoning'.\n"
            f"Request: \"{user_query}\"\n"
            f"Respond ONLY with valid JSON: {{\"task_type\": \"<type>\", \"rationale\": \"<short reason>\"}}"
        )
        response_text = llm_gateway.call_model("reasoning-engine", prompt, temperature=0.0)
        # Parse JSON
        if "{" in response_text and "}" in response_text:
            json_str = response_text[response_text.find("{"):response_text.rfind("}") + 1]
            data = json.loads(json_str)
            tt = data.get("task_type", "general_reasoning")
            if tt in MODEL_REGISTRY:
                return tt, MODEL_REGISTRY[tt], f"Stage 2 LLM Fallback: {data.get('rationale', 'Classified via LLM')}"
    except Exception:
        pass

    # Default fallback
    default_type = "general_reasoning"
    return default_type, MODEL_REGISTRY[default_type], "Defaulted to general reasoning engine for multi-step agentic execution."

def route_task(user_query: str, file_path: str = "") -> Tuple[str, str, str]:
    """
    Backwards-compatible router function for existing tests and endpoints.
    Returns: (task_type, engine_name, rationale)
    """
    task_type, config, rationale = classify_two_stage(user_query, file_path)
    
    # Map back to legacy names if needed
    legacy_type_map = {
        "vision_document": "vision",
        "coding": "coding",
        "document_qa": "reasoning",
        "general_reasoning": "general"
    }
    legacy_task_type = legacy_type_map.get(task_type, "general")
    engine_name = config.get("engine_alias", "coding-engine")
    
    return legacy_task_type, engine_name, rationale

