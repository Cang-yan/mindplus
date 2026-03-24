#!/usr/bin/env python3
"""
ABOUTME: Standalone draft generation function for Modal.com automated processing
ABOUTME: Extracts core logic from test_academic_ai_draft.py for production use

This module provides a simplified, production-ready draft generation workflow
that can be called from Modal workers or other automated systems.

Output Structure:
    draft_output/
    ├── research/           # All research materials
    │   ├── papers/         # Individual paper summaries
    │   ├── combined_research.md
    │   ├── research_gaps.md
    │   └── bibliography.json
    ├── drafts/             # Section drafts
    ├── tools/              # Refinement prompts for Cursor
    └── exports/            # Final outputs (PDF, DOCX, MD)
"""

import sys
import warnings

# Suppress deprecation warnings from dependencies before any imports
warnings.filterwarnings("ignore", category=FutureWarning)
warnings.filterwarnings("ignore", category=DeprecationWarning)

import time
import shutil
import json
from pathlib import Path
import re
import logging
import traceback
import psutil
import os
from typing import Tuple, Optional, List, Dict
from datetime import datetime

# Suppress WeasyPrint stderr warnings
os.environ['WEASYPRINT_QUIET'] = '1'

# Add project root to path
sys.path.insert(0, str(Path(__file__).parent.parent))

import google.generativeai as genai
from config import get_config
from utils.structured_logger import StructuredLogger

# Configure comprehensive logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s | %(name)-30s | %(levelname)-8s | %(message)s',
    datefmt='%Y-%m-%d %H:%M:%S'
)
logger = logging.getLogger(__name__)

def log_memory_usage(context=""):
    """Log current memory usage"""
    process = psutil.Process(os.getpid())
    mem_info = process.memory_info()
    mem_mb = mem_info.rss / 1024 / 1024
    logger.info(f"[MEMORY] {context}: {mem_mb:.1f} MB RSS")
    return mem_mb

def log_timing(func):
    """Decorator to log function execution time"""
    def wrapper(*args, **kwargs):
        start_time = time.time()
        func_name = func.__name__
        logger.info(f"[START] {func_name}")
        log_memory_usage(f"Before {func_name}")
        try:
            result = func(*args, **kwargs)
            elapsed = time.time() - start_time
            logger.info(f"[COMPLETE] {func_name} in {elapsed:.1f}s")
            log_memory_usage(f"After {func_name}")
            return result
        except Exception as e:
            elapsed = time.time() - start_time
            logger.error(f"[FAILED] {func_name} after {elapsed:.1f}s: {e}")
            logger.error(f"[TRACEBACK] {traceback.format_exc()}")
            raise
    return wrapper
from utils.agent_runner import setup_model, run_agent, rate_limit_delay, research_citations_via_api
from utils.citation_database import CitationDatabase, save_citation_database, load_citation_database
from utils.text_utils import smart_truncate
from utils.deduplicate_citations import deduplicate_citations
from utils.scrape_citation_titles import TitleScraper
from utils.scrape_citation_metadata import MetadataScraper
from utils.citation_quality_filter import CitationQualityFilter
from utils.citation_compiler import CitationCompiler
from utils.abstract_generator import generate_abstract_for_draft
from utils.export_professional import export_pdf, export_docx


def setup_output_folders(output_dir: Path) -> Dict[str, Path]:
    """
    Create the organized folder structure for draft output.
    
    Returns dict with paths to all subdirectories.
    """
    folders = {
        'root': output_dir,
        'research': output_dir / 'research',
        'papers': output_dir / 'research' / 'papers',
        'drafts': output_dir / 'drafts',
        'tools': output_dir / 'tools',
        'exports': output_dir / 'exports',
    }
    
    for folder in folders.values():
        folder.mkdir(parents=True, exist_ok=True)
    
    return folders


def slugify(text: str, max_length: int = 30) -> str:
    """Convert text to a safe filename slug."""
    # Remove special characters, lowercase, replace spaces with underscores
    slug = re.sub(r'[^\w\s-]', '', text.lower())
    slug = re.sub(r'[\s_]+', '_', slug).strip('_')
    return slug[:max_length]


def split_scribe_to_papers(scribe_output: str, papers_dir: Path, verbose: bool = True) -> List[Path]:
    """
    Split the combined scribe output into individual paper files.
    
    Parses the scribe markdown to find paper sections and saves each
    as a separate file in papers_dir.
    
    Returns list of created file paths.
    """
    created_files = []
    
    # Pattern to match paper sections in scribe output
    # Matches "## Paper N: Title" or "## N. Title" patterns
    paper_pattern = re.compile(
        r'^##\s*(?:Paper\s*)?(\d+)[:.]\s*(.+?)$',
        re.MULTILINE
    )
    
    # Find all paper sections
    matches = list(paper_pattern.finditer(scribe_output))
    
    if not matches:
        # Try alternative pattern for different scribe output formats
        alt_pattern = re.compile(
            r'^##\s+(.+?)$\n\*\*Authors?:\*\*\s*(.+?)$',
            re.MULTILINE
        )
        matches = list(alt_pattern.finditer(scribe_output))
        
        if not matches:
            # If no papers found, save entire output as combined file
            if verbose:
                print("   ⚠️  Could not split scribe output into papers")
            return created_files
    
    # Extract each paper section
    for i, match in enumerate(matches):
        start = match.start()
        # End is either start of next paper or end of document
        end = matches[i + 1].start() if i + 1 < len(matches) else len(scribe_output)
        
        paper_content = scribe_output[start:end].strip()
        
        # Extract metadata for filename
        try:
            paper_num = match.group(1) if match.lastindex >= 1 else str(i + 1)
            title = match.group(2) if match.lastindex >= 2 else f"paper_{i+1}"
        except:
            paper_num = str(i + 1)
            title = f"paper_{i+1}"
        
        # Try to extract author and year from content
        author_match = re.search(r'\*\*Authors?:\*\*\s*([^*\n]+)', paper_content)
        year_match = re.search(r'\*\*Year:\*\*\s*(\d{4})', paper_content)
        
        author = slugify(author_match.group(1).split(',')[0] if author_match else 'unknown', 15)
        year = year_match.group(1) if year_match else 'na'
        title_slug = slugify(title, 40)
        
        # Create filename: paper_001_author_year_title.md
        filename = f"paper_{int(paper_num):03d}_{author}_{year}_{title_slug}.md"
        file_path = papers_dir / filename
        
        # Write paper file
        file_path.write_text(paper_content, encoding='utf-8')
        created_files.append(file_path)
    
    if verbose and created_files:
        print(f"   ✅ Split into {len(created_files)} individual paper files")
    
    return created_files


def extract_all_citations_as_papers(scout_output_path: Path, papers_dir: Path, verbose: bool = True) -> List[Path]:
    """
    Extract ALL citations from scout_raw.md as individual paper files.
    This ensures all citations (typically 50+) become accessible paper files for Cursor usage,
    not just the subset analyzed by Scribe (typically 5-10 papers).
    
    Args:
        scout_output_path: Path to scout_raw.md containing all citations
        papers_dir: Directory to save paper files
        verbose: Whether to print progress messages
    
    Returns:
        List of created paper file paths
    """
    import re
    created_files = []
    
    if not scout_output_path.exists():
        if verbose:
            print("   ⚠️  scout_raw.md not found, skipping citation extraction")
        return created_files
    
    content = scout_output_path.read_text(encoding='utf-8')
    
    # Extract ALL citations from markdown
    # Pattern: #### N. Title followed by citation details
    citation_pattern = r'####\s+\d+\.\s+(.+?)(?=\n####\s+\d+\.|\n---|\Z)'
    matches = list(re.finditer(citation_pattern, content, re.DOTALL))
    
    if not matches:
        if verbose:
            print("   ⚠️  No citations found in scout_raw.md")
        return created_files
    
    if verbose:
        print(f"   📚 Extracting {len(matches)} citations as paper files...")
    
    # Count existing papers to avoid overwriting Scribe-analyzed ones
    existing_papers = {f.name for f in papers_dir.glob('paper_*.md')}
    start_idx = len(existing_papers) + 1
    
    for i, match in enumerate(matches, start=start_idx):
        section = match.group(1).strip()
        
        # Extract title (first line, remove markdown formatting)
        title_line = section.split('\n')[0].strip()
        title = re.sub(r'^\*\*|\*\*$', '', title_line).strip()
        
        # Extract authors
        author_match = re.search(r'\*\*Authors?\*\*:\s*(.+?)(?:\n|$)', section)
        authors_str = author_match.group(1).strip() if author_match else 'Unknown'
        authors = [a.strip() for a in authors_str.split(',')]
        
        # Extract year
        year_match = re.search(r'\*\*Year\*\*:\s*(\d{4})', section)
        year = year_match.group(1) if year_match else 'na'
        
        # Extract DOI
        doi_match = re.search(r'\*\*DOI\*\*:\s*(.+?)(?:\n|$)', section)
        doi = doi_match.group(1).strip() if doi_match else None
        
        # Extract URL
        url_match = re.search(r'\*\*URL\*\*:\s*(.+?)(?:\n|$)', section)
        url = url_match.group(1).strip() if url_match else None
        
        # Extract Abstract
        abstract_match = re.search(r'\*\*Abstract\*\*:\s*(.+?)(?:\n\n|\n\*\*|\Z)', section, re.DOTALL)
        abstract = abstract_match.group(1).strip() if abstract_match else None
        
        # Create filename
        author = authors[0].split()[0] if authors and authors[0] != 'Unknown' else 'unknown'
        title_slug = slugify(title, 40)
        
        filename = f"paper_{i:03d}_{author}_{year}_{title_slug}.md"
        filepath = papers_dir / filename
        
        # Skip if already exists (from Scribe analysis)
        if filename in existing_papers:
            continue
        
        # Create paper markdown
        paper_content = f"""# {title}

**Authors:** {', '.join(authors) if authors else 'Unknown'}
**Year:** {year}
**DOI:** {doi or 'N/A'}
**URL:** {url or 'N/A'}

## Abstract

{abstract or 'No abstract available in source'}

## Citation Details

{section[:2000]}  # Truncate if very long

---
*Extracted from citation research database - all {len(matches)} citations available*
"""
        
        filepath.write_text(paper_content, encoding='utf-8')
        created_files.append(filepath)
    
    if verbose and created_files:
        print(f"   ✅ Extracted {len(created_files)} additional citations as papers")
        print(f"   📊 Total papers now: {len(list(papers_dir.glob('paper_*.md')))}")
    
    return created_files


def copy_tools_to_output(tools_dir: Path, topic: str, academic_level: str, verbose: bool = True):
    """
    Copy refinement prompts and create .cursorrules for the output folder.
    """
    project_root = Path(__file__).parent.parent
    
    # Copy humanizer prompt (voice.md)
    voice_src = project_root / 'prompts' / '05_refine' / 'voice.md'
    if voice_src.exists():
        shutil.copy(voice_src, tools_dir / 'humanizer_prompt.md')
    
    # Copy entropy prompt
    entropy_src = project_root / 'prompts' / '05_refine' / 'entropy.md'
    if entropy_src.exists():
        shutil.copy(entropy_src, tools_dir / 'entropy_prompt.md')
    
    # Copy style guide from templates
    style_src = project_root / 'templates' / 'style_guide.md'
    if style_src.exists():
        shutil.copy(style_src, tools_dir / 'style_guide.md')
    
    # Create .cursorrules with topic-specific content
    cursorrules_template = project_root / 'templates' / 'cursorrules.md'
    if cursorrules_template.exists():
        content = cursorrules_template.read_text(encoding='utf-8')
        content = content.replace('{topic}', topic)
        content = content.replace('{academic_level}', academic_level)
        (tools_dir / '.cursorrules').write_text(content, encoding='utf-8')
    
    if verbose:
        print("   ✅ Copied refinement tools to output")


def create_output_readme(output_dir: Path, topic: str, verbose: bool = True):
    """Create README.md and CLAUDE.md for the output folder."""
    project_root = Path(__file__).parent.parent
    readme_template = project_root / 'templates' / 'draft_readme.md'
    claude_template = project_root / 'templates' / 'claude.md'
    
    if readme_template.exists():
        shutil.copy(readme_template, output_dir / 'README.md')
        if verbose:
            print("   ✅ Created README.md")
    
    if claude_template.exists():
        shutil.copy(claude_template, output_dir / 'CLAUDE.md')
        if verbose:
            print("   ✅ Created CLAUDE.md")




def fix_single_line_tables(content: str) -> str:
    """
    Fix tables that LLM outputs on a single line.
    
    BUG #15: LLM sometimes generates tables as single concatenated lines:
    | Col1 | Col2 | | Row1 | Data | | Row2 | Data |
    
    This breaks markdown rendering. This function splits them into proper rows.
    """
    lines = content.split('\n')
    fixed_lines = []
    
    for line in lines:
        # Check if this line looks like a single-line table (has ' | | ' pattern)
        if line.strip().startswith('|') and re.search(r'\|\s*\|[:\w*]', line):
            # Split on ' | | ' which indicates row boundary
            parts = re.split(r'\| \|(?=\s*[:*\w-])', line)
            for part in parts:
                if part.strip():
                    fixed_part = part.strip()
                    if not fixed_part.startswith('|'):
                        fixed_part = '| ' + fixed_part
                    if not fixed_part.endswith('|'):
                        fixed_part = fixed_part + ' |'
                    fixed_lines.append(fixed_part)
        else:
            fixed_lines.append(line)
    
    return '\n'.join(fixed_lines)




def deduplicate_appendices(content: str) -> str:
    """
    Remove duplicate appendix sections from draft content.
    
    BUG: LLM sometimes generates duplicate appendix sections when
    generating long-form content across multiple agent calls.
    """
    # Find all appendix headers and track which ones we have seen
    appendix_pattern = re.compile(r"(## Appendix [A-Z]:.*?)(?=## Appendix [A-Z]:|## References|# \d+\.|$)", re.DOTALL)
    
    seen_headers = set()
    matches = list(appendix_pattern.finditer(content))
    
    # Process in reverse order to preserve first occurrence
    for match in reversed(matches):
        appendix_text = match.group(1)
        # Extract just the header (first line)
        header_match = re.match(r"## Appendix ([A-Z]):", appendix_text)
        if header_match:
            header = header_match.group(1)
            if header in seen_headers:
                # This is a duplicate - remove it
                start, end = match.span()
                content = content[:start] + content[end:]
            else:
                seen_headers.add(header)
    
    return content


def get_language_name(language_code: str) -> str:
    """
    Convert language code to full language name for prompts and formatting.
    
    Args:
        language_code: ISO 639-1 language code (e.g., 'en-US', 'en-GB', 'es', 'fr')
    
    Returns:
        Full language name (e.g., 'American English', 'British English', 'Spanish', 'French')
    """
    language_map = {
        # English variants
        'en': 'English',
        'en-US': 'American English',
        'en-GB': 'British English',
        'en-AU': 'Australian English',
        'en-CA': 'Canadian English',
        'en-NZ': 'New Zealand English',
        'en-IE': 'Irish English',
        'en-ZA': 'South African English',
        
        # Other languages
        'de': 'German',
        'de-DE': 'German (Germany)',
        'de-AT': 'German (Austria)',
        'de-CH': 'German (Switzerland)',
        'es': 'Spanish',
        'es-ES': 'Spanish (Spain)',
        'es-MX': 'Spanish (Mexico)',
        'es-AR': 'Spanish (Argentina)',
        'fr': 'French',
        'fr-FR': 'French (France)',
        'fr-CA': 'French (Canada)',
        'fr-BE': 'French (Belgium)',
        'it': 'Italian',
        'pt': 'Portuguese',
        'pt-BR': 'Portuguese (Brazil)',
        'pt-PT': 'Portuguese (Portugal)',
        'nl': 'Dutch',
        'nl-NL': 'Dutch (Netherlands)',
        'nl-BE': 'Dutch (Belgium)',
        'ru': 'Russian',
        'zh': 'Chinese',
        'zh-CN': 'Chinese (Simplified)',
        'zh-TW': 'Chinese (Traditional)',
        'ja': 'Japanese',
        'ko': 'Korean',
        'ar': 'Arabic',
        'hi': 'Hindi',
        'sv': 'Swedish',
        'no': 'Norwegian',
        'da': 'Danish',
        'fi': 'Finnish',
        'pl': 'Polish',
        'cs': 'Czech',
        'tr': 'Turkish',
        'he': 'Hebrew',
        'th': 'Thai',
        'vi': 'Vietnamese',
        'id': 'Indonesian',
        'ms': 'Malay',
        'uk': 'Ukrainian',
        'ro': 'Romanian',
        'hu': 'Hungarian',
        'el': 'Greek',
        'bg': 'Bulgarian',
        'hr': 'Croatian',
        'sk': 'Slovak',
        'sl': 'Slovenian',
        'et': 'Estonian',
        'lv': 'Latvian',
        'lt': 'Lithuanian',
    }
    
    # Return mapped name or default to capitalized code
    return language_map.get(language_code, language_code.upper())


def get_word_count_targets(academic_level: str) -> dict:
    """
    Get word count targets based on academic level.
    Only provides total word count and metadata — chapter-level targets
    are determined dynamically by the Architect agent in the outline.
    """
    targets = {
        'research_paper': {
            'total': '3,000-5,000',
            'chapters': '3-5',
            'min_citations': 8,
            'deep_research_min_sources': 12,
            'estimated_time_minutes': '5-10',
        },
        'bachelor': {
            'total': '10,000-15,000',
            'chapters': '5-7',
            'min_citations': 12,
            'deep_research_min_sources': 20,
            'estimated_time_minutes': '8-15',
        },
        'master': {
            'total': '25,000-30,000',
            'chapters': '7-10',
            'min_citations': 20,
            'deep_research_min_sources': 30,
            'estimated_time_minutes': '10-25',
        },
        'phd': {
            'total': '50,000-80,000',
            'chapters': '10-15',
            'min_citations': 30,
            'deep_research_min_sources': 40,
            'estimated_time_minutes': '20-40',
        },
    }
    return targets.get(academic_level, targets['master'])


def parse_outline_chapters(outline: str) -> list:
    """
    Parse the outline into a list of chapters.

    Looks for `##` level headings as chapter boundaries.
    Each chapter dict contains:
      - 'heading': the full heading text (e.g. "Chapter 1: Introduction (~800 words)")
      - 'title': clean chapter name (e.g. "Introduction")
      - 'word_target': extracted word count target string (e.g. "800") or None
      - 'content': full outline content for this chapter (heading + subsections)
      - 'index': chapter number (1-based)

    Returns:
        List of chapter dicts in outline order
    """
    lines = outline.split('\n')
    chapters = []
    current_chapter = None

    for line in lines:
        stripped = line.strip()
        # Match ## level headings (chapter boundaries)
        heading_match = re.match(r'^##\s+(.+)', stripped)
        if heading_match and not stripped.startswith('###'):
            # Save previous chapter
            if current_chapter:
                current_chapter['content'] = '\n'.join(current_chapter['_lines']).strip()
                del current_chapter['_lines']
                chapters.append(current_chapter)

            heading_text = heading_match.group(1).strip()

            # Extract word target from heading like "(~800 words)" or "(~800字)"
            word_match = re.search(r'\(~?([\d,]+)(?:\s*[-~]\s*[\d,]+)?\s*(?:words|字)\)', heading_text, re.IGNORECASE)
            word_target = word_match.group(1).replace(',', '') if word_match else None

            # Extract clean title: remove "Chapter N:" prefix and word count suffix
            title = re.sub(r'^(?:Chapter|第)\s*\d+\s*[:：]\s*', '', heading_text, flags=re.IGNORECASE)
            title = re.sub(r'\s*\(~?[\d,]+(?:\s*[-~]\s*[\d,]+)?\s*(?:words|字)\)\s*$', '', title, flags=re.IGNORECASE)
            title = title.strip()

            current_chapter = {
                'heading': heading_text,
                'title': title,
                'word_target': word_target,
                'index': len(chapters) + 1,
                '_lines': [line],
            }
        elif current_chapter:
            current_chapter['_lines'].append(line)

    # Don't forget the last chapter
    if current_chapter:
        current_chapter['content'] = '\n'.join(current_chapter['_lines']).strip()
        del current_chapter['_lines']
        chapters.append(current_chapter)

    return chapters


def extract_outline_section(outline: str, chapter_keywords: list) -> str:
    """
    Extract a specific chapter's content from the full outline by keyword matching.
    Kept for backward compatibility.
    """
    lines = outline.split('\n')
    result_lines = []
    capturing = False
    capture_level = 0

    for line in lines:
        stripped = line.strip()
        heading_match = re.match(r'^(#{1,6})\s+(.*)', stripped)
        if heading_match:
            level = len(heading_match.group(1))
            heading_text = heading_match.group(2).lower()
            if capturing:
                if level <= capture_level:
                    break
            if not capturing:
                for kw in chapter_keywords:
                    if kw.lower() in heading_text:
                        capturing = True
                        capture_level = level
                        break
        if capturing:
            result_lines.append(line)

    return '\n'.join(result_lines).strip()


def clean_malformed_markdown(content: str) -> str:
    """
    Clean up common markdown formatting issues.
    
    Fixes:
    - Orphaned code fences (``` not paired)
    - Multiple consecutive blank lines
    - Stray markdown characters
    """
    # Fix orphaned code fences (``` without matching pair)
    lines = content.split("\n")
    fence_count = 0
    fence_positions = []
    
    for i, line in enumerate(lines):
        if line.strip() == "```":
            fence_count += 1
            fence_positions.append(i)
    
    # If odd number of fences, remove the last orphaned one
    if fence_count % 2 == 1 and fence_positions:
        # Find and remove the last orphaned fence
        last_fence = fence_positions[-1]
        lines[last_fence] = ""
    
    content = "\n".join(lines)
    
    # Clean up multiple consecutive blank lines (more than 2)
    content = re.sub(r"\n{4,}", "\n\n\n", content)
    
    # Clean up trailing whitespace on lines
    content = re.sub(r"[ \t]+$", "", content, flags=re.MULTILINE)
    
    return content


def generate_draft(
    topic: str,
    language: str = "en",
    academic_level: str = "master",
    output_dir: Optional[Path] = None,
    skip_validation: bool = True,
    verbose: bool = True,
    tracker=None,  # Progress tracker for real-time updates
    streamer=None,  # Milestone streamer for partial results
    blurb: Optional[str] = None,  # Additional context/focus for the thesis
    # Academic metadata for professional cover page
    author_name: Optional[str] = None,
    institution: Optional[str] = None,
    department: Optional[str] = None,
    faculty: Optional[str] = None,
    advisor: Optional[str] = None,
    second_examiner: Optional[str] = None,
    location: Optional[str] = None,
    student_id: Optional[str] = None,
    output_formats: Optional[List[str]] = None,  # e.g. ['pdf', 'docx', 'md']; defaults to ['pdf', 'docx']
    target_words: Optional[str] = None,       # e.g. '3000-5000', overrides academic_level default
    target_citations: Optional[int] = None,   # e.g. 30, overrides academic_level default
    provided_outline: Optional[str] = None,   # Pre-approved outline to skip outline generation
) -> Tuple[Optional[Path], Optional[Path]]:
    """
    Generate a complete academic draft using 19 specialized AI agents.

    This is a simplified, production-ready version of the test workflow,
    optimized for automated processing on Modal.com or similar platforms.

    Args:
        topic: Draft topic (e.g., "Machine Learning for Climate Prediction")
        language: Draft language code (e.g., 'en-US', 'en-GB', 'de', 'es', 'fr', etc.)
        academic_level: 'bachelor', 'master', or 'phd'
        output_dir: Custom output directory (default: config.paths.output_dir / "generated_draft")
        skip_validation: Skip strict quality gates (recommended for automated runs)
        verbose: Print progress messages
        author_name: Student's full name (for cover page)
        institution: University/institution name
        department: Department name
        faculty: Faculty name
        advisor: First examiner/advisor name
        second_examiner: Second examiner name
        location: City/location for date line
        student_id: Student matriculation number

    Returns:
        Tuple[Path, Path]: (pdf_path, docx_path) - Paths to generated draft files

    Raises:
        ValueError: If insufficient citations found or generation fails
        Exception: If any critical step fails

    Example:
        >>> pdf, docx = generate_draft(
        ...     topic="AI-Assisted Academic Writing",
        ...     language="en",
        ...     academic_level="master",
        ...     author_name="John Smith",
        ...     institution="MIT",
        ...     skip_validation=True
        ... )
        >>> print(f"Generated: {pdf} and {docx}")
    """
    # ====================================================================
    # STARTUP AND INITIALIZATION
    # ====================================================================
    draft_start_time = time.time()
    logger.info("="*80)
    logger.info("DRAFT GENERATION STARTED")
    logger.info("="*80)
    logger.info(f"Topic: {topic}")
    logger.info(f"Language: {language}")
    logger.info(f"Academic Level: {academic_level}")
    logger.info(f"Validation: {'Skipped' if skip_validation else 'Enabled'}")
    logger.info(f"Tracker: {'Enabled' if tracker else 'Disabled'}")
    logger.info(f"Streamer: {'Enabled' if streamer else 'Disabled'}")
    if author_name:
        logger.info(f"Author: {author_name}")
    if institution:
        logger.info(f"Institution: {institution}")
    logger.info(f"Process PID: {os.getpid()}")
    logger.info(f"Python: {sys.version}")
    log_memory_usage("Initial")
    logger.info("="*80)

    # Build global language instruction for all writing agents
    lang_name = get_language_name(language)
    language_instruction = f"\n\n**CRITICAL: You MUST write the entire output in {lang_name}. All headings, body text, table content, and captions must be in {lang_name}. Do NOT mix languages.**"

    # ====================================================================
    # IMMEDIATE PROGRESS UPDATE - User sees this within 1-2 seconds
    # ====================================================================
    if tracker:
        tracker.log_activity("🚀 Generation started", event_type="milestone", phase="research")
        tracker.update_phase("research", progress_percent=1, details={"stage": "initializing"})

    try:
        config = get_config()

        if verbose:
            print("="*70)
            print("DRAFT GENERATION - AUTOMATED WORKFLOW")
            print("="*70)
            print(f"Topic: {topic}")
            print(f"Language: {language}")
            print(f"Level: {academic_level}")
            print(f"Validation: {'Skipped' if skip_validation else 'Enabled'}")
            print("="*70)

        # Setup
        logger.info("[SETUP] Initializing Gemini model...")

        # Progress: Loading AI model
        if tracker:
            tracker.log_activity("🤖 Loading AI model...", event_type="info", phase="research")

        model = setup_model()
        logger.info("[SETUP] Model initialized successfully")

        # Progress: Model loaded
        if tracker:
            tracker.log_activity("✅ AI model ready", event_type="found", phase="research")
            tracker.update_phase("research", progress_percent=3, details={"stage": "model_loaded"})

        if output_dir is None:
            output_dir = config.paths.output_dir / "generated_draft"

        logger.info(f"[SETUP] Output directory: {output_dir}")

        # Create organized folder structure
        logger.info("[SETUP] Creating folder structure...")
        folders = setup_output_folders(output_dir)
        logger.info(f"[SETUP] Created folders: {', '.join(folders.keys())}")

        if verbose:
            print(f"📁 Output folder: {output_dir}")

        # Prepare research topics (simplified for automated runs)
        # Include blurb context if provided
        topic_context = f"{topic}"
        if blurb:
            topic_context = f"{topic}\n\nFocus/Context: {blurb}"
        
        research_topics = [
            f"{topic} fundamentals and background",
            f"{topic} current state of research",
            f"{topic} methodology and approaches",
            f"{topic} applications and case studies",
            f"{topic} challenges and limitations",
            f"{topic} future directions and implications"
        ]
        
        # If blurb provided, add it to the research context
        if blurb:
            research_topics.insert(0, f"{topic} - {blurb}")

        # ====================================================================
        # PHASE 1: RESEARCH
        # ====================================================================
        if verbose:
            print("\n📚 PHASE 1: RESEARCH")

        if tracker:
            tracker.log_activity("🔍 Starting academic research", event_type="search", phase="research")
            tracker.update_phase("research", progress_percent=5, details={"stage": "starting_research"})
            tracker.check_cancellation()  # Check before starting major phase

        try:
            # Create progress callback that reports to tracker
            def progress_callback(message: str, event_type: str) -> None:
                if tracker:
                    tracker.log_activity(message, event_type=event_type, phase="research")

            # Get citation requirements based on academic level
            word_targets = get_word_count_targets(academic_level)
            if target_citations is not None:
                word_targets['min_citations'] = target_citations
                word_targets['deep_research_min_sources'] = max(target_citations * 2, 20)
            if target_words is not None:
                word_targets['total'] = target_words
            min_citations = word_targets['min_citations']
            deep_research_min = word_targets['deep_research_min_sources']

            scout_result = research_citations_via_api(
                model=model,
                research_topics=research_topics,
                output_path=folders['research'] / "scout_raw.md",
                target_minimum=min_citations,  # Dynamic based on academic level
                verbose=verbose,
                use_deep_research=True,
                topic=topic,
                scope=topic,
                min_sources_deep=deep_research_min,  # Dynamic deep research depth
                progress_callback=progress_callback,  # Pass callback for database-specific messages
            )

            if verbose:
                print(f"✅ Scout: {scout_result['count']} citations found")

            if tracker:
                # Log each source found to activity feed
                all_citations = scout_result.get('citations', [])
                for i, citation in enumerate(all_citations[:10]):  # Show first 10 directly
                    tracker.log_source_found(
                        title=citation.title,
                        authors=citation.authors[:3] if citation.authors else None,
                        year=citation.year,
                        source_type=citation.api_source or "paper",
                        doi=getattr(citation, 'doi', None),
                        url=getattr(citation, 'url', None)
                    )
                # If more than 10, send collapsed group with all remaining citation data
                if len(all_citations) > 10:
                    remaining = all_citations[10:]
                    remaining_data = []
                    for c in remaining:
                        link = ''
                        if getattr(c, 'doi', None):
                            link = f'https://doi.org/{c.doi}'
                        elif getattr(c, 'url', None):
                            link = c.url
                        author_str = ', '.join(c.authors[:2]) if c.authors else ''
                        if len(c.authors or []) > 2:
                            author_str += ' et al.'
                        ref = f'{author_str} ({c.year})' if c.year else author_str
                        remaining_data.append({'title': c.title[:80], 'ref': ref, 'url': link})
                    import json as _json
                    tracker.log_activity(f"...and {len(remaining)} more sources||EXPAND||{_json.dumps(remaining_data, ensure_ascii=False)}", event_type="found", phase="research")

                tracker.update_research(sources_count=scout_result['count'], phase_detail="Scout completed")

            scout_output = (folders['research'] / "scout_raw.md").read_text(encoding='utf-8')

        except ValueError as e:
            raise ValueError(f"Insufficient citations for draft generation: {str(e)}")

        rate_limit_delay()

        # Scribe - Summarize top 8 papers (deep analysis)
        # Only the top 8 most relevant papers are deeply read and summarized.
        # All other citations remain in the database for {cite_XXX} references.
        MAX_DEEP_READ = 8
        all_citations = scout_result.get('citations', [])
        top_papers_text = ""
        for i, c in enumerate(all_citations[:MAX_DEEP_READ]):
            authors_str = ', '.join(c.authors[:3]) if c.authors else 'Unknown'
            top_papers_text += f"\n### Paper {i+1}: {c.title}\n"
            top_papers_text += f"**Authors:** {authors_str}\n"
            top_papers_text += f"**Year:** {c.year or 'N/A'}\n"
            if getattr(c, 'abstract', None):
                top_papers_text += f"**Abstract:** {c.abstract[:500]}\n"
            if getattr(c, 'doi', None):
                top_papers_text += f"**DOI:** {c.doi}\n"
            top_papers_text += "\n"

        if tracker:
            tracker.log_activity("📝 正在深入研究论文..." if language == 'zh' else "📝 Deep reading research papers...", event_type="info", phase="research")
        scribe_output = run_agent(
            model=model,
            name="Scribe - Summarize Papers",
            prompt_path="prompts/01_research/scribe.md",
            user_input=f"Summarize these {min(MAX_DEEP_READ, len(all_citations))} key research papers in depth:\n\n{top_papers_text}",
            save_to=folders['research'] / "combined_research.md",
            skip_validation=skip_validation,
            verbose=verbose,
            clean_thinking=False
        )
        if tracker:
            tracker.log_activity("✅ Research summaries complete", event_type="found", phase="research")

        # Split scribe output into individual paper files
        if tracker:
            tracker.log_activity("📚 Organizing research papers...", event_type="info", phase="research")
        split_scribe_to_papers(scribe_output, folders['papers'], verbose=verbose)
        
        # ALSO extract ALL citations from scout_raw.md as papers (not just Scribe-analyzed ones)
        # This ensures all 50 citations become individual paper files for Cursor usage
        extract_all_citations_as_papers(
            scout_output_path=folders['research'] / "scout_raw.md",
            papers_dir=folders['papers'],
            verbose=verbose
        )
        if tracker:
            tracker.log_activity("✅ All research papers organized", event_type="found", phase="research")

        rate_limit_delay()

        # Signal - Gap analysis
        if tracker:
            tracker.log_activity("🔍 Analyzing research gaps...", event_type="info", phase="research")
        signal_output = run_agent(
            model=model,
            name="Signal - Research Gaps",
            prompt_path="prompts/01_research/signal.md",
            user_input=f"Analyze research gaps:\n\n{smart_truncate(scribe_output, max_chars=8000)}",
            save_to=folders['research'] / "research_gaps.md",
            skip_validation=skip_validation,
            verbose=verbose,
            clean_thinking=False
        )
        if tracker:
            tracker.log_activity("✅ Research gaps identified", event_type="found", phase="research")
            tracker.log_activity("📋 Preparing thesis structure...", event_type="info", phase="structure")

        rate_limit_delay()

        # ====================================================================
        # PHASE 2: STRUCTURE
        # ====================================================================
        if verbose:
            print("\n🏗️  PHASE 2: STRUCTURE")

        if tracker:
            tracker.log_activity("📋 Designing thesis structure", event_type="milestone", phase="structure")
            tracker.update_phase("structure", progress_percent=25, details={"stage": "creating_outline"})
            tracker.check_cancellation()

        # Get word count targets based on academic level
        word_targets = get_word_count_targets(academic_level)
        total_words = word_targets['total']
        chapters_info = word_targets['chapters']

        if provided_outline:
            # Use pre-approved outline from user
            if tracker:
                tracker.log_activity("📋 Using approved outline", event_type="info", phase="structure")
            outline_output = provided_outline
            (folders['drafts'] / "00_outline.md").write_text(provided_outline, encoding='utf-8')
            if tracker:
                tracker.log_activity("✅ Outline created", event_type="found", phase="structure")
        else:
            # Architect - Create adaptive outline (no fixed template)
            if tracker:
                tracker.log_activity("🏗️ Creating thesis outline...", event_type="info", phase="structure")

            doc_type_labels = {
                'research_paper': 'short research paper',
                'bachelor': 'bachelor\'s thesis',
                'master': 'master\'s thesis',
                'phd': 'PhD dissertation'
            }
            doc_type = doc_type_labels.get(academic_level, 'master\'s thesis')

            outline_context = f"""Design the optimal paper structure for the following topic.

Topic: {topic}
{f"Focus/Context: {blurb}" if blurb else ""}

Research gaps identified:
{signal_output[:3000]}

Requirements:
- Academic level: {doc_type}
- Total word count: {total_words} words
- Target chapters: {chapters_info} chapters
- {language_instruction.strip() if language_instruction else "Language: English"}

IMPORTANT: Do NOT use a fixed IMRaD template. Analyze the topic and design a structure that best fits THIS specific topic. Think about what structure top-cited papers on this exact topic would use."""

            outline_output = run_agent(
                model=model,
                name="Architect - Design Structure",
                prompt_path="prompts/02_structure/architect.md",
                user_input=outline_context,
                save_to=folders['drafts'] / "00_outline.md",
                skip_validation=skip_validation,
                verbose=verbose,
                clean_thinking=False
            )
            if tracker:
                tracker.log_activity("✅ Outline created", event_type="found", phase="structure")

        # Parse outline into chapters for dynamic writing
        outline_chapters = parse_outline_chapters(outline_output)
        logger.info(f"Parsed {len(outline_chapters)} chapters from outline:")
        for ch in outline_chapters:
            logger.info(f"  Chapter {ch['index']}: {ch['title']} (target: {ch['word_target'] or 'unspecified'} words)")

        if not outline_chapters:
            logger.warning("Could not parse chapters from outline, will use outline as single chapter")
            outline_chapters = [{
                'heading': 'Paper Content',
                'title': 'Paper Content',
                'word_target': None,
                'content': outline_output,
                'index': 1,
            }]

        # MILESTONE: Outline Complete - Stream to user for review
        if streamer:
            streamer.stream_outline_complete(
                outline_path=folders['drafts'] / "00_outline.md",
                chapters_count=len(outline_chapters)
            )

        # Update progress with outline milestone
        if tracker:
            tracker.update_phase("structure", progress_percent=30, details={"stage": "outline_complete", "milestone": "outline_complete"})

        rate_limit_delay()

        # ====================================================================
        # PHASE 2.5: CITATION MANAGEMENT
        # ====================================================================
        if verbose:
            print("\n📚 PHASE 2.5: CITATION MANAGEMENT")

        if tracker:
            tracker.log_activity("📚 Processing citations and references...", event_type="info", phase="structure")

        # Create citation database from Scout results
        scout_citations = scout_result['citations']
        for i, citation in enumerate(scout_citations, start=1):
            citation.id = f"cite_{i:03d}"

        citation_database = CitationDatabase(
            citations=scout_citations,
            citation_style="APA 7th",
            draft_language=get_language_name(language).lower()
        )

        # Deduplicate citations
        deduplicated_citations, dedup_stats = deduplicate_citations(
            citation_database.citations,
            strategy='keep_best',
            verbose=verbose
        )
        citation_database.citations = deduplicated_citations

        # Scrape titles and metadata for web sources
        title_scraper = TitleScraper(verbose=False)
        title_scraper.scrape_citations(citation_database.citations)

        metadata_scraper = MetadataScraper(verbose=False)
        metadata_scraper.scrape_citations(citation_database.citations)

        # Save citation database to research folder
        citation_db_path = folders['research'] / "bibliography.json"
        save_citation_database(citation_database, citation_db_path)

        # Quality filtering (auto-fix mode for automated runs)
        filter_obj = CitationQualityFilter(strict_mode=False)  # Non-strict for automation
        filter_obj.filter_database(citation_db_path, citation_db_path)

        # Reload filtered database
        citation_database = load_citation_database(citation_db_path)

        if verbose:
            print(f"✅ Citations: {len(citation_database.citations)} unique")

        if tracker:
            tracker.log_activity(f"✅ {len(citation_database.citations)} citations ready", event_type="found", phase="structure")

        # MILESTONE: Research Complete - Stream to user
        if streamer:
            streamer.stream_research_complete(
                sources_count=len(citation_database.citations),
                bibliography_path=citation_db_path
            )
    
        # Update progress with specific detail
        if tracker:
            tracker.update_phase("structure", progress_percent=23, sources_count=len(citation_database.citations), details={"stage": "research_complete", "milestone": "research_complete"})

        # Prepare comprehensive citation database for writing agents
        citation_summary = f"\n\n{'='*80}\n## CITATION DATABASE - {len(citation_database.citations)} CITATIONS AVAILABLE\n{'='*80}\n\n"
        citation_summary += "⚠️  **CRITICAL CITATION RESTRICTION** ⚠️\n\n"
        citation_summary += "You MUST ONLY cite papers from this database. DO NOT:\n"
        citation_summary += "- Cite papers from your training data\n"
        citation_summary += "- Invent or hallucinate citations\n"
        citation_summary += "- Reference papers not listed below\n"
        citation_summary += "- Use author names not in this database\n\n"
        citation_summary += "Citation format: Use {{cite_XXX}} where XXX is the citation ID shown below.\n"
        citation_summary += f"\n{'='*80}\n\n"

        # Include ALL citations with comprehensive details
        for i, citation in enumerate(citation_database.citations, 1):
            authors_str = ", ".join(citation.authors[:3])
            if len(citation.authors) > 3:
                authors_str += " et al."

            citation_summary += f"{i}. **[{citation.id}]** {authors_str} ({citation.year})\n"
            citation_summary += f"   Title: {citation.title}\n"

            if citation.doi:
                citation_summary += f"   DOI: {citation.doi}\n"
            if citation.journal:
                citation_summary += f"   Journal: {citation.journal}\n"
            if citation.abstract:
                # First 300 chars of abstract
                abstract_preview = citation.abstract[:300]
                if len(citation.abstract) > 300:
                    abstract_preview += "..."
                citation_summary += f"   Abstract: {abstract_preview}\n"

            citation_summary += f"   Citation format: {{{{cite_{citation.id}}}}}\n\n"

        citation_summary += f"\n{'='*80}\n"
        citation_summary += f"Total citations available: {len(citation_database.citations)}\n"
        citation_summary += "Remember: ONLY cite from this list. No external citations allowed.\n"
        citation_summary += f"{'='*80}\n"

        rate_limit_delay()

        # ====================================================================
        # PHASE 3: COMPOSE - Dynamic chapter writing based on outline
        # ====================================================================
        logger.info("="*80)
        logger.info("PHASE 3: COMPOSE - Writing chapters dynamically from outline")
        logger.info("="*80)
        log_memory_usage("Before PHASE 3")

        if verbose:
            print("\n✍️  PHASE 3: COMPOSE")

        if tracker:
            tracker.log_activity("✍️ Starting paper writing...", event_type="milestone", phase="writing")
            tracker.update_phase("writing", progress_percent=35, chapters_count=0, details={"stage": "starting_composition"})
            tracker.check_cancellation()
            tracker.send_heartbeat()

        # Dynamic chapter writing — iterate outline_chapters in order
        total_chapters = len(outline_chapters)
        chapter_outputs = {}  # {index: output_text}
        chapter_files = {}    # {index: file_path}

        # ===== DYNAMIC CHAPTER WRITING =====
        compose_start = time.time()
        for ch in outline_chapters:
            ch_idx = ch['index']
            ch_title = ch['title']
            ch_word_target = ch['word_target'] or '1000'
            ch_content = ch['content']  # outline section for this chapter
            ch_file = folders['drafts'] / f"{ch_idx:02d}_chapter.md"

            try:
                logger.info(f"[CHAPTER {ch_idx}/{total_chapters}] Starting: {ch_title}")
                logger.info(f"  Target: ~{ch_word_target} words")
                logger.info(f"  Output: {ch_file}")
                chapter_start = time.time()
                log_memory_usage(f"Before Chapter {ch_idx}")

                if tracker:
                    ch_label = f"✍️ Writing: {ch_title}..." if language != 'zh' else f"✍️ 正在撰写：{ch_title}..."
                    tracker.log_activity(ch_label, event_type="writing", phase="writing")

                # Status callback for refine progress
                def _ch_status(status, _title=ch_title, _lang=language):
                    if tracker:
                        if status == "refining":
                            label = f"🔄 Polishing: {_title}..." if _lang != 'zh' else f"🔄 正在润色：{_title}..."
                            tracker.log_activity(label, event_type="refining", phase="writing")
                        elif status == "refined":
                            label = f"✨ Polished: {_title}" if _lang != 'zh' else f"✨ 润色完成：{_title}"
                            tracker.log_activity(label, event_type="refined", phase="writing")

                ch_output = run_agent(
                    model=model,
                    name=f"Crafter - {ch_title}",
                    prompt_path="prompts/03_compose/crafter.md",
                    user_input=f"""Write Chapter {ch_idx} of {total_chapters} for the following paper.

Topic: {topic}

**THIS IS CHAPTER {ch_idx}: {ch_title}**

**OUTLINE FOR THIS CHAPTER (you MUST follow this structure exactly):**
{ch_content}

{citation_summary}

**REQUIREMENTS:**
1. Write approximately {ch_word_target} words
2. This is Chapter {ch_idx} — all section numbers must start with {ch_idx}. (e.g., {ch_idx}.1, {ch_idx}.2, {ch_idx}.1.1)
3. Follow the outline's heading structure and subsections exactly — do NOT invent your own structure
4. Cover every point listed in the outline
5. Tables: max 300 chars per cell, max 5 columns. Put details in prose after tables
6. Use {{cite_XXX}} format for citations{language_instruction}""",
                    save_to=ch_file,
                    skip_validation=skip_validation,
                    verbose=verbose,
                    on_status=_ch_status
                )

                chapter_outputs[ch_idx] = ch_output
                chapter_files[ch_idx] = ch_file

                chapter_time = time.time() - chapter_start
                chapter_size = ch_file.stat().st_size if ch_file.exists() else 0
                logger.info(f"[CHAPTER {ch_idx}/{total_chapters}] ✅ Complete in {chapter_time:.1f}s")
                logger.info(f"  File size: {chapter_size:,} bytes (~{chapter_size//6:,} words)")

                if tracker:
                    done_label = f"✅ {ch_title} complete" if language != 'zh' else f"✅ {ch_title}完成"
                    tracker.log_activity(done_label, event_type="complete", phase="writing")
                    progress = 35 + int(55 * ch_idx / total_chapters)
                    tracker.update_phase("writing", progress_percent=min(progress, 88), chapters_count=ch_idx, details={"stage": f"chapter_{ch_idx}_complete"})

                # Stream chapter to frontend
                if streamer:
                    streamer.stream_chapter_complete(
                        chapter_num=ch_idx,
                        chapter_name=ch_title,
                        chapter_path=ch_file
                    )

            except Exception as e:
                logger.error(f"[CHAPTER {ch_idx}/{total_chapters}] ❌ FAILED: {e}")
                logger.error(f"[TRACEBACK] {traceback.format_exc()}")
                if tracker:
                    tracker.mark_failed(f"Chapter {ch_idx} ({ch_title}) failed: {e}")
                raise

            rate_limit_delay()

        compose_time = time.time() - compose_start
        logger.info(f"PHASE 3 COMPLETE - {total_chapters} chapters written in {compose_time:.1f}s ({compose_time/60:.1f} min)")

        # Build body_output from all chapters for downstream use
        body_output = ""
        for ch_idx in sorted(chapter_outputs.keys()):
            body_output += chapter_outputs[ch_idx] + "\n\n"
        body_output = body_output.strip()

        rate_limit_delay()

        # ====================================================================
        # PHASE 3.5: QUALITY ASSURANCE (QA Pass)
        # ====================================================================
        logger.info("="*80)
        logger.info("PHASE 3.5: QUALITY ASSURANCE - Narrative consistency & voice unification")
        logger.info("="*80)
        log_memory_usage("Before QA Pass")

        if verbose:
            print("\n🔍 PHASE 3.5: QUALITY ASSURANCE")

        # Prepare all chapter content for QA review (dynamic)
        all_chapters_for_qa = f"# Complete Draft for QA Review\n\nTopic: {topic}\n\n"
        for ch in outline_chapters:
            ch_text = chapter_outputs.get(ch['index'], '')
            # Truncate each chapter to first+last 1000 chars for QA context
            if len(ch_text) > 2500:
                ch_text = ch_text[:1200] + "\n[... truncated ...]\n" + ch_text[-1200:]
            all_chapters_for_qa += f"## Chapter {ch['index']}: {ch['title']}\n{ch_text}\n\n"

        # === QA STEP 1: Thread Agent - Narrative Consistency ===
        try:
            logger.info("[QA 1/2] Running Thread agent - Narrative Consistency Check")
            qa_start = time.time()

            thread_report = run_agent(
                model=model,
                name="Thread - Narrative Consistency",
                prompt_path="prompts/03_compose/thread.md",
                user_input=f"""Review the complete draft for narrative consistency.

{all_chapters_for_qa}

**Check for:**
1. Contradictions across chapters
2. Fulfilled promises (early chapters → later chapters)
3. Proper cross-references between chapters
4. Consistent terminology throughout
5. Logical flow between all chapters""",
                save_to=folders['drafts'] / "qa_narrative_consistency.md",
                skip_validation=True,
                verbose=verbose,
                clean_thinking=False
            )

            thread_time = time.time() - qa_start
            logger.info(f"[QA 1/2] ✅ Thread agent complete in {thread_time:.1f}s")

            if tracker:
                tracker.update_phase("writing", progress_percent=78, chapters_count=4, details={"stage": "qa_narrative_complete"})

        except Exception as e:
            logger.warning(f"[QA 1/2] ⚠️  Thread agent failed: {e}")
            logger.warning("Continuing without narrative consistency check...")

        rate_limit_delay()

        # === QA STEP 2: Narrator Agent - Voice Unification ===
        try:
            logger.info("[QA 2/2] Running Narrator agent - Voice Unification Check")
            qa_start = time.time()

            narrator_report = run_agent(
                model=model,
                name="Narrator - Voice Unification",
                prompt_path="prompts/03_compose/narrator.md",
                user_input=f"""Review the complete draft for voice consistency.

{all_chapters_for_qa}

**Check for:**
1. Consistent tone (formal, objective, confident)
2. Proper person usage (first/third person)
3. Appropriate tense by section
4. Uniform vocabulary level
5. Consistent hedging language

**Target:** Academic {academic_level}-level draft
**Citation style:** {citation_database.citation_style}""",
                save_to=folders['drafts'] / "qa_voice_unification.md",
                skip_validation=True,
                verbose=verbose,
                clean_thinking=False
            )

            narrator_time = time.time() - qa_start
            logger.info(f"[QA 2/2] ✅ Narrator agent complete in {narrator_time:.1f}s")

            if tracker:
                tracker.update_phase("writing", progress_percent=80, chapters_count=4, details={"stage": "qa_complete"})

        except Exception as e:
            logger.warning(f"[QA 2/2] ⚠️  Narrator agent failed: {e}")
            logger.warning("Continuing without voice unification check...")

        logger.info("="*80)
        logger.info("PHASE 3.5 COMPLETE - QA reports generated")
        logger.info(f"  Reports saved to: {folders['drafts']}/qa_*.md")
        logger.info("="*80)
        log_memory_usage("After QA Pass")

        rate_limit_delay()

        # Copy refinement tools and create README
        copy_tools_to_output(folders['tools'], topic, academic_level, verbose)
        create_output_readme(output_dir, topic, verbose)

        # ====================================================================
        # PHASE 4: COMPILE & ENHANCE
        # ====================================================================
        if verbose:
            print("\n🔧 PHASE 4: COMPILE")

        if tracker:
            tracker.log_activity("🔧 Starting document compilation", event_type="milestone", phase="compiling")
            tracker.update_phase("compiling", progress_percent=75, details={"stage": "assembling_draft"})
            tracker.check_cancellation()  # Check before starting major phase

        # Generate current date for cover page
        from datetime import datetime
        current_date = datetime.now().strftime("%B %Y")

        # Calculate word count from all chapters
        all_chapter_text = "\n".join(chapter_outputs[k] for k in sorted(chapter_outputs.keys()))
        word_count = len(all_chapter_text.split())
        pages_estimate = word_count // 250

        # Determine labels
        draft_type_labels = {
            'research_paper': 'Research Paper',
            'bachelor': 'Bachelor Draft',
            'master': 'Master Draft',
            'phd': 'PhD Dissertation'
        }
        draft_type = draft_type_labels.get(academic_level, 'Master Draft')
        degree_labels = {
            'research_paper': 'Research Paper',
            'bachelor': 'Bachelor of Science',
            'master': 'Master of Science',
            'phd': 'Doctor of Philosophy'
        }
        degree = degree_labels.get(academic_level, 'Master of Science')

        yaml_author = author_name or ""
        yaml_institution = institution or ""
        yaml_department = department or ""
        yaml_faculty = faculty or ""
        yaml_advisor = advisor or ""
        yaml_second_examiner = second_examiner or ""
        yaml_location = location or ""
        yaml_student_id = student_id or ""

        # Build YAML frontmatter
        full_draft = f"""---
title: "{topic}"
author: "{yaml_author}"
date: "{current_date}"
institution: "{yaml_institution}"
department: "{yaml_department}"
faculty: "{yaml_faculty}"
degree: "{degree}"
advisor: "{yaml_advisor}"
second_examiner: "{yaml_second_examiner}"
location: "{yaml_location}"
student_id: "{yaml_student_id}"
project_type: "{draft_type}"
word_count: "{word_count:,} words"
pages: "{pages_estimate}"
---

## {"摘要" if language == 'zh' else "Abstract"}
[Abstract will be generated]

\\newpage

"""

        # Generate Table of Contents
        toc_label = "目录" if language == 'zh' else "Table of Contents"
        full_draft += f"# {toc_label}\n\n"
        for ch in outline_chapters:
            if language == 'zh':
                full_draft += f"- **第{ch['index']}章** {ch['title']}\n"
            else:
                full_draft += f"- **Chapter {ch['index']}:** {ch['title']}\n"
        full_draft += "\n\\newpage\n\n"

        # Assemble all chapters dynamically
        for ch in outline_chapters:
            ch_text = chapter_outputs.get(ch['index'], '')
            if language == 'zh':
                full_draft += f"# 第{ch['index']}章 {ch['title']}\n\n{ch_text}\n\n\\newpage\n\n"
            else:
                full_draft += f"# Chapter {ch['index']}: {ch['title']}\n\n{ch_text}\n\n\\newpage\n\n"

        # References placeholder
        ref_label = "参考文献" if language == 'zh' else "References"
        full_draft += f"# {ref_label}\n[Citations will be compiled]\n"

        # Citation Compiler - Replace {cite_XXX} with formatted citations
        if tracker:
            tracker.log_activity("📚 Compiling citations and references...", event_type="info", phase="compiling")
        compiler = CitationCompiler(
            database=citation_database,
            model=model
        )

        # Generate reference list BEFORE compile_citations (while {cite_XXX} patterns still exist)
        reference_list = compiler.generate_reference_list(full_draft)

        # Now compile citations (replaces {cite_XXX} with (Author et al., Year) format)
        compiled_draft, replaced_ids, failed_ids = compiler.compile_citations(full_draft, research_missing=True, verbose=verbose)
        if tracker:
            tracker.log_activity(f"✅ Citations compiled ({len(replaced_ids)} references)", event_type="found", phase="compiling")

        # Remove the entire template References section (header + placeholder) to avoid duplication
        # Account for optional leading whitespace from indented templates
        compiled_draft = re.sub(r'^\s*#+ (?:\d+\.\s*)?References\s*\n\s*\[Citations will be compiled\]\s*', '', compiled_draft, flags=re.MULTILINE)
        # Append the generated reference list with citations
        compiled_draft = compiled_draft + reference_list

        # Save intermediate draft for abstract generation
        intermediate_md_path = folders['exports'] / "INTERMEDIATE_DRAFT.md"
        intermediate_md_path.write_text(compiled_draft, encoding='utf-8')

        # Generate abstract using the agent
        if tracker:
            tracker.log_activity("📝 Generating abstract...", event_type="info", phase="compiling")
        abstract_success, abstract_updated_content = generate_abstract_for_draft(
            draft_path=intermediate_md_path,
            model=model,
            run_agent_func=run_agent,
            output_dir=folders['exports'],
            verbose=verbose
        )

        # For Chinese papers, also generate an English abstract
        if language == 'zh' and abstract_success and abstract_updated_content:
            if tracker:
                tracker.log_activity("📝 Generating English abstract...", event_type="info", phase="compiling")
            try:
                # Extract Chinese abstract from the updated content
                zh_abstract_match = re.search(r'## (?:Abstract|摘要)\s*\n(.*?)(?=\n#|\n\\newpage|\Z)', abstract_updated_content, re.DOTALL)
                zh_abstract_text = zh_abstract_match.group(1).strip() if zh_abstract_match else ""
                if zh_abstract_text and '[Abstract will be generated]' not in zh_abstract_text:
                    en_abstract = run_agent(
                        model=model,
                        name="English Abstract Generator",
                        prompt_path="prompts/06_enhance/abstract_generator.md",
                        user_input=f"""Translate and adapt the following Chinese academic abstract into English.
Keep the same structure and academic tone. Output ONLY the English abstract text.

Chinese abstract:
{zh_abstract_text}""",
                        save_to=folders['exports'] / "abstract_english.md",
                        clean_thinking=True
                    )
                    # Insert English abstract after Chinese abstract
                    insert_point = abstract_updated_content.find('\\newpage', abstract_updated_content.find('## Abstract') if '## Abstract' in abstract_updated_content else abstract_updated_content.find('## 摘要'))
                    if insert_point == -1:
                        insert_point = abstract_updated_content.find('\n# ', abstract_updated_content.find('## '))
                    if insert_point > 0:
                        abstract_updated_content = (
                            abstract_updated_content[:insert_point] +
                            f"\n\n## Abstract (English)\n\n{en_abstract}\n\n" +
                            abstract_updated_content[insert_point:]
                        )
                    logger.info("English abstract generated for Chinese paper")
            except Exception as e:
                logger.warning(f"English abstract generation failed: {e}, continuing with Chinese only")

        if tracker:
            tracker.log_activity("✅ Abstract generated", event_type="found", phase="compiling")

        # Read updated draft with abstract
        if abstract_success and abstract_updated_content:
            final_draft = abstract_updated_content
        else:
            final_draft = compiled_draft

        # Generate professional filename from topic
        base_filename = slugify(topic, max_length=50)
        if not base_filename:
            base_filename = "research_paper"

        # Save final markdown
        final_md_path = folders['exports'] / f"{base_filename}.md"
        # Fix single-line tables before saving
        final_draft = fix_single_line_tables(final_draft)
        final_draft = deduplicate_appendices(final_draft)
        final_draft = clean_malformed_markdown(final_draft)
        # Clean AI language patterns (em dashes, overused words)
        from utils.text_utils import clean_ai_language
        final_draft = clean_ai_language(final_draft)
        final_md_path.write_text(final_draft, encoding='utf-8')

        if verbose:
            print(f"✅ Draft compiled: {len(final_draft):,} characters")

        # ====================================================================
        # PHASE 5: EXPORT
        # ====================================================================
        if verbose:
            print("\n📄 PHASE 5: EXPORT")

        formats = set(output_formats) if output_formats else {'pdf', 'docx'}

        if tracker:
            tracker.log_activity("📄 Starting document export", event_type="milestone", phase="exporting")
            tracker.update_exporting(export_type=", ".join(sorted(formats)).upper())
            tracker.check_cancellation()

        pdf_path: Optional[Path] = None
        docx_path: Optional[Path] = None

        # Export PDF
        if 'pdf' in formats:
            pdf_path = folders['exports'] / f"{base_filename}.pdf"
            if tracker:
                tracker.log_activity("📑 Generating PDF...", event_type="info", phase="exporting")
            if verbose:
                print("📄 Exporting PDF (professional formatting)...")
            pdf_success = export_pdf(md_file=final_md_path, output_pdf=pdf_path, engine='pandoc')
            if not pdf_success or not pdf_path.exists():
                logger.warning("PDF export skipped - pandoc not installed.")
                if tracker:
                    tracker.log_activity("⚠️ PDF skipped (pandoc not installed)", event_type="info", phase="exporting")
                if verbose:
                    print("⚠️ PDF skipped - install pandoc to enable PDF output.")
                pdf_path = None
            else:
                if tracker:
                    tracker.log_activity("✅ PDF ready", event_type="found", phase="exporting")
                if verbose:
                    print(f"✅ Exported PDF: {pdf_path}")

        # Export DOCX
        if 'docx' in formats:
            docx_path = folders['exports'] / f"{base_filename}.docx"
            if tracker:
                tracker.log_activity("📝 Creating Word document...", event_type="info", phase="exporting")
            if verbose:
                print("📝 Exporting DOCX...")
            docx_success = export_docx(md_file=final_md_path, output_docx=docx_path)
            if not docx_success or not docx_path.exists():
                raise RuntimeError(f"DOCX export failed - file not created: {docx_path}")
            if tracker:
                tracker.log_activity("✅ Word document ready", event_type="found", phase="exporting")
            if verbose:
                print(f"✅ Exported DOCX: {docx_path}")

        # MD is already written as final_md_path; just report it
        if 'md' in formats:
            if verbose:
                print(f"✅ Markdown: {final_md_path}")

        # ZIP bundle
        zip_files = [f for f in [pdf_path, docx_path] if f and f.exists()]
        zip_files.append(final_md_path)
        zip_path = folders['exports'] / f"{base_filename}.zip"
        try:
            import zipfile
            with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as zf:
                for f in zip_files:
                    zf.write(f, f.name)
            if tracker:
                tracker.log_activity("📦 ZIP bundle created", event_type="found", phase="exporting")
        except Exception as zip_error:
            logger.warning(f"ZIP creation failed (non-critical): {zip_error}")

        if tracker:
            tracker.log_activity("🎉 Generation complete!", event_type="milestone", phase="completed")
            tracker.mark_completed()

        if verbose:
            print(f"📂 Output folder: {output_dir}")
            print("="*70)
            print("✅ DRAFT GENERATION COMPLETE")
            print("="*70)

        # ====================================================================
        # DRAFT GENERATION COMPLETE
        # ====================================================================
        draft_total_time = time.time() - draft_start_time
        logger.info("="*80)
        logger.info("DRAFT GENERATION COMPLETE!")
        logger.info(f"Total time: {draft_total_time:.1f}s ({draft_total_time/60:.1f} minutes)")
        logger.info(f"Formats: {formats}")
        if pdf_path:
            logger.info(f"PDF: {pdf_path}")
        if docx_path:
            logger.info(f"DOCX: {docx_path}")
        logger.info(f"MD: {final_md_path}")
        log_memory_usage("Final")
        logger.info("="*80)

        return pdf_path, docx_path

    except Exception as e:
        draft_total_time = time.time() - draft_start_time
        logger.error("="*80)
        logger.error("DRAFT GENERATION FAILED!")
        logger.error("="*80)
        logger.error(f"Failed after {draft_total_time:.1f}s ({draft_total_time/60:.1f} minutes)")
        logger.error(f"Error: {e}")
        logger.error(f"Error type: {type(e).__name__}")
        logger.error("="*80)
        logger.error("FULL TRACEBACK:")
        logger.error(traceback.format_exc())
        logger.error("="*80)
        log_memory_usage("At failure")

        # Try to update tracker if available
        if tracker:
            try:
                tracker.mark_failed(f"{type(e).__name__}: {str(e)[:200]}")
            except Exception as tracker_error:
                logger.error(f"Failed to update tracker: {tracker_error}")

        # Re-raise the exception
        raise


if __name__ == "__main__":
    import argparse
    import os
    import sys

    parser = argparse.ArgumentParser(description="Generate academic draft")

    # Required arguments
    parser.add_argument("--topic", required=True, help="Draft topic")
    parser.add_argument("--language", default="en", help="Language code (e.g., en-US, en-GB, de, es, fr, etc.)")
    parser.add_argument("--academic-level", default="master", choices=["research_paper", "bachelor", "master", "phd"], help="Academic level")

    # Database integration (optional)
    parser.add_argument("--draft-id", help="Database draft ID for progress tracking")
    parser.add_argument("--mysql-host", help="MySQL host")
    parser.add_argument("--mysql-port", help="MySQL port")
    parser.add_argument("--mysql-user", help="MySQL user")
    parser.add_argument("--mysql-password", help="MySQL password")
    parser.add_argument("--mysql-database", help="MySQL database")
    parser.add_argument("--gemini-key", help="Gemini API key (overrides env var)")

    # Metadata (optional)
    parser.add_argument("--author", help="Author name")
    parser.add_argument("--institution", help="Institution name")
    parser.add_argument("--department", help="Department name")
    parser.add_argument("--faculty", help="Faculty name")
    parser.add_argument("--advisor", help="Advisor name")
    parser.add_argument("--second-examiner", help="Second examiner name")
    parser.add_argument("--location", help="Location")
    parser.add_argument("--student-id", help="Student ID")

    # Other options
    parser.add_argument("--validate", action="store_true", help="Enable strict validation")

    args = parser.parse_args()

    # Set environment variables if provided
    if args.gemini_key:
        os.environ['GEMINI_API_KEY'] = args.gemini_key
    if args.mysql_host:
        os.environ['MYSQL_HOST'] = args.mysql_host
    if args.mysql_port:
        os.environ['MYSQL_PORT'] = str(args.mysql_port)
    if args.mysql_user:
        os.environ['MYSQL_USER'] = args.mysql_user
    if args.mysql_password:
        os.environ['MYSQL_PASSWORD'] = args.mysql_password
    if args.mysql_database:
        os.environ['MYSQL_DATABASE'] = args.mysql_database

    # Initialize database tracker if draft_id provided
    tracker = None
    if args.draft_id:
        from utils.progress_tracker import ProgressTracker
        tracker = ProgressTracker(draft_id=args.draft_id)
        print(f"✅ Database tracking enabled for draft: {args.draft_id}")

    try:
        # Generate draft
        pdf, docx = generate_draft(
            topic=args.topic,
            language=args.language,
            academic_level=args.academic_level,
            skip_validation=not args.validate,
            tracker=tracker,
            # Metadata parameters
            author_name=args.author,
            institution=args.institution,
            department=args.department,
            faculty=args.faculty,
            advisor=args.advisor,
            second_examiner=args.second_examiner,
            location=args.location,
            student_id=args.student_id
        )

        print(f"\n✅ Generated:")
        print(f"   PDF: {pdf}")
        print(f"   DOCX: {docx}")

        sys.exit(0)

    except Exception as e:
        print(f"\n❌ Generation failed: {e}", file=sys.stderr)
        import traceback
        traceback.print_exc()
        sys.exit(1)
