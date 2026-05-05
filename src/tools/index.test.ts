import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// IMPORTANT: registerAllTools reads process.env.GOOGLE_MCP_SCOPES, so
// each test must reset the env var.
describe('registerAllTools — conditional registration', () => {
  let originalScopes: string | undefined;

  beforeEach(() => {
    originalScopes = process.env.GOOGLE_MCP_SCOPES;
  });

  afterEach(() => {
    if (originalScopes === undefined) delete process.env.GOOGLE_MCP_SCOPES;
    else process.env.GOOGLE_MCP_SCOPES = originalScopes;
    vi.resetModules();
  });

  async function loadAndRegister(): Promise<{ toolNames: string[] }> {
    // vi.resetModules + dynamic import so each test sees a fresh
    // tool/index.ts that re-reads the env var.
    vi.resetModules();
    const { registerAllTools } = await import('./index.js');

    const addedTools: string[] = [];
    const fakeServer = {
      addTool: ({ name }: { name: string }) => {
        addedTools.push(name);
      },
      // FastMCP exposes more methods, but registerAllTools only calls addTool.
    } as any;
    registerAllTools(fakeServer);
    return { toolNames: addedTools };
  }

  it('registers tools from every domain when env var is unset', async () => {
    delete process.env.GOOGLE_MCP_SCOPES;
    const { toolNames } = await loadAndRegister();

    // Sanity checks across multiple domains rather than asserting the
    // full ~100-tool list (brittle as new tools are added).
    expect(toolNames).toContain('readDocument'); // docs
    expect(toolNames).toContain('listDriveFiles'); // drive
    expect(toolNames).toContain('readSpreadsheet'); // sheets
    expect(toolNames).toContain('createPresentation'); // slides
    expect(toolNames).toContain('listMessages'); // gmail
    expect(toolNames).toContain('listEvents'); // calendar
  });

  it('registers only docs+drive tools when GOOGLE_MCP_SCOPES=docs,drive', async () => {
    process.env.GOOGLE_MCP_SCOPES = 'docs,drive';
    const { toolNames } = await loadAndRegister();

    expect(toolNames).toContain('readDocument'); // docs — included
    expect(toolNames).toContain('listDriveFiles'); // drive — included
    expect(toolNames).not.toContain('readSpreadsheet'); // sheets — excluded
    expect(toolNames).not.toContain('createPresentation'); // slides — excluded
    expect(toolNames).not.toContain('listMessages'); // gmail — excluded
    expect(toolNames).not.toContain('listEvents'); // calendar — excluded
  });

  it('registers only slides tools when GOOGLE_MCP_SCOPES=slides', async () => {
    process.env.GOOGLE_MCP_SCOPES = 'slides';
    const { toolNames } = await loadAndRegister();

    expect(toolNames).toContain('createPresentation');
    expect(toolNames).toContain('listSlides');
    expect(toolNames).not.toContain('readDocument');
    expect(toolNames).not.toContain('readSpreadsheet');
  });
});
