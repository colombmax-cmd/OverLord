import type { IntentEnvelope, AgentProposal } from '../models/core.ts';
import type { PlosMemoryView } from '../ports/plos.ts';

export type CognitionBackendKind = 'local' | 'remote';
export type CognitionConnectivityStatus = 'offline' | 'online' | 'degraded';
export type SupportedModelStatus = 'official';
export type CognitionPreference = 'auto' | 'local' | 'remote';

export interface SupportedModelProfile {
  modelId: string;
  displayName: string;
  provider: string;
  family: string;
  license: string;
  format: 'transformers' | 'service';
  quantization?: string;
  recommendedRuntime: string;
  minDeviceClass: 'cpu' | 'network';
  supportsStructuredOutput: boolean;
  downloadUrl?: string;
  status: SupportedModelStatus;
  recommendedDefault: boolean;
}

export interface CognitiveExchange {
  role: 'overlord' | 'cognition_backend';
  summary: string;
  timestamp: string;
}

export interface CognitionContext {
  intent: IntentEnvelope;
  memoryView: PlosMemoryView;
  connectivityStatus: CognitionConnectivityStatus;
}

export interface CognitionRouteDecision {
  requestedPreference: CognitionPreference;
  selectedBackend: CognitionBackendKind;
  reason: string;
  attemptedBackends: CognitionBackendKind[];
  fallbackApplied: boolean;
}

export interface CognitionDecision {
  proposal: AgentProposal;
  backendKind: CognitionBackendKind;
  connectivityStatus: CognitionConnectivityStatus;
  selectedModel: SupportedModelProfile;
  transcript: CognitiveExchange[];
  route: CognitionRouteDecision;
}

export interface ConnectivityProbe {
  getStatus(): CognitionConnectivityStatus;
}

export interface CognitionBackend {
  readonly kind: CognitionBackendKind;
  readonly defaultModel: SupportedModelProfile;

  getSupportedModels(): SupportedModelProfile[];
  decide(context: CognitionContext): Promise<CognitionDecision>;
}
