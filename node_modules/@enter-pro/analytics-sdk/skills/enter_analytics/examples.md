# Examples

Three end-to-end recipes. Each one shows the **register call** and the **code change** together — never one without the other.

Replace `<ENTER_PROJECT_ID>` and `<ENTER_API_TOKEN>` with the values your platform runtime provides. If a `<analytics_register_event_tool>` exists, use it instead of the curl block.

---

## Minimal correct setup

First confirm the dependency exists in the target app:

```bash
node -e "const pkg=require('./package.json'); const deps={...pkg.dependencies,...pkg.devDependencies}; if(!deps['@enter-pro/analytics-sdk']) process.exit(1)"
```

If that check fails, install the SDK with the project's package manager, for example:

```bash
pnpm add @enter-pro/analytics-sdk
```

`.env` / Vite env:

```env
VITE_ENTER_PROJECT_ID=<ENTER_PROJECT_ID>
VITE_ENTER_ANALYTICS_TOKEN=<ENTER_ANALYTICS_SDK_TOKEN>
VITE_ENTER_ANALYTICS_ENDPOINT=https://api.enter.pro
```

`src/main.tsx`:

```ts
import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';
import { createRoot } from 'react-dom/client';
import App from './App';

bootstrapEnterAnalytics();

createRoot(document.getElementById('root')!).render(<App />);
```

Do not write this:

```ts
import EnterAnalytics from '@enter-pro/analytics-sdk';
import { EnterAnalytics } from '@enter-pro/analytics-sdk';

const analytics = new EnterAnalytics({
  projectId: import.meta.env.VITE_ENTER_PROJECT_ID,
  token: import.meta.env.VITE_ENTER_ANALYTICS_TOKEN,
});

analytics.track('signup_completed');
```

`@enter-pro/analytics-sdk` has no `EnterAnalytics` class and no default export. Use named function imports only.

---

## Example 1 — New generated project: signup conversion

The user said: "Track when someone finishes signup, and include the plan they picked."

### Step 1 — Design

| event_name | event_type | properties |
|---|---|---|
| `signup_completed` | `conversion` | `plan` (string), `referrer_source` (string) |

### Step 2 — Register

```bash
curl -fsS "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>"

curl -fsS -X POST \
  "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"event_name":"signup_completed","event_type":"conversion","description":"User finished signup"}'
```

Expect `200 {"code":0,"message":"event registered"}` or `409 event already exists` — both are fine.

### Step 3 — Bootstrap once at app entry

```ts
// src/main.tsx
import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';
import { createRoot } from 'react-dom/client';
import App from './App';

bootstrapEnterAnalytics();

createRoot(document.getElementById('root')!).render(<App />);
```

### Step 3 (cont.) — Imperative trackEvent

```tsx
// src/features/signup/SignupForm.tsx
import { trackEvent } from '@enter-pro/analytics-sdk';

export function SignupForm() {
  async function handleSubmit(values: { plan: string; source: string }) {
    await api.signup(values);

    trackEvent('signup_completed', {
      eventType: 'conversion',
      properties: {
        plan: values.plan,
        referrer_source: values.source,
      },
    });
  }
  // ... rest of the form
}
```

### Step 5 — Tracking plan output

```markdown
| event_name | event_type | trigger | properties | registered |
|---|---|---|---|---|
| signup_completed | conversion | code: SignupForm.handleSubmit | plan, referrer_source | yes (created) |
```

---

## Example 2 — Declarative DOM event for a pricing CTA

The user said: "I want to know which plan card people click on the pricing page."

### Step 1 — Design

| event_name | event_type | properties |
|---|---|---|
| `pricing_cta_clicked` | `conversion` | `plan` (string), `label` (string) |

### Step 2 — Register

```bash
curl -fsS -X POST \
  "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{"event_name":"pricing_cta_clicked","event_type":"conversion","description":"Click on a pricing plan CTA"}'
```

### Step 3 — Markup with stable hooks

```tsx
// src/pages/Pricing.tsx
const PLANS = [
  { id: 'starter', label: 'Start free' },
  { id: 'pro',     label: 'Start Pro' },
  { id: 'team',    label: 'Talk to sales' },
];

export function Pricing() {
  return (
    <section>
      {PLANS.map((p) => (
        <button
          key={p.id}
          data-cta="pricing"
          data-plan={p.id}
        >
          {p.label}
        </button>
      ))}
    </section>
  );
}
```

### Step 3 (cont.) — Register the definition once

```ts
// src/analytics/definitions.ts
import { registerEventDefinition } from '@enter-pro/analytics-sdk';

export function registerLandingDefinitions() {
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
}
```

```ts
// src/main.tsx
import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';
import { registerLandingDefinitions } from './analytics/definitions';

bootstrapEnterAnalytics();
registerLandingDefinitions();
```

### Step 5 — Tracking plan output

```markdown
| event_name | event_type | trigger | properties | registered |
|---|---|---|---|---|
| pricing_cta_clicked | conversion | DOM: [data-cta="pricing"] | plan, label | yes (created) |
```

---

## Example 3 — Audit existing project and backfill

The user imported a project that already had pages but no analytics, and said: "Audit what we should be tracking and add it."

### Step 0 — Bootstrap if missing

```ts
// src/main.tsx
+ import { bootstrapEnterAnalytics } from '@enter-pro/analytics-sdk';
+ bootstrapEnterAnalytics();
```

### Step 1 — Scan with Grep

Run these searches (Grep tool, not a custom script):

| Pattern | Why |
|---|---|
| `onClick=` | imperative click handlers |
| `onSubmit=` | form submissions |
| `<button` | DOM buttons |
| `<a ` / `<Link ` | navigation |
| `useNavigate\|router\.push\|navigate\(` | programmatic navigation |
| `handleSubmit\(\|useForm\(` | form libraries |

Build a candidate list and ask the user which ones matter for their funnel. Don't try to track all of them.

### Step 2 — Diff against the existing registry

```bash
curl -fsS "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>"
```

Categorize each candidate:

- **Missing** → register + instrument.
- **Already in registry but no code reference** → ask the user; if confirmed dead, `DELETE` it.
- **Already in registry and instrumented** → leave alone.

Register each missing one (one POST per event):

```bash
for ev in "newsletter_subscribed:conversion" "doc_link_clicked:custom"; do
  name="${ev%%:*}"
  type="${ev##*:}"
  curl -fsS -X POST \
    "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
    -H "Authorization: Bearer <ENTER_API_TOKEN>" \
    -H "Content-Type: application/json" \
    -d "{\"event_name\":\"$name\",\"event_type\":\"$type\"}"
done
```

### Step 3 — Backfill JSX

Pick the same Mode-A decision tree as Example 1/2. For static CTAs, prefer declarative; for handlers that already exist, drop a `trackEvent` inside.

```tsx
// src/components/NewsletterForm.tsx
- async function handleSubmit(values) {
-   await api.subscribe(values);
- }
+ import { trackEvent } from '@enter-pro/analytics-sdk';
+
+ async function handleSubmit(values) {
+   await api.subscribe(values);
+   trackEvent('newsletter_subscribed', {
+     eventType: 'conversion',
+     properties: { source: values.source },
+   });
+ }
```

### Step 4 — Verify

```bash
curl -fsS "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/verify" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>"
```

Expect `{ "verified": true, "received_at": "..." }` after the user reloads the site once.

### Step 5 — Tracking plan output

```markdown
| event_name | event_type | trigger | properties | registered | action |
|---|---|---|---|---|---|
| newsletter_subscribed | conversion | code: NewsletterForm.handleSubmit | source | yes (created) | added |
| doc_link_clicked | custom | DOM: [data-doc-link] | href, section | yes (created) | added |
| legacy_promo_click | custom | (no code reference) | — | yes (existing) | proposed delete |
```
