# @enter-pro/analytics-sdk

Standalone analytics SDK for Enter-generated websites. Provides automatic instrumentation and manual tracking out of the box, with no runtime dependencies.

---

## Table of Contents

- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Automatic Instrumentation](#automatic-instrumentation)
- [Manual Tracking](#manual-tracking)
  - [Imperative API — `trackEvent`](#imperative-api--trackevent)
  - [Declarative API — Event Definitions](#declarative-api--event-definitions)
    - [Trigger kinds](#trigger-kinds)
    - [Property bindings](#property-bindings)
- [Public API Reference](#public-api-reference)
- [Infrastructure](#infrastructure)
- [Known Gaps](#known-gaps)
- [Publishing](#publishing)
- [Consuming in Another Repo](#consuming-in-another-repo)
- [Notes](#notes)

---

## Quick Start

```ts
import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';

bootstrapEnterAnalytics();
```

Set the required environment variables and call `bootstrapEnterAnalytics()` once at app entry. Everything else is automatic.

---

## Environment Variables

| Variable | Required | Default | Description |
|---|---|---|---|
| `VITE_ENTER_ANALYTICS_TOKEN` | Yes | — | Auth token for the track endpoint |
| `VITE_ENTER_PROJECT_ID` | Yes | — | Project identifier |
| `VITE_ENTER_ANALYTICS_ENDPOINT` | No | `https://api.enter.pro` | API base URL; SDK appends `/code/api/v1/track` |
| `VITE_ENTER_ANALYTICS_ENABLED` | No | `true` | Set to `"false"` to disable all tracking |
| `VITE_ENTER_ANALYTICS_DEBUG` | No | `false` | Set to `"true"` to enable debug logging |

The SDK reads from `import.meta.env` (Vite) or `globalThis.__ENTER_ANALYTICS_ENV__` (non-Vite environments).

> **Endpoint path mapping:** the SDK posts to `<base>/code/api/v1/track`. Behind the
> Enter API gateway this is rewritten to the public-facing `/v1/track` route documented
> in the analytics API spec. If you are self-hosting the analytics service, configure
> your reverse proxy to strip the `/code` prefix or set `VITE_ENTER_ANALYTICS_ENDPOINT`
> to a base URL that already targets the right host.

---

## Automatic Instrumentation

Everything below is collected automatically after `bootstrapEnterAnalytics()` is called. No additional code is required.

### Page Views

- Fires a `page_view` event on initial load.
- Patches `history.pushState` and `history.replaceState` to detect SPA navigation.
- Listens to `popstate` for back/forward navigation.
- Deduplication window of 50ms prevents double-fires on rapid navigation.

### Session Lifecycle

- A session starts when the first `page_view` fires and emits a `session_start` event with a `session_reason` property (`first_visit` | `expired` | `continued`).
- Sessions expire after 30 minutes of inactivity (configurable via `bootstrapEnterAnalytics({ inactivityTimeoutMs })`).
- A `session_end` event is emitted when the page unloads (`beforeunload`) or when the inactivity timer fires.
- `visibilitychange → hidden` does **not** end the session — it only triggers a synchronous flush and pauses the inactivity timer. If the page stays hidden longer than `inactivityTimeoutMs`, the session is ended on the next `visibilitychange → visible` with `ended_by: 'inactivity'`. This avoids inflating session counts when users briefly switch tabs on mobile.
- Session state is persisted in `sessionStorage` so it survives page refreshes within the same tab.

### SDK Integration Verification

After bootstrap completes, the SDK fires a one-shot `enter_verify` traffic event so the backend `GET /analytics/verify` endpoint can confirm the SDK is wired up correctly. Pass `disableVerifyPing: true` to `bootstrapEnterAnalytics` to skip it.

### JavaScript Error Capture

- Listens to `window.error` and `window.unhandledrejection`.
- Fires an `error` traffic event with `error_message`, `source`, `lineno`, and `colno` properties.
- Filters out third-party marketing noise (Facebook Pixel, Google Tag Manager, Twitter Analytics, DoubleClick) to reduce irrelevant error volume.

### Performance Metrics

Collected once per page load after the `load` event fires.

| Metric | Source |
|---|---|
| LCP (Largest Contentful Paint) | `web-vitals` or native `PerformanceObserver` |
| CLS (Cumulative Layout Shift) | `web-vitals` or native `PerformanceObserver` |
| FID (First Input Delay) | `web-vitals` |
| FCP (First Contentful Paint) | `web-vitals` or native `paint` PerformanceEntry |
| TTFB (Time to First Byte) | `web-vitals` or `PerformanceNavigationTiming` |
| `dom_content_loaded_ms` | `PerformanceNavigationTiming` |
| `load_event_ms` | `PerformanceNavigationTiming` |

To use `web-vitals`, expose it as a global before `bootstrapEnterAnalytics()` is called:

```ts
import * as webVitals from 'web-vitals';
window.webVitals = webVitals;

bootstrapEnterAnalytics();
```

Without `web-vitals`, the SDK falls back to native Performance APIs. LCP and CLS are still observable; FID is not available in the fallback path.

### Visitor Identity

- Generates a stable `visitor_id` on first visit using `crypto.randomUUID()`.
- Persists the ID in both `localStorage` and a cookie for cross-tab and cross-session continuity.
- Records `visitor_first_seen_at` for new visitor detection.

### Automatic Context on Every Event

Every event — whether automatic or manual — is enriched with the following fields at emit time:

| Field | Source |
|---|---|
| `page_url`, `page_path`, `page_title` | `window.location` / `document.title` |
| `referrer` | `document.referrer` |
| `utm_source/medium/campaign/content/term` | URL search params |
| `visitor_id` | Persistent visitor identity |
| `session_id` | Current active session |
| `sdk_version`, `schema_version` | Build-time constants |

> Device context (`device_type`, `browser`, `os`, `language`) is detected and nested inside the event's `context` object on every event. This matches the backend `/v1/track` schema, which only accepts a fixed top-level field list and drops any extra root-level keys.
> `screen_resolution` is also nested inside `context`, and is intentionally only attached to `page_view` and `session_start` events (matching the analytics design spec) to keep payloads small.
> User-provided `TrackEventOptions.context` is merged on top of the auto-collected device fields, so callers can override any field if needed (e.g. pass `context: { browser: 'CustomBrowser' }`).
> Hash-router apps must opt in with `bootstrapEnterAnalytics({ hashRouting: true })` if `page_path` and automatic `page_view` detection should include `location.hash` such as `/#templates`.

---

## Manual Tracking

### Imperative API — `trackEvent`

Call `trackEvent` anywhere in your application code to emit a custom event.

```ts
import { trackEvent } from '@enter-pro/analytics-sdk';

trackEvent('button_clicked', {
  eventType: 'custom',       // 'custom' (default) | 'conversion'
  properties: {
    button_id: 'signup',
    variant: 'primary',
  },
  context: {
    page_section: 'hero',
  },
});
```

`trackEvent` is a no-op if `bootstrapEnterAnalytics()` has not been called or if the SDK is disabled.

**Parameters:**

| Parameter | Type | Description |
|---|---|---|
| `eventName` | `string` | Event name |
| `options.eventType` | `'custom' \| 'conversion'` | Defaults to `'custom'` |
| `options.properties` | `Record<string, unknown>` | Arbitrary event-specific data |
| `options.context` | `Record<string, unknown>` | Contextual metadata (e.g. UI section, experiment ID) |

---

### Declarative API — Event Definitions

Event definitions let you describe tracking rules as data structures and attach them to DOM elements without writing per-component event handler code. The SDK listens on the document in capture phase and automatically fires events when matching elements are interacted with.

#### Register definitions

```ts
import { registerEventDefinition, registerEventDefinitions } from '@enter-pro/analytics-sdk';

// Register a single definition
registerEventDefinition({
  event_name: 'signup_click',
  event_type: 'conversion',
  trigger: { kind: 'click', selector: '#signup-btn' },
  property_bindings: {
    plan: { type: 'attribute', attribute: 'data-plan' },
    label: { type: 'textContent' },
  },
  definition_version: '1',
});

// Register multiple definitions at once
registerEventDefinitions([...]);

// Replace all definitions (e.g. after fetching from a remote config)
replaceEventDefinitions([...]);
```

#### Load definitions from a remote config

To wire up the "user defines events via the Enter Agent → SDK auto-collects them" loop, point the SDK at a remote endpoint that returns the event definitions for the current project. The fetched list will replace whatever is currently registered.

```ts
// Option 1: declaratively at bootstrap time
bootstrapEnterAnalytics({
  eventDefinitionsUrl: 'https://api.enter.pro/v1/projects/proj_abc/event-definitions',
  // Optional: provide a fetcher with auth headers if the endpoint is private.
  eventDefinitionsFetcher: (url, init) =>
    fetch(url, { ...init, headers: { Authorization: 'Bearer <token>' } }),
});

// Option 2: imperatively at any time after bootstrap
import { loadEventDefinitionsFromUrl } from '@enter-pro/analytics-sdk';
await loadEventDefinitionsFromUrl(
  'https://api.enter.pro/v1/projects/proj_abc/event-definitions'
);
```

Accepted response shapes:

```jsonc
// Raw array
[ { "event_name": "...", ... } ]

// Or wrapped in an envelope
{ "data": { "definitions": [ { "event_name": "...", ... } ] } }
{ "definitions": [ { "event_name": "...", ... } ] }
```

#### Trigger kinds

| Kind | Behavior |
|---|---|
| `click` | Fires when any element matching `selector` is clicked |
| `submit` | Fires when a form matching `selector` is submitted |
| `manual` | No automatic DOM listener; must be triggered by calling `emitDefinedEvent(eventName, element)` explicitly |

#### Property bindings

Property bindings define how to extract values from the DOM at the moment the event fires. The resolved values become the event's `properties`.

| Binding type | Description | Options |
|---|---|---|
| `constant` | A static value | `value: string \| number \| boolean` |
| `textContent` | The text content of an element | `selector?` (defaults to the trigger element) |
| `attribute` | An HTML attribute value | `attribute: string`, `selector?` |
| `dataset` | A `data-*` value | `key: string`, `selector?` |
| `closestAttribute` | An attribute from the nearest matching ancestor | `selector: string`, `attribute: string` |
| `formField` | A single form field value by name | `field: string`, `valueType?: 'value' \| 'checked'` |
| `formFields` | Multiple form field values | `fields?: string[]`, `includeAll?: boolean`, `valueType?` |

For bindings with an optional `selector`, the SDK resolves the element relative to the trigger element. If `selector` is omitted, the trigger element itself is used.

**Examples:**

```ts
// Read a data attribute from the clicked element
{ type: 'attribute', attribute: 'data-product-id' }

// Read a data attribute from the nearest ancestor matching a selector
{ type: 'closestAttribute', selector: '[data-experiment]', attribute: 'data-experiment' }

// Collect specific form fields on submit
{ type: 'formFields', fields: ['email', 'plan'] }

// Collect all form fields on submit
{ type: 'formFields', includeAll: true }
```

#### Trigger manually

For `trigger.kind: 'manual'` definitions, or to trigger any definition programmatically:

```ts
import { emitDefinedEvent } from '@enter-pro/analytics-sdk';

// Without a DOM target
emitDefinedEvent('signup_click');

// With a DOM element as the binding resolution context
emitDefinedEvent('signup_click', document.querySelector('#signup-btn'));
```

---

## Public API Reference

| Export | Signature | Description |
|---|---|---|
| `bootstrapEnterAnalytics` | `(options?: BootstrapOptions) => void` | Initialize the SDK. Call once at app entry. Idempotent. |
| `trackEvent` | `(name: string, options?: TrackEventOptions) => void` | Emit a custom or conversion event |
| `registerEventDefinition` | `(def: EventDefinition) => void` | Register a single declarative event definition |
| `registerEventDefinitions` | `(defs: EventDefinition[]) => void` | Register multiple definitions |
| `replaceEventDefinitions` | `(defs: EventDefinition[]) => void` | Replace all definitions atomically |
| `unregisterEventDefinition` | `(eventName: string) => void` | Remove a single definition |
| `clearEventDefinitions` | `() => void` | Remove all definitions |
| `emitDefinedEvent` | `(eventName: string, target?: Element \| null) => void` | Fire a registered definition manually |
| `loadEventDefinitionsFromUrl` | `(url: string, fetcher?: typeof fetch) => Promise<EventDefinition[]>` | Fetch definitions from a remote endpoint and replace the local registry |
| `flush` | `() => Promise<void>` | Force-flush the outbox immediately |
| `destroy` | `() => void` | Stop all collectors and clear runtime state |
| `getAnalyticsHealth` | `() => AnalyticsHealth` | Inspect SDK state for debugging |

### `BootstrapOptions`

```ts
interface BootstrapOptions {
  /** Inactivity timeout before a session expires. Default: 30 minutes. */
  inactivityTimeoutMs?: number;
  /** Skip the one-shot enter_verify ping fired right after bootstrap. */
  disableVerifyPing?: boolean;
  /** Include `location.hash` in `page_path` and automatic `page_view` route detection. */
  hashRouting?: boolean;
  /**
   * If provided, the SDK will GET this URL after bootstrap and call
   * replaceEventDefinitions() with the response. Accepts either a raw array
   * or a `{ data: { definitions: [...] } }` envelope.
   */
  eventDefinitionsUrl?: string;
  /** Optional fetch implementation override (useful for SSR / proxy / auth). */
  eventDefinitionsFetcher?: typeof fetch;
}
```

For hash-router applications, call `bootstrapEnterAnalytics({ hashRouting: true })` at app entry. This workspace does not currently include a tracked generated-site consumer, so external template/bootstrap integrations need to enable the flag explicitly.

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

---

## Infrastructure

### Outbox and Delivery

- Events are queued in an in-memory + `localStorage`-backed outbox before delivery.
- The outbox survives page refreshes: events queued in a previous session are retried on next load.
- Flush runs on a 5-second interval and sends events in batches of 20.
- On page close (`pagehide`, `visibilitychange`), the SDK falls back to an authenticated `fetch(..., { keepalive: true })`.
- Page-exit flushes keep records in the outbox until the server acknowledges them, so a failed unload request can retry on the next page load.

### Retry and Backoff

- Failed requests are retried with exponential backoff and random jitter.
- Default base delay: 2 seconds. Maximum retries: 7.
- Events older than 72 hours are dropped automatically.
- Permanent failures (`INVALID_SCHEMA`, `UNAUTHORIZED`, `FORBIDDEN`, `BAD_REQUEST`, or server-side rejection with a permanent reason) are not retried.

### Data Sanitization

- Before enqueuing, the SDK strips any property key that matches (case-insensitive substring): `password`, `token`, `cookie`, `authorization`, `auth`, `email`, `phone`.
- String property values are truncated to 256 characters.

---

## Known Gaps

The following capabilities are identified in the codebase but not yet complete:

| Gap | Detail |
|---|---|
| **No `identify()` API** | There is no way to associate the anonymous `visitor_id` with an authenticated user ID. Logged-in user tracking requires a custom `properties` workaround via `trackEvent`. |
| **No funnel / event correlation fields** | Events do not carry a shared correlation ID for funnel analysis across a user flow. |
| **`error` and `performance` events must be pre-registered server-side** | The SDK auto-emits `error` and `performance` traffic events, but they are **not** part of the backend's default event whitelist (only `page_view` / `session_start` / `session_end` / `enter_verify` are). Until the backend either adds them to the default list or your project pre-registers them via `POST /v1/projects/:pid/analytics/events/registry`, they will be rejected with `event not registered`. |

---

## Publishing

```bash
# Dry run to verify package contents
npm pack --dry-run
npm publish --dry-run

# Publish to npm
npm publish
```

The package publishes to `https://registry.npmjs.org/` with `access: public` under the `@enter-pro` scope.

---

## Consuming in Another Repo

Add the `@enter-pro` scope to `.npmrc`:

```ini
@enter-pro:registry=https://registry.npmjs.org/
//registry.npmjs.org/:_authToken=<NPM_TOKEN>
always-auth=true
```

Install:

```bash
pnpm add @enter-pro/analytics-sdk
```

To test before publishing, install from a local tarball:

```bash
npm pack   # run in packages/analytics-sdk
pnpm add /absolute/path/to/enter-pro-analytics-sdk-0.0.6.tgz
```

---

## Notes

- This package is fully standalone and must not import runtime code from `packages/analytics`.
- Generator-side project setup should copy `skills/enter-analytics-auto.md` into `.enter/skills/` so that Enter Code can auto-instrument new projects.
- The SDK is ESM-only (`"type": "module"`). Consumers must use a bundler (Vite, esbuild, Rollup, etc.).
