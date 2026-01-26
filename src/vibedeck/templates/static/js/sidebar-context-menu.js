// Sidebar context menu for projects and sessions

import { state } from './state.js';
import { copyToClipboard } from './utils.js';
import { loadFileTree, openRightPane } from './filetree.js';
import { archiveSession, unarchiveSession, switchToSession, setSessionStatus, archiveProject, unarchiveProject } from './sessions.js';
import { openDiffView } from './diff.js';

let sidebarContextMenu = null;
let currentMenuType = null; // 'project' or 'session'
let currentMenuData = null;

// Initialize the sidebar context menu
export function initSidebarContextMenu() {
    sidebarContextMenu = document.createElement('div');
    sidebarContextMenu.className = 'tree-context-menu sidebar-context-menu';
    sidebarContextMenu.innerHTML = '';
    sidebarContextMenu.style.display = 'none';
    document.body.appendChild(sidebarContextMenu);

    sidebarContextMenu.addEventListener('click', handleSidebarContextMenuClick);

    // Close menu when clicking elsewhere
    document.addEventListener('click', hideSidebarContextMenu);
    document.addEventListener('contextmenu', (e) => {
        // Close existing menu if right-clicking elsewhere
        if (!e.target.closest('.project-header') && !e.target.closest('.session-item')) {
            hideSidebarContextMenu();
        }
    });
}

// Show context menu for a project
export function showProjectContextMenu(e, projectPath, projectName) {
    e.preventDefault();
    e.stopPropagation();

    if (!sidebarContextMenu) return;

    currentMenuType = 'project';
    currentMenuData = { path: projectPath, name: projectName };

    // Build menu items for project
    const isProjectArchived = projectPath && state.archivedProjectPaths.has(projectPath);
    let menuItems = '';

    if (projectPath) {
        menuItems += `<button class="context-menu-item" data-action="copy-path">Copy project directory</button>`;
        menuItems += `<button class="context-menu-item" data-action="open-file-browser">Open in file browser</button>`;
        menuItems += `<div class="context-menu-divider"></div>`;
        if (isProjectArchived) {
            menuItems += `<button class="context-menu-item" data-action="unarchive-project">Unarchive project</button>`;
        } else {
            menuItems += `<button class="context-menu-item" data-action="archive-project">Archive project</button>`;
        }
    } else {
        menuItems += `<button class="context-menu-item" disabled>No project path available</button>`;
    }

    sidebarContextMenu.innerHTML = menuItems;
    positionAndShowMenu(e);
}

// Show context menu for a session
export function showSessionContextMenu(e, sessionId) {
    e.preventDefault();
    e.stopPropagation();

    if (!sidebarContextMenu) return;

    const session = state.sessions.get(sessionId);
    if (!session) return;

    currentMenuType = 'session';
    currentMenuData = { sessionId, session };

    // Build menu items for session
    const isArchived = state.archivedSessionIds.has(sessionId);
    const isProjectArchived = session.cwd && state.archivedProjectPaths.has(session.cwd);
    const currentStatus = state.sessionStatuses.get(sessionId) || null;
    let menuItems = '';

    // View diff and file browser options (if session has a project path)
    if (session.cwd) {
        menuItems += `<button class="context-menu-item" data-action="view-diff">View diff</button>`;
        menuItems += `<button class="context-menu-item" data-action="open-session-files">Open in file browser</button>`;
    }

    menuItems += `<button class="context-menu-item" data-action="trigger-summary">Trigger summary</button>`;

    // Status submenu
    menuItems += `<div class="context-menu-divider"></div>`;
    menuItems += `<div class="context-menu-label">Set Status</div>`;
    menuItems += `<button class="context-menu-item${currentStatus === null ? ' selected' : ''}" data-action="set-status-none">None</button>`;
    menuItems += `<button class="context-menu-item${currentStatus === 'in_progress' ? ' selected status-in-progress' : ''}" data-action="set-status-in-progress">In Progress</button>`;
    menuItems += `<button class="context-menu-item${currentStatus === 'waiting' ? ' selected status-waiting' : ''}" data-action="set-status-waiting">Waiting for input</button>`;
    menuItems += `<button class="context-menu-item${currentStatus === 'done' ? ' selected status-done' : ''}" data-action="set-status-done">Done</button>`;
    menuItems += `<div class="context-menu-divider"></div>`;

    if (isArchived) {
        menuItems += `<button class="context-menu-item" data-action="unarchive">Unarchive session</button>`;
    } else {
        menuItems += `<button class="context-menu-item" data-action="archive">Archive session</button>`;
    }

    // Project archive option (if session has a project path)
    if (session.cwd) {
        if (isProjectArchived) {
            menuItems += `<button class="context-menu-item" data-action="unarchive-project">Unarchive project</button>`;
        } else {
            menuItems += `<button class="context-menu-item" data-action="archive-project">Archive project</button>`;
        }
    }

    sidebarContextMenu.innerHTML = menuItems;
    positionAndShowMenu(e);
}

function positionAndShowMenu(e) {
    sidebarContextMenu.style.display = 'block';
    sidebarContextMenu.style.left = e.clientX + 'px';
    sidebarContextMenu.style.top = e.clientY + 'px';

    // Ensure menu stays within viewport
    const rect = sidebarContextMenu.getBoundingClientRect();
    if (rect.right > window.innerWidth) {
        sidebarContextMenu.style.left = (e.clientX - rect.width) + 'px';
    }
    if (rect.bottom > window.innerHeight) {
        sidebarContextMenu.style.top = (e.clientY - rect.height) + 'px';
    }
}

function hideSidebarContextMenu() {
    if (sidebarContextMenu) {
        sidebarContextMenu.style.display = 'none';
    }
    currentMenuType = null;
    currentMenuData = null;
}

function handleSidebarContextMenuClick(e) {
    const action = e.target.dataset.action;
    if (!action) return;

    if (currentMenuType === 'project') {
        handleProjectAction(action);
    } else if (currentMenuType === 'session') {
        handleSessionAction(action);
    }

    hideSidebarContextMenu();
}

function handleProjectAction(action) {
    if (!currentMenuData) return;

    if (action === 'copy-path') {
        if (!currentMenuData.path) return;
        // Use the existing copyToClipboard utility which handles HTTP fallback
        copyToClipboard(currentMenuData.path, null);
        showFlashMessage('Project path copied', 'success');
    } else if (action === 'open-file-browser') {
        if (!currentMenuData.path) return;
        openInFileBrowser(currentMenuData.path);
    } else if (action === 'archive-project') {
        if (!currentMenuData.path) return;
        archiveProject(currentMenuData.path);
        showFlashMessage('Project archived', 'success');
    } else if (action === 'unarchive-project') {
        if (!currentMenuData.path) return;
        unarchiveProject(currentMenuData.path);
        showFlashMessage('Project unarchived', 'success');
    }
}

async function handleSessionAction(action) {
    if (!currentMenuData || !currentMenuData.sessionId) return;

    if (action === 'view-diff') {
        viewSessionDiff(currentMenuData.sessionId, currentMenuData.session);
    } else if (action === 'open-session-files') {
        openSessionInFileBrowser(currentMenuData.sessionId, currentMenuData.session);
    } else if (action === 'trigger-summary') {
        await triggerSummary(currentMenuData.sessionId);
    } else if (action === 'archive') {
        archiveSession(currentMenuData.sessionId);
        showFlashMessage('Session archived', 'success');
    } else if (action === 'unarchive') {
        unarchiveSession(currentMenuData.sessionId);
        showFlashMessage('Session unarchived', 'success');
    } else if (action === 'set-status-none') {
        setSessionStatus(currentMenuData.sessionId, null);
        showFlashMessage('Status cleared', 'success');
    } else if (action === 'set-status-in-progress') {
        setSessionStatus(currentMenuData.sessionId, 'in_progress');
        showFlashMessage('Status: In Progress', 'success');
    } else if (action === 'set-status-waiting') {
        setSessionStatus(currentMenuData.sessionId, 'waiting');
        showFlashMessage('Status: Waiting for input', 'success');
    } else if (action === 'set-status-done') {
        setSessionStatus(currentMenuData.sessionId, 'done');
        showFlashMessage('Status: Done', 'success');
    } else if (action === 'archive-project') {
        if (!currentMenuData.session.cwd) return;
        archiveProject(currentMenuData.session.cwd);
        showFlashMessage('Project archived', 'success');
    } else if (action === 'unarchive-project') {
        if (!currentMenuData.session.cwd) return;
        unarchiveProject(currentMenuData.session.cwd);
        showFlashMessage('Project unarchived', 'success');
    }
}

/**
 * Get the working directory for a session, detecting worktrees.
 * If the session has a branch that's not main/master, try to find the worktree.
 * Returns the worktree path if applicable, otherwise the project root.
 */
function getSessionWorkingDir(session) {
    if (!session.cwd) return null;

    let workDir = session.cwd;

    // If session has a branch and it's not main/master, try worktree path
    const branch = session.summaryBranch;
    if (branch && branch !== 'main' && branch !== 'master') {
        // Convention: worktrees are at {projectPath}/worktrees/{branch}
        workDir = `${session.cwd}/worktrees/${branch}`;
    }

    return workDir;
}

/**
 * Open diff view for a session, determining the correct working directory.
 */
function viewSessionDiff(sessionId, session) {
    if (!session.cwd) {
        showFlashMessage('No project path for session', 'error');
        return;
    }

    // Switch to the session first (diff view uses activeSessionId)
    switchToSession(sessionId, false);

    const diffPath = getSessionWorkingDir(session);

    // Open the diff view with the path to set the cwd
    // The backend's _resolve_cwd will find the git root from this path
    openDiffView(diffPath);
}

/**
 * Open file browser for a session, using worktree path if applicable.
 */
function openSessionInFileBrowser(sessionId, session) {
    if (!session.cwd) {
        showFlashMessage('No project path for session', 'error');
        return;
    }

    // Switch to the session first
    switchToSession(sessionId, false);

    const workDir = getSessionWorkingDir(session);

    // Open the right pane and load the file tree
    openRightPane();
    loadFileTree(sessionId, workDir);
}

function showFlashMessage(message, type) {
    const flash = document.getElementById('flash-message');
    if (flash) {
        flash.textContent = message;
        flash.className = 'flash-message visible ' + type;
        setTimeout(() => flash.classList.remove('visible'), 2000);
    }
}

function openInFileBrowser(path) {
    // Open the right pane (file tree) and load the specified path
    openRightPane();

    // Use the active session ID for the file tree API
    const sessionId = state.activeSessionId;
    if (sessionId) {
        loadFileTree(sessionId, path);
    }
}

async function triggerSummary(sessionId) {
    try {
        showFlashMessage('Triggering summary...', 'info');

        const response = await fetch(`/sessions/${sessionId}/summarize`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
        });

        const data = await response.json();

        if (response.ok) {
            showFlashMessage('Summary started', 'success');
        } else {
            showFlashMessage(data.detail || 'Failed to trigger summary', 'error');
        }
    } catch (err) {
        console.error('Error triggering summary:', err);
        showFlashMessage('Failed to trigger summary', 'error');
    }
}
