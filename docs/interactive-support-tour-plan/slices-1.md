# Support tour plan: slice document 1 of 6 (S01 to S07)

Part of the Interactive Support and Tour System plan. Overview, inventory, architecture, dependencies, traceability, testing, risks and the checklist are in [00-overview.md](00-overview.md). This document holds the full specifications of 7 slices. Section numbers such as "section 3.4" refer to the overview; the standard procedure (6.1) and the assumptions (0.2) are repeated here so the document can be used on its own.

> ## If you were asked to implement a slice ("implement slice 7", "do S07")
>
> 1. "Slice N" means the heading `### SNN:` in this document. Open **only** that slice, plus the standard procedure (6.1) and the assumptions (0.2) repeated below. Do not read the overview in full.
> 2. Read the slice's **Prerequisites** (item 5) and confirm each prerequisite slice is already merged (the overview, `00-overview.md`, has the slice-to-document table in section 6 and the dependency table in 5.6). If one is not merged, stop and say so; do not build it as a side effect.
> 3. Foundation slices (S01 to S04) are made of parts P01 to P16; read every part inside the slice.
> 4. Work test-first. Apply the **File-Level Change Plan** (item 7) file by file; follow item 8 for task order; keep to item 16 (what is excluded).
> 5. Verify with item 13, check item 12, and report the measured production LOC next to the estimate in item 6.
> 6. One slice = one branch `support-slice-N-<name>` and one PR. Never implement anything from another slice and never annotate a control listed in section 3.4 of the overview.
> 7. Page slices marked "profiled" or "extracted" in the overview are hypotheses: re-inventory the files first (PT-2) and report differences before editing.

### 6.1 Standard procedure, tests, acceptance and evidence for every page-tour slice

Each page slice below lists its *own* inputs (files, annotation sites, steps, states, tests, acceptance). The parts that are identical for every page are defined here once and referenced as PT, ST, SA and SE. A slice is not complete unless every referenced item is done.

**Procedure (PT).**

- **PT-1 Red first.** Create or extend `src/lib/support/guides/<guide>.test.tsx`. Write the tests named in the slice's item 11 and ST-1 to ST-5. Run them and confirm they fail for the expected reason (guide module missing, steps missing, attribute absent).
- **PT-2 Re-inventory.** Read the page files listed in the slice, **and walk their imports one level down** (`grep -E "^import .* from '(\.\./)+(components|pages)/" <files>`): every child component with interactive controls becomes a step or an entry in section 3.4. (The first inventory of this plan missed the contract instalment card, the follow-ups panel on two detail pages, the offer action bar and the shared plan and appointment dialogs; this step is what finds them.) The evidence level of the page is in section 3: *read in context* means the render code was read during planning; *extracted* means control lines were extracted but conditions were not read in context; *profiled* means only sizes and counts are known, so the step list is a hypothesis. Use `grep -nE "<Button|<button|aria-label=|<Tabs|<DropdownMenu|<Modal|<SlideOver|<ConfirmDialog|empty=\{|usePermission|role=\"alert\"" <files>`. Record every added, removed or renamed control in the PR. If this changes the estimate by more than 25%, apply rule 4.14-2.
- **PT-3 Annotate.** A component rendered by more than one page carries **component-scoped ids** (`activity.*`, `plan.*`, `apptDetail.*`, `followUps.*`, `contractPayments.*`, `shell.*`), is annotated once in the first slice that touches it, and later pages reuse its guidance. Add `tourProps('<pageId>.<step>')` or the shared component's `tourId` to the existing elements; add `repeat` for repeated structures; annotate the element that exists only in a state for steps marked (state). No wrappers, no behaviour change. Never annotate a control listed in section 3.4.
- **PT-4 Guide.** Write or extend `definePageGuide({ pageId, version: 1, namespace, steps })` with the steps in the slice, in tour order. A step id `x` becomes the copy keys `<namespace>:<pageId>.x.title|body` (plus `when`, `warning`, `disabled` where meaningful).
- **PT-5 Register (first slice of a page only).** Loader line in `pageRegistry.ts`; flip the page's `routeMap` entries from planned to mapped; remove the page id from `PLANNED_PAGES`. Later slices of the same page change nothing here.
- **PT-6 Copy.** Add every key to `locales/en/<namespace>.json` and `locales/sq/<namespace>.json`; `el` and `it` follow and fall back to English. `npm run check:translations` must pass.
- **PT-7 End to end.** Add or extend the page's row in `frontend/tests/e2e/support.spec.ts`: open the route, open Support, start the tour, Next to the end, assert no console error, no navigation and no mutating request (`expectNoMutations`), at desktop width and at 360 px.
- **PT-8 Green, refactor, verify.** Minimum code to pass; refactor; run the slice's verification commands; measure production LOC with the command in A1 and record it next to the estimate in the PR.

**Standard tests (ST).**

- **ST-1 Integrity (SUP-02, SUP-05, SUP-18).** `assertGuideIntegrity(guide)` passes: unique step ids, valid target ids, `repeat` declared for repeated targets, no destructive step that is `try-it`, every copy key present in `en` and `sq`.
- **ST-2 Resolution (SUP-02, SUP-06).** Each step resolves in at least one rendered fixture state; steps marked (state) resolve only in their state and are skipped in the others.
- **ST-3 Change during the tour (SUP-06, SUP-08).** With the tour running, remove, replace, disable and add the relevant elements (msw refetch or fixture mutation): the tour never points at an unrelated element and never stalls; announcements are made.
- **ST-4 Eligibility (SUP-09).** For steps with `requires`, a user without the permission, scope or workflow has no such step; a user with it does.
- **ST-5 Read-only (SUP-12).** Handlers behind every explain-only control are spies and are never called by pointer, Enter or Space; forms do not submit; zero mutating requests in the end-to-end row.

**Standard acceptance (SA).**

- **SA-1** On the page's route(s), Support → Tour this page reaches the last step of the slice for a user holding every permission involved; Back, Skip tour and Exit behave as specified in P06 to P08.
- **SA-2** Zero data-changing requests during the tour; explained controls cannot be activated while it runs.
- **SA-3** Tests, typecheck, lint, `check:translations` and build pass; every step has a `title` and `body` in `en` and `sq`.
- **SA-4** The page appears in the Support panel with Explain a control listing the slice's controls that exist on screen.

**Standard evidence (SE).**

- **SE-1** Red-then-green commit history. **SE-2** Vitest report for the guide test and the touched components' tests. **SE-3** Playwright report for the page's row, desktop and 360 px, with one screenshot of the highlighted state per area of the slice. **SE-4** Measured production LOC next to the estimate; the page's row in 7.3 true for the states the slice claims.

### 0.2 Assumptions that fill gaps in the conventions

| # | Gap or conflict | Assumption made (smallest reasonable) |
|---|---|---|
| A1 | The repository has **no definition of production LOC** and no slice-size rule in lines. The M4 plan sizes slices S / M / L by effort. | **Production LOC** = added or substantively changed non-blank, non-comment lines in `frontend/src/**/*.{ts,tsx,css}`, excluding `*.test.*`, `*.stories.*`, `src/mocks/**`, `src/setupTests.ts`, `tests/**`, locale JSON and documentation. Comment lines are excluded because this codebase is comment-heavy and counting them would inflate every estimate. Reviewers can measure with `git diff -U0 main...HEAD -- 'frontend/src/**/*.ts' 'frontend/src/**/*.tsx' 'frontend/src/**/*.css' ':!*.test.*' ':!*.stories.*' ':!frontend/src/mocks' ':!frontend/src/setupTests.ts' \| grep '^+[^+]' \| grep -vE '^\+\s*(//\|\*\|/\*\|$)' \| wc -l`. The M4 effort sizes (S, M, L) are not used; every slice here is S to M by that scale. |
| A2 | **What is "one page"?** The task allows at most one page tour per slice but does not define page. | A page is one top-level screen component rendered by the router. Create and edit routes that render the same component (for example `ProductForm` for `inventory/new` and `inventory/:productId/edit`) are **one** page. Tabs inside a route are part of that page. Role-specific dashboards are **different components** and are therefore different pages although they share a URL. |
| A3 | **Estimating page-slice LOC** has no precedent. | Page slice = `16` (first slice of a page: guide module, loader line, route-map flip; `6` for later slices) `+ 8` per step definition `+ 2` per annotation site (about 0.9 per step) `+` listed extras (shared component annotations, group wiring). A step is a multi-line object in the style of the existing route table and tab arrays. Copy is JSON and is not counted. |
| A4 | **Frontend only.** No backend, schema or API change is needed. | Progress (completed, dismissed, resume point) is stored per user in `localStorage` (the theme store and sales-script panel set the precedent for per-viewer conveniences). Server-side persistence is decision D3. |
| A5 | **No auto-start.** The brief asks for help when a user invokes Support and warns against interrupting users. | Tours start only from the Support panel. No first-visit pop-up. Decision D2 records the alternative. |
| A6 | The brief lists both **Skip** and **Exit** without defining them. | **Exit** closes now and keeps the resume point. **Skip tour** closes now and marks the page's guide dismissed. Individual steps whose target does not exist are skipped automatically and announced. |
| A7 | Requirement ids. The repository's `scripts/check-traceability.mjs` and `scripts/srs-requirements.json` tie ids to SRS documents. | This phase has no SRS. Internal ids `SUP-01`..`SUP-20` are used in test titles and in section 7, and are **not** added to `srs-requirements.json` (decision D8). |
| A8 | Languages. | `en` and `sq` are required for every string. `el` and `it` fall back to `en`, which `check-translations.mjs` already allows. |
| A9 | Pre-login pages, public customer pages and print views have no Support entry. | Excluded with a reason each (section 3.3). Decision D6 records the choice for the sign-in family. |


---

## Foundation (infrastructure only)

<a id="s01"></a>

### S01: Foundation 1: engine, live target resolution, page registry, eligibility and copy loading

1. **Slice id and title:** S01. Foundation 1: engine, live target resolution, page registry, eligibility and copy loading. Branch `support-slice-1-foundation-1-engine-live-target-resolution`.
2. **Scope:** P01: The data model (`PageGuide`, `GuideStep`, `TargetSpec`, `Requirement`) and a framework-free reducer that owns every tour transition. No React, no DOM. P02: Finds the real element for a step, reports its status, and re-evaluates whenever the page changes. One shared `MutationObserver`, one `ResizeObserver` per active target. P03: A zustand store for the Support session, and a registry that turns the current URL into a page id, with a test that fails when a route is neither mapped nor explicitly excluded. P04: Decides which steps apply to this user right now (permission, scope, workflow, viewport), remembers progress per user, and loads Support copy on demand instead of bundling it.
3. **Purpose:** Everything else (resolver, overlay, host) renders or feeds this machine. Making it pure lets the Next/Back/Skip/Exit/finish rules, the shrinking-step-list rule and the waiting/lost states be proven with table-driven tests before any UI exists. This is the answer to the "dynamic data" requirement. Targets are looked up in the live DOM at the moment they are needed and again on every settled change, so the tour can never hold a stale element reference. Route-aware page detection and the traceability guarantee (SUP-20). Following `mobile360Coverage.test.ts`, a new route cannot be added without deciding its Support status. Keeps the tour honest about permissions (SUP-09), resumable (SUP-17) and free for users who never open Support (SUP-19: every `locales/*` file is statically imported today, so support copy for ~60 pages must not join that bundle).
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-03, SUP-08, SUP-10, SUP-17, SUP-06, SUP-07, SUP-15, SUP-01, SUP-19, SUP-20, SUP-09, SUP-18.
5. **Prerequisites:** none inside the phase. Existing functionality it builds on: `setupTests.ts`, `routes/index.tsx`, `i18n/config.ts`.
6. **Production LOC estimate:** **~1010** (within the 800 to 1,200 band around the 1,000-line target): P01 types.ts: GuideStep, PageGuide, TargetSpec, Requirement, StepSafety, MachineState, MachineEvent ~70; P01 tourMachine.ts: reducer + selectors (progress, current, isLast, canBack) ~170; P02 targetResolver.ts: selector build, scope root, visibility, disabled, pick strategy, `within`, status ~100; P02 domObserverHub.ts: single MutationObserver, rAF-batched, subscriber set, attribute filter ~80; P02 useTargetElement.ts: hook returning `{ element, status, rect }`, ResizeObserver, unmount cleanup ~80; P03 useSupportStore.ts: panelOpen, mode (`tour|single|pick|none`), session, context `{pageId, variant, scope}`, actions ~90; P03 routeMap.ts: ordered `{pattern, pageId | null, reason?}` for every route in the inventory + `PLANNED_PAGES` ~90; P03 pageRegistry.ts: `resolvePageId(pathname, variant)` via `matchPath`, lazy guide loader table, `isExcluded` ~60; P03 useSupportPage.ts: hook reading `useLocation` + store variant/scope ~30; P04 stepEligibility.ts: `requires` evaluation over `user.permissions` (key present, min scope), workflow, viewport; `useEligibleSteps` ~90; P04 progressStorage.ts: versioned localStorage map keyed by user+tenant, safe read/write, `completed|dismissed|lastStepId` ~90; P04 supportCopy.ts: `loadSupportCopy(ns, lng)` via `import.meta.glob`, `addResourceBundle`, reload on `languageChanged` ~60
7. **File-Level Change Plan** (23 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/types.ts`
      - Change: (P01) Declare the shared types: `StepSafety`, `StepKind`, `Requirement`, `GuideStep`, `PageGuide`, `TargetStatus`, `MachineState`, `MachineEvent`.
      - Implementation details: (new) `GuideStep` fields: id, target, kind, safety?, repeat?, within?, requires?, opens?, group?, warning?, use?, scope?, needs?. `MachineState` = idle | running{steps,index} | waiting{reason,parentIndex} | lost{index} | finished{outcome}.
      - Integration: Imported by every later Support module; no import from the app.
      - Removal: None: new file.
      - Verification: Compile-time only; exercised by `tourMachine.test.ts`.
   2. **Create** `src/lib/support/tourMachine.ts`
      - Change: (P01) Implement `tourReducer(state, event)` and the selectors `progress`, `currentStep`, `isLast`, `canGoBack`.
      - Implementation details: (new) `tourReducer`, `initialTourState`, events START, NEXT, BACK, SKIP_TOUR, EXIT, STEPS_CHANGED, TARGET_PENDING, TARGET_READY, TARGET_LOST, TARGET_RESTORED, HOLD_FOR_USER, LAYER_OPENED, LAYER_CLOSED.
      - Integration: Used by `useTourSession` (P08) through `useReducer`; never touched by components directly.
      - Removal: None: new file.
      - Verification: Table-driven transitions in `tourMachine.test.ts`; replay test for determinism.
   3. **Create** `src/lib/support/tourMachine.test.ts`
      - Change: (P01) Write first. One table row per (state, event) pair; re-anchoring cases for `STEPS_CHANGED`; a source-grep test that `tourMachine.ts` and `types.ts` import nothing from react, react-dom, react-router-dom.
      - Implementation details: Vitest `describe.each`; titles start with SUP-03, SUP-08, SUP-10.
      - Integration: Picked up by `vitest.config.ts` (`src/**/*.{test,spec}.?(c|m)[jt]s?(x)`).
      - Removal: None: new file.
      - Verification: It is the verification for the two files above.
   4. **Create** `src/lib/support/targetResolver.ts`
      - Change: (P02) Resolve a target id to an element and a status. Pure functions over a root node.
      - Implementation details: (new) `resolveTarget(spec, root)`, `scopeRoot(doc, forced?)` (topmost `[role="dialog"][aria-modal="true"]`, `[role="menu"]` or `[data-tour-layer]`, else `main`), `isVisible`, `isDisabled`, `isBusy` (ancestor `aria-busy="true"` or `[data-tour-busy]`), pick strategies `first`, `nth`, `within`.
      - Integration: Called by `useTargetElement`; selector is `[data-tour~="<id>"]`.
      - Removal: None: new file.
      - Verification: `targetResolver.test.tsx` (status table).
   5. **Create** `src/lib/support/domObserverHub.ts`
      - Change: (P02) Single `MutationObserver` on `document.body` (childList, subtree, attributeFilter: data-tour, disabled, aria-disabled, aria-hidden, aria-busy, hidden, class), notifications batched with `requestAnimationFrame`.
      - Implementation details: (new) `subscribeToDom(cb)` returning an unsubscribe; observer created on first subscriber, disconnected on last.
      - Integration: Shared by `useTargetElement`, `useLayerWatcher` (P13), `useExplainableControls` (P15).
      - Removal: None: new file.
      - Verification: Subscriber count returns to zero after unmount.
   6. **Create** `src/lib/support/useTargetElement.ts`
      - Change: (P02) Hook returning `{ element, status, rect }` for a step; attaches a `ResizeObserver` to the active element.
      - Implementation details: (new) `useTargetElement(spec, options)`.
      - Integration: Consumed by `SpotlightMask` (P05) and `useTourSession` (P08).
      - Removal: None: new file.
      - Verification: `useTargetElement.test.tsx`: add, remove, replace, disable, repeat re-pick, duplicate warning once.
   7. **Create** `src/lib/support/targetResolver.test.tsx`
      - Change: (P02) Write first; uses a `mockRect` helper because jsdom has no layout.
      - Implementation details: RTL render of small fixture markup.
      - Integration: Vitest.
      - Removal: None: new file.
      - Verification: Verifies SUP-06/07/08.
   8. **Create** `src/lib/support/useTargetElement.test.tsx`
      - Change: (P02) Write first; fake timers for the 4 s busy wait.
      - Implementation details: RTL `renderHook`.
      - Integration: Vitest.
      - Removal: None: new file.
      - Verification: Verifies unsubscribe on unmount.
   9. **Modify** `src/setupTests.ts`
      - Change: (P02) Add a minimal `ResizeObserver` stub if one is not already defined (the file already stubs pointer capture and `IntersectionObserver` in the same style).
      - Implementation details: Guard `if (typeof globalThis.ResizeObserver === 'undefined')`, copying the existing `IntersectionObserver` block.
      - Integration: Global test setup referenced by `vitest.config.ts` `setupFiles`.
      - Removal: No removal.
      - Verification: Existing suites still pass.
   10. **Create** `src/store/useSupportStore.ts`
      - Change: (P03) Zustand store for the Support session, modelled on `useSalesScriptStore.ts`.
      - Implementation details: (new) `useSupportStore` with panelOpen, mode (`none|tour|single|pick`), context `{pageId, variant, scope}`, actions `openPanel`, `closePanel`, `startTour`, `setContext`, `clearContext`; `useAuthStore.subscribe` clears everything when `previous.user && !state.user`, exactly as `useSalesScriptStore` does.
      - Integration: Read by `useSupportPage` and later the host and panel.
      - Removal: None: new file.
      - Verification: `useSupportStore.test.ts`.
   11. **Create** `src/lib/support/routeMap.ts`
      - Change: (P03) Table of router patterns to page ids, plus the exclusion list and `PLANNED_PAGES`.
      - Implementation details: (new) `ROUTE_MAP: Array<{ pattern: string; pageId: string | null; reason?: string }>`, `PLANNED_PAGES: string[]`; one entry per row of section 7.1 of the plan.
      - Integration: Patterns are written relative to `/:tenantSlug` and match `routes/index.tsx` `path` strings.
      - Removal: None: new file.
      - Verification: `routeMap.test.ts` walks the exported `routes` array.
   12. **Create** `src/lib/support/pageRegistry.ts`
      - Change: (P03) Resolve a pathname (and dashboard variant) to a page id; hold the lazy `loaders` record.
      - Implementation details: (new) `resolvePageId(pathname, variant?)` using `matchPath` from react-router-dom, `loaders: Record<string, () => Promise<{ default: PageGuide }>>` (empty until S05), `isExcluded`, `loadGuide(pageId)`.
      - Integration: Used by `useSupportPage` and `useTourSession`.
      - Removal: None: new file.
      - Verification: Grep test: no static `guides/` import.
   13. **Create** `src/lib/support/useSupportPage.ts`
      - Change: (P03) Hook returning `{ pageId, scope, hasGuide, isPlanned }` from `useLocation` and the store.
      - Implementation details: (new) `useSupportPage`.
      - Integration: Used by the panel (P09).
      - Removal: None: new file.
      - Verification: Covered in the registry tests.
   14. **Create** `src/lib/support/routeMap.test.ts`
      - Change: (P03) Write first. Import `routes` from `../../routes` and walk it recursively; assert every full pattern is mapped or excluded; no orphan entries; every mapped page id is in `loaders` or `PLANNED_PAGES`; add `it.todo('no planned pages remain')`.
      - Implementation details: Same technique as `src/routes/mobile360Coverage.test.ts`.
      - Integration: Vitest.
      - Removal: None: new file.
      - Verification: Verifies SUP-20.
   15. **Create** `src/store/useSupportStore.test.ts`
      - Change: (P03) Write first: open/close, context set/clear, clear on logout.
      - Implementation details: Follows `useAuthStore.test.ts` style.
      - Integration: Vitest.
      - Removal: None: new file.
      - Verification: Verifies the store.
   16. **Leave unchanged** `src/routes/index.tsx`
      - Change: (P03) Read only. Its exported `routes` array is the test input; the route table is not edited.
   17. **Create** `src/lib/support/stepEligibility.ts`
      - Change: (P04) Decide which steps apply to the current user.
      - Implementation details: (new) `isStepEligible(step, user, viewport)` and `useEligibleSteps(guide)`; reads `useAuthStore` `user.permissions` (key present = held; `OWN|TEAM|ALL|true` for scope), `user.tenantSalesWorkflow`, and `useMediaQuery`/`useIsDesktop` from `hooks/useMediaQuery.ts`; memoises on `permissionsVersion`.
      - Integration: Mirrors `hooks/usePermission.ts` and the filter in `hooks/useNavigation.ts`.
      - Removal: None: new file.
      - Verification: `stepEligibility.test.ts` table of requirement x user.
   18. **Create** `src/lib/support/progressStorage.ts`
      - Change: (P04) Versioned `localStorage` store for tour progress.
      - Implementation details: (new) `readProgress(userKey)`, `writeProgress`, key `wellness-support-progress`; every access in try/catch.
      - Integration: Used by `useTourSession` (P08) and the panel (P09). Same convention as `store/useThemeStore.ts` (`THEME_STORAGE_KEY`).
      - Removal: None: new file.
      - Verification: `progressStorage.test.ts`.
   19. **Create** `src/lib/support/supportCopy.ts`
      - Change: (P04) Lazy-load `support*.json` per language.
      - Implementation details: (new) `loadSupportCopy(ns)` using `import.meta.glob('../../locales/*/support*.json')` and `i18n.addResourceBundle`; re-runs on `i18n.on('languageChanged')`.
      - Integration: Uses the `i18n` instance from `src/i18n`; never imported by `i18n/index.ts`.
      - Removal: None: new file.
      - Verification: `supportCopy.test.ts`: copy absent before the call, present after, present after a language switch.
   20. **Modify** `src/i18n/config.ts`
      - Change: (P04) Add the six namespace names to the `NAMESPACES` tuple so `Namespace` types accept them.
      - Implementation details: Append `'support', 'supportSales', 'supportMembers', 'supportSettings', 'supportOps', 'supportAdmin'` to `NAMESPACES`.
      - Integration: Check first that nothing iterates `NAMESPACES` to require a static resource (search `NAMESPACES` usages); `i18n/index.ts` keeps its static imports unchanged.
      - Removal: No removal.
      - Verification: `i18n/defaultLanguage.test.tsx` and `orthogonality.test.tsx` still pass.
   21. **Create** `src/lib/support/stepEligibility.test.ts`
      - Change: (P04) Write first.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-09.
   22. **Create** `src/lib/support/progressStorage.test.ts`
      - Change: (P04) Write first, including throwing storage.
      - Implementation details: Vitest with a stubbed `localStorage`.
      - Removal: None: new file.
      - Verification: SUP-17.
   23. **Create** `src/lib/support/supportCopy.test.ts`
      - Change: (P04) Write first, including a grep that no static import of `support*.json` exists outside this file.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-18, SUP-19.
8. **Implementation tasks (in order):**
   1. **P01: Tour engine model and state machine (pure).**
   2. (P01) Write failing table-driven tests first (see Testing), run them and confirm they fail because `tourMachine` does not exist.
   3. (P01) Define the types. A step is `{ id, target, kind, safety, repeat?, within?, requires?, opens?, group?, use?, vars?, scope? }`; user-visible text is never stored here, only keys derived from `pageId` + `step.id` (`<pageId>.<stepId>.title|body|when|warning|disabled`). `safety` is `explain-only` (default) or `try-it`.
   4. (P01) Define machine states: `idle`, `running` (`steps`, `index`), `waiting` (`reason: loading | user-action`, with the parent index), `lost` (target vanished mid-step), `finished` (`outcome: completed | skipped | exited`).
   5. (P01) Define events: `START`, `NEXT`, `BACK`, `SKIP_TOUR`, `EXIT`, `STEPS_CHANGED(eligibleIds)`, `TARGET_PENDING`, `TARGET_READY`, `TARGET_LOST`, `TARGET_RESTORED`, `HOLD_FOR_USER(layerId)`, `LAYER_OPENED`, `LAYER_CLOSED`.
   6. (P01) Implement the reducer. Decisions encoded here: **Exit** closes now and keeps the resume point; **Skip tour** ends now and marks the guide dismissed; **Next on the last step** finishes with `completed`; **Back at index 0** is a no-op; a `STEPS_CHANGED` that removes the current step re-anchors to the nearest following eligible step (or the last one).
   7. (P01) Export selectors `progress(state) -> { index, total }` (index is the position inside the *currently eligible* list), `currentStep`, `isLast`, `canGoBack`.
   8. (P01) Refactor; confirm the module imports nothing from React, the DOM or the router.
   9. **P02: Target resolver and live DOM synchronisation.**
   10. (P02) Write failing tests first, run, confirm they fail for the expected reason (modules absent).
   11. (P02) Selector rule: a target id `a.b.c` resolves with `[data-tour~="a.b.c"]` (space-separated token match so one element can carry two ids). Ids are namespaced `<pageId>.<control>`; shell ids use the `shell.` prefix.
   12. (P02) Scope root: the topmost open layer (`[role="dialog"][aria-modal="true"]`, `[role="menu"]`, or an element carrying `data-tour-layer`) if one is open, otherwise `document` restricted to `main`. A step may force the root with `scope: "page" | "shell" | "layer"`.
   13. (P02) Status per lookup: `found` (connected, laid out, not `aria-hidden`), `disabled` (found, `disabled` or `aria-disabled="true"`), `offscreen` (found, outside the viewport), `pending` (absent but an ancestor of the expected location has `aria-busy="true"` or `data-tour-busy`), `missing`, `lost` (was found earlier for this step, now disconnected).
   14. (P02) Pick strategy for repeated ids: `first` visible in DOM order (default), `nth`, or `within` a parent target so row-level controls resolve inside the first row.
   15. (P02) Observer hub: one `MutationObserver` on `document.body` (childList, subtree, attributes limited to `data-tour`, `disabled`, `aria-disabled`, `aria-hidden`, `aria-busy`, `hidden`, `class`), callbacks batched with `requestAnimationFrame`; subscribers register a callback and get one notification per frame.
   16. (P02) `useTargetElement(spec)` subscribes to the hub, returns the element/status/rect, attaches a `ResizeObserver` to the element while it is the active target, and unsubscribes on unmount or when the spec changes.
   17. (P02) Development-only guard: when a non-`repeat` id is found on more than one *visible* element, `console.warn` once per id with both elements' tag/classes.
   18. (P02) Refactor; verify there is no module-level mutable state besides the hub singleton.
   19. **P03: Support store, page-context registry and route-coverage guard.**
   20. (P03) Write failing tests first (route walker, resolver cases, store transitions).
   21. (P03) Create `useSupportStore` following `useSalesScriptStore.ts` / `useThemeStore.ts` style: plain `create`, no persistence (persistence is P04).
   22. (P03) Create `routeMap.ts`: one entry per route pattern relative to `/:tenantSlug` (e.g. `clients/:clientId`, `settings/pricing/:tab?`) plus the `/admin*` patterns. Entries point to a page id; excluded routes carry `pageId: null` and a `reason` (print views, pre-login pages, public customer pages, 403/404). `PLANNED_PAGES` lists page ids whose guide does not exist yet.
   23. (P03) Create `pageRegistry.ts`: `resolvePageId` strips the `/:tenantSlug` prefix, tries patterns in declaration order with `matchPath`, and appends the dashboard variant (`dashboard.<variant>`). Guides are loaded through `const loaders: Record<PageId, () => Promise<PageGuide>>` using dynamic `import()` so the guides are code-split (SUP-19).
   24. (P03) Create `useSupportPage()` returning `{ pageId, scope, hasGuide, isPlanned }`; `scope` carries the active tab for pages with `:tab?` routes.
   25. (P03) Write the coverage test: walk the exported `routes` array recursively, build full patterns, and assert each is present in `routeMap` (mapped or excluded with reason); assert no `routeMap` entry refers to a route that no longer exists; assert every page id in `routeMap` is either in `loaders` or in `PLANNED_PAGES`.
   26. (P03) Add the guard test "no planned pages remain" as an `it.todo`. Each page slice deletes its own id from `PLANNED_PAGES`; the last page slice (S68) empties it and turns the `it.todo` into a real test.
   27. **P04: Step eligibility, progress persistence and lazy copy loader.**
   28. (P04) Write failing tests first.
   29. (P04) `Requirement` shape: `{ permission?: string | string[]; anyPermission?: string[]; minScope?: "OWN"|"TEAM"|"ALL"; workflow?: "SALES_PROCESS"|"LEGACY_QUOTATIONS"; viewport?: "desktop"|"mobile" }`. Semantics copy `usePermission` (a key is held if `permissions[key] !== undefined`) and `useNavigation` (workflow compare) so Support never disagrees with the menu.
   30. (P04) `useEligibleSteps(guide)` memoises on `permissionsVersion`, `tenantSalesWorkflow` and the viewport; it never reads `role`.
   31. (P04) `progressStorage`: key `wellness-support-progress`, value `{ [userId:tenantSlug]: { [pageId]: { v: guideVersion, completedAt?, dismissedAt?, lastStepId? } } }`; every access wrapped in try/catch (private mode, blocked storage); a record with an older `v` than the guide is treated as absent (guide edits re-offer the tour).
   32. (P04) `supportCopy`: `import.meta.glob("../../locales/*/support*.json")` loaders; `loadSupportCopy(ns)` adds the bundle for the active language and for `en` (fallback), and re-runs on `languageChanged` so a language switch mid-tour re-renders text without restarting.
   33. (P04) Add namespace names to `NAMESPACES` in `i18n/config.ts` only as *types* (the static import list in `i18n/index.ts` is deliberately not extended).
   34. (P04) Refactor; confirm no static import of any `support*.json` exists outside `supportCopy.ts`.
9. **Runtime behavior:**
   - (P01) Not user-visible. Defines the observable contract used by P06-P09: a tour is always in exactly one machine state, and every state has an exit.
   - (P02) Not user-visible. After this slice a hook can answer "where is the control called `clients.list.add` right now, and in what state?" at any moment.
   - (P03) Not user-visible. The store exists; no component reads it yet.
   - (P04) Not user-visible yet. After this slice a guide can say "only for holders of `deals.edit`" and have the engine drop the step, and progress survives reload.
10. **Dynamic UI considerations:**
   - (P01) `STEPS_CHANGED` is the single entry point for "the page changed under the tour": the list may grow or shrink at any time and the index is re-derived from the current step id, never kept as a bare number.
   - (P01) A step whose target is gone moves the machine to `lost` rather than throwing or advancing silently.
   - (P02) Nodes added, removed, replaced (same id, new element) and toggled disabled all produce exactly one status update per frame.
   - (P02) A replaced element is detected by identity (`element !== previous`) and re-measured; the step does not restart.
   - (P02) Duplicate registrations: tolerated for ids declared `repeat`, warned in development for all others; the resolver still returns the first visible instance so production never breaks.
   - (P02) jsdom has no layout: tests inject rects through a `getBoundingClientRect` stub helper; real geometry is verified in Playwright from P09.
   - (P03) Page id is derived, never stored: navigating changes `useSupportPage()` output on the same render as the router.
   - (P03) Variant and tab are published by pages (`setContext`) and cleared on unmount, so a stale variant cannot leak to the next page.
   - (P04) Permission or workflow change (`permissionsVersion` changes on `/auth/me` refresh) re-runs eligibility; the machine receives `STEPS_CHANGED`.
   - (P04) Viewport crossing the 768 px breakpoint re-runs eligibility for `viewport`-tagged steps.
11. **Testing requirements:**
   - (P01) SUP-03: table-driven transitions for every (state, event) pair, including NEXT on the last step, BACK on the first, EXIT then START resuming at the saved index.
   - (P01) SUP-08: `STEPS_CHANGED` removing the current step, removing an earlier step (index shifts, current step unchanged), adding a step before the current one.
   - (P01) SUP-10: `HOLD_FOR_USER` then `LAYER_OPENED` enters the nested group; `LAYER_CLOSED` returns to the parent step.
   - (P01) A source-grep test: `tourMachine.ts` and `types.ts` import neither `react`, `react-dom`, `react-router-dom` nor any `document`/`window` global.
   - (P02) SUP-06: add, remove, replace and disable a target node and assert status transitions `missing -> found -> lost -> found -> disabled`.
   - (P02) SUP-07: three `repeat` rows; remove the first; `first` pick moves to the second without a new subscription.
   - (P02) SUP-08: `aria-busy` ancestor reports `pending`, then `missing` after the configured wait using fake timers; a dev duplicate warns exactly once.
   - (P02) SUP-10 groundwork: with an open `role="dialog"` the scope root becomes the dialog and targets outside it report `missing`.
   - (P02) Unmount removes the observer callbacks (hub subscriber count returns to zero).
   - (P03) SUP-20: the route walker (every `path` in `routes` is mapped or excluded; no orphan entries).
   - (P03) SUP-01: `resolvePageId` for representative URLs: `/acme/clients`, `/acme/clients/c1`, `/acme/clients/new`, `/acme/clients/c1/edit`, `/acme/settings/pricing/zones`, `/acme/deals/d1/pricing`, `/admin/tenants`, `/acme/dashboard` with and without a variant.
   - (P03) SUP-19: loaders are functions (no guide module is imported eagerly): asserted by grepping `pageRegistry.ts` for static `guides/` imports.
   - (P03) Store: open/close panel, set/clear context, mode transitions.
   - (P04) SUP-09: each `Requirement` field with held/not-held/scope-too-low users; a user holding the permission only at `OWN` fails `minScope: "ALL"`.
   - (P04) SUP-09: switching `tenantSalesWorkflow` removes workflow-tagged steps on the next render.
   - (P04) SUP-17: round-trip, version bump invalidates, corrupt JSON ignored, `localStorage` that throws does not crash.
   - (P04) SUP-18/SUP-19: copy is not present in the i18n store until `loadSupportCopy` runs; after a language change the new language is present; a static-import grep finds none.
12. **Acceptance criteria:**
   - (P01) All machine tests pass.
   - (P01) The reducer is deterministic: the same event sequence yields the same state (asserted by replaying a recorded sequence).
   - (P01) No file in the slice touches an existing source file.
   - (P02) All resolver tests pass.
   - (P02) Importing the module has no side effect until the first subscription (no observer is created at import).
   - (P02) No existing production file is modified.
   - (P03) The coverage test passes against the real router today.
   - (P03) Adding a throw-away route to a copy of the table in the test makes the test fail with a message naming the route.
   - (P03) Only new files are added; `routes/index.tsx` is unchanged.
   - (P04) Eligibility, storage and loader tests pass.
   - (P04) `npm run check:translations` still passes (no support files exist yet).
   - (P04) Bundle check: `npm run build` output is unchanged in size apart from the three small modules (recorded in the PR).
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/store src/routes
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (1010); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S02, S03. P02-P08 import `types.ts` and drive the machine through dispatched events only. Terminology fixed for the phase: Exit = keep resume point; Skip tour = dismiss. P05 and P08 consume `useTargetElement`. Every later page slice may rely on `data-tour` tokens, `repeat`/`within` picking and the `pending/missing/lost` vocabulary. Every page slice adds exactly: one `loaders` line, flips one `routeMap` entry from planned to mapped, and removes the id from `PLANNED_PAGES`. P09 reads `useSupportPage()` to decide what the Support panel offers. P08 filters guides through `useEligibleSteps` and reads/writes progress. Page slices add copy to `support*.json` files without touching `i18n/index.ts`.
16. **Intentionally excluded from this slice:**
   - No React, DOM, router or i18n imports in this slice.
   - No resolver, overlay or store code (P02, P03, P05).
   - No guide for any page.
   - No overlay drawing (P05) and no step policy such as skipping (P08).
   - No change to any page or shared component.
   - No change to `routes/index.tsx`.
   - No guide, no launcher, no panel.
   - No persistence (P04).
   - No UI.
   - No guide copy.
   - No server-side persistence.
   - No change to `i18n/index.ts` static imports.

<a id="s02"></a>

### S02: Foundation 2: spotlight, popover, focus and keyboard, and the running host

1. **Slice id and title:** S02. Foundation 2: spotlight, popover, focus and keyboard, and the running host. Branch `support-slice-2-foundation-2-spotlight-popover-focus-and`.
2. **Scope:** P05: The visual highlight: a dimmed backdrop with a hole around the target, following scroll, resize and layout changes. Visual only: it intercepts no clicks (blocking is P14). P06: The card that explains the step: title, body, "when to use", warning and disabled-hint blocks, progress, Back/Next/Skip tour/Exit, completion state, waiting and lost-target variants, desktop placement and a mobile bottom sheet. P07: Moves and restores focus, owns tour keyboard shortcuts, announces step changes, and links the highlighted control to its explanation with a reversible `aria-describedby`. P08: The component that joins machine, resolver, eligibility, overlay, popover and accessibility into one running tour, plus scroll-into-view, missing/pending/lost handling and route-change handling. Mounted once per shell.
3. **Purpose:** Shows the user *which real control* is being explained, using the live interface rather than screenshots. Delivers SUP-03 visually. Content is purely derived from keys, so the same component renders any page's step. Delivers SUP-13 and SUP-14. `Modal`/`SlideOver` have no focus trap and `Escape` is handled by document listeners, so the tour must arbitrate explicitly instead of assuming a focus-trap library. Makes the engine run end-to-end for a fixture guide. `TenantGuard` already hosts `SalesScriptPanelHost` because every page mounts its own `AppLayout`; the Support host follows the same precedent so a tour survives page-internal re-renders.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-02, SUP-15, SUP-16, SUP-03, SUP-11, SUP-14, SUP-13, SUP-10, SUP-06, SUP-08, SUP-17, SUP-19.
5. **Prerequisites:** S01 (Foundation 1: engine, live target resolution, page registry, eligibility and copy loading). Existing functionality it builds on: `styles/tokens.css`, `components/ui/Button/Button.tsx`, `components/ui/DropdownMenu/DropdownMenu.tsx`.
6. **Production LOC estimate:** **~1010** (within the 800 to 1,200 band around the 1,000-line target): P05 SpotlightMask.tsx: four-panel dim around a rounded hole, ring, `aria-hidden`, portal to body ~90; P05 useTargetRect.ts: rect with scroll (capture) / resize / ResizeObserver, rAF-throttled ~60; P05 SpotlightMask.module.css: backdrop, ring, transitions, reduced-motion and forced-colors rules, `--z-tour` ~90; P06 TourPopover.tsx: variants step | waiting | lost | completed, progress "n of N", buttons, `role="dialog"` ~140; P06 popoverPlacement.ts: prefer side, flip, clamp with margin, arrow offset, sheet mode under 768 px ~60; P06 TourPopover.module.css: card, sheet, arrow, reduced motion ~90; P07 useTourFocus.ts: remember launcher, focus popover on step change, restore on end ~60; P07 useTourKeyboard.ts: capture-phase Esc, ArrowLeft/Right inside the card, Tab cycling, input guard ~80; P07 LiveAnnouncer.tsx: polite live region, de-duplicated messages ~40; P07 describeTarget.ts: add/restore a token in `aria-describedby` ~50; P08 SupportHost.tsx: lazy mount, composes mask + popover + announcer, portal ~60; P08 useTourSession.ts: machine + resolver + eligibility + progress; skip/wait/lost policy; route-change end ~150; P08 scrollTargetIntoView.ts: reduced-motion-aware `scrollIntoView`, sticky-header offset, sheet clearance ~30; P08 TenantGuard.tsx / SuperAdminShell.tsx mounts (`React.lazy` + `Suspense`) ~10
7. **File-Level Change Plan** (28 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Modify** `src/styles/tokens.css`
      - Change: (P05) Add `--z-tour` after `--z-tooltip: 100;` (around line 327), with a comment that it must exceed the impersonation banner's literal `z-index: 1000`.
      - Implementation details: New custom property in the same `:root` block as `--z-base` to `--z-tooltip`.
      - Integration: Used only by `SpotlightMask.module.css` and `TourPopover.module.css`.
      - Removal: No removal.
      - Verification: Visual check in Storybook story.
   2. **Create** `src/lib/support/useTargetRect.ts`
      - Change: (P05) Return the padded viewport rect of an element and keep it current.
      - Implementation details: (new) `useTargetRect(element)`: window `resize`, scroll with `capture: true, passive: true` (as `DropdownMenu` does), `ResizeObserver`, hub notifications, rAF-throttled.
      - Integration: Takes the element from `useTargetElement` (P02).
      - Removal: None: new file.
      - Verification: `SpotlightMask.test.tsx` with `mockRect`.
   3. **Create** `src/components/support/SpotlightMask.tsx`
      - Change: (P05) Render four fixed panels around a rounded hole plus a ring; portal to `document.body`; `aria-hidden`.
      - Implementation details: (new) `SpotlightMask({ element, padding })`.
      - Integration: Mounted by `SupportHost` (P08).
      - Removal: None: new file.
      - Verification: Hole equals rect; follows scroll/resize; nothing without a rect.
   4. **Create** `src/components/support/SpotlightMask.module.css`
      - Change: (P05) Panels, ring (2 px, existing focus colour token), transitions only under `prefers-reduced-motion: no-preference`, `@media (forced-colors: active)` rules, `z-index: var(--z-tour)`.
      - Implementation details: CSS module, same conventions as `Tooltip.module.css` (which already has a reduced-motion block).
      - Integration: Imported by the component.
      - Removal: None: new file.
      - Verification: Story and test assert class names.
   5. **Create** `src/components/support/SpotlightMask.test.tsx`
      - Change: (P05) Write first.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-15, SUP-16.
   6. **Create** `src/components/support/SpotlightMask.stories.tsx`
      - Change: (P05) Story with a fixed target, a11y addon enabled, following the `*.stories.tsx` convention.
      - Implementation details: Storybook CSF.
      - Removal: None: new file.
      - Verification: Storybook a11y check.
   7. **Create** `src/lib/support/popoverPlacement.ts`
      - Change: (P06) Compute position, side, arrow offset or sheet mode.
      - Implementation details: (new) `placePopover(targetRect, size, viewport, preferred)`; constants `GAP = 6`, `MARGIN = 8` as in `DropdownMenu.tsx`; `mode: 'sheet'` below 768 px.
      - Integration: Called by `TourPopover`. `DropdownMenu` is not refactored.
      - Removal: None: new file.
      - Verification: `popoverPlacement.test.ts`.
   8. **Create** `src/components/support/TourPopover.tsx`
      - Change: (P06) Render the step card and its variants.
      - Implementation details: (new) `TourPopover` props: step, copy, index, total, status, handlers; `role="dialog"`, `aria-modal="false"`, ids from `useId`; reuses `Button` from `components/ui/Button/Button.tsx`.
      - Integration: Receives data from `useTourSession` (P08).
      - Removal: None: new file.
      - Verification: `TourPopover.test.tsx` and stories.
   9. **Create** `src/components/support/TourPopover.module.css`
      - Change: (P06) Card, arrow, sheet, reduced-motion.
      - Implementation details: CSS module.
      - Removal: None: new file.
      - Verification: Stories.
   10. **Create** `src/lib/support/popoverPlacement.test.ts`
      - Change: (P06) Write first (fits below, flips above, clamps, sheet).
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-15.
   11. **Create** `src/components/support/TourPopover.test.tsx`
      - Change: (P06) Write first (buttons, first/last step, variants, aria ids).
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-03, SUP-14.
   12. **Create** `src/components/support/TourPopover.stories.tsx`
      - Change: (P06) One story per variant: step, waiting, lost, completed, sheet.
      - Implementation details: Storybook CSF.
      - Removal: None: new file.
      - Verification: a11y addon.
   13. **Create** `src/lib/support/useTourFocus.ts`
      - Change: (P07) Remember `document.activeElement` on start, focus the popover heading per step, restore on end (fall back to `main`).
      - Implementation details: (new) `useTourFocus(active, headingRef)`.
      - Integration: Wired in `useTourSession`/`SupportHost` (P08).
      - Removal: None: new file.
      - Verification: `useTourFocus.test.tsx`.
   14. **Create** `src/lib/support/useTourKeyboard.ts`
      - Change: (P07) One capture-phase `keydown` listener while a tour runs: Esc exits and `stopPropagation()` (not while `waiting`), arrows move only inside the popover and never in inputs, Tab cycles inside the popover.
      - Implementation details: (new) `useTourKeyboard({ running, waiting, onExit, onNext, onBack, popoverRef })`.
      - Integration: Must run before the document-level Escape listeners in `Modal.tsx` and `SlideOver.tsx` (they register on `document` in the bubble phase).
      - Removal: None: new file.
      - Verification: `useTourKeyboard.test.tsx` including a real `Modal` behind the tour.
   15. **Create** `src/components/support/LiveAnnouncer.tsx`
      - Change: (P07) `role="status"` region with de-duplicated messages.
      - Implementation details: (new) `LiveAnnouncer`, `announce(message)` through a small store or context.
      - Integration: Mounted inside `SupportHost`.
      - Removal: None: new file.
      - Verification: Test text and de-duplication.
   16. **Create** `src/lib/support/describeTarget.ts`
      - Change: (P07) Append the body id to the target's `aria-describedby` and restore the exact previous value.
      - Implementation details: (new) `describeTarget(element, id)` returning a cleanup.
      - Integration: Called by the host per step.
      - Removal: None: new file.
      - Verification: `describeTarget.test.ts`.
   17. **Create** `src/lib/support/useTourFocus.test.tsx`
      - Change: (P07) Write first.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-13.
   18. **Create** `src/lib/support/useTourKeyboard.test.tsx`
      - Change: (P07) Write first.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-13.
   19. **Create** `src/lib/support/describeTarget.test.ts`
      - Change: (P07) Write first.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-14.
   20. **Leave unchanged** `src/components/ui/Modal/Modal.tsx`
      - Change: (P07) Read only: confirms the Escape listener is on `document` (`handleEscape`) and there is no focus trap.
   21. **Leave unchanged** `src/components/ui/SlideOver/SlideOver.tsx`
      - Change: (P07) Read only: same listener pattern.
   22. **Create** `src/lib/support/useTourSession.ts`
      - Change: (P08) The orchestration hook.
      - Implementation details: (new) `useTourSession()`: `useReducer(tourReducer)`, `useEligibleSteps`, `useTargetElement`, `loadGuide`, `scrollTargetIntoView`, `readProgress/writeProgress`, route-change end via `useSupportPage`.
      - Integration: Reads and writes `useSupportStore`.
      - Removal: None: new file.
      - Verification: `useTourSession.test.tsx` with a fixture guide.
   23. **Create** `src/lib/support/scrollTargetIntoView.ts`
      - Change: (P08) Scroll an element into view, honouring reduced motion and leaving room for the sticky header (`--z-header` bar) and the mobile sheet.
      - Implementation details: (new) `scrollTargetIntoView(el, { sheetHeight })`.
      - Integration: Called by `useTourSession`.
      - Removal: None: new file.
      - Verification: Unit test.
   24. **Create** `src/components/support/SupportHost.tsx`
      - Change: (P08) Compose `SpotlightMask`, `TourPopover`, `LiveAnnouncer`; render null with no session.
      - Implementation details: (new) `SupportHost`; exported through `React.lazy` wrapper `SupportHostLazy` (new).
      - Integration: Mounted by `TenantGuard` and `SuperAdminShell`.
      - Removal: None: new file.
      - Verification: `SupportHost.test.tsx`.
   25. **Modify** `src/routes/TenantGuard.tsx`
      - Change: (P08) Render the lazy host next to `<SalesScriptPanelHost />` inside the existing fragment, wrapped in `Suspense fallback={null}`.
      - Implementation details: Import `SupportHostLazy`; add `<Suspense fallback={null}><SupportHostLazy /></Suspense>` after `<SalesScriptPanelHost />`.
      - Integration: Same reason the sales script panel lives here: the route stays mounted while pages change.
      - Removal: No removal.
      - Verification: `routes/guards.test.tsx` still passes; a new assertion that the host mounts under a tenant route.
   26. **Modify** `src/pages/shell/SuperAdminShell.tsx`
      - Change: (P08) Render the same lazy host once, next to the existing `AppLayout` return, so all six `/admin*` routes get it.
      - Implementation details: Wrap the returned `AppLayout` in a fragment and add the host.
      - Integration: The shell is shared by `/admin`, `/admin/dashboard`, `/admin/tenants`, `/admin/people`, `/admin/setting`, `/admin/profile` (`routes/index.tsx` lines 843-912).
      - Removal: No removal.
      - Verification: A shell test (extend `SuperAdminShell.stories.tsx` is not enough): add a small test in `SupportHost.test.tsx`.
   27. **Create** `src/lib/support/useTourSession.test.tsx`
      - Change: (P08) Write first: fixture tour, missing/pending/lost/disabled/replaced target, route change, Exit then resume, cleanup of listeners and attributes.
      - Implementation details: RTL + fake timers.
      - Removal: None: new file.
      - Verification: SUP-02, 03, 06, 08, 17, 19.
   28. **Create** `src/components/support/SupportHost.test.tsx`
      - Change: (P08) Write first: renders null with no session and registers zero observers.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-19.
8. **Implementation tasks (in order):**
   1. **P05: Spotlight overlay layer.**
   2. (P05) Write failing tests first (rect stubbed).
   3. (P05) Add `--z-tour` to `tokens.css` above the banner literal; document the reason in a comment, as other tokens do.
   4. (P05) `useTargetRect(element)` returns the padded rect and re-measures on window resize, any ancestor scroll (capture phase, as `DropdownMenu` does), element resize, and hub notifications.
   5. (P05) `SpotlightMask` renders four fixed panels (top, bottom, left, right of the hole) rather than a `clip-path`, so page scrolling with the wheel keeps working; the ring is a 2 px outline using the existing focus colour token with an offset.
   6. (P05) CSS: transition on position/size only when `prefers-reduced-motion: no-preference`; under `forced-colors: active` the dim is dropped and the ring uses `Highlight`/`CanvasText` so the target stays identifiable.
   7. (P05) Story with a fixed target, following the repo's UI-component convention (`*.stories.tsx`, a11y addon).
   8. **P06: Tour popover: content, progress and navigation controls.**
   9. (P06) Write failing tests first.
   10. (P06) `popoverPlacement(targetRect, popoverSize, viewport, preferred)` returns `{ top, left, side, arrow }`: prefers the requested side, flips when it does not fit, clamps within an 8 px margin (same constants as `DropdownMenu`), and returns `mode: "sheet"` below 768 px.
   11. (P06) `TourPopover` props: `{ step, copy, index, total, status, onNext, onBack, onSkip, onExit, onFinish }`. Renders `role="dialog"` with `aria-modal="false"`, `aria-labelledby` (title id from `useId`) and `aria-describedby` (body id).
   12. (P06) Sections: title; body; "When to use it" (only if the key exists); warning callout for steps flagged destructive (icon plus text, not colour alone); disabled hint appended when `status === "disabled"`.
   13. (P06) Navigation: Back (hidden on the first step), Next (becomes "Finish" on the last), "Skip tour", "Exit". Progress is shown as text ("Step 3 of 8") and as a `progress`-role bar with `aria-valuenow`.
   14. (P06) Variants: `waiting` ("Loading this part of the page…"), `lost` ("This item changed or is no longer on the page" with Next/Back/Exit), `completed` ("You're done" with Replay and Close).
   15. (P06) Under 768 px render as a bottom sheet with `scroll-margin-bottom` support so the highlighted target is not covered (the host passes the sheet height).
   16. (P06) Story for each variant.
   17. **P07: Focus management, keyboard and screen-reader announcements.**
   18. (P07) Write failing tests first.
   19. (P07) `useTourFocus`: store `document.activeElement` at start; on each step focus the popover heading (`tabIndex=-1`); on end restore to the stored element if still connected, else to `main`.
   20. (P07) `useTourKeyboard`: one `keydown` listener on `document` in the capture phase while a tour is running. `Escape` -> Exit and `stopPropagation()` so a `Modal`/`SlideOver` behind it does not also close — **except** in `waiting: user-action` where Escape belongs to the app layer the user opened (documented decision; see risk R7). ArrowRight/ArrowLeft act as Next/Back only when focus is inside the popover and never when the focus is in an input, textarea, select or contenteditable.
   21. (P07) Tab cycles within the popover's buttons (plus the "Go to the control" button on `try-it` steps) without trapping the page when the tour is in `waiting`.
   22. (P07) `LiveAnnouncer`: `role="status"` region; announces "Step n of N: <title>", "Skipped: <title> is not available right now", "Tour closed", and the completion message; identical consecutive messages are suppressed.
   23. (P07) `describeTarget(el, id)` appends the body id to the element's existing `aria-describedby` and restores the exact previous value on cleanup (never clobbers an existing description).
   24. **P08: Support host: session orchestration and mounting.**
   25. (P08) Write failing tests first using a fixture guide registered through the test seam of `pageRegistry` (no real page guide exists yet).
   26. (P08) `useTourSession` policy, as testable functions: on entering a step resolve its target; `found/disabled` -> show; `offscreen` -> `scrollTargetIntoView` then show; `pending` -> `waiting(loading)` for at most 4 s; `missing` (or pending timeout) -> announce "Skipped" and advance (or finish if it was the last); `lost` -> machine `lost`, and if the same id reappears within the session the step is restored.
   27. (P08) Route change: when `useSupportPage().pageId` changes while a tour runs, end the tour with outcome `exited`, save `lastStepId`, announce "Tour closed because you moved to another page".
   28. (P08) Persist: `completed` on finish, `dismissed` on Skip tour, `lastStepId` on Exit.
   29. (P08) `SupportHost` is `React.lazy` + `Suspense fallback={null}` and renders nothing until the store says a session exists, so the cost for users who never open Support is the lazy chunk reference (SUP-19).
   30. (P08) Mount in `TenantGuard` next to `SalesScriptPanelHost`, and in `SuperAdminShell` (which all six `/admin*` routes share, so `routes/index.tsx` stays unchanged).
   31. (P08) Wire `useTourFocus`, `useTourKeyboard`, `LiveAnnouncer`, `describeTarget`.
9. **Runtime behavior:**
   - (P05) A highlighted hole follows the target as the page scrolls or resizes. With reduced motion the hole jumps instead of gliding. With no target nothing renders.
   - (P06) Popover sits beside the highlighted control (desktop) or docks at the bottom (phone). The user can always Exit. Last step shows Finish, then a completion card.
   - (P07) Screen-reader users hear the step title and position; keyboard users can drive the whole tour and always get back to where they started. Escape exits the tour without closing an unrelated dialog.
   - (P08) With the fixture guide started from the store: spotlight and popover appear on the first eligible step, Next/Back work, a missing step is skipped with an announcement, a tour left by navigation closes cleanly, and normal use resumes (no leftover overlay, listeners, attributes or focus changes).
10. **Dynamic UI considerations:**
   - (P05) If the target moves (layout shift, sidebar open, table re-render) the hole follows within one frame.
   - (P05) If the target is replaced by a new node with the same id the hole re-binds without flicker.
   - (P06) Total and index come from the currently eligible list, so "Step 3 of 8" can change to "Step 3 of 7" when a step is dropped; the live region (P07) announces the change.
   - (P06) If the target is lost mid-step the popover switches to the `lost` variant in place; it does not unmount, so focus is not dropped.
   - (P07) When the eligible list shrinks mid-tour the announcer says so once.
   - (P07) When the target element is replaced, `describeTarget` moves the description to the new node.
   - (P08) This slice is where "target disappears, becomes disabled, moves, or is replaced while a tour is active" is first proven end to end with an integration test that mutates a fixture DOM during a running tour.
   - (P08) Eligible list changes (permission/workflow) re-enter via `STEPS_CHANGED`.
11. **Testing requirements:**
   - (P05) SUP-02/15: hole equals padded rect; updates on scroll and resize events; renders nothing without a rect.
   - (P05) SUP-16: reduced-motion media query removes the transition class (matchMedia stub); forced-colors class present.
   - (P05) The panels have `aria-hidden="true"` and `pointer-events: none`.
   - (P06) SUP-03: every button fires its callback; Back hidden on first; Finish on last; completion variant offers Replay.
   - (P06) SUP-14: `aria-labelledby/describedby` resolve to existing nodes; progress has `aria-valuenow/max`.
   - (P06) SUP-15: placement unit tests (fits below, flips above, clamps left/right, returns sheet under 768 px).
   - (P06) SUP-11: waiting and lost variants render the right text and still expose Exit.
   - (P07) SUP-13: Esc exits and restores focus to the launcher; Esc in `waiting` is not intercepted; arrows ignored while typing in an input.
   - (P07) SUP-14: announcer text for next/back/skip-missing/finish; duplicate suppression; described-by add and exact restore, including when an existing value is present.
   - (P07) SUP-10: with a `Modal` open behind the tour, Esc closes only the tour (the modal's `onClose` is not called).
   - (P08) SUP-02/03: a three-step fixture runs from start to completion; progress persisted as completed.
   - (P08) SUP-06/08: remove step 2's target before reaching it (skipped + announced), remove the current target (lost variant), re-add it (restored), disable it (hint shown), replace it (spotlight follows).
   - (P08) SUP-17: Exit then restart resumes at `lastStepId`; Skip tour marks dismissed.
   - (P08) SUP-19: with no session, `SupportHost` renders null and registers zero observers/listeners.
   - (P08) Cleanup test: after finish the DOM has no `aria-describedby` residue, no overlay nodes and no document listeners from the tour.
12. **Acceptance criteria:**
   - (P05) Component tests pass; story renders in Storybook with no a11y violations.
   - (P05) The overlay never changes layout (no scrollbars appear/disappear when it mounts).
   - (P06) Component and placement tests pass.
   - (P06) Stories for all variants pass the Storybook a11y check.
   - (P06) Keyboard order inside the card is Back, Next/Finish, Skip tour, Exit (asserted).
   - (P07) Tests pass.
   - (P07) Manual keyboard pass recorded in the PR: start, Next, Back, Esc, restore.
   - (P07) No global shortcut is registered while no tour runs (asserted by listener count).
   - (P08) Integration tests pass.
   - (P08) Playwright is not required yet (no user-visible launcher until P09).
   - (P08) `routes/index.tsx` is unmodified.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/styles src/components/ui/Button src/components/ui/DropdownMenu src/components/ui/Modal src/components/ui/SlideOver src/routes src/pages/shell src/components/panels/SalesScriptPanel
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (1010); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S03, S04. P08 mounts the mask with the active target element. P14 adds the interaction guard; the mask itself stays purely visual. P07 adds focus and keyboard behaviour around this component. P13 reuses the `waiting` variant for "open the dialog to continue". P08 wires these hooks into the host. P13 relies on the Esc arbitration rule. P09 only needs to call `useSupportStore.getState().startTour()` to start a real tour. P13 and P14 extend `useTourSession` rather than replacing it.
16. **Intentionally excluded from this slice:**
   - The mask intercepts no clicks; blocking is P14.
   - No popover (P06).
   - No focus or keyboard handling beyond button order (P07).
   - No nested-layer waiting copy beyond the variant shell (P13).
   - No Modal/SlideOver changes: Esc is arbitrated from the tour side only.
   - No page work.
   - No launcher or panel (P09).
   - No nested-layer logic (P13) and no read-only guard (P14).
   - No real page guide: tests use a fixture guide.

<a id="s03"></a>

### S03: Foundation 3: launcher and panel, shared-component annotations, shared guidance and the shell guide

1. **Slice id and title:** S03. Foundation 3: launcher and panel, shared-component annotations, shared guidance and the shell guide. Branch `support-slice-3-foundation-3-launcher-and-panel-shared`.
2. **Scope:** P09: Replaces the two dead Support entry points with one working launcher, and adds the panel that offers page-specific actions. Adds the Playwright `support` project and a first end-to-end case. P10: A tiny typed helper `tourProps(id, opts)` and `tourId` props on the shared components that cannot currently carry a `data-tour` attribute on the right element. P11: Reusable copy and behaviour for control families that appear on many pages, plus the typed helpers and lint that every page guide uses. P12: Annotates the header and sidebar that every page shares, lets the tour open the mobile sidebar and mobile search bar when a step needs them (restoring them afterwards), and provides the short shell guide that page tours can include.
3. **Purpose:** Delivers SUP-01. Two controls already pretend to be Support and do nothing: the header `HelpCircle` button (no `onClick`) and the sidebar "Support" item (`href="#support"` with `preventDefault`). Both become real, and neither is left dead. `Button`, `TextInput`, `SelectInput` already spread rest props onto their element, but `DataTable` rows/headers, `Tabs`, `Pagination`, `DropdownMenu` items, `Modal`, `SlideOver`, `ConfirmDialog`, `Card`/`KpiTile` and the field containers do not. Without this, every page would hand-roll wrappers. Satisfies "shared UI components should have reusable guidance" and "do not duplicate common infrastructure". A page says `use: "shared.pagination"` and gets the explanation, safety class and disabled hint, with its own subject interpolated. The shell is on every page but is not a page. It is guided once here. The sidebar is off-canvas on phones (`isSidebarOpen` state in `AppLayout`), so a nav step would otherwise point at an invisible element.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-01, SUP-03, SUP-14, SUP-15, SUP-17, SUP-18, SUP-05, SUP-07, SUP-12, SUP-02, SUP-09.
5. **Prerequisites:** S02 (Foundation 2: spotlight, popover, focus and keyboard, and the running host); S01 (Foundation 1: engine, live target resolution, page registry, eligibility and copy loading). Existing functionality it builds on: `components/layout/AppLayout/AppLayout.tsx`, `components/layout/Sidebar/Sidebar.tsx`, `locales/en/common.json`.
6. **Production LOC estimate:** **~955** (within the 800 to 1,200 band around the 1,000-line target): P09 SupportLauncher.tsx: icon button + `openPanel`, `aria-expanded`, shared by header and sidebar ~40; P09 SupportPanel.tsx: title of current page/tab, actions, status line, no-guide and planned-page states, Esc/outside close, close on route change ~130; P09 SupportPanel.module.css: anchored popover, bottom sheet under 768 px, reduced motion ~80; P09 AppLayout.tsx / Sidebar.tsx / playwright.config.ts edits ~20; P10 tourProps.ts: builds `{ "data-tour": id, "data-tour-repeat"?: true }`, dev check of id format `^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9-]*)+$` ~30; P10 DataTable: `rowTourId`, `tourId` on wrapper/header/sort/empty/loading; both desktop table and mobile card layouts ~45; P10 Tabs / Pagination / Card / KPICard: `tourId` (+ per-tab ids `<id>.tab.<tab>`) ~35; P10 DropdownMenu item `tourId`; Modal / SlideOver / ConfirmDialog `tourId` on the dialog root ~40; P10 TextInput / SelectInput: `tourId` on the field container (label + control), not only the `<input>` ~25; P11 sharedGuidance.ts: ~16 shared control kinds (search, filter select, date range, status chips, sortable header, pagination, row-actions menu, status badge, tabs, bulk select, export, refresh, back link, save/discard bar, confirm dialog, empty-state action) ~100; P11 defineGuide.ts: typed `definePageGuide`, key derivation, `resolveStepCopy` with `{{subject}}` interpolation and runtime vars (e.g. dialog title read from `aria-labelledby`) ~60; P11 guideLint.ts: unique ids, `repeat` declared for rows, destructive => explain-only, `try-it` only for openers/tabs/filters/fields, keys present in en and sq, shell ids not reused ~60; P11 stepFactories.ts: `listPageSteps`, `formPageSteps`, `detailHeaderSteps` (used by 10+, 6+ and 8+ pages respectively) ~60; P12 AppLayout / Sidebar / bell / script button / theme toggle annotations ~30; P12 layoutAdapters.ts: register/unregister `{ open, close, isOpen }` per area (`sidebar`, `mobileSearch`), restore-on-exit snapshot ~70; P12 guides/shell.ts: ~10 steps (brand/menu button, sidebar nav region, one exemplar nav item, theme, notifications, sales script (permission), Support, profile menu, log out) ~90; P12 AppLayout effect registering adapters; step `needs` handling in `useTourSession` ~40
7. **File-Level Change Plan** (41 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/components/support/SupportLauncher.tsx`
      - Change: (P09) Icon button with `aria-haspopup="dialog"` and `aria-expanded`, opening the panel.
      - Implementation details: (new) `SupportLauncher({ className })`.
      - Integration: Rendered by `AppLayout`.
      - Removal: None: new file.
      - Verification: Panel test + AppLayout test.
   2. **Create** `src/components/support/SupportPanel.tsx`
      - Change: (P09) Anchored panel (bottom sheet under 768 px): heading for the current page or tab, Tour this page / this tab, Resume (step n of N), Replay, "no help yet" for planned pages, error with Retry if the chunk fails.
      - Implementation details: (new) `SupportPanel`; uses `useSupportPage`, `useSupportStore`, `readProgress`, `loadSupportCopy('support')`, `useTranslation('support')`.
      - Integration: Closes on route change, outside click, Escape; focus returns to the launcher.
      - Removal: None: new file.
      - Verification: `SupportPanel.test.tsx`; Playwright case.
   3. **Create** `src/components/support/SupportPanel.module.css`
      - Change: (P09) Panel and sheet styles with reduced-motion.
      - Implementation details: CSS module.
      - Removal: None: new file.
      - Verification: Story/visual.
   4. **Modify** `src/components/layout/AppLayout/AppLayout.tsx`
      - Change: (P09) Replace the dead help button with `<SupportLauncher className={styles.iconBtn} />`. Then, (P12) Annotate: menu button `shell.menu` (the `Menu` button with `aria-label={t('header.openMenu')}`), profile `DropdownMenu` trigger `shell.profile`, the Support launcher `shell.support`; register the sidebar and mobile-search adapters in a `useEffect` using `setIsSidebarOpen` and `setIsMobileSearchOpen`.
      - Implementation details: Locate the `<button className={`${styles.iconBtn} ${styles.helpBtn}`} aria-label={t('header.help')}>` containing `<HelpCircle size={20} />`; keep the `helpBtn` class so existing layout rules still apply; import `SupportLauncher`. Existing state `isSidebarOpen`, `isMobileSearchOpen` stays where it is.
      - Integration: The button currently has no `onClick`; the launcher calls `useSupportStore.getState().openPanel()`. Adapters are read by `useTourSession` through `layoutAdapters.ts`.
      - Removal: Remove only the bare `<button … helpBtn …>` element. Safe because it has no handler and no other code references it (`helpBtn` is a CSS class in `AppLayout.module.css`, which stays).
      - Verification: Extend `AppLayout.test.tsx`: the Help button opens the panel; existing tests unchanged. Extend `AppLayout.test.tsx`.
   5. **Modify** `src/components/layout/Sidebar/Sidebar.tsx`
      - Change: (P09) Make the bottom "Support" item open the panel and close the mobile sidebar. Then, (P12) Annotate: nav `<nav>` `shell.nav`, each nav `<a>` `shell.nav.item` (repeat), org section `shell.org`, Support item `shell.support.nav`, Log out `shell.logout`. Do not annotate the "New entry" `Button`.
      - Implementation details: Locate the `<a className={styles.navItem} href="#support" onClick={(e) => e.preventDefault()}>`; replace the handler with `useSupportStore.getState().openPanel(); onClose?.()`. The `navItems.map` renders the repeated anchors.
      - Integration: The component already receives `onClose` and reads `useAuthStore` directly, so reading a store is consistent. Items are already filtered by `useNavigation` (permission and workflow), so the DOM reflects the user.
      - Removal: Remove the no-op `preventDefault`-only handler: safe because nothing else listens to `#support` (searched `src`).
      - Verification: Extend `Sidebar.test.tsx`: clicking Support opens the panel. Extend `Sidebar.test.tsx`.
   6. **Modify** `src/i18n/config.ts`
      - Change: (P09) Nothing further: the namespace names were added in P04.
      - Removal: No removal.
   7. **Create** `src/locales/en/support.json`
      - Change: (P09) Panel strings: title, tourThisPage, tourThisTab, resume, replay, noHelpYet, loading, retry, close, completed, stepOfN. Then, (P11) Add the `shared.*` keys for every shared kind (title, body, when, disabled).
      - Implementation details: JSON. JSON.
      - Integration: Loaded by `loadSupportCopy`.
      - Removal: None: new file.
      - Verification: `check:translations`. `check:translations`.
   8. **Create** `src/locales/sq/support.json`
      - Change: (P09) Albanian equivalents of every key above (required by `check-translations.mjs`). Then, (P11) Albanian equivalents.
      - Implementation details: JSON. JSON.
      - Removal: None: new file.
      - Verification: `check:translations`. `check:translations`.
   9. **Modify** `playwright.config.ts`
      - Change: (P09) Add project `support` (desktop Chrome, `dependencies: ['setup']`, `testMatch: /support\.spec\.ts/`) after `desktop`; add `/support\.spec\.ts/` to the `chromium` project `testIgnore`.
      - Implementation details: Entry in the `projects` array beside `desktop`.
      - Integration: Same `setup` dependency and `ADMIN_STATE` session as `desktop`.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support` lists the spec.
   10. **Create** `tests/e2e/support.spec.ts`
      - Change: (P09) Table-driven spec; first row opens Support on the dashboard and asserts the panel; skipped without `E2E_ADMIN_PASSWORD` like `mobile360.spec.ts`.
      - Implementation details: `test.describe` with a `PAGES` array.
      - Integration: Uses `./support/sessions` (`ADMIN_STATE`).
      - Removal: None: new file.
      - Verification: The case itself.
   11. **Modify** `tests/e2e/mobile360.spec.ts`
      - Change: (P09) Add one case: open Support at 360 px, assert no horizontal overflow using the existing `expectNoHorizontalOverflow(page, screen)`.
      - Implementation details: Add inside the existing `test.describe` after the `screens` loop.
      - Integration: Reuses the helper at the top of the file.
      - Removal: No removal.
      - Verification: CI `e2e-mobile` job.
   12. **Modify** `.github/workflows/ci.yml`
      - Change: (P09) In the `e2e-mobile` job, add a step `npx playwright test --project=support` next to the mobile-360 step (the step named "Every M1, M2 and M3 screen at 360 px").
      - Implementation details: Copy the existing step's `working-directory: frontend`.
      - Integration: Same job, same seeded backend.
      - Removal: No removal.
      - Verification: CI run.
   13. **Create** `src/lib/support/tourProps.ts`
      - Change: (P10) Typed attribute helper.
      - Implementation details: (new) `tourProps(id, { repeat?, kind? })` returning `{ 'data-tour': id, 'data-tour-repeat'?: '' , 'data-tour-kind'?: kind }`; dev-only format check of the id.
      - Integration: Spread onto `Button`, `TextInput` etc. (they spread rest props) or onto plain elements.
      - Removal: None: new file.
      - Verification: `tourProps.test.ts`.
   14. **Create** `src/lib/support/tourProps.test.ts`
      - Change: (P10) Write first.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: Id grammar.
   15. **Modify** `src/components/ui/DataTable/DataTable.tsx`
      - Change: (P10) Add optional `tourId` and `rowTourId` to `DataTableProps<T>`; apply `data-tour={rowTourId}` + `data-tour-repeat` on both the desktop `<tr key={key} …>` and the mobile card `div` (the one with `role={isInteractive ? 'button' : undefined}`); `<id>` on the wrapper `div`, `<id>.empty` on the `styles.emptyState` div, `<id>.loading` + `aria-busy="true"` on skeleton rows, `<id>.sort.<column.id>` on sortable header buttons.
      - Implementation details: The component already renders exactly one layout (`useIsDesktop()`); both branches get the attribute.
      - Integration: Existing `DataTable.stories.tsx`; new test file below.
      - Removal: No removal: purely additive.
      - Verification: No removal.
   16. **Create** `src/components/ui/DataTable/DataTable.test.tsx`
      - Change: (P10) Write first: 3 then 20 rows share one id in table and card layouts; omitted prop adds nothing.
      - Implementation details: RTL with `useIsDesktop` mocked.
      - Removal: None: new file.
      - Verification: SUP-07.
   17. **Modify** `src/components/ui/Tabs/Tabs.tsx`
      - Change: (P10) Add `tourId?: string` to `TabsProps`; put `data-tour={tourId}` on the `role="tablist"` div and `data-tour={`${tourId}.tab.${tab.id}`}` on each tab button.
      - Implementation details: Edit the returned JSX in `Tabs`.
      - Integration: Does not touch the existing `id={`${baseId}-tab-${tab.id}`}` ids.
      - Removal: No removal.
      - Verification: New `Tabs.test.tsx`.
   18. **Create** `src/components/ui/Tabs/Tabs.test.tsx`
      - Change: (P10) Write first.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-05.
   19. **Modify** `src/components/ui/Pagination/Pagination.tsx`
      - Change: (P10) Add `tourId?: string` to `PaginationProps`; apply to the root `<nav>`.
      - Implementation details: Edit the returned `nav`.
      - Removal: No removal.
      - Verification: New test.
   20. **Modify** `src/components/ui/DropdownMenu/DropdownMenu.tsx`
      - Change: (P10) Add `tourId?: string` to `DropdownMenuItemType`; render `data-tour` on the item element built from `items` (near line 222-262); add optional `menuTourId` prop on the menu root.
      - Implementation details: The menu is portalled via `createPortal`; items need their own attribute.
      - Integration: Portal content is outside the trigger, hence per-item ids.
      - Removal: No removal.
      - Verification: New test with the real component.
   21. **Modify** `src/components/ui/Modal/Modal.tsx`
      - Change: (P10) Add `tourId?: string`; set `data-tour={tourId}` and `data-tour-layer` on the `motion.div` with `role="dialog"`.
      - Implementation details: Edit the overlay element.
      - Integration: P13 uses `data-tour-layer` to scope.
      - Removal: No removal.
      - Verification: New test.
   22. **Modify** `src/components/ui/SlideOver/SlideOver.tsx`
      - Change: (P10) Same on the `motion.div className={styles.panel}`; do not change `aria-labelledby="slideover-title"` (unrelated).
      - Implementation details: Edit the panel element.
      - Removal: No removal.
      - Verification: New test.
   23. **Modify** `src/components/ui/ConfirmDialog/ConfirmDialog.tsx`
      - Change: (P10) Add `tourId?: string` and forward it to the `Modal` it renders.
      - Implementation details: Pass-through prop.
      - Integration: Reuses Modal change.
      - Removal: No removal.
      - Verification: New test.
   24. **Modify** `src/components/ui/TextInput/TextInput.tsx`
      - Change: (P10) Add `tourId?: string`; put `data-tour` on the container `div className={`${styles.container} ${className}`}`.
      - Implementation details: Destructure `tourId` so it does not reach `<input {...props}>`.
      - Integration: Label, control and message end up inside the highlight.
      - Removal: No removal.
      - Verification: New test.
   25. **Modify** `src/components/ui/SelectInput/SelectInput.tsx`
      - Change: (P10) Same as `TextInput`.
      - Implementation details: Container div around the `<select {...props}>`.
      - Removal: No removal.
      - Verification: New test.
   26. **Modify** `src/components/ui/KPICard/KPICard.tsx`
      - Change: (P10) Add `tourId?: string` on the root; the card is used by `InventoryList`, `WarehouseList`, `SuperAdminDashboard`, `BusinessOwnerDashboard` and `StaffDashboard` (found by searching imports).
      - Implementation details: Root of the component (wraps `Card`, which spreads props).
      - Removal: No removal.
      - Verification: New test.
   27. **Leave unchanged** `src/components/ui/Card/Card.tsx`
      - Change: (P10) Already spreads `...props` onto its `div`; `data-tour` works without a change.
   28. **Leave unchanged** `src/components/ui/Button/Button.tsx`
      - Change: (P10) Already spreads `...props` onto the `button`.
   29. **Create** `src/lib/support/sharedGuidance.ts`
      - Change: (P11) Registry of reusable control kinds.
      - Implementation details: (new) `SHARED: Record<string, { kind, safety, warning?, disabledHint? }>` for search, filterSelect, dateRange, statusChips, sortHeader, pagination, rowMenu, statusBadge, tabs, bulkSelect, export, refresh, backLink, saveBar, confirmDialog, emptyAction.
      - Integration: Steps reference it with `use: 'shared.<kind>'`.
      - Removal: None: new file.
      - Verification: `sharedGuidance.test.ts`.
   30. **Create** `src/lib/support/defineGuide.ts`
      - Change: (P11) Typed guide builder and copy resolution.
      - Implementation details: (new) `definePageGuide(config)`, `copyKeys(pageId, stepId)`, `resolveStepCopy(step, t, vars)` with `{{subject}}` interpolation and runtime vars (for example the visible dialog title from `aria-labelledby`).
      - Integration: Used by every guide file.
      - Removal: None: new file.
      - Verification: Tests in the lint file.
   31. **Create** `src/lib/support/guideLint.ts`
      - Change: (P11) Lint a guide: unique step ids, valid target ids, `repeat` for `.row`/`.card`/`.item` targets, `warning` implies explain-only, `try-it` only for opener/tab/filter/field/menu kinds, every derived key present in `en` and `sq`.
      - Implementation details: (new) `lintGuide(guide)` and `assertGuideIntegrity(guide)` (throws).
      - Integration: Called by each page test and by a dev startup check.
      - Removal: None: new file.
      - Verification: `guideLint.test.ts` with five deliberately broken guides.
   32. **Create** `src/lib/support/stepFactories.ts`
      - Change: (P11) Step families used by 10+, 6+ and 8+ pages.
      - Implementation details: (new) `listPageSteps(prefix, opts)`, `formPageSteps(prefix, opts)`, `detailHeaderSteps(prefix, opts)`.
      - Integration: Pages import and override.
      - Removal: None: new file.
      - Verification: Factory snapshot tests.
   33. **Create** `src/lib/support/sharedGuidance.test.ts`
      - Change: (P11) Write first.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-05, SUP-18.
   34. **Create** `src/lib/support/guideLint.test.ts`
      - Change: (P11) Write first.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-07, SUP-12.
   35. **Modify** `src/components/notifications/NotificationBell.tsx`
      - Change: (P12) Annotate the bell button `shell.notifications`.
      - Implementation details: The `<button … aria-label=…>` near line 87.
      - Removal: No removal.
      - Verification: Extend `NotificationBell.test.tsx`.
   36. **Modify** `src/components/salesScript/SalesScriptButton.tsx`
      - Change: (P12) Annotate `shell.script` (rendered only with `script.view`).
      - Implementation details: Existing button.
      - Removal: No removal.
      - Verification: Test in guide test.
   37. **Modify** `src/components/ui/ThemeToggle/ThemeToggle.tsx`
      - Change: (P12) Annotate `shell.theme` on the toggle `button` (the one with `type="button"` near line 44).
      - Implementation details: Pass-through of `className`/props as it already does.
      - Removal: No removal.
      - Verification: Guide test.
   38. **Create** `src/lib/support/layoutAdapters.ts`
      - Change: (P12) Registry of view-state adapters with snapshot/restore.
      - Implementation details: (new) `registerAdapter(name, { isOpen, open, close })`, `ensureOpen(name)`, `restoreAll()`.
      - Integration: Called by `useTourSession` for steps with `needs`.
      - Removal: None: new file.
      - Verification: `layoutAdapters.test.ts`.
   39. **Create** `src/lib/support/guides/shell.ts`
      - Change: (P12) The shell guide (about 9 steps) exported as `shellSteps` and `includeShell()`; comments record the two excluded controls and why.
      - Implementation details: (new) steps for menu, nav, nav item, theme, notifications, script, support, profile, logout.
      - Integration: Page guides opt in with `includeShell()`.
      - Removal: None: new file.
      - Verification: `shell.test.tsx`.
   40. **Create** `src/lib/support/guides/shell.test.tsx`
      - Change: (P12) Write first, including mobile width opening and restoring the sidebar.
      - Implementation details: RTL with `matchMedia` stub.
      - Removal: None: new file.
      - Verification: SUP-15.
   41. **Modify** `src/lib/support/useTourSession.ts`
      - Change: (P12) Honour `needs` (call `ensureOpen` before resolving; `restoreAll` on step change and end).
      - Implementation details: Extend the step-entry function.
      - Removal: No removal.
      - Verification: Covered by shell test.
8. **Implementation tasks (in order):**
   1. **P09: Support launcher and contextual help panel.**
   2. (P09) Write failing tests first (panel states, launcher wiring, sidebar link no longer `preventDefault`-dead).
   3. (P09) `SupportLauncher` replaces the `<button className={helpBtn}>` in `AppLayout.tsx`; keep the existing class and `aria-label` (`header.help`), add `aria-haspopup="dialog"`, `aria-expanded`. The Sidebar "Support" item calls the same store action (also closing the mobile sidebar).
   4. (P09) `SupportPanel` reads `useSupportPage()`: heading "Help for <page or tab title>"; **Tour this page** (label becomes **Tour this tab** when `scope` is set); **Resume tour (step n of N)** when `lastStepId` exists; **Replay tour** after completion with a completed mark; **No help yet** state for planned pages (honest: names the page, offers nothing fake); **Exit** closes the panel.
   5. (P09) Panel closes on route change, outside click and Escape; focus returns to the launcher.
   6. (P09) Load `support` copy through `loadSupportCopy` on first open (SUP-19); the panel renders a skeleton for the instant it takes.
   7. (P09) Create `support.json` (en, sq) for panel strings; el/it fall back to en (allowed by `check-translations` for non-required languages).
   8. (P09) Playwright: add a `support` project (desktop Chrome, depends on `setup`, like `desktop`), a first case "open Support on the dashboard and see the panel", and add the panel to `mobile360.spec.ts` at 360 px (no horizontal overflow, panel fully visible).
   9. **P10: Annotation pass-through on shared UI components.**
   10. (P10) Write failing tests first for each component (attribute present on the correct element, absent when the prop is omitted).
   11. (P10) `DataTable`: `rowTourId` adds `data-tour` and `data-tour-repeat` to every `<tr>` and every mobile card (only one layout renders at a time, existing behaviour); `tourId` adds `<id>` on the wrapper, `<id>.empty` on the empty state, `<id>.loading` plus `aria-busy="true"` on the skeleton, and `<id>.sort.<column>` on sortable headers.
   12. (P10) `Tabs`: `tourId` -> tablist `data-tour=<id>`, each tab `<id>.tab.<tabId>`; the active tab panel is page-owned and annotated by the page.
   13. (P10) `DropdownMenu`: `DropdownMenuItemType.tourId` -> `data-tour` on the rendered menu item (menu content is portalled to `body`, which is why items need their own attribute).
   14. (P10) `Modal`, `SlideOver`, `ConfirmDialog`: `tourId` on the `role="dialog"` root plus `data-tour-layer` so the resolver (P02) scopes to it.
   15. (P10) `TextInput`/`SelectInput`: `tourId` on the container so the highlight covers label, control and message.
   16. (P10) No behaviour, markup order or class changes elsewhere; existing snapshots/tests must be untouched.
   17. **P11: Shared guidance library and guide-authoring helpers.**
   18. (P11) Write failing tests first (lint rules with deliberately broken guides).
   19. (P11) Each shared kind: `{ kind, safety, titleKey, bodyKey, whenKey?, disabledKey?, warning? }` with copy in `support.json` under `shared.*`.
   20. (P11) `definePageGuide({ pageId, version, namespace, steps })` returns a frozen guide and derives copy keys by convention `<namespace>:<pageId>.<stepId>.title|body|when|warning|disabled`.
   21. (P11) `guideLint` is a function used by (a) every page slice's integrity test, (b) a dev-only startup check. Rules: step ids unique; `target` ids match the id grammar; `repeat` required where the target id ends `.row`/`.card`/`.item`; destructive steps (`warning`) must be `explain-only`; a step cannot be both `try-it` and `submit`; `try-it` is allowed only for kinds `tab|filter|field|menu|opener`; every copy key exists in `en` and `sq`.
   22. (P11) `stepFactories`: only the three families with proven repetition; each returns plain step objects the page can override or extend.
   23. (P11) Refactor to keep the library free of page-specific wording.
   24. **P12: Application shell chrome: annotations, layout adapters and shell guide.**
   25. (P12) Write failing tests first.
   26. (P12) Annotate: `shell.menu` (mobile menu button), `shell.nav` (the nav section), `shell.nav.item` (`repeat`, one per rendered item), `shell.theme`, `shell.notifications`, `shell.script` (only rendered with `script.view`), `shell.support`, `shell.profile`, `shell.logout`, `shell.org`.
   27. (P12) **Exclusions, recorded in the guide file as comments with the reason:** the header search `<input>` (no `value`/`onChange`, does nothing) and the sidebar "New entry" button (`onNewEntryClick` is never passed by any page) are *not* explained as functional. They are inert today; documenting them as working would be wrong. They are listed as an open item for the team (R10).
   28. (P12) `layoutAdapters`: `AppLayout` registers `sidebar` (`setIsSidebarOpen`) and `mobileSearch` adapters in an effect; a step may declare `needs: "sidebar"`; `useTourSession` calls `open()` before resolving, records the prior state, and restores it when the step changes or the tour ends. Adapters only change *view state*; they never click.
   29. (P12) Nav steps use the exemplar rule: because the menu differs per user (permission and workflow filters), the guide explains the region and one exemplar item and says that the menu lists what the user may open; pick-mode (P16) lets users ask about any individual item.
   30. (P12) Write `guides/shell.ts` with `definePageGuide`; it is not a route page, it is included by page guides through `includeShell()` (default off; a page opts in for its first step group).
9. **Runtime behavior:**
   - (P09) Clicking the header help button or the sidebar Support item opens the panel. On a page without a guide yet the panel says so. Choosing Tour this page starts the tour from P08 for pages that have a guide (none until S05).
   - (P10) No visible change. After this slice any page can mark rows, headers, tabs, dialogs and fields.
   - (P11) No visible change; a page guide can now be written in ~1 line per standard control.
   - (P12) On a phone, a tour step about the navigation opens the sidebar, highlights it, and closes it again afterwards. On desktop the same step highlights the always-visible sidebar. The permission-dependent items shown are exactly those the user can see.
10. **Dynamic UI considerations:**
   - (P09) The panel reflects the current route at all times: after navigation it re-resolves the page id; for tabbed pages it re-resolves when the tab changes.
   - (P09) It never shows actions for a guide the user is not eligible for (zero eligible steps -> treated as no guide).
   - (P10) Because ids are attributes on rendered nodes, every row rendered later (new record, next page, filter change) carries the same id automatically: the mechanism behind "20 products need no 20 steps".
   - (P11) Shared guidance applies to *kinds*, so every instance of a kind (every row menu, every filter select) is covered by the same entry; interpolation uses runtime values read from the target (e.g. the visible dialog title) so copy never goes stale when data changes.
   - (P12) If the nav changes (permission refresh, follow-up badge appears) the exemplar re-resolves.
   - (P12) If the user rotates the device or resizes across 768 px, the adapter re-evaluates `needs`.
11. **Testing requirements:**
   - (P09) SUP-01: panel shows the resolved page title; planned page shows the no-help state; excluded route never mounts the launcher (public pages have no `AppLayout`).
   - (P09) SUP-17: resume/replay labels from stored progress.
   - (P09) SUP-14/15: launcher is a real `button` with `aria-expanded`; 360 px Playwright case; focus returns to launcher.
   - (P09) Regression: existing `AppLayout.test.tsx` and `Sidebar.test.tsx` still pass.
   - (P10) SUP-07: DataTable with 3 then 20 rows -> 20 elements share one `rowTourId`, mobile layout likewise, header sort ids present only for `sortable` columns.
   - (P10) SUP-05: each component forwards the id to the documented element; omitted prop adds no attribute.
   - (P10) Regression: existing tests for every touched component pass unchanged.
   - (P11) SUP-12: lint rejects `try-it` on a step flagged destructive and on a submit button.
   - (P11) SUP-07: lint rejects a `.row` target without `repeat`.
   - (P11) SUP-18: lint reports a key missing in `sq`.
   - (P11) SUP-05: each shared kind resolves copy in en and sq; interpolation of `{{subject}}`.
   - (P12) SUP-15: with a mobile-width `matchMedia`, a `needs: "sidebar"` step opens the sidebar then restores `isOpen=false` on exit.
   - (P12) SUP-09: a user without `script.view` has no `shell.script` target and that step is dropped.
   - (P12) SUP-05: every annotated shell control exists in the rendered `AppLayout` + `Sidebar`; the excluded two are not annotated (asserted).
   - (P12) Regression: `AppLayout.test.tsx`, `Sidebar.test.tsx` unchanged and green.
12. **Acceptance criteria:**
   - (P09) The two formerly dead controls are live and covered by tests.
   - (P09) `npx playwright test --project=support` and `--project=mobile-360` include the panel case.
   - (P09) `npm run check:translations` passes with the new `support.json`.
   - (P10) All touched component tests and `Storybook` stories still pass.
   - (P10) A diff review confirms only additive optional props.
   - (P11) Lint and shared tests pass.
   - (P11) A sample guide in the tests passes lint; five broken variants each fail with a distinct message.
   - (P12) Tests pass; Playwright `support` case runs the shell guide at desktop and 360 px.
   - (P12) The two inert controls are listed in the PR description as findings.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/layout/AppLayout src/components/layout/Sidebar src/components/ui/DataTable src/components/ui/Tabs src/components/ui/Pagination src/components/ui/DropdownMenu src/components/ui/Modal src/components/ui/SlideOver src/components/ui/ConfirmDialog src/components/ui/Card src/components/ui/KPICard src/components/ui/TextInput src/components/ui/SelectInput src/hooks src/components/notifications src/components/salesScript src/components/ui
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --project=mobile-360   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (955); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S04. Every page slice from S05 makes its page appear in this panel simply by registering a guide. P15 adds the "Explain a control" action to this panel. Page slices annotate with `{...tourProps("clients.list.add")}` or `tourId=` props only; no new wrapper elements. Page slices import `definePageGuide`, `listPageSteps` etc. and run `assertGuideIntegrity(guide)` in their test. New shared kinds are added here only when a second page needs them. Page guides may `includeShell()`; the SuperAdmin pages reuse the same chrome. Layout `needs` mechanism is available to any step.
16. **Intentionally excluded from this slice:**
   - No "Explain a control" entry yet (P15).
   - No page guides.
   - The inert header search input and sidebar "New entry" button are not touched.
   - No behaviour, markup order or class change in any shared component.
   - No page annotation (page slices).
   - `Card` needs no change: it already spreads rest props onto its `div`.
   - No page-specific wording.
   - No new control family without a second page needing it.
   - The header search `<input>` and the sidebar "New entry" button are deliberately not annotated (they are inert).
   - No page guide.

<a id="s04"></a>

### S04: Foundation 4: nested layers, read-only enforcement and Explain a control

1. **Slice id and title:** S04. Foundation 4: nested layers, read-only enforcement and Explain a control. Branch `support-slice-4-foundation-4-nested-layers-read-only`.
2. **Scope:** P13: Teaches the engine to guide through UI that only exists after a user action: dropdown menus, `Modal`, `SlideOver`, `ConfirmDialog` and tab panels. Defines hand-off steps, group steps, return-on-close and the Escape arbitration rule. P14: A capture-phase interaction guard that makes it impossible to trigger an application action by accident during a tour, plus the test utilities that prove "no data was changed". P15: Adds "Explain a control" to the Support panel: a list of the controls on the current page that actually exist right now, each opening a single-step explanation without starting the tour. P16: Point-and-ask: the user hovers (or tabs through) the page and any annotated control can be explained on click or Enter.
3. **Purpose:** Delivers SUP-10. The tour never clicks for the user, so nested guidance is a *hand-off*: highlight the opener, wait for the layer to appear, then continue inside it. Delivers SUP-12. A tour explains Delete, Void, Close, Cancel contract and every Save/Submit; it must never run them. The invariant is enforced at runtime, linted in definitions (P11) and asserted end to end. Delivers SUP-04. A user who only needs one answer is not forced through a walkthrough. Covers controls that are not in the page's step list but are annotated, and individual items of runtime-dependent sets such as the permission-filtered nav.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-10, SUP-08, SUP-13, SUP-12, SUP-04, SUP-05, SUP-07, SUP-11, SUP-14.
5. **Prerequisites:** S02 (Foundation 2: spotlight, popover, focus and keyboard, and the running host); S03 (Foundation 3: launcher and panel, shared-component annotations, shared guidance and the shell guide). Existing functionality it builds on: `lib/support/useTourSession.ts`, `components/ui/DropdownMenu/DropdownMenu.tsx`, `components/ui/Modal/Modal.tsx, SlideOver.tsx, ConfirmDialog.tsx`.
6. **Production LOC estimate:** **~890** (within the 800 to 1,200 band around the 1,000-line target): P13 layerStack.ts: topmost-layer detection (`role=dialog|menu`, `data-tour-layer`), layer ids from `data-tour` ~70; P13 useLayerWatcher.ts: hub-driven `LAYER_OPENED/CLOSED` events, 600 ms grace for exit animations ~60; P13 useTourSession.ts extension: `opens`/`group`/`advanceWhen`, hold-for-user, return to parent, Esc rule ~110; P13 TourPopover waiting-for-user variant copy wiring ~30; P14 interactionGuard.ts: capture listeners for `click`, `pointerdown`, `mousedown`, `touchstart`, `keydown` (Enter/Space on explain-only targets), `submit`, `dragstart`; allow-list = popover, current `try-it` target subtree, active layer when waiting ~120; P14 useTourSession.ts: install/remove guard per step, message "Exit the tour to use this control", announce once ~40; P14 Dev-time assertion: a destructive step reaching runtime as `try-it` throws in development ~20; P15 useExplainableControls.ts: steps of the active guide whose target resolves now and whose eligibility passes; dedupes repeated instances to one entry; groups by section ~70; P15 ControlList.tsx: searchable list with keyboard support, "Show me" -> single mode, back to list ~100; P15 ControlList.module.css ~40; P15 Machine/session `single` mode: one step, highlight + popover, Close ~30; P16 usePickMode.ts: pointer highlight of the nearest `[data-tour]` ancestor, click/Enter to select, keyboard cycling over visible annotated targets, Esc to leave ~120; P16 PickBanner.tsx: "Pick a control · Esc to cancel", live-announced current candidate ~50; P16 Fallback copy resolution: step copy -> shared kind -> "No help written for this control yet" (never invented text) ~30
7. **File-Level Change Plan** (21 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/layerStack.ts`
      - Change: (P13) Detect the topmost open layer and its id.
      - Implementation details: (new) `topLayer(doc)`, `layerId(el)` from `data-tour`/`data-tour-layer`.
      - Integration: Used by the resolver scope (P02) and the watcher.
      - Removal: None: new file.
      - Verification: `layerStack.test.ts`.
   2. **Create** `src/lib/support/useLayerWatcher.ts`
      - Change: (P13) Hub-driven LAYER_OPENED / LAYER_CLOSED events with a 600 ms exit grace for `AnimatePresence`.
      - Implementation details: (new) `useLayerWatcher(onOpen, onClose)`.
      - Integration: Used by `useTourSession`.
      - Removal: None: new file.
      - Verification: Test with the real `Modal`.
   3. **Modify** `src/lib/support/useTourSession.ts`
      - Change: (P13) Add opener/group handling: `opens` -> `HOLD_FOR_USER`; `group` steps run scoped to the layer; close returns to parent; "Skip this part"; opener disabled/missing skips the group; Esc rule (yield while waiting). Then, (P14) Install the guard per step; show/announce "Exit the tour to use this control" once; throw in development if a `warning` step is `try-it`. Then, (P15) Support starting a session with one step.
      - Implementation details: Extend the step-entry function and the effect that listens to the watcher. Step-entry function. Start path.
      - Integration: Uses `useTourKeyboard` option `waiting`.
      - Removal: No removal.
      - Verification: `nestedGuide.test.tsx`. Guard tests. Session test.
   4. **Modify** `src/components/support/TourPopover.tsx`
      - Change: (P13) Wire the waiting-for-user copy ("Open X to continue", "Skip this part") into the existing `waiting` variant.
      - Implementation details: Existing variant prop.
      - Removal: No removal.
      - Verification: Popover test.
   5. **Create** `src/lib/support/layerStack.test.ts`
      - Change: (P13) Write first.
      - Implementation details: Vitest.
      - Removal: None: new file.
      - Verification: SUP-10.
   6. **Create** `src/lib/support/nestedGuide.test.tsx`
      - Change: (P13) Write first with real `DropdownMenu`, `Modal`, `SlideOver`, `ConfirmDialog`: open, close, close early, never open, opener disabled, Esc in three modes, exit animation not read as lost.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-10, SUP-13.
   7. **Create** `src/lib/support/interactionGuard.ts`
      - Change: (P14) Capture-phase listeners that cancel `click`, `pointerdown`, `mousedown`, `touchstart`, Enter/Space `keydown` on an explain-only target, `submit`, `dragstart`; allow-list = popover, current try-it target subtree, active layer while waiting.
      - Implementation details: (new) `installGuard(getAllow)` returning a remover.
      - Integration: Installed/removed by `useTourSession` on every step and on every end path.
      - Removal: None: new file.
      - Verification: `interactionGuard.test.tsx` (spies on Delete, Save, a form).
   8. **Create** `tests/e2e/support/noMutations.ts`
      - Change: (P14) Playwright helper `expectNoMutations(page, { allow })` failing on POST/PUT/PATCH/DELETE during a tour; allow-list for read-only POST endpoints.
      - Implementation details: (new) exported function using `page.route`/`page.on('request')`.
      - Integration: Imported by `tests/e2e/support.spec.ts` (next to the existing `support/provision.ts` and `support/sessions.ts`).
      - Removal: None: new file.
      - Verification: One case in `support.spec.ts`.
   9. **Create** `src/lib/support/interactionGuard.test.tsx`
      - Change: (P14) Write first, including a source grep that `.click(`, `.submit(`, `dispatchEvent(` do not appear under `src/lib/support`.
      - Implementation details: RTL + fs read.
      - Removal: None: new file.
      - Verification: SUP-12.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: (P14) Add a case that starts a fixture/dashboard tour and asserts `expectNoMutations`.
      - Implementation details: Add to the table.
      - Removal: No removal.
      - Verification: Playwright.
   11. **Create** `src/lib/support/useExplainableControls.ts`
      - Change: (P15) Return the steps whose targets resolve now and pass eligibility; collapse repeated targets to one entry; group by section; update from the DOM hub.
      - Implementation details: (new) `useExplainableControls(guide)`.
      - Integration: Uses `useEligibleSteps`, `subscribeToDom`.
      - Removal: None: new file.
      - Verification: Hook test.
   12. **Create** `src/components/support/ControlList.tsx`
      - Change: (P15) Searchable `role="listbox"` list with arrow-key navigation; Enter starts single mode.
      - Implementation details: (new) `ControlList`.
      - Integration: Rendered inside `SupportPanel`.
      - Removal: None: new file.
      - Verification: Component test.
   13. **Create** `src/components/support/ControlList.module.css`
      - Change: (P15) List styles.
      - Implementation details: CSS module.
      - Removal: None: new file.
      - Verification: Story.
   14. **Modify** `src/components/support/SupportPanel.tsx`
      - Change: (P15) Add the "Explain a control" action and the list view with Back. Then, (P16) Add the "Point at a control" action.
      - Implementation details: New view state in the panel. Panel actions list.
      - Removal: No removal.
      - Verification: Panel tests. Panel test.
   15. **Modify** `src/lib/support/tourMachine.ts`
      - Change: (P15) Add `mode: single` handling (one step, Close, no progress).
      - Implementation details: New reducer branch + selector.
      - Removal: No removal.
      - Verification: Machine table rows.
   16. **Create** `src/lib/support/useExplainableControls.test.tsx`
      - Change: (P15) Write first (20 rows -> 1 entry, loading then filled, permission gated).
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-04, 07, 09, 11.
   17. **Create** `src/components/support/ControlList.test.tsx`
      - Change: (P15) Write first.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-14.
   18. **Create** `src/lib/support/usePickMode.ts`
      - Change: (P16) Pointer highlight of the nearest `[data-tour]` ancestor, click/Enter select (swallowed by the guard), Tab/Shift+Tab cycling, Esc leaves; fallback copy chain step -> shared kind -> "No help written for this control yet".
      - Implementation details: (new) `usePickMode()`.
      - Integration: Reuses `SpotlightMask` and `TourPopover` single mode.
      - Removal: None: new file.
      - Verification: `usePickMode.test.tsx`.
   19. **Create** `src/components/support/PickBanner.tsx`
      - Change: (P16) "Pick a control. Esc to cancel" bar with live-announced candidate.
      - Implementation details: (new) `PickBanner`.
      - Integration: Mounted by `SupportHost` in pick mode.
      - Removal: None: new file.
      - Verification: `PickBanner.test.tsx`.
   20. **Create** `src/lib/support/usePickMode.test.tsx`
      - Change: (P16) Write first: hover, click swallowed, keyboard, touch, fallback card.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-04, 05, 13.
   21. **Create** `src/components/support/PickBanner.test.tsx`
      - Change: (P16) Write first.
      - Implementation details: RTL.
      - Removal: None: new file.
      - Verification: SUP-14.
8. **Implementation tasks (in order):**
   1. **P13: Nested layers: dialogs, drawers, menus and tabs.**
   2. (P13) Write failing tests first with a fixture page whose button opens a fixture dialog.
   3. (P13) Step fields: `opens: "<layerId>"` marks an opener (`safety: "try-it"` required); `group: "<layerId>"` marks steps that belong inside that layer; `advanceWhen` defaults to "layer `<layerId>` present".
   4. (P13) Flow: opener step shows "Try it: click here" -> machine `HOLD_FOR_USER(layerId)` -> the user clicks (the tour does not) -> `LAYER_OPENED` -> the group's steps run with the resolver scoped to that layer -> when the layer closes, `LAYER_CLOSED` returns to the step after the opener (or the opener again if the user closed it before the group finished, with a "Want to see it again?" note).
   5. (P13) If the user never opens the layer, "Skip this part" in the waiting popover jumps past the whole group; the group is also skipped automatically if the opener becomes missing/disabled (e.g. permission lost).
   6. (P13) Escape arbitration (decision rule, R7): tour in `running` -> Esc exits the tour only; tour in `waiting: user-action` or inside a group -> Esc is left to the layer (so it closes the dialog) and the tour then returns to the parent step.
   7. (P13) Dropdown menus: menu items live in a portal; the resolver's layer scope picks `[role="menu"]`; the outside-click close in `DropdownMenu` is not triggered by tour UI because the popover is inside `SupportHost`, which stops pointer events from reaching the document handler only for its own subtree (verified in a test using the real `DropdownMenu`).
   8. (P13) Tabs: tab steps are `try-it` with `advanceWhen` = target `<tabs>.tab.<id>` has `aria-selected="true"`; panel steps carry `scope: { tab }`.
   9. **P14: Explain-only enforcement and safety watchdog.**
   10. (P14) Write failing tests first (a fixture page with Delete, Save and a form).
   11. (P14) While a tour is `running`, the guard cancels (`preventDefault` + `stopPropagation`) any `click`/`pointerdown`/`mousedown`/`touchstart` whose target is outside the allow-list. The allow-list is: the tour UI; the subtree of the current step's target **only if** `safety: "try-it"`; the active layer when `waiting`.
   12. (P14) `keydown` Enter/Space on a focused explain-only target is cancelled so a keyboard user cannot activate it either.
   13. (P14) A global `submit` capture cancel: forms cannot be submitted while a tour runs, even from a field the user is allowed to type in. The popover shows "Exit the tour to submit" once, and the announcer repeats it.
   14. (P14) The guard never calls `.click()`, `.submit()`, `dispatchEvent` or any app callback; a source-grep test asserts these calls do not appear under `lib/support`.
   15. (P14) Playwright utility `expectNoMutations(page)` that fails on any `POST|PUT|PATCH|DELETE` request between start and end of a tour, used by every page's end-to-end case. Some read-only calls use POST (the pricing test calculator, the employee-upload preview): the helper takes an explicit allow-list of such endpoints, and a page slice must name any it adds in its PR (risk R14).
   16. **P15: Explain a control: control list.**
   17. (P15) Write failing tests first.
   18. (P15) `useExplainableControls(guide)` returns entries for steps whose target is `found|disabled` in the current DOM and whose `requires` pass; repeated targets collapse to one entry flagged "appears on every row". Entries for controls that do not exist now (e.g. a Clear button when no filter is active) are *not* listed; the list updates live from the observer hub.
   19. (P15) `ControlList` lives inside `SupportPanel`: filter box (`role="searchbox"`), listbox semantics (`role="listbox"`/`option`), arrow-key navigation, Enter = show.
   20. (P15) Single mode: highlight + popover with only Close (and "Explain another"), no progress, no Next/Back; `ArrowRight/Left` disabled.
   21. (P15) Empty state: "No controls on this page can be explained yet" when a page has a guide with no resolvable step (e.g. still loading) with a Retry that re-queries.
   22. **P16: Explain a control: pick mode.**
   23. (P16) Write failing tests first.
   24. (P16) Pointer: `pointermove` highlights the nearest ancestor carrying `data-tour` (using the same mask); click selects it and is swallowed by the guard so the control itself does not fire.
   25. (P16) Keyboard: Tab / Shift+Tab move through the annotated, visible targets in DOM order (announced); Enter selects; Esc leaves pick mode.
   26. (P16) Resolution of copy for the picked id: the active guide's step with that target; else the shared guidance for its `data-tour-kind`; else a clearly marked "No help written for this control yet" card (honest fallback).
   27. (P16) Touch: first tap highlights and shows the card, second tap on Close leaves; no hover dependence.
9. **Runtime behavior:**
   - (P13) A step says "Open the actions menu" and waits. After the user opens it, the tour explains the items; closing the menu returns to the page level. Dialog steps explain fields and buttons without submitting.
   - (P14) While a tour runs the page behaves like a read-only museum: scrolling and typing in allowed fields work, clicking or pressing Enter on an explain-only control shows the hint and does nothing. After Exit/finish the page is fully interactive again.
   - (P15) Support -> Explain a control shows only what is on screen now. Choosing one highlights it and explains it in a single card; Close returns to normal use immediately.
   - (P16) A banner appears, the page can be explored by pointer or keyboard, and picking any annotated control explains it in a single card.
10. **Dynamic UI considerations:**
   - (P13) Layers that close from outside (data refresh, permission change) are treated like a closed layer.
   - (P13) A second layer opened on top of the first (e.g. archive confirm from a menu) becomes the new scope root; closing it returns to the previous layer.
   - (P14) The allow-list is recomputed per step, so changing steps changes what is clickable; a target replaced mid-step keeps the same rule because it is keyed by id, not element.
   - (P14) Guard listeners are removed on every exit path (finish, Exit, Skip, route change, unmount).
   - (P15) List updates when data arrives (loading -> populated), when filters create or remove controls, and when a tab changes.
   - (P15) Explaining a repeated control highlights the first visible instance and says it applies to every row.
   - (P16) Targets are queried on each move/tab press, so controls that appeared after the mode started are available and removed ones are not.
   - (P16) The nav items (permission-filtered) are each pickable, which the page tour deliberately does not enumerate.
11. **Testing requirements:**
   - (P13) SUP-10: opener -> hold -> open -> group steps -> close -> parent; user closes early; user never opens and uses Skip this part; opener disabled mid-wait.
   - (P13) SUP-13: Esc behaviour in the three modes with a real `Modal`.
   - (P13) SUP-08: layer exit animation (`AnimatePresence`) does not cause a false `lost`.
   - (P13) Real-component test: `DropdownMenu` + `ConfirmDialog` from the repo, not mocks.
   - (P14) SUP-12: click/Enter/Space/submit on Delete, Save and a form inside a running tour -> the app handlers (spies) are never called; same controls work after Exit.
   - (P14) SUP-12: source grep for `.click(`, `.submit(`, `dispatchEvent(` under `lib/support`.
   - (P14) SUP-13: Tab still moves focus; Space scrolls the page when not on an explain-only target.
   - (P14) Listener count returns to baseline after every end path.
   - (P15) SUP-04: choose a control -> single popover; Close ends the session with no progress write.
   - (P15) SUP-11: while the fixture page is `aria-busy` the list shows loading, then fills.
   - (P15) SUP-07: 20 fixture rows give one entry.
   - (P15) SUP-09: permission-gated entries absent for a user without the permission.
   - (P16) SUP-04: hover highlights, click explains and the underlying button handler is not called; Esc leaves.
   - (P16) SUP-13: keyboard cycling skips non-visible targets; announces candidate names.
   - (P16) SUP-05: the fallback card appears for an annotated control with no step and no shared kind.
12. **Acceptance criteria:**
   - (P13) Nested-guide integration tests pass with real `DropdownMenu`, `Modal`, `SlideOver`, `ConfirmDialog`.
   - (P13) Existing `Modal`/`SlideOver`/`DropdownMenu` tests pass unchanged.
   - (P14) Guard tests pass.
   - (P14) Playwright helper compiles and is exercised by one case in `support.spec.ts` (start/finish a fixture tour; zero mutating requests).
   - (P15) Panel tests pass; Playwright `support` case: open panel -> Explain a control -> pick -> Close, zero mutations.
   - (P16) Tests pass; Playwright pick-mode case at 360 px with touch emulation.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/ui/DropdownMenu
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (890); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks all page slices (first: S05); it is a foundation or gate slice. Page slices declare `opens`/`group` in data only; no page writes layer logic. This closes the foundation. Page slices declare `warning`/`explain-only`; they cannot weaken it. Every guide step is automatically an explainable control; page slices add nothing for this feature. End of foundation. S05 starts the pilot page and doubles as the gate that validates the mechanism on real data.
16. **Intentionally excluded from this slice:**
   - No page-specific hand-off definitions.
   - No change to Modal/SlideOver/DropdownMenu behaviour.
   - No definition changes (lint is P11).
   - No page work.
   - No pick mode (P16).
   - No per-page work: every guide step is automatically explainable.
   - No new guide content.
   - No Escape change outside pick mode.

## Page tours: pilot gate and Sales workflow

<a id="s05"></a>

### S05: Clients list: complete tour

1. **Slice id and title:** S05. Clients list: complete tour. Branch `support-slice-5-clients-list-complete-tour`.
2. **Scope:** First real page guide. Proves the whole stack on live data: registry entry, lazy guide, copy loading, annotation, eligibility by scope, runtime appearance of controls. Everything that depends on data: loading, error and three empty states, the repeated row, the per-row actions menu, and the archive / restore flow including the confirmation dialog.
3. **Purpose:** Validates the foundation on one page before 60 more depend on it. If this slice exposes a design flaw, the foundation is fixed before the next page slice. Shows the dynamic-data mechanism on the pilot page: 1 row or 200 rows produce the same steps, and the menu and dialog are guided without being operated.
   - **Description.** This slice delivers the complete guided tour of **Clients list** (`/:tenantSlug/clients`) and nothing else. A user who opens Support on this page can tour 38 steps in order, ask about any single control, and replay or leave. What the page is for: Find a company (search, filters, archived view); open it; add one; archive or restore one. What the tour walks through: Breadcrumb and title; `ExcelImportButton` (import clients, template download); Filter toggle (`aria-pressed`); "Add client"; name search; a mine / team / all select; archived-view toggle; filter bar (business type, risk level, area, city, salesperson, status, a "needs completion" toggle, Clear filters); `DataTable` (name with an "incomplete" badge, status, validity, assigned, risk, area, contact, actions) with row click and a per-row menu (View details, Delete = archive, Restore); archive `ConfirmDialog`; "Showing X of Y". What changes the tour at runtime: The mine / team / all select only for `companies.view` scope TEAM or ALL (its Team option only for ALL); the archived toggle, Delete and Restore only with `companies.delete`; Delete only outside the archived view, Restore only inside it; the Add-client empty action only with no search term and outside the archived view; Clear filters only while a filter is active; the filter bar only while shown. **Restore runs immediately with no confirmation.** Three distinct empty states (first use, no match for a search term, archived view); load error banner (`role="alert"`). **Previous/Next are static `disabled` buttons with no handler** and are not explained. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Clients list** (`clients.list`; `/:tenantSlug/clients`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control). Existing code it relies on, unchanged since planning: `pages/clients/ClientListPage.tsx`, `pages/clients/ClientListContent.tsx`, `components/ui/DataTable/DataTable.tsx`, `components/ui/DropdownMenu/DropdownMenu.tsx`.
6. **Production LOC estimate:** **~416** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 38 steps x 8 = 304 + 34 annotation sites x 2 = 68 + `data-tour-state` markers on the filter row and empty branches so later slices can tell "no filters" from "filters active" 8 + Group wiring for the menu and archive dialog (`opens`/`group`), `tourId` on the `DropdownMenu` items and `ConfirmDialog` 20. Copy is JSON and not counted.
7. **File-Level Change Plan** (12 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/clientsList.ts`
      - Change: Create the page guide with the 38 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'clients.list', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'clients.list.<id>', kind, safety, … }`. Steps in state-only elements: `filterBar`, `loading`, `error`, `emptyFirst`, `emptyNoMatch`, `emptyArchived`. Eligibility (`requires`): `companies.delete`. Hand-offs (`opens`/`group`): `menu`, `archive`.
      - Integration: Loaded lazily through `loaders['clients.list']` in `pageRegistry.ts`; copy keys resolve to `supportSales:clients.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/clientsList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/clientsList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `companies.delete`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'clients.list': () => import('./guides/clientsList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'clients.list'` on the entries for `clients` and delete `'clients.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/clients/ClientListContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientListContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L67 permission check [companies.delete]; L76 permission check [companies.view]; L315 DropdownMenu (list.actionsFor); L317 button (list.actionsFor); L367 Button; L375 Button (list.addClient); L386 TextInput (list.searchPlaceholder); L396 SelectInput (list.filter); L410 Button; L424 SelectInput (list.filters.businessType); L437 SelectInput (list.filters.riskLevel); L450 SelectInput (list.filters.area); L463 SelectInput (list.filters.city); L477 SelectInput (list.filters.salesperson); L490 SelectInput (list.filters.status); L503 Button (list.filters.needsCompletion); L512 Button (list.filters.clear); L520 role=alert; L524 DataTable (list.caption); L532 DataTable empty prop (list.emptyArchived); L543 Button (list.addClient); L560 Button (list.prev) [DO NOT ANNOTATE: static disabled, section 3.4]; L563 Button (list.next) [DO NOT ANNOTATE: static disabled, section 3.4]; L570 ConfirmDialog (list.deleteClientTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/clients/ClientListContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/clients/ExcelImportButton/ExcelImportButton.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `IMPORT_ACCEPT`, `ExcelImportButton`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L82 Button; L93 button (import.downloadTemplate); L97 input; L109 role=alert; L116 role=status (import.summary).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/clients/ExcelImportButton/ExcelImportButton.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Leave unchanged** `src/hooks/useClients.ts`
      - Change: Read only, to find the labels, data shapes and conditions the steps depend on. Do not edit.
   8. **Leave unchanged** `src/locales/en/clients.json`
      - Change: Read only: `list.*` keys the labels come from. Do not edit.
   9. **Leave unchanged** `src/pages/clients/ClientListPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   10. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `clients.list.<step>.title` and `.body` for these steps: `title`, `import`, `filterToggle`, `add`, `search`, `reach`, `archivedToggle`, `filterBar`, `fBusinessType`, `fRisk`, `fArea`, `fCity`, `fSalesperson`, `fStatus`, `needsCompletion`, `clear`, `count`, `loading`, `error`, `emptyFirst`, `emptyNoMatch`, `emptyArchived`, `table`, `columns`, `row`, `rowName`, `incompleteBadge`, `rowStatus`, `rowValidity`, `rowAssigned`, `rowRisk`, `rowMenu`, `menuView`, `menuArchive`, `menuRestore`, `archiveDialog`, `archiveConfirm`, `archiveCancel`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `clients.list.<step>.title` and `.body` for these steps in Albanian: `title`, `import`, `filterToggle`, `add`, `search`, `reach`, `archivedToggle`, `filterBar`, `fBusinessType`, `fRisk`, `fArea`, `fCity`, `fSalesperson`, `fStatus`, `needsCompletion`, `clear`, `count`, `loading`, `error`, `emptyFirst`, `emptyNoMatch`, `emptyArchived`, `table`, `columns`, `row`, `rowName`, `incompleteBadge`, `rowStatus`, `rowValidity`, `rowAssigned`, `rowRisk`, `rowMenu`, `menuView`, `menuArchive`, `menuRestore`, `archiveDialog`, `archiveConfirm`, `archiveCancel`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   12. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'clients.list', route: 'clients' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "clients.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: read in context during planning; re-read to catch drift): `src/pages/clients/ClientListContent.tsx`.
   3. **PT-3 Annotate** about 34 sites in those files. Includes: `data-tour-state` markers on the filter row and empty branches so later slices can tell "no filters" from "filters active"; Group wiring for the menu and archive dialog (`opens`/`group`), `tourId` on the `DropdownMenu` items and `ConfirmDialog`.
   4. **PT-4 Write the guide**: 38 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.list.<id>.title|body`):
      - `title` — breadcrumb, heading and subtitle (info)
      - `import` — Import clients (`ExcelImportButton`: pick a spreadsheet, download the template; explain-only, because importing creates companies)
      - `filterToggle` — Filter button showing or hiding the filter bar; primary-coloured while a filter is active (`aria-pressed`, try-it)
      - `add` — "Add client" primary button, navigates to the form (explain-only: navigation)
      - `search` — name search field (try-it)
      - `reach` — mine / team / all select (named by `list.filter`); rendered only for `companies.view` scope TEAM or ALL, and its Team option only for ALL (try-it)
      - `archivedToggle` — switch between active and archived companies; rendered only with `companies.delete` (`aria-pressed`, try-it)
      - `filterBar` — the filter bar region (state: while shown)
      - `fBusinessType` — business type filter (try-it)
      - `fRisk` — risk level filter (try-it)
      - `fArea` — area filter (try-it)
      - `fCity` — city filter; disabled until an area is chosen (disabledHint)
      - `fSalesperson` — salesperson filter (try-it)
      - `fStatus` — status filter (try-it)
      - `needsCompletion` — "needs completion" toggle button (try-it)
      - `clear` — "Clear filters"; exists only while a filter is active
      - `count` — the "Showing X of Y" line (info)
      - `loading` — skeleton rows while the list loads (state)
      - `error` — load / action error banner (`role="alert"`) (state)
      - `emptyFirst` — first-use empty state with its "Add client" action (state)
      - `emptyNoMatch` — empty state for a search term; no Add action (state)
      - `emptyArchived` — empty archived view (state)
      - `table` — the table (or card list on a phone) as a region (info)
      - `columns` — what the visible columns mean: name, status, validity, assigned, risk, area, contact (info)
      - `row` — one company row: click opens the detail page (repeat, explain-only)
      - `rowName` — company name cell (repeat)
      - `incompleteBadge` — "incomplete" badge on companies that need completion (repeat, state)
      - `rowStatus` — status badge (repeat, shared.statusBadge)
      - `rowValidity` — contract validity badge (repeat, shared.statusBadge)
      - `rowAssigned` — assigned salesperson (repeat)
      - `rowRisk` — risk badge (repeat, shared.statusBadge)
      - `rowMenu` — the row actions trigger (repeat, try-it, opens the menu)
      - `menuView` — "View details" (group: menu, explain-only: navigation)
      - `menuArchive` — "Delete", which archives the company (group: menu, destructive, needs `companies.delete`, not in the archived view)
      - `menuRestore` — "Restore" in the archived view; **restores immediately, with no confirmation** (group: menu, destructive-class, needs `companies.delete`, explain-only)
      - `archiveDialog` — the confirmation dialog: title and the message with related counts (group: archive, vars: dialog title)
      - `archiveConfirm` — the danger confirm button (group: archive, destructive, explain-only)
      - `archiveCancel` — Cancel (group: archive, explain-only)
   5. **PT-5 Register** `/:tenantSlug/clients` as page `clients.list`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `clients.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Exactly one of `emptyFirst`, `emptyNoMatch`, `emptyArchived` exists in the DOM at a time; the tour explains the one that is there.
   - **Loading / skeleton (L):** While the skeleton is shown (`aria-busy`) the tour waits up to 4 s, then skips the data-dependent steps.
   - **Populated, repeated rows or cards (P):** `row`, `rowName`, `rowStatus`, `rowValidity`, `rowAssigned`, `rowRisk`, `rowMenu` are `repeat`: the first visible row is the exemplar, and the copy says it applies to every row.
   - **Search / filtered results (F):** With a filter applied the `clear` step becomes eligible; with none it is skipped. Showing the filter bar (try-it on `filterToggle`) makes the `filterBar` and the filter steps eligible; hiding it removes them.
   - **Pagination / sorting (G):** There is no pagination to explain: the Previous/Next buttons are static `disabled` placeholders and are deliberately left out.
   - **Error / retry (X):** The error banner step appears only while the banner is rendered.
   - **Permission- or workflow-dependent controls (A):** A user whose `companies.view` scope is OWN has no `reach` step; a user without `companies.delete` has no `archivedToggle` step. Without `companies.delete` the `menuArchive` step is dropped; in the archived view `menuRestore` replaces it.
   - **Dialogs, drawers, menus, nested workflows (D):** The user opens the row menu (try-it); the tour then explains the items; the archive dialog appears only if the user chooses the menu item, and its confirm button can never be activated during the tour.
   - **Destructive or irreversible actions (explain-only) (K):** Archive and confirm carry a warning callout; nothing is archived by the tour.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Typing in the search field or changing a filter while the tour sits on `search` does not move the tour; the highlighted field is the same node.
   - Applying a filter makes `clear` appear; the tour list is recomputed on the next navigation and the announcer says the count changed.
   - Create or archive a client from another tab and return: the exemplar row is re-picked; if the exemplar row is archived while the tour highlights it, the step re-picks the next row instead of pointing at a removed node.
   - Switching to the archived view mid-tour swaps `menuArchive` for `menuRestore`; the eligible list updates.
   - Search with no match swaps the table for `emptyNoMatch`; a `row` step becomes missing and is skipped.
   - Deleting the last client shows `emptyFirst` and the tour offers it as a step.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Render `ClientListContent` (msw) with the host: tour reaches every step for an ALL-scope user with `companies.delete`, skips `reach` for OWN scope, skips `archivedToggle` without `companies.delete`, skips the filter steps while the bar is hidden, skips `clear` until a filter is chosen.
   - Pilot gate test: with 0, 1 and 25 clients the same eligible-step ids result for this slice (no data-driven steps).
   - msw returns 0, 1 and 200 clients: eligible step ids differ only by the presence of row steps and the empty-state steps, never by count.
   - Remove the exemplar row mid-tour (msw + refetch): spotlight moves to the next row, no console warning.
   - Walk through the archive dialog with the real `ConfirmDialog`: `archiveConfirm` click and Enter are swallowed (spy never called), the dialog stays open, the tour then returns to the page.
   - User without `companies.delete`: no archive steps.
   - Regression: existing tests of `ClientListContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Support -> Tour this page works on /clients for a real seeded workspace.
   - Pilot review checklist is ticked in the PR: bundle delta of the main chunk is zero; guide and copy load only after Support opens; Esc, focus and reduced-motion behave.
   - In a seeded workspace the tour never changes a client (Playwright `expectNoMutations`).
   - All three empty states are reachable and explained.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsList src/pages/clients src/components/clients
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 416.
15. **Dependencies and handoff:** unblocks all page slices (first: S06); it is a foundation or gate slice. After this slice **Clients list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Previous / Next buttons (static `disabled`, not wired): left unannotated and unexplained (section 3.4).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s06"></a>

### S06: Client form (create and edit): complete tour

1. **Slice id and title:** S06. Client form (create and edit): complete tour. Branch `support-slice-6-client-form-create-and-edit-complete`.
2. **Scope:** One slice for both routes (the component is shared): identity and classification fields, location, contact persons editor, tenant custom fields, the optional deal, validation and the save / cancel bar.
3. **Purpose:** Teaches data entry for a company without ever submitting it. It lets a first-time user learn Client form (create and edit) in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Client form (create and edit)** (`/:tenantSlug/clients/new`, `/:tenantSlug/clients/:clientId/edit`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: Create a company or edit one; attach contact persons and custom field values; optionally create a deal at the same time. What the tour walks through: Title and subtitle; Cancel; "Save client"; error banner; the tenant's own form rendered by `FormRenderer` in fill mode (sections and controls come from the form builder, present only if the tenant has a form); "Company profile" card (business type required, website, area / city cascade and more, read at slice start); "Contact persons" card (`ContactPersonsEditor`); "First deal" card with a checkbox; "Internal notes" textarea. What changes the tour at runtime: The first-deal card only when creating and with `deals.edit`; city depends on area; the tenant form only if one exists; one component serves both routes (`isEdit`). **In edit mode `ContactPersonsEditor` saves each change through its own endpoints immediately (not on Save), so its controls are explain-only there; in create mode it edits a draft.** Validation messages per field, submit error banner, edit-mode loading. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Client form (create and edit)** (`clients.form`; `/:tenantSlug/clients/new`, `/:tenantSlug/clients/:clientId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/clients/ClientFormPage.tsx`, `pages/clients/ClientFormContent.tsx`, `pages/clients/ContactPersonsEditor.tsx`, `components/ui/CustomFieldInput`.
6. **Production LOC estimate:** **~212** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Mode-dependent copy and safety via `vars.mode` for two routes sharing one guide, including the edit-mode contact editor being explain-only 12 + `FormRenderer` annotation of each rendered control (`tenantField`); the renderer is shared with the public form and the builder, so the id is applied only when it renders in the client form 8. Copy is JSON and not counted.
7. **File-Level Change Plan** (14 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/clientsForm.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'clients.form', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'clients.form.<id>', kind, safety, … }`. Steps in state-only elements: `errorBanner`, `tenantForm`, `requiredErrors`, `profileErrors`. Eligibility (`requires`): `deals.edit`. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['clients.form']` in `pageRegistry.ts`; copy keys resolve to `supportSales:clients.form.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/clientsForm.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/clientsForm.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `deals.edit`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'clients.form': () => import('./guides/clientsForm')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'clients.form'` on the entries for `clients/new`, `clients/:clientId/edit` and delete `'clients.form'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/clients/ClientFormContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientFormContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L68 permission check [deals.edit]; L300 form (form.editTitle); L310 Button; L313 Button; L354 SelectInput (form.profile.businessType); L380 TextInput (form.profile.employeeCount); L397 SelectInput (form.profile.area); L418 SelectInput (form.profile.city); L440 TextInput (form.profile.streetAddress); L452 TextInput (form.profile.taxId); L465 TextInput (form.profile.website); L509 input (form.firstDeal.label); L531 TextareaInput (form.notesLabel).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/clients/ClientFormContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/clients/ContactPersonsEditor.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContactPersonsEditor`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L68 button (form.contacts.remove); L71 aria-label (form.contacts.remove); L79 TextInput (form.contacts.name); L86 TextInput (form.contacts.position); L91 TextInput (form.contacts.phone); L96 TextInput (form.contacts.email); L104 Button (form.contacts.add); L164 input; L179 button (form.contacts.remove); L182 aria-label (form.contacts.remove); L190 TextInput (form.contacts.name); L195 TextInput (form.contacts.position); L200 TextInput (form.contacts.phone); L205 TextInput (form.contacts.email); L215 select (form.profile.choose); L225 Button (form.contacts.remove); L228 Button (form.contacts.cancel); L239 TextInput (form.contacts.name); L244 TextInput (form.contacts.position); L249 TextInput (form.contacts.phone); L254 TextInput (form.contacts.email); L261 Button (form.contacts.save); L264 Button (form.contacts.cancel); L270 Button (form.contacts.add).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/clients/ContactPersonsEditor.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/components/forms/FormRenderer/FormPageRenderer.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FormPageRenderer`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/forms/FormRenderer/FormRenderer.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FormRenderer`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/forms/FormRenderer/FormRenderer.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   9. **Modify** `src/components/forms/FormRenderer/PrintableForm.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PrintableForm`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L30 button (print.back); L35 button (print.action).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/forms/FormRenderer/PrintableForm.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   10. **Modify** `src/components/forms/FormRenderer/ScaledPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ScaledPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Leave unchanged** `src/pages/clients/ClientFormPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   12. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `clients.form.<step>.title` and `.body` for these steps: `mode`, `cancel`, `submit`, `errorBanner`, `tenantForm`, `tenantField`, `requiredErrors`, `profile`, `businessType`, `profileFields`, `city`, `profileErrors`, `contacts`, `addContact`, `contactRow`, `removeContact`, `firstDeal`, `notes`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   13. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `clients.form.<step>.title` and `.body` for these steps in Albanian: `mode`, `cancel`, `submit`, `errorBanner`, `tenantForm`, `tenantField`, `requiredErrors`, `profile`, `businessType`, `profileFields`, `city`, `profileErrors`, `contacts`, `addContact`, `contactRow`, `removeContact`, `firstDeal`, `notes`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   14. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'clients.form', route: 'clients/new' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "clients.form"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsForm.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: read in context during planning; re-read to catch drift): `src/pages/clients/ClientFormContent.tsx`, `src/pages/clients/ContactPersonsEditor.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: Mode-dependent copy and safety via `vars.mode` for two routes sharing one guide, including the edit-mode contact editor being explain-only; `FormRenderer` annotation of each rendered control (`tenantField`); the renderer is shared with the public form and the builder, so the id is applied only when it renders in the client form.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.form.<id>.title|body`):
      - `mode` — title and subtitle: create vs edit
      - `cancel` — Cancel returns to the list (explain-only: navigation)
      - `submit` — "Save client"; disabled while loading; submit is locked during the tour (explain-only)
      - `errorBanner` — form-level error (state)
      - `tenantForm` — the tenant's own form, rendered by `FormRenderer` in fill mode; present only if the tenant has a form (state)
      - `tenantField` — one control of that form (repeat; kinds differ per tenant, try-it for typing)
      - `requiredErrors` — required-field messages on the tenant form (state)
      - `profile` — "Company profile" card (info)
      - `businessType` — business type, required (try-it)
      - `profileFields` — the other profile inputs: website, area / city cascade and more (one step each, read at slice start) (try-it)
      - `city` — city select; disabled until an area is chosen (disabledHint)
      - `profileErrors` — profile field messages (state)
      - `contacts` — "Contact persons" card (info)
      - `addContact` — add a contact person (create mode: try-it, edits a draft; **edit mode: explain-only, because the editor saves immediately**)
      - `contactRow` — one contact row (repeat)
      - `removeContact` — remove a contact (repeat, explain-only; saves immediately in edit mode)
      - `firstDeal` — "First deal" card with its checkbox (create mode, needs `deals.edit`, try-it)
      - `notes` — internal notes textarea (try-it)
   5. **PT-5 Register** `/:tenantSlug/clients/new`, `/:tenantSlug/clients/:clientId/edit` as page `clients.form`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `clients.form`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** In edit mode the form shows a loading state while the company loads; the tour waits, then continues.
   - **Permission- or workflow-dependent controls (A):** `firstDeal` exists only when creating and with `deals.edit`; `tenantForm` only when the tenant has a form.
   - **Dialogs, drawers, menus, nested workflows (D):** No dialogs on this page; contact editing is inline.
   - **Validation and submission (V):** Error text is explained from its rendered position; the tour does not cause validation to run (the submit lock prevents it).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Contact rows added during the tour are covered by the repeated `contactRow` id; ten rows add no steps.
   - Choosing an area enables `city`; the disabled hint disappears on the next frame.
   - The tenant form is whatever the form builder produced: its controls carry the shared id `clients.form.tenantField` (set once in `FormRenderer`, which is also used by the public form and by the builder), so a new field in the builder needs no tour change.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Create vs edit routes produce mode-specific heading copy.
   - Tenant form present and absent.
   - Pressing Enter in a name field during the tour does not submit (submit lock).
   - Disabled city step shows its hint and drops it after an area is chosen.
   - Regression: existing tests of `ClientFormContent.tsx`, `ContactPersonsEditor.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Playwright: tour on /clients/new and /clients/:id/edit leaves the database unchanged.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsForm src/pages/clients src/components/forms
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.form"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 212.
15. **Dependencies and handoff:** unblocks S52, S53. After this slice **Client form (create and edit) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s07"></a>

### S07: Follow-ups: complete tour

1. **Slice id and title:** S07. Follow-ups: complete tour. Branch `support-slice-7-follow-ups-complete-tour`.
2. **Scope:** Mine / team tabs, salesperson filter, overdue-only toggle, the list and its complete / reschedule / cancel / reassign actions and modals.
3. **Purpose:** One slice (about 25 steps) for a compact page. It lets a first-time user learn Follow-ups in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Follow-ups** (`/:tenantSlug/follow-ups`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: See my follow-ups or the team's, filter to overdue, complete / reschedule / cancel a follow-up. What the tour walks through: Tabs (mine / team), salesperson select (team tab), "overdue only" checkbox, `FollowUpList` rows with Complete, Reschedule, Cancel and (by scope) Reassign, and their action modals. What changes the tour at runtime: Team tab and salesperson filter by `calendar.view` scope; actions need `followups.manage`. Empty list per tab, loading, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Follow-ups** (`followUps`; `/:tenantSlug/follow-ups`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/followUps/FollowUpsPage.tsx`, `pages/followUps/FollowUpsContent.tsx`, `components/followUps/FollowUpList.tsx`, `components/followUps/FollowUpActionModals.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~202** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Annotations in `FollowUpActionModals`; the list and its buttons are annotated with the client detail slice and reused here 10. Copy is JSON and not counted.
7. **File-Level Change Plan** (12 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/followUps.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'followUps', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.tabs`. Each step: `{ id, target: 'followUps.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): `followups.manage`. Hand-offs (`opens`/`group`): `action`.
      - Integration: Loaded lazily through `loaders['followUps']` in `pageRegistry.ts`; copy keys resolve to `supportSales:followUps.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/followUps.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/followUps.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `followups.manage`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'followUps': () => import('./guides/followUps')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'followUps'` on the entries for `follow-ups` and delete `'followUps'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/followUps/FollowUpsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('followUps.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L31 permission check [calendar.view]; L32 permission check [followups.manage]; L100 Tabs (title); L142 SelectInput (team.salesperson); L154 input (team.overdueOnly).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/followUps/FollowUpsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/followUps/FollowUpList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('followUps.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L46 permission check [followups.manage]; L47 permission check [followups.manage]; L104 Link (item.openCompany); L115 Link (item.openDeal); L125 aria-label (actions.label); L126 Button (actions.complete); L129 Button (actions.reschedule); L132 Button (actions.cancel); L136 Button (actions.reassign).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/followUps/FollowUpQuickButtons.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('followUps.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpQuickButtons`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L39 permission check [followups.manage]; L65 aria-label (quick.label); L74 Button (quick.intervalAria); L78 aria-label (quick.intervalAria); L86 Button (quick.custom).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/followUps/FollowUpActionModals.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('followUps.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RescheduleFollowUpModal`, `CancelFollowUpModal`, `ReassignFollowUpModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L62 Modal (reschedule.title); L65 TextInput (form.date); L66 TextInput (form.time); L68 TextareaInput (reschedule.reason); L70 role=alert; L75 Button (form.cancel); L78 Button (reschedule.save); L120 Modal (cancel.title); L122 TextareaInput (cancel.reason); L124 Button (cancel.keep); L127 Button (cancel.save); L166 Modal (reassign.title); L168 SelectInput (reassign.label); L181 Button (form.cancel); L184 Button (reassign.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Leave unchanged** `src/pages/followUps/FollowUpsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   10. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `followUps.<step>.title` and `.body` for these steps: `tabs`, `tabMine`, `tabTeam`, `salesperson`, `overdueOnly`, `list`, `item`, `itemOverdue`, `itemCompany`, `complete`, `reschedule`, `cancel`, `reassign`, `actionModals`, `modalFields`, `modalConfirm`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `followUps.<step>.title` and `.body` for these steps in Albanian: `tabs`, `tabMine`, `tabTeam`, `salesperson`, `overdueOnly`, `list`, `item`, `itemOverdue`, `itemCompany`, `complete`, `reschedule`, `cancel`, `reassign`, `actionModals`, `modalFields`, `modalConfirm`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   12. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'followUps', route: 'follow-ups' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "followUps"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/followUps.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/followUps/FollowUpsContent.tsx`, `src/components/followUps/FollowUpList.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpActionModals.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: Annotations in `FollowUpActionModals`; the list and its buttons are annotated with the client detail slice and reused here.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportSales:followUps.<id>.title|body`):
      - `tabs` — mine / team tabs (shared.tabs, try-it)
      - `tabMine` — My follow-ups (try-it)
      - `tabTeam` — Team follow-ups (needs scope above OWN, try-it)
      - `salesperson` — salesperson filter on the team tab (try-it)
      - `overdueOnly` — overdue-only checkbox (try-it)
      - `list` — the follow-up list region
      - `item` — one follow-up (repeat)
      - `itemOverdue` — overdue marker (repeat, state)
      - `itemCompany` — company link (repeat, explain-only: navigation)
      - `complete` — Complete (repeat, explain-only: changes data)
      - `reschedule` — Reschedule (repeat, try-it: opens modal)
      - `cancel` — Cancel follow-up (repeat, destructive, try-it: opens modal)
      - `reassign` — Reassign (repeat, needs `followups.manage` at scope TEAM or ALL, try-it: opens modal)
      - `actionModals` — the reschedule, cancel and reassign dialogs (group: action, component-scoped ids `followUps.modal.*`, shared with the client and deal pages)
      - `modalFields` — their fields (group: action, try-it)
      - `modalConfirm` — their confirm buttons (group: action, destructive-class, explain-only)
      - `empty` — no follow-ups (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/follow-ups` as page `followUps`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `followUps`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty list per tab. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** The overdue filter and salesperson filter change the list; the empty variant is explained.
   - **Error / retry (X):** Error step. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Team tab by scope; actions by `followups.manage`; Reassign only at scope TEAM or ALL.
   - **Dialogs, drawers, menus, nested workflows (D):** The action modals are hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Tabs / sections (T):** Tab scope. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Cancel carries a warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Completing a follow-up in another tab removes its row; if it was the exemplar the next row is picked.
   - The overdue badge in the sidebar (shared nav) is polled; not a tour concern.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Tabs by scope; filters; empty per tab; modal hand-offs; no data changes.
   - Regression: existing tests of `FollowUpsContent.tsx`, `FollowUpList.tsx`, `FollowUpQuickButtons.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Page is reachable from the sidebar badge flow and the tour works the same from there.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/followUps src/pages/followUps src/components/followUps
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "followUps"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 202.
15. **Dependencies and handoff:** unblocks S09. After this slice **Follow-ups is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

