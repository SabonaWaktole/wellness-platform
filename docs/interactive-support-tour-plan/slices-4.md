# Support tour plan: slice document 4 of 6 (S31 to S42)

Part of the Interactive Support and Tour System plan. Overview, inventory, architecture, dependencies, traceability, testing, risks and the checklist are in [00-overview.md](00-overview.md). This document holds the full specifications of 12 slices. Section numbers such as "section 3.4" refer to the overview; the standard procedure (6.1) and the assumptions (0.2) are repeated here so the document can be used on its own.

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

## Page tours: Wellness+ membership

<a id="s31"></a>

### S31: Membership payments: complete tour

1. **Slice id and title:** S31. Membership payments: complete tour. Branch `support-slice-31-membership-payments-complete-tour`.
2. **Scope:** Payments list. In scope: `title`, `export`, `from`, `to`, `tier`, `kind`, `method`, `status`, `clear`, `summary`, `table`, `row`, `receiptLink`, `voidedMarker`, `pagination`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Totals exclude voided payments; the tour states that. It lets a first-time user learn Membership payments in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Membership payments** (`/:tenantSlug/members/payments`) and nothing else. A user who opens Support on this page can tour 17 steps in order, ask about any single control, and replay or leave. What the page is for: Filter payments, read totals (voided excluded), export CSV, open a receipt. What the tour walks through: Export CSV; from / to; tier, kind, method, status selects; Clear; summary; table with receipt link; Pagination. What changes the tour at runtime: Needs `members.payments.view`. Empty, loading, `role="alert"` failure, summary. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Membership payments** (`members.payments`; `/:tenantSlug/members/payments`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/MemberPaymentsPage.tsx`, `pages/membership/MemberPaymentsContent.tsx`.
6. **Production LOC estimate:** **~182** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersPayments.ts`
      - Change: Create the page guide with the 17 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.payments', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.pagination`. Each step: `{ id, target: 'members.payments.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['members.payments']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.payments.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersPayments.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersPayments.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.payments': () => import('./guides/membersPayments')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.payments'` on the entries for `members/payments` and delete `'members.payments'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/MemberPaymentsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.payments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MemberPaymentsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L105 Button (payments.page.exportCsv); L113 TextInput (payments.page.from); L114 TextInput (payments.page.to); L115 SelectInput (payments.page.tier); L121 SelectInput (payments.page.kind); L127 SelectInput (payments.page.method); L133 SelectInput (payments.page.status); L139 Button (list.filters.clear); L146 role=status (payments.page.summary); L168 role=alert (payments.page.loadFailed); L183 button (payments.openReceipt); L220 Pagination.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/membership/MemberPaymentsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.payments.<step>.title` and `.body` for these steps: `title`, `export`, `from`, `to`, `tier`, `kind`, `method`, `status`, `clear`, `summary`, `table`, `row`, `receiptLink`, `voidedMarker`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.payments.<step>.title` and `.body` for these steps in Albanian: `title`, `export`, `from`, `to`, `tier`, `kind`, `method`, `status`, `clear`, `summary`, `table`, `row`, `receiptLink`, `voidedMarker`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.payments', route: 'members/payments' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.payments"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersPayments.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/MemberPaymentsContent.tsx`.
   3. **PT-3 Annotate** about 15 sites in those files.
   4. **PT-4 Write the guide**: 17 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.payments.<id>.title|body`):
      - `title` — heading and summary (`role="status"`)
      - `export` — Export CSV (try-it: read-only download)
      - `from` — from date (try-it)
      - `to` — to date (try-it)
      - `tier` — tier filter (try-it)
      - `kind` — kind filter (try-it)
      - `method` — method filter (try-it)
      - `status` — status filter (try-it)
      - `clear` — Clear filters (while active)
      - `summary` — totals; voided excluded (info)
      - `table` — payments table
      - `row` — one payment (repeat)
      - `receiptLink` — open the receipt (repeat, try-it)
      - `voidedMarker` — voided marker (repeat, state)
      - `pagination` — pagination (shared.pagination)
      - `empty` — none (state)
      - `error` — load failed (state)
   5. **PT-5 Register** `/:tenantSlug/members/payments` as page `members.payments`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.payments`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.payments.view`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Export disabled with zero rows: disabled hint.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Filters; empties; export disabled.
   - Regression: existing tests of `MemberPaymentsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations; receipts open read-only.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersPayments src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.payments"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 182.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Membership payments is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s32"></a>

### S32: Membership reports: complete tour

1. **Slice id and title:** S32. Membership reports: complete tour. Branch `support-slice-32-membership-reports-complete-tour`.
2. **Scope:** Filters, figure sections, working lists, exports. In scope: `title`, `tier`, `segment`, `employer`, `area`, `city`, `clear`, `section`, `sectionToggle`, `sectionExport`, `sectionChart`, `sectionTable`, `list`, `listExport`, `listEmpty`, `error`, `definitions`. Out of scope: every other page (item 16).
3. **Purpose:** Sections are generated from `reportSections.ts`, so steps are generated per section, not per figure.
   - **Description.** This slice delivers the complete guided tour of **Membership reports** (`/:tenantSlug/members/reports`) and nothing else. A user who opens Support on this page can tour 17 steps in order, ask about any single control, and replay or leave. What the page is for: Filter by tier, segment, employer, area, city; read figure sections (chart / table toggle) and working lists; export each as CSV. What the tour walks through: Five filters + Clear; report sections with chart/table toggle (`aria-pressed`) and per-section CSV; working-list panels with CSV. What changes the tour at runtime: Needs `members.reports.view`. Loading, `role="alert"` error, empty lists. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Membership reports** (`members.reports`; `/:tenantSlug/members/reports`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/reports/MembershipReportsPage.tsx`, `pages/membership/reports/MembershipReportsContent.tsx`, `pages/membership/reports/reportSections.ts`.
6. **Production LOC estimate:** **~190** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30 + `data-report` section ids mapped onto `tourId` for the generated sections 8. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersReports.ts`
      - Change: Create the page guide with the 17 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.reports', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'members.reports.<id>', kind, safety, … }`. Steps in state-only elements: `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['members.reports']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.reports.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersReports.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersReports.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.reports': () => import('./guides/membersReports')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.reports'` on the entries for `members/reports` and delete `'members.reports'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/reports/MembershipReportsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.reports.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MembershipReportsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L48 aria-label (reports.view); L50 button (reports.${choice}); L56 Button (reports.exportSection); L127 Button (reports.exportSection); L148 Link; L282 SelectInput (reports.filters.tier); L290 SelectInput (reports.filters.segment); L295 SelectInput (reports.filters.employer); L303 SelectInput (reports.filters.area); L311 SelectInput (reports.filters.city); L320 Button (list.filters.clear); L328 role=alert (reports.page.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/membership/reports/reportSections.ts`
      - Change: Open the file and annotate the elements the steps name.
      - Implementation details: (non-component module: read it to find the render site)
      - Integration: Consumed by the page components listed in section 3.
      - Removal: No removal.
      - Verification: Guide test.
   7. **Leave unchanged** `src/pages/membership/reports/MembershipReportsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   8. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.reports.<step>.title` and `.body` for these steps: `title`, `tier`, `segment`, `employer`, `area`, `city`, `clear`, `section`, `sectionToggle`, `sectionExport`, `sectionChart`, `sectionTable`, `list`, `listExport`, `listEmpty`, `error`, `definitions`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.reports.<step>.title` and `.body` for these steps in Albanian: `title`, `tier`, `segment`, `employer`, `area`, `city`, `clear`, `section`, `sectionToggle`, `sectionExport`, `sectionChart`, `sectionTable`, `list`, `listExport`, `listEmpty`, `error`, `definitions`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.reports', route: 'members/reports' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.reports"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersReports.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/reports/MembershipReportsContent.tsx`, `src/pages/membership/reports/reportSections.ts`.
   3. **PT-3 Annotate** about 15 sites in those files. Includes: `data-report` section ids mapped onto `tourId` for the generated sections.
   4. **PT-4 Write the guide**: 17 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.reports.<id>.title|body`):
      - `title` — heading
      - `tier` — tier filter (try-it)
      - `segment` — segment filter (try-it)
      - `employer` — employer filter (try-it)
      - `area` — area filter (try-it)
      - `city` — city filter (try-it)
      - `clear` — Clear filters (while active)
      - `section` — a figure section (repeat, from `reportSections`)
      - `sectionToggle` — chart / table toggle (repeat, `aria-pressed`, try-it)
      - `sectionExport` — Export CSV (repeat, try-it: read-only)
      - `sectionChart` — chart (repeat)
      - `sectionTable` — table (repeat)
      - `list` — a working list panel (repeat)
      - `listExport` — list CSV (repeat, try-it)
      - `listEmpty` — empty list (repeat, state)
      - `error` — load failed (state)
      - `definitions` — how figures are defined (info, links to the definitions)
   5. **PT-5 Register** `/:tenantSlug/members/reports` as page `members.reports`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.reports`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty lists. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Sections and lists repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters change every section. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.reports.view`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - A new report section added to `reportSections.ts` is covered automatically because the section step is `repeat`.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Sections generated from the real list; filters.
   - Regression: existing tests of `MembershipReportsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Downloads only on user press after Exit.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersReports src/pages/membership/reports
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.reports"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 190.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Membership reports is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s33"></a>

### S33: Verify member (Reception): complete tour

1. **Slice id and title:** S33. Verify member (Reception): complete tour. Branch `support-slice-33-verify-member-reception-complete-tour`.
2. **Scope:** Scan and search. In scope: `title`, `scan`, `scanPermission`, `search`, `query`, `submit`, `candidates`, `candidate`, `result`, `resultActions`, `checking`, `noMatches`, `failed`. Out of scope: every other page (item 16).
3. **Purpose:** Camera use is the only browser-permission feature; the tour never starts the camera.
   - **Description.** This slice delivers the complete guided tour of **Verify member (Reception)** (`/:tenantSlug/members/verify`) and nothing else. A user who opens Support on this page can tour 13 steps in order, ask about any single control, and replay or leave. What the page is for: Scan a card with the camera or search by name / number and see Valid / Not valid. What the tour walks through: Scan button (camera), search form (`role="search"`), candidate buttons, result panel with actions. What changes the tour at runtime: Needs `members.verify`; camera needs browser permission and HTTPS. Idle, checking (`role="status"`), no matches, failed, result. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Verify member (Reception)** (`members.verify`; `/:tenantSlug/members/verify`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/VerifyMemberPage.tsx`, `pages/membership/verify/VerifyMemberContent.tsx`, `pages/membership/verify/QrScanner.tsx`, `pages/membership/verify/ReceptionResult.tsx`.
6. **Production LOC estimate:** **~144** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **File-Level Change Plan** (11 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersVerify.ts`
      - Change: Create the page guide with the 13 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.verify', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'members.verify.<id>', kind, safety, … }`. Steps in state-only elements: `result`, `resultActions`, `checking`, `noMatches`, `failed`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['members.verify']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.verify.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersVerify.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersVerify.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.verify': () => import('./guides/membersVerify')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.verify'` on the entries for `members/verify` and delete `'members.verify'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/verify/VerifyMemberContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.verify.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `VerifyMemberContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L92 button (verify.scan); L95 form (verify.searchLabel); L98 input (verify.search); L99 button (verify.search); L103 role=status (verify.checking); L104 role=alert (verify.failed); L108 role=status (verify.noMatches); L115 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/membership/verify/QrScanner.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.verify.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `QrScanner`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L110 role=alert (verify.cameraLabel); L113 aria-label (verify.cameraLabel); L114 role=status (verify.notACard); L117 button (verify.stopScan).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/membership/verify/QrScanner.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/pages/membership/verify/ReceptionResult.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.verify.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ReceptionResult`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L42 role=status (verify.notFound); L43 button (verify.another); L52 role=status (verify.valid); L86 button (verify.identityConfirmed); L89 button (verify.identityMismatch); L93 role=status (verify.identityFailed); L94 role=alert (verify.identityFailed); L96 button (verify.another).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Leave unchanged** `src/pages/membership/VerifyMemberPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   9. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.verify.<step>.title` and `.body` for these steps: `title`, `scan`, `scanPermission`, `search`, `query`, `submit`, `candidates`, `candidate`, `result`, `resultActions`, `checking`, `noMatches`, `failed`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.verify.<step>.title` and `.body` for these steps in Albanian: `title`, `scan`, `scanPermission`, `search`, `query`, `submit`, `candidates`, `candidate`, `result`, `resultActions`, `checking`, `noMatches`, `failed`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.verify', route: 'members/verify' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.verify"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersVerify.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/verify/VerifyMemberContent.tsx`, `src/pages/membership/verify/QrScanner.tsx`, `src/pages/membership/verify/ReceptionResult.tsx`.
   3. **PT-3 Annotate** about 12 sites in those files.
   4. **PT-4 Write the guide**: 13 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.verify.<id>.title|body`):
      - `title` — what Valid / Not valid means
      - `scan` — Scan a card (explain-only: starting the camera needs a browser prompt)
      - `scanPermission` — camera permission and HTTPS note (info)
      - `search` — search form (try-it, `role="search"`)
      - `query` — query field, at least two characters (try-it)
      - `submit` — Search (explain-only: it is a read-only lookup but the submit lock applies)
      - `candidates` — candidate list (repeat)
      - `candidate` — one candidate (repeat, try-it)
      - `result` — the Valid / Not valid result panel (state)
      - `resultActions` — result buttons (state, explain-only)
      - `checking` — checking state (state)
      - `noMatches` — no matches (state)
      - `failed` — failed lookup (state)
   5. **PT-5 Register** `/:tenantSlug/members/verify` as page `members.verify`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.verify`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Checking state. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Search / filtered results (F):** Search results. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Error / retry (X):** Failure. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.verify`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Scanner overlay is never started by the tour.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Results appear after the user searches; their steps are eligible then.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Scanner not started; search hand-off.
   - Regression: existing tests of `VerifyMemberContent.tsx`, `QrScanner.tsx`, `ReceptionResult.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No camera stream opened by the tour (getUserMedia spy).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersVerify src/pages/membership/verify
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.verify"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 144.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Verify member (Reception) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s34"></a>

### S34: Employee upload: complete tour

1. **Slice id and title:** S34. Employee upload: complete tour. Branch `support-slice-34-employee-upload-complete-tour`.
2. **Scope:** Upload flow, preview, outcome and history. In scope: `title`, `template`, `companySearch`, `companyMatch`, `companyChosen`, `noContract`, `file`, `upload`, `preview`, `previewTable`, `previewRow`, `confirm`, `cancel`, `outcome`, `downloadResult`, `another`, `history`, `historyRow`, `historyDownload`, `error`, `historyEmpty`. Out of scope: every other page (item 16).
3. **Purpose:** A multi-stage page: stage steps are state-driven. It lets a first-time user learn Employee upload in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Employee upload** (`/:tenantSlug/members/employee-upload`) and nothing else. A user who opens Support on this page can tour 21 steps in order, ask about any single control, and replay or leave. What the page is for: Pick a company with a valid contract, upload a spreadsheet, preview created / linked / skipped / error rows, confirm, download the result, review history. What the tour walks through: Download template; company search + results + "change"; file input; Upload; preview counts and table; Confirm; Cancel; result panel (download, "upload another"); history table with downloads. What changes the tour at runtime: Needs `members.import`; confirm disabled when nothing would be created or linked. Idle, uploading, preview, outcome, `role="alert"` error, empty history. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Employee upload** (`members.employeeUpload`; `/:tenantSlug/members/employee-upload`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/EmployeeUploadPage.tsx`, `pages/membership/EmployeeUploadContent.tsx`.
6. **Production LOC estimate:** **~230** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 21 steps x 8 = 168 + 19 annotation sites x 2 = 38 + Stage markers (`idle | preview | outcome`) on the three regions 8. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersEmployeeUpload.ts`
      - Change: Create the page guide with the 21 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.employeeUpload', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'members.employeeUpload.<id>', kind, safety, … }`. Steps in state-only elements: `companyChosen`, `noContract`, `preview`, `outcome`, `error`, `historyEmpty`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['members.employeeUpload']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.employeeUpload.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersEmployeeUpload.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersEmployeeUpload.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.employeeUpload': () => import('./guides/membersEmployeeUpload')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.employeeUpload'` on the entries for `members/employee-upload` and delete `'members.employeeUpload'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/EmployeeUploadContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.employeeUpload.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `EmployeeUploadContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L174 Button (employees.template); L187 Button (employees.change); L192 TextInput (employees.search); L204 button; L216 input; L229 Button (employees.upload); L234 role=alert; L242 aria-label (employees.preview.counts); L267 Button (employees.confirm); L268 Button (employees.cancel); L275 role=status (employees.result.title); L280 Button (employees.result.download); L281 Button (employees.result.another); L314 Button (employees.result.download).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/membership/EmployeeUploadPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.employeeUpload.<step>.title` and `.body` for these steps: `title`, `template`, `companySearch`, `companyMatch`, `companyChosen`, `noContract`, `file`, `upload`, `preview`, `previewTable`, `previewRow`, `confirm`, `cancel`, `outcome`, `downloadResult`, `another`, `history`, `historyRow`, `historyDownload`, `error`, `historyEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.employeeUpload.<step>.title` and `.body` for these steps in Albanian: `title`, `template`, `companySearch`, `companyMatch`, `companyChosen`, `noContract`, `file`, `upload`, `preview`, `previewTable`, `previewRow`, `confirm`, `cancel`, `outcome`, `downloadResult`, `another`, `history`, `historyRow`, `historyDownload`, `error`, `historyEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.employeeUpload', route: 'members/employee-upload' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.employeeUpload"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersEmployeeUpload.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/EmployeeUploadContent.tsx`.
   3. **PT-3 Annotate** about 19 sites in those files. Includes: Stage markers (`idle | preview | outcome`) on the three regions.
   4. **PT-4 Write the guide**: 21 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.employeeUpload.<id>.title|body`):
      - `title` — what the upload does
      - `template` — Download template (try-it: read-only)
      - `companySearch` — company search (try-it)
      - `companyMatch` — a match (repeat, explain-only)
      - `companyChosen` — chosen company and change (state)
      - `noContract` — company has no valid contract (state)
      - `file` — file input (try-it: opens the browser file chooser only for the user)
      - `upload` — Upload (explain-only)
      - `preview` — preview counts (state)
      - `previewTable` — preview rows (repeat)
      - `previewRow` — one row (repeat) with New / Existing / Skipped / Error marks
      - `confirm` — Confirm (disabled when nothing would be created or linked, explain-only)
      - `cancel` — Cancel (explain-only)
      - `outcome` — result panel (state)
      - `downloadResult` — download error file (try-it: read-only)
      - `another` — Upload another (explain-only)
      - `history` — history table
      - `historyRow` — one upload (repeat)
      - `historyDownload` — download (repeat, try-it)
      - `error` — error text (state)
      - `historyEmpty` — no uploads (state)
   5. **PT-5 Register** `/:tenantSlug/members/employee-upload` as page `members.employeeUpload`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.employeeUpload`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty history. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Uploading and busy states. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Preview and history rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.import`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Validation and submission (V):** File and company required; confirm disabled hint.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Stage changes (idle -> preview -> outcome) are driven by the user; steps for other stages are skipped without comment.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Each stage via msw; confirm disabled variant.
   - Regression: existing tests of `EmployeeUploadContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No spreadsheet is uploaded.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersEmployeeUpload src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.employeeUpload"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 230.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Employee upload is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s35"></a>

### S35: VIP requests: complete tour

1. **Slice id and title:** S35. VIP requests: complete tour. Branch `support-slice-35-vip-requests-complete-tour`.
2. **Scope:** Approver queue. In scope: `title`, `status`, `table`, `row`, `memberLink`, `requestedBy`, `approve`, `reject`, `decisionDialog`, `decisionComment`, `decisionConfirm`, `ownRequest`, `pagination`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Short page; decision dialog covered in detail on the member page, referenced here.
   - **Description.** This slice delivers the complete guided tour of **VIP requests** (`/:tenantSlug/members/vip-requests`) and nothing else. A user who opens Support on this page can tour 15 steps in order, ask about any single control, and replay or leave. What the page is for: Approvers review pending VIP requests and approve or reject with a comment. What the tour walks through: Status select; table with member link; Approve / Reject per row; decision dialog; Pagination. What changes the tour at runtime: Needs `members.vip.approve`; an approver cannot approve their own request (server rule). Empty, loading, `role="alert"` failure. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **VIP requests** (`members.vipRequests`; `/:tenantSlug/members/vip-requests`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S30 (Member detail: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/VipRequestsPage.tsx`, `pages/membership/VipRequestsContent.tsx`, `pages/membership/VipDecisionDialog.tsx`.
6. **Production LOC estimate:** **~164** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 15 steps x 8 = 120 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersVipRequests.ts`
      - Change: Create the page guide with the 15 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.vipRequests', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.pagination`. Each step: `{ id, target: 'members.vipRequests.<id>', kind, safety, … }`. Steps in state-only elements: `ownRequest`, `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `decision`.
      - Integration: Loaded lazily through `loaders['members.vipRequests']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.vipRequests.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersVipRequests.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersVipRequests.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.vipRequests': () => import('./guides/membersVipRequests')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.vipRequests'` on the entries for `members/vip-requests` and delete `'members.vipRequests'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/VipRequestsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.vipRequests.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `VipRequestsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L72 SelectInput (vip.columns.status); L81 role=alert (vip.list.loadFailed); L101 button (vip.status.${r.status}); L115 Button (vip.decide.approve); L116 Button (vip.decide.reject); L128 Pagination.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/membership/VipDecisionDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.vipRequests.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `VipDecisionDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L46 Modal (vip.decide.requestedWith); L50 TextareaInput; L60 role=alert (vip.decide.cancel); L62 Button (vip.decide.cancel); L63 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Leave unchanged** `src/pages/membership/VipRequestsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   8. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.vipRequests.<step>.title` and `.body` for these steps: `title`, `status`, `table`, `row`, `memberLink`, `requestedBy`, `approve`, `reject`, `decisionDialog`, `decisionComment`, `decisionConfirm`, `ownRequest`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.vipRequests.<step>.title` and `.body` for these steps in Albanian: `title`, `status`, `table`, `row`, `memberLink`, `requestedBy`, `approve`, `reject`, `decisionDialog`, `decisionComment`, `decisionConfirm`, `ownRequest`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.vipRequests', route: 'members/vip-requests' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.vipRequests"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersVipRequests.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/VipRequestsContent.tsx`, `src/pages/membership/VipDecisionDialog.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files.
   4. **PT-4 Write the guide**: 15 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.vipRequests.<id>.title|body`):
      - `title` — heading
      - `status` — status filter (try-it)
      - `table` — requests table
      - `row` — one request (repeat)
      - `memberLink` — open the member (repeat, explain-only: navigation)
      - `requestedBy` — requester and reason (repeat)
      - `approve` — Approve (repeat, try-it: opens dialog)
      - `reject` — Reject (repeat, try-it: opens dialog)
      - `decisionDialog` — decision dialog (group: decision)
      - `decisionComment` — comment (group: decision, try-it)
      - `decisionConfirm` — Confirm (group: decision, explain-only)
      - `ownRequest` — own request cannot be approved (state)
      - `pagination` — pagination (shared.pagination)
      - `empty` — none waiting (state)
      - `error` — load failed (state)
   5. **PT-5 Register** `/:tenantSlug/members/vip-requests` as page `members.vipRequests`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.vipRequests`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Status filter. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.vip.approve`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Dialog. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Comment. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Decided requests leave the pending list.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empty, 1, 30 rows; dialog.
   - Regression: existing tests of `VipRequestsContent.tsx`, `VipDecisionDialog.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No decision recorded.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersVipRequests src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.vipRequests"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 164.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **VIP requests is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

## Page tours: Settings and form builder

<a id="s36"></a>

### S36: Settings: Company: complete tour

1. **Slice id and title:** S36. Settings: Company: complete tour. Branch `support-slice-36-settings-company-complete-tour`.
2. **Scope:** Company settings page, with the settings side navigation. In scope: `sectionNav`, `breadcrumb`, `companyName`, `address`, `city`, `state`, `postalCode`, `contactFields`, `optionSelects`, `language`, `toggle`, `discard`, `discardDisabled`, `save`, `savedNotice`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** First settings page; also guides the `SettingsLayout` section list once for all settings pages.
   - **Description.** This slice delivers the complete guided tour of **Settings: Company** (`/:tenantSlug/settings`) and nothing else. A user who opens Support on this page can tour 16 steps in order, ask about any single control, and replay or leave. What the page is for: Edit the company profile and workspace options; save or discard. What the tour walks through: Breadcrumb; text inputs (name, address, city, state, postal code and more); four native selects (options to be read at slice start); the workspace `LanguagePicker`; one checkbox; Discard; Save. What changes the tour at runtime: Section reachable with `settings.manage` (SettingsLayout nav). Loading, saving, saved, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Company** (`settings.company`; `/:tenantSlug/settings`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/AccountSettingsPage.tsx`, `components/layout/SettingsLayout/SettingsLayout.tsx`.
6. **Production LOC estimate:** **~186** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28 + `SettingsLayout` nav annotation (items repeat per rendered section) 10 + `LanguagePicker` annotated with component-scoped ids (`language.*`), reused by the profile and platform settings pages 4. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsCompany.ts`
      - Change: Create the page guide with the 16 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.company', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.company.<id>', kind, safety, … }`. Steps in state-only elements: `savedNotice`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.company']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.company.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsCompany.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsCompany.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.company': () => import('./guides/settingsCompany')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.company'` on the entries for `settings` and delete `'settings.company'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/AccountSettingsPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.company.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AccountSettingsPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L114 permission check [settings.manage]; L198 aria-label (breadcrumb); L262 TextInput (company.profile.nameLabel); L269 TextInput (company.profile.registrationNumberLabel); L279 TextInput (company.profile.addressLabel); L287 TextInput (company.profile.city); L294 TextInput (company.profile.state); L301 TextInput (company.profile.postalCode); L317 TextInput (company.profile.contactEmailLabel); L325 TextInput (company.profile.contactPhoneLabel); L348 select; L372 select; L397 select; L420 select; L469 input; L489 Button; L492 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/AccountSettingsPage.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/settings/LanguagePicker.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.company.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `LanguagePicker`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L41 select.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/settings/LanguagePicker.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/components/layout/SettingsLayout/SettingsLayout.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.company.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `SettingsLayout`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L88 Link; L114 Link.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/layout/SettingsLayout/SettingsLayout.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   8. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.company.<step>.title` and `.body` for these steps: `sectionNav`, `breadcrumb`, `companyName`, `address`, `city`, `state`, `postalCode`, `contactFields`, `optionSelects`, `language`, `toggle`, `discard`, `discardDisabled`, `save`, `savedNotice`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.company.<step>.title` and `.body` for these steps in Albanian: `sectionNav`, `breadcrumb`, `companyName`, `address`, `city`, `state`, `postalCode`, `contactFields`, `optionSelects`, `language`, `toggle`, `discard`, `discardDisabled`, `save`, `savedNotice`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.company', route: 'settings' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.company"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsCompany.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/AccountSettingsPage.tsx`, `src/components/settings/LanguagePicker.tsx`, `src/components/layout/SettingsLayout/SettingsLayout.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files. Includes: `SettingsLayout` nav annotation (items repeat per rendered section); `LanguagePicker` annotated with component-scoped ids (`language.*`), reused by the profile and platform settings pages.
   4. **PT-4 Write the guide**: 16 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.company.<id>.title|body`):
      - `sectionNav` — the settings section list (permission-filtered) (repeat items)
      - `breadcrumb` — breadcrumb (explain-only: navigation)
      - `companyName` — company name (try-it)
      - `address` — address line (try-it)
      - `city` — city (try-it)
      - `state` — state / region (try-it)
      - `postalCode` — postal code (try-it)
      - `contactFields` — remaining contact inputs (read at slice start, one step each)
      - `optionSelects` — the four native selects (one step each, labels read at slice start)
      - `language` — workspace language picker (`LanguagePicker`, a native select; try-it)
      - `toggle` — the checkbox option (try-it)
      - `discard` — Discard changes (disabled until saved once, explain-only)
      - `discardDisabled` — why Discard is disabled (disabledHint)
      - `save` — Save changes (explain-only: submit)
      - `savedNotice` — saved confirmation (state)
      - `error` — save error (state)
   5. **PT-5 Register** `/:tenantSlug/settings` as page `settings.company`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.company`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Form loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Section visible with `settings.manage`.
   - **Validation and submission (V):** Save locked during the tour. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The section list differs per user (permission and minimum scope); the exemplar rule applies.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Admin vs limited user section list; discard hint.
   - Regression: existing tests of `AccountSettingsPage.tsx`, `LanguagePicker.tsx`, `SettingsLayout.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Nothing saved.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsCompany src/pages/settings src/components/settings src/components/layout/SettingsLayout
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.company"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 186.
15. **Dependencies and handoff:** unblocks S37, S66. After this slice **Settings: Company is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s37"></a>

### S37: Settings: My profile: complete tour

1. **Slice id and title:** S37. Settings: My profile: complete tour. Branch `support-slice-37-settings-my-profile-complete-tour`.
2. **Scope:** Profile and password. In scope: `breadcrumb`, `avatar`, `firstName`, `lastName`, `email`, `phone`, `language`, `saveProfile`, `currentPassword`, `newPassword`, `confirmPassword`, `changePassword`, `profileError`, `passwordError`, `saved`. Out of scope: every other page (item 16).
3. **Purpose:** Available to every tenant user. It lets a first-time user learn Settings: My profile in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: My profile** (`/:tenantSlug/settings/profile`) and nothing else. A user who opens Support on this page can tour 15 steps in order, ask about any single control, and replay or leave. What the page is for: Edit my details, avatar and password. What the tour walks through: Breadcrumb; profile inputs + Save; password inputs + Change password. What changes the tour at runtime: Available to every tenant user (no permission). Saving, success, field errors. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: My profile** (`settings.profile`; `/:tenantSlug/settings/profile`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S36 (Settings: Company: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/profile/ProfilePage.tsx`.
6. **Production LOC estimate:** **~164** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 15 steps x 8 = 120 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsProfile.ts`
      - Change: Create the page guide with the 15 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.profile', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.profile.<id>', kind, safety, … }`. Steps in state-only elements: `profileError`, `passwordError`, `saved`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.profile']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.profile.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsProfile.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsProfile.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.profile': () => import('./guides/settingsProfile')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.profile'` on the entries for `settings/profile` and delete `'settings.profile'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/profile/ProfilePage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.profile.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ProfilePage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L150 aria-label (breadcrumb); L205 form (profile.firstName); L207 TextInput (profile.firstName); L213 TextInput (profile.lastName); L221 TextInput (profile.email); L234 TextInput (profile.phone); L256 Button; L280 form (profile.currentPassword); L281 TextInput (profile.currentPassword); L288 TextInput (profile.newPassword); L295 TextInput (profile.confirmPassword); L305 Button (profile.changePasswordTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.profile.<step>.title` and `.body` for these steps: `breadcrumb`, `avatar`, `firstName`, `lastName`, `email`, `phone`, `language`, `saveProfile`, `currentPassword`, `newPassword`, `confirmPassword`, `changePassword`, `profileError`, `passwordError`, `saved`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.profile.<step>.title` and `.body` for these steps in Albanian: `breadcrumb`, `avatar`, `firstName`, `lastName`, `email`, `phone`, `language`, `saveProfile`, `currentPassword`, `newPassword`, `confirmPassword`, `changePassword`, `profileError`, `passwordError`, `saved`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.profile', route: 'settings/profile' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.profile"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsProfile.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/profile/ProfilePage.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files.
   4. **PT-4 Write the guide**: 15 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.profile.<id>.title|body`):
      - `breadcrumb` — breadcrumb
      - `avatar` — photo control (read at slice start)
      - `firstName` — first name (try-it)
      - `lastName` — last name (try-it)
      - `email` — email (read-only vs editable, per current rendering)
      - `phone` — phone (try-it)
      - `language` — interface language (`LanguagePicker`, try-it)
      - `saveProfile` — Save profile (explain-only: submit)
      - `currentPassword` — current password (try-it)
      - `newPassword` — new password and its rule (try-it)
      - `confirmPassword` — confirm (try-it)
      - `changePassword` — Change password (explain-only: submit)
      - `profileError` — profile error (state)
      - `passwordError` — password error (state)
      - `saved` — saved confirmations (state)
   5. **PT-5 Register** `/:tenantSlug/settings/profile` as page `settings.profile`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.profile`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Saving. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Validation and submission (V):** Two independent forms; both locked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Password rules are shown by the page; the tour restates them from the rendered hint, not from a hard-coded rule.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Two forms; submit lock.
   - Regression: existing tests of `ProfilePage.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Password not changed.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsProfile src/pages/settings/profile
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.profile"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 164.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: My profile is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s38"></a>

### S38: Settings: Team: complete tour

1. **Slice id and title:** S38. Settings: Team: complete tour. Branch `support-slice-38-settings-team-complete-tour`.
2. **Scope:** Team list, invite, edit, deactivate / reactivate. In scope: `title`, `invite`, `table`, `row`, `rowRole`, `rowStatus`, `edit`, `deactivate`, `reactivate`, `inviteModal`, `inviteEmail`, `inviteRole`, `inviteSend`, `editModal`, `editRole`, `editSave`, `confirmDialog`, `confirmOk`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Per-member icon buttons have per-email labels; the tour must reuse them without leaking emails into announcements beyond what is on screen.
   - **Description.** This slice delivers the complete guided tour of **Settings: Team** (`/:tenantSlug/settings/team`) and nothing else. A user who opens Support on this page can tour 20 steps in order, ask about any single control, and replay or leave. What the page is for: Invite a teammate, edit role, deactivate / reactivate. What the tour walks through: Invite button; member rows with Edit, Deactivate, Reactivate icon buttons (each with `aria-label` per email); Invite and Edit modals; deactivate ConfirmDialog; role select. What changes the tour at runtime: Needs `users.manage`; Reactivate vs Deactivate by status. Empty, `role="alert"` errors, modal validation. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Team** (`settings.team`; `/:tenantSlug/settings/team`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/team/TeamSettingsPage.tsx`, `pages/settings/team/TeamSettingsContent.tsx`, `pages/settings/team/InviteMemberModal.tsx`, `pages/settings/team/EditMemberModal.tsx`.
6. **Production LOC estimate:** **~220** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36 + Annotations in `InviteMemberModal` and `EditMemberModal` 8. Copy is JSON and not counted.
7. **File-Level Change Plan** (11 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsTeam.ts`
      - Change: Create the page guide with the 20 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.team', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'settings.team.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): `users.manage`. Hand-offs (`opens`/`group`): `invite`, `edit`, `confirm`.
      - Integration: Loaded lazily through `loaders['settings.team']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.team.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsTeam.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsTeam.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `users.manage`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.team': () => import('./guides/settingsTeam')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.team'` on the entries for `settings/team` and delete `'settings.team'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/team/TeamSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.team.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TeamSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L52 permission check [users.manage]; L121 Button (team.inviteMember); L166 Button (team.editAria); L170 aria-label (team.editAria); L178 Button (team.reactivateAria); L182 aria-label (team.reactivateAria); L187 Button (team.deactivateAria); L191 aria-label (team.deactivateAria); L235 Button (team.cancelInvitation); L266 ConfirmDialog (team.deactivate.title); L295 SelectInput (team.deactivate.reassignTo); L325 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/team/TeamSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/settings/team/InviteMemberModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.team.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InviteMemberModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L66 Modal (team.invite.title); L67 form (team.invite.email); L68 TextInput (team.invite.email); L77 SelectInput (team.invite.role); L83 SelectInput (team.invite.warehouse); L96 Button (team.invite.submit); L97 Button (team.invite.submit).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/settings/team/EditMemberModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.team.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `EditMemberModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L59 Modal (team.edit.title); L61 form (team.edit.role); L62 SelectInput (team.edit.role); L69 SelectInput (team.edit.warehouse); L77 Button; L78 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Leave unchanged** `src/pages/settings/team/TeamSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   9. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.team.<step>.title` and `.body` for these steps: `title`, `invite`, `table`, `row`, `rowRole`, `rowStatus`, `edit`, `deactivate`, `reactivate`, `inviteModal`, `inviteEmail`, `inviteRole`, `inviteSend`, `editModal`, `editRole`, `editSave`, `confirmDialog`, `confirmOk`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.team.<step>.title` and `.body` for these steps in Albanian: `title`, `invite`, `table`, `row`, `rowRole`, `rowStatus`, `edit`, `deactivate`, `reactivate`, `inviteModal`, `inviteEmail`, `inviteRole`, `inviteSend`, `editModal`, `editRole`, `editSave`, `confirmDialog`, `confirmOk`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.team', route: 'settings/team' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.team"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsTeam.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/team/TeamSettingsContent.tsx`, `src/pages/settings/team/InviteMemberModal.tsx`, `src/pages/settings/team/EditMemberModal.tsx`.
   3. **PT-3 Annotate** about 18 sites in those files. Includes: Annotations in `InviteMemberModal` and `EditMemberModal`.
   4. **PT-4 Write the guide**: 20 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.team.<id>.title|body`):
      - `title` — heading and count
      - `invite` — Invite teammate (needs `users.manage`, try-it: opens modal)
      - `table` — member table
      - `row` — one member (repeat)
      - `rowRole` — role (repeat)
      - `rowStatus` — active / inactive badge (repeat, shared.statusBadge)
      - `edit` — Edit (repeat, try-it: opens modal)
      - `deactivate` — Deactivate (repeat, destructive-class, try-it: opens confirm)
      - `reactivate` — Reactivate (repeat, only on inactive rows, try-it)
      - `inviteModal` — invite dialog (group: invite)
      - `inviteEmail` — email (group: invite, try-it)
      - `inviteRole` — role select (group: invite, try-it)
      - `inviteSend` — Send invitation (group: invite, explain-only)
      - `editModal` — edit dialog (group: edit)
      - `editRole` — role select (group: edit, try-it)
      - `editSave` — Save (group: edit, explain-only)
      - `confirmDialog` — deactivate / reactivate confirmation (group: confirm, vars: dialog title)
      - `confirmOk` — confirm (group: confirm, destructive, explain-only)
      - `empty` — only you (state)
      - `error` — modal / action errors (state)
   5. **PT-5 Register** `/:tenantSlug/settings/team` as page `settings.team`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.team`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Only the owner exists. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `users.manage`; Reactivate vs Deactivate by status.
   - **Dialogs, drawers, menus, nested workflows (D):** Three dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Email and role. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Deactivate warning: access ends within the token lifetime (TD-010).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The row buttons are per-row; the exemplar is the first row that has the button.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Active and inactive rows; each dialog; no invitation sent.
   - Regression: existing tests of `TeamSettingsContent.tsx`, `InviteMemberModal.tsx`, `EditMemberModal.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations; emails not duplicated into the live region beyond the step title.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsTeam src/pages/settings/team
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.team"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 220.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Team is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s39"></a>

### S39: Settings: Roles and permissions: complete tour

1. **Slice id and title:** S39. Settings: Roles and permissions: complete tour. Branch `support-slice-39-settings-roles-and-permissions-complete-tour`.
2. **Scope:** Role list, role actions, permission matrix with scopes, save. In scope: `roleList`, `role`, `systemRole`, `copy`, `rename`, `delete`, `matrix`, `group`, `permission`, `scope`, `dirty`, `save`, `saveDisabled`, `discard`, `nameDialog`, `nameField`, `nameSave`, `deleteDialog`, `deleteOk`, `loadFailed`. Out of scope: every other page (item 16).
3. **Purpose:** The densest settings page; the matrix is generated from the permission catalogue so it must be guided by kind.
   - **Description.** This slice delivers the complete guided tour of **Settings: Roles and permissions** (`/:tenantSlug/settings/roles`) and nothing else. A user who opens Support on this page can tour 20 steps in order, ask about any single control, and replay or leave. What the page is for: Pick a role, copy / rename / delete it, grant permissions and scopes, save. What the tour walks through: Role list; Copy, Rename, Delete; permission checkboxes; per-permission scope `<select>`; Save (disabled until dirty); name Modal; delete ConfirmDialog. What changes the tour at runtime: Needs `roles.manage`; system roles cannot be renamed or deleted (server rule). Load failed (`role="alert"`), dirty state, delete error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Roles and permissions** (`settings.roles`; `/:tenantSlug/settings/roles`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/roles/RolesSettingsPage.tsx`, `pages/settings/roles/RolesSettingsContent.tsx`, `pages/settings/roles/RoleNameModal.tsx`.
6. **Production LOC estimate:** **~222** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36 + `permission`/`scope` ids generated from the catalogue key (`permission.<key>`) 10. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsRoles.ts`
      - Change: Create the page guide with the 20 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.roles', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.roles.<id>', kind, safety, … }`. Steps in state-only elements: `dirty`, `loadFailed`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `name`, `delete`.
      - Integration: Loaded lazily through `loaders['settings.roles']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.roles.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsRoles.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsRoles.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.roles': () => import('./guides/settingsRoles')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.roles'` on the entries for `settings/roles` and delete `'settings.roles'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/roles/RolesSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.roles.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RolesSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L128 role=alert (roles.loadFailed); L142 aria-label (roles.listLabel); L147 button; L170 Button (roles.copy); L176 Button (roles.rename); L180 Button; L209 input; L225 select (roles.scopeLabel); L252 Button; L262 Button (roles.save); L291 ConfirmDialog (roles.deleteConfirm.title); L300 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/roles/RolesSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/settings/roles/RoleNameModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.roles.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RoleNameModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L54 Modal (roles.copyModal.nameSq); L55 form (roles.copyModal.nameSq); L57 TextInput (roles.copyModal.nameSq); L64 TextInput (roles.copyModal.nameEn); L71 role=alert; L73 Button; L74 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Leave unchanged** `src/pages/settings/roles/RolesSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   8. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.roles.<step>.title` and `.body` for these steps: `roleList`, `role`, `systemRole`, `copy`, `rename`, `delete`, `matrix`, `group`, `permission`, `scope`, `dirty`, `save`, `saveDisabled`, `discard`, `nameDialog`, `nameField`, `nameSave`, `deleteDialog`, `deleteOk`, `loadFailed`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.roles.<step>.title` and `.body` for these steps in Albanian: `roleList`, `role`, `systemRole`, `copy`, `rename`, `delete`, `matrix`, `group`, `permission`, `scope`, `dirty`, `save`, `saveDisabled`, `discard`, `nameDialog`, `nameField`, `nameSave`, `deleteDialog`, `deleteOk`, `loadFailed`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.roles', route: 'settings/roles' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.roles"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsRoles.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/roles/RolesSettingsContent.tsx`, `src/pages/settings/roles/RoleNameModal.tsx`.
   3. **PT-3 Annotate** about 18 sites in those files. Includes: `permission`/`scope` ids generated from the catalogue key (`permission.<key>`).
   4. **PT-4 Write the guide**: 20 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.roles.<id>.title|body`):
      - `roleList` — role list (repeat)
      - `role` — one role (repeat, try-it: selects it)
      - `systemRole` — system role badge: cannot be renamed or deleted (repeat, state)
      - `copy` — Copy role (try-it: opens dialog)
      - `rename` — Rename (try-it: opens dialog)
      - `delete` — Delete (destructive, try-it: opens confirm)
      - `matrix` — permission matrix region
      - `group` — a permission group (repeat)
      - `permission` — a permission checkbox (repeat, try-it: toggles an unsaved draft)
      - `scope` — scope select for scoped permissions (repeat, try-it)
      - `dirty` — unsaved-changes state (state)
      - `save` — Save (disabled until dirty, explain-only)
      - `saveDisabled` — why Save is disabled (disabledHint)
      - `discard` — discard changes (explain-only)
      - `nameDialog` — copy / rename dialog (group: name)
      - `nameField` — name (group: name, try-it)
      - `nameSave` — Save (group: name, explain-only)
      - `deleteDialog` — delete confirm (group: delete, vars: dialog title)
      - `deleteOk` — Delete (group: delete, destructive, explain-only)
      - `loadFailed` — load failed (state)
   5. **PT-5 Register** `/:tenantSlug/settings/roles` as page `settings.roles`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.roles`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Roles and permissions repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Load failed. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `roles.manage`; system roles disable rename / delete.
   - **Dialogs, drawers, menus, nested workflows (D):** Two dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Save locked; dirty tracking. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - A permission added to the catalogue appears as a new checkbox with the same repeat id.
   - Toggling a checkbox (try-it) makes `dirty` true; Save never fires.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - System vs custom role; dirty toggle; dialogs; catalogue growth.
   - Regression: existing tests of `RolesSettingsContent.tsx`, `RoleNameModal.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Toggled draft is discarded on Exit (no save).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsRoles src/pages/settings/roles
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.roles"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 222.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Roles and permissions is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s40"></a>

### S40: Settings: Lists: complete tour

1. **Slice id and title:** S40. Settings: Lists: complete tour. Branch `support-slice-40-settings-lists-complete-tour`.
2. **Scope:** Tab bar and the shared `LookupListEditor`, with the risk-level and business-type tabs. The five remaining tabs.
3. **Purpose:** Introduces the lookup editor guidance reused by four more tabs. Cities depend on areas; intervals are numeric; activity results are permission-scoped.
   - **Description.** This slice delivers the complete guided tour of **Settings: Lists** (`/:tenantSlug/settings/lists/:list?`) and nothing else. A user who opens Support on this page can tour 26 steps in order, ask about any single control, and replay or leave. What the page is for: Maintain lookup lists: risk levels, business types, areas, cities, follow-up intervals, lost reasons, activity results. What the tour walks through: Tab bar; per-tab `LookupListEditor` (add, rename, order, deactivate); areas and cities have dialogs and the city list depends on an area. What changes the tour at runtime: Needs `settings.manage` or `activityResults.manage`; tabs differ by permission. Per-list empty / loading / error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Lists** (`settings.lists`; `/:tenantSlug/settings/lists/:list?`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/lists/ListsSettingsPage.tsx`, `pages/settings/lists/ListsSettingsContent.tsx`, `components/settings/LookupListEditor`, `pages/settings/lists/AreasList.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~294** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 26 steps x 8 = 208 + 23 annotation sites x 2 = 46 + `LookupListEditor` annotations with component-scoped ids (`lookupList.*`), shared with the other tabs and with the pricing packages panel 14 + Annotations for the five list components 10. Copy is JSON and not counted.
7. **File-Level Change Plan** (17 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsLists.ts`
      - Change: Create the page guide with the 26 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.lists', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.tabs`. Each step: `{ id, target: 'settings.lists.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`, `empty`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `area`.
      - Integration: Loaded lazily through `loaders['settings.lists']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.lists.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsLists.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsLists.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.lists': () => import('./guides/settingsLists')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.lists'` on the entries for `settings/lists/:list?` and delete `'settings.lists'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/lists/ListsSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ListsSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L70 permission check [settings.manage]; L81 Tabs (lists.title).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/lists/ListsSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/settings/LookupListEditor/LookupListEditor.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `LookupListEditor`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L146 input (lists.columns.nameSq); L149 aria-label (lists.columns.nameSq); L158 input (lists.columns.nameEn); L161 aria-label (lists.columns.nameEn); L182 Button (lists.save); L186 Button (lists.cancel); L198 role=alert; L249 button (lists.moveUp); L254 aria-label (lists.moveUp); L258 button (lists.moveDown); L263 aria-label (lists.moveDown); L290 button (lists.edit); L295 aria-label (lists.edit); L299 button; L309 button; L317 aria-label (lists.delete); L340 Button (lists.add); L346 ConfirmDialog (lists.deleteConfirm.title); L356 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/settings/LookupListEditor/LookupListEditor.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/pages/settings/lists/RiskLevelsList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RiskLevelsList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L26 input; L46 input; L56 role=alert (lists.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/pages/settings/lists/BusinessTypesList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `BusinessTypesList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L38 select (lists.chooseRiskLevel); L58 role=alert (lists.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/pages/settings/lists/AreasList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AreasList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L67 role=alert (lists.loadFailed); L83 ConfirmDialog (lists.cascadeConfirm.title); L96 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/pages/settings/lists/CitiesList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CitiesList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L45 select (lists.chooseArea); L65 role=alert (lists.loadFailed); L72 select (lists.columns.area); L76 aria-label (lists.columns.area).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Modify** `src/pages/settings/lists/FollowUpIntervalsList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpIntervalsList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L25 input; L46 role=alert (lists.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   12. **Modify** `src/pages/settings/lists/LostReasonsList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `LostReasonsList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L21 role=alert (lists.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   13. **Modify** `src/pages/settings/lists/ActivityResultsList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.lists.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ActivityResultsList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L21 role=alert (lists.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   14. **Leave unchanged** `src/pages/settings/lists/ListsSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   15. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.lists.<step>.title` and `.body` for these steps: `tabs`, `tab`, `editor`, `addRow`, `itemRow`, `itemLabels`, `itemOrder`, `itemActive`, `itemSave`, `riskScore`, `btParent`, `empty`, `error`, `areaRow`, `areaDialog`, `areaDialogActions`, `cityAreaFilter`, `cityRow`, `cityDisabled`, `intervalDays`, `lostReasonRow`, `tabActivityResults`, `activityResultRow`, `activityResultKind`, `empty`, `inUse`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   16. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.lists.<step>.title` and `.body` for these steps in Albanian: `tabs`, `tab`, `editor`, `addRow`, `itemRow`, `itemLabels`, `itemOrder`, `itemActive`, `itemSave`, `riskScore`, `btParent`, `empty`, `error`, `areaRow`, `areaDialog`, `areaDialogActions`, `cityAreaFilter`, `cityRow`, `cityDisabled`, `intervalDays`, `lostReasonRow`, `tabActivityResults`, `activityResultRow`, `activityResultKind`, `empty`, `inUse`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   17. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.lists', route: 'settings/lists/:list?' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.lists"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsLists.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/lists/ListsSettingsContent.tsx`, `src/pages/settings/lists/RiskLevelsList.tsx`, `src/pages/settings/lists/BusinessTypesList.tsx`, `src/pages/settings/lists/AreasList.tsx`, `src/pages/settings/lists/CitiesList.tsx`.
   3. **PT-3 Annotate** about 23 sites in those files. Includes: `LookupListEditor` annotations with component-scoped ids (`lookupList.*`), shared with the other tabs and with the pricing packages panel; Annotations for the five list components.
   4. **PT-4 Write the guide**: 26 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.lists.<id>.title|body`):
      - `tabs` — the seven-tab bar (shared.tabs)
      - `tab` — one tab (repeat, try-it)
      - `editor` — the lookup editor region (info)
      - `addRow` — add an item (try-it: draft only)
      - `itemRow` — one item (repeat)
      - `itemLabels` — Albanian and English labels (repeat, try-it)
      - `itemOrder` — reorder controls (repeat, try-it)
      - `itemActive` — activate / deactivate (repeat, explain-only)
      - `itemSave` — save item (repeat, explain-only)
      - `riskScore` — risk-specific surcharge field (tab: risk levels)
      - `btParent` — business-type specific field (tab: business types)
      - `empty` — empty list (state)
      - `error` — load / save error (state)
      - `areaRow` — one area (repeat)
      - `areaDialog` — area dialog (group: area)
      - `areaDialogActions` — its actions (group: area, explain-only)
      - `cityAreaFilter` — area selector that scopes cities (try-it)
      - `cityRow` — one city (repeat)
      - `cityDisabled` — add city disabled until an area is chosen (disabledHint)
      - `intervalDays` — days input (repeat, try-it)
      - `lostReasonRow` — one reason (repeat)
      - `tabActivityResults` — Activity results tab is shown only with `activityResults.manage`
      - `activityResultRow` — one result (repeat)
      - `activityResultKind` — result kind (repeat)
      - `empty` — empty list (state)
      - `inUse` — an item in use cannot be removed (repeat, state)
   5. **PT-5 Register** `/:tenantSlug/settings/lists/:list?` as page `settings.lists`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.lists`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty list. Empty lists. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Tabs follow `settings.manage` and `activityResults.manage`. Per-tab permission.
   - **Dialogs, drawers, menus, nested workflows (D):** No dialogs on these two tabs. Area dialogs.
   - **Validation and submission (V):** Saves locked. Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Tab-scoped steps. Five tabs. Tab-scoped steps run for the active tab only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Items added by the user are repeated rows; the lookup editor ids are shared with later tabs.
   - Cities are filtered by the selected area; changing it re-renders rows.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 13 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Tab scoping; permission-limited tab list.
   - Area-dependent city list; permission-limited tabs.
   - Regression: existing tests of `ListsSettingsContent.tsx`, `RiskLevelsList.tsx`, `BusinessTypesList.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Nothing saved.
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsLists src/pages/settings/lists src/components/settings
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.lists"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 294.
15. **Dependencies and handoff:** unblocks S42. After this slice **Settings: Lists is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s41"></a>

### S41: Settings: Sales script: complete tour

1. **Slice id and title:** S41. Settings: Sales script: complete tour. Branch `support-slice-41-settings-sales-script-complete-tour`.
2. **Scope:** Script editor, preview, drafts, versions. In scope: `languageSwitch`, `modeSwitch`, `sections`, `sectionEditor`, `preview`, `saveDraft`, `publish`, `publishConfirm`, `publishOk`, `history`, `version`, `viewVersion`, `restoreVersion`, `versionModal`, `versionLanguages`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Publish is outward-facing: every agent sees the new script. It lets a first-time user learn Settings: Sales script in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Sales script** (`/:tenantSlug/settings/sales-script`) and nothing else. A user who opens Support on this page can tour 17 steps in order, ask about any single control, and replay or leave. What the page is for: Edit the script per language, preview, save draft, publish, view or restore a version. What the tour walks through: Language and mode (edit / preview) toggle groups; section editors; Save draft; Publish (ConfirmDialog); version history with View and Restore; version Modal. What changes the tour at runtime: Needs `script.edit`. Load error, empty draft, busy. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Sales script** (`settings.salesScript`; `/:tenantSlug/settings/sales-script`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/salesScript/SalesScriptSettingsPage.tsx`, `pages/settings/salesScript/SalesScriptSettingsContent.tsx`.
6. **Production LOC estimate:** **~182** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsSalesScript.ts`
      - Change: Create the page guide with the 17 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.salesScript', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.salesScript.<id>', kind, safety, … }`. Steps in state-only elements: `preview`, `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `publish`, `version`.
      - Integration: Loaded lazily through `loaders['settings.salesScript']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.salesScript.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsSalesScript.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsSalesScript.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.salesScript': () => import('./guides/settingsSalesScript')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.salesScript'` on the entries for `settings/sales-script` and delete `'settings.salesScript'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/salesScript/SalesScriptSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.salesScript.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `SalesScriptSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L117 role=alert (salesScript.loadFailed); L134 role=status (salesScript.draftStatus); L146 aria-label (salesScript.language); L148 button (salesScript.languages.${lang}); L153 aria-label (salesScript.mode); L154 button (salesScript.edit); L157 button (salesScript.preview); L166 aria-label (salesScript.previewLabel); L181 Button (salesScript.draftSaved); L184 Button (salesScript.publish); L219 Button (salesScript.viewVersion); L222 aria-label (salesScript.viewVersion); L227 Button (salesScript.restoreVersion); L230 aria-label (salesScript.restoreVersion); L243 Modal (salesScript.versionName); L254 aria-label (salesScript.languages.${lang}); L268 ConfirmDialog (salesScript.restoreTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/salesScript/SalesScriptSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Leave unchanged** `src/pages/settings/salesScript/SalesScriptSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.salesScript.<step>.title` and `.body` for these steps: `languageSwitch`, `modeSwitch`, `sections`, `sectionEditor`, `preview`, `saveDraft`, `publish`, `publishConfirm`, `publishOk`, `history`, `version`, `viewVersion`, `restoreVersion`, `versionModal`, `versionLanguages`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.salesScript.<step>.title` and `.body` for these steps in Albanian: `languageSwitch`, `modeSwitch`, `sections`, `sectionEditor`, `preview`, `saveDraft`, `publish`, `publishConfirm`, `publishOk`, `history`, `version`, `viewVersion`, `restoreVersion`, `versionModal`, `versionLanguages`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.salesScript', route: 'settings/sales-script' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.salesScript"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsSalesScript.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/salesScript/SalesScriptSettingsContent.tsx`.
   3. **PT-3 Annotate** about 15 sites in those files.
   4. **PT-4 Write the guide**: 17 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.salesScript.<id>.title|body`):
      - `languageSwitch` — language toggle group (try-it)
      - `modeSwitch` — edit / preview toggle (try-it)
      - `sections` — script sections (repeat)
      - `sectionEditor` — a rich-text field (repeat, try-it)
      - `preview` — preview region (state: preview mode)
      - `saveDraft` — Save draft (disabled until dirty, explain-only)
      - `publish` — Publish (explain-only: affects every agent)
      - `publishConfirm` — publish confirmation (group: publish, vars: dialog title)
      - `publishOk` — Publish (group: publish, destructive-class, explain-only)
      - `history` — version history
      - `version` — one version (repeat)
      - `viewVersion` — View (repeat, try-it: opens modal)
      - `restoreVersion` — Restore (repeat, explain-only)
      - `versionModal` — the version modal (group: version)
      - `versionLanguages` — per-language blocks (group: version, repeat)
      - `empty` — no draft yet (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/sales-script` as page `settings.salesScript`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.salesScript`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No draft. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Busy. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Versions repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `script.edit`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Version modal and publish confirm.
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Language and mode. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Publish and restore warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Versions published after the tour appear as repeated rows.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Edit vs preview; dirty vs clean; modals.
   - Regression: existing tests of `SalesScriptSettingsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No draft or publish request.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsSalesScript src/pages/settings/salesScript
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.salesScript"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 182.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Sales script is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s42"></a>

### S42: Settings: Pricing: complete tour

1. **Slice id and title:** S42. Settings: Pricing: complete tour. Branch `support-slice-42-settings-pricing-complete-tour`.
2. **Scope:** Tab bar, employee bands panel, risk surcharges panel. Three panels. Services and packages panels. Offer settings and the calculator.
3. **Purpose:** First of four slices; introduces `settings.pricing` panels and their inline-edit tables. Zones and frequencies feed the offer builder; the guide references that. Packages group services; the description columns are shared. The calculator is a safe, read-only sandbox, so its inputs are try-it.
   - **Description.** This slice delivers the complete guided tour of **Settings: Pricing** (`/:tenantSlug/settings/pricing/:tab?`) and nothing else. A user who opens Support on this page can tour 50 steps in order, ask about any single control, and replay or leave. What the page is for: Configure employee bands, risk surcharges, visit frequencies, price zones, the discount cap, services, packages, offer wording and test the calculator. What the tour walks through: Nine tabs (bands, risk, frequencies, zones, cap, services, packages, offer, calculator), each with its own panel: tables with inline edit, add / remove, dialogs. What changes the tour at runtime: Needs `pricing.manage`. Per-panel load error (`role="alert"`), empty, dialogs. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Pricing** (`settings.pricing`; `/:tenantSlug/settings/pricing/:tab?`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S40 (Settings: Lists: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/pricing/PricingSettingsPage.tsx`, `pages/settings/pricing/PricingSettingsContent.tsx`, `pages/settings/pricing/pricingTabs.ts`.
6. **Production LOC estimate:** **~512** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 50 steps x 8 = 400 + 45 annotation sites x 2 = 90 + `PricingSettingsContent` tab panel scoping (`scope.tab` from the route) 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (20 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsPricing.ts`
      - Change: Create the page guide with the 50 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.pricing', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.tabs`. Each step: `{ id, target: 'settings.pricing.<id>', kind, safety, … }`. Steps in state-only elements: `overlapRule`, `calcResult`, `calcWarning`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `band`, `service`.
      - Integration: Loaded lazily through `loaders['settings.pricing']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.pricing.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsPricing.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsPricing.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.pricing': () => import('./guides/settingsPricing')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.pricing'` on the entries for `settings/pricing/:tab?` and delete `'settings.pricing'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/pricing/PricingSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PricingSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L57 Tabs (pricing.title); L70 role=alert (pricing.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/pricing/PricingSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/settings/pricing/EmployeeBandsPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `EmployeeBandsPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L88 input; L102 Button (lists.save); L106 Button (lists.cancel); L118 role=alert; L162 button (pricing.editBand); L167 aria-label (pricing.editBand); L171 button; L181 button; L189 aria-label (pricing.deleteBand); L206 Button (pricing.addBand); L212 ConfirmDialog; L231 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/settings/pricing/RiskSurchargesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RiskSurchargesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L68 input; L82 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/pages/settings/pricing/pricingTabs.ts`
      - Change: Open the file and annotate the elements the steps name.
      - Implementation details: (non-component module: read it to find the render site)
      - Integration: Consumed by the page components listed in section 3.
      - Removal: No removal.
      - Verification: Guide test.
   9. **Modify** `src/pages/settings/pricing/VisitFrequenciesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `VisitFrequenciesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L28 select (pricing.pricingTypes.PERCENT); L40 input; L49 input.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/pages/settings/pricing/PriceZonesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PriceZonesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L34 input; L42 Button (pricing.zoneCities.button); L46 aria-label (pricing.zoneCities.button); L173 select (pricing.zoneCities.allAreas); L189 input; L198 role=alert; L203 Button (pricing.zoneCities.save); L206 Button (pricing.zoneCities.cancel).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Modify** `src/pages/settings/pricing/DiscountCapPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DiscountCapPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L35 form; L44 input (pricing.save); L46 Button (pricing.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   12. **Modify** `src/pages/settings/pricing/ServicesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ServicesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L74 ConfirmDialog (pricing.services.deactivateTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   13. **Modify** `src/pages/settings/pricing/PackagesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PackagesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L47 Button (pricing.packages.servicesButton); L51 aria-label (pricing.packages.servicesButton); L66 input; L92 Button (pricing.packages.makeDefaultFor); L96 aria-label (pricing.packages.makeDefaultFor); L110 role=alert (pricing.tabs.packages); L197 aria-label (pricing.packages.inPackage); L208 button (lists.moveUp); L213 aria-label (lists.moveUp); L217 button (lists.moveDown); L222 aria-label (lists.moveDown); L226 button (pricing.packages.remove); L230 aria-label (pricing.packages.remove); L246 input; L254 role=alert; L259 Button (pricing.packages.save); L262 Button (pricing.zoneCities.cancel).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   14. **Modify** `src/pages/settings/pricing/descriptionColumns.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `descriptionColumns`, `descriptionValues`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L16 textarea.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   15. **Modify** `src/pages/settings/pricing/OfferSettingsPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `OfferSettingsPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L86 textarea; L94 input; L103 role=alert; L111 form; L146 aria-label (pricing.offer.language); L148 button (pricing.offer.languages.${lang}); L168 Button (pricing.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   16. **Modify** `src/pages/settings/pricing/TestCalculatorPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.pricing.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TestCalculatorPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L47 select (pricing.calculator.choose); L60 form; L69 input; L98 Button (pricing.calculator.calculate); L105 role=alert; L111 aria-label (pricing.calculator.result).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   17. **Leave unchanged** `src/pages/settings/pricing/PricingSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   18. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.pricing.<step>.title` and `.body` for these steps: `tabs`, `tab`, `bandsTable`, `bandRow`, `bandBounds`, `bandPrice`, `addBand`, `bandDialog`, `bandDialogSave`, `removeBand`, `riskTable`, `riskRow`, `riskPercent`, `riskSave`, `overlapRule`, `frequencyRow`, `frequencyFields`, `frequencySave`, `zoneRow`, `zoneName`, `zoneAreas`, `zoneMultiplier`, `addZone`, `zoneRemove`, `capInput`, `capSave`, `capEffect`, `serviceTable`, `serviceRow`, `serviceDescription`, `serviceDialog`, `serviceDialogSave`, `addService`, `packageTable`, `packageRow`, `packageServices`, `packageMove`, `packageEdit`, `packageRemove`, `packageFields`, `addPackage`, `packageSave`, `offerIssuer`, `offerValidity`, `offerFooter`, `offerSave`, `calcInputs`, `calcRun`, `calcResult`, `calcWarning`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   19. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.pricing.<step>.title` and `.body` for these steps in Albanian: `tabs`, `tab`, `bandsTable`, `bandRow`, `bandBounds`, `bandPrice`, `addBand`, `bandDialog`, `bandDialogSave`, `removeBand`, `riskTable`, `riskRow`, `riskPercent`, `riskSave`, `overlapRule`, `frequencyRow`, `frequencyFields`, `frequencySave`, `zoneRow`, `zoneName`, `zoneAreas`, `zoneMultiplier`, `addZone`, `zoneRemove`, `capInput`, `capSave`, `capEffect`, `serviceTable`, `serviceRow`, `serviceDescription`, `serviceDialog`, `serviceDialogSave`, `addService`, `packageTable`, `packageRow`, `packageServices`, `packageMove`, `packageEdit`, `packageRemove`, `packageFields`, `addPackage`, `packageSave`, `offerIssuer`, `offerValidity`, `offerFooter`, `offerSave`, `calcInputs`, `calcRun`, `calcResult`, `calcWarning`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   20. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.pricing', route: 'settings/pricing/:tab?' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.pricing"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsPricing.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/pricing/PricingSettingsContent.tsx`, `src/pages/settings/pricing/EmployeeBandsPanel.tsx`, `src/pages/settings/pricing/RiskSurchargesPanel.tsx`, `src/pages/settings/pricing/pricingTabs.ts`, `src/pages/settings/pricing/VisitFrequenciesPanel.tsx`.
   3. **PT-3 Annotate** about 45 sites in those files. Includes: `PricingSettingsContent` tab panel scoping (`scope.tab` from the route).
   4. **PT-4 Write the guide**: 50 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.pricing.<id>.title|body`):
      - `tabs` — nine-tab bar (shared.tabs)
      - `tab` — one tab (repeat, try-it)
      - `bandsTable` — bands table
      - `bandRow` — one band (repeat)
      - `bandBounds` — from / to employee counts (repeat, try-it)
      - `bandPrice` — price per band (repeat, try-it)
      - `addBand` — Add band (try-it: opens dialog)
      - `bandDialog` — band dialog (group: band)
      - `bandDialogSave` — Save (group: band, explain-only)
      - `removeBand` — Remove band (repeat, destructive, explain-only)
      - `riskTable` — surcharges table
      - `riskRow` — one risk level (repeat)
      - `riskPercent` — percent input (repeat, try-it)
      - `riskSave` — Save (explain-only)
      - `overlapRule` — bands must not overlap (state)
      - `frequencyRow` — one frequency (repeat)
      - `frequencyFields` — name, visits per month, multiplier (repeat, try-it)
      - `frequencySave` — Save (explain-only)
      - `zoneRow` — one zone (repeat)
      - `zoneName` — zone name (repeat, try-it)
      - `zoneAreas` — areas that belong to the zone (repeat)
      - `zoneMultiplier` — multiplier (repeat, try-it)
      - `addZone` — Add zone (try-it)
      - `zoneRemove` — Remove (repeat, destructive, explain-only)
      - `capInput` — maximum discount (try-it)
      - `capSave` — Save (explain-only)
      - `capEffect` — what the cap triggers: approvals (info)
      - `serviceTable` — services table
      - `serviceRow` — one service (repeat)
      - `serviceDescription` — description columns (repeat, `descriptionColumns`)
      - `serviceDialog` — service dialog (group: service)
      - `serviceDialogSave` — Save (group: service, explain-only)
      - `addService` — Add service (try-it: opens dialog)
      - `packageTable` — packages table
      - `packageRow` — one package (repeat)
      - `packageServices` — services in a package (repeat)
      - `packageMove` — move up / down (repeat, try-it: draft only)
      - `packageEdit` — edit (repeat, try-it)
      - `packageRemove` — remove (repeat, destructive, explain-only)
      - `packageFields` — name, price, active (repeat, try-it)
      - `addPackage` — Add package (try-it)
      - `packageSave` — Save (explain-only)
      - `offerIssuer` — issuer details printed on the offer (try-it)
      - `offerValidity` — validity period (try-it)
      - `offerFooter` — footer text (try-it)
      - `offerSave` — Save (explain-only)
      - `calcInputs` — calculator inputs (one step each: employees, business type, zone, frequency, package) (try-it)
      - `calcRun` — Calculate (try-it: no data is changed)
      - `calcResult` — result breakdown (state)
      - `calcWarning` — warnings (state)
   5. **PT-5 Register** `/:tenantSlug/settings/pricing/:tab?` as page `settings.pricing`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.pricing`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No bands. No zones / frequencies. None yet. Calculator empty until run.
   - **Loading / skeleton (L):** Waits. Waits. Waits. Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. Rows. Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Panel error. Error. Error. Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `pricing.manage`. Permission. Permission. Permission.
   - **Dialogs, drawers, menus, nested workflows (D):** Band dialog. None. Service dialog. None.
   - **Validation and submission (V):** Overlap rule. Locked. Locked. Offer save locked.
   - **Tabs / sections (T):** Tabs. Tabs. Tabs. Tabs. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Remove warned. Removal warned. Remove warned.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Tab is part of the URL, so the Support panel says "Tour this tab" and the context follows the URL.
   - Rows added by the user are repeated.
   - Seven icon buttons per package row carry `aria-label`s; the guide reuses them.
   - Calculator inputs list follows the live configuration.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 22 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Tab scoping; dialog; empty.
   - Each tab; empty.
   - Packages with 0, 1, 12 rows.
   - Calculator run is allowed and mutation-free.
   - Regression: existing tests of `PricingSettingsContent.tsx`, `EmployeeBandsPanel.tsx`, `RiskSurchargesPanel.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No pricing value changed.
   - Zero mutations.
   - Calculate sends no write request (asserted).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsPricing src/pages/settings/pricing
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.pricing"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 512.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Pricing is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

