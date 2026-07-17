---
name: enter-analytics-instrumentation
description: End-to-end instrumentation skill for the @enter-pro/analytics-sdk on Enter-generated websites. Use when the user asks to add analytics, add tracking, instrument a button or form, track an event, send a conversion, design a tracking plan, register a custom event, audit existing instrumentation, or wire up data collection for a vibecoding project. Covers event design, calling the backend events/registry endpoint, inserting trackEvent / registerEventDefinition in code, and verifying delivery.
---

# Enter Analytics Instrumentation

This skill is the single source of truth for adding analytics to any Enter-generated site. The runtime is `@enter-pro/analytics-sdk` (source: `packages/analytics-sdk/`). Custom events fail with `event not registered` unless you register them through the backend first, so this skill always drives the full loop: **design → register → instrument → verify → report**.

## SDK API Contract

`@enter-pro/analytics-sdk` intentionally exposes named functions only. It does not export an `EnterAnalytics` class, a default SDK client, or anything that should be constructed with `new`.

Correct app-entry setup:

```ts
import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';

bootstrapEnterAnalytics();
```

For instrumentation work, use these named runtime imports from `packages/analytics-sdk/src/index.ts`: `bootstrapEnterAnalytics`, `trackEvent`, `registerEventDefinition`, `registerEventDefinitions`, `replaceEventDefinitions`, `unregisterEventDefinition`, `clearEventDefinitions`, `emitDefinedEvent`, `loadEventDefinitionsFromUrl`, `getAnalyticsHealth`, `flush`, and `destroy`.

Do not run shell commands to inspect package exports before coding. Use the contract above directly.

## Hard rules (always apply)

- Before writing any SDK import, inspect the user's target project dependency files and confirm `@enter-pro/analytics-sdk` is installed. If it is missing, install it first as a normal project dependency with the target project's existing package manager; never use a global install.
- Call `bootstrapEnterAnalytics()` exactly once at app entry. Do not remove it, wrap it in an effect, or call it conditionally.
- Do not import `EnterAnalytics`, do not use a default import, do not create an analytics client instance, and do not call `analytics.track(...)`.
- Never POST to `/v1/track`, `/analytics/*`, or any analytics URL with a hand-written `fetch` / `XMLHttpRequest` / `sendBeacon`. The SDK owns transport, retries, sanitization, and beacons.
- **Register before you instrument.** Any non-default `event_name` must exist in the project's event registry before the first `trackEvent` / `registerEventDefinition` call, otherwise the backend rejects it with `rejected.reason: "event not registered"`.
- Default events `page_view`, `session_start`, `session_end`, `enter_verify` are auto-emitted; do not register, rename, or re-emit them from app code.
- `event_name` must be `snake_case`. `event_type` must be one of `traffic`, `conversion`, `custom`, but **client code can only emit `custom` or `conversion`** — `traffic` is reserved for SDK auto events.
- Never put `password`, `token`, `cookie`, `authorization`, `auth`, `email`, `phone`, or any raw form input value into `properties` or `context`. The SDK strips keys whose lowercase form contains any of those substrings (`packages/analytics-sdk/src/normalize/sanitize.ts`), but treat sanitization as a backstop, not a feature.
- Never echo `<ENTER_API_TOKEN>` or any registry credential into chat messages, code comments, or generated files.
- Prefer semantic `<button>`, `<a>`, `<form>` markup so declarative selectors and auto-tracking stay stable across renders.

## End-to-end workflow

```
Step 0  Confirm/install @enter-pro/analytics-sdk       (dependency)
Step 1  Align with the user on what to track          (design)
Step 2  Register every non-default event              (POST events/registry)
Step 3  Instrument the code                           (trackEvent / registerEventDefinition)
Step 4  Self-check                                    (getAnalyticsHealth + GET analytics/verify)
Step 5  Output the tracking plan                      (markdown table back to the user)
```

Walk every step in order. If the user pushes you to skip Step 2, refuse — un-registered events are dropped silently from the user's analytics dashboard.

---

## Step 0 — Confirm the SDK dependency

Before editing code, check the target app's dependency manifest:

1. Read `package.json` in the app or site being instrumented.
2. Check both `dependencies` and `devDependencies` for `@enter-pro/analytics-sdk`.
3. If it is missing, install it before adding imports:
   - `pnpm add @enter-pro/analytics-sdk` when the project uses `pnpm-lock.yaml`.
   - `npm install @enter-pro/analytics-sdk` when the project uses `package-lock.json`.
   - `yarn add @enter-pro/analytics-sdk` when the project uses `yarn.lock`.
   - `bun add @enter-pro/analytics-sdk` when the project uses `bun.lockb` or `bun.lock`.
4. If no lockfile exists, use the package manager already used by the current project scripts. If that is still unclear, ask before installing.
5. After installation, confirm `package.json` contains `@enter-pro/analytics-sdk` before writing imports.

Do not continue with `bootstrapEnterAnalytics`, `trackEvent`, or `registerEventDefinition` until the dependency exists in the user's project.

---

## Step 1 — Design the events

### Naming

- Format: `object_action` in `snake_case` (`signup_completed`, `cart_item_added`, `pricing_cta_clicked`).
- Past tense for outcomes (`completed`, `submitted`), present tense for navigation (`viewed`, `opened`).
- Never reuse a default name; never include PII or IDs in the name.

### `event_type` selection

| Business meaning | `event_type` |
|---|---|
| Revenue, signup, activation, key funnel completion | `conversion` |
| Engagement, feature usage, generic interactions | `custom` |
| Page views, performance, errors | `traffic` (auto only — not allowed from client code) |

### Properties

- Keys: `snake_case`, primitives only (string / number / boolean). Strings are auto-truncated at 256 chars.
- 3–8 properties per event is usually right. Beyond that, split the event.
- Banned keys (case-insensitive substring match): `password`, `token`, `cookie`, `authorization`, `auth`, `email`, `phone`. Also banned: raw form values, free-text input, full URLs containing query secrets.
- For form data, use the `formFields` binding with an explicit `fields: [...]` allowlist — never `includeAll: true` on user-authored forms.

Full reference: [resources/naming-and-properties.md](resources/naming-and-properties.md).

---

## Step 2 — Register the events (backend call)

Endpoint: `POST /v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry`
Auth: `Authorization: Bearer <ENTER_API_TOKEN>` (ProjectWrite scope)

```json
{
  "event_name": "signup_completed",
  "event_type": "conversion",
  "description": "User finished the signup flow"
}
```

Response codes worth handling:

| Code | Meaning | Agent action |
|---|---|---|
| `200` | Registered | Continue to Step 3 |
| `400` | Bad payload, default name, or invalid `event_type` | Re-validate naming and retry |
| `403` | Analytics not enabled on the project | Tell the user; do **not** silently call `analytics/enable` without confirmation |
| `409` | Event already exists | Treat as success and continue |

### Idempotent flow

1. `GET /v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry` to fetch existing events.
2. For each new event in your tracking plan:
   - If present → skip.
   - If absent → `POST` it.
3. Stop and surface the error verbatim if any non-409 failure occurs. Never proceed to instrument an event that failed to register.

### Two ways to actually call the API

Use the platform tool when available, fall back to HTTP otherwise.

**A. Platform tool (preferred)**

> The vibecoding platform exposes a tool named `<analytics_register_event_tool>` that wraps this endpoint with credentials already injected. Call it with `{ project_id, event_name, event_type, description }`.

If you don't see that tool in your tool list, use option B.

**B. HTTP fallback**

Curl form (for shell-capable agents):

```bash
curl -fsS -X POST \
  "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"event_name":"signup_completed","event_type":"conversion","description":"..."}'
```

Both `<ENTER_PROJECT_ID>` and `<ENTER_API_TOKEN>` come from the platform runtime context. Read them from the agent's environment / context — do not ask the user to paste them, and never write them into source files.

Full backend reference: [reference.md](reference.md#backend-api-cheatsheet).

---

## Step 3 — Instrument the code (both modes)

### Bootstrap once at app entry

Before adding custom events, make sure the app entry calls the SDK once:

```ts
import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';

bootstrapEnterAnalytics();
```

The SDK reads `.env` / `import.meta.env` automatically through `readEnv()` inside `packages/analytics-sdk/src/bootstrap.ts`; normal app code should not pass `projectId`, `token`, or `endpoint` manually. Advanced setup can pass only supported `bootstrapEnterAnalytics(options)` fields such as `inactivityTimeoutMs`, `disableVerifyPing`, `hashRouting`, and `eventDefinitionsUrl`. Never create an SDK instance.

### Mode A — New code you're writing now

Decision tree:

```
Is the trigger a DOM click or form submit on a stable selector?
  → Yes: registerEventDefinition (declarative)
  → No  ↓
Is the event fired from app code (route guard, effect, callback, async result)?
  → Yes: trackEvent (imperative)
```

Imperative:

```ts
import { trackEvent } from '@enter-pro/analytics-sdk';

trackEvent('signup_completed', {
  eventType: 'conversion',
  properties: { plan: 'pro', variant: 'hero_v2' },
  context: { page_section: 'hero' },
});
```

Declarative (preferred for buttons / links / forms):

```ts
import { registerEventDefinition } from '@enter-pro/analytics-sdk';

registerEventDefinition({
  event_name: 'pricing_cta_clicked',
  event_type: 'conversion',
  trigger: { kind: 'click', selector: '[data-cta="pricing"]' },
  property_bindings: {
    plan: { type: 'attribute', attribute: 'data-plan' },
    label: { type: 'textContent' },
  },
  definition_version: '1',
});
```

Add stable hooks in markup so selectors survive refactors:

```tsx
<button data-cta="pricing" data-plan="pro">Start Pro</button>
```

### Mode B — Audit and backfill an existing codebase

Run when the user says "check what's tracked", "audit our analytics", "we're missing events", or after importing a project that wasn't built with this SDK.

Procedure (full checklist: [resources/instrumentation-audit.md](resources/instrumentation-audit.md)):

1. Use `Grep` (not a custom script) to scan for:
   - `<button`, `<a `, `<form`, `onClick=`, `onSubmit=`
   - Router navigation: `useNavigate`, `router.push`, `<Link to=`, `navigate(`
   - Form libraries: `handleSubmit(`, `useForm(`
2. Diff the candidate list against `GET /analytics/events/registry`.
3. For each interaction the user cares about that is **missing** an event → run Step 1 → Step 2 → Step 3-A.
4. For each registered event with **no code reference** → propose deletion via `DELETE /analytics/events/registry/:event_name`, but never delete without user confirmation.

### Anti-patterns (will be flagged)

- `import EnterAnalytics from '@enter-pro/analytics-sdk'`.
- `import { EnterAnalytics } from '@enter-pro/analytics-sdk'`.
- `new EnterAnalytics(...)`.
- `analytics.track(...)`.
- Hand-rolling `fetch('/v1/track', ...)` instead of `trackEvent`.
- Calling `bootstrapEnterAnalytics()` inside a component or `useEffect` — re-init storms.
- `properties: { email: user.email }` or stuffing entire form objects into `properties`.
- Calling `trackEvent('signup_completed', ...)` before `signup_completed` is registered.
- Re-registering a default event such as `page_view`.
- Emitting `error` or `performance` events from app code — they are auto-emitted by the SDK collectors.

---

## Step 4 — Self-check before declaring done

Static (run with `Grep` over the diff):

- No new `fetch(` or `sendBeacon(` to any analytics path.
- No banned property keys introduced.
- Every new `trackEvent` / `registerEventDefinition` `event_name` exists in the registry list returned by Step 2.

Runtime (when you can run the app):

- `getAnalyticsHealth()` returns `{ initialized: true, enabled: true, sessionId: '...' }`.
- After the user-visible action that should fire the event, `outboxSize` increases by ≥ 1.
- `GET /v1/projects/<ENTER_PROJECT_ID>/analytics/verify` returns `{ verified: true, received_at: ... }` (this confirms the SDK reached the backend at least once; useful right after first bootstrap).

If verification fails, do not declare success. Read [reference.md](reference.md#troubleshooting) and surface the failure to the user.

---

## Step 5 — Output the tracking plan

End every instrumentation task with this markdown table so the user can review what was added:

```markdown
| event_name | event_type | trigger | properties | registered |
|---|---|---|---|---|
| signup_completed | conversion | code: SignupForm onSubmit | plan, variant | yes (created) |
| pricing_cta_clicked | conversion | DOM: [data-cta="pricing"] | plan, label | yes (existing) |
```

Never invent a row that wasn't actually wired. Never claim `registered: yes` without seeing a 200/409 from the registry endpoint.

---

## Progressive disclosure

- API and signature details: [reference.md](reference.md)
- Copy-paste examples (new project / declarative DOM / audit-and-backfill): [examples.md](examples.md)
- Naming, property, and privacy spec: [resources/naming-and-properties.md](resources/naming-and-properties.md)
- Existing-codebase audit checklist: [resources/instrumentation-audit.md](resources/instrumentation-audit.md)
- Source of truth for SDK runtime behavior: `packages/analytics-sdk/README.md`
- Backend API spec: `analytics_api.md` at the repo root.

## Placeholders the platform must replace

These tokens appear in this skill and its companions. The vibecoding platform substitutes them at agent runtime; if you encounter them as literals in your context, ask the platform owner to wire them up before instrumenting anything in production:

- `<ENTER_PROJECT_ID>` — current project's `enter_pid`.
- `<ENTER_API_TOKEN>` — Bearer token with `ProjectWrite` scope (registry) or `ProjectRead` (verify, list).
- `<analytics_register_event_tool>` — platform-side tool name that wraps the registry POST. If absent, use the HTTP fallback.
