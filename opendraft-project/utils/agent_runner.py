#!/usr/bin/env python3
"""
ABOUTME: Production agent utilities for draft generation
ABOUTME: Core functions for model setup, agent execution, and citation research

Extracted from tests/test_utils.py for proper production use.
These are the essential utilities needed by draft_generator.py and modal_worker.py.
"""

import sys
import time
import logging
import os
import json
import threading
from pathlib import Path
from urllib.parse import urlparse
from queue import Empty, Queue
from typing import Optional, Callable, Tuple, List, TYPE_CHECKING, Any, Dict
from concurrent.futures import ThreadPoolExecutor, as_completed, TimeoutError as FuturesTimeoutError

# Safe print function that handles broken pipes (worker runs with stdio: 'ignore')
def safe_print(*args, **kwargs):
    """Print wrapper that catches BrokenPipeError when stdout is closed."""
    try:
        print(*args, **kwargs)
    except (BrokenPipeError, OSError):
        # Pipe is closed (worker running with stdio: 'ignore'), use logger instead
        message = ' '.join(str(arg) for arg in args)
        logger.debug(message)
        # Prevent further broken pipe errors by redirecting stdout
        try:
            sys.stdout = open(os.devnull, 'w')
        except:
            pass

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import google.generativeai as genai
from config import get_config
from concurrency.concurrency_config import get_concurrency_config
from utils.output_validators import ValidationResult
from utils.api_citations.orchestrator import CitationResearcher
from utils.citation_database import Citation
from utils.deep_research import DeepResearchPlanner

# Configure logging
logger = logging.getLogger(__name__)


def setup_model(model_override: Optional[str] = None) -> Any:
    """
    Initialize and return configured Gemini model.

    Args:
        model_override: Optional model name to override config default

    Returns:
        genai.GenerativeModel: Configured Gemini model instance

    Raises:
        ValueError: If API key is missing or model name is invalid
    """
    config = get_config()

    if not config.google_api_key:
        raise ValueError(
            "GOOGLE_API_KEY not found. Set it in .env file or environment variables."
        )

    configure_kwargs: Dict[str, Any] = {
        "api_key": config.google_api_key,
        "transport": "rest",
    }
    # Read proxy endpoint from env instead of hardcoding.
    # Accepts both "api.linkapi.org" and full URLs like
    # "https://api.linkapi.org/v1beta/models".
    raw_endpoint = str(os.getenv("GEMINI_API_ENDPOINT", "") or "").strip()
    if raw_endpoint:
        endpoint = raw_endpoint
        if endpoint.startswith(("http://", "https://")):
            parsed = urlparse(endpoint)
            endpoint = parsed.netloc or endpoint
        endpoint = endpoint.rstrip("/")
        if endpoint:
            configure_kwargs["client_options"] = {"api_endpoint": endpoint}

    genai.configure(**configure_kwargs)  # type: ignore[attr-defined]

    model_name = model_override or config.model.model_name

    # Some proxy endpoints reject omitted/zero max_output_tokens with:
    # "generation_config.max_output_tokens must be positive".
    # Enforce a safe positive default here to avoid sporadic 400s.
    raw_max_tokens: Any = getattr(config.model, 'max_output_tokens', None)
    if raw_max_tokens is None:
        raw_max_tokens = os.getenv('GEMINI_MAX_OUTPUT_TOKENS') or os.getenv('MAX_OUTPUT_TOKENS')
    try:
        max_output_tokens = int(raw_max_tokens) if raw_max_tokens is not None else 8192
    except (TypeError, ValueError):
        max_output_tokens = 8192
    if max_output_tokens <= 0:
        logger.warning(
            "Invalid max_output_tokens=%r detected; using fallback 8192",
            raw_max_tokens,
        )
        max_output_tokens = 8192

    # Disable SDK tools - we use fallback services (DataForSEO/OpenPull) instead
    # The googleSearch tool in SDK is causing errors: "Unknown field for FunctionDeclaration: googleSearch"
    # Instead, we rely on:
    # - Backend REST APIs for citation research (CrossRef, Semantic Scholar, Gemini Grounded REST)
    # - Fallback services (DataForSEO for web search, OpenPull for URL scraping)
    
    return genai.GenerativeModel(  # type: ignore[attr-defined]
        model_name,
        generation_config={
            'temperature': config.model.temperature,
            'max_output_tokens': max_output_tokens,
        },
        tools=None  # Explicitly disable tools to avoid "Unknown field" errors
    )


def load_prompt(prompt_path: str) -> str:
    """
    Load agent prompt from markdown file.

    Args:
        prompt_path: Path to prompt file (relative to project root or absolute)

    Returns:
        str: Content of the prompt file

    Raises:
        FileNotFoundError: If prompt file doesn't exist
    """
    config = get_config()
    path = Path(prompt_path)

    # If relative path, try relative to project root
    if not path.is_absolute():
        path = config.paths.project_root / path

    if not path.exists():
        raise FileNotFoundError(f"Prompt file not found: {path}")

    with open(path, 'r', encoding='utf-8') as f:
        return f.read()


def _has_cjk(text: str) -> bool:
    """Check if text contains CJK (Chinese/Japanese/Korean) characters."""
    return any('\u4e00' <= c <= '\u9fff' or '\u3400' <= c <= '\u4dbf' for c in text)


def _ensure_english_queries(queries: list, model, verbose: bool = True) -> list:
    """
    Translate non-English queries to English for academic database search.
    Academic databases like Crossref work much better with English queries.
    """
    if not queries:
        return queries

    # Check if any query has CJK characters
    cjk_queries = [q for q in queries if _has_cjk(q)]
    if not cjk_queries:
        return queries  # All English already

    if verbose:
        safe_print(f"\n🌐 Translating {len(cjk_queries)} non-English queries for academic databases...")

    try:
        # Batch translate using the model
        queries_text = "\n".join(f"{i+1}. {q}" for i, q in enumerate(cjk_queries))
        prompt = (
            f"Translate these academic research queries to English. "
            f"Return ONLY the translated queries, one per line, numbered. "
            f"Keep them as academic search terms (concise, keyword-style).\n\n{queries_text}"
        )
        response = model.generate_content(prompt)
        translated_text = response.text.strip()

        # Parse translated queries
        import re
        translated = {}
        for line in translated_text.split('\n'):
            line = line.strip()
            m = re.match(r'^(\d+)[.\)]\s*(.+)', line)
            if m:
                idx = int(m.group(1)) - 1
                if 0 <= idx < len(cjk_queries):
                    translated[cjk_queries[idx]] = m.group(2).strip()

        # Build result: replace CJK queries with translations, keep both for coverage
        result = []
        for q in queries:
            if q in translated:
                result.append(translated[q])  # English version
                result.append(q)  # Keep original too (some databases handle CJK)
            else:
                result.append(q)

        if verbose:
            safe_print(f"   Translated {len(translated)} queries")
            for orig, eng in list(translated.items())[:3]:
                safe_print(f"   {orig} → {eng}")
            safe_print()

        return result

    except Exception as e:
        logger.warning(f"Query translation failed: {e}")
        if verbose:
            safe_print(f"   ⚠️ Translation failed, using original queries")
        return queries


def _strip_thinking(text: str) -> str:
    """
    Combined post-processing for user-visible chapter content.
    One API call does three things:
    1. Remove AI thinking/planning text
    2. Polish grammar, flow, and readability
    3. Increase natural variation (anti-AI detection)
    Falls back to basic pattern matching if API call fails.
    """
    stripped = text.strip()
    if not stripped:
        return text

    try:
        refined = _refine_chapter(stripped)
        if refined and len(refined) > len(stripped) * 0.3:
            stripped = refined
            logger.info(f"Chapter refined: {len(text)} -> {len(stripped)} chars")
        else:
            logger.warning("Refinement returned too little content, falling back to pattern matching")
            stripped = _basic_strip_thinking(stripped)
    except Exception as e:
        logger.warning(f"Chapter refinement failed ({e}), falling back to pattern matching")
        stripped = _basic_strip_thinking(stripped)

    # Safety pass: even after refinement, strip any remaining thinking text
    stripped = _basic_strip_thinking(stripped)

    stripped = _remove_trailing_duplicates(stripped)
    return stripped.strip()


def refine_chapter_text(text: str) -> str:
    """Public wrapper for chapter refinement (used by pipelined Phase 3).

    Returns refined text. After calling, check ``_refine_chapter._last_summary``
    for the refine summary (may be None).
    """
    return _strip_thinking(text)


def _refine_chapter(text: str) -> str:
    """
    Combined chapter post-processing via Gemini:
    - Strip thinking text
    - Polish grammar and flow
    - Increase natural variation (entropy)
    - Return a brief change summary for progress display
    One API call replaces three separate steps.
    """
    config = get_config()
    model = setup_model()

    refine_prompt = f"""You are an expert academic editor. Refine the following chapter by performing these three tasks in a single pass.

**TASK 1 — CLEAN**
Strip any non-content text the AI left behind: thinking traces ("I will write…", "Let me…", "我需要…", "让我…"), word-count notes, strategy/planning paragraphs, meta-commentary about the task. If none exist, skip.

**TASK 2 — POLISH**
Fix grammar, spelling, and punctuation. Smooth transitions between paragraphs. Ensure tense consistency: past tense when citing prior work, present tense for general claims. Break run-on sentences; merge choppy ones.

**TASK 3 — HUMANIZE**
Make the prose read like a skilled human researcher wrote it:
- Mix sentence lengths freely — some short and punchy, some long and layered.
- Replace overused AI filler: "significant"→substantial/considerable/notable, "utilize"→use, "facilitate"→enable/support, "demonstrates"→shows/reveals/indicates, "Additionally"/"Furthermore"/"Moreover"→drop or rewrite the transition naturally.
- Vary openings — avoid starting consecutive sentences with "The" or the same noun.
- Use em-dashes, semicolons, or parentheticals where they fit naturally — do not force them.
- Eliminate formulaic hedging ("It is worth noting that…", "It should be mentioned that…") — just state the point.

**RULES (non-negotiable)**
1. Preserve every {{cite_XXX}} citation marker exactly.
2. Preserve all markdown structure: headings, bold, italic, tables, lists.
3. Keep the original language (Chinese stays Chinese, English stays English).
4. Do not invent new claims or data — only improve what already exists.
5. Do not delete headings or restructure sections.
6. Maintain academic rigor and domain-specific terminology.
7. The output length should be similar to the input — do not aggressively shorten.

**OUTPUT FORMAT:**
First output the refined chapter text, then at the very end output a brief change summary wrapped in tags like this:

<refine_summary>
- (2-4 bullet points in the SAME language as the chapter, describing key changes made)
</refine_summary>

{text}"""

    response = model.generate_content(
        refine_prompt,
        request_options={"timeout": 180}
    )
    raw_result = response.text.strip()

    # Extract refine summary
    import re
    summary_match = re.search(r'<refine_summary>(.*?)</refine_summary>', raw_result, re.DOTALL)
    refine_summary = summary_match.group(1).strip() if summary_match else None
    # Remove summary tags from the final text
    result = re.sub(r'\s*<refine_summary>.*?</refine_summary>\s*', '', raw_result, flags=re.DOTALL).strip()

    logger.info(f"Refine: input {len(text)} chars -> output {len(result)} chars (ratio: {len(result)/len(text):.2f})")
    if len(result) < len(text) * 0.3:
        logger.warning(f"Refine output too short. First 200 chars: {result[:200]}")

    # Store summary on the function for caller to retrieve
    _refine_chapter._last_summary = refine_summary
    return result


def _basic_strip_thinking(text: str) -> str:
    """
    Fallback: basic pattern matching to remove obvious thinking paragraphs.
    Used when AI cleaning is unavailable.
    Two-pass approach:
    1. Try to find a clear content boundary (heading or structured start)
    2. If no boundary found, filter paragraph by paragraph
    """
    import re

    # Pass 1: Look for content boundary — first markdown heading or structured academic text
    # Thinking text is typically before any ## or # heading
    heading_match = re.search(r'^(#{1,3}\s+.+)', text, re.MULTILINE)
    if heading_match:
        pos = heading_match.start()
        # If there's substantial text before the first heading, it's likely thinking
        before_heading = text[:pos].strip()
        after_heading = text[pos:]
        if before_heading and len(before_heading) > 50:
            # Check if text before heading looks like thinking (conversational/meta)
            thinking_indicators = [
                r'(?:I |I\'m |My |Let me |Okay|Ok |Alright|Sure)',
                r'(?:task|goal|structure|word count|paragraph|draft)',
                r'(?:需要|让我|好的|接下来|首先|任务|目标)',
            ]
            before_lines = before_heading.split('\n')[0]
            if any(re.search(pat, before_lines, re.IGNORECASE) for pat in thinking_indicators):
                logger.info(f"Stripped {len(before_heading)} chars of thinking before first heading")
                text = after_heading

    # Pass 2: Filter remaining paragraphs
    blocks = re.split(r'\n{2,}', text)
    cleaned = []

    thinking_patterns = [
        r'^(?:I |I\'m |My |Let me |Now |Ok[,. ]|Okay[,. ]|Here |The user |We need )',
        r'^(?:I have|I will |I need |I should |I can |Looking at |I\'ve |I\'ll )',
        r'^(?:For this |To write |To begin |To start |For the |Moving to )',
        r'^(?:Planning|Thinking|Note:|Important:|Remember:|Sure|Alright|Let\'s)',
        r'^(?:The (?:task|goal|structure|word count|core|key|draft|section|final|second|third|fourth))',
        r'^(?:So |So,|This is where |That\'s )',
        r'^(?:First,|Then,|Next,|Finally,|Also,)',
        r'^(?:```)',
        # Chinese thinking patterns
        r'^(?:我[需要会将来]|让我|现在|好的|接下来)',
        r'^(?:我的|对于这|为了|根据|那么|下面我)',
        # Bold thinking headers (NOT bold content headers like **Research Problem**)
        r'^\*\*(?:My |Planning|Note|Draft|Approach|Strategy|Abstract Generation|Crafting|Writing a|Generating|Creating a|Building|Developing|Drafting)',
    ]

    for block in blocks:
        block_stripped = block.strip()
        if not block_stripped:
            continue

        # Always keep headings, tables, lists
        if re.match(r'^#{1,6}\s', block_stripped):
            cleaned.append(block)
            continue
        if '|' in block_stripped and re.search(r'\|.*\|', block_stripped):
            cleaned.append(block)
            continue
        if re.match(r'^(\s*[-*]\s|\s*\d+\.\s)', block_stripped):
            cleaned.append(block)
            continue

        first_line = block_stripped.split('\n')[0].strip()
        is_thinking = any(re.match(pat, first_line, re.IGNORECASE) for pat in thinking_patterns)
        if not is_thinking:
            cleaned.append(block)

    return '\n\n'.join(cleaned)


def _remove_trailing_duplicates(text: str) -> str:
    """
    Remove trailing duplicate content where the model repeats outline
    structure and thinking at the end.

    Strategy: find if the last ~30% of text is a near-duplicate of earlier content
    by checking if heading patterns repeat.
    """
    import re

    lines = text.split('\n')
    if len(lines) < 20:
        return text

    # Collect all heading lines with their positions
    headings = []
    for i, line in enumerate(lines):
        if re.match(r'^#{1,6}\s', line.strip()):
            headings.append((i, line.strip()))

    if len(headings) < 4:
        return text

    # Check if there are duplicate heading sequences
    heading_texts = [h[1] for h in headings]

    # Find if a heading appears twice (suggesting duplication)
    seen = {}
    duplicate_start = None
    for idx, (line_num, heading_text) in enumerate(headings):
        # Normalize: strip trailing spaces, collapse whitespace
        normalized = re.sub(r'\s+', ' ', heading_text).strip()
        if normalized in seen:
            # Found a duplicate heading — check if subsequent headings also match
            first_idx = seen[normalized]
            match_count = 0
            for k in range(min(3, len(headings) - idx)):
                if first_idx + k < len(headings) and idx + k < len(headings):
                    n1 = re.sub(r'\s+', ' ', headings[first_idx + k][1]).strip()
                    n2 = re.sub(r'\s+', ' ', headings[idx + k][1]).strip()
                    if n1 == n2:
                        match_count += 1
            if match_count >= 2:
                # Found duplicate sequence — truncate from here
                duplicate_start = headings[idx][0]
                break
        else:
            seen[normalized] = idx

    if duplicate_start is not None:
        # Truncate at the duplicate section
        truncated = '\n'.join(lines[:duplicate_start]).rstrip()
        # Only truncate if we keep a substantial portion
        if len(truncated) > len(text) * 0.3:
            return truncated

    return text


def run_agent(
    model: Any,
    name: str,
    prompt_path: str,
    user_input: str,
    save_to: Optional[Path] = None,
    verbose: bool = True,
    validators: Optional[List[Callable[[str], ValidationResult]]] = None,
    max_retries: int = 3,
    skip_validation: bool = False,
    clean_thinking: bool = True,
    on_status: Optional[Callable[[str], None]] = None,
    defer_refine: bool = False
) -> str:
    """
    Run an AI agent with given prompt and input, with optional validation.

    This function is the core execution layer for all agents in the draft pipeline.
    It handles LLM interaction, output validation, retries, and file I/O.

    Args:
        model: Configured Gemini model instance
        name: Human-readable name for the agent (for logging)
        prompt_path: Path to agent prompt file
        user_input: User's request/input for the agent
        save_to: Optional path to save output
        verbose: Whether to print progress messages
        validators: Optional list of validation functions to apply to output
        max_retries: Maximum retry attempts if validation fails (default: 3)
        skip_validation: If True, skip all validation checks (for automated runs)

    Returns:
        str: Validated agent output text

    Raises:
        Exception: If agent execution fails or validation fails after all retries
    """
    # Override validators if skip_validation is True
    if skip_validation:
        validators = None
        logger.info(f"Agent '{name}': Validation skipped (skip_validation=True)")
    if verbose:
        safe_print(f"\n{'='*70}")
        safe_print(f"🤖 {name}")
        safe_print(f"{'='*70}")

    # Load agent prompt
    agent_prompt = load_prompt(prompt_path)

    # Anti-thinking instruction: prevent AI from outputting planning/reasoning text
    anti_thinking = (
        "\n\n---\n\n"
        "**CRITICAL OUTPUT RULE**: Output ONLY the requested academic content. "
        "Do NOT include any of the following in your output:\n"
        "- Your thinking process, planning, or reasoning steps\n"
        "- Self-referential text (\"I will write...\", \"Let me...\", \"I need to...\")\n"
        "- Meta-commentary about the task (\"The word count is...\", \"This section should...\")\n"
        "- Draft notes, strategies, or approach descriptions\n"
        "- Summaries of what you understood from the instructions\n"
        "Begin directly with the academic content (headings, prose, tables, citations). "
        "Any planning or reasoning must happen internally — never in the output."
    )

    # Combine agent prompt with anti-thinking instruction and user input
    full_prompt = f"{agent_prompt}{anti_thinking}\n\n---\n\nUser Request:\n{user_input}"

    logger.debug(f"Agent '{name}': Starting execution")
    logger.debug(f"Prompt length: {len(full_prompt)} chars")
    logger.debug(f"Validators: {len(validators) if validators else 0}")

    # Initialize output variable with explicit type
    output: str = ""

    # Retry loop with exponential backoff
    for attempt in range(max_retries):
        if verbose and attempt > 0:
            safe_print(f"Retry attempt {attempt}/{max_retries}...", end=' ', flush=True)
        elif verbose:
            safe_print("Generating...", end=' ', flush=True)

        start_time = time.time()

        try:
            # Generate LLM response with timeout protection
            # Note: If Gemini tools (Google Search/URL context) hit rate limits,
            # we catch the exception and use fallbacks (DataForSEO/OpenPull)
            try:
                response = model.generate_content(
                    full_prompt,
                    request_options={"timeout": 180}  # 3 minute timeout
                )
            except Exception as tool_error:
                error_str = str(tool_error)
                # Check if it's a rate limit error (429) from Gemini tools
                if "429" in error_str or "rate limit" in error_str.lower() or "quota" in error_str.lower():
                    logger.warning(f"Agent '{name}': Gemini tools rate limited - will retry without tools")
                    response = model.generate_content(
                        full_prompt,
                        request_options={"timeout": 180}
                    )
                else:
                    raise  # Re-raise if not a rate limit error
            
            # Handle function calls and other edge cases
            # Check if response has candidates
            if not response.candidates:
                raise ValueError(f"Agent '{name}': No candidates in response (likely blocked)")
            
            candidate = response.candidates[0]
            finish_reason = getattr(candidate, 'finish_reason', None)
            
            # Check what parts exist in the response BEFORE accessing response.text
            # This prevents ValueError when response has function calls or no text parts
            has_text_part = False
            has_function_call = False
            
            if hasattr(candidate, 'content') and candidate.content:
                for part in candidate.content.parts:
                    if hasattr(part, 'text') and part.text:
                        has_text_part = True
                        break
                    if hasattr(part, 'function_call'):
                        has_function_call = True
            
            # If no text part exists, try to extract from parts directly
            output = None
            
            if has_text_part:
                # Safe to use response.text when text part exists
                try:
                    output = str(response.text)
                except ValueError:
                    # Fallback: extract from parts
                    if hasattr(candidate, 'content') and candidate.content:
                        text_parts = [part.text for part in candidate.content.parts if hasattr(part, 'text') and part.text]
                        if text_parts:
                            output = ''.join(text_parts)
            elif has_function_call:
                # Function call detected but no text - this is an error
                raise ValueError(
                    f"Agent '{name}': Response contains function call but no text content. "
                    f"Finish reason: {finish_reason}. "
                    f"This may indicate the model attempted to call a function incorrectly. "
                    f"Try regenerating or check if tools are properly configured."
                )
            else:
                # No text part and no function call - check finish_reason
                if finish_reason == 1:  # STOP (normal) but no text - unusual
                    raise ValueError(
                        f"Agent '{name}': Response has finish_reason=1 (STOP) but no text parts. "
                        f"This may indicate an empty response or safety filter block."
                    )
                elif finish_reason == 10:  # FUNCTION_CALL
                    raise ValueError(
                        f"Agent '{name}': Response has finish_reason=10 (FUNCTION_CALL) but no text content. "
                        f"This indicates an invalid function call attempt."
                    )
                else:
                    raise ValueError(
                        f"Agent '{name}': No text content in response. "
                        f"Finish reason: {finish_reason}. "
                        f"Response may be blocked or empty."
                    )
            
            if not output:
                raise ValueError(f"Agent '{name}': Unable to extract text from response")

            output = str(output)
            gen_time = time.time() - start_time
            logger.info(f"Agent '{name}': LLM generation took {gen_time:.1f}s, output {len(output)} chars")

            # Strip AI thinking/reasoning text only for user-visible content
            if clean_thinking and not defer_refine:
                if on_status:
                    on_status("refining")
                clean_start = time.time()
                output = _strip_thinking(output)
                logger.info(f"Agent '{name}': Thinking cleanup took {time.time() - clean_start:.1f}s")
                if on_status:
                    on_status("refined")
            elif defer_refine:
                logger.info(f"Agent '{name}': Refinement deferred (defer_refine=True)")

            logger.debug(f"Agent '{name}': Generated {len(output)} chars in {time.time() - start_time:.1f}s")

            # Validate output if validators provided (and not skipped)
            if validators and not skip_validation:
                validation_passed = True
                for i, validator in enumerate(validators):
                    logger.debug(f"Agent '{name}': Running validator {i+1}/{len(validators)}")
                    result = validator(output)

                    if not result.is_valid:
                        validation_passed = False
                        logger.warning(
                            f"Agent '{name}': Validation failed on attempt {attempt+1}/{max_retries}: "
                            f"{result.error_message}"
                        )

                        if verbose:
                            safe_print(f"⚠️ Validation failed: {result.error_message}")

                        # If not last attempt, retry with backoff
                        if attempt < max_retries - 1:
                            backoff_seconds = 2 ** attempt  # Exponential: 1s, 2s, 4s
                            logger.debug(f"Agent '{name}': Backing off for {backoff_seconds}s")
                            time.sleep(backoff_seconds)
                            break  # Break validator loop to retry LLM call
                        else:
                            # Last attempt failed - raise error
                            error_msg = (
                                f"Agent '{name}' validation failed after {max_retries} attempts: "
                                f"{result.error_message}"
                            )
                            logger.error(error_msg)
                            raise ValueError(error_msg)
                    else:
                        logger.debug(f"Agent '{name}': Validator {i+1} passed")

                # If all validators passed, break retry loop
                if validation_passed:
                    logger.info(f"Agent '{name}': All {len(validators)} validators passed")
                    break
            else:
                # No validators - success on first attempt
                logger.debug(f"Agent '{name}': No validators, accepting output")
                break

        except Exception as e:
            if verbose:
                safe_print(f"❌ Error")

            logger.error(f"Agent '{name}': Exception on attempt {attempt+1}: {str(e)}")

            # If not last attempt and it's a transient error, retry
            if attempt < max_retries - 1 and _is_transient_error(e):
                backoff_seconds = 2 ** attempt
                logger.debug(f"Agent '{name}': Transient error, retrying after {backoff_seconds}s")
                time.sleep(backoff_seconds)
                continue
            else:
                raise Exception(f"Agent '{name}' execution failed: {str(e)}") from e

    elapsed = time.time() - start_time

    # Save output if path provided
    if save_to:
        try:
            save_to.parent.mkdir(parents=True, exist_ok=True)
            with open(save_to, 'w', encoding='utf-8') as f:
                f.write(output)

            # Verify file was created successfully
            if not save_to.exists():
                raise IOError(f"Output file not created: {save_to}")

            file_size = save_to.stat().st_size
            if file_size == 0:
                raise IOError(f"Output file is empty: {save_to}")

            logger.info(f"Agent '{name}': Saved output to {save_to} ({file_size} bytes)")

        except Exception as e:
            logger.error(f"Agent '{name}': Failed to save output to {save_to}: {str(e)}")
            raise

    if verbose:
        safe_print(f"✅ Done ({elapsed:.1f}s, {len(output):,} chars)")
        if save_to:
            safe_print(f"Saved to: {save_to}")

    return output


def _is_transient_error(error: Exception) -> bool:
    """
    Check if error is transient and worth retrying.
    Also signals backpressure system for rate limit errors.

    Args:
        error: Exception to check

    Returns:
        bool: True if error is transient (network, rate limit, etc.)
    """
    error_str = str(error).lower()
    transient_patterns = [
        'timeout',
        'rate limit',
        'quota',
        'service unavailable',
        'temporarily unavailable',
        '429',  # Too Many Requests
        '503',  # Service Unavailable
        '504',  # Gateway Timeout
    ]

    is_transient = any(pattern in error_str for pattern in transient_patterns)
    
    # Signal backpressure for rate limit errors
    if is_transient and ('429' in error_str or 'rate limit' in error_str or 'quota' in error_str):
        try:
            from utils.backpressure import BackpressureManager, APIType
            bp = BackpressureManager()
            bp.signal_429(APIType.GEMINI_PRIMARY)
            logger.debug("Signaled backpressure for rate limit error")
        except Exception:
            pass  # Don't fail on backpressure errors
    
    return is_transient


def rate_limit_delay(seconds: Optional[float] = None) -> None:
    """
    Sleep for rate limiting with tier-adaptive delays.

    Automatically adjusts delay based on detected API tier:
    - Free tier (10 RPM): 7 seconds (safe for 1 req/6s limit)
    - Paid tier (2,000 RPM): 0.3 seconds (safe for high throughput)

    Args:
        seconds: Manual override (default: None = use tier-adaptive delay)
    """
    if seconds is None:
        # Proxy-based setup: no rate limiting needed
        seconds = 0

    if seconds > 0:
        time.sleep(seconds)


def research_citations_via_api(
    model: Any,
    research_topics: Optional[List[str]] = None,
    output_path: Optional[Path] = None,
    target_minimum: int = 50,
    verbose: bool = True,
    # Deep Research Mode parameters
    use_deep_research: bool = False,
    topic: Optional[str] = None,
    scope: Optional[str] = None,
    seed_references: Optional[List[str]] = None,
    min_sources_deep: int = 100,
    # Timeout control
    per_topic_timeout_seconds: int = 20,  # Tight timeout to keep total research under 5min
    # Progress reporting
    progress_callback: Optional[Callable[[str, str], None]] = None,
) -> Dict[str, Any]:
    """
    Research citations using API-backed fallback chain with optional deep research mode.

    Two modes of operation:
    1. **Standard Mode** (use_deep_research=False):
       - Uses manually provided research_topics list
       - Executes each topic through API fallback chain
       - Best for targeted, curated research queries

    2. **Deep Research Mode** (use_deep_research=True):
       - Uses DeepResearchPlanner for autonomous research strategy
       - Creates 50+ systematic queries from topic + scope + seed references
       - Best for comprehensive literature reviews (dissertations, draft)

    API Fallback Chain:
    Crossref → Semantic Scholar → Gemini Grounded → Gemini LLM (95%+ success rate)

    Args:
        model: Configured Gemini model instance (used for planning and LLM fallback)
        research_topics: List of research topics (required if use_deep_research=False)
        output_path: Path to save Scout-compatible markdown output (required if provided)
        target_minimum: Minimum citations required to pass quality gate (default: 50)
        verbose: Whether to print progress messages (default: True)

        use_deep_research: Enable deep research mode (default: False)
        topic: Main research topic (required if use_deep_research=True)
        scope: Optional research scope constraints (e.g., "EU focus; B2C and B2B")
        seed_references: Optional seed papers to expand from
        min_sources_deep: Minimum sources for deep research (default: 100)
        per_topic_timeout_seconds: Maximum time to spend on each research topic (default: 90)
        progress_callback: Optional callback(message, event_type) for progress reporting

    Returns:
        Dict with keys:
            - citations: List[Citation] - Valid citations found
            - count: int - Number of valid citations
            - sources: Dict[str, int] - Breakdown by source (Crossref, Semantic Scholar, etc.)
            - failed_topics: List[str] - Topics that failed to find citations
            - research_plan: Optional[Dict] - Deep research plan (if deep mode enabled)

    Raises:
        ValueError: If citation count < target_minimum (quality gate failure)
        ValueError: If invalid mode parameters (missing required args)
    """
    # Validate mode parameters
    if use_deep_research:
        if not topic:
            raise ValueError("Deep research mode requires 'topic' parameter")
        mode_name = "DEEP RESEARCH MODE"
    else:
        if not research_topics:
            raise ValueError("Standard mode requires 'research_topics' parameter")
        mode_name = "STANDARD MODE"

    if verbose:
        safe_print("\n" + "=" * 80)
        safe_print(f"🔬 API-BACKED SCOUT - {mode_name}")
        safe_print("=" * 80)

    # Deep Research Mode: Autonomous research planning
    research_plan: Optional[Dict[str, Any]] = None

    if use_deep_research:
        if verbose:
            safe_print(f"\n🧠 Deep Research Planning Phase")
            safe_print(f"{'='*80}")
            safe_print(f"\n📋 Input:")
            safe_print(f"   Topic: {topic}")
            if scope:
                safe_print(f"   Scope: {scope}")
            if seed_references:
                safe_print(f"   Seed References: {len(seed_references)}")
            safe_print(f"   Target: {min_sources_deep}+ sources")
            safe_print()

        # Initialize deep research planner
        planner = DeepResearchPlanner(
            gemini_model=model,
            min_sources=min_sources_deep,
            verbose=verbose
        )

        # #region agent log
        import json as json_lib
        import time as time_lib
        debug_log_path = "/Users/federicodeponte/opendraft/.cursor/debug.log"
        try:
            with open(debug_log_path, "a") as f:
                f.write(json_lib.dumps({
                    "timestamp": int(time_lib.time() * 1000),
                    "location": "agent_runner.py:research_citations_via_api",
                    "message": "Starting deep research plan creation",
                    "data": {"topic": topic[:100]},
                    "sessionId": "debug-session",
                    "runId": "run1",
                    "hypothesisId": "A"
                }) + "\n")
        except Exception:
            pass
        # #endregion

        try:
            # Create research plan
            research_plan = planner.create_research_plan(
                topic=topic,
                scope=scope,
                seed_references=seed_references
            )

            # Validate plan quality
            if not planner.validate_plan(research_plan):
                if verbose:
                    safe_print("\n⚠️  Initial plan validation failed - attempting refinement...")

                # Attempt refinement
                research_plan = planner.refine_plan(
                    plan=research_plan,
                    feedback=f"Insufficient queries or coverage. Need minimum {min_sources_deep} sources. "
                            f"Generate more diverse queries covering: author searches, title searches, "
                            f"topic queries, regulatory/standards, and interdisciplinary connections."
                )

                # Validate again
                if not planner.validate_plan(research_plan):
                    raise ValueError(
                        f"Deep research plan validation failed after refinement. "
                        f"Generated {len(research_plan.get('queries', []))} queries, "
                        f"estimated {planner.estimate_coverage(research_plan.get('queries', []))} sources, "
                        f"but need minimum {min_sources_deep}."
                    )

            # Extract queries as research topics, cap to reasonable amount
            research_topics = research_plan.get('queries', [])
            # Limit queries to 3x target to avoid excessive API calls
            max_queries = max(min_sources_deep * 3, 15)
            if len(research_topics) > max_queries:
                research_topics = research_topics[:max_queries]

            if verbose:
                safe_print(f"\n✅ Research Plan Created:")
                safe_print(f"   Queries Generated: {len(research_topics)}")
                safe_print(f"   Estimated Coverage: {planner.estimate_coverage(research_topics)} sources")
                safe_print(f"\n📝 Research Strategy:")
                strategy_lines = research_plan.get('strategy', '').split('\n')
                for line in strategy_lines[:5]:  # First 5 lines
                    safe_print(f"   {line}")
                if len(strategy_lines) > 5:
                    safe_print(f"   ... (see output file for full strategy)")
                safe_print()
        
        except (TimeoutError, FuturesTimeoutError) as e:
            # Fallback to standard mode: generate basic queries from topic
            logger.warning(f"Deep research planning timed out, falling back to standard mode: {e}")
            if verbose:
                safe_print(f"\n⚠️  Deep Research Planning Timeout")
                safe_print(f"   Falling back to standard mode with basic queries...")
                safe_print()
            
            # #region agent log
            try:
                with open(debug_log_path, "a") as f:
                    f.write(json_lib.dumps({
                        "timestamp": int(time_lib.time() * 1000),
                        "location": "agent_runner.py:research_citations_via_api",
                        "message": "Deep research timeout - falling back to standard mode",
                        "data": {"error": str(e)[:200]},
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "A"
                    }) + "\n")
            except Exception:
                pass
            # #endregion
            
            # Generate basic queries from topic as fallback
            # Split topic into key terms and create simple queries
            topic_words = topic.split()
            # Create 10-15 basic queries covering different aspects
            research_topics = [
                topic,  # Full topic
                f"{topic} research",  # With "research"
                f"{topic} analysis",  # With "analysis"
                f"{topic} review",  # With "review"
                f"{topic} study",  # With "study"
            ]
            
            # Add queries for key terms if topic is long
            if len(topic_words) > 5:
                # Extract key phrases (first 3-4 words, middle 3-4 words, last 3-4 words)
                key_phrases = []
                if len(topic_words) >= 3:
                    key_phrases.append(" ".join(topic_words[:3]))
                if len(topic_words) >= 6:
                    key_phrases.append(" ".join(topic_words[2:5]))
                if len(topic_words) >= 4:
                    key_phrases.append(" ".join(topic_words[-3:]))
                
                research_topics.extend([f"{phrase} research" for phrase in key_phrases])
            
            # Ensure we have at least 10 queries
            while len(research_topics) < 10:
                research_topics.append(f"{topic} {len(research_topics)}")
            
            if verbose:
                safe_print(f"   Generated {len(research_topics)} fallback queries")
                safe_print()
        
        except Exception as e:
            # For other exceptions, also fallback to standard mode
            logger.warning(f"Deep research planning failed, falling back to standard mode: {e}")
            if verbose:
                safe_print(f"\n⚠️  Deep Research Planning Failed")
                safe_print(f"   Error: {str(e)[:200]}")
                safe_print(f"   Falling back to standard mode with basic queries...")
                safe_print()
            
            # #region agent log
            try:
                with open(debug_log_path, "a") as f:
                    f.write(json_lib.dumps({
                        "timestamp": int(time_lib.time() * 1000),
                        "location": "agent_runner.py:research_citations_via_api",
                        "message": "Deep research failed - falling back to standard mode",
                        "data": {"error": str(e)[:200]},
                        "sessionId": "debug-session",
                        "runId": "run1",
                        "hypothesisId": "A"
                    }) + "\n")
            except Exception:
                pass
            # #endregion
            
            # Generate basic queries from topic as fallback
            topic_words = topic.split()
            research_topics = [
                topic,
                f"{topic} research",
                f"{topic} analysis",
                f"{topic} review",
                f"{topic} study",
            ]
            
            if len(topic_words) > 5:
                key_phrases = []
                if len(topic_words) >= 3:
                    key_phrases.append(" ".join(topic_words[:3]))
                if len(topic_words) >= 6:
                    key_phrases.append(" ".join(topic_words[2:5]))
                if len(topic_words) >= 4:
                    key_phrases.append(" ".join(topic_words[-3:]))
                research_topics.extend([f"{phrase} research" for phrase in key_phrases])
            
            while len(research_topics) < 10:
                research_topics.append(f"{topic} {len(research_topics)}")
            
            if verbose:
                safe_print(f"   Generated {len(research_topics)} fallback queries")
                safe_print()

    # Translate non-English queries to English for academic databases
    research_topics = _ensure_english_queries(research_topics, model, verbose)

    # Normalize + de-duplicate topics to avoid wasting budget on duplicates.
    normalized_topics: List[str] = []
    seen_topics = set()
    for raw_topic in research_topics or []:
        safe_topic = str(raw_topic or '').strip()
        if not safe_topic or safe_topic in seen_topics:
            continue
        seen_topics.add(safe_topic)
        normalized_topics.append(safe_topic)
    research_topics = normalized_topics

    # Initialize CitationResearcher with API fallback chain.
    enable_semantic_scholar = os.environ.get('ENABLE_SEMANTIC_SCHOLAR', 'true').lower() != 'false'
    enable_gemini_grounded = os.environ.get('ENABLE_GEMINI_GROUNDED', 'true').lower() != 'false'
    crossref_only_mode = not enable_semantic_scholar and not enable_gemini_grounded

    # Detect if proxies are configured for rate limit bypass.
    from utils.api_citations.base import PROXY_LIST
    use_proxies = len(PROXY_LIST) > 0

    # Crossref-only mode can become very slow due to 429 backoff loops.
    # Auto-throttle concurrency and query volume to reduce wasted retries.
    if crossref_only_mode:
        max_queries_crossref_only = min(max(int(target_minimum * 1.6), 20), 60)
        if len(research_topics) > max_queries_crossref_only:
            dropped = len(research_topics) - max_queries_crossref_only
            logger.info(
                "Crossref-only mode: shrinking query count from %s to %s (dropped %s)",
                len(research_topics),
                max_queries_crossref_only,
                dropped,
            )
            research_topics = research_topics[:max_queries_crossref_only]

    def _emit_progress(message: str, event_type: str = 'info') -> None:
        # Heartbeat is useful for backend diagnostics but too noisy for frontend UX.
        # Keep it in server logs and stop forwarding to UI progress callback.
        if isinstance(message, str) and message.startswith("Scout heartbeat:"):
            logger.debug(message)
            return
        if progress_callback:
            try:
                progress_callback(message, event_type)
            except Exception as progress_error:
                logger.debug(f"Progress callback failed: {progress_error}")

    # Parallel citation research configuration.
    # IMPORTANT: In Crossref-only mode we avoid get_concurrency_config() because it may
    # trigger Gemini tier probing, which adds long startup latency unrelated to Crossref.
    if crossref_only_mode:
        batch_size = max(1, int(os.getenv("SCOUT_BATCH_SIZE", "10")))
        batch_delay = float(os.getenv("SCOUT_BATCH_DELAY", "1.0"))
        parallel_workers = max(1, int(os.getenv("SCOUT_PARALLEL_WORKERS", "4")))
        logger.info(
            "Crossref-only mode: using direct SCOUT_* env config (skip API tier probe): "
            "batch_size=%s, batch_delay=%s, workers=%s",
            batch_size,
            batch_delay,
            parallel_workers,
        )
    else:
        config = get_concurrency_config(verbose=False)
        batch_size = max(1, int(config.scout_batch_size))
        batch_delay = float(config.scout_batch_delay)
        parallel_workers = max(1, int(config.scout_parallel_workers))
    effective_batch_delay = 0 if use_proxies else max(0.0, batch_delay)
    effective_batch_size = batch_size
    effective_parallel_workers = parallel_workers
    effective_topic_timeout = max(6, int(per_topic_timeout_seconds))

    crossref_rate_limit_per_second: Optional[float] = None
    crossref_timeout: Optional[int] = None
    crossref_max_retries: Optional[int] = None

    if crossref_only_mode:
        # Apply conservative settings when only Crossref is available.
        effective_parallel_workers = 1
        effective_batch_size = min(effective_batch_size, 4)
        if not use_proxies:
            effective_batch_delay = max(effective_batch_delay, 1.0)
        effective_topic_timeout = max(6, min(effective_topic_timeout, 12))
        crossref_rate_limit_per_second = 1.5
        crossref_timeout = 8
        crossref_max_retries = 2
        logger.info(
            "Crossref-only auto-throttle enabled: workers=%s, batch_size=%s, timeout=%ss, retries=%s",
            effective_parallel_workers,
            effective_batch_size,
            effective_topic_timeout,
            crossref_max_retries,
        )
        _emit_progress(
            f"Crossref-only mode detected. Auto-throttle enabled (workers={effective_parallel_workers}, batch={effective_batch_size}, timeout={effective_topic_timeout}s).",
            "info",
        )

    researcher = CitationResearcher(
        gemini_model=model,
        enable_crossref=True,
        enable_semantic_scholar=enable_semantic_scholar,
        enable_gemini_grounded=enable_gemini_grounded,
        enable_smart_routing=True,     # Enable query classification for source diversity
        enable_llm_fallback=False,     # DISABLED: LLM hallucinates citations
        verbose=verbose,
        progress_callback=progress_callback,  # Pass through for progress reporting
        crossref_rate_limit_per_second=crossref_rate_limit_per_second,
        crossref_timeout=crossref_timeout,
        crossref_max_retries=crossref_max_retries,
    )

    # Execution Phase: Run queries through API fallback chain.
    if verbose:
        safe_print(f"\n📊 Execution Configuration:")
        safe_print(f"   Target Minimum: {target_minimum} citations")
        safe_print(f"   Research Topics/Queries: {len(research_topics)}")
        safe_print(f"   Workers: {effective_parallel_workers}")
        safe_print(f"   Topic Timeout: {effective_topic_timeout}s")
        if output_path:
            safe_print(f"   Output: {output_path}")
        safe_print()

    if not enable_semantic_scholar and verbose:
        safe_print("   ⚠️  Semantic Scholar disabled (ENABLE_SEMANTIC_SCHOLAR=false)")
    if not enable_gemini_grounded and verbose:
        safe_print("   ⚠️  Gemini Grounded disabled (ENABLE_GEMINI_GROUNDED=false)")
    if verbose and use_proxies:
        safe_print(f"\n🔀 Proxy rotation enabled: {len(PROXY_LIST)} proxies")
        safe_print("   Batch delays disabled for maximum throughput")

    # Track results.
    citations: List[Citation] = []
    sources_breakdown: Dict[str, int] = {
        "Crossref": 0,
        "Semantic Scholar": 0,
        "Gemini Grounded": 0,
        "Gemini LLM": 0,
    }
    failed_topics: List[str] = []

    def _run_topic_with_hard_timeout(research_topic: str) -> Tuple[List[Citation], Optional[str]]:
        """
        Run topic research in a daemon thread and return without blocking past timeout.
        """
        result_queue: Queue = Queue(maxsize=1)

        def _worker() -> None:
            try:
                citations_list = researcher.research_citation(research_topic)
                result_queue.put((citations_list, None), block=False)
            except Exception as worker_error:
                try:
                    result_queue.put(([], str(worker_error)), block=False)
                except Exception:
                    pass

        worker = threading.Thread(
            target=_worker,
            daemon=True,
            name=f"citation-topic-{int(time.time() * 1000)}",
        )
        worker.start()
        worker.join(effective_topic_timeout)
        if worker.is_alive():
            return ([], f"Timeout after {effective_topic_timeout}s")

        try:
            citations_list, maybe_error = result_queue.get_nowait()
            return (citations_list, maybe_error)
        except Empty:
            return ([], "Topic worker finished without a result")

    # Helper function for parallel execution with hard timeout.
    def _research_single_topic(topic_with_idx: Tuple[int, str]) -> Tuple[int, str, List[Citation], Optional[str]]:
        idx, research_topic = topic_with_idx
        citations_list, error = _run_topic_with_hard_timeout(research_topic)
        return (idx, research_topic, citations_list, error)

    # Early stopping: use user's target + 30% buffer (to account for dedup/filtering losses).
    early_stop_threshold = max(int(target_minimum * 1.3), 15)

    total_topics = len(research_topics)
    processed = 0
    _emit_progress(
        f"Scout execution started: {total_topics} topics, workers={effective_parallel_workers}, timeout={effective_topic_timeout}s.",
        "info",
    )

    # Parallel or sequential based on effective worker count.
    if effective_parallel_workers > 1:
        if verbose:
            safe_print(f"\n🚀 Parallel citation research enabled ({effective_parallel_workers} workers)")

        total_batches = (total_topics + effective_batch_size - 1) // effective_batch_size
        for batch_start in range(0, total_topics, effective_batch_size):
            if len(citations) >= early_stop_threshold:
                if verbose:
                    safe_print(
                        f"\n⏩ Early stopping: {len(citations)} citations collected "
                        f"(target: {target_minimum}, threshold: {early_stop_threshold})"
                    )
                break

            batch_end = min(batch_start + effective_batch_size, total_topics)
            batch = list(enumerate(research_topics[batch_start:batch_end], batch_start + 1))
            batch_num = batch_start // effective_batch_size + 1

            if batch_start > 0 and effective_batch_delay > 0:
                if verbose:
                    safe_print(
                        f"\n⏸️  Batch complete ({batch_start} topics processed). "
                        f"Waiting {effective_batch_delay}s to respect API limits..."
                    )
                time.sleep(effective_batch_delay)

            _emit_progress(
                f"Scout heartbeat: batch {batch_num}/{total_batches}, processed {processed}/{total_topics}, "
                f"citations {len(citations)}, failed {len(failed_topics)}.",
                "info",
            )
            if verbose:
                safe_print(f"\n📦 Processing batch {batch_num} ({len(batch)} topics)...")

            with ThreadPoolExecutor(max_workers=effective_parallel_workers) as executor:
                futures = {executor.submit(_research_single_topic, item): item for item in batch}

                for future in as_completed(futures):
                    idx, research_topic, citations_list, error = future.result()
                    processed += 1

                    if verbose:
                        safe_print(
                            f"[{idx}/{total_topics}] 🔎 {research_topic[:55]}{'...' if len(research_topic) > 55 else ''}",
                            end=' ',
                        )

                    if error:
                        failed_topics.append(research_topic)
                        if 'Timeout after' in error:
                            logger.warning(f"Citation research timed out for '{research_topic}': {error}")
                        else:
                            logger.error(f"Citation research failed for '{research_topic}': {error}")
                        if verbose:
                            safe_print(f"❌ {error[:42]}...")
                    elif citations_list:
                        citations.extend(citations_list)
                        for citation in citations_list:
                            source = citation.api_source or 'Unknown'
                            if source in sources_breakdown:
                                sources_breakdown[source] += 1
                        if verbose:
                            sources_str = ", ".join([c.api_source or 'Unknown' for c in citations_list])
                            first_citation = citations_list[0]
                            authors_str = first_citation.authors[0] if first_citation.authors else "Unknown"
                            count_str = f" (+{len(citations_list)-1} more)" if len(citations_list) > 1 else ""
                            safe_print(f"✅ {authors_str} et al. ({first_citation.year}) [{sources_str}]{count_str}")
                    else:
                        failed_topics.append(research_topic)
                        if verbose:
                            safe_print("❌ No citation found")

                    _emit_progress(
                        f"Scout heartbeat: processed {processed}/{total_topics}, citations {len(citations)}, "
                        f"failed {len(failed_topics)}.",
                        "info",
                    )

                    if len(citations) >= early_stop_threshold:
                        if verbose:
                            safe_print(f"\n⏩ Early stopping: {len(citations)} citations collected")
                        break
    else:
        if verbose:
            safe_print("\n🔄 Sequential citation research (1 worker)")

        for idx, research_topic in enumerate(research_topics, 1):
            if len(citations) >= early_stop_threshold:
                if verbose:
                    safe_print(
                        f"\n⏩ Early stopping: {len(citations)} citations collected "
                        f"(target: {target_minimum}, threshold: {early_stop_threshold})"
                    )
                break

            if idx > 1 and (idx - 1) % effective_batch_size == 0 and effective_batch_delay > 0:
                if verbose:
                    safe_print(
                        f"\n⏸️  Batch complete ({idx - 1} topics processed). "
                        f"Waiting {effective_batch_delay}s to respect API limits..."
                    )
                time.sleep(effective_batch_delay)

            _emit_progress(
                f"Scout heartbeat: starting topic {idx}/{total_topics}, citations {len(citations)}, failed {len(failed_topics)}.",
                "info",
            )
            if verbose:
                safe_print(f"[{idx}/{total_topics}] 🔎 {research_topic[:65]}{'...' if len(research_topic) > 65 else ''}")

            citations_list, error = _run_topic_with_hard_timeout(research_topic)

            if error:
                failed_topics.append(research_topic)
                if 'Timeout after' in error:
                    logger.warning(f"Citation research timed out for '{research_topic}': {error}")
                else:
                    logger.error(f"Citation research failed for '{research_topic}': {error}")
                if verbose:
                    safe_print(f"    ❌ {error}")
                continue

            if citations_list:
                citations.extend(citations_list)
                for citation in citations_list:
                    source = citation.api_source or 'Unknown'
                    if source in sources_breakdown:
                        sources_breakdown[source] += 1
                if verbose:
                    sources_str = ", ".join([c.api_source or 'Unknown' for c in citations_list])
                    first_citation = citations_list[0]
                    authors_str = first_citation.authors[0] if first_citation.authors else "Unknown"
                    count_str = f" (+{len(citations_list)-1} more)" if len(citations_list) > 1 else ""
                    safe_print(f"    ✅ {authors_str} et al. ({first_citation.year}) [{sources_str}]{count_str}")
            else:
                failed_topics.append(research_topic)
                if verbose:
                    safe_print("    ❌ No citation found")

            _emit_progress(
                f"Scout heartbeat: completed topic {idx}/{total_topics}, citations {len(citations)}, failed {len(failed_topics)}.",
                "info",
            )

    # Calculate success metrics
    citation_count = len(citations)
    success_rate = (citation_count / len(research_topics) * 100) if research_topics else 0

    if verbose:
        safe_print("\n" + "=" * 80)
        safe_print("📊 SCOUT RESULTS")
        safe_print("=" * 80)
        safe_print(f"\n✅ Valid Citations: {citation_count}")
        safe_print(f"❌ Failed Topics: {len(failed_topics)}")
        safe_print(f"📈 Success Rate: {success_rate:.1f}%")
        safe_print(f"\n📚 Sources Breakdown:")
        for source, count in sources_breakdown.items():
            percentage = (count / citation_count * 100) if citation_count > 0 else 0
            safe_print(f"   {source}: {count} ({percentage:.1f}%)")
        safe_print()

    # Tiered Quality Gate
    excellent_threshold = target_minimum
    acceptable_threshold = int(target_minimum * 0.86)
    minimal_threshold = int(target_minimum * 0.70)

    # #region agent log
    # Note: json, time, os already imported at module level
    try:
        debug_log_path = os.getenv('DEBUG_LOG_PATH', '/tmp/opendraft/debug.log')
        with open(debug_log_path, 'a') as f:
            f.write(json.dumps({
                "sessionId": "debug-session",
                "runId": "run1",
                "hypothesisId": "G",
                "location": "agent_runner.py:760",
                "message": "Quality gate evaluation",
                "data": {
                    "citation_count": citation_count,
                    "target_minimum": target_minimum,
                    "excellent_threshold": excellent_threshold,
                    "acceptable_threshold": acceptable_threshold,
                    "minimal_threshold": minimal_threshold,
                    "sources_breakdown": sources_breakdown,
                    "failed_topics_count": len(failed_topics)
                },
                "timestamp": int(time.time() * 1000)
            }) + "\n")
    except Exception as e:
        logger.debug(f"Debug log write failed: {e}")
    # #endregion

    if citation_count >= excellent_threshold:
        if verbose:
            safe_print(f"✅ QUALITY GATE PASSED (EXCELLENT): {citation_count} ≥ {target_minimum} required\n")
        logger.info(f"Quality gate: EXCELLENT - {citation_count}/{target_minimum} citations")

    elif citation_count >= acceptable_threshold:
        percentage = (citation_count / target_minimum) * 100
        if verbose:
            safe_print(f"⚠️  QUALITY GATE PASSED (ACCEPTABLE): {citation_count}/{target_minimum} ({percentage:.1f}%)")
            safe_print(f"    Academic quality is good, but {target_minimum - citation_count} more citations recommended.\n")
        logger.warning(f"Quality gate: ACCEPTABLE - {citation_count}/{target_minimum} ({percentage:.1f}%)")

    elif citation_count >= minimal_threshold:
        percentage = (citation_count / target_minimum) * 100
        if verbose:
            safe_print(f"⚠️  QUALITY GATE PASSED (MINIMAL): {citation_count}/{target_minimum} ({percentage:.1f}%)")
            safe_print(f"    ⚠️  WARNING: Citation count is below recommended standards.")
            safe_print(f"    Consider adding {target_minimum - citation_count} more citations for better academic rigor.\n")
        logger.warning(f"Quality gate: MINIMAL - {citation_count}/{target_minimum} ({percentage:.1f}%) - below standards")

    else:
        percentage = (citation_count / target_minimum) * 100
        error_msg = (
            f"\n❌ QUALITY GATE FAILED (INSUFFICIENT CITATIONS)\n\n"
            f"Only {citation_count} citations found ({percentage:.1f}%), but minimum {minimal_threshold} required ({minimal_threshold/target_minimum*100:.0f}% of target).\n"
            f"Target: {target_minimum} citations (100%)\n"
            f"Acceptable: {acceptable_threshold}+ citations (86%)\n"
            f"Minimal: {minimal_threshold}+ citations (70%)\n"
            f"Current: {citation_count} citations ({percentage:.1f}%) ❌\n\n"
            f"Academic draft standards require at least {minimal_threshold} citations.\n\n"
            f"Failed Topics ({len(failed_topics)}):\n"
        )
        for failed_topic in failed_topics[:10]:
            error_msg += f"  - {failed_topic}\n"
        if len(failed_topics) > 10:
            error_msg += f"  ... and {len(failed_topics) - 10} more\n"

        logger.error(f"Quality gate FAILED: {citation_count} < {minimal_threshold} (minimal threshold)")
        raise ValueError(error_msg)

    # Format output as Scout-compatible markdown
    markdown_lines = [
        "# Scout Output - Academic Citation Discovery",
        "",
        "## Summary",
        "",
        f"**Total Valid Citations**: {citation_count}",
        f"**Success Rate**: {success_rate:.1f}%",
        f"**Failed Topics**: {len(failed_topics)}",
        "",
        "### Sources Breakdown",
        ""
    ]

    for source, count in sources_breakdown.items():
        percentage = (count / citation_count * 100) if citation_count > 0 else 0
        markdown_lines.append(f"- **{source}**: {count} ({percentage:.1f}%)")

    markdown_lines.extend([
        "",
        "---",
        "",
        "## Citations Found",
        ""
    ])

    # Add citations grouped by source
    for source in ["Crossref", "Semantic Scholar", "Gemini Grounded", "Gemini LLM"]:
        source_citations = [c for c in citations if c.api_source == source]
        if not source_citations:
            continue

        markdown_lines.append(f"### From {source} ({len(source_citations)} citations)")
        markdown_lines.append("")

        for idx, citation in enumerate(source_citations, 1):
            markdown_lines.append(f"#### {idx}. {citation.title}")
            markdown_lines.append(f"**Authors**: {', '.join(citation.authors)}")
            markdown_lines.append(f"**Year**: {citation.year}")
            markdown_lines.append(f"**DOI**: {citation.doi}")
            if citation.url:
                markdown_lines.append(f"**URL**: {citation.url}")
            if hasattr(citation, 'abstract') and citation.abstract:
                # Include abstract for Scribe to summarize (prevent hallucination)
                markdown_lines.append("")
                markdown_lines.append(f"**Abstract**: {citation.abstract}")
            markdown_lines.append("")

    if failed_topics:
        markdown_lines.extend([
            "---",
            "",
            "## Failed Topics",
            "",
            "The following topics did not return valid citations:",
            ""
        ])
        for failed_topic in failed_topics:
            markdown_lines.append(f"- {failed_topic}")

    # Write to file when output path is provided
    markdown_content = "\n".join(markdown_lines)
    if output_path:
        output_path.parent.mkdir(parents=True, exist_ok=True)
        output_path.write_text(markdown_content, encoding='utf-8')

        if verbose:
            safe_print(f"💾 Saved Scout output to: {output_path}")
            safe_print(f"   File size: {output_path.stat().st_size:,} bytes\n")

    logger.info(f"Scout completed: {citation_count} citations, {success_rate:.1f}% success rate")

    return {
        "citations": citations,
        "count": citation_count,
        "sources": sources_breakdown,
        "failed_topics": failed_topics,
        "research_plan": research_plan
    }
