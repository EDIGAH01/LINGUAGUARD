# Naming, properties, and privacy spec

The single rulebook for what an `event_name`, `event_type`, and `properties` object should look like before you call `events/registry`.

## Event name

### Format

`object_action`, all `snake_case`, all lowercase, ASCII only.

| Good | Bad | Why |
|---|---|---|
| `signup_completed` | `SignupCompleted` | not snake_case |
| `cart_item_added` | `add-to-cart` | hyphens not allowed |
| `pricing_cta_clicked` | `click_button` | object missing |
| `checkout_started` | `checkout` | action missing |
| `video_played` | `play_video_homepage_hero` | location belongs in properties |

### Tense

- Past tense for outcomes: `completed`, `submitted`, `failed`, `subscribed`.
- Present tense for navigation / lifecycle: `viewed`, `opened`, `closed`.
- Avoid gerunds (`-ing`).

### Names you must not use

`page_view`, `session_start`, `session_end`, `enter_verify`, `error`, `performance` — these are owned by the SDK collectors.

### Names that signal a problem

- Anything containing `email`, `phone`, `password`, `token` → almost certainly leaking PII.
- Anything containing a user id, project id, plan id literal (`signup_completed_pro`) → that belongs in a property.

## `event_type`

| Value | Use for | Allowed from client code? |
|---|---|---|
| `conversion` | Revenue, signup, activation, key funnel completion | Yes |
| `custom` | Engagement, feature usage, generic interactions | Yes |
| `traffic` | `page_view`, `session_*`, `enter_verify`, `error`, `performance` | **No — auto only** |

If you find yourself wanting `traffic`, you almost always want `custom`. The only valid registry-time use of `traffic` is the four default names, which are pre-seeded and must not be re-registered.

## Properties

### Type matrix

| Allowed | Example |
|---|---|
| `string` (max 256 chars after sanitize) | `plan: 'pro'` |
| `number` (int or float) | `cart_value: 49` |
| `boolean` | `is_returning: true` |

| Not allowed | Reason |
|---|---|
| `null` / `undefined` | dropped by the backend, useless |
| nested objects | flatten to `cart_first_item_id` etc. |
| arrays of objects | dimensional explosion in the dashboard |
| `Date` instances | use ISO 8601 strings |
| binary / `File` / `Blob` | not serializable for analytics |

### Key format

- `snake_case`, lowercase, ASCII.
- 3–8 keys per event is the sweet spot. More than 8 → split the event.
- Keep names task-specific: `plan` not `plan_id_chosen_by_user`.

### Banned keys (privacy backstop)

The SDK strips any property key whose **lowercase form contains** any of these substrings (`packages/analytics-sdk/src/normalize/sanitize.ts`):

```
password
token
cookie
authorization
auth
email
phone
```

That includes derived names like `user_email`, `auth_state`, `phone_number`, `csrf_token`.

Treat the sanitizer as a backstop. The skill rule is stricter: **never put PII or credentials into an event in the first place**, even under a renamed key.

### Form data

The SDK has two bindings for forms:

- `formField`: read one named field. Safe when the field is non-PII (e.g. a select between `monthly` / `yearly`).
- `formFields`: read multiple. Always pass `fields: [...]` with an explicit allowlist.

Forbidden: `{ type: 'formFields', includeAll: true }` on any form that contains user-authored input. It will sweep up email addresses, names, free text, and any future field added to the form.

### String length

Strings over 256 characters are auto-truncated. If you need full content (URLs, descriptions), store an identifier instead and look up the full value out-of-band.

## `definition_version`

Required on every `EventDefinition`. Bump it when you change:

- `trigger.selector`
- the set of `property_bindings` keys
- the meaning of an existing key

Use a monotonically increasing string: `'1'`, `'2'`, `'3'`. The dashboard groups events by `(event_name, definition_version)` so that schema changes do not silently corrupt historical aggregates.
