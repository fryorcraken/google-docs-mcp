import type { FastMCP } from 'fastmcp';

const TEXTS = {
  en: {
    title: 'Google Docs MCP Server',
    subtitle: 'Model Context Protocol server for Google Docs, Sheets, Drive, Gmail &amp; Calendar',
    setup: 'Setup',
    step1: 'Copy the configuration below',
    step2: 'Open <strong>Cursor Settings → Tools &amp; MCP → Add new MCP server</strong>',
    step3: 'Paste the JSON and save',
    step4: 'Cursor will prompt you to sign in with Google on first use',
    config: 'Cursor MCP Configuration',
    copy: 'Copy',
    copied: 'Copied!',
    tools: 'tools available',
    footer:
      'Powered by <a href="https://github.com/a-bonus/google-docs-mcp">a-bonus/google-docs-mcp</a>',
  },
  cs: {
    title: 'Google Docs MCP Server',
    subtitle: 'Model Context Protocol server pro Google Docs, Sheets, Drive, Gmail &amp; Calendar',
    setup: 'Nastavení',
    step1: 'Zkopírujte konfiguraci níže',
    step2: 'Otevřete <strong>Cursor Settings → Tools &amp; MCP → Add new MCP server</strong>',
    step3: 'Vložte JSON a uložte',
    step4: 'Cursor vás při prvním použití vyzve k přihlášení přes Google',
    config: 'Konfigurace pro Cursor',
    copy: 'Kopírovat',
    copied: 'Zkopírováno!',
    tools: 'dostupných nástrojů',
    footer:
      'Poháněno <a href="https://github.com/a-bonus/google-docs-mcp">a-bonus/google-docs-mcp</a>',
  },
};

function pickLang(acceptLanguage: string | undefined): keyof typeof TEXTS {
  if (acceptLanguage?.toLowerCase().startsWith('cs')) return 'cs';
  return 'en';
}

function renderPage(lang: keyof typeof TEXTS, mcpUrl: string, toolCount: number): string {
  const t = TEXTS[lang];
  const configJson = JSON.stringify(
    { mcpServers: { 'google-docs': { type: 'streamableHttp', url: mcpUrl } } },
    null,
    2
  );

  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${t.title}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #f8f9fa; color: #1a1a1a; line-height: 1.6; padding: 2rem 1rem; }
    .container { max-width: 640px; margin: 0 auto; }
    h1 { font-size: 1.75rem; font-weight: 700; margin-bottom: 0.25rem; }
    .subtitle { color: #666; margin-bottom: 2rem; }
    .badge { display: inline-block; background: #e8f5e9; color: #2e7d32; font-size: 0.8rem; font-weight: 600; padding: 0.2rem 0.6rem; border-radius: 99px; margin-left: 0.5rem; vertical-align: middle; }
    h2 { font-size: 1.1rem; font-weight: 600; margin: 1.5rem 0 0.75rem; }
    ol { padding-left: 1.5rem; margin-bottom: 1.5rem; }
    li { margin-bottom: 0.4rem; }
    .code-block { position: relative; background: #1e1e1e; color: #d4d4d4; border-radius: 8px; padding: 1rem; font-family: 'SF Mono', 'Fira Code', monospace; font-size: 0.85rem; overflow-x: auto; white-space: pre; margin-bottom: 1.5rem; }
    .copy-btn { position: absolute; top: 0.5rem; right: 0.5rem; background: #333; color: #ccc; border: none; border-radius: 4px; padding: 0.3rem 0.6rem; font-size: 0.75rem; cursor: pointer; transition: background 0.2s; }
    .copy-btn:hover { background: #555; }
    .footer { margin-top: 2rem; padding-top: 1rem; border-top: 1px solid #ddd; color: #888; font-size: 0.8rem; }
    .footer a { color: #666; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${t.title} <span class="badge">${toolCount} ${t.tools}</span></h1>
    <p class="subtitle">${t.subtitle}</p>

    <h2>${t.setup}</h2>
    <ol>
      <li>${t.step1}</li>
      <li>${t.step2}</li>
      <li>${t.step3}</li>
      <li>${t.step4}</li>
    </ol>

    <h2>${t.config}</h2>
    <div class="code-block"><button class="copy-btn" onclick="copyConfig()">${t.copy}</button><code id="config">${escapeHtml(configJson)}</code></div>

    <p class="footer">${t.footer}</p>
  </div>
  <script>
    var _cfg = ${JSON.stringify(configJson).replace(/</g, '\\u003c')};
    function copyConfig() {
      navigator.clipboard.writeText(_cfg);
      var btn = document.querySelector('.copy-btn');
      btn.textContent = '${t.copied}';
      setTimeout(function() { btn.textContent = '${t.copy}'; }, 2000);
    }
  </script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

export function registerLandingPage(server: FastMCP, toolCount: number): void {
  const baseUrl = process.env.BASE_URL || '';
  const mcpUrl = `${baseUrl}/mcp`;

  const app = server.getApp();
  app.get('/', (c) => {
    const lang = pickLang(c.req.header('accept-language'));
    return c.html(renderPage(lang, mcpUrl, toolCount));
  });
}
