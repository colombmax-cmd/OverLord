# Remote-LLM Configuration

This document describes the operational configuration surface for Overlord remote cognition.

## Configuration precedence

When Overlord needs a remote-LLM provider profile, precedence is:

1. **Intent payload override** (`payload.remoteLlm`, `remoteLlmProvider`, `remoteLlmModel`) for provider/model selection.
2. **Persisted user config** (`~/.config/overlord/config.json`, or `OVERLORD_CONFIG_DIR` / explicit file overrides).
3. **Environment profile** (provider/model/base URL and secret refs from env).
4. **Provider catalog defaults** (default model/store/base URL for selected provider).

Notes:
- Payload override affects provider/model selection, then provider defaults are reapplied if provider changes.
- If no persisted config is present, environment discovery remains the fallback.

## Persisted config files

Default paths:
- `~/.config/overlord/config.json`
- `~/.config/overlord/secrets.json`

Path overrides:
- `OVERLORD_CONFIG_DIR`
- `OVERLORD_CONFIG_FILE`
- `OVERLORD_SECRETS_FILE`

`secrets.json` is written with restrictive permissions (`0600`) and rewrites re-apply that mode.

## CLI usage

Set a persisted remote profile:

```bash
node src/index.ts config remote-llm set \
  --provider xai \
  --model grok-4.20-beta-latest-non-reasoning \
  --api-key "$XAI_API_KEY" \
  --store false
```

Show persisted non-secret profile:

```bash
node src/index.ts config remote-llm show
```

Input validation behavior:
- `--provider`, `--model`, `--api-key` are required for `set`.
- `--store` must be `true|false|1|0` when provided.
- `--base-url` must be a valid absolute `http`/`https` URL.
- malformed persisted config fields are reported with explicit validation errors.

## Secret resolution

Remote backend secret refs can resolve from:
- `config:<name>` (persisted local secrets file)
- `product:<name>` and `env:<NAME>` through environment/file-backed resolvers

Default backend secret resolver prefers `config:` refs and falls back to environment/product behavior for non-config refs.

## Live smoke tests

Live remote smoke tests are opt-in via:

```bash
RUN_LIVE_LLM_TESTS=1 npm test
```

Additional guards:
- tests skip when required provider credentials are missing,
- tests may skip in proxy-only environments when proxy dispatcher support is unavailable.

## Security notes

The persisted local secret store is intended for local/operator workflows. For stronger production posture, use external/system secret-management and inject refs/env at runtime.
