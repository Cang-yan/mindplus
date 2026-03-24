#!/usr/bin/env python3
"""
ABOUTME: Centralized configuration management for OpenDraft
ABOUTME: Single source of truth for all settings, models, and environment variables
"""

import os
import time
from dataclasses import dataclass, field
from typing import Literal, Optional
from pathlib import Path


# Try to load environment variables from .env files
# Priority: .env.local > .env (local overrides default)
try:
    from dotenv import load_dotenv

    # Get directory where config.py is located
    config_dir = Path(__file__).parent

    # Load .env first (defaults)
    env_path = config_dir / '.env'
    if env_path.exists():
        load_dotenv(env_path)

    # Load .env.local second (overrides, gitignored)
    env_local_path = config_dir / '.env.local'
    if env_local_path.exists():
        load_dotenv(env_local_path, override=True)

except ImportError:
    # dotenv is optional - will use system environment variables
    pass


def _apply_process_proxy_policy() -> None:
    """
    Apply per-process proxy policy for this project only.

    This does NOT modify system-wide proxy settings. It only affects the
    current Python process and its child requests.

    Env switch:
    - OPENDRAFT_DISABLE_SYSTEM_PROXY=true  -> clear HTTP(S)_PROXY/ALL_PROXY
    - OPENDRAFT_DISABLE_SYSTEM_PROXY=false -> keep system proxy env unchanged
    """
    disable_proxy = os.getenv('OPENDRAFT_DISABLE_SYSTEM_PROXY', 'true').lower() in {
        '1', 'true', 'yes', 'on'
    }
    if not disable_proxy:
        return

    # Remove common proxy env vars so SDKs/requests stop using system proxy.
    proxy_vars = (
        'HTTP_PROXY', 'HTTPS_PROXY', 'ALL_PROXY',
        'http_proxy', 'https_proxy', 'all_proxy',
    )
    for key in proxy_vars:
        os.environ.pop(key, None)

    # Keep local addresses explicitly bypassed.
    existing_no_proxy = os.getenv('NO_PROXY') or os.getenv('no_proxy') or ''
    entries = [x.strip() for x in existing_no_proxy.split(',') if x.strip()]
    for host in ('localhost', '127.0.0.1', '::1'):
        if host not in entries:
            entries.append(host)
    merged_no_proxy = ','.join(entries)
    os.environ['NO_PROXY'] = merged_no_proxy
    os.environ['no_proxy'] = merged_no_proxy


def _apply_process_timezone() -> None:
    """
    Apply per-process timezone policy.

    Priority:
    - OPENDRAFT_TIMEZONE (explicit project-level override)
    - TZ (existing process/system setting)
    - Asia/Shanghai (default)
    """
    explicit_tz = os.getenv('OPENDRAFT_TIMEZONE')
    existing_tz = os.getenv('TZ')
    target_tz = (explicit_tz or existing_tz or 'Asia/Shanghai').strip() or 'Asia/Shanghai'

    # Keep OPENDRAFT_TIMEZONE and TZ consistent for child processes and stdlib time APIs.
    os.environ['OPENDRAFT_TIMEZONE'] = target_tz
    os.environ['TZ'] = target_tz

    # On Unix, tzset() refreshes process timezone immediately.
    if hasattr(time, 'tzset'):
        try:
            time.tzset()
        except Exception:
            # Non-fatal: keep running with current process timezone.
            pass


# Apply proxy policy as early as possible.
_apply_process_proxy_policy()
_apply_process_timezone()


def _read_optional_positive_int_env(*keys: str) -> Optional[int]:
    """Read first non-empty env value and coerce to positive int, else None."""
    for key in keys:
        raw = os.getenv(key)
        if raw is None:
            continue
        text = str(raw).strip()
        if not text:
            continue
        try:
            value = int(text)
        except (TypeError, ValueError):
            return None
        return value if value > 0 else None
    return None


@dataclass
class ModelConfig:
    """
    Model configuration with sensible defaults.

    Supports Gemini models with configurable parameters.
    """
    provider: Literal['gemini', 'claude', 'openai'] = 'gemini'
    model_name: str = field(default_factory=lambda: os.getenv('GEMINI_MODEL', 'gemini-3-pro-preview'))
    temperature: float = 0.7
    max_output_tokens: Optional[int] = field(
        default_factory=lambda: _read_optional_positive_int_env(
            'GEMINI_MAX_OUTPUT_TOKENS', 'MAX_OUTPUT_TOKENS'
        )
    )

    def __post_init__(self):
        """Validate model configuration."""
        valid_models = [
            'gemini-3-flash-preview',  # Primary flash model (supports JSON output)
            'gemini-3-pro-preview',    # Pro model for complex tasks
            'gemini-2.5-pro',          # Legacy support
            'gemini-2.5-flash',        # Legacy support
            'gemini-2.0-flash-exp',    # Legacy support
            'gemini-1.5-flash',
            'gemini-1.5-pro',
            'gemini-3.1-flash-lite-preview-thinking-medium',
        ]
        if self.provider == 'gemini' and self.model_name not in valid_models:
            raise ValueError(
                f"Invalid Gemini model: {self.model_name}. "
                f"Valid options: {', '.join(valid_models)}"
            )

        # Guardrail: keep max_output_tokens either None or a positive integer.
        if self.max_output_tokens is not None:
            try:
                self.max_output_tokens = int(self.max_output_tokens)
            except (TypeError, ValueError):
                self.max_output_tokens = None
            if self.max_output_tokens is not None and self.max_output_tokens <= 0:
                self.max_output_tokens = None


@dataclass
class ValidationConfig:
    """Configuration for validation agents (Skeptic, Verifier, Referee)."""
    use_pro_model: bool = field(default_factory=lambda: os.getenv('USE_PRO_FOR_VALIDATION', 'false').lower() == 'true')
    pro_model_name: str = 'gemini-2.5-pro'
    validate_per_section: bool = True  # Always validate each section independently

    def get_validation_model(self, base_model: str) -> str:
        """Return appropriate model for validation tasks."""
        return self.pro_model_name if self.use_pro_model else base_model


@dataclass
class PathConfig:
    """Path configuration for outputs and prompts."""
    project_root: Path = field(default_factory=lambda: Path(__file__).parent)
    output_dir: Path = field(default_factory=lambda: Path('tests/outputs'))
    prompts_dir: Path = field(default_factory=lambda: Path('prompts'))

    def __post_init__(self):
        """Ensure paths are absolute, with fallback for pip-installed packages."""
        self.output_dir = self.project_root / self.output_dir

        # Check multiple locations for prompts (source vs pip-installed)
        source_prompts = self.project_root / self.prompts_dir
        installed_prompts = Path(__file__).parent / 'opendraft' / 'prompts'

        if source_prompts.exists():
            self.prompts_dir = source_prompts
        elif installed_prompts.exists():
            self.prompts_dir = installed_prompts
            self.project_root = installed_prompts.parent  # Update project_root for pip installs
        else:
            self.prompts_dir = source_prompts  # Fallback to original behavior


@dataclass
class AppConfig:
    """
    Application-wide configuration.

    Single source of truth for all settings across the application.
    Follows SOLID principles and provides type-safe access to configuration.
    """
    # API Keys
    google_api_key: str = field(default_factory=lambda: os.getenv('GOOGLE_API_KEY', ''))
    anthropic_api_key: str = field(default_factory=lambda: os.getenv('ANTHROPIC_API_KEY', ''))
    openai_api_key: str = field(default_factory=lambda: os.getenv('OPENAI_API_KEY', ''))

    # Sub-configurations
    model: ModelConfig = field(default_factory=ModelConfig)
    validation: ValidationConfig = field(default_factory=ValidationConfig)
    paths: PathConfig = field(default_factory=PathConfig)

    # Citation and paper settings
    citation_style: str = field(default_factory=lambda: os.getenv('CITATION_STYLE', 'apa'))
    ai_detection_threshold: float = field(default_factory=lambda: float(os.getenv('AI_DETECTION_THRESHOLD', '0.20')))

    def __post_init__(self):
        """Validate configuration on initialization."""
        # Note: API key validation moved to validate_api_keys() for lazy validation
        # This allows importing config without requiring API keys (e.g., for --help)
        pass

    def validate_api_keys(self) -> None:
        """
        Validate that required API keys are present.

        Call this before operations that need API access.
        Raises ValueError if required keys are missing.
        """
        if self.model.provider == 'gemini' and not self.google_api_key:
            raise ValueError(
                "GOOGLE_API_KEY environment variable is required for Gemini models. "
                "Set it in .env file or environment. "
                "Get your key at: https://makersuite.google.com/app/apikey"
            )

        if self.model.provider == 'claude' and not self.anthropic_api_key:
            raise ValueError("ANTHROPIC_API_KEY required for Claude models")

        if self.model.provider == 'openai' and not self.openai_api_key:
            raise ValueError("OPENAI_API_KEY required for OpenAI models")

    @property
    def has_api_key(self) -> bool:
        """Check if required API key is configured (without raising)."""
        if self.model.provider == 'gemini':
            return bool(self.google_api_key)
        if self.model.provider == 'claude':
            return bool(self.anthropic_api_key)
        if self.model.provider == 'openai':
            return bool(self.openai_api_key)
        return False


# Global configuration instance - lazy loaded
_config: Optional[AppConfig] = None


def get_config() -> AppConfig:
    """
    Get the global configuration instance (lazy loaded).

    Returns:
        AppConfig: The application configuration
    """
    global _config
    if _config is None:
        _config = AppConfig()
    return _config


def update_model(model_name: str) -> None:
    """
    Update the model name at runtime.

    Args:
        model_name: New model name to use
    """
    cfg = get_config()
    cfg.model.model_name = model_name
    cfg.model.__post_init__()  # Re-validate


if __name__ == '__main__':
    # Configuration validation test
    cfg = get_config()
    print(f"✅ Configuration loaded successfully")
    print(f"Model: {cfg.model.model_name}")
    print(f"Provider: {cfg.model.provider}")
    print(f"API Key configured: {cfg.has_api_key}")
    print(f"Validation per section: {cfg.validation.validate_per_section}")
    print(f"Output directory: {cfg.paths.output_dir}")
