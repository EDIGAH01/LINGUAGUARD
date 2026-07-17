# Instrumentation audit checklist

Run this checklist when you're auditing an existing codebase rather than writing fresh code. The goal is to produce a **diff plan**: a list of events to add, a list to delete, and a list to leave alone.

Use the `Grep` tool for every scan. Do not write a custom AST script — agents have repeatedly built fragile custom parsers when `Grep` would have been faster and safer.

## Phase 1 — Inventory the registry

```bash
curl -fsS \
  "https://api.enter.pro/v1/projects/<ENTER_PROJECT_ID>/analytics/events/registry" \
  -H "Authorization: Bearer <ENTER_API_TOKEN>"
```

Save the `data.events[*].event_name` list. Default events (`page_view`, `session_start`, `session_end`, `enter_verify`) are always present and must be ignored when diffing.

## Phase 2 — Inventory the code

Run each pattern as a separate `Grep` call. Restrict to the user's source tree (typically `src/` or `app/`).

| Pattern | Catches | Notes |
|---|---|---|
| `onClick=` | imperative click handlers | Capture surrounding component name |
| `onSubmit=` | form submissions | Usually the strongest funnel signal |
| `<button` | DOM buttons (any framework) | Pair with `onClick` matches |
| `<a `, `<Link ` | navigation | External vs internal matters for source attribution |
| `useNavigate`, `router.push`, `navigate(` | programmatic route changes | These do **not** auto-emit `page_view` if SPA navigation is unusual |
| `handleSubmit(`, `useForm(` | form libraries (react-hook-form, formik) | Often hide the actual submit handler |
| `trackEvent(`, `registerEventDefinition(`, `emitDefinedEvent(` | already-instrumented events | These are your "instrumented" set |
| `bootstrapEnterAnalytics(` | bootstrap call site | Must be exactly one match at app entry |

## Phase 3 — Categorize

Build three lists:

1. **Already instrumented** — the event_name appears both in the registry and in a `trackEvent` / `registerEventDefinition` call. No action.
2. **Code without registration** — a `trackEvent('foo', ...)` exists but `foo` is not in the registry. **Bug.** Either register it (most common) or delete the call.
3. **Registration without code** — the registry contains an event_name with no matching code reference. Either it's emitted from server / native, or it's dead. Confirm with the user before deleting.
4. **Interaction without either** — a click / submit / navigation that the user wants to measure but isn't in either list. This is the backfill target.

## Phase 4 — Confirm with the user before any change

Show this table before instrumenting anything:

```markdown
| candidate | location | suggested event_name | event_type | priority |
|---|---|---|---|---|
| signup form submit | src/features/signup/SignupForm.tsx:42 | signup_completed | conversion | high |
| pricing CTA click  | src/pages/Pricing.tsx:18           | pricing_cta_clicked | conversion | high |
| docs link click    | src/components/DocsNav.tsx:30      | docs_link_clicked | custom | low |
| footer social      | src/components/Footer.tsx:12       | (skip)          | —          | skip |
```

Get the user to mark which rows to instrument. Do not assume "high" priority items must be done — leave the call to them.

## Phase 5 — Backfill

For each row the user approved:

1. Run Step 1 → Step 2 from `SKILL.md` (design + register).
2. Pick declarative or imperative per the Mode-A decision tree.
3. Add stable `data-*` hooks to the JSX if you're going declarative.
4. Re-run Phase 2 grep to confirm the call is now present.

## Phase 6 — Final report

End with the Step 5 tracking-plan table from `SKILL.md`, plus a "removed" section if you proposed any deletions. Include both:

- the registry POSTs you made (with HTTP status)
- the file changes you made (with line numbers)
