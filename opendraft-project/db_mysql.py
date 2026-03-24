"""
MySQL utilities shared by OpenDraft services.
"""

import json
import os
import re
from types import SimpleNamespace
from typing import Any, Dict, Iterable, List, Optional, Sequence

import pymysql
from pymysql.cursors import DictCursor


def _normalize_mysql_timezone(value: Any) -> str:
    text = str(value or "").strip()
    if not text:
        return "+08:00"

    upper = text.upper()
    if upper in {"Z", "UTC", "+00:00", "+0000", "-00:00", "-0000"}:
        return "+00:00"

    match = re.fullmatch(r"([+-])(\d{2}):?(\d{2})", text)
    if not match:
        return "+08:00"

    sign = match.group(1)
    hours = int(match.group(2))
    minutes = int(match.group(3))
    if hours > 14 or minutes > 59:
        return "+08:00"
    return f"{sign}{hours:02d}:{minutes:02d}"


def mysql_config() -> Dict[str, Any]:
    mysql_timezone = _normalize_mysql_timezone(os.getenv("MYSQL_TIMEZONE") or "+08:00")
    return {
        "host": (os.getenv("MYSQL_HOST") or "127.0.0.1").strip() or "127.0.0.1",
        "port": int(os.getenv("MYSQL_PORT") or "3306"),
        "user": (os.getenv("MYSQL_USER") or "root").strip() or "root",
        "password": os.getenv("MYSQL_PASSWORD") or "",
        "database": (os.getenv("MYSQL_DATABASE") or "mindplus").strip() or "mindplus",
        "charset": (os.getenv("MYSQL_CHARSET") or "utf8mb4").strip() or "utf8mb4",
        # Keep MySQL session timestamps aligned with local business timezone by default.
        "init_command": f"SET time_zone = '{mysql_timezone}'",
        "autocommit": True,
        "cursorclass": DictCursor,
    }


def get_connection():
    cfg = mysql_config()
    return pymysql.connect(**cfg)


def _json_value(value: Any) -> Any:
    if isinstance(value, (dict, list)):
        return json.dumps(value, ensure_ascii=False)
    return value


def _ensure_identifier(name: str) -> str:
    text = str(name or "").strip()
    if not text or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", text):
        raise ValueError(f"Unsafe SQL identifier: {name!r}")
    return text


def fetch_all(sql: str, params: Optional[Sequence[Any]] = None) -> List[Dict[str, Any]]:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, params or [])
            return list(cursor.fetchall() or [])


def fetch_one(sql: str, params: Optional[Sequence[Any]] = None) -> Optional[Dict[str, Any]]:
    rows = fetch_all(sql, params)
    return rows[0] if rows else None


def execute(sql: str, params: Optional[Sequence[Any]] = None) -> int:
    with get_connection() as conn:
        with conn.cursor() as cursor:
            cursor.execute(sql, params or [])
            return int(cursor.rowcount or 0)


def ensure_tables() -> None:
    statements = [
        """
        CREATE TABLE IF NOT EXISTS opendraft_papers (
          job_id       VARCHAR(64) PRIMARY KEY,
          topic        TEXT NOT NULL,
          status       VARCHAR(32) NOT NULL,
          user_id      VARCHAR(64) NULL,
          language     VARCHAR(32) NULL,
          level        VARCHAR(32) NULL,
          extra_payload LONGTEXT NULL,
          created_at   DOUBLE NOT NULL,
          updated_at   DOUBLE NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        "CREATE INDEX idx_opendraft_papers_user_time ON opendraft_papers(user_id, updated_at)",
        """
        CREATE TABLE IF NOT EXISTS theses (
          id               VARCHAR(64) PRIMARY KEY,
          user_id          VARCHAR(64) NULL,
          topic            TEXT NULL,
          status           VARCHAR(32) NULL DEFAULT 'pending',
          current_phase    VARCHAR(32) NULL,
          progress_percent INT NOT NULL DEFAULT 0,
          progress_details JSON NULL,
          sources_count    INT NULL,
          chapters_count   INT NULL,
          error_message    TEXT NULL,
          created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
          updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        """,
        "CREATE INDEX idx_theses_user_time ON theses(user_id, updated_at)",
        "CREATE INDEX idx_theses_status_time ON theses(status, updated_at)",
    ]

    with get_connection() as conn:
        with conn.cursor() as cursor:
            for sql in statements:
                try:
                    cursor.execute(sql)
                except pymysql.err.OperationalError as err:
                    # 1061: duplicate key name (for CREATE INDEX without IF NOT EXISTS)
                    if int(getattr(err, "args", [None])[0] or 0) == 1061:
                        continue
                    raise


class _DummyStorageBucket:
    def __init__(self, bucket: str):
        self.bucket = bucket

    def upload(self, storage_path: str, _file_obj: Any, file_options: Optional[Dict[str, Any]] = None):
        return SimpleNamespace(path=storage_path, bucket=self.bucket, options=file_options or {})

    def create_signed_url(self, storage_path: str, _ttl_seconds: int):
        return {"signedURL": f"mysql://{self.bucket}/{storage_path}"}


class _DummyStorage:
    def from_(self, bucket: str):
        return _DummyStorageBucket(bucket)


class _TableQuery:
    def __init__(self, table_name: str):
        self.table_name = _ensure_identifier(table_name)
        self._mode: Optional[str] = None
        self._columns: str = "*"
        self._update_data: Dict[str, Any] = {}
        self._where: List[Sequence[Any]] = []

    def select(self, columns: str):
        self._mode = "select"
        self._columns = str(columns or "*").strip() or "*"
        return self

    def update(self, data: Dict[str, Any]):
        self._mode = "update"
        self._update_data = dict(data or {})
        return self

    def eq(self, column: str, value: Any):
        self._where.append((_ensure_identifier(column), value))
        return self

    def execute(self):
        if self._mode == "select":
            return self._execute_select()
        if self._mode == "update":
            return self._execute_update()
        raise ValueError("Unsupported query mode")

    def _execute_select(self):
        where_clause = ""
        params: List[Any] = []
        if self._where:
            where_parts = []
            for col, value in self._where:
                where_parts.append(f"`{col}` = %s")
                params.append(value)
            where_clause = " WHERE " + " AND ".join(where_parts)

        sql = f"SELECT {self._columns} FROM `{self.table_name}`{where_clause}"
        rows = fetch_all(sql, params)
        for row in rows:
            if isinstance(row.get("progress_details"), str):
                try:
                    row["progress_details"] = json.loads(row["progress_details"])
                except Exception:
                    row["progress_details"] = {}
        return SimpleNamespace(data=rows)

    def _execute_update(self):
        if not self._update_data:
            return SimpleNamespace(data=[])

        set_parts = []
        params: List[Any] = []
        for key, value in self._update_data.items():
            safe_key = _ensure_identifier(key)
            set_parts.append(f"`{safe_key}` = %s")
            params.append(_json_value(value))

        where_clause = ""
        if self._where:
            where_parts = []
            for col, value in self._where:
                where_parts.append(f"`{col}` = %s")
                params.append(value)
            where_clause = " WHERE " + " AND ".join(where_parts)

        sql = f"UPDATE `{self.table_name}` SET {', '.join(set_parts)}{where_clause}"
        execute(sql, params)
        return SimpleNamespace(data=[])


class MySQLSupabaseShim:
    """
    Minimal Supabase-compatible shim used by ProgressTracker.
    Supports:
    - table(name).select(...).eq(...).execute()
    - table(name).update({...}).eq(...).execute()
    - storage.from_(bucket).upload(...)
    - storage.from_(bucket).create_signed_url(...)
    """

    def __init__(self):
        ensure_tables()
        self.storage = _DummyStorage()

    def table(self, table_name: str):
        return _TableQuery(table_name)


def create_supabase_shim():
    return MySQLSupabaseShim()
