"""Session status management routes."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..models import SessionStatusRequest, SessionStatusesResponse

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# User preferences config directory
CONFIG_DIR = Path.home() / ".config" / "vibedeck"

# Valid status values
VALID_STATUSES = {None, "in_progress", "waiting", "done"}


def _get_session_statuses_path() -> Path:
    """Get the path to the session statuses config file."""
    return CONFIG_DIR / "session-statuses.json"


def _load_session_statuses() -> dict[str, str]:
    """Load session statuses from config file."""
    config_path = _get_session_statuses_path()
    if not config_path.exists():
        return {}
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
            return data.get("statuses", {})
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load session statuses: {e}")
        return {}


def _save_session_statuses(statuses: dict[str, str]) -> bool:
    """Save session statuses to config file."""
    config_path = _get_session_statuses_path()
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump({"statuses": statuses}, f, indent=2)
        return True
    except OSError as e:
        logger.error(f"Failed to save session statuses: {e}")
        return False


@router.get("/session-statuses")
async def get_session_statuses() -> SessionStatusesResponse:
    """Get all session statuses."""
    return SessionStatusesResponse(statuses=_load_session_statuses())


@router.post("/session-statuses/set")
async def set_session_status(request: SessionStatusRequest) -> dict:
    """Set status for a session. Use status=null to clear."""
    session_id = request.session_id
    status = request.status

    # Validate status value
    if status not in VALID_STATUSES:
        raise HTTPException(status_code=400, detail=f"Invalid status: {status}")

    statuses = _load_session_statuses()

    if status is None:
        # Remove status entry
        statuses.pop(session_id, None)
    else:
        statuses[session_id] = status

    if _save_session_statuses(statuses):
        logger.info(f"Set status for session {session_id}: {status}")
        return {"status": "updated", "session_id": session_id, "new_status": status}
    else:
        raise HTTPException(status_code=500, detail="Failed to save session statuses")
