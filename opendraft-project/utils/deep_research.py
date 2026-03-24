#!/usr/bin/env python3
"""
ABOUTME: Autonomous deep research planner with seed reference expansion
ABOUTME: Two-phase approach: planning (Gemini) → execution (orchestrator)
"""

import re
import json
import logging
from typing import Tuple

# Gemini finish_reason codes
# 1 = STOP (normal), 2 = SAFETY, 3 = MAX_TOKENS, 4 = RECITATION
SAFETY_BLOCKED = 2

def safe_get_response_text(response) -> Tuple[str, bool]:
    """
    Safely extract text from Gemini response, handling safety blocks.
    
    Returns:
        (text, was_blocked) - text content and whether safety filter triggered
    """
    try:
        # Check if response has candidates
        if not response.candidates:
            return "", True
        
        candidate = response.candidates[0]
        
        # Check finish_reason (2 = SAFETY block)
        if hasattr(candidate, 'finish_reason') and candidate.finish_reason == SAFETY_BLOCKED:
            return "", True
        
        # Try to get text
        return response.text.strip(), False
    except ValueError as e:
        # The response.text accessor raises ValueError on safety blocks
        if "finish_reason" in str(e):
            return "", True
        raise
import os
from typing import List, Dict, Any, Optional
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeoutError

try:
    import google.generativeai as genai
except ImportError:
    genai = None

from .citation_database import Citation

logger = logging.getLogger(__name__)

DEFAULT_RESEARCH_PLAN_TIMEOUT_SECONDS = 80
MIN_RESEARCH_PLAN_TIMEOUT_SECONDS = 10
MAX_RESEARCH_PLAN_TIMEOUT_SECONDS = 300


def _get_planning_timeout_seconds() -> int:
    """
    Read deep research planning timeout from environment.

    Env:
        DEEP_RESEARCH_PLANNING_TIMEOUT_SECONDS
    """
    raw = str(os.getenv('DEEP_RESEARCH_PLANNING_TIMEOUT_SECONDS', '') or '').strip()
    if not raw:
        return DEFAULT_RESEARCH_PLAN_TIMEOUT_SECONDS

    try:
        timeout_seconds = int(raw)
    except (TypeError, ValueError):
        logger.warning(
            "Invalid DEEP_RESEARCH_PLANNING_TIMEOUT_SECONDS=%r, fallback to %ss",
            raw,
            DEFAULT_RESEARCH_PLAN_TIMEOUT_SECONDS,
        )
        return DEFAULT_RESEARCH_PLAN_TIMEOUT_SECONDS

    if timeout_seconds < MIN_RESEARCH_PLAN_TIMEOUT_SECONDS:
        logger.warning(
            "DEEP_RESEARCH_PLANNING_TIMEOUT_SECONDS=%s too small, clamped to %ss",
            timeout_seconds,
            MIN_RESEARCH_PLAN_TIMEOUT_SECONDS,
        )
        return MIN_RESEARCH_PLAN_TIMEOUT_SECONDS

    if timeout_seconds > MAX_RESEARCH_PLAN_TIMEOUT_SECONDS:
        logger.warning(
            "DEEP_RESEARCH_PLANNING_TIMEOUT_SECONDS=%s too large, clamped to %ss",
            timeout_seconds,
            MAX_RESEARCH_PLAN_TIMEOUT_SECONDS,
        )
        return MAX_RESEARCH_PLAN_TIMEOUT_SECONDS

    return timeout_seconds


class DeepResearchPlanner:
    """
    Autonomous research planner for comprehensive literature reviews.

    Uses Gemini to create research strategy from seed references,
    then executes queries through citation orchestrator.

    Two-phase approach:
    1. Planning: Gemini autonomously plans research strategy
    2. Execution: Orchestrator runs planned queries through fallback chain

    Benefits:
    - 50+ sources vs 20-30 typical
    - Seed reference expansion
    - Autonomous gap identification
    - Systematic coverage
    """

    def __init__(
        self,
        gemini_model: Optional[Any] = None,
        api_key: Optional[str] = None,
        min_sources: int = 50,
        verbose: bool = True
    ):
        """
        Initialize deep research planner.

        Args:
            gemini_model: Gemini model for planning (optional, will create if None)
            api_key: Google API key (defaults to GOOGLE_API_KEY env var)
            min_sources: Minimum number of sources to research
            verbose: Print progress to console
        """
        self.min_sources = min_sources
        self.verbose = verbose

        # Initialize Gemini for planning
        if gemini_model:
            self.model = gemini_model
        else:
            if not genai:
                raise ImportError(
                    "google-generativeai not installed. "
                    "Run: pip install google-generativeai>=0.8.0"
                )

            api_key = api_key or os.getenv('GOOGLE_API_KEY')
            if not api_key:
                raise ValueError(
                    "GOOGLE_API_KEY not found. Set via environment variable or constructor."
                )

            genai.configure(api_key=api_key)
            # Use Gemini 3 Flash for research planning (supports JSON output mode)
            self.model = genai.GenerativeModel('gemini-3-flash-preview', tools=None)

    def create_research_plan(
        self,
        topic: str,
        scope: Optional[str] = None,
        seed_references: Optional[List[str]] = None
    ) -> Dict[str, Any]:
        """
        Create autonomous research plan with Gemini.

        Phase 1: Planning
        - Analyzes topic and scope
        - Expands from seed references
        - Identifies research queries
        - Creates structured outline

        Args:
            topic: Main research topic
            scope: Optional scope/constraints (e.g., "EU focus; B2C and B2B")
            seed_references: Optional list of anchor papers to expand from

        Returns:
            Dict with keys:
                - queries: List[str] - Research queries to execute
                - outline: str - Structured research outline
                - strategy: str - Research strategy description
        """
        if self.verbose:
            print(f"\n🔍 Creating deep research plan for: {topic}")
            if scope:
                print(f"   Scope: {scope}")

        # Build planning prompt
        prompt = self._build_planning_prompt(topic, scope, seed_references)

        try:
            # Call Gemini for autonomous planning with safety filter retry and timeout
            max_retries = 3
            current_topic = topic
            plan_text = None
            planning_timeout = _get_planning_timeout_seconds()
            
            # #region agent log
            import json as json_lib
            import time as time_lib
            try:
                debug_log_path = "/Users/federicodeponte/opendraft/.cursor/debug.log"
                with open(debug_log_path, "a") as f:
                    f.write(json_lib.dumps({
                        "timestamp": int(time_lib.time() * 1000),
                        "location": "deep_research.py:create_research_plan",
                        "message": "Starting research plan generation",
                        "data": {"topic": topic[:100], "timeout": planning_timeout},
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "A"
                    }) + "\n")
            except Exception:
                pass
            # #endregion
            
            for attempt in range(max_retries):
                try:
                    # Wrap API call in timeout to prevent 504 Deadline Exceeded
                    def _generate_with_timeout():
                        return self.model.generate_content(
                    self._build_planning_prompt(current_topic, scope, seed_references),
                    generation_config=genai.GenerationConfig(
                        temperature=0.3,  # Lower temperature for systematic planning
                        max_output_tokens=8192,
                        response_mime_type="application/json"  # Structured JSON output
                    )
                )
                
                    # Execute with timeout wrapper
                    with ThreadPoolExecutor(max_workers=1) as executor:
                        future = executor.submit(_generate_with_timeout)
                        try:
                            response = future.result(timeout=planning_timeout)
                        except FuturesTimeoutError:
                            logger.warning(f"Research plan generation timed out after {planning_timeout}s (attempt {attempt + 1}/{max_retries})")
                            # #region agent log
                            try:
                                with open(debug_log_path, "a") as f:
                                    f.write(json_lib.dumps({
                                        "timestamp": int(time_lib.time() * 1000),
                                        "location": "deep_research.py:create_research_plan",
                                        "message": "Research plan generation timeout",
                                        "data": {"attempt": attempt + 1, "timeout": planning_timeout},
                                        "sessionId": "debug-session",
                                        "runId": "run1",
                                        "hypothesisId": "A"
                                    }) + "\n")
                            except Exception:
                                pass
                            # #endregion
                            if attempt < max_retries - 1:
                                continue
                            else:
                                raise TimeoutError(f"Research plan generation timed out after {planning_timeout}s after {max_retries} attempts")
                    
                    # Safely extract response text
                    plan_text, was_blocked = safe_get_response_text(response)
                    
                    if not was_blocked and plan_text:
                        # #region agent log
                        try:
                            with open(debug_log_path, "a") as f:
                                f.write(json_lib.dumps({
                                    "timestamp": int(time_lib.time() * 1000),
                                    "location": "deep_research.py:create_research_plan",
                                    "message": "Research plan generated successfully",
                                    "data": {"attempt": attempt + 1, "plan_length": len(plan_text)},
                                    "sessionId": "debug-session",
                                    "runId": "run1",
                                    "hypothesisId": "A"
                                }) + "\n")
                        except Exception:
                            pass
                        # #endregion
                        break
                    
                    # Safety filter triggered - try rephrasing topic
                    if attempt < max_retries - 1:
                        logger.warning(f"Safety filter triggered for '{current_topic}', rephrasing (attempt {attempt + 1})")
                        current_topic = self._rephrase_topic_for_safety(topic)
                        if self.verbose:
                            print(f"   ⚠️ Safety filter triggered, retrying with: {current_topic}")
                except TimeoutError:
                    # Re-raise timeout errors
                    raise
                except Exception as e:
                    # Handle other exceptions (like DeadlineExceeded from gRPC)
                    if "DeadlineExceeded" in str(e) or "504" in str(e):
                        logger.warning(f"Research plan generation deadline exceeded (attempt {attempt + 1}/{max_retries}): {e}")
                        # #region agent log
                        try:
                            with open(debug_log_path, "a") as f:
                                f.write(json_lib.dumps({
                                    "timestamp": int(time_lib.time() * 1000),
                                    "location": "deep_research.py:create_research_plan",
                                    "message": "Deadline exceeded error",
                                    "data": {"attempt": attempt + 1, "error": str(e)[:200]},
                                    "sessionId": "debug-session",
                                    "runId": "run1",
                                    "hypothesisId": "A"
                                }) + "\n")
                        except Exception:
                            pass
                        # #endregion
                        if attempt < max_retries - 1:
                            continue
                        else:
                            raise TimeoutError(f"Research plan generation failed after {max_retries} attempts: {e}")
                    else:
                        # Re-raise other exceptions
                        raise
            
            if not plan_text:
                raise ValueError(f"Unable to generate research plan after {max_retries} attempts (safety filter)")

            # Parse JSON response (structured output should return valid JSON directly)
            try:
                plan = json.loads(plan_text.strip())
            except json.JSONDecodeError:
                # Fallback: robust extraction for edge cases
                plan = self._extract_json_from_response(plan_text)

            if self.verbose:
                print(f"   ✓ Plan created: {len(plan.get('queries', []))} research queries")

            return plan

        except (TimeoutError, FuturesTimeoutError) as e:
            logger.error(f"Research planning timed out: {e}")
            # #region agent log
            try:
                import json as json_lib
                import time as time_lib
                debug_log_path = "/Users/federicodeponte/opendraft/.cursor/debug.log"
                with open(debug_log_path, "a") as f:
                    f.write(json_lib.dumps({
                        "timestamp": int(time_lib.time() * 1000),
                        "location": "deep_research.py:create_research_plan",
                        "message": "Research planning timeout - raising exception",
                        "data": {"error": str(e)[:200]},
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "A"
                    }) + "\n")
            except Exception:
                pass
            # #endregion
            raise
        except Exception as e:
            logger.error(f"Research planning failed: {e}")
            # #region agent log
            try:
                import json as json_lib
                import time as time_lib
                debug_log_path = "/Users/federicodeponte/opendraft/.cursor/debug.log"
                with open(debug_log_path, "a") as f:
                    f.write(json_lib.dumps({
                        "timestamp": int(time_lib.time() * 1000),
                        "location": "deep_research.py:create_research_plan",
                        "message": "Research planning failed",
                        "data": {"error": str(e)[:200]},
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "A"
                    }) + "\n")
            except Exception:
                pass
            # #endregion
            raise

    def _extract_json_from_response(self, text: str) -> dict:
        """
        Robustly extract JSON from LLM response.

        Handles:
        - Markdown code blocks (```json ... ```)
        - Extra text before/after JSON
        - Common JSON syntax issues

        Args:
            text: Raw LLM response text

        Returns:
            Parsed JSON as dict

        Raises:
            json.JSONDecodeError: If no valid JSON found
        """
        # Strategy 1: Try direct parse first
        try:
            return json.loads(text.strip())
        except json.JSONDecodeError:
            pass

        # Strategy 2: Extract from markdown code blocks
        # Handle ```json ... ``` or ``` ... ```
        code_block_pattern = r'```(?:json)?\s*([\s\S]*?)```'
        matches = re.findall(code_block_pattern, text)
        for match in matches:
            try:
                return json.loads(match.strip())
            except json.JSONDecodeError:
                continue

        # Strategy 3: Find JSON object by matching braces
        # Find the first { and match to its closing }
        brace_depth = 0
        start_idx = None
        for i, char in enumerate(text):
            if char == '{':
                if brace_depth == 0:
                    start_idx = i
                brace_depth += 1
            elif char == '}':
                brace_depth -= 1
                if brace_depth == 0 and start_idx is not None:
                    json_str = text[start_idx:i+1]
                    try:
                        return json.loads(json_str)
                    except json.JSONDecodeError:
                        # Try to repair common issues
                        repaired = self._repair_json(json_str)
                        try:
                            return json.loads(repaired)
                        except json.JSONDecodeError:
                            # Reset and continue looking for another JSON object
                            start_idx = None
                            continue

        # Strategy 4: Last resort - try with repairs on full text
        # Remove markdown blocks entirely and try again
        cleaned = re.sub(r'```(?:json)?', '', text)
        cleaned = cleaned.replace('```', '').strip()
        try:
            return json.loads(cleaned)
        except json.JSONDecodeError:
            pass

        # If nothing worked, raise the original error with context
        raise json.JSONDecodeError(
            f"Could not extract valid JSON from response (length: {len(text)} chars)",
            text[:500] if len(text) > 500 else text,
            0
        )

    def _repair_json(self, json_str: str) -> str:
        """
        Attempt to repair common JSON syntax issues.

        Args:
            json_str: Potentially malformed JSON string

        Returns:
            Repaired JSON string
        """
        # Fix trailing commas in arrays/objects
        repaired = re.sub(r',\s*([}\]])', r'\1', json_str)

        # Fix missing commas between array elements (common with multi-line)
        # Pattern: "string"\n"string" -> "string",\n"string"
        repaired = re.sub(r'"\s*\n\s*"', '",\n"', repaired)

        # Fix unquoted keys (simple cases)
        # Pattern: { key: "value" } -> { "key": "value" }
        repaired = re.sub(r'{\s*(\w+)\s*:', r'{"\1":', repaired)
        repaired = re.sub(r',\s*(\w+)\s*:', r',"\1":', repaired)

        return repaired

    def _build_planning_prompt(
        self,
        topic: str,
        scope: Optional[str],
        seed_references: Optional[List[str]]
    ) -> str:
        """Build planning prompt for Gemini."""

        prompt = f"""You are a systematic research planning assistant.

**Topic:** {topic}
"""

        if scope:
            prompt += f"**Scope:** {scope}\n"

        prompt += f"""
**Task:** Create a comprehensive research plan to find {self.min_sources}+ high-quality sources.

**Instructions:**
1. Plan research strategy (what to search for; which source types to prioritize)
2. Generate specific research queries (author:term, title:keyword, topic phrases)
3. Draft structured outline with section headings for evidence-based report

**Quality Requirements:**
- Minimum {self.min_sources} primary sources (peer-reviewed journals, standards, regulations)
- **Source Diversity:** Balance academic AND industry sources for comprehensive coverage
  - Academic: Peer-reviewed journals, conference papers, dissertations
  - Industry: Consulting reports (McKinsey, Gartner, BCG), think tanks (Brookings, RAND), regulatory bodies (WHO, OECD, European Commission), standards (ISO, IEEE)
- Avoid: Blogs, press releases, marketing materials (unless no alternative)
- Include: Recent work (last 5 years) AND foundational papers
- Coverage: Multiple perspectives, interdisciplinary if relevant

"""

        # Add seed references if provided
        if seed_references and len(seed_references) > 0:
            prompt += "**Seed References** (expand from these):\n"
            for ref in seed_references:
                prompt += f"- {ref}\n"
            prompt += "\nUse these as starting points. Find related work, citing papers, and recent developments.\n\n"

        prompt += """**Output Format:**
Return JSON with keys:
- strategy: Brief research strategy description (2-3 paragraphs)
- queries: List of specific search queries to execute (aim for 100)
- outline: Structured outline with section headings

**Query Diversity:** Generate mix of academic AND industry queries for source diversity:

Academic-focused queries (route to Crossref/Semantic Scholar):
- "peer-reviewed studies on [topic]"
- "systematic review of [topic]"
- "author:Smith [topic]"
- "title:empirical analysis [topic]"
- "meta-analysis [topic]"

Industry-focused queries (route to Gemini Grounded/web search):
- "McKinsey report [topic]"
- "Gartner analysis [topic]"
- "WHO guidelines [topic]"
- "OECD [topic] framework"
- "European Commission [topic] regulation"
- "BCG white paper [topic]"
- "IEEE standards [topic]"
- "NIST [topic] best practices"

Return ONLY valid JSON, no markdown blocks or explanations.
"""

        return prompt


    def _rephrase_topic_for_safety(self, topic: str) -> str:
        """
        Rephrase topic to avoid triggering safety filters.
        
        When Gemini safety filter blocks a topic, this method attempts to
        rephrase it in a more neutral, academic way that is less likely
        to trigger content filters.
        
        Args:
            topic: Original research topic
            
        Returns:
            Rephrased topic string
        """
        # Common problematic phrases and their safer alternatives
        replacements = [
            (r"\b(hack|hacking|hacker)\b", "security vulnerability analysis"),
            (r"\b(attack|attacking)\b", "threat assessment"),
            (r"\b(exploit|exploiting|exploitation)\b", "vulnerability"),
            (r"\b(weapon|weapons|weaponize)\b", "defense system"),
            (r"\b(kill|killing|death)\b", "impact"),
            (r"\b(drug|drugs)\b", "pharmaceutical"),
            (r"\b(terror|terrorism|terrorist)\b", "security threat"),
        ]
        
        rephrased = topic
        for pattern, replacement in replacements:
            rephrased = re.sub(pattern, replacement, rephrased, flags=re.IGNORECASE)
        
        # Add academic framing if not already present
        academic_prefixes = ["systematic review of", "academic analysis of", "literature review on", "empirical study of"]
        has_prefix = any(rephrased.lower().startswith(p) for p in academic_prefixes)
        
        if not has_prefix:
            rephrased = f"Academic literature review on {rephrased}"
        
        return rephrased

    def estimate_coverage(self, queries: List[str]) -> int:
        """
        Estimate number of sources likely to be found.

        Heuristic:
        - Specific queries (author:X, title:Y): ~1-2 sources each
        - Topic queries: ~2-5 sources each
        - Broad queries: ~5-10 sources each

        Args:
            queries: List of research queries

        Returns:
            Estimated source count
        """
        estimate = 0
        for query in queries:
            if 'author:' in query or 'title:' in query:
                estimate += 1.5  # Specific queries
            elif len(query.split()) <= 3:
                estimate += 3  # Topic queries
            else:
                estimate += 6  # Broad queries

        return int(estimate)

    def validate_plan(self, plan: Dict[str, Any]) -> bool:
        """
        Validate research plan meets quality requirements.

        Args:
            plan: Research plan from create_research_plan()

        Returns:
            True if plan is valid, False otherwise
        """
        # Check required keys
        if not all(k in plan for k in ['queries', 'outline', 'strategy']):
            logger.warning("Plan missing required keys")
            return False

        # Check query count
        queries = plan.get('queries', [])
        if len(queries) < 10:
            logger.warning(f"Too few queries: {len(queries)} < 10")
            return False

        # Estimate coverage
        estimated = self.estimate_coverage(queries)
        if estimated < self.min_sources * 0.7:  # 70% of target
            logger.warning(
                f"Estimated coverage too low: {estimated} < {self.min_sources * 0.7}"
            )
            return False

        return True

    def refine_plan(
        self,
        plan: Dict[str, Any],
        feedback: str
    ) -> Dict[str, Any]:
        """
        Refine research plan based on feedback.

        Args:
            plan: Original research plan
            feedback: Feedback on what to improve

        Returns:
            Refined research plan
        """
        if self.verbose:
            print(f"\n🔄 Refining research plan...")

        prompt = f"""You are refining a research plan based on feedback.

**Original Plan:**
{json.dumps(plan, indent=2)}

**Feedback:**
{feedback}

**Task:** Improve the plan addressing the feedback while maintaining quality requirements.

Return updated JSON with same structure (strategy, queries, outline).
Return ONLY valid JSON, no markdown blocks.
"""

        try:
            response = self.model.generate_content(
                prompt,
                generation_config=genai.GenerationConfig(
                    temperature=0.3,
                    max_output_tokens=8192,
                    response_mime_type="application/json"  # Structured JSON output
                )
            )

            plan_text = response.text.strip()
            refined_plan = json.loads(plan_text)

            if self.verbose:
                print(f"   ✓ Plan refined: {len(refined_plan.get('queries', []))} queries")

            return refined_plan

        except Exception as e:
            logger.error(f"Plan refinement failed: {e}")
            return plan  # Return original if refinement fails
