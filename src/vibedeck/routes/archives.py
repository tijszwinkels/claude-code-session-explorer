"""Archive management routes for session archival."""

import json
import logging
from pathlib import Path

from fastapi import APIRouter, HTTPException

from ..models import (
    ArchiveSessionRequest,
    ArchivedSessionsResponse,
    ArchiveProjectRequest,
    ArchivedProjectsResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api")

# User preferences config directory
CONFIG_DIR = Path.home() / ".config" / "vibedeck"


def _get_archived_sessions_path() -> Path:
    """Get the path to the archived sessions config file."""
    return CONFIG_DIR / "archived-sessions.json"


def _load_archived_sessions() -> list[str]:
    """Load archived session IDs from config file."""
    config_path = _get_archived_sessions_path()
    if not config_path.exists():
        return []
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
            return data.get("archived", [])
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load archived sessions: {e}")
        return []


def _save_archived_sessions(session_ids: list[str]) -> bool:
    """Save archived session IDs to config file."""
    config_path = _get_archived_sessions_path()
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump({"archived": session_ids}, f, indent=2)
        return True
    except OSError as e:
        logger.error(f"Failed to save archived sessions: {e}")
        return False


@router.get("/archived-sessions")
async def get_archived_sessions() -> ArchivedSessionsResponse:
    """Get list of archived session IDs."""
    return ArchivedSessionsResponse(archived=_load_archived_sessions())


@router.post("/archived-sessions/archive")
async def archive_session(request: ArchiveSessionRequest) -> dict:
    """Archive a session (add to archived list)."""
    session_id = request.session_id
    archived = _load_archived_sessions()

    if session_id not in archived:
        archived.append(session_id)
        if _save_archived_sessions(archived):
            logger.info(f"Archived session: {session_id}")
            return {"status": "archived", "session_id": session_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to save archived sessions")

    return {"status": "already_archived", "session_id": session_id}


@router.post("/archived-sessions/unarchive")
async def unarchive_session(request: ArchiveSessionRequest) -> dict:
    """Unarchive a session (remove from archived list)."""
    session_id = request.session_id
    archived = _load_archived_sessions()

    if session_id in archived:
        archived.remove(session_id)
        if _save_archived_sessions(archived):
            logger.info(f"Unarchived session: {session_id}")
            return {"status": "unarchived", "session_id": session_id}
        else:
            raise HTTPException(status_code=500, detail="Failed to save archived sessions")

    return {"status": "not_archived", "session_id": session_id}


# --- Project Archive Functions ---


def _get_archived_projects_path() -> Path:
    """Get the path to the archived projects config file."""
    return CONFIG_DIR / "archived-projects.json"


def _load_archived_projects() -> list[str]:
    """Load archived project paths from config file."""
    config_path = _get_archived_projects_path()
    if not config_path.exists():
        return []
    try:
        with open(config_path, "r") as f:
            data = json.load(f)
            return data.get("archived_projects", [])
    except (json.JSONDecodeError, OSError) as e:
        logger.warning(f"Failed to load archived projects: {e}")
        return []


def _save_archived_projects(project_paths: list[str]) -> bool:
    """Save archived project paths to config file."""
    config_path = _get_archived_projects_path()
    try:
        CONFIG_DIR.mkdir(parents=True, exist_ok=True)
        with open(config_path, "w") as f:
            json.dump({"archived_projects": project_paths}, f, indent=2)
        return True
    except OSError as e:
        logger.error(f"Failed to save archived projects: {e}")
        return False


@router.get("/archived-projects")
async def get_archived_projects() -> ArchivedProjectsResponse:
    """Get list of archived project paths."""
    return ArchivedProjectsResponse(archived_projects=_load_archived_projects())


@router.post("/archived-projects/archive")
async def archive_project(request: ArchiveProjectRequest) -> dict:
    """Archive a project (add to archived list)."""
    project_path = request.project_path
    archived = _load_archived_projects()

    if project_path not in archived:
        archived.append(project_path)
        if _save_archived_projects(archived):
            logger.info(f"Archived project: {project_path}")
            return {"status": "archived", "project_path": project_path}
        else:
            raise HTTPException(
                status_code=500, detail="Failed to save archived projects"
            )

    return {"status": "already_archived", "project_path": project_path}


@router.post("/archived-projects/unarchive")
async def unarchive_project(request: ArchiveProjectRequest) -> dict:
    """Unarchive a project (remove from archived list)."""
    project_path = request.project_path
    archived = _load_archived_projects()

    if project_path in archived:
        archived.remove(project_path)
        if _save_archived_projects(archived):
            logger.info(f"Unarchived project: {project_path}")
            return {"status": "unarchived", "project_path": project_path}
        else:
            raise HTTPException(
                status_code=500, detail="Failed to save archived projects"
            )

    return {"status": "not_archived", "project_path": project_path}
