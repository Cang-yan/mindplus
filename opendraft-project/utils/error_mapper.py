#!/usr/bin/env python3
"""
Error message mapper - converts technical errors to user-friendly messages.
"""

from typing import Dict, Tuple

ERROR_MAPPINGS: Dict[str, Tuple[str, bool]] = {
    # (user_message, recoverable)
    "Bucket not found": (
        "Storage service temporarily unavailable. Please try again in a few minutes.",
        True
    ),
    "TimeoutError": (
        "Generation took too long. Please try with a shorter topic or simpler academic level.",
        True
    ),
    "Insufficient citations": (
        "Could not find enough academic sources. Try refining your topic or check your internet connection.",
        True
    ),
    "Rate limit": (
        "Too many requests. Please wait a moment and try again.",
        True
    ),
    "Broken pipe": (
        "Connection interrupted. Please try again.",
        True
    ),
    "File too large": (
        "Generated file is too large. Try a shorter academic level.",
        False
    ),
    "429": (
        "Service temporarily unavailable due to high demand. Please try again in a few minutes.",
        True
    ),
    "ConnectionError": (
        "Network connection failed. Please check your internet connection and try again.",
        True
    ),
    "APIError": (
        "External service error. Please try again in a few minutes.",
        True
    ),
}


def map_error_to_user_message(error: Exception) -> Tuple[str, bool]:
    """
    Map technical error to user-friendly message.
    
    Args:
        error: The exception that occurred
        
    Returns:
        Tuple of (user_friendly_message, recoverable)
    """
    error_str = str(error)
    error_type = type(error).__name__
    
    # Check for specific error messages (case-insensitive)
    for pattern, (message, recoverable) in ERROR_MAPPINGS.items():
        if pattern.lower() in error_str.lower():
            return message, recoverable
    
    # Check for error types
    if error_type in ERROR_MAPPINGS:
        return ERROR_MAPPINGS[error_type]
    
    # Default fallback
    return (
        "An unexpected error occurred. Please try again or contact support if the problem persists.",
        True
    )

