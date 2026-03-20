import type { CognitionConnectivityStatus, ConnectivityProbe } from './interface.ts';

const VALID_CONNECTIVITY_STATES = new Set<CognitionConnectivityStatus>(['offline', 'online', 'degraded']);

function normalizeConnectivityStatus(value: string | undefined): CognitionConnectivityStatus | null {
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  return VALID_CONNECTIVITY_STATES.has(normalized as CognitionConnectivityStatus)
    ? normalized as CognitionConnectivityStatus
    : null;
}

export class EnvironmentConnectivityProbe implements ConnectivityProbe {
  getStatus(): CognitionConnectivityStatus {
    const explicitStatus = normalizeConnectivityStatus(process.env.OVERLORD_CONNECTIVITY);
    if (explicitStatus) {
      return explicitStatus;
    }

    if (process.env.OVERLORD_FORCE_OFFLINE === '1') {
      return 'offline';
    }

    return 'offline';
  }
}
