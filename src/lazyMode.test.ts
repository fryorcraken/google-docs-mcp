import { describe, it, expect, vi, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  finalizeLazyMode,
  isLazyModeEnabled,
  setCurrentDomain,
  startLazyCapture,
  type CapturedTool,
} from './lazyMode.js';

// Minimal FastMCP-shaped fake. lazyMode only ever touches `addTool`.
function makeFakeServer() {
  const added: any[] = [];
  const server: any = {
    addTool: (t: any) => {
      added.push(t);
    },
  };
  return { server, added };
}

describe('isLazyModeEnabled', () => {
  it.each([
    ['1', true],
    ['true', true],
    ['TRUE', true],
    ['yes', true],
    ['on', true],
    ['0', false],
    ['false', false],
    ['no', false],
    ['', false],
    [undefined, false],
  ])('isLazyModeEnabled(%j) === %s', (input, expected) => {
    expect(isLazyModeEnabled(input as any)).toBe(expected);
  });
});

describe('startLazyCapture + finalizeLazyMode', () => {
  beforeEach(() => setCurrentDomain(undefined));

  it('captures tools into the registry instead of registering them', () => {
    const { server, added } = makeFakeServer();
    const registry = startLazyCapture(server);

    setCurrentDomain('docs');
    server.addTool({
      name: 'insertText',
      description: 'Insert text at an index.',
      parameters: z.object({ documentId: z.string() }),
      execute: async () => 'ok',
    });

    expect(added).toEqual([]); // never reached the real addTool
    expect(registry.all).toHaveLength(1);
    expect(registry.all[0].name).toBe('insertText');
    expect(registry.all[0].domain).toBe('docs');
    expect(registry.byName.get('insertText')?.name).toBe('insertText');
  });

  it('tags subsequent captures with the current domain', () => {
    const { server } = makeFakeServer();
    const registry = startLazyCapture(server);

    setCurrentDomain('docs');
    server.addTool({ name: 'a', execute: async () => 'a' });
    setCurrentDomain('sheets');
    server.addTool({ name: 'b', execute: async () => 'b' });
    setCurrentDomain(undefined);
    server.addTool({ name: 'c', execute: async () => 'c' });

    expect(registry.byName.get('a')?.domain).toBe('docs');
    expect(registry.byName.get('b')?.domain).toBe('sheets');
    expect(registry.byName.get('c')?.domain).toBe('unknown');
  });

  it('refuses to wrap the same server twice', () => {
    const { server } = makeFakeServer();
    startLazyCapture(server);
    expect(() => startLazyCapture(server)).toThrow(/already wrapped/);
  });

  it('finalizeLazyMode exposes exactly 3 meta-tools via realAddTool', () => {
    const { server, added } = makeFakeServer();
    const realAddTool = server.addTool.bind(server);
    const registry = startLazyCapture(server);

    setCurrentDomain('docs');
    server.addTool({ name: 'insertText', execute: async () => 'ok' });

    finalizeLazyMode(server, registry, realAddTool);

    const metaNames = added.map((t) => t.name);
    expect(metaNames).toEqual(['searchTools', 'describeTool', 'callTool']);
  });
});

describe('searchTools meta-tool', () => {
  function setup() {
    const { server, added } = makeFakeServer();
    const realAddTool = server.addTool.bind(server);
    const registry = startLazyCapture(server);

    setCurrentDomain('docs');
    server.addTool({
      name: 'insertText',
      description: 'Inserts text at a specific character index within a document.',
      parameters: z.object({ documentId: z.string(), text: z.string() }),
      execute: async () => 'inserted',
    });
    server.addTool({
      name: 'deleteRange',
      description: 'Deletes content between two indices.',
      parameters: z.object({ documentId: z.string() }),
      execute: async () => 'deleted',
    });

    setCurrentDomain('sheets');
    server.addTool({
      name: 'readSpreadsheet',
      description: 'Reads cell values from a Google Sheet.',
      parameters: z.object({ spreadsheetId: z.string() }),
      execute: async () => 'read',
    });

    setCurrentDomain(undefined);
    finalizeLazyMode(server, registry, realAddTool);

    const meta: Record<string, any> = {};
    for (const t of added) meta[t.name] = t;
    return { meta, registry };
  }

  it('returns all tools when no filter is provided', async () => {
    const { meta } = setup();
    const result = await meta.searchTools.execute({});
    expect(result).toContain('insertText');
    expect(result).toContain('deleteRange');
    expect(result).toContain('readSpreadsheet');
    expect(result).toContain('3 matches');
  });

  it('filters by domain', async () => {
    const { meta } = setup();
    const result = await meta.searchTools.execute({ domain: 'docs' });
    expect(result).toContain('insertText');
    expect(result).toContain('deleteRange');
    expect(result).not.toContain('readSpreadsheet');
  });

  it('filters by keyword query (substring, case-insensitive)', async () => {
    const { meta } = setup();
    const result = await meta.searchTools.execute({ query: 'INSERT' });
    expect(result).toContain('insertText');
    expect(result).not.toContain('readSpreadsheet');
  });

  it('combines query and domain filters with AND semantics', async () => {
    const { meta } = setup();
    const result = await meta.searchTools.execute({ query: 'read', domain: 'docs' });
    // "read" doesn't match insertText or deleteRange in domain=docs.
    expect(result).toContain('0 matches');
  });

  it('respects the limit parameter and reports truncation', async () => {
    const { meta } = setup();
    const result = await meta.searchTools.execute({ limit: 1 });
    expect(result).toContain('showing first 1');
  });
});

describe('describeTool meta-tool', () => {
  function setup() {
    const { server, added } = makeFakeServer();
    const realAddTool = server.addTool.bind(server);
    const registry = startLazyCapture(server);
    setCurrentDomain('docs');
    server.addTool({
      name: 'insertText',
      description: 'Inserts text.',
      parameters: z.object({ documentId: z.string(), text: z.string() }),
      execute: async () => 'ok',
    });
    setCurrentDomain(undefined);
    finalizeLazyMode(server, registry, realAddTool);
    const meta: Record<string, any> = {};
    for (const t of added) meta[t.name] = t;
    return { meta };
  }

  it('returns name + description + JSON schema for a known tool', async () => {
    const { meta } = setup();
    const result = await meta.describeTool.execute({ name: 'insertText' });
    const parsed = JSON.parse(result);
    expect(parsed.name).toBe('insertText');
    expect(parsed.domain).toBe('docs');
    expect(parsed.description).toBe('Inserts text.');
    expect(parsed.inputSchema.type).toBe('object');
    expect(parsed.inputSchema.properties).toHaveProperty('documentId');
    expect(parsed.inputSchema.properties).toHaveProperty('text');
  });

  it('throws UserError with did-you-mean for unknown tool', async () => {
    const { meta } = setup();
    await expect(meta.describeTool.execute({ name: 'insertTxt' })).rejects.toThrow(
      /Unknown tool "insertTxt"/
    );
  });
});

describe('callTool meta-tool', () => {
  function setup(opts?: { failingExecute?: boolean }) {
    const { server, added } = makeFakeServer();
    const realAddTool = server.addTool.bind(server);
    const registry = startLazyCapture(server);
    setCurrentDomain('docs');

    const execute = vi
      .fn()
      .mockImplementation(async (args: any) =>
        opts?.failingExecute ? Promise.reject(new Error('inner error')) : `inserted ${args.text}`
      );

    server.addTool({
      name: 'insertText',
      description: 'Inserts text.',
      parameters: z.object({ documentId: z.string(), text: z.string() }),
      execute,
    });
    setCurrentDomain(undefined);
    finalizeLazyMode(server, registry, realAddTool);
    const meta: Record<string, any> = {};
    for (const t of added) meta[t.name] = t;
    return { meta, execute };
  }

  it('routes a valid call to the underlying tool with parsed args', async () => {
    const { meta, execute } = setup();
    const result = await meta.callTool.execute(
      { name: 'insertText', args: { documentId: 'doc1', text: 'hello' } },
      { fakeCtx: true } as any
    );
    expect(result).toBe('inserted hello');
    expect(execute).toHaveBeenCalledWith({ documentId: 'doc1', text: 'hello' }, { fakeCtx: true });
  });

  it('rejects unknown tool name', async () => {
    const { meta } = setup();
    await expect(meta.callTool.execute({ name: 'nope', args: {} })).rejects.toThrow(/Unknown tool/);
  });

  it('validates args against the tool schema and surfaces zod errors', async () => {
    const { meta, execute } = setup();
    await expect(
      meta.callTool.execute({ name: 'insertText', args: { documentId: 'doc1' /* text missing */ } })
    ).rejects.toThrow(/Invalid arguments/);
    expect(execute).not.toHaveBeenCalled();
  });

  it('propagates errors thrown by the underlying tool', async () => {
    const { meta } = setup({ failingExecute: true });
    await expect(
      meta.callTool.execute({ name: 'insertText', args: { documentId: 'd', text: 't' } })
    ).rejects.toThrow(/inner error/);
  });
});
