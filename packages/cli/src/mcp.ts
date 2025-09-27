// packages/cli/src/mcp.ts
// Normalizes Gemini functionCall -> MCP /call-tool payload and performs the POST.
// Also provides a helper to craft a functionResponse part for Gemini.
//
// Env:
//   MCP_BASE_URL   (default: http://127.0.0.1:3571)
//   MCP_TIMEOUT_MS (default: 15000)

export const MCP_BASE_URL =
  process.env.MCP_BASE_URL ?? "http://127.0.0.1:3571";

const STRIP_KEYS = new Set([
  "name","tool","function","id","type",
  "callId","prompt_id","isClientInitiated","responseMimeType"
]);
const parseTimeout = (v: unknown, fallback: number) => {
  const n = typeof v === 'string' ? Number(v) : Number.NaN;
  return Number.isFinite(n) ? n : fallback;
};
export const DEFAULT_TIMEOUT_MS = parseTimeout(process.env.MCP_TIMEOUT_MS, 15000);

const TIMEOUTS: Record<string, number> = {
  play_scene: 60000,
  get_editor_screenshot: 30000,
  get_running_scene_screenshot: 30000,
};

// Optional per-tool env override, e.g. MCP_TIMEOUT_MS_PLAY_SCENE=70000
function getToolTimeout(toolName: string, defaultMs: number) {
  const envKey = `MCP_TIMEOUT_MS_${toolName.toUpperCase()}`.replace(/[^A-Z0-9_]/g, '_');
  const fromEnv = process.env[envKey];
  if (fromEnv) {
    const n = Number(fromEnv);
    if (Number.isFinite(n)) return n;
  }
  return defaultMs;
}

function looksLikeEnvelope(o: any): boolean {
  if (!o || typeof o !== 'object') return false;
  // If any of these more specific meta keys exist, treat as an envelope we should strip.
  return ['name','tool','function','callId','isClientInitiated','prompt_id','responseMimeType'].some(k => k in o);
}

function normalizeArgs(args: unknown) {
  let obj: unknown = args;

  // If the model passed a JSON string, parse it.
  if (typeof obj === 'string') {
    try { obj = JSON.parse(obj); } catch { /* keep as string */ }
  }

  if (!obj || typeof obj !== 'object') return {};

  // Prefer the nested payload if present (both spellings observed).
  const src: any =
    ('arguments' in (obj as any) && typeof (obj as any).arguments === 'object')
      ? (obj as any).arguments
      : ('args' in (obj as any) && typeof (obj as any).args === 'object')
      ? (obj as any).args
      : obj;

  const cleaned: Record<string, unknown> = {};
  const shouldStrip = looksLikeEnvelope(src);
  for (const [k, v] of Object.entries(src)) {
    if (shouldStrip && STRIP_KEYS.has(k)) continue;
    cleaned[k] = v;
  }
  return cleaned;
}

export type McpResponse = {
  is_error?: boolean;
  type?: "text" | "image" | "json";
  mime_type?: string;
  tool_call_result?: unknown;
};

export async function callMCP(
  toolName: string,
  args: Record<string, unknown> | undefined,
  timeoutMs = DEFAULT_TIMEOUT_MS,
  signal?: AbortSignal,
): Promise<McpResponse> {
  const body = {
    tool_name: toolName,
    tool_args: normalizeArgs(args),
  };

  const effTimeout = getToolTimeout(toolName, TIMEOUTS[toolName] ?? timeoutMs);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), effTimeout);

  const abortHandler = () => {
    ctrl.abort();
  };

  signal?.addEventListener('abort', abortHandler);

  try {
    const res = await fetch(`${MCP_BASE_URL}/call-tool`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'accept': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    const text = await res.text();

    if (!res.ok) {
      throw new Error(`MCP HTTP ${res.status}: ${text}`);
    }

    let json: McpResponse;
    try {
      json = JSON.parse(text);
    } catch {
      throw new Error(`MCP non-JSON response: ${text.slice(0, 200)}`);
    }

    if (json?.is_error) {
      const msg =
        typeof json.tool_call_result === 'string'
          ? json.tool_call_result
          : 'MCP error';
      throw new Error(msg);
    }

    return json;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', abortHandler);
  }
}

/**
 * Builds a Gemini functionResponse part from an MCP response.
 * Push this into history as { role: "tool", parts: [returnedPart] }.
 */
export function toFunctionResponsePart(
  name: string,
  mcp: McpResponse,
  id?: string,
) {
  return {
    functionResponse: {
      id,
      name,
      // Keep response an object; your functionDeclaration can be loose
      // or you can tighten it later.
      response: {
        ok: true,
        type: mcp.type ?? 'text',
        mime_type: mcp.mime_type,
        result: mcp.tool_call_result,
      },
    },
  };
}