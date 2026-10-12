# Support tour plan: slice document 6 of 6 (S55 to S68)

Part of the Interactive Support and Tour System plan. Overview, inventory, architecture, dependencies, traceability, testing, risks and the checklist are in [00-overview.md](00-overview.md). This document holds the full specifications of 14 slices. Section numbers such as "section 3.4" refer to the overview; the standard procedure (6.1) and the assumptions (0.2) are repeated here so the document can be used on its own.

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

## Page tours: dashboards, reports, inventory, notifications

<a id="s55"></a>

### S55: Dashboard: Sales Manager: complete tour

1. **Slice id and title:** S55. Dashboard: Sales Manager: complete tour. Branch `support-slice-55-dashboard-sales-manager-complete-tour`.
2. **Scope:** Manager-only additions to the shared frame. In scope: `frameRecap`, `salesperson`, `perSalesperson`, `personRow`, `numericColumns`, `valueColumn`, `followUpsColumn`, `reasons`, `tableEmpty`. Out of scope: every other page (item 16).
3. **Purpose:** Salesperson picker and the per-salesperson table. It lets a first-time user learn Dashboard: Sales Manager in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Dashboard: Sales Manager** (`/:tenantSlug/dashboard (role = SALES_MANAGER)`) and nothing else. A user who opens Support on this page can tour 9 steps in order, ask about any single control, and replay or leave. What the page is for: Team figures and per-salesperson comparison. What the tour walks through: Shared frame plus a salesperson select and a per-salesperson table (value and overdue columns appear only when the server returns them), with a reasons breakdown (confirm at slice start). What changes the tour at runtime: Value / follow-up columns exist only if the server returns them. Empty table. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Dashboard: Sales Manager** (`dashboard.salesManager`; `/:tenantSlug/dashboard (role = SALES_MANAGER)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S54 (Dashboard: Sales User: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/SalesManagerDashboard.tsx`.
6. **Production LOC estimate:** **~118** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16 + `includeFrame()` helper shared with the other role dashboards 14. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dashboardSalesManager.ts`
      - Change: Create the page guide with the 9 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'dashboard.salesManager', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'dashboard.salesManager.<id>', kind, safety, … }`. Steps in state-only elements: `valueColumn`, `followUpsColumn`, `reasons`, `tableEmpty`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['dashboard.salesManager']` in `pageRegistry.ts`; copy keys resolve to `supportOps:dashboard.salesManager.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dashboardSalesManager.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dashboardSalesManager.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'dashboard.salesManager': () => import('./guides/dashboardSalesManager')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'dashboard.salesManager'` on the entries for `dashboard` and delete `'dashboard.salesManager'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/SalesManagerDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesManager.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `SalesManagerDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L40 SelectInput (role.salesperson); L53 aria-label (role.perSalesperson).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `dashboard.salesManager.<step>.title` and `.body` for these steps: `frameRecap`, `salesperson`, `perSalesperson`, `personRow`, `numericColumns`, `valueColumn`, `followUpsColumn`, `reasons`, `tableEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `dashboard.salesManager.<step>.title` and `.body` for these steps in Albanian: `frameRecap`, `salesperson`, `perSalesperson`, `personRow`, `numericColumns`, `valueColumn`, `followUpsColumn`, `reasons`, `tableEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'dashboard.salesManager', route: 'dashboard' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "dashboard.salesManager"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dashboardSalesManager.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/dashboard/SalesManagerDashboard.tsx`.
   3. **PT-3 Annotate** about 8 sites in those files. Includes: `includeFrame()` helper shared with the other role dashboards.
   4. **PT-4 Write the guide**: 9 steps, in tour order (`<id>` becomes the copy key `supportOps:dashboard.salesManager.<id>.title|body`):
      - `frameRecap` — pointer to the shared frame guidance (include the shared steps via `includeFrame()`)
      - `salesperson` — salesperson picker (list is the unfiltered team, try-it)
      - `perSalesperson` — per-salesperson panel
      - `personRow` — one salesperson (repeat)
      - `numericColumns` — counts (repeat)
      - `valueColumn` — sales value, only if returned (state)
      - `followUpsColumn` — overdue follow-ups, only if returned (state)
      - `reasons` — lost-reason breakdown, if present (state)
      - `tableEmpty` — empty table (state)
   5. **PT-5 Register** `/:tenantSlug/dashboard (role = SALES_MANAGER)` as page `dashboard.salesManager`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `dashboard.salesManager`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty table. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Salesperson picker. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Permission- or workflow-dependent controls (A):** Value and overdue columns exist only if the server sends them (permission-driven).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The team list does not shrink when one person is picked (the page keeps it); the step explains that.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Columns present / absent.
   - Regression: existing tests of `SalesManagerDashboard.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Frame steps reused, not copied (lint: no duplicate keys).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dashboardSalesManager src/pages/dashboard
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "dashboard.salesManager"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 118.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Dashboard: Sales Manager is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s56"></a>

### S56: Dashboard: Administrator: complete tour

1. **Slice id and title:** S56. Dashboard: Administrator: complete tour. Branch `support-slice-56-dashboard-administrator-complete-tour`.
2. **Scope:** Four panels, no period selector. In scope: `frameRecap`, `pricingPanel`, `usersPanel`, `userRow`, `attentionPanel`, `attentionItem`, `changesPanel`, `changeRow`, `panelEmpty`. Out of scope: every other page (item 16).
3. **Purpose:** Describes the workspace now. It lets a first-time user learn Dashboard: Administrator in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Dashboard: Administrator** (`/:tenantSlug/dashboard (role = ADMINISTRATOR)`) and nothing else. A user who opens Support on this page can tour 9 steps in order, ask about any single control, and replay or leave. What the page is for: Workspace state now: pricing, users per role, items needing attention, recent changes. What the tour walks through: Four labelled panels (no period selector by design); tables inside. What changes the tour at runtime: Recent changes panel conditional. Empty panels. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Dashboard: Administrator** (`dashboard.administrator`; `/:tenantSlug/dashboard (role = ADMINISTRATOR)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S54 (Dashboard: Sales User: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/AdministratorDashboard.tsx`.
6. **Production LOC estimate:** **~104** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dashboardAdministrator.ts`
      - Change: Create the page guide with the 9 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'dashboard.administrator', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'dashboard.administrator.<id>', kind, safety, … }`. Steps in state-only elements: none. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['dashboard.administrator']` in `pageRegistry.ts`; copy keys resolve to `supportOps:dashboard.administrator.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dashboardAdministrator.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dashboardAdministrator.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'dashboard.administrator': () => import('./guides/dashboardAdministrator')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'dashboard.administrator'` on the entries for `dashboard` and delete `'dashboard.administrator'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/AdministratorDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.administrator.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AdministratorDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L23 permission check [audit.view]; L37 aria-label (role.admin.pricing); L69 aria-label (role.admin.usersPerRole); L95 aria-label (role.admin.attention); L117 aria-label (role.admin.recentChanges); L120 Link (role.admin.fullLog).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `dashboard.administrator.<step>.title` and `.body` for these steps: `frameRecap`, `pricingPanel`, `usersPanel`, `userRow`, `attentionPanel`, `attentionItem`, `changesPanel`, `changeRow`, `panelEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `dashboard.administrator.<step>.title` and `.body` for these steps in Albanian: `frameRecap`, `pricingPanel`, `usersPanel`, `userRow`, `attentionPanel`, `attentionItem`, `changesPanel`, `changeRow`, `panelEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'dashboard.administrator', route: 'dashboard' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "dashboard.administrator"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dashboardAdministrator.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/dashboard/AdministratorDashboard.tsx`.
   3. **PT-3 Annotate** about 8 sites in those files.
   4. **PT-4 Write the guide**: 9 steps, in tour order (`<id>` becomes the copy key `supportOps:dashboard.administrator.<id>.title|body`):
      - `frameRecap` — shared frame (no period selector here)
      - `pricingPanel` — pricing configuration status
      - `usersPanel` — users per role
      - `userRow` — a role row (repeat)
      - `attentionPanel` — items needing attention
      - `attentionItem` — one item (repeat, explain-only: navigation)
      - `changesPanel` — recent changes (conditional)
      - `changeRow` — one change (repeat)
      - `panelEmpty` — an empty panel (repeat, state)
   5. **PT-5 Register** `/:tenantSlug/dashboard (role = ADMINISTRATOR)` as page `dashboard.administrator`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `dashboard.administrator`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty panels. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** Recent changes conditional. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Panels render by data; each panel step is eligible only when its section exists.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Panels present / absent.
   - Regression: existing tests of `AdministratorDashboard.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dashboardAdministrator src/pages/dashboard
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "dashboard.administrator"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 104.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Dashboard: Administrator is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s57"></a>

### S57: Dashboard: CEO: complete tour

1. **Slice id and title:** S57. Dashboard: CEO: complete tour. Branch `support-slice-57-dashboard-ceo-complete-tour`.
2. **Scope:** CEO panels including the Wellness+ block. In scope: `frameRecap`, `teamPanel`, `teamRow`, `contractsPanel`, `contractRow`, `paymentsPanel`, `paymentRow`, `wellnessBlock`, `wellnessRenewals`, `wellnessRow`, `panelEmpty`. Out of scope: every other page (item 16).
3. **Purpose:** The Wellness+ block is workflow-dependent. It lets a first-time user learn Dashboard: CEO in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Dashboard: CEO** (`/:tenantSlug/dashboard (role = CEO)`) and nothing else. A user who opens Support on this page can tour 11 steps in order, ask about any single control, and replay or leave. What the page is for: Company-wide view: team, contracts, payments, and the Wellness+ block. What the tour walks through: Shared frame; panels for team, contracts, payments, Wellness+ (`data-block="wellnessPlus"`) and Wellness+ renewals; tables inside. What changes the tour at runtime: Wellness+ block only in the SALES_PROCESS workflow. Empty panels. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Dashboard: CEO** (`dashboard.ceo`; `/:tenantSlug/dashboard (role = CEO)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S54 (Dashboard: Sales User: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/CeoDashboard.tsx`.
6. **Production LOC estimate:** **~124** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 11 steps x 8 = 88 + 10 annotation sites x 2 = 20. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dashboardCeo.ts`
      - Change: Create the page guide with the 11 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'dashboard.ceo', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'dashboard.ceo.<id>', kind, safety, … }`. Steps in state-only elements: none. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['dashboard.ceo']` in `pageRegistry.ts`; copy keys resolve to `supportOps:dashboard.ceo.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dashboardCeo.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dashboardCeo.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'dashboard.ceo': () => import('./guides/dashboardCeo')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'dashboard.ceo'` on the entries for `dashboard` and delete `'dashboard.ceo'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/CeoDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.ceo.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CeoDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L52 aria-label (role.ceo.team); L91 aria-label (role.ceo.contracts); L119 aria-label (role.ceo.payments); L154 aria-label (role.ceo.wellnessPlus); L158 KpiTile (role.ceo.wellnessPlusActive); L162 aria-label (role.ceo.wellnessPlusRenewals).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `dashboard.ceo.<step>.title` and `.body` for these steps: `frameRecap`, `teamPanel`, `teamRow`, `contractsPanel`, `contractRow`, `paymentsPanel`, `paymentRow`, `wellnessBlock`, `wellnessRenewals`, `wellnessRow`, `panelEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `dashboard.ceo.<step>.title` and `.body` for these steps in Albanian: `frameRecap`, `teamPanel`, `teamRow`, `contractsPanel`, `contractRow`, `paymentsPanel`, `paymentRow`, `wellnessBlock`, `wellnessRenewals`, `wellnessRow`, `panelEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'dashboard.ceo', route: 'dashboard' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "dashboard.ceo"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dashboardCeo.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/dashboard/CeoDashboard.tsx`.
   3. **PT-3 Annotate** about 10 sites in those files.
   4. **PT-4 Write the guide**: 11 steps, in tour order (`<id>` becomes the copy key `supportOps:dashboard.ceo.<id>.title|body`):
      - `frameRecap` — shared frame
      - `teamPanel` — team results
      - `teamRow` — a row (repeat)
      - `contractsPanel` — contracts
      - `contractRow` — a row (repeat)
      - `paymentsPanel` — payments
      - `paymentRow` — a row (repeat)
      - `wellnessBlock` — Wellness+ block (needs the SALES_PROCESS workflow)
      - `wellnessRenewals` — Wellness+ renewals panel
      - `wellnessRow` — a row (repeat)
      - `panelEmpty` — an empty panel (repeat, state)
   5. **PT-5 Register** `/:tenantSlug/dashboard (role = CEO)` as page `dashboard.ceo`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `dashboard.ceo`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty panels. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** Wellness+ block by workflow. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - `data-block="wellnessPlus"` is reused as the annotation.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Workflow variants.
   - Regression: existing tests of `CeoDashboard.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dashboardCeo src/pages/dashboard
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "dashboard.ceo"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 124.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Dashboard: CEO is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s58"></a>

### S58: Dashboard: Business owner (fallback): complete tour

1. **Slice id and title:** S58. Dashboard: Business owner (fallback): complete tour. Branch `support-slice-58-dashboard-business-owner-fallback-complete-tour`.
2. **Scope:** Fallback owner dashboard. In scope: `title`, `viewAppointments`, `plan`, `statCards`, `recent`, `recentItem`, `viewAll`, `empty`, `loading`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Reachable only when the server cannot name a role dashboard; documented lean exception.
   - **Description.** This slice delivers the complete guided tour of **Dashboard: Business owner (fallback)** (`/:tenantSlug/dashboard (fallback, scope ALL)`) and nothing else. A user who opens Support on this page can tour 10 steps in order, ask about any single control, and replay or leave. What the page is for: Whole-tenant overview when the server cannot name a role dashboard; open appointments, plan, view all activity. What the tour walks through: View appointments; Plan; stat cards; recent-activity list with "view all". What changes the tour at runtime: Shown only as the fallback in `DashboardLanding`. Several loading / empty / error branches. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Dashboard: Business owner (fallback)** (`dashboard.legacyOwner`; `/:tenantSlug/dashboard (fallback, scope ALL)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/BusinessOwnerDashboard.tsx`, `pages/shell/BusinessOwnerShell.tsx`.
6. **Production LOC estimate:** **~114** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 10 steps x 8 = 80 + 9 annotation sites x 2 = 18. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dashboardLegacyOwner.ts`
      - Change: Create the page guide with the 10 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'dashboard.legacyOwner', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'dashboard.legacyOwner.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `loading`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['dashboard.legacyOwner']` in `pageRegistry.ts`; copy keys resolve to `supportOps:dashboard.legacyOwner.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dashboardLegacyOwner.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dashboardLegacyOwner.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'dashboard.legacyOwner': () => import('./guides/dashboardLegacyOwner')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'dashboard.legacyOwner'` on the entries for `dashboard` and delete `'dashboard.legacyOwner'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/BusinessOwnerDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.legacyOwner.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `BusinessOwnerDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L48 Button (viewSchedule); L51 Button (newAppointmentFull); L65 KPICard; L75 KPICard; L89 KPICard; L105 KPICard; L180 Button (viewAllActivity).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/shell/BusinessOwnerShell.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.legacyOwner.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `BusinessOwnerShell`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `dashboard.legacyOwner.<step>.title` and `.body` for these steps: `title`, `viewAppointments`, `plan`, `statCards`, `recent`, `recentItem`, `viewAll`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `dashboard.legacyOwner.<step>.title` and `.body` for these steps in Albanian: `title`, `viewAppointments`, `plan`, `statCards`, `recent`, `recentItem`, `viewAll`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'dashboard.legacyOwner', route: 'dashboard' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "dashboard.legacyOwner"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dashboardLegacyOwner.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/dashboard/BusinessOwnerDashboard.tsx`, `src/pages/shell/BusinessOwnerShell.tsx`.
   3. **PT-3 Annotate** about 9 sites in those files.
   4. **PT-4 Write the guide**: 10 steps, in tour order (`<id>` becomes the copy key `supportOps:dashboard.legacyOwner.<id>.title|body`):
      - `title` — heading
      - `viewAppointments` — View appointments (explain-only: navigation)
      - `plan` — Plan (explain-only: navigation)
      - `statCards` — stat cards (repeat)
      - `recent` — recent activity list
      - `recentItem` — an item (repeat)
      - `viewAll` — View all (explain-only: navigation)
      - `empty` — empty states (state)
      - `loading` — loading (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/dashboard (fallback, scope ALL)` as page `dashboard.legacyOwner`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `dashboard.legacyOwner`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Support resolves this variant only when `DashboardLanding` falls back.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Variant resolution on fallback.
   - Regression: existing tests of `BusinessOwnerDashboard.tsx`, `BusinessOwnerShell.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dashboardLegacyOwner src/pages/dashboard src/pages/shell
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "dashboard.legacyOwner"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 114.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Dashboard: Business owner (fallback) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s59"></a>

### S59: Dashboard: Staff (fallback): complete tour

1. **Slice id and title:** S59. Dashboard: Staff (fallback): complete tour. Branch `support-slice-59-dashboard-staff-fallback-complete-tour`.
2. **Scope:** Fallback staff dashboard. In scope: `title`, `scheduleFilter`, `export`, `viewCalendar`, `scheduleTable`, `scheduleRow`, `activityItem`, `viewAll`, `summaryCards`, `empty`, `loading`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Contains a disabled, unwired button that must not be explained as working. It lets a first-time user learn Dashboard: Staff (fallback) in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Dashboard: Staff (fallback)** (`/:tenantSlug/dashboard (fallback, scope OWN / TEAM)`) and nothing else. A user who opens Support on this page can tour 12 steps in order, ask about any single control, and replay or leave. What the page is for: Staff overview: today's schedule, activity, quick actions. What the tour walks through: Two filter-like buttons, Export, "view calendar", `StaffScheduleTable` rows, "view all activity". **`StaffScheduleTable` has several `disabled` "coming soon" controls (view calendar, per-row more, call, directions, mark complete) and one header button is `disabled` and unwired.** What changes the tour at runtime: Fallback only. Many loading / empty branches. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Dashboard: Staff (fallback)** (`dashboard.legacyStaff`; `/:tenantSlug/dashboard (fallback, scope OWN / TEAM)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/StaffDashboard.tsx`, `pages/shell/StaffShell.tsx`.
6. **Production LOC estimate:** **~134** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dashboardLegacyStaff.ts`
      - Change: Create the page guide with the 12 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'dashboard.legacyStaff', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'dashboard.legacyStaff.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `loading`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['dashboard.legacyStaff']` in `pageRegistry.ts`; copy keys resolve to `supportOps:dashboard.legacyStaff.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dashboardLegacyStaff.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dashboardLegacyStaff.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'dashboard.legacyStaff': () => import('./guides/dashboardLegacyStaff')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'dashboard.legacyStaff'` on the entries for `dashboard` and delete `'dashboard.legacyStaff'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/StaffDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.legacyStaff.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `StaffDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L81 button; L89 button; L112 Button (exportReport); L115 Button (exportReport); L124 KPICard (kpiNewClients); L141 KPICard (kpiAssignedClients); L161 KPICard (kpiOpenFollowUps); L187 Button (viewCalendar); L235 button; L245 button; L256 button; L305 Button (viewAllActivity).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/shell/StaffShell.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.legacyStaff.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `StaffShell`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `dashboard.legacyStaff.<step>.title` and `.body` for these steps: `title`, `scheduleFilter`, `export`, `viewCalendar`, `scheduleTable`, `scheduleRow`, `activityItem`, `viewAll`, `summaryCards`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `dashboard.legacyStaff.<step>.title` and `.body` for these steps in Albanian: `title`, `scheduleFilter`, `export`, `viewCalendar`, `scheduleTable`, `scheduleRow`, `activityItem`, `viewAll`, `summaryCards`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'dashboard.legacyStaff', route: 'dashboard' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "dashboard.legacyStaff"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dashboardLegacyStaff.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/dashboard/StaffDashboard.tsx`, `src/pages/shell/StaffShell.tsx`.
   3. **PT-3 Annotate** about 11 sites in those files.
   4. **PT-4 Write the guide**: 12 steps, in tour order (`<id>` becomes the copy key `supportOps:dashboard.legacyStaff.<id>.title|body`):
      - `title` — heading
      - `scheduleFilter` — the two filter-like buttons at the top (read at slice start)
      - `export` — Export (read at slice start; explain-only)
      - `viewCalendar` — View calendar (explain-only: navigation)
      - `scheduleTable` — today's schedule table (`StaffScheduleTable`; read-only rows)
      - `scheduleRow` — one schedule row (repeat)
      - `activityItem` — an activity item (repeat)
      - `viewAll` — View all activity (explain-only: navigation)
      - `summaryCards` — summary cards (repeat)
      - `empty` — empty states (state)
      - `loading` — loading (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/dashboard (fallback, scope OWN / TEAM)` as page `dashboard.legacyStaff`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `dashboard.legacyStaff`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - `StaffScheduleTable` contains several `disabled` "coming soon" controls (view calendar, per-row more, call, directions, mark complete); all are excluded and listed, and the test asserts none carries `data-tour`.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Asserts each disabled "coming soon" control has no `data-tour`.
   - Regression: existing tests of `StaffDashboard.tsx`, `StaffShell.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dashboardLegacyStaff src/pages/dashboard src/pages/shell
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "dashboard.legacyStaff"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 134.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Dashboard: Staff (fallback) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Disabled schedule button (`disabled`, no handler): left unannotated and unexplained (section 3.4).
   - `StaffScheduleTable` coming-soon buttons: view calendar, per-row more, call, directions, mark complete (`disabled`): left unannotated and unexplained (section 3.4).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s60"></a>

### S60: Notifications: complete tour

1. **Slice id and title:** S60. Notifications: complete tour. Branch `support-slice-60-notifications-complete-tour`.
2. **Scope:** Notification list. In scope: `title`, `markAllRead`, `list`, `item`, `unreadMarker`, `empty`, `loading`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Small page. Documented lean exception: its bell and panel are guided in the shell slice.
   - **Description.** This slice delivers the complete guided tour of **Notifications** (`/:tenantSlug/notifications`) and nothing else. A user who opens Support on this page can tour 8 steps in order, ask about any single control, and replay or leave. What the page is for: Read notifications, open one, mark all read. What the tour walks through: Mark all read; notification rows (buttons). What changes the tour at runtime: No role gate; rows scoped to the recipient server-side. Empty, loading, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Notifications** (`notifications`; `/:tenantSlug/notifications`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/notifications/NotificationsPage.tsx`, `pages/notifications/NotificationsContent.tsx`.
6. **Production LOC estimate:** **~94** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 8 steps x 8 = 64 + 7 annotation sites x 2 = 14. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/notifications.ts`
      - Change: Create the page guide with the 8 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'notifications', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'notifications.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `loading`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['notifications']` in `pageRegistry.ts`; copy keys resolve to `supportOps:notifications.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/notifications.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/notifications.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'notifications': () => import('./guides/notifications')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'notifications'` on the entries for `notifications` and delete `'notifications'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/notifications/NotificationsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('notifications.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `NotificationsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L63 Button (markAllRead); L82 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/notifications/NotificationsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `notifications.<step>.title` and `.body` for these steps: `title`, `markAllRead`, `list`, `item`, `unreadMarker`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `notifications.<step>.title` and `.body` for these steps in Albanian: `title`, `markAllRead`, `list`, `item`, `unreadMarker`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'notifications', route: 'notifications' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "notifications"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/notifications.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/notifications/NotificationsContent.tsx`.
   3. **PT-3 Annotate** about 7 sites in those files.
   4. **PT-4 Write the guide**: 8 steps, in tour order (`<id>` becomes the copy key `supportOps:notifications.<id>.title|body`):
      - `title` — heading
      - `markAllRead` — Mark all read (explain-only: changes read state)
      - `list` — notification list
      - `item` — a notification (repeat, explain-only: opens its target)
      - `unreadMarker` — unread marker (repeat, state)
      - `empty` — none (state)
      - `loading` — loading (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/notifications` as page `notifications`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `notifications`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New notifications arrive by polling; rows repeat.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Unread and read rows.
   - Regression: existing tests of `NotificationsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Read state unchanged after the tour.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/notifications src/pages/notifications
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "notifications"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 94.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Notifications is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s61"></a>

### S61: Reports: complete tour

1. **Slice id and title:** S61. Reports: complete tour. Branch `support-slice-61-reports-complete-tour`.
2. **Scope:** General reports page. In scope: `title`, `refresh`, `secondaryAction`, `monthlyRevenue`, `clientDistribution`, `inventoryValue`, `itemsHeld`, `appointmentStats`, `clientTrend`, `staffTable`, `staffRow`, `lowStock`, `lowStockRow`, `loading`, `error`, `empty`. Out of scope: every other page (item 16).
3. **Purpose:** Charts and tables with refresh. It lets a first-time user learn Reports in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Reports** (`/:tenantSlug/reports`) and nothing else. A user who opens Support on this page can tour 16 steps in order, ask about any single control, and replay or leave. What the page is for: Read revenue, client, inventory and appointment charts and tables; refresh. What the tour walks through: Refresh and one more header button; chart sections (monthly revenue, client distribution, inventory value, appointment stats, client trend), appointments-by-staff and low-stock tables. What changes the tour at runtime: Needs `reports.view`. Loading grid (`aria-busy`), two `role="alert"` banners. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Reports** (`reports`; `/:tenantSlug/reports`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/ReportsPage.tsx`.
6. **Production LOC estimate:** **~172** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/reports.ts`
      - Change: Create the page guide with the 16 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'reports', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'reports.<id>', kind, safety, … }`. Steps in state-only elements: `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['reports']` in `pageRegistry.ts`; copy keys resolve to `supportOps:reports.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/reports.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/reports.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'reports': () => import('./guides/reports')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'reports'` on the entries for `reports` and delete `'reports'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/ReportsPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('reports.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ReportsPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L163 aria-label (reports.loadingAria); L186 Button (reports.refresh); L189 Button; L202 role=alert; L208 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/ReportsPage.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `reports.<step>.title` and `.body` for these steps: `title`, `refresh`, `secondaryAction`, `monthlyRevenue`, `clientDistribution`, `inventoryValue`, `itemsHeld`, `appointmentStats`, `clientTrend`, `staffTable`, `staffRow`, `lowStock`, `lowStockRow`, `loading`, `error`, `empty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `reports.<step>.title` and `.body` for these steps in Albanian: `title`, `refresh`, `secondaryAction`, `monthlyRevenue`, `clientDistribution`, `inventoryValue`, `itemsHeld`, `appointmentStats`, `clientTrend`, `staffTable`, `staffRow`, `lowStock`, `lowStockRow`, `loading`, `error`, `empty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'reports', route: 'reports' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "reports"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/reports.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/ReportsPage.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files.
   4. **PT-4 Write the guide**: 16 steps, in tour order (`<id>` becomes the copy key `supportOps:reports.<id>.title|body`):
      - `title` — heading
      - `refresh` — Refresh (try-it: read-only)
      - `secondaryAction` — the second header button (read at slice start)
      - `monthlyRevenue` — revenue chart
      - `clientDistribution` — client distribution
      - `inventoryValue` — inventory value
      - `itemsHeld` — items held
      - `appointmentStats` — appointment stats
      - `clientTrend` — client trend
      - `staffTable` — appointments by staff
      - `staffRow` — a row (repeat)
      - `lowStock` — low-stock table
      - `lowStockRow` — a row (repeat)
      - `loading` — loading grid (`aria-busy`, state)
      - `error` — error banners (state)
      - `empty` — empty sections (repeat, state)
   5. **PT-5 Register** `/:tenantSlug/reports` as page `reports`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `reports`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty sections. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading grid. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Two banners. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `reports.view`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Charts are `role="img"` blocks; the tour reads their `aria-label` rather than re-describing data.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empty vs populated.
   - Regression: existing tests of `ReportsPage.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/reports src/pages
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "reports"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 172.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Reports is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s62"></a>

### S62: Inventory list: complete tour

1. **Slice id and title:** S62. Inventory list: complete tour. Branch `support-slice-62-inventory-list-complete-tour`.
2. **Scope:** Add product, search, four filters, clear, loading, error with retry, empty states. Rows (the "20 products" case), selection, bulk bar, adjust stock, delete confirmations, pagination.
3. **Purpose:** Shows both empty variants (no products vs filtered-empty with Clear). Reference slice for "adding 20 products needs no 20 steps".
   - **Description.** This slice delivers the complete guided tour of **Inventory list** (`/:tenantSlug/inventory`) and nothing else. A user who opens Support on this page can tour 36 steps in order, ask about any single control, and replay or leave. What the page is for: Find products, filter, select several for bulk actions, adjust stock, delete. What the tour walks through: Add product; search; category, warehouse, status, brand filters; Clear; `InventoryTable` with selectable rows and a per-row actions menu; bulk bar ("n selected" + three actions + Clear selection); error banner with Retry; Pagination; stock adjustment panel; two ConfirmDialogs. What changes the tour at runtime: Needs `inventory.manage`; bulk bar only while rows are selected. Empty vs filtered-empty (with Clear), error with Retry, loading. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Inventory list** (`inventory.list`; `/:tenantSlug/inventory`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/inventory/InventoryList/InventoryList.tsx`, `components/inventory/StockAdjustmentPanel`.
6. **Production LOC estimate:** **~378** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 36 steps x 8 = 288 + 32 annotation sites x 2 = 64 + Annotations in `InventoryList` rows, bulk bar and the stock indicator 10. Copy is JSON and not counted.
7. **File-Level Change Plan** (11 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/inventoryList.ts`
      - Change: Create the page guide with the 36 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'inventory.list', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`, `shared.pagination`. Each step: `{ id, target: 'inventory.list.<id>', kind, safety, … }`. Steps in state-only elements: `loading`, `error`, `emptyFirst`, `emptyFiltered`, `bulkBar`, `bulkCount`, `bulkActionA`, `bulkActionB`, `bulkActionC`, `bulkClear`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `menu`, `delete`, `bulk`.
      - Integration: Loaded lazily through `loaders['inventory.list']` in `pageRegistry.ts`; copy keys resolve to `supportOps:inventory.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/inventoryList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/inventoryList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'inventory.list': () => import('./guides/inventoryList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'inventory.list'` on the entries for `inventory` and delete `'inventory.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/inventory/InventoryList/InventoryList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InventoryList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L243 Button (list.addProduct); L254 KPICard; L261 TextInput (list.searchPlaceholder); L267 aria-label (list.searchAria); L270 SelectInput (list.filterCategoryAria); L274 aria-label (list.filterCategoryAria); L284 SelectInput (list.filterWarehouseAria); L288 aria-label (list.filterWarehouseAria); L298 SelectInput; L304 aria-label (list.filterStatusAria); L315 SelectInput (list.filterBrandAria); L319 aria-label (list.filterBrandAria); L331 Button; L344 button; L374 Button; L383 Button; L392 Button; L401 Button; L409 role=alert; L412 Button; L435 Button; L443 Button (list.clearFilters); L451 Pagination; L474 ConfirmDialog; L489 ConfirmDialog.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/components/inventory/InventoryTable/InventoryTable.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InventoryTable`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L219 DropdownMenu (list.actionsFor); L221 button (list.actionsFor); L238 DataTable; L246 DataTable empty prop (list.emptyFiltered).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/ui/MultiLocationStockIndicator/MultiLocationStockIndicator.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MultiLocationStockIndicator`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/inventory/StockAdjustmentPanel/StockAdjustmentPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `StockAdjustmentPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L103 SlideOver (stock.adjustTitle); L127 button (stock.tabAdjust); L134 button (stock.tabTransfer); L146 SelectInput (stock.selectLocation); L163 button; L169 button; L177 TextInput (stock.quantity); L190 button; L201 TextareaInput (stock.notesLabel); L213 SelectInput (stock.originLabel); L232 SelectInput (stock.destinationLabel); L246 TextInput (stock.transferQuantity); L265 Button; L266 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `inventory.list.<step>.title` and `.body` for these steps: `title`, `add`, `search`, `category`, `warehouse`, `status`, `brand`, `clear`, `loading`, `error`, `retry`, `emptyFirst`, `emptyFiltered`, `count`, `table`, `row`, `rowImage`, `rowName`, `rowStock`, `rowStatus`, `rowSelect`, `selectAll`, `bulkBar`, `bulkCount`, `bulkActionA`, `bulkActionB`, `bulkActionC`, `bulkClear`, `rowMenu`, `menuEdit`, `menuAdjust`, `menuDelete`, `stockAdjust`, `deleteConfirm`, `bulkConfirm`, `pagination`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `inventory.list.<step>.title` and `.body` for these steps in Albanian: `title`, `add`, `search`, `category`, `warehouse`, `status`, `brand`, `clear`, `loading`, `error`, `retry`, `emptyFirst`, `emptyFiltered`, `count`, `table`, `row`, `rowImage`, `rowName`, `rowStock`, `rowStatus`, `rowSelect`, `selectAll`, `bulkBar`, `bulkCount`, `bulkActionA`, `bulkActionB`, `bulkActionC`, `bulkClear`, `rowMenu`, `menuEdit`, `menuAdjust`, `menuDelete`, `stockAdjust`, `deleteConfirm`, `bulkConfirm`, `pagination`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'inventory.list', route: 'inventory' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "inventory.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/inventoryList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/inventory/InventoryList/InventoryList.tsx`.
   3. **PT-3 Annotate** about 32 sites in those files. Includes: Annotations in `InventoryList` rows, bulk bar and the stock indicator.
   4. **PT-4 Write the guide**: 36 steps, in tour order (`<id>` becomes the copy key `supportOps:inventory.list.<id>.title|body`):
      - `title` — heading
      - `add` — Add product (explain-only: navigation)
      - `search` — search (try-it)
      - `category` — category filter (try-it)
      - `warehouse` — warehouse filter (try-it)
      - `status` — status filter (try-it)
      - `brand` — brand filter (appears when brands exist) (try-it)
      - `clear` — Clear filters (while active)
      - `loading` — skeleton (state)
      - `error` — error banner (state)
      - `retry` — Retry (try-it: refetch is read-only)
      - `emptyFirst` — no products, with its Add action (state)
      - `emptyFiltered` — nothing matches, with Clear (state)
      - `count` — result count (info)
      - `table` — product table
      - `row` — one product (repeat, explain-only: navigation)
      - `rowImage` — thumbnail (repeat)
      - `rowName` — name and SKU (repeat)
      - `rowStock` — stock indicator across warehouses (repeat, MultiLocationStockIndicator)
      - `rowStatus` — status badge (repeat, shared.statusBadge)
      - `rowSelect` — selection checkbox (repeat, try-it)
      - `selectAll` — select all on this page (try-it)
      - `bulkBar` — bulk bar; exists only while rows are selected (state)
      - `bulkCount` — "n selected" (state)
      - `bulkActionA` — first bulk action (state, explain-only)
      - `bulkActionB` — second bulk action (state, explain-only)
      - `bulkActionC` — third bulk action (state, destructive-class, explain-only)
      - `bulkClear` — Clear selection (state, try-it)
      - `rowMenu` — row actions menu of `InventoryTable` (repeat, aria-label per product, try-it, opens the menu)
      - `menuEdit` — Edit (group: menu, explain-only: navigation)
      - `menuAdjust` — Adjust stock (group: menu, try-it: opens the stock adjustment panel)
      - `menuDelete` — Delete product (group: menu, destructive, explain-only)
      - `stockAdjust` — adjust stock panel (try-it: opens panel)
      - `deleteConfirm` — delete confirmation (group: delete, destructive)
      - `bulkConfirm` — bulk confirmation (group: bulk, destructive)
      - `pagination` — pagination (shared.pagination)
   5. **PT-5 Register** `/:tenantSlug/inventory` as page `inventory.list`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `inventory.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Skeleton. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows covered next. Twenty or two hundred products share the same row ids; the exemplar is the first row.
   - **Search / filtered results (F):** Filters. Selection survives filtering; bulk count describes the selection.
   - **Pagination / sorting (G):** Pagination covered in the next slice. Pagination.
   - **Error / retry (X):** Error + Retry. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `inventory.manage`. Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Stock panel and two ConfirmDialogs as hand-offs.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Brand filter appears only when brands exist.
   - Selecting rows (try-it) makes the bulk bar appear; the tour treats it as a runtime-appearing region and the bulk steps become eligible.
   - Deselecting removes them.
   - Paging to the next page keeps the same step list.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empties; error + retry; brand present / absent.
   - 0 / 1 / 20 / 200 products; selection toggling; bulk actions never executed.
   - Regression: existing tests of `InventoryList.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
   - Playwright creates 20 products via the API, runs the tour, step count equals the 1-product run.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/inventoryList src/pages/inventory/InventoryList src/components/inventory src/components/ui
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "inventory.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 378.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Inventory list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s63"></a>

### S63: Product form (create and edit): complete tour

1. **Slice id and title:** S63. Product form (create and edit): complete tour. Branch `support-slice-63-product-form-create-and-edit-complete`.
2. **Scope:** Create / edit, the first three section cards. Image manager, save / discard, delete.
3. **Purpose:** Product fields. Danger zone only in edit mode. It lets a first-time user learn Product form (create and edit) in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Product form (create and edit)** (`/:tenantSlug/inventory/new`, `/:tenantSlug/inventory/:productId/edit`) and nothing else. A user who opens Support on this page can tour 28 steps in order, ask about any single control, and replay or leave. What the page is for: Create or edit a product: information, pricing and stock, details, images; delete from the danger zone. What the tour walks through: Back; section cards (information, pricing and stock, details, danger zone); name, price inputs; category select; `WarehouseStockAllocation` (stock per warehouse); image manager; Discard; Save; delete ConfirmDialog. What changes the tour at runtime: Edit-only danger zone; needs `inventory.manage`. Field errors, saving, unsaved-changes confirm. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Product form (create and edit)** (`inventory.form`; `/:tenantSlug/inventory/new`, `/:tenantSlug/inventory/:productId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/inventory/ProductForm/ProductForm.tsx`, `components/inventory/ProductImageManager`.
6. **Production LOC estimate:** **~298** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 28 steps x 8 = 224 + 25 annotation sites x 2 = 50 + `ProductImageManager` annotations 8. Copy is JSON and not counted.
7. **File-Level Change Plan** (11 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/inventoryForm.ts`
      - Change: Create the page guide with the 28 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'inventory.form', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'inventory.form.<id>', kind, safety, … }`. Steps in state-only elements: `fieldErrors`, `saving`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `discard`, `delete`.
      - Integration: Loaded lazily through `loaders['inventory.form']` in `pageRegistry.ts`; copy keys resolve to `supportOps:inventory.form.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/inventoryForm.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/inventoryForm.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'inventory.form': () => import('./guides/inventoryForm')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'inventory.form'` on the entries for `inventory/new`, `inventory/:productId/edit` and delete `'inventory.form'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/inventory/ProductForm/ProductForm.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ProductForm`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L312 Button (form.backToInventory); L324 button (form.breadcrumbInventory); L352 TextInput (form.nameLabel); L362 TextInput; L370 TextInput; L384 TextareaInput; L392 SelectInput (form.categoryLabel); L418 TextInput (form.priceLabel); L431 TextInput; L444 TextInput; L542 Button; L554 Button; L585 Button (form.close); L588 Button; L600 ConfirmDialog (form.deleteTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/components/inventory/WarehouseStockAllocation/WarehouseStockAllocation.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `WarehouseStockAllocation`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L39 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/inventory/WarehouseStockAllocation/WarehouseStockRow.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `WarehouseStockRow`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L34 SelectInput (stock.warehouseLabel); L48 TextInput (stock.initialQuantity); L57 button (stock.removeRowAria); L61 aria-label (stock.removeRowAria).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/inventory/ProductImageManager/ProductImageManager.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('inventory.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ProductImageManager`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L135 aria-label (form.imagesAria); L200 aria-label; L230 button; L235 aria-label; L239 button; L244 aria-label; L248 button; L257 aria-label; L284 aria-label (form.addImagesAria); L298 input.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `inventory.form.<step>.title` and `.body` for these steps: `mode`, `back`, `name`, `sku`, `category`, `brand`, `description`, `price`, `cost`, `stockAllocation`, `allocationAdd`, `threshold`, `status`, `details`, `fieldErrors`, `images`, `imageAdd`, `imageThumb`, `imageMove`, `imageRemove`, `imageLimit`, `discard`, `discardConfirm`, `save`, `dangerZone`, `delete`, `deleteConfirm`, `saving`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `inventory.form.<step>.title` and `.body` for these steps in Albanian: `mode`, `back`, `name`, `sku`, `category`, `brand`, `description`, `price`, `cost`, `stockAllocation`, `allocationAdd`, `threshold`, `status`, `details`, `fieldErrors`, `images`, `imageAdd`, `imageThumb`, `imageMove`, `imageRemove`, `imageLimit`, `discard`, `discardConfirm`, `save`, `dangerZone`, `delete`, `deleteConfirm`, `saving`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'inventory.form', route: 'inventory/new' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "inventory.form"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/inventoryForm.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/inventory/ProductForm/ProductForm.tsx`.
   3. **PT-3 Annotate** about 25 sites in those files. Includes: `ProductImageManager` annotations.
   4. **PT-4 Write the guide**: 28 steps, in tour order (`<id>` becomes the copy key `supportOps:inventory.form.<id>.title|body`):
      - `mode` — create vs edit
      - `back` — Back to inventory (explain-only: navigation)
      - `name` — product name (try-it)
      - `sku` — SKU (try-it)
      - `category` — category select (try-it)
      - `brand` — brand (try-it)
      - `description` — description (try-it)
      - `price` — price (try-it)
      - `cost` — cost (try-it)
      - `stockAllocation` — stock per warehouse (`WarehouseStockAllocation`: one row per warehouse, repeat, try-it for the draft values)
      - `allocationAdd` — the allocation button (read at slice start; try-it, draft only)
      - `threshold` — low-stock threshold (try-it)
      - `status` — active toggle (try-it)
      - `details` — details card fields (read at slice start)
      - `fieldErrors` — validation (state)
      - `images` — image manager region
      - `imageAdd` — add image (explain-only: opens the file chooser)
      - `imageThumb` — an image (repeat)
      - `imageMove` — reorder (repeat, explain-only)
      - `imageRemove` — remove (repeat, destructive, explain-only)
      - `imageLimit` — limits and compression (info)
      - `discard` — Discard (explain-only)
      - `discardConfirm` — unsaved-changes confirm (group: discard)
      - `save` — Save (explain-only)
      - `dangerZone` — danger zone card (edit only)
      - `delete` — Delete product (destructive, try-it: opens confirm)
      - `deleteConfirm` — delete confirm (group: delete, destructive, explain-only)
      - `saving` — saving state (state)
   5. **PT-5 Register** `/:tenantSlug/inventory/new`, `/:tenantSlug/inventory/:productId/edit` as page `inventory.form`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `inventory.form`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No images. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Edit load. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Images repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** `inventory.manage`. Edit-only danger zone.
   - **Dialogs, drawers, menus, nested workflows (D):** Discard and delete confirms. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Errors. Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Warehouse rows depend on configured warehouses.
   - Images added by the user are repeated.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Create vs edit.
   - Create (no danger zone) vs edit.
   - Regression: existing tests of `ProductForm.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No product saved.
   - Zero mutations; no file chooser opened by the tour.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/inventoryForm src/pages/inventory/ProductForm src/components/inventory
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "inventory.form"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 298.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Product form (create and edit) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

## Page tours: platform administration (Super Admin)

<a id="s64"></a>

### S64: Platform: Tenants: complete tour

1. **Slice id and title:** S64. Platform: Tenants: complete tour. Branch `support-slice-64-platform-tenants-complete-tour`.
2. **Scope:** Tenant list, create, suspend / reactivate, delete with typed slug. In scope: `title`, `newTenant`, `table`, `row`, `rowStatus`, `rowActions`, `suspend`, `delete`, `createModal`, `createFields`, `createSave`, `statusConfirm`, `statusOk`, `deleteConfirm`, `deleteSlug`, `deleteOk`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** First platform-administration page; confirms the host works under `SuperAdminShell`, which has no `TenantGuard`.
   - **Description.** This slice delivers the complete guided tour of **Platform: Tenants** (`/admin/tenants`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: List workspaces, create one, suspend / reactivate, delete (type the slug to confirm). What the tour walks through: New tenant; `TenantManagementTable` rows with actions (exact set read at slice start); CreateTenantModal; suspend / reactivate ConfirmDialog; delete ConfirmDialog with a typed-slug input. What changes the tour at runtime: Role `SUPER_ADMIN`; suspend vs reactivate by state. Empty, `role="alert"` errors. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Platform: Tenants** (`admin.tenants`; `/admin/tenants`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/admin/TenantsPage.tsx`, `components/widgets/TenantManagementTable`, `pages/admin/CreateTenantModal.tsx`.
6. **Production LOC estimate:** **~202** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Annotations in `TenantManagementTable` and `CreateTenantModal` 10. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/adminTenants.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'admin.tenants', version: 1, namespace: 'supportAdmin', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'admin.tenants.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `create`, `status`, `delete`.
      - Integration: Loaded lazily through `loaders['admin.tenants']` in `pageRegistry.ts`; copy keys resolve to `supportAdmin:admin.tenants.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/adminTenants.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/adminTenants.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'admin.tenants': () => import('./guides/adminTenants')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'admin.tenants'` on the entries for `/admin/tenants` and delete `'admin.tenants'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/admin/TenantsPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.tenants.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TenantsPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L100 Button; L112 role=alert; L121 role=alert; L159 ConfirmDialog; L185 ConfirmDialog (superAdmin.confirmDeleteTitle); L198 input; L211 role=alert (superAdmin.confirmDeleteMismatch).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/components/widgets/TenantManagementTable/TenantManagementTable.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.tenants.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TenantManagementTable`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L116 DropdownMenu; L119 button (superAdmin.tenantActionsFor); L122 aria-label (superAdmin.tenantActionsFor); L193 button (superAdmin.viewAllTenants); L199 DataTable (superAdmin.tableCaption); L206 DataTable empty prop (superAdmin.emptyTitle).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/widgets/TenantManagementTable/TenantManagementTable.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/pages/admin/CreateTenantModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.tenants.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CreateTenantModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L110 Modal (superAdmin.createTenantTitle); L111 form (superAdmin.createTenantIntro); L114 TextInput (superAdmin.fieldCompanyName); L123 TextInput (superAdmin.fieldUrlSlug); L135 TextInput (superAdmin.fieldOwnerEmail); L155 role=alert; L161 Button (superAdmin.cancel); L164 Button (superAdmin.creating).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/locales/en/supportAdmin.json`
      - Change: Add `admin.tenants.<step>.title` and `.body` for these steps: `title`, `newTenant`, `table`, `row`, `rowStatus`, `rowActions`, `suspend`, `delete`, `createModal`, `createFields`, `createSave`, `statusConfirm`, `statusOk`, `deleteConfirm`, `deleteSlug`, `deleteOk`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportAdmin.json`
      - Change: Add `admin.tenants.<step>.title` and `.body` for these steps in Albanian: `title`, `newTenant`, `table`, `row`, `rowStatus`, `rowActions`, `suspend`, `delete`, `createModal`, `createFields`, `createSave`, `statusConfirm`, `statusOk`, `deleteConfirm`, `deleteSlug`, `deleteOk`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'admin.tenants', route: '/admin/tenants' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "admin.tenants"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/adminTenants.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/admin/TenantsPage.tsx`, `src/pages/admin/CreateTenantModal.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: Annotations in `TenantManagementTable` and `CreateTenantModal`.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportAdmin:admin.tenants.<id>.title|body`):
      - `title` — heading and tenant count
      - `newTenant` — New tenant (try-it: opens modal)
      - `table` — tenant table (`TenantManagementTable`)
      - `row` — one tenant (repeat)
      - `rowStatus` — active / suspended badge (repeat, shared.statusBadge)
      - `rowActions` — row actions (read at slice start; one step per action)
      - `suspend` — Suspend / Reactivate (repeat, destructive-class, try-it: opens confirm)
      - `delete` — Delete tenant (repeat, destructive, try-it: opens confirm)
      - `createModal` — create tenant dialog (group: create)
      - `createFields` — name, slug, owner email (group: create, try-it)
      - `createSave` — Create (group: create, explain-only)
      - `statusConfirm` — suspend / reactivate confirm (group: status, vars: dialog title)
      - `statusOk` — confirm (group: status, destructive-class, explain-only)
      - `deleteConfirm` — delete confirm (group: delete, destructive)
      - `deleteSlug` — type the slug to enable the button (group: delete, try-it)
      - `deleteOk` — Delete (group: delete, disabledHint until the slug matches, destructive, explain-only)
      - `empty` — no tenants (state)
      - `error` — action errors (state)
   5. **PT-5 Register** `/admin/tenants` as page `admin.tenants`, **PT-6 Copy** in namespace `supportAdmin`, **PT-7 End-to-end row** `admin.tenants`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** None. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Dialogs, drawers, menus, nested workflows (D):** Three dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Slug match. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Suspend and delete warned: workspace users lose access.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New tenants appear as rows.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Typed-slug confirm stays disabled; create dialog hand-off.
   - Regression: existing tests of `TenantsPage.tsx`, `CreateTenantModal.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations; works for a SUPER_ADMIN session with no tenant slug.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/adminTenants src/pages/admin src/components/widgets
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "admin.tenants"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 202.
15. **Dependencies and handoff:** unblocks S68. After this slice **Platform: Tenants is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s65"></a>

### S65: Platform: People: complete tour

1. **Slice id and title:** S65. Platform: People: complete tour. Branch `support-slice-65-platform-people-complete-tour`.
2. **Scope:** Search, role and status filters, table, per-user menu. Invite and the confirmation dialogs.
3. **Purpose:** Platform-wide users. Data-changing dialogs; confirm buttons explain-only. It lets a first-time user learn Platform: People in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Platform: People** (`/admin/people`) and nothing else. A user who opens Support on this page can tour 27 steps in order, ask about any single control, and replay or leave. What the page is for: Search platform users, filter, invite, change role, deactivate / reactivate, delete. What the tour walks through: Search; two selects; Invite; DataTable with a per-user actions menu; several ConfirmDialogs (one has radio inputs); the invite modal. Exact list read at slice start. What changes the tour at runtime: Role `SUPER_ADMIN`. Empty, loading, errors. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Platform: People** (`admin.people`; `/admin/people`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/admin/PeoplePage.tsx`, `pages/admin/InviteUserModal.tsx`.
6. **Production LOC estimate:** **~292** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 27 steps x 8 = 216 + 24 annotation sites x 2 = 48 + Annotations in `InviteUserModal` and the inline dialogs 12. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/adminPeople.ts`
      - Change: Create the page guide with the 27 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'admin.people', version: 1, namespace: 'supportAdmin', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'admin.people.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `emptyNoMatch`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `menu`, `invite`, `role`, `deactivate`, `delete`, `all`.
      - Integration: Loaded lazily through `loaders['admin.people']` in `pageRegistry.ts`; copy keys resolve to `supportAdmin:admin.people.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/adminPeople.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/adminPeople.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'admin.people': () => import('./guides/adminPeople')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'admin.people'` on the entries for `/admin/people` and delete `'admin.people'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/admin/PeoplePage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.people.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PeoplePage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L280 DropdownMenu; L283 button (superAdmin.userActionsFor); L286 aria-label (superAdmin.userActionsFor); L333 Button; L347 TextInput (superAdmin.filterSearch); L357 SelectInput (superAdmin.filterWorkspace); L370 SelectInput (superAdmin.filterRole); L383 role=alert; L389 role=alert; L394 DataTable (superAdmin.peopleTableCaption); L400 DataTable empty prop (superAdmin.peopleEmptyTitle); L416 ConfirmDialog (superAdmin.confirmSuspendUserTitle); L439 role=alert; L448 ConfirmDialog (superAdmin.confirmReactivateUserTitle); L472 input; L496 ConfirmDialog (superAdmin.confirmDeleteUserTitle); L521 input; L535 role=alert; L575 SelectInput (superAdmin.newBusinessOwner).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/admin/InviteUserModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.people.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InviteUserModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L91 Modal (superAdmin.inviteUserTitle); L92 form; L97 SelectInput (superAdmin.fieldRole); L112 SelectInput (superAdmin.fieldWorkspace); L127 TextInput (superAdmin.fieldUserEmail); L137 role=alert; L143 Button (superAdmin.cancel); L146 Button (superAdmin.sendingInvite).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/locales/en/supportAdmin.json`
      - Change: Add `admin.people.<step>.title` and `.body` for these steps: `title`, `invite`, `search`, `roleFilter`, `statusFilter`, `table`, `row`, `rowStatus`, `rowMenu`, `menuChangeRole`, `menuDeactivate`, `menuDelete`, `empty`, `emptyNoMatch`, `error`, `inviteModal`, `inviteEmail`, `inviteRole`, `inviteSend`, `roleDialog`, `roleOptions`, `roleOk`, `deactivateDialog`, `deactivateOk`, `deleteDialog`, `deleteOk`, `dialogError`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportAdmin.json`
      - Change: Add `admin.people.<step>.title` and `.body` for these steps in Albanian: `title`, `invite`, `search`, `roleFilter`, `statusFilter`, `table`, `row`, `rowStatus`, `rowMenu`, `menuChangeRole`, `menuDeactivate`, `menuDelete`, `empty`, `emptyNoMatch`, `error`, `inviteModal`, `inviteEmail`, `inviteRole`, `inviteSend`, `roleDialog`, `roleOptions`, `roleOk`, `deactivateDialog`, `deactivateOk`, `deleteDialog`, `deleteOk`, `dialogError`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'admin.people', route: '/admin/people' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "admin.people"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/adminPeople.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/admin/PeoplePage.tsx`, `src/pages/admin/InviteUserModal.tsx`.
   3. **PT-3 Annotate** about 24 sites in those files. Includes: Annotations in `InviteUserModal` and the inline dialogs.
   4. **PT-4 Write the guide**: 27 steps, in tour order (`<id>` becomes the copy key `supportAdmin:admin.people.<id>.title|body`):
      - `title` — heading
      - `invite` — Invite (try-it: opens modal)
      - `search` — search (try-it)
      - `roleFilter` — role filter (try-it)
      - `statusFilter` — status filter (try-it)
      - `table` — users table
      - `row` — one user (repeat)
      - `rowStatus` — role and status badges (repeat, shared.statusBadge)
      - `rowMenu` — user actions (repeat, per-email `aria-label`, try-it: opens menu)
      - `menuChangeRole` — Change role (group: menu, explain-only)
      - `menuDeactivate` — Deactivate / Reactivate (group: menu, destructive-class, explain-only)
      - `menuDelete` — Delete (group: menu, destructive, explain-only)
      - `empty` — none (state)
      - `emptyNoMatch` — no match (state)
      - `error` — error (state)
      - `inviteModal` — invite dialog (group: invite)
      - `inviteEmail` — email (group: invite, try-it)
      - `inviteRole` — role (group: invite, try-it)
      - `inviteSend` — Send (group: invite, explain-only)
      - `roleDialog` — change role dialog with radios (group: role)
      - `roleOptions` — role radios (group: role, repeat, try-it)
      - `roleOk` — Save (group: role, explain-only)
      - `deactivateDialog` — deactivate / reactivate confirm (group: deactivate, vars: dialog title)
      - `deactivateOk` — confirm (group: deactivate, destructive-class, explain-only)
      - `deleteDialog` — delete confirm (group: delete)
      - `deleteOk` — Delete (group: delete, destructive, explain-only)
      - `dialogError` — dialog error text (group: all, state)
   5. **PT-5 Register** `/admin/people` as page `admin.people`, **PT-6 Copy** in namespace `supportAdmin`, **PT-7 End-to-end row** `admin.people`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Error / retry (X):** Error. Dialog errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Five dialogs as hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. Delete and deactivate warned.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Rows re-pick after filtering.
   - Radio set follows platform roles.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Filters; menu.
   - Each dialog hand-off.
   - Regression: existing tests of `PeoplePage.tsx`, `InviteUserModal.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/adminPeople src/pages/admin
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "admin.people"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 292.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Platform: People is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s66"></a>

### S66: Platform: Settings: complete tour

1. **Slice id and title:** S66. Platform: Settings: complete tour. Branch `support-slice-66-platform-settings-complete-tour`.
2. **Scope:** Platform defaults and bulk apply. In scope: `title`, `scopeAll`, `scopeSelected`, `chooseTenants`, `pickerModal`, `pickerSearch`, `pickerRow`, `pickerOk`, `language`, `defaults`, `checkbox`, `scopeSummary`, `apply`, `applyConfirm`, `applyOk`, `saved`, `error`, `loading`. Out of scope: every other page (item 16).
3. **Purpose:** Bulk apply changes many tenants at once: the strongest warning in the phase. It lets a first-time user learn Platform: Settings in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Platform: Settings** (`/admin/setting`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: Set platform defaults and apply them in bulk to all or selected tenants. What the tour walks through: Scope radios (all / selected); "choose tenants" button + picker Modal; native selects for defaults; checkbox; scope summary; Apply (ConfirmDialog). What changes the tour at runtime: Role `SUPER_ADMIN`. Loading, summary, confirm. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Platform: Settings** (`admin.settings`; `/admin/setting`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S36 (Settings: Company: complete tour). Existing code it relies on, unchanged since planning: `pages/admin/PlatformSettingsPage.tsx`, `pages/admin/TenantPickerModal.tsx`.
6. **Production LOC estimate:** **~192** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/adminSettings.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'admin.settings', version: 1, namespace: 'supportAdmin', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'admin.settings.<id>', kind, safety, … }`. Steps in state-only elements: `scopeSummary`, `saved`, `error`, `loading`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `picker`, `apply`.
      - Integration: Loaded lazily through `loaders['admin.settings']` in `pageRegistry.ts`; copy keys resolve to `supportAdmin:admin.settings.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/adminSettings.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/adminSettings.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'admin.settings': () => import('./guides/adminSettings')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'admin.settings'` on the entries for `/admin/setting` and delete `'admin.settings'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/admin/PlatformSettingsPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.settings.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PlatformSettingsPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L139 input; L153 input; L169 Button (superAdmin.selectTenants); L203 select; L223 select; L240 select; L263 select; L308 input; L324 role=status (superAdmin.applyingToPlatform); L333 Button; L354 ConfirmDialog.
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/admin/TenantPickerModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.settings.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TenantPickerModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L79 Modal (superAdmin.selectTenantsTitle); L81 TextInput (superAdmin.selectTenantsSearchPlaceholder); L85 aria-label (superAdmin.selectTenantsSearchPlaceholder); L91 input; L113 input; L129 Button (superAdmin.cancel); L132 Button (superAdmin.applySelection).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/locales/en/supportAdmin.json`
      - Change: Add `admin.settings.<step>.title` and `.body` for these steps: `title`, `scopeAll`, `scopeSelected`, `chooseTenants`, `pickerModal`, `pickerSearch`, `pickerRow`, `pickerOk`, `language`, `defaults`, `checkbox`, `scopeSummary`, `apply`, `applyConfirm`, `applyOk`, `saved`, `error`, `loading`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportAdmin.json`
      - Change: Add `admin.settings.<step>.title` and `.body` for these steps in Albanian: `title`, `scopeAll`, `scopeSelected`, `chooseTenants`, `pickerModal`, `pickerSearch`, `pickerRow`, `pickerOk`, `language`, `defaults`, `checkbox`, `scopeSummary`, `apply`, `applyConfirm`, `applyOk`, `saved`, `error`, `loading`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'admin.settings', route: '/admin/setting' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "admin.settings"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/adminSettings.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/admin/PlatformSettingsPage.tsx`, `src/pages/admin/TenantPickerModal.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportAdmin:admin.settings.<id>.title|body`):
      - `title` — heading
      - `scopeAll` — apply to all tenants (radio, try-it)
      - `scopeSelected` — apply to selected tenants (radio, try-it)
      - `chooseTenants` — choose tenants (try-it: opens picker)
      - `pickerModal` — tenant picker dialog (group: picker)
      - `pickerSearch` — search (group: picker, try-it)
      - `pickerRow` — a tenant (group: picker, repeat, try-it)
      - `pickerOk` — Done (group: picker, explain-only)
      - `language` — platform default language (`LanguagePicker`, try-it)
      - `defaults` — the defaults selects (one step each, read at slice start) (try-it)
      - `checkbox` — the option checkbox (try-it)
      - `scopeSummary` — what will be affected (state)
      - `apply` — Apply (explain-only, strongest warning)
      - `applyConfirm` — apply confirm (group: apply, destructive-class)
      - `applyOk` — Confirm (group: apply, explain-only)
      - `saved` — saved (state)
      - `error` — error (state)
      - `loading` — loading (state)
   5. **PT-5 Register** `/admin/setting` as page `admin.settings`, **PT-6 Copy** in namespace `supportAdmin`, **PT-7 End-to-end row** `admin.settings`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Dialogs, drawers, menus, nested workflows (D):** Picker and confirm. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Apply is bulk and effectively irreversible.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Picker rows are repeated.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Scope summary; picker; apply never executed.
   - Regression: existing tests of `PlatformSettingsPage.tsx`, `TenantPickerModal.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/adminSettings src/pages/admin
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "admin.settings"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 192.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Platform: Settings is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s67"></a>

### S67: Platform: My profile: complete tour

1. **Slice id and title:** S67. Platform: My profile: complete tour. Branch `support-slice-67-platform-my-profile-complete-tour`.
2. **Scope:** Platform administrator profile. In scope: `title`, `firstName`, `lastName`, `email`, `saveProfile`, `currentPassword`, `newPassword`, `confirmPassword`, `changePassword`, `extraAction`, `confirmDialog`, `confirmOk`, `errors`. Out of scope: every other page (item 16).
3. **Purpose:** Same shape as the tenant profile. It lets a first-time user learn Platform: My profile in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Platform: My profile** (`/admin/profile`) and nothing else. A user who opens Support on this page can tour 13 steps in order, ask about any single control, and replay or leave. What the page is for: Edit my details and password. What the tour walks through: Profile inputs + Save; password inputs + Change; one further action button guarded by a ConfirmDialog that contains an input (exact action read at slice start). What changes the tour at runtime: Role `SUPER_ADMIN`. Saving, errors. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Platform: My profile** (`admin.profile`; `/admin/profile`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/admin/AdminProfilePage.tsx`.
6. **Production LOC estimate:** **~144** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/adminProfile.ts`
      - Change: Create the page guide with the 13 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'admin.profile', version: 1, namespace: 'supportAdmin', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'admin.profile.<id>', kind, safety, … }`. Steps in state-only elements: `errors`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `confirm`.
      - Integration: Loaded lazily through `loaders['admin.profile']` in `pageRegistry.ts`; copy keys resolve to `supportAdmin:admin.profile.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/adminProfile.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/adminProfile.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'admin.profile': () => import('./guides/adminProfile')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'admin.profile'` on the entries for `/admin/profile` and delete `'admin.profile'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/admin/AdminProfilePage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.profile.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AdminProfilePage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L153 form (profile.firstName); L155 TextInput (profile.firstName); L161 TextInput (profile.lastName); L169 TextInput (profile.email); L177 Button; L197 form (profile.currentPassword); L198 TextInput (profile.currentPassword); L205 TextInput (profile.newPassword); L212 TextInput (profile.confirmPassword); L222 Button (profile.changePasswordTitle); L251 Button; L265 ConfirmDialog; L275 TextInput; L284 role=alert.
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportAdmin.json`
      - Change: Add `admin.profile.<step>.title` and `.body` for these steps: `title`, `firstName`, `lastName`, `email`, `saveProfile`, `currentPassword`, `newPassword`, `confirmPassword`, `changePassword`, `extraAction`, `confirmDialog`, `confirmOk`, `errors`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportAdmin.json`
      - Change: Add `admin.profile.<step>.title` and `.body` for these steps in Albanian: `title`, `firstName`, `lastName`, `email`, `saveProfile`, `currentPassword`, `newPassword`, `confirmPassword`, `changePassword`, `extraAction`, `confirmDialog`, `confirmOk`, `errors`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'admin.profile', route: '/admin/profile' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "admin.profile"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/adminProfile.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/admin/AdminProfilePage.tsx`.
   3. **PT-3 Annotate** about 12 sites in those files.
   4. **PT-4 Write the guide**: 13 steps, in tour order (`<id>` becomes the copy key `supportAdmin:admin.profile.<id>.title|body`):
      - `title` — heading
      - `firstName` — first name (try-it)
      - `lastName` — last name (try-it)
      - `email` — email (try-it)
      - `saveProfile` — Save (explain-only)
      - `currentPassword` — current password (try-it)
      - `newPassword` — new password (try-it)
      - `confirmPassword` — confirm (try-it)
      - `changePassword` — Change password (explain-only)
      - `extraAction` — further guarded action (read at slice start)
      - `confirmDialog` — its confirm dialog (group: confirm)
      - `confirmOk` — confirm (group: confirm, destructive-class, explain-only)
      - `errors` — errors (state)
   5. **PT-5 Register** `/admin/profile` as page `admin.profile`, **PT-6 Copy** in namespace `supportAdmin`, **PT-7 End-to-end row** `admin.profile`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Saving. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Dialogs, drawers, menus, nested workflows (D):** One confirm dialog. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - None beyond forms.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Hand-off.
   - Regression: existing tests of `AdminProfilePage.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/adminProfile src/pages/admin
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "admin.profile"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 144.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Platform: My profile is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s68"></a>

### S68: Platform dashboard (Super Admin): complete tour

1. **Slice id and title:** S68. Platform dashboard (Super Admin): complete tour. Branch `support-slice-68-platform-dashboard-super-admin-complete-tour`.
2. **Scope:** Super Admin dashboard. Also the last slice of the phase: it empties `PLANNED_PAGES` and enables the "no planned pages remain" guard.
3. **Purpose:** Closes coverage (SUP-20). It lets a first-time user learn Platform dashboard (Super Admin) in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Platform dashboard (Super Admin)** (`/admin`, `/admin/dashboard`) and nothing else. A user who opens Support on this page can tour 9 steps in order, ask about any single control, and replay or leave. What the page is for: Platform overview; jump to create a tenant. What the tour walks through: New tenant button; summary cards and a recent list (contents read at slice start). What changes the tour at runtime: Role `SUPER_ADMIN` (outside the permission system). Loading / empty branches. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Platform dashboard (Super Admin)** (`admin.dashboard`; `/admin`, `/admin/dashboard`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S64 (Platform: Tenants: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/SuperAdminDashboard.tsx`, `pages/shell/SuperAdminShell.tsx`.
6. **Production LOC estimate:** **~110** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16 + Remove the final id from `PLANNED_PAGES` and turn the `it.todo` guard into a real test 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/adminDashboard.ts`
      - Change: Create the page guide with the 9 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'admin.dashboard', version: 1, namespace: 'supportAdmin', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'admin.dashboard.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `loading`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['admin.dashboard']` in `pageRegistry.ts`; copy keys resolve to `supportAdmin:admin.dashboard.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/adminDashboard.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/adminDashboard.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'admin.dashboard': () => import('./guides/adminDashboard')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'admin.dashboard'` on the entries for `/admin`, `/admin/dashboard` and delete `'admin.dashboard'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/SuperAdminDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.dashboard.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `SuperAdminDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L156 Button (superAdmin.newTenant); L171 KPICard (superAdmin.activeTenants); L182 KPICard (superAdmin.globalMrr); L190 KPICard (superAdmin.systemHealth).
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/shell/SuperAdminShell.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('admin.dashboard.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `SuperAdminShell`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by `SuperAdminShell`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/locales/en/supportAdmin.json`
      - Change: Add `admin.dashboard.<step>.title` and `.body` for these steps: `title`, `newTenant`, `summaryCards`, `recent`, `recentItem`, `viewAll`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportAdmin.json`
      - Change: Add `admin.dashboard.<step>.title` and `.body` for these steps in Albanian: `title`, `newTenant`, `summaryCards`, `recent`, `recentItem`, `viewAll`, `empty`, `loading`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportAdmin')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'admin.dashboard', route: '/admin' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "admin.dashboard"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/adminDashboard.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/dashboard/SuperAdminDashboard.tsx`, `src/pages/shell/SuperAdminShell.tsx`.
   3. **PT-3 Annotate** about 8 sites in those files. Includes: Remove the final id from `PLANNED_PAGES` and turn the `it.todo` guard into a real test.
   4. **PT-4 Write the guide**: 9 steps, in tour order (`<id>` becomes the copy key `supportAdmin:admin.dashboard.<id>.title|body`):
      - `title` — heading
      - `newTenant` — New tenant (explain-only: navigation)
      - `summaryCards` — platform summary cards (repeat, read at slice start)
      - `recent` — recent tenants in `TenantManagementTable` (component-scoped ids `tenantTable.*`, annotated with the tenants page)
      - `recentItem` — a tenant row with its actions menu (repeat, explain-only: navigation)
      - `viewAll` — View all (explain-only: navigation)
      - `empty` — empty (state)
      - `loading` — loading (state)
      - `error` — error (state)
   5. **PT-5 Register** `/admin`, `/admin/dashboard` as page `admin.dashboard`, **PT-6 Copy** in namespace `supportAdmin`, **PT-7 End-to-end row** `admin.dashboard`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Tenants created while the tour is exited appear as new rows with the same repeated id; the summary cards are re-read on each render.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Phase guard: `PLANNED_PAGES` is empty and every `routeMap` page has a loader; every guide passes lint; every guide key exists in en and sq.
   - Regression: existing tests of `SuperAdminDashboard.tsx`, `SuperAdminShell.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Section 5.10 checklist is re-run against the merged code and recorded in the PR.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/adminDashboard src/pages/dashboard src/pages/shell
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "admin.dashboard"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 110.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Platform dashboard (Super Admin) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

