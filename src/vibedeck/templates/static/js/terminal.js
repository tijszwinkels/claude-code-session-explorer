/**
 * Terminal integration using xterm.js
 *
 * Provides an embedded terminal in the right pane with WebSocket connection
 * to a server-side PTY.
 */

import { dom, state } from './state.js';

// Terminal state
let terminal = null;
let fitAddon = null;
let webSocket = null;
let terminalEnabled = false;

/**
 * Initialize the terminal module.
 * Checks if terminal is enabled and sets up event listeners.
 */
export async function initTerminal() {
    // Check if terminal feature is enabled
    try {
        const response = await fetch('/api/terminal/enabled');
        const data = await response.json();
        terminalEnabled = data.enabled;
    } catch (e) {
        console.warn('Failed to check terminal status:', e);
        terminalEnabled = false;
    }

    if (!terminalEnabled) {
        // Hide terminal toggle button if feature is disabled
        const toggleBtn = document.getElementById('terminal-toggle-btn');
        if (toggleBtn) {
            toggleBtn.style.display = 'none';
        }
        return;
    }

    // Set up toggle button
    const toggleBtn = document.getElementById('terminal-toggle-btn');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', toggleTerminal);
        toggleBtn.addEventListener('dblclick', toggleTerminalOnly);
    }

    // Set up resize handle
    const resizeHandle = document.getElementById('terminal-resize-handle');
    if (resizeHandle) {
        initResizeHandle(resizeHandle);
    }

    // Load xterm.js dynamically
    await loadXterm();
}

/**
 * Load xterm.js and addons from CDN.
 */
async function loadXterm() {
    // Check if already loaded
    if (window.Terminal) {
        console.log('xterm.js already loaded');
        return;
    }

    console.log('Loading xterm.js from CDN...');

    // Load CSS
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/css/xterm.min.css';
    document.head.appendChild(link);

    // Load xterm.js
    await loadScript('https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/lib/xterm.min.js');
    console.log('xterm.js loaded, Terminal:', typeof window.Terminal);

    // Load fit addon
    await loadScript('https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/lib/addon-fit.min.js');
    console.log('FitAddon loaded:', typeof window.FitAddon);

    // Load web-links addon
    await loadScript('https://cdn.jsdelivr.net/npm/@xterm/addon-web-links@0.11.0/lib/addon-web-links.min.js');
    console.log('WebLinksAddon loaded:', typeof window.WebLinksAddon);
}

/**
 * Helper to load a script dynamically.
 */
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

/**
 * Toggle terminal panel visibility.
 */
export function toggleTerminal() {
    if (!terminalEnabled) return;

    state.terminalOpen = !state.terminalOpen;

    const panel = document.getElementById('terminal-panel');
    const toggleBtn = document.getElementById('terminal-toggle-btn');

    if (state.terminalOpen) {
        panel?.classList.add('open');
        toggleBtn?.classList.add('active');
        openTerminal();
    } else {
        panel?.classList.remove('open');
        toggleBtn?.classList.remove('active');
        closeTerminal();
    }
}

/**
 * Toggle terminal-only mode (full height, hide file preview).
 */
export function toggleTerminalOnly() {
    if (!terminalEnabled || !state.terminalOpen) return;

    state.terminalOnly = !state.terminalOnly;

    const mainArea = document.querySelector('.preview-main-area');
    if (state.terminalOnly) {
        mainArea?.classList.add('terminal-only');
    } else {
        mainArea?.classList.remove('terminal-only');
    }

    // Resize terminal to fit new dimensions
    if (terminal && fitAddon) {
        setTimeout(() => fitAddon.fit(), 100);
    }
}

/**
 * Open terminal and connect to WebSocket.
 */
async function openTerminal() {
    const container = document.getElementById('terminal-container');
    if (!container) return;

    // Create terminal if not exists
    if (!terminal) {
        terminal = new window.Terminal({
            cursorBlink: true,
            fontSize: 14,
            fontFamily: 'ui-monospace, "SF Mono", Menlo, Monaco, "Cascadia Mono", "Segoe UI Mono", "Roboto Mono", monospace',
            theme: getTerminalTheme(),
            allowProposedApi: true,
        });

        // Add fit addon
        fitAddon = new window.FitAddon.FitAddon();
        terminal.loadAddon(fitAddon);

        // Add web links addon
        const webLinksAddon = new window.WebLinksAddon.WebLinksAddon();
        terminal.loadAddon(webLinksAddon);

        terminal.open(container);
        fitAddon.fit();

        // Focus terminal when clicking on container
        container.addEventListener('click', () => {
            terminal.focus();
        });

        // Handle terminal input
        terminal.onData(data => {
            console.log('Terminal onData:', JSON.stringify(data), 'WebSocket state:', webSocket?.readyState);
            if (webSocket && webSocket.readyState === WebSocket.OPEN) {
                webSocket.send(JSON.stringify({ type: 'input', data }));
                console.log('Sent to WebSocket');
            } else {
                console.warn('WebSocket not ready, state:', webSocket?.readyState);
            }
        });

        // Handle resize
        terminal.onResize(({ cols, rows }) => {
            if (webSocket && webSocket.readyState === WebSocket.OPEN) {
                webSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
            }
        });

        // Resize on window resize
        window.addEventListener('resize', () => {
            if (state.terminalOpen && fitAddon) {
                fitAddon.fit();
            }
        });
    }

    // Connect WebSocket
    connectWebSocket();

    // Focus terminal after a short delay to ensure it's ready
    setTimeout(() => {
        terminal?.focus();
    }, 100);
}

/**
 * Get terminal theme based on current page theme.
 */
function getTerminalTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) {
        return {
            background: '#1a1a1a',
            foreground: '#e0e0e0',
            cursor: '#ffffff',
            cursorAccent: '#1a1a1a',
            selection: 'rgba(255, 255, 255, 0.3)',
        };
    } else {
        return {
            background: '#ffffff',
            foreground: '#1a1a1a',
            cursor: '#000000',
            cursorAccent: '#ffffff',
            selection: 'rgba(0, 0, 0, 0.3)',
        };
    }
}

/**
 * Connect to terminal WebSocket.
 */
function connectWebSocket() {
    if (webSocket && webSocket.readyState === WebSocket.OPEN) {
        return; // Already connected
    }

    // Get working directory from active session if available
    let cwd = null;
    if (state.activeSessionId) {
        const session = state.sessions?.get(state.activeSessionId);
        if (session?.cwd) {
            cwd = session.cwd;
        }
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    let url = `${protocol}//${window.location.host}/ws/terminal`;
    if (cwd) {
        url += `?cwd=${encodeURIComponent(cwd)}`;
    }

    webSocket = new WebSocket(url);

    webSocket.onopen = () => {
        console.log('Terminal WebSocket connected, readyState:', webSocket.readyState);
        // Send initial resize
        if (terminal && fitAddon) {
            fitAddon.fit();
            const { cols, rows } = terminal;
            console.log('Sending initial resize:', cols, 'x', rows);
            webSocket.send(JSON.stringify({ type: 'resize', cols, rows }));
        }
    };

    webSocket.onmessage = (event) => {
        try {
            const msg = JSON.parse(event.data);
            if (msg.type === 'output' && terminal) {
                terminal.write(msg.data);
            } else if (msg.type === 'exit') {
                console.log('Shell exited with code:', msg.code);
                terminal?.write('\r\n[Process exited]\r\n');
            } else if (msg.type === 'error') {
                console.error('Terminal error:', msg.message);
                terminal?.write(`\r\n[Error: ${msg.message}]\r\n`);
            }
        } catch (e) {
            console.error('Failed to parse terminal message:', e);
        }
    };

    webSocket.onclose = (event) => {
        console.log('Terminal WebSocket closed:', event.code, event.reason);
        if (state.terminalOpen && event.code !== 1000) {
            // Unexpected close, try to reconnect after delay
            setTimeout(() => {
                if (state.terminalOpen) {
                    terminal?.write('\r\n[Reconnecting...]\r\n');
                    connectWebSocket();
                }
            }, 2000);
        }
    };

    webSocket.onerror = (error) => {
        console.error('Terminal WebSocket error:', error);
    };
}

/**
 * Close terminal and disconnect WebSocket.
 */
function closeTerminal() {
    if (webSocket) {
        webSocket.close(1000, 'User closed terminal');
        webSocket = null;
    }
}

/**
 * Initialize resize handle for terminal panel.
 */
function initResizeHandle(handle) {
    let startY = 0;
    let startHeight = 0;

    handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startY = e.clientY;
        const panel = document.getElementById('terminal-panel');
        startHeight = panel?.offsetHeight || 200;

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
        document.body.style.cursor = 'ns-resize';
        document.body.style.userSelect = 'none';
    });

    function onMouseMove(e) {
        // Moving up increases height (since panel is at bottom)
        const delta = startY - e.clientY;
        const newHeight = Math.max(100, Math.min(window.innerHeight * 0.8, startHeight + delta));

        const panel = document.getElementById('terminal-panel');
        if (panel) {
            panel.style.height = `${newHeight}px`;
            state.terminalHeight = newHeight;
        }

        // Resize terminal to fit
        if (fitAddon) {
            fitAddon.fit();
        }
    }

    function onMouseUp() {
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
    }
}

/**
 * Update terminal theme when page theme changes.
 */
export function updateTerminalTheme() {
    if (terminal) {
        terminal.options.theme = getTerminalTheme();
    }
}

/**
 * Check if terminal is available/enabled.
 */
export function isTerminalEnabled() {
    return terminalEnabled;
}
