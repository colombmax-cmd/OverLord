import type { CognitionDecision, CognitiveExchange } from '../cognition/interface.ts';
import type { PlosEvent } from '../ports/plos.ts';

function buildCognitionEvent(type: string, entityId: string, payload: Record<string, unknown>): PlosEvent {
  const timestamp = Date.now();
  return {
    id: `${type}:${entityId}:${timestamp}`,
    type,
    entityId,
    payload,
    timestamp,
    origin: 'overlord',
    seq: 0,
    seen: {},
  };
}

export function createCognitionDecisionEvent(intentId: string, decision: CognitionDecision): PlosEvent {
  return buildCognitionEvent('overlord.cognition/decision', intentId, {
    backendKind: decision.backendKind,
    connectivityStatus: decision.connectivityStatus,
    proposalType: decision.proposal.type,
    selectedModel: {
      modelId: decision.selectedModel.modelId,
      displayName: decision.selectedModel.displayName,
      provider: decision.selectedModel.provider,
      quantization: decision.selectedModel.quantization,
      supportsStructuredOutput: decision.selectedModel.supportsStructuredOutput,
      status: decision.selectedModel.status,
    },
    route: decision.route,
    transcriptLength: decision.transcript.length,
  });
}

export function createCognitionExchangeEvents(intentId: string, transcript: CognitiveExchange[]): PlosEvent[] {
  return transcript.map((exchange, index) => buildCognitionEvent('overlord.cognition/exchange', intentId, {
    index,
    role: exchange.role,
    summary: exchange.summary,
    timestamp: exchange.timestamp,
  }));
}
