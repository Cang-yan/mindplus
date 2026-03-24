#!/usr/bin/env python3
"""
Structured JSON logger for production logging.
"""

import json
import logging
import os
from datetime import datetime
from typing import Dict, Any, Optional


class StructuredLogger:
    """JSON-structured logger for production."""
    
    def __init__(self, name: str, draft_id: Optional[str] = None):
        self.logger = logging.getLogger(name)
        self.draft_id = draft_id
        self.context = {}
        self.use_json = os.getenv('LOG_FORMAT', 'text').lower() == 'json'
    
    def _format_message(self, level: str, message: str, **kwargs) -> str:
        """Format log entry as JSON or text."""
        if self.use_json:
            log_entry = {
                # Use process-local timezone (default Asia/Shanghai), include offset.
                'timestamp': datetime.now().astimezone().isoformat(),
                'level': level,
                'message': message,
                'draft_id': self.draft_id,
                **self.context,
                **kwargs
            }
            return json.dumps(log_entry)
        else:
            # Text format for backward compatibility
            context_str = f" [draft_id={self.draft_id}]" if self.draft_id else ""
            extra_str = " ".join([f"{k}={v}" for k, v in kwargs.items()])
            if extra_str:
                return f"{message}{context_str} {extra_str}"
            return f"{message}{context_str}"
    
    def info(self, message: str, **kwargs):
        """Log info message."""
        self.logger.info(self._format_message('INFO', message, **kwargs))
    
    def error(self, message: str, **kwargs):
        """Log error message."""
        self.logger.error(self._format_message('ERROR', message, **kwargs))
    
    def warning(self, message: str, **kwargs):
        """Log warning message."""
        self.logger.warning(self._format_message('WARNING', message, **kwargs))
    
    def debug(self, message: str, **kwargs):
        """Log debug message."""
        self.logger.debug(self._format_message('DEBUG', message, **kwargs))
    
    def add_context(self, **kwargs):
        """Add persistent context to all logs."""
        self.context.update(kwargs)
    
    def clear_context(self):
        """Clear persistent context."""
        self.context = {}
