import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, stripTypeScriptTypes } from 'node:module';

import type {
  PlosAccessGrant,
  PlosAdapter,
  PlosCapabilityProbeDecision,
  PlosCapabilityProbeRequest,
  PlosEvent,
  PlosMemoryView,
  PlosMemoryViewRequest,
  PlosStructureView,
  PlosStructureViewRequest,
  RuntimeAuditRecord,
} from './interface.ts';
import { createAuditLogEvent } from '../../src/runtime/plos-events.ts';

export const DEFAULT_SMOOS_MODULE = 'smo-os';

export interface SmoosDependencyAdapterOptions {
  moduleName?: string;
  exportName?: string;
  factoryArgs?: unknown[];
  grantedCapabilities?: string[];
}

const REQUIRED_METHODS = [
  'evaluateCapability',
  'getAuthorizedMemoryView',
  'getStructureView',
  'appendEvent',
  'readAllEvents',
  'appendAuditRecord',
] as const;
const FACTORY_EXPORT_CANDIDATES = [
  'createPlosAdapter',
  'createSmoosAdapter',
  'createProtocolAdapter',
  'createAdapter',
] as const;
const VALUE_EXPORT_CANDIDATES = ['default', 'plosAdapter', 'smoosAdapter', 'adapter'] as const;
const SMOOS_SOURCE_FILES = [
  'src/core/types.ts',
  'src/core/log.ts',
  'src/agents/memory_access_manager.ts',
] as const;
const DEFAULT_GRANTED_CAPABILITIES = ['intent:read', 'workflow:submit', 'audit:write'] as const;

type SmoosLogModule = {
  appendEvent(event: PlosEvent): void;
  readAllEvents(): PlosEvent[];
};

type BoundedMemoryAccessLayerClass = new (
  memoryByScope: Record<string, Record<string, unknown>>,
  structureByScope?: Record<string, unknown>,
  nowMs?: () => number,
) => {
  getAuthorizedView(
    request: PlosMemoryViewRequest,
    grant?: PlosAccessGrant,
  ): PlosMemoryView;
  getStructureView(request: PlosStructureViewRequest): PlosStructureView;
};

function isPlosAdapter(candidate: unknown): candidate is PlosAdapter {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  return REQUIRED_METHODS.every((methodName) => typeof (candidate as Record<string, unknown>)[methodName] === 'function');
}

function assertPlosAdapter(candidate: unknown, moduleName: string): asserts candidate is PlosAdapter {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`Smo.OS module "${moduleName}" did not return an adapter object.`);
  }

  for (const methodName of REQUIRED_METHODS) {
    const value = (candidate as Record<string, unknown>)[methodName];
    if (typeof value !== 'function') {
      throw new Error(`Smo.OS adapter from "${moduleName}" is missing method "${methodName}".`);
    }
  }
}

async function resolveExportedAdapter(exportedValue: unknown, moduleName: string, factoryArgs: unknown[]): Promise<PlosAdapter | null> {
  if (typeof exportedValue === 'function') {
    const adapter = await exportedValue(...factoryArgs);
    assertPlosAdapter(adapter, moduleName);
    return adapter;
  }

  if (isPlosAdapter(exportedValue)) {
    return exportedValue;
  }

  return null;
}

function getSmoosPackageRoot(moduleName: string): string {
  const require = createRequire(import.meta.url);
  return path.dirname(require.resolve(`${moduleName}/package.json`));
}

function toCompiledRelativePath(relativePath: string): string {
  return relativePath.replace(/\.ts$/, '.mjs');
}

function rewriteRelativeSpecifiers(source: string): string {
  return source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, prefix, specifier, suffix) => {
    if (path.extname(specifier)) {
      return `${prefix}${specifier.replace(/\.ts$/, '.mjs')}${suffix}`;
    }

    return `${prefix}${specifier}.mjs${suffix}`;
  });
}

function normalizeSmoosSource(sourceCode: string, relativePath: string): string {
  if (relativePath === 'src/core/log.ts') {
    return sourceCode.replace('import { Event } from "./types";\n', '');
  }

  if (relativePath !== 'src/agents/memory_access_manager.ts') {
    return sourceCode;
  }

  return sourceCode.replace(
    /constructor\(\s*private readonly memoryByScope: Record<string, Record<string, unknown>>,\s*private readonly structureByScope: Record<string, Omit<ScopeStructure, "scope">> = \{},\s*private readonly nowMs: \(\) => number = \(\) => Date\.now\(\),\s*private readonly auditSink\?: MemoryAuditSink,\s*private readonly renewalPolicy: GrantRenewalPolicy = \{[\s\S]*?\},\s*\) \{\}/,
    `constructor(
    memoryByScope: Record<string, Record<string, unknown>>,
    structureByScope: Record<string, Omit<ScopeStructure, "scope">> = {},
    nowMs: () => number = () => Date.now(),
    auditSink?: MemoryAuditSink,
    renewalPolicy: GrantRenewalPolicy = {
      enabled: false,
      maxAutoRenewals: 0,
      renewalDurationMs: 0,
      requiresUserRevalidationAfterMs: 0,
    },
  ) {
    this.memoryByScope = memoryByScope;
    this.structureByScope = structureByScope;
    this.nowMs = nowMs;
    this.auditSink = auditSink;
    this.renewalPolicy = renewalPolicy;
  }`,
  );
}

function compileSmoosSourceFile(packageRoot: string, cacheRoot: string, relativePath: string): void {
  const sourcePath = path.join(packageRoot, relativePath);
  const targetPath = path.join(cacheRoot, toCompiledRelativePath(relativePath));
  const targetDir = path.dirname(targetPath);
  const sourceCode = normalizeSmoosSource(fs.readFileSync(sourcePath, 'utf8'), relativePath);
  const compiledCode = rewriteRelativeSpecifiers(stripTypeScriptTypes(sourceCode));

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, compiledCode, 'utf8');
}

function ensureCompiledSmoosSource(packageRoot: string): string {
  const cacheRoot = path.join(process.cwd(), '.overlord-cache', 'smo-os');

  for (const relativePath of SMOOS_SOURCE_FILES) {
    compileSmoosSourceFile(packageRoot, cacheRoot, relativePath);
  }

  return cacheRoot;
}

async function loadSmoosSourceModules(moduleName: string): Promise<{
  logModule: SmoosLogModule;
  BoundedMemoryAccessLayer: BoundedMemoryAccessLayerClass;
}> {
  const packageRoot = getSmoosPackageRoot(moduleName);
  const cacheRoot = ensureCompiledSmoosSource(packageRoot);
  const logModule = await import(pathToFileURL(path.join(cacheRoot, 'src/core/log.mjs')).href) as SmoosLogModule;
  const memoryAccessModule = await import(pathToFileURL(path.join(cacheRoot, 'src/agents/memory_access_manager.mjs')).href) as {
    BoundedMemoryAccessLayer: BoundedMemoryAccessLayerClass;
  };

  return {
    logModule,
    BoundedMemoryAccessLayer: memoryAccessModule.BoundedMemoryAccessLayer,
  };
}

function buildDefaultGrant(
  request: PlosMemoryViewRequest,
  grantedCapabilities: Set<string>,
): PlosAccessGrant {
  const now = Date.now();
  const allowed = grantedCapabilities.has(request.capability);

  return {
    grantId: `grant:${request.agentId}:${request.capability}`,
    agentId: request.agentId,
    sessionId: request.sessionId,
    capabilities: allowed ? [request.capability] : [],
    allowedScopes: allowed ? [...request.scope] : [],
    issuedAtMs: now - 1_000,
    expiresAtMs: now + 60_000,
    userConsentRef: 'overlord-smoos-dependency-adapter',
  };
}

function createCapabilityDecision(
  MemoryAccessLayerCtor: BoundedMemoryAccessLayerClass,
  grantedCapabilities: Set<string>,
  request: PlosCapabilityProbeRequest,
): PlosCapabilityProbeDecision {
  const scope = request.resource ?? `capability:${request.capability}`;
  const viewRequest: PlosMemoryViewRequest = {
    userId: request.actorId,
    agentId: request.actorId,
    sessionId: 'overlord-runtime',
    capability: request.capability,
    scope: [scope],
    reason: request.action ?? 'Overlord capability probe',
  };
  const layer = new MemoryAccessLayerCtor({
    [scope]: { capability: request.capability },
  });
  const view = layer.getAuthorizedView(viewRequest, buildDefaultGrant(viewRequest, grantedCapabilities));

  return {
    allowed: view.decision === 'allow',
    reason: view.decision === 'allow'
      ? 'capability granted by Smo.OS MAL bridge'
      : (view.deniedReason ?? 'capability denied by Smo.OS MAL bridge'),
    capabilityInstanceId: null,
  };
}

function buildMemoryByScope(logModule: SmoosLogModule, scopes: string[]): Record<string, Record<string, unknown>> {
  const events = logModule.readAllEvents();
  return Object.fromEntries(scopes.map((scope) => [scope, { events }]));
}

async function createInstalledSmoosAdapter(options: SmoosDependencyAdapterOptions): Promise<PlosAdapter> {
  const { moduleName = DEFAULT_SMOOS_MODULE, grantedCapabilities = [...DEFAULT_GRANTED_CAPABILITIES] } = options;
  const { logModule, BoundedMemoryAccessLayer } = await loadSmoosSourceModules(moduleName);
  const grantedCapabilitySet = new Set(grantedCapabilities);
  const audits: RuntimeAuditRecord[] = [];

  return {
    async evaluateCapability(request) {
      return createCapabilityDecision(BoundedMemoryAccessLayer, grantedCapabilitySet, request);
    },

    async getAuthorizedMemoryView(request, grant) {
      const scopes = request.scope.length > 0 ? request.scope : [`capability:${request.capability}`];
      const layer = new BoundedMemoryAccessLayer(buildMemoryByScope(logModule, scopes));
      return layer.getAuthorizedView(request, grant ?? buildDefaultGrant(request, grantedCapabilitySet));
    },

    async getStructureView(request) {
      const scopes = request.scope ?? ['intent:default'];
      const layer = new BoundedMemoryAccessLayer(buildMemoryByScope(logModule, scopes));
      return layer.getStructureView(request);
    },

    async appendEvent(event) {
      logModule.appendEvent(event);
      return { ok: true };
    },

    async readAllEvents() {
      return logModule.readAllEvents();
    },

    async appendAuditRecord(auditRecord) {
      audits.push(auditRecord);
      logModule.appendEvent(createAuditLogEvent(auditRecord));
      return { ok: true };
    },
  };
}

export async function createSmoosDependencyAdapter(
  options: SmoosDependencyAdapterOptions = {},
): Promise<PlosAdapter> {
  const { moduleName = DEFAULT_SMOOS_MODULE, exportName, factoryArgs = [] } = options;

  if (moduleName === DEFAULT_SMOOS_MODULE && !exportName) {
    return createInstalledSmoosAdapter(options);
  }

  const resolvedModule = await import(moduleName);

  if (exportName) {
    const adapter = await resolveExportedAdapter(resolvedModule[exportName as keyof typeof resolvedModule], moduleName, factoryArgs);
    if (adapter) {
      return adapter;
    }

    throw new Error(`Smo.OS module "${moduleName}" export "${exportName}" is not a valid PlosAdapter.`);
  }

  if (isPlosAdapter(resolvedModule)) {
    return resolvedModule;
  }

  for (const candidateName of FACTORY_EXPORT_CANDIDATES) {
    const adapter = await resolveExportedAdapter(resolvedModule[candidateName as keyof typeof resolvedModule], moduleName, factoryArgs);
    if (adapter) {
      return adapter;
    }
  }

  for (const candidateName of VALUE_EXPORT_CANDIDATES) {
    const adapter = await resolveExportedAdapter(resolvedModule[candidateName as keyof typeof resolvedModule], moduleName, factoryArgs);
    if (adapter) {
      return adapter;
    }
  }

  throw new Error(
    `Unable to resolve a PlosAdapter from Smo.OS module "${moduleName}". `
      + 'Expected a factory export such as createPlosAdapter() or an adapter object export.',
  );
}
