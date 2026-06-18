# Reference

Cheat sheet for the SDK runtime API and the backend HTTP API. The SKILL.md tells you **when** to use each; this file tells you **what** the signatures and shapes are. For the full narrative, read `packages/analytics-sdk/README.md` and `analytics_api.md` at the repo root.

## SDK runtime API

This package intentionally exposes named functions, not an SDK client class. There is no `EnterAnalytics` class, no default export, and no constructor-based API.

All exports come from `@enter-pro/analytics-sdk` (source: `packages/analytics-sdk/src/index.ts`).

`bootstrapEnterAnalytics()` is the only initialization entrypoint. It reads `.env` / `import.meta.env` through `readEnv()` in `packages/analytics-sdk/src/bootstrap.ts`, so normal app code does not manually pass `projectId`, `token`, or `endpoint`.

### Dependency preflight

Before importing any SDK function, confirm the target app's `package.json` already contains `@enter-pro/analytics-sdk` in `dependencies` or `devDependencies`. If it is missing, install it with the target app's existing package manager (`pnpm add`, `npm install`, `yarn add`, or `bun add`) and re-check `package.json`.

| Export | Signature | When to use |
|---|---|---|
| `bootstrapEnterAnalytics` | `(options?: BootstrapOptions) => void` | App entry, exactly once. Idempotent. |
| `trackEvent` | `(name: string, options?: TrackEventOptions) => void` | Imperative event from app code. No-op before bootstrap. |
| `registerEventDefinition` | `(def: EventDefinition) => void` | Single declarative DOM event. |
| `registerEventDefinitions` | `(defs: EventDefinition[]) => void` | Batch register on startup. |
| `replaceEventDefinitions` | `(defs: EventDefinition[]) => void` | Atomic replace, e.g. after fetching a remote registry. |
| `unregisterEventDefinition` | `(eventName: string) => void` | Remove a single definition. |
| `clearEventDefinitions` | `() => void` | Wipe the local registry. |
| `emitDefinedEvent` | `(eventName: string, target?: Element \| null) => void` | Fire a `manual` definition or programmatically replay one. |
| `loadEventDefinitionsFromUrl` | `(url: string, fetcher?: typeof fetch) => Promise<EventDefinition[]>` | Fetch + replace definitions at runtime. |
| `flush` | `() => Promise<void>` | Force-flush the outbox (tests, pre-navigation). |
| `destroy` | `() => void` | Tear down (tests, hot-reload). |
| `getAnalyticsHealth` | `() => AnalyticsHealth` | Debug only. Never gate UX on this. |

### `TrackEventOptions`

```ts
interface TrackEventOptions {
  // Only 'custom' or 'conversion'. Default: 'custom'.
  eventType?: 'custom' | 'conversion';
  context?: Record<string, unknown>;
  properties?: Record<string, unknown>;
}
```

> Client code cannot emit `traffic` events. `traffic` is reserved for SDK auto-emitted events (`page_view`, `session_start`, `session_end`, `enter_verify`, `error`, `performance`).

### `EventDefinition`

```ts
interface EventDefinition {
  event_name: string;
  event_type: 'custom' | 'conversion';
  trigger:
    | { kind: 'click';  selector: string }
    | { kind: 'submit'; selector: string }
    | { kind: 'manual'; selector?: string };
  property_bindings?: Record<string, PropertyBinding>;
  properties?: Record<string, unknown>;
  context?: Record<string, unknown>;
  definition_version: string;        // bump when you change the shape
  enabled?: boolean;                  // default true
}
```

### `PropertyBinding`

| `type` | Required fields | Reads from |
|---|---|---|
| `constant` | `value` | static value |
| `textContent` | `selector?` | element's `textContent` (trimmed, max 256 chars) |
| `attribute` | `attribute`, `selector?` | HTML attribute on the resolved element |
| `dataset` | `key`, `selector?` | `dataset[key]` on the resolved element |
| `closestAttribute` | `selector`, `attribute` | nearest matching ancestor's attribute |
| `formField` | `field`, `valueType?` | one form field by `name` (`'value'` or `'checked'`) |
| `formFields` | `fields?`, `includeAll?`, `valueType?` | multiple form fields. Always pass `fields: [...]` for user-authored forms. |

When `selector` is omitted, the trigger element itself is used.

### `BootstrapOptions`

```ts
interface BootstrapOptions {
  inactivityTimeoutMs?: number;        // default: 30 * 60 * 1000
  disableVerifyPing?: boolean;         // skip the one-shot enter_verify event
  hashRouting?: boolean;               // include `location.hash` in page_path + page_view routing
  eventDefinitionsUrl?: string;        // GET this URL after bootstrap → replaceEventDefinitions
  eventDefinitionsFetcher?: typeof fetch;
}
```

For apps that use hash routing like `/#templates`, `bootstrapEnterAnalytics({ hashRouting: true })` is required if you want `page_path` and auto `page_view` route detection to keep the hash fragment.

### `AnalyticsHealth`

```ts
interface AnalyticsHealth {
  initialized: boolean;
  enabled: boolean;
  visitorId?: string;
  sessionId?: string;
  outboxSize: number;
  endpoint?: string;
  lastFlushAt?: number;
  lastError?: string;
}
```

### Required env (Vite or `globalThis.__ENTER_ANALYTICS_ENV__`)

| Var | Required | Notes |
|---|---|---|
| `VITE_ENTER_ANALYTICS_TOKEN` | yes | SDK token (different from the registry Bearer token) |
| `VITE_ENTER_PROJECT_ID` | yes | Same project id used in registry calls |
| `VITE_ENTER_ANALYTICS_ENDPOINT` | no | Default `https://api.enter.pro` |
| `VITE_ENTER_ANALYTICS_ENABLED` | no | Set to `"false"` to disable all tracking |
| `VITE_ENTER_ANALYTICS_DEBUG` | no | Set to `"true"` for console logging |

---

## Backend API cheatsheet

Base URL: `/v1`. All endpoints below are relative to `https://api.enter.pro` (or whatever `VITE_ENTER_ANALYTICS_ENDPOINT` resolves to).

Agent-relevant subset only. Full spec lives in `analytics_api.md` at the repo root.

| # | Method | Path | Auth | Use |
|---|---|---|---|---|
| 1 | `POST` | `/projects/<pid>/analytics/enable` | Bearer (ProjectWrite) | Enable analytics on the project. Only call after explicit user confirmation. |
| 2 | `GET` | `/projects/<pid>/analytics/config` | Bearer (ProjectRead) | Read SDK token, allowed origins, timeout. |
| 3 | `GET` | `/projects/<pid>/analytics/events/registry` | Bearer (ProjectRead) | List existing events. Always do this first to dedupe. |
| 4 | `POST` | `/projects/<pid>/analytics/events/registry` | Bearer (ProjectWrite) | Register a new custom or conversion event. |
| 5 | `DELETE` | `/projects/<pid>/analytics/events/registry/<event_name>` | Bearer (ProjectWrite) | Remove a registered event. Only after user confirmation. |
| 6 | `GET` | `/projects/<pid>/analytics/verify` | Bearer (ProjectRead) | Confirm SDK reached backend (`enter_verify` event received). |

### Register event request body

```json
{
  "event_name": "string (snake_case, required, not a default name)",
  "event_type": "traffic | conversion | custom (required)",
  "description": "string (optional, helps the dashboard)"
}
```

> `event_type: traffic` is accepted by the backend but only useful for default events. From client code (and from this skill) always use `custom` or `conversion`.

### List response shape

```json
{
  "code": 0,
  "data": {
    "events": [
      {
        "event_name": "page_view",
        "event_type": "traffic",
        "description": "",
        "is_default": true,
        "created_at": null
      },
      {
        "event_name": "signup_completed",
        "event_type": "conversion",
        "description": "User finished signup",
        "is_default": false,
        "created_at": "2026-04-01T00:00:00Z"
      }
    ]
  }
}
```

### Response codes (standard envelope)

| Code | Meaning | Agent action |
|---|---|---|
| `200` | Success | Continue |
| `400` | Bad payload, invalid `event_type`, attempt to register a default name | Re-validate Step 1 outputs and retry once |
| `401` | Token missing or expired | Stop. Surface to platform; do not retry blindly. |
| `403` | Analytics not enabled, or origin not allowed | Stop. Tell the user. Do not auto-enable without explicit consent. |
| `404` | Project or event not found | Stop. Verify `<ENTER_PROJECT_ID>`. |
| `409` | Event already registered | Treat as success (idempotent path). |
| `429` | Rate limited | Back off and retry once after 2s. |
| `500` | Server error | Surface verbatim. Do not loop. |

### Verify response shape

```json
{
  "code": 0,
  "data": {
    "verified": true,
    "received_at": "2026-04-14T09:55:00Z"
  }
}
```

`verified: false` means the backend has not yet seen an `enter_verify` event for this project — usually because `bootstrapEnterAnalytics()` has not run, the SDK token is wrong, or the origin is not allow-listed.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `rejected.reason: "event not registered"` in network panel | Skipped Step 2 | `POST` the event to `events/registry`, then redeploy / reload. |
| `403` from `/v1/track` | Origin not in `allowed_origins`, or analytics disabled | `PUT /analytics/config/origins` (with user consent), or call `analytics/enable`. |
| `getAnalyticsHealth().initialized === false` | `bootstrapEnterAnalytics()` not called, or env vars missing | Verify env vars; ensure bootstrap is at app entry, not inside a component. |
| `verify` returns `{ verified: false }` long after deploy | SDK token mismatch, or the page never loaded with the SDK | Check `VITE_ENTER_ANALYTICS_TOKEN` matches `analytics/config.token`. |
| Sensitive data leaking into dashboard | Property keys contain banned substrings, or you're storing form values | Rename keys; use `formFields` with explicit allowlist. |
