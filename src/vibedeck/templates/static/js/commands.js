// Commands module - Parse and execute VibeDeck GUI commands
//
// Commands are embedded as ```vibedeck code blocks in the LLM's markdown output,
// which get rendered as <pre><code class="language-vibedeck"> in HTML.

import { state } from './state.js';

/**
 * Parse and execute VibeDeck commands from HTML content.
 * Commands are executed but kept visible in the output.
 *
 * @param {string} html - HTML content that may contain vibedeck commands
 * @param {string} sessionId - Current session ID for path resolution
 * @returns {string} HTML (unmodified)
 */
export function parseAndExecuteCommands(html, sessionId) {
    // Match <pre><code class="language-vibedeck">...</code></pre> blocks
    // These are rendered from ```vibedeck markdown code blocks
    const vibedeckPattern = /<pre><code[^>]*class="[^"]*language-vibedeck[^"]*"[^>]*>([\s\S]*?)<\/code><\/pre>/gi;

    let match;
    // Create a copy for iteration since we'll modify the string
    const htmlCopy = html;

    while ((match = vibedeckPattern.exec(htmlCopy)) !== null) {
        // Decode HTML entities in the code block content
        const commandBlock = decodeHtmlEntities(match[1]);
        console.log('[VibeDeck] Found command block:', commandBlock.trim());
        executeCommandBlock(commandBlock, sessionId);
    }

    // Keep vibedeck code blocks visible in output (don't strip them)
    return html;
}

/**
 * Decode HTML entities in text.
 * @param {string} text - Text with HTML entities
 * @returns {string} Decoded text
 */
function decodeHtmlEntities(text) {
    const textarea = document.createElement('textarea');
    textarea.innerHTML = text;
    return textarea.value;
}

/**
 * Execute a single command block.
 * @param {string} block - The command block content (XML-like syntax)
 * @param {string} sessionId - Current session ID
 */
function executeCommandBlock(block, sessionId) {
    // Parse XML-like commands
    // <openFile path="..." follow="true" line="42" />
    // <openUrl url="..." />

    const openFileMatch = block.match(/<openFile\s+([^>]*)\/>/i);
    if (openFileMatch) {
        const attrs = parseAttributes(openFileMatch[1]);
        executeOpenFile(attrs, sessionId);
        return;
    }

    const openUrlMatch = block.match(/<openUrl\s+([^>]*)\/>/i);
    if (openUrlMatch) {
        const attrs = parseAttributes(openUrlMatch[1]);
        executeOpenUrl(attrs);
        return;
    }

    console.warn('Unknown VibeDeck command:', block);
}

/**
 * Parse XML-style attributes from a string.
 * @param {string} attrString - String like 'path="value" follow="true"'
 * @returns {Object} Parsed attributes
 */
function parseAttributes(attrString) {
    const attrs = {};
    const attrPattern = /(\w+)="([^"]*)"/g;
    let match;
    while ((match = attrPattern.exec(attrString)) !== null) {
        attrs[match[1]] = match[2];
    }
    return attrs;
}

/**
 * Execute an openFile command.
 * @param {Object} attrs - Command attributes {path, follow, line}
 * @param {string} sessionId - Current session ID
 */
async function executeOpenFile(attrs, sessionId) {
    const { path, follow, line } = attrs;
    console.log('[VibeDeck] executeOpenFile:', { path, follow, line, sessionId });
    if (!path) {
        console.warn('openFile: missing path attribute');
        return;
    }

    try {
        // Resolve the path (handles ~, relative paths, etc.)
        const resolvedPath = await resolvePath(path, sessionId);
        console.log('[VibeDeck] Resolved path:', resolvedPath);
        if (!resolvedPath) {
            console.warn('openFile: path resolution failed for', path);
            return;
        }

        // Import preview functions dynamically to avoid circular dependencies
        const { openPreviewPane, setFollowMode, scrollToLine } = await import('./preview.js');

        // Set follow mode if specified (before opening to affect initial state)
        if (follow === 'true') {
            setFollowMode(true);
        }

        // Open the file
        await openPreviewPane(resolvedPath);

        // Jump to line if specified (after file is loaded)
        if (line) {
            const lineNum = parseInt(line, 10);
            if (!isNaN(lineNum) && lineNum > 0) {
                // Small delay to ensure content is rendered
                setTimeout(() => scrollToLine(lineNum), 100);
            }
        }
    } catch (err) {
        console.error('openFile: error executing command', err);
    }
}

/**
 * Execute an openUrl command.
 * @param {Object} attrs - Command attributes {url}
 */
async function executeOpenUrl(attrs) {
    const { url } = attrs;
    if (!url) {
        console.warn('openUrl: missing url attribute');
        return;
    }

    // Validate URL (http/https only)
    if (!url.startsWith('http://') && !url.startsWith('https://')) {
        console.warn('openUrl: invalid URL scheme, must be http or https');
        return;
    }

    try {
        const { openUrlPane } = await import('./preview.js');
        openUrlPane(url);
    } catch (err) {
        console.error('openUrl: error executing command', err);
    }
}

/**
 * Resolve a path using the server API.
 * Handles ~ expansion and relative path resolution.
 * @param {string} path - Path to resolve
 * @param {string} sessionId - Session ID for relative path context
 * @returns {Promise<string|null>} Resolved absolute path or null if not found
 */
async function resolvePath(path, sessionId) {
    try {
        const params = new URLSearchParams({ path });
        if (sessionId) {
            params.set('session_id', sessionId);
        }

        const response = await fetch(`/api/path/resolve?${params}`);
        if (!response.ok) {
            return null;
        }

        const data = await response.json();
        return data.resolved || null;
    } catch (err) {
        console.error('resolvePath: fetch error', err);
        return null;
    }
}
