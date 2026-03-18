import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire, stripTypeScriptTypes } from 'node:module';

import { PlosAccessDeniedError } from '../../src/plos/errors.js';

export const DEFAULT_SMOOS_MODULE = 'smo-os';

const REQUIRED_METHODS = ['checkCapability', 'readEvents', 'writeEvent', 'publishProjection', 'emitAudit'];
const FACTORY_EXPORT_CANDIDATES = [
  'createPlosAdapter',
  'createSmoosAdapter',
  'createProtocolAdapter',
  'createAdapter',
];
const VALUE_EXPORT_CANDIDATES = ['default', 'plosAdapter', 'smoosAdapter', 'adapter'];
const SMOOS_SOURCE_FILES = [
  'src/core/types.ts',
  'src/core/log.ts',
  'src/agents/memory_access_manager.ts',
];
const DEFAULT_GRANTED_CAPABILITIES = ['intent:read', 'workflow:submit', 'audit:write'];

function isPlosAdapter(candidate) {
  if (!candidate || typeof candidate !== 'object') {
    return false;
  }

  return REQUIRED_METHODS.every((methodName) => typeof candidate[methodName] === 'function');
}

function assertPlosAdapter(candidate, moduleName) {
  if (!candidate || typeof candidate !== 'object') {
    throw new Error(`Smo.OS module "${moduleName}" did not return an adapter object.`);
  }

  for (const methodName of REQUIRED_METHODS) {
    const value = candidate[methodName];
    if (typeof value !== 'function') {
      throw new Error(`Smo.OS adapter from "${moduleName}" is missing method "${methodName}".`);
    }
  }
}

async function resolveExportedAdapter(exportedValue, moduleName, factoryArgs) {
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

function getSmoosPackageRoot(moduleName) {
  const require = createRequire(import.meta.url);
  return path.dirname(require.resolve(`${moduleName}/package.json`));
}

function toCompiledRelativePath(relativePath) {
  return relativePath.replace(/\.ts$/, '.mjs');
}

function rewriteRelativeSpecifiers(source) {
  return source.replace(/(from\s+['"])(\.{1,2}\/[^'"]+)(['"])/g, (_match, prefix, specifier, suffix) => {
    if (path.extname(specifier)) {
      return `${prefix}${specifier.replace(/\.ts$/, '.mjs')}${suffix}`;
    }

    return `${prefix}${specifier}.mjs${suffix}`;
  });
}

function normalizeSmoosSource(sourceCode, relativePath) {
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

function compileSmoosSourceFile(packageRoot, cacheRoot, relativePath) {
  const sourcePath = path.join(packageRoot, relativePath);
  const targetPath = path.join(cacheRoot, toCompiledRelativePath(relativePath));
  const targetDir = path.dirname(targetPath);
  const sourceCode = normalizeSmoosSource(fs.readFileSync(sourcePath, 'utf8'), relativePath);
  const compiledCode = rewriteRelativeSpecifiers(stripTypeScriptTypes(sourceCode));

  fs.mkdirSync(targetDir, { recursive: true });
  fs.writeFileSync(targetPath, compiledCode, 'utf8');
}

function ensureCompiledSmoosSource(packageRoot) {
  const cacheRoot = path.join(process.cwd(), '.overlord-cache', 'smo-os');

  for (const relativePath of SMOOS_SOURCE_FILES) {
    compileSmoosSourceFile(packageRoot, cacheRoot, relativePath);
  }

  return cacheRoot;
}

async function loadSmoosSourceModules(moduleName) {
  const packageRoot = getSmoosPackageRoot(moduleName);
  const cacheRoot = ensureCompiledSmoosSource(packageRoot);
  const logModule = await import(pathToFileURL(path.join(cacheRoot, 'src/core/log.mjs')).href);
  const memoryAccessModule = await import(pathToFileURL(path.join(cacheRoot, 'src/agents/memory_access_manager.mjs')).href);

  return {
    logModule,
    BoundedMemoryAccessLayer: memoryAccessModule.BoundedMemoryAccessLayer,
  };
}

function createCapabilityDecision(MemoryAccessLayerCtor, grantedCapabilities, request) {
  const scope = `capability:${request.capability}`;
  const layer = new MemoryAccessLayerCtor({
    [scope]: { capability: request.capability },
  });
  const nowMs = Date.now();
  const view = layer.getAuthorizedView(
    {
      userId: request.actorId,
      agentId: request.actorId,
      sessionId: 'overlord-runtime',
      capability: request.capability,
      scope: [scope],
      reason: 'Overlord capability probe',
    },
    {
      grantId: `grant:${request.actorId}:${request.capability}`,
      agentId: request.actorId,
      sessionId: 'overlord-runtime',
      capabilities: [...grantedCapabilities],
      allowedScopes: grantedCapabilities.has(request.capability) ? [scope] : [],
      issuedAtMs: nowMs - 1_000,
      expiresAtMs: nowMs + 60_000,
      userConsentRef: 'overlord-bootstrap',
    },
  );

  return {
    allowed: view.decision === 'allow',
    reason: view.decision === 'allow'
      ? 'capability granted by Smo.OS MAL bridge'
      : (view.deniedReason ?? 'capability denied by Smo.OS MAL bridge'),
  };
}

function toSmoosLogEvent(event, type, entityId) {
  return {
    id: `overlord:${type}:${Date.now()}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    entityId,
    payload: event,
    timestamp: Date.now(),
    origin: 'overlord',
    seq: 0,
    seen: {},
  };
}

async function createInstalledSmoosAdapter(options) {
  const { moduleName = DEFAULT_SMOOS_MODULE, grantedCapabilities = [...DEFAULT_GRANTED_CAPABILITIES] } = options;
  const { logModule, BoundedMemoryAccessLayer } = await loadSmoosSourceModules(moduleName);
  const grantedCapabilitySet = new Set(grantedCapabilities);
  const audits = [];

  return {
    async checkCapability(request) {
      return createCapabilityDecision(BoundedMemoryAccessLayer, grantedCapabilitySet, request);
    },

    async readEvents(query, capability) {
      const decision = createCapabilityDecision(BoundedMemoryAccessLayer, grantedCapabilitySet, {
        actorId: 'overlord-runtime',
        capability,
      });

      if (!decision.allowed) {
        throw new PlosAccessDeniedError(capability, decision.reason);
      }

      const events = logModule.readAllEvents();
      return events.slice(0, query.limit ?? events.length);
    },

    async writeEvent(event, capability) {
      const decision = createCapabilityDecision(BoundedMemoryAccessLayer, grantedCapabilitySet, {
        actorId: 'overlord-runtime',
        capability,
      });

      if (!decision.allowed) {
        throw new PlosAccessDeniedError(capability, decision.reason);
      }

      logModule.appendEvent(toSmoosLogEvent(event, 'overlord.memory/event_written', 'overlord-event'));
      return { ok: true };
    },

    async publishProjection(payload, policy, capability) {
      const decision = createCapabilityDecision(BoundedMemoryAccessLayer, grantedCapabilitySet, {
        actorId: 'overlord-runtime',
        capability,
      });

      if (!decision.allowed) {
        throw new PlosAccessDeniedError(capability, decision.reason);
      }

      logModule.appendEvent(toSmoosLogEvent({ payload, policy }, 'overlord.memory/projection_published', policy));
      return { projectionRef: `projection:${policy}:${Date.now()}` };
    },

    async emitAudit(auditEvent) {
      audits.push(auditEvent);
      logModule.appendEvent(toSmoosLogEvent(auditEvent, 'overlord.audit/event_emitted', auditEvent.actorId));
      return { ok: true };
    },
  };
}

/**
 * Loads a Smo.OS adapter from an installed dependency.
 *
 * Default module target is `smo-os` (installed from the Smo.OS git repository).
 * If `exportName` is omitted, common factory and object exports are auto-detected.
 * For the published Smo.OS git package, Overlord bridges directly to the installed source tree.
 */
export async function createSmoosDependencyAdapter(options = {}) {
  const { moduleName = DEFAULT_SMOOS_MODULE, exportName, factoryArgs = [] } = options;

  if (moduleName === DEFAULT_SMOOS_MODULE && !exportName) {
    return createInstalledSmoosAdapter(options);
  }

  const resolvedModule = await import(moduleName);

  if (exportName) {
    const adapter = await resolveExportedAdapter(resolvedModule[exportName], moduleName, factoryArgs);
    if (adapter) {
      return adapter;
    }

    throw new Error(`Smo.OS module "${moduleName}" export "${exportName}" is not a valid PlosAdapter.`);
  }

  if (isPlosAdapter(resolvedModule)) {
    return resolvedModule;
  }

  for (const candidateName of FACTORY_EXPORT_CANDIDATES) {
    const adapter = await resolveExportedAdapter(resolvedModule[candidateName], moduleName, factoryArgs);
    if (adapter) {
      return adapter;
    }
  }

  for (const candidateName of VALUE_EXPORT_CANDIDATES) {
    const adapter = await resolveExportedAdapter(resolvedModule[candidateName], moduleName, factoryArgs);
    if (adapter) {
      return adapter;
    }
  }

  throw new Error(
    `Unable to resolve a PlosAdapter from Smo.OS module "${moduleName}". `
      + 'Expected a factory export such as createPlosAdapter() or an adapter object export.',
  );
}
