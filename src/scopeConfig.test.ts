import { describe, it, expect } from 'vitest';
import { ALL_DOMAINS, parseEnabledDomains, getEnabledScopes } from './scopeConfig.js';

describe('parseEnabledDomains', () => {
  it('returns every domain when env var is undefined', () => {
    expect(parseEnabledDomains(undefined)).toEqual(Object.keys(ALL_DOMAINS));
  });

  it('returns every domain when env var is empty string', () => {
    expect(parseEnabledDomains('')).toEqual(Object.keys(ALL_DOMAINS));
  });

  it('returns every domain when env var is whitespace only', () => {
    expect(parseEnabledDomains('   ')).toEqual(Object.keys(ALL_DOMAINS));
  });

  it('parses a comma-separated subset', () => {
    expect(parseEnabledDomains('docs,drive')).toEqual(['docs', 'drive']);
  });

  it('is case-insensitive and trims whitespace', () => {
    expect(parseEnabledDomains(' Docs , DRIVE  ')).toEqual(['docs', 'drive']);
  });

  it('preserves user-supplied order (not registry order)', () => {
    expect(parseEnabledDomains('slides,docs')).toEqual(['slides', 'docs']);
  });

  it('dedupes repeated entries', () => {
    expect(parseEnabledDomains('docs,drive,docs,drive')).toEqual(['docs', 'drive']);
  });

  it('throws on unknown domain names with the valid list in the message', () => {
    expect(() => parseEnabledDomains('docs,docks')).toThrow(/docks/);
    expect(() => parseEnabledDomains('docs,docks')).toThrow(/Valid: docs/);
  });

  it('lists every unknown name (not just the first)', () => {
    expect(() => parseEnabledDomains('docs,foo,bar')).toThrow(/foo, bar/);
  });
});

describe('getEnabledScopes', () => {
  it('returns scopes for one domain', () => {
    expect(getEnabledScopes(['drive'])).toEqual(['https://www.googleapis.com/auth/drive']);
  });

  it('bundles script.external_request with docs', () => {
    // Apps Script scope is bundled under docs because the only consumer
    // (insertImage's Apps Script integration) is a Docs feature.
    const scopes = getEnabledScopes(['docs']);
    expect(scopes).toContain('https://www.googleapis.com/auth/documents');
    expect(scopes).toContain('https://www.googleapis.com/auth/script.external_request');
  });

  it('does not include Apps Script scope when docs is omitted', () => {
    const scopes = getEnabledScopes(['drive', 'sheets']);
    expect(scopes).not.toContain('https://www.googleapis.com/auth/script.external_request');
  });

  it('dedupes scopes when multiple domains share one (none currently, but future-proof)', () => {
    // Sanity check: two non-overlapping domains produce N+M distinct scopes.
    const scopes = getEnabledScopes(['drive', 'sheets']);
    expect(new Set(scopes).size).toBe(scopes.length);
  });

  it('returns scopes for every domain when given the full set', () => {
    const scopes = getEnabledScopes(Object.keys(ALL_DOMAINS));
    // 7 distinct scopes: documents, script.external_request, drive,
    // spreadsheets, presentations, gmail.modify, calendar.events.
    expect(scopes).toHaveLength(7);
  });

  it('silently skips unknown domain in the array (parseEnabledDomains is the gatekeeper)', () => {
    // getEnabledScopes is intentionally tolerant — its caller is
    // expected to have validated already via parseEnabledDomains.
    expect(getEnabledScopes(['docs', 'bogus' as any])).toContain(
      'https://www.googleapis.com/auth/documents'
    );
  });
});

describe('ALL_DOMAINS registry', () => {
  it('has a register function for every domain', () => {
    for (const [name, config] of Object.entries(ALL_DOMAINS)) {
      expect(typeof config.register, `${name}.register`).toBe('function');
    }
  });

  it('has at least one scope per domain', () => {
    for (const [name, config] of Object.entries(ALL_DOMAINS)) {
      expect(config.scopes.length, `${name} scopes`).toBeGreaterThan(0);
    }
  });

  it('has scopes that are all https://www.googleapis.com/auth/* URLs', () => {
    for (const [name, config] of Object.entries(ALL_DOMAINS)) {
      for (const scope of config.scopes) {
        expect(scope, `${name} scope ${scope}`).toMatch(/^https:\/\/www\.googleapis\.com\/auth\//);
      }
    }
  });
});
