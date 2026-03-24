#!/usr/bin/env python3
"""Web frontend for the paper generator with co-planning & chapter approval."""

import os
import sys
import json
import base64
import uuid
import logging
import time as _time
import threading
import shutil
from pathlib import Path

from flask import Flask, request, jsonify, send_file, Response, stream_with_context
from dotenv import load_dotenv
from db_mysql import ensure_tables, fetch_all, fetch_one, execute

# Ensure project root is on path so draft_generator can import utils/config
sys.path.insert(0, str(Path(__file__).parent))
load_dotenv(Path(__file__).parent / '.env')


class _WerkzeugStatusAccessFilter(logging.Filter):
    """Filter noisy status polling access logs from Werkzeug."""

    _NOISY_PATTERNS = (
        '"GET /api/status/',
        '"GET /api/opendraft/status/',
    )

    def filter(self, record: logging.LogRecord) -> bool:
        try:
            message = record.getMessage()
        except Exception:
            return True
        return not any(pattern in message for pattern in self._NOISY_PATTERNS)


def _install_werkzeug_log_filters() -> None:
    """Install one-time filters for noisy Werkzeug access logs."""
    werkzeug_logger = logging.getLogger('werkzeug')
    if any(isinstance(f, _WerkzeugStatusAccessFilter) for f in werkzeug_logger.filters):
        return
    werkzeug_logger.addFilter(_WerkzeugStatusAccessFilter())


_install_werkzeug_log_filters()


def _apply_process_timezone() -> None:
    """
    Ensure OpenDraft process defaults to Shanghai timezone unless explicitly overridden.
    """
    explicit_tz = os.getenv('OPENDRAFT_TIMEZONE')
    existing_tz = os.getenv('TZ')
    target_tz = (explicit_tz or existing_tz or 'Asia/Shanghai').strip() or 'Asia/Shanghai'
    os.environ['OPENDRAFT_TIMEZONE'] = target_tz
    os.environ['TZ'] = target_tz
    if hasattr(_time, 'tzset'):
        try:
            _time.tzset()
        except Exception:
            pass


_apply_process_timezone()

try:
    ensure_tables()
except Exception as exc:
    raise RuntimeError(f"MySQL initialization failed: {exc}") from exc

app = Flask(__name__, static_folder='static', template_folder='static')

# CORS policy
# Default is fully open ("*") so frontend domain does not need manual config.
# If you want to restrict origins later, set OPENDRAFT_CORS_ORIGINS to a
# comma-separated list (e.g. "http://localhost:3002,http://127.0.0.1:3002").
_ALLOWED_ORIGINS = {
    o.strip() for o in (os.getenv('OPENDRAFT_CORS_ORIGINS') or '*').split(',')
    if o.strip()
}


def _apply_cors_headers(response: Response) -> Response:
    origin = request.headers.get('Origin', '')
    if '*' in _ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = '*'
    elif origin and origin in _ALLOWED_ORIGINS:
        response.headers['Access-Control-Allow-Origin'] = origin
        response.headers['Vary'] = 'Origin'

    response.headers['Access-Control-Allow-Methods'] = 'GET,POST,PUT,DELETE,OPTIONS'
    response.headers['Access-Control-Allow-Headers'] = (
        'Content-Type, Authorization, x-user-id, x-user-uid, x-userid'
    )
    response.headers['Access-Control-Expose-Headers'] = 'Content-Disposition'
    response.headers['Access-Control-Max-Age'] = '86400'
    return response


@app.before_request
def _handle_cors_preflight():
    if request.method == 'OPTIONS':
        return _apply_cors_headers(Response(status=204))
    return None


@app.after_request
def _add_cors_headers(response: Response):
    return _apply_cors_headers(response)


# Track running jobs
_jobs: dict = {}
_jobs_lock = threading.Lock()

def _load_papers() -> list:
    rows = fetch_all(
        """
        SELECT
          job_id, topic, status, user_id, language, level,
          extra_payload, created_at, updated_at
        FROM opendraft_papers
        ORDER BY updated_at DESC
        """
    )
    papers = []
    for row in rows:
        base = {
            'job_id': row.get('job_id'),
            'topic': row.get('topic') or '',
            'status': row.get('status') or 'running',
            'created_at': float(row.get('created_at') or 0),
            'updated_at': float(row.get('updated_at') or 0),
        }
        user_id = row.get('user_id')
        if user_id:
            base['user_id'] = str(user_id)
        if row.get('language'):
            base['language'] = row.get('language')
        if row.get('level'):
            base['level'] = row.get('level')

        extra_payload = row.get('extra_payload')
        if extra_payload:
            try:
                extra_data = json.loads(extra_payload)
                if isinstance(extra_data, dict):
                    base.update(extra_data)
            except Exception:
                pass
        papers.append(base)
    return papers

def _normalize_user_id(value) -> str:
    if value is None:
        return ''
    text = str(value).strip()
    if text.lower() in ('', 'null', 'none', 'undefined'):
        return ''
    return text

def _get_request_payload() -> dict:
    payload = request.get_json(silent=True)
    return payload if isinstance(payload, dict) else {}


def _extract_user_id_from_token(token_value) -> str:
    token = _normalize_user_id(token_value)
    if not token:
        return ''

    # Support Authorization: Bearer <token>
    if token.lower().startswith('bearer '):
        token = token[7:].strip()
    if not token:
        return ''

    parts = token.split('.')
    if len(parts) < 2:
        return ''

    payload_part = parts[1]
    payload_part += '=' * (-len(payload_part) % 4)  # base64url padding
    try:
        decoded = base64.urlsafe_b64decode(payload_part.encode('utf-8')).decode('utf-8')
        payload = json.loads(decoded)
    except Exception:
        return ''

    for key in ('uid', 'user_id', 'userId', 'id', 'sub', 'username'):
        candidate = _normalize_user_id(payload.get(key))
        if candidate:
            return candidate
    return ''


def _get_request_user_id(payload=None) -> str:
    body = payload if isinstance(payload, dict) else {}
    candidates = [
        body.get('uid'),
        body.get('user_id'),
        body.get('userId'),
        request.args.get('uid'),
        request.args.get('user_id'),
        request.args.get('userId'),
        request.headers.get('x-user-id'),
        request.headers.get('x-user-uid'),
        request.headers.get('x-userid'),
    ]
    for candidate in candidates:
        user_id = _normalize_user_id(candidate)
        if user_id:
            return user_id

    token_candidates = [
        body.get('token'),
        request.args.get('token'),
        request.headers.get('Authorization'),
        request.headers.get('authorization'),
        request.headers.get('x-access-token'),
    ]
    for token in token_candidates:
        token_user_id = _extract_user_id_from_token(token)
        if token_user_id:
            return token_user_id
    return ''

def _is_owner_match(resource_user_id, request_user_id) -> bool:
    owner_id = _normalize_user_id(resource_user_id)
    caller_id = _normalize_user_id(request_user_id)
    if caller_id:
        # Authenticated/identified callers can only access their own records.
        return bool(owner_id) and owner_id == caller_id
    # Anonymous callers can only access anonymous records.
    return not owner_id

def _get_owned_job(job_id: str, payload=None):
    request_user_id = _get_request_user_id(payload)
    with _jobs_lock:
        job = _jobs.get(job_id)
    if not job:
        return None, request_user_id, (jsonify({'error': 'Job not found'}), 404)
    if not _is_owner_match(job.get('user_id'), request_user_id):
        return None, request_user_id, (jsonify({'error': 'Forbidden'}), 403)
    return job, request_user_id, None

def _upsert_paper(job_id: str, topic: str, status: str, **extra):
    owner_id = _normalize_user_id(extra.get('user_id'))
    payload_extra = dict(extra)
    if owner_id:
        payload_extra['user_id'] = owner_id
    else:
        payload_extra.pop('user_id', None)

    language = str(payload_extra.pop('language', '') or '').strip() or None
    level = str(payload_extra.pop('level', '') or '').strip() or None

    existing_row = fetch_one(
        "SELECT extra_payload FROM opendraft_papers WHERE job_id = %s LIMIT 1",
        [job_id],
    )
    merged_extra = {}
    if existing_row and existing_row.get('extra_payload'):
        try:
            previous = json.loads(existing_row.get('extra_payload') or '{}')
            if isinstance(previous, dict):
                merged_extra.update(previous)
        except Exception:
            pass
    merged_extra.update(payload_extra)

    now_ts = _time.time()
    execute(
        """
        INSERT INTO opendraft_papers (
          job_id, topic, status, user_id, language, level, extra_payload, created_at, updated_at
        )
        VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s)
        ON DUPLICATE KEY UPDATE
          topic = VALUES(topic),
          status = VALUES(status),
          user_id = VALUES(user_id),
          language = VALUES(language),
          level = VALUES(level),
          extra_payload = VALUES(extra_payload),
          updated_at = VALUES(updated_at)
        """,
        [
            job_id,
            topic,
            status,
            owner_id or None,
            language,
            level,
            json.dumps(merged_extra, ensure_ascii=False) if merged_extra else None,
            now_ts,
            now_ts,
        ],
    )

# Map log messages to structured phases for frontend
_PHASE_MAP = [
    ('Loading AI model',              'init',     'Loading AI model'),
    ('Starting academic research',    'research', 'Starting research'),
    ('Research summaries complete',   'research', 'Research summaries done'),
    ('All research papers organized', 'research', 'Papers organized'),
    ('Research gaps identified',      'research', 'Research gaps identified'),
    ('Designing thesis structure',    'outline',  'Designing structure'),
    ('Outline created',               'outline',  'Outline created'),
    ('Starting chapter composition',  'writing',  'Starting writing'),
    ('Introduction complete',         'writing',  'Introduction complete'),
    ('Literature Review complete',    'writing',  'Literature Review complete'),
    ('Methodology complete',          'writing',  'Methodology complete'),
    ('Analysis & Results complete',   'writing',  'Analysis & Results complete'),
    ('Discussion complete',           'writing',  'Discussion complete'),
    ('Conclusion complete',           'writing',  'Conclusion complete'),
    ('Starting document compilation', 'compile',  'Compiling document'),
    ('Abstract generated',            'compile',  'Abstract generated'),
    ('Starting document export',      'export',   'Exporting files'),
    ('Generation complete',           'done',     'Generation complete'),
]

# Chapter names for tracking
_CHAPTER_NAMES = [
    'Introduction', 'Literature Review', 'Methodology',
    'Analysis & Results', 'Discussion', 'Conclusion',
]


class JobCancelledError(Exception):
    """Raised when a running generation job is cancelled by user."""
    pass


def _run_generation(job_id: str, params: dict):
    """Run paper generation with chapter-level pause/resume support."""
    gate = threading.Event()
    gate.set()  # Initially open

    with _jobs_lock:
        if job_id in _jobs:
            _jobs[job_id]['_gate'] = gate

    def _is_cancel_requested() -> bool:
        with _jobs_lock:
            job = _jobs.get(job_id)
            if not job:
                return True
            status = str(job.get('status') or '').strip().lower()
            if status == 'cancelled':
                return True
            return bool(job.get('cancel_requested'))

    def _raise_if_cancel_requested():
        if _is_cancel_requested():
            raise JobCancelledError('Job cancelled by user')

    def log(msg: str):
        with _jobs_lock:
            job = _jobs.get(job_id)
            if not job:
                return
            job['log'].append(msg)
            for keyword, phase, label in _PHASE_MAP:
                if keyword in msg:
                    job['steps'].append({
                        'phase': phase, 'label': label,
                        'time': _time.time(), 'msg': msg,
                    })
                    break

    try:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]['status'] = 'running'

        from draft_generator import generate_draft
        from pathlib import Path

        output_dir = Path('/tmp') / f'opendraft_{job_id}'
        output_formats = params.get('formats', ['pdf', 'docx', 'md'])

        class _Streamer:
            def stream_milestone(self, msg):
                _raise_if_cancel_requested()
                log(msg)

            def stream_outline_complete(self, outline_path=None, chapters_count=0, **kw):
                _raise_if_cancel_requested()
                # If outline was already provided (pre-approved by user), skip review
                if params.get('outline'):
                    log('📋 Using pre-approved outline, skipping review')
                    return

                # Read outline content and pause for user review
                outline_text = ''
                if outline_path and Path(str(outline_path)).exists():
                    outline_text = Path(str(outline_path)).read_text(encoding='utf-8')
                elif output_dir.exists():
                    # Try to find outline in drafts folder
                    for f in (output_dir / 'drafts').glob('*outline*'):
                        outline_text = f.read_text(encoding='utf-8')
                        break
                with _jobs_lock:
                    _jobs[job_id]['status'] = 'outline_review'
                    _jobs[job_id]['outline'] = outline_text
                    _jobs[job_id]['chapters_count'] = chapters_count
                log('📋 Outline ready for review')
                # Block until user approves
                gate.clear()
                while True:
                    if gate.wait(timeout=0.5):
                        break
                    _raise_if_cancel_requested()
                _raise_if_cancel_requested()
                with _jobs_lock:
                    _jobs[job_id]['status'] = 'running'

            def stream_research_complete(self, *a, **kw): pass

            def stream_chapter_complete(self, chapter_num=None, chapter_name=None, chapter_path=None, **kw):
                _raise_if_cancel_requested()
                # Read the specific chapter file
                chapter_content = ''
                if chapter_path and Path(chapter_path).exists():
                    chapter_content = Path(chapter_path).read_text(encoding='utf-8')
                elif output_dir.exists():
                    drafts = output_dir / 'drafts'
                    if drafts.exists():
                        for f in sorted(drafts.glob('*.md'), key=lambda p: p.stat().st_mtime, reverse=True):
                            chapter_content = f.read_text(encoding='utf-8')
                            break
                # Use chapter number as section key for reliable file matching
                section_key = f'{chapter_num:02d}_chapter' if chapter_num else (chapter_name or 'chapter')
                with _jobs_lock:
                    _jobs[job_id]['status'] = 'chapter_review'
                    _jobs[job_id]['review_chapter'] = section_key
                    _jobs[job_id]['review_chapter_name'] = chapter_name or f'Chapter {chapter_num}'
                    _jobs[job_id]['review_content'] = chapter_content[:8000]
                log(f'📖 {chapter_name or "Chapter"} ready for review')
                # Block until user approves
                gate.clear()
                while True:
                    if gate.wait(timeout=0.5):
                        break
                    _raise_if_cancel_requested()
                _raise_if_cancel_requested()
                with _jobs_lock:
                    _jobs[job_id]['status'] = 'running'

        class _Tracker:
            cancelled = False
            def log_activity(self, msg, **kw):
                _raise_if_cancel_requested()
                log(msg)
            def update_phase(self, *a, **kw):
                _raise_if_cancel_requested()
            def update_research(self, *a, **kw):
                _raise_if_cancel_requested()
            def update_exporting(self, *a, **kw):
                _raise_if_cancel_requested()
            def log_source_found(self, title='', authors=None, year='', doi=None, url=None, **kw):
                _raise_if_cancel_requested()
                author_str = ', '.join(authors[:2]) if authors else ''
                if len(authors or []) > 2:
                    author_str += ' et al.'
                ref = f'{author_str} ({year})' if year else author_str
                # Build link for frontend
                link = ''
                if doi:
                    link = f'https://doi.org/{doi}'
                elif url:
                    link = url
                msg = f'📄 Found: {title[:80]}' + (f' — {ref}' if ref else '')
                if link:
                    msg += f' ||{link}||'  # Special marker for frontend to parse
                log(msg)
            def send_heartbeat(self, *a, **kw):
                _raise_if_cancel_requested()
            def check_cancellation(self):
                _raise_if_cancel_requested()
            def mark_completed(self):
                _raise_if_cancel_requested()
            def mark_failed(self, msg): log(f'FAILED: {msg}')

        pdf_path, docx_path = generate_draft(
            topic=params['topic'],
            language=params.get('language', 'en'),
            academic_level=params.get('level', 'research_paper'),
            output_dir=output_dir,
            skip_validation=True,
            verbose=False,
            tracker=_Tracker(),
            streamer=_Streamer(),
            blurb=params.get('blurb') or None,
            author_name=params.get('author_name') or None,
            institution=params.get('institution') or None,
            department=params.get('department') or None,
            faculty=params.get('faculty') or None,
            advisor=params.get('advisor') or None,
            second_examiner=params.get('second_examiner') or None,
            location=params.get('location') or None,
            student_id=params.get('student_id') or None,
            output_formats=output_formats,
            target_words=params.get('target_words') or None,
            target_citations=int(params['target_citations']) if params.get('target_citations') else None,
            provided_outline=params.get('outline') or None,
        )
        _raise_if_cancel_requested()

        # Find MD file
        exports = output_dir / 'exports'
        md_files = list(exports.glob('*.md'))
        md_path = md_files[0] if md_files else None

        with _jobs_lock:
            _jobs[job_id]['status'] = 'done'
            _jobs[job_id]['pdf'] = str(pdf_path) if pdf_path and pdf_path.exists() else None
            _jobs[job_id]['docx'] = str(docx_path) if docx_path and docx_path.exists() else None
            _jobs[job_id]['md'] = str(md_path) if md_path and md_path.exists() else None
            _upsert_paper(job_id, params.get('topic', ''), 'done',
                       user_id=params.get('uid') or params.get('user_id'),
                       pdf=str(pdf_path) if pdf_path and pdf_path.exists() else None,
                       docx=str(docx_path) if docx_path and docx_path.exists() else None,
                       md=str(md_path) if md_path and md_path.exists() else None)

    except JobCancelledError as e:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]['status'] = 'cancelled'
                _jobs[job_id]['error'] = str(e)
        _upsert_paper(job_id, params.get('topic', ''), 'cancelled',
                      user_id=params.get('uid') or params.get('user_id'),
                      error=str(e))
        log('INFO: Generation cancelled by user')

    except Exception as e:
        with _jobs_lock:
            if job_id in _jobs:
                _jobs[job_id]['status'] = 'error'
                _jobs[job_id]['error'] = str(e)
        _upsert_paper(job_id, params.get('topic', ''), 'error',
                      user_id=params.get('uid') or params.get('user_id'),
                      error=str(e))
        log(f'ERROR: {e}')


# ===== API ROUTES =====

@app.route('/')
def index():
    return send_file('static/index.html')


@app.route('/api/outline', methods=['POST'])
@app.route('/api/opendraft/outline', methods=['POST'])
def generate_outline():
    """Quick outline generation (~10-30s) using AI model directly."""
    params = request.json or {}
    topic = params.get('topic', '').strip()
    if not topic:
        return jsonify({'error': 'Topic is required'}), 400

    language = params.get('language', 'zh')
    level = params.get('level', 'research_paper')
    target_words = params.get('target_words', '')
    target_citations = params.get('target_citations', '')

    lang_labels = {
        'zh': 'Chinese', 'en': 'English', 'de': 'German',
        'fr': 'French', 'es': 'Spanish', 'ja': 'Japanese',
    }
    lang_name = lang_labels.get(language, 'English')

    level_labels = {
        'research_paper': 'Research Paper',
        'bachelor': 'Bachelor Thesis',
        'master': 'Master Thesis',
        'phd': 'PhD Dissertation',
    }
    level_name = level_labels.get(level, 'Research Paper')

    word_info = f'\n- Target length: approximately {target_words} words' if target_words else ''
    cite_info = f'\n- Target citations: approximately {target_citations} references' if target_citations else ''

    prompt = f"""Generate a detailed academic paper outline for the following topic.

Topic: {topic}
Paper type: {level_name}
Language: {lang_name}{word_info}{cite_info}

Requirements:
1. Create a well-structured outline with chapter and section headings
2. Use markdown format with ## for chapters and ### for sections
3. Under each section, add 1-2 bullet points describing key content
4. Include these standard academic sections:
   - Chapter 1: Introduction (background, problem statement, research objectives, significance)
   - Chapter 2: Literature Review (key theories, existing research, research gaps)
   - Chapter 3: Methodology (research design, data collection, analysis methods)
   - Chapter 4: Analysis & Results (findings, data presentation)
   - Chapter 5: Discussion (interpretation, implications, limitations)
   - Chapter 6: Conclusion (summary, contributions, future research)
5. Adapt chapter names and content to fit the specific topic
6. Write all content in {lang_name}

Return ONLY the outline in markdown format, no other text."""

    try:
        from utils.agent_runner import setup_model
        import re as _re
        model = setup_model()
        response = model.generate_content(prompt)
        raw = response.text

        # Separate AI thinking from the actual outline
        # The outline starts at the first markdown heading (## or #)
        thinking_text = ''
        outline = raw

        heading_match = _re.search(r'^(#{1,3}\s)', raw, _re.MULTILINE)
        if heading_match and heading_match.start() > 0:
            thinking_text = raw[:heading_match.start()].strip()
            outline = raw[heading_match.start():].strip()

        # Translate thinking to target language if needed
        thinking_summary = ''
        if thinking_text and language != 'en':
            # Generate a brief translated summary of the thinking process
            try:
                summary_prompt = f"Summarize the following AI reasoning process in 3-5 short bullet points in {lang_name}. Each point should be one concise sentence. Return ONLY the bullet points, no other text.\n\n{thinking_text[:2000]}"
                summary_resp = model.generate_content(summary_prompt)
                thinking_summary = summary_resp.text.strip()
            except Exception:
                thinking_summary = thinking_text[:500]
        elif thinking_text:
            thinking_summary = thinking_text[:500]

        return jsonify({
            'outline': outline,
            'thinking': thinking_summary,
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/generate', methods=['POST'])
@app.route('/api/opendraft/generate', methods=['POST'])
def generate():
    """Start paper generation. Accepts optional 'outline' param for pre-approved outline."""
    params = _get_request_payload()
    user_id = _get_request_user_id(params)
    if user_id:
        params.setdefault('uid', user_id)
        params.setdefault('user_id', user_id)

    if not params.get('topic', '').strip():
        return jsonify({'error': 'Topic is required'}), 400

    job_id = uuid.uuid4().hex
    with _jobs_lock:
        _jobs[job_id] = {
            'status': 'pending', 'log': [], 'steps': [],
            'pdf': None, 'docx': None, 'md': None,
            'topic': params.get('topic', ''),
            'start_time': _time.time(),
            'outline': None, 'review_chapter': None, 'review_content': None,
            'user_id': user_id or None,
            'cancel_requested': False,
            'cancel_reason': '',
        }

    _upsert_paper(job_id, params.get('topic', ''), 'running',
                   user_id=user_id or None,
                   language=params.get('language', 'zh'),
                   level=params.get('level', 'research_paper'))

    t = threading.Thread(target=_run_generation, args=(job_id, params), daemon=True)
    t.start()

    return jsonify({'job_id': job_id})


@app.route('/api/approve/<job_id>', methods=['POST'])
@app.route('/api/opendraft/approve/<job_id>', methods=['POST'])
def approve(job_id):
    """Resume a paused job (outline_review or chapter_review)."""
    data = _get_request_payload()
    job, _, error_resp = _get_owned_job(job_id, data)
    if error_resp:
        return error_resp
    gate = job.get('_gate')
    if not gate:
        return jsonify({'error': 'No gate found'}), 400

    # Accept optional edited content
    edited = data.get('content')
    if edited and job.get('status') == 'outline_review':
        # Save edited outline back to the output dir
        output_dir = Path('/tmp') / f'opendraft_{job_id}' / 'drafts'
        if output_dir.exists():
            for f in output_dir.glob('*outline*'):
                f.write_text(edited, encoding='utf-8')
                break

    gate.set()  # Unblock the generation thread
    return jsonify({'ok': True})


@app.route('/api/cancel/<job_id>', methods=['POST'])
@app.route('/api/opendraft/cancel/<job_id>', methods=['POST'])
def cancel(job_id):
    """Cancel a running/paused generation job."""
    payload = _get_request_payload()
    job, _, error_resp = _get_owned_job(job_id, payload)
    if error_resp:
        return error_resp

    cancel_reason = str(payload.get('reason') or '').strip()
    with _jobs_lock:
        current = _jobs.get(job_id)
        if not current:
            return jsonify({'error': 'Job not found'}), 404
        status = str(current.get('status') or '').strip().lower()
        if status in ('done', 'error', 'cancelled'):
            return jsonify({'ok': True, 'already_finished': True, 'status': status})

        current['cancel_requested'] = True
        current['cancel_reason'] = cancel_reason
        current['status'] = 'cancelled'
        gate = current.get('_gate')
        if gate:
            try:
                gate.set()
            except Exception:
                pass
        topic = str(current.get('topic') or '')
        owner_id = current.get('user_id')

    _upsert_paper(
        job_id,
        topic,
        'cancelled',
        user_id=owner_id,
        cancel_reason=cancel_reason,
    )
    return jsonify({'ok': True, 'status': 'cancelled'})


@app.route('/api/status/<job_id>')
@app.route('/api/opendraft/status/<job_id>')
def status(job_id):
    job, _, error_resp = _get_owned_job(job_id)
    if error_resp:
        return error_resp
    # Return a serializable copy
    safe = {}
    for k, v in job.items():
        if k.startswith('_'):
            continue  # Skip internal objects (threading.Event etc.)
        if k == 'steps':
            safe[k] = [{kk: vv for kk, vv in s.items() if kk != 'time'} for s in v]
        else:
            safe[k] = v
    return jsonify(safe)


@app.route('/api/stream/<job_id>')
@app.route('/api/opendraft/stream/<job_id>')
def stream(job_id):
    """SSE stream with support for review pauses."""
    request_user_id = _get_request_user_id()
    with _jobs_lock:
        current = _jobs.get(job_id)
    if not current:
        return jsonify({'error': 'Job not found'}), 404
    if not _is_owner_match(current.get('user_id'), request_user_id):
        return jsonify({'error': 'Forbidden'}), 403

    def generate_events():
        sent_logs = 0
        sent_steps = 0
        last_status = None
        while True:
            with _jobs_lock:
                job = _jobs.get(job_id)
            if not job:
                yield 'data: {"error": "job not found"}\n\n'
                break
            if not _is_owner_match(job.get('user_id'), request_user_id):
                yield 'data: {"error": "forbidden"}\n\n'
                break
            logs = job['log']
            steps = job['steps']
            cur_status = job['status']

            # Send new logs
            while sent_logs < len(logs):
                msg = logs[sent_logs].replace('\n', ' ')
                yield f'data: {json.dumps({"type": "log", "msg": msg})}\n\n'
                sent_logs += 1

            # Send new steps
            while sent_steps < len(steps):
                s = steps[sent_steps]
                yield f'data: {json.dumps({"type": "step", "phase": s["phase"], "label": s["label"], "msg": s["msg"]})}\n\n'
                sent_steps += 1

            # Notify frontend of review pauses
            if cur_status != last_status:
                if cur_status == 'outline_review':
                    yield f'data: {json.dumps({"type": "outline_review", "outline": job.get("outline", ""), "chapters_count": job.get("chapters_count", 0)})}\n\n'
                elif cur_status == 'chapter_review':
                    yield f'data: {json.dumps({"type": "chapter_review", "chapter": job.get("review_chapter", ""), "chapter_name": job.get("review_chapter_name", ""), "content": job.get("review_content", "")})}\n\n'
                last_status = cur_status

            if cur_status in ('done', 'error', 'cancelled'):
                yield f'data: {json.dumps({"type": "done", "status": cur_status, "pdf": job.get("pdf"), "docx": job.get("docx"), "md": job.get("md"), "error": job.get("error")})}\n\n'
                break
            _time.sleep(0.5)

    return Response(stream_with_context(generate_events()),
                    mimetype='text/event-stream',
                    headers={'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no'})


@app.route('/api/preview/<job_id>')
@app.route('/api/opendraft/preview/<job_id>')
def preview(job_id):
    job, _, error_resp = _get_owned_job(job_id)
    if error_resp:
        return error_resp
    md_path = job.get('md')
    if not md_path or not Path(md_path).exists():
        return jsonify({'error': 'Markdown file not available'}), 404

    import markdown as md_lib
    import re

    raw = Path(md_path).read_text(encoding='utf-8')
    meta = {}
    body = raw
    yaml_match = re.match(r'^---\n(.*?)\n---\n', raw, re.DOTALL)
    if yaml_match:
        for line in yaml_match.group(1).splitlines():
            if ':' in line:
                k, _, v = line.partition(':')
                meta[k.strip()] = v.strip().strip('"')
        body = raw[yaml_match.end():]

    content_html = md_lib.markdown(body, extensions=['tables', 'fenced_code', 'toc'])
    title = meta.get('title', 'Paper')
    author = meta.get('author', '')
    date = meta.get('date', '')

    html = f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8"><title>{title}</title>
<style>
  @page {{ margin: 2.5cm 2.8cm; }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: 'Times New Roman', 'SimSun', serif; font-size: 12pt; line-height: 1.8; color: #111; background: #fff; max-width: 800px; margin: 0 auto; padding: 2rem 2.5rem; }}
  .cover {{ text-align: center; padding: 4rem 0 3rem; border-bottom: 2px solid #111; margin-bottom: 2.5rem; page-break-after: always; }}
  .cover h1 {{ font-size: 1.6rem; font-weight: bold; margin-bottom: 1.5rem; line-height: 1.4; }}
  .cover .meta {{ font-size: 0.95rem; color: #444; line-height: 2; }}
  h1, h2, h3, h4 {{ font-family: Arial, 'Microsoft YaHei', sans-serif; margin: 1.5rem 0 0.6rem; }}
  h1 {{ font-size: 1.4rem; border-bottom: 1px solid #ddd; padding-bottom: 0.4rem; }}
  h2 {{ font-size: 1.2rem; }} h3 {{ font-size: 1.05rem; }}
  p {{ margin-bottom: 0.75rem; text-align: justify; }}
  ul, ol {{ margin: 0.5rem 0 0.75rem 1.5rem; }} li {{ margin-bottom: 0.25rem; }}
  blockquote {{ border-left: 3px solid #aaa; padding-left: 1rem; color: #555; margin: 1rem 0; }}
  table {{ width: 100%; border-collapse: collapse; margin: 1rem 0; font-size: 0.9rem; }}
  th, td {{ border: 1px solid #ccc; padding: 0.4rem 0.6rem; }}
  th {{ background: #f5f5f5; font-weight: bold; }}
  code {{ font-family: 'Courier New', monospace; font-size: 0.88rem; background: #f5f5f5; padding: 0.1rem 0.3rem; border-radius: 3px; }}
  pre code {{ display: block; padding: 0.75rem; overflow-x: auto; }}
  @media print {{ body {{ padding: 0; max-width: none; }} .no-print {{ display: none !important; }} }}
  .print-bar {{ position: fixed; bottom: 1.5rem; right: 1.5rem; }}
  .btn-print {{ padding: 0.6rem 1.2rem; background: #6366f1; color: #fff; border: none; border-radius: 8px; font-size: 0.9rem; font-weight: 600; cursor: pointer; }}
</style>
</head>
<body>
<div class="cover"><h1>{title}</h1><div class="meta">
{'<div>' + author + '</div>' if author else ''}
{'<div>' + date + '</div>' if date else ''}
{'<div>' + meta.get('institution','') + '</div>' if meta.get('institution') else ''}
</div></div>
{content_html}
<div class="print-bar no-print"><button class="btn-print" onclick="window.print()">Print / Save PDF</button></div>
</body></html>"""
    return Response(html, mimetype='text/html')


@app.route('/api/download/<job_id>/<fmt>')
@app.route('/api/opendraft/download/<job_id>/<fmt>')
def download(job_id, fmt):
    if fmt not in ('pdf', 'docx', 'md'):
        return jsonify({'error': 'Invalid format'}), 400
    job, _, error_resp = _get_owned_job(job_id)
    if error_resp:
        return error_resp
    path = job.get(fmt)
    if not path or not Path(path).exists():
        return jsonify({'error': f'{fmt.upper()} not available'}), 404
    return send_file(path, as_attachment=True)


@app.route('/api/md/<job_id>')
@app.route('/api/opendraft/md/<job_id>')
def get_md(job_id):
    job, _, error_resp = _get_owned_job(job_id)
    if error_resp:
        return error_resp
    md_path = job.get('md')
    if not md_path or not Path(md_path).exists():
        return jsonify({'error': 'Markdown not available yet'}), 404
    raw = Path(md_path).read_text(encoding='utf-8')
    return jsonify({'content': raw})


@app.route('/api/save/<job_id>', methods=['POST'])
@app.route('/api/opendraft/save/<job_id>', methods=['POST'])
def save_md(job_id):
    payload = _get_request_payload()
    job, _, error_resp = _get_owned_job(job_id, payload)
    if error_resp:
        return error_resp
    md_path = job.get('md')
    if not md_path:
        return jsonify({'error': 'No markdown file'}), 404
    content = payload.get('content', '')
    Path(md_path).write_text(content, encoding='utf-8')
    return jsonify({'ok': True})


@app.route('/api/chat', methods=['POST'])
@app.route('/api/opendraft/chat', methods=['POST'])
def chat_with_ai():
    """Chat with AI to modify current section content."""
    data = request.json or {}
    message = data.get('message', '').strip()
    current_content = data.get('current_content', '')
    section_name = data.get('section_name', '')
    language = data.get('language', 'zh')

    if not message:
        return jsonify({'error': 'Message is required'}), 400

    lang_labels = {
        'zh': 'Chinese', 'en': 'English', 'de': 'German',
        'fr': 'French', 'es': 'Spanish', 'ja': 'Japanese',
    }
    lang_name = lang_labels.get(language, 'Chinese')

    prompt = f"""You are an academic writing assistant. The user is working on a research paper.

Current section: {section_name or 'Unknown'}
Language: {lang_name}

The current content of this section is:
---
{current_content[:8000]}
---

The user's instruction:
{message}

Apply the user's instruction to modify the content above. Return ONLY the modified content in markdown format. Keep the same academic tone and language ({lang_name}). Do not include any explanation or meta-text."""

    try:
        from utils.agent_runner import setup_model
        model = setup_model()
        response = model.generate_content(prompt)
        raw = response.text

        # Strip thinking if present
        import re
        heading_match = re.search(r'^(#{1,6}\s)', raw, re.MULTILINE)
        if heading_match and heading_match.start() > 0:
            content_part = raw[heading_match.start():]
            if len(content_part) > len(raw) * 0.3:
                raw = content_part

        return jsonify({'content': raw.strip()})
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/api/sections/<job_id>')
@app.route('/api/opendraft/sections/<job_id>')
def list_sections(job_id):
    """List available chapter files for a job."""
    _, _, error_resp = _get_owned_job(job_id)
    if error_resp:
        return error_resp
    output_dir = Path('/tmp') / f'opendraft_{job_id}' / 'drafts'
    if not output_dir.exists():
        return jsonify([])
    sections = []
    for f in sorted(output_dir.glob('*.md')):
        sections.append({
            'name': f.stem,
            'path': str(f),
            'size': f.stat().st_size,
        })
    return jsonify(sections)


@app.route('/api/sections/<job_id>/<section_name>')
@app.route('/api/opendraft/sections/<job_id>/<section_name>')
def get_section(job_id, section_name):
    """Read a specific section's content."""
    _, _, error_resp = _get_owned_job(job_id)
    if error_resp:
        return error_resp
    output_dir = Path('/tmp') / f'opendraft_{job_id}' / 'drafts'
    # Find matching files, prefer formatted versions
    matches = [f for f in output_dir.glob('*.md') if section_name in f.stem]
    if not matches:
        return jsonify({'error': 'Section not found'}), 404
    # Prefer formatted_outline over plain outline
    best = next((f for f in matches if 'formatted' in f.stem), matches[0])
    return jsonify({'content': best.read_text(encoding='utf-8'), 'path': str(best)})


@app.route('/api/sections/<job_id>/<section_name>', methods=['PUT'])
@app.route('/api/opendraft/sections/<job_id>/<section_name>', methods=['PUT'])
def save_section(job_id, section_name):
    """Save modified section content back to file."""
    payload = _get_request_payload()
    _, _, error_resp = _get_owned_job(job_id, payload)
    if error_resp:
        return error_resp
    output_dir = Path('/tmp') / f'opendraft_{job_id}' / 'drafts'
    content = payload.get('content', '')
    for f in output_dir.glob('*.md'):
        if section_name in f.stem:
            f.write_text(content, encoding='utf-8')
            return jsonify({'ok': True})
    return jsonify({'error': 'Section not found'}), 404


@app.route('/api/papers')
@app.route('/api/opendraft/papers')
def list_papers():
    """List papers visible to current user."""
    request_user_id = _get_request_user_id()
    papers = [p for p in _load_papers() if _is_owner_match(p.get('user_id'), request_user_id)]
    # Update status for running jobs from in-memory state
    with _jobs_lock:
        for p in papers:
            job = _jobs.get(p['job_id'])
            if job and _is_owner_match(job.get('user_id'), request_user_id) and job['status'] not in ('done', 'error'):
                p['status'] = job['status']
    return jsonify(papers)


@app.route('/api/papers/<job_id>', methods=['DELETE'])
@app.route('/api/opendraft/papers/<job_id>', methods=['DELETE'])
def delete_paper(job_id):
    """Delete a paper from the list."""
    request_user_id = _get_request_user_id()
    target = fetch_one(
        """
        SELECT job_id, user_id
        FROM opendraft_papers
        WHERE job_id = %s
        LIMIT 1
        """,
        [job_id],
    )
    if not target:
        return jsonify({'error': 'Paper not found'}), 404
    if not _is_owner_match(target.get('user_id'), request_user_id):
        return jsonify({'error': 'Forbidden'}), 403

    execute("DELETE FROM opendraft_papers WHERE job_id = %s", [job_id])

    with _jobs_lock:
        job = _jobs.get(job_id)
        if job and _is_owner_match(job.get('user_id'), request_user_id):
            _jobs.pop(job_id, None)

    return jsonify({'ok': True})


@app.route('/api/users/<user_id>/attachments', methods=['DELETE'])
@app.route('/api/opendraft/users/<user_id>/attachments', methods=['DELETE'])
def delete_user_attachments(user_id):
    """
    Delete user's affiliated OpenDraft data by user id.

    Scope:
    - opendraft_papers rows by user_id
    - in-memory running jobs owned by user
    - optional /tmp/opendraft_<job_id> output directories (enabled by default)
    """
    payload = _get_request_payload()
    target_user_id = _normalize_user_id(user_id) or _normalize_user_id(payload.get('user_id'))
    if not target_user_id:
        return jsonify({'error': 'user_id is required'}), 400

    request_user_id = _get_request_user_id(payload)
    if not _is_owner_match(target_user_id, request_user_id):
        return jsonify({'error': 'Forbidden'}), 403

    purge_files_raw = payload.get('purge_files')
    if purge_files_raw is None:
        purge_files_raw = request.args.get('purge_files', 'true')
    purge_files = str(purge_files_raw).strip().lower() not in {'0', 'false', 'no', 'off'}

    # Collect persisted job ids before deletion (for optional artifact cleanup)
    persisted_rows = fetch_all(
        "SELECT job_id FROM opendraft_papers WHERE user_id = %s",
        [target_user_id],
    )
    persisted_job_ids = [
        _normalize_user_id(row.get('job_id'))
        for row in persisted_rows
        if _normalize_user_id(row.get('job_id'))
    ]

    deleted_papers = execute(
        "DELETE FROM opendraft_papers WHERE user_id = %s",
        [target_user_id],
    )

    removed_job_ids = []
    with _jobs_lock:
        for job_id, job in list(_jobs.items()):
            owner = _normalize_user_id(job.get('user_id'))
            if owner == target_user_id:
                _jobs.pop(job_id, None)
                removed_job_ids.append(job_id)

    cleaned_artifacts = []
    cleanup_failures = []
    if purge_files:
        all_job_ids = set(persisted_job_ids) | set(removed_job_ids)
        for jid in all_job_ids:
            output_dir = Path('/tmp') / f'opendraft_{jid}'
            if not output_dir.exists():
                continue
            try:
                shutil.rmtree(output_dir)
                cleaned_artifacts.append(str(output_dir))
            except Exception as exc:
                cleanup_failures.append({'path': str(output_dir), 'error': str(exc)})

    return jsonify({
        'ok': True,
        'user_id': target_user_id,
        'deleted_paper_records': int(deleted_papers or 0),
        'deleted_in_memory_jobs': len(removed_job_ids),
        'purged_files': bool(purge_files),
        'deleted_output_dirs': len(cleaned_artifacts),
        'cleanup_failures': cleanup_failures,
    })


if __name__ == '__main__':
    os.makedirs('static', exist_ok=True)
    host = (os.getenv('OPENDRAFT_HOST') or '0.0.0.0').strip() or '0.0.0.0'
    port_raw = os.getenv('OPENDRAFT_PORT') or os.getenv('PORT') or '18080'
    try:
        port = int(port_raw)
    except (TypeError, ValueError):
        port = 18080
    if port <= 0:
        port = 18080
    app.run(host=host, port=port, debug=False)
