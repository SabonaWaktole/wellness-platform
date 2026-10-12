# Support tour plan: slice document 2 of 6 (S08 to S17)

Part of the Interactive Support and Tour System plan. Overview, inventory, architecture, dependencies, traceability, testing, risks and the checklist are in [00-overview.md](00-overview.md). This document holds the full specifications of 10 slices. Section numbers such as "section 3.4" refer to the overview; the standard procedure (6.1) and the assumptions (0.2) are repeated here so the document can be used on its own.

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

## Page tours: pilot gate and Sales workflow

<a id="s08"></a>

### S08: Calendar (appointments, follow-ups, contract dates): complete tour

1. **Slice id and title:** S08. Calendar (appointments, follow-ups, contract dates): complete tour. Branch `support-slice-8-calendar-appointments-follow-ups-contract-dates`.
2. **Scope:** The toolbar, the view switch, the month / week / day / agenda renderings as regions, the legend and the empty / error states. Calendar chips (activities, follow-ups, contract dates), the team filter, the overdue section and the detail panel with its actions. The Plan activity dialog, the reschedule dialog and drag-to-reschedule.
3. **Purpose:** Orientation for the calendar before its items and dialogs. Covers the objects on the calendar and what can be done with them. The data-entry parts of the calendar.
   - **Description.** This slice delivers the complete guided tour of **Calendar (appointments, follow-ups, contract dates)** (`/:tenantSlug/appointments`) and nothing else. A user who opens Support on this page can tour 48 steps in order, ask about any single control, and replay or leave. What the page is for: Move through time, switch view, filter by team member, open an item, plan an activity, reschedule (dialog or drag), act on overdue items. What the tour walks through: Toolbar (previous, today, next, view segmented control, Plan); month grid, time grid and agenda; chips for activities, follow-ups and contract dates; legend; team filter chips; overdue section; detail panel (SlideOver) with status, edit, reschedule, cancel; Plan activity dialog; Reschedule dialog. What changes the tour at runtime: Calendar scope (`calendar.view` OWN/TEAM/ALL) decides the team filter; Plan needs `activities.add`; follow-up actions need `followups.manage`; contract date chips only for contract viewers. Empty period (`role="status"`), load notice (`role="alert"`), overdue section appears only when items are overdue. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Calendar (appointments, follow-ups, contract dates)** (`appointments`; `/:tenantSlug/appointments`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/appointments/AppointmentsPage.tsx`, `pages/appointments/CalendarContent.tsx`, `components/calendar/CalendarToolbar.tsx`, `components/calendar/CalendarMonthView.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~522** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 48 steps x 8 = 384 + 43 annotation sites x 2 = 86 + View-state markers on the three renderings 8 + Annotations inside `AppointmentDetailPanel` (shared by two item kinds) 14 + Annotations in `PlanActivityDialog` and `RescheduleItemDialog` 14. Copy is JSON and not counted.
7. **File-Level Change Plan** (20 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/appointments.ts`
      - Change: Create the page guide with the 48 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'appointments', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'appointments.<id>', kind, safety, … }`. Steps in state-only elements: `viewMonth`, `viewTimeGrid`, `viewAgenda`, `emptyPeriod`, `loadNotice`, `overdue`. Eligibility (`requires`): `activities.add`, `followups.manage`. Hand-offs (`opens`/`group`): `detail`, `plan`, `reschedule`.
      - Integration: Loaded lazily through `loaders['appointments']` in `pageRegistry.ts`; copy keys resolve to `supportSales:appointments.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/appointments.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/appointments.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `activities.add`, `followups.manage`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'appointments': () => import('./guides/appointments')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'appointments'` on the entries for `appointments` and delete `'appointments'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/appointments/CalendarContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CalendarContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L56 permission check [calendar.view]; L57 permission check [activities.add]; L58 permission check [followups.manage]; L172 aria-label (calendar.legend); L186 role=alert (calendar.error); L191 role=status (calendar.loading).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/appointments/CalendarContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/calendar/CalendarToolbar.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CalendarToolbar`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L22 aria-label (calendar.toolbar); L24 button (calendar.previous) [DO NOT ANNOTATE: static disabled, section 3.4]; L27 button (calendar.today); L30 button (calendar.next) [DO NOT ANNOTATE: static disabled, section 3.4]; L38 aria-label (calendar.viewLabel); L40 button; L52 Button (calendar.plan).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/calendar/CalendarMonthView.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CalendarMonthView`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L40 aria-label (calendar.month); L59 button (calendar.openDay); L63 aria-label (calendar.openDay); L75 button (calendar.more).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/calendar/CalendarTimeGrid.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CalendarTimeGrid`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L89 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/components/calendar/CalendarAgenda.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CalendarAgenda`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L73 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/components/calendar/CalendarChip.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CalendarChip`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L31 button; L45 aria-label (calendar.itemLabel).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Modify** `src/components/calendar/ContractDateChip.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContractDateChip`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L26 button; L32 aria-label (calendar.contract.itemLabel).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   12. **Modify** `src/components/calendar/TeamFilter.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TeamFilter`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L25 aria-label (calendar.team.label); L27 button (calendar.team.everyone); L31 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   13. **Modify** `src/components/calendar/OverdueSection.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `OverdueSection`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L34 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   14. **Modify** `src/components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AppointmentDetailPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L64 permission check [followups.manage]; L65 permission check [activities.add]; L150 Button (detail.markConfirmed); L155 Button (detail.completedDone); L160 Button (detail.edit); L163 Button (detail.reschedule); L166 Button (detail.cancel); L175 Button (detail.complete); L179 Button (detail.reschedule); L182 Button (detail.cancel); L191 SlideOver (detail.title); L198 role=alert; L204 TextInput (detail.cancelReasonPlaceholder); L206 Button (detail.back); L209 Button (detail.cancelledDone); L249 Link; L256 Link.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/panels/AppointmentDetailPanel/AppointmentDetailPanel.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   15. **Modify** `src/components/calendar/PlanActivityDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DEFAULT_START`, `PlanActivityDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L62 permission check [activities.add]; L232 Modal (plan.type); L234 SelectInput (plan.type); L249 Button (plan.companyChange); L256 TextInput (plan.companySearch); L269 button; L282 SelectInput (plan.deal); L294 SelectInput (plan.contact); L306 TextInput (plan.date); L307 TextInput (plan.start); L308 TextInput (plan.end); L316 TextInput (plan.place); L320 SelectInput (plan.salesperson); L334 TextareaInput (plan.notes); L337 role=alert; L342 Button (plan.cancel); L345 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/calendar/PlanActivityDialog.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   16. **Modify** `src/components/calendar/RescheduleItemDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('appointments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RescheduleItemDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L65 Modal (reschedule.title); L68 TextInput (plan.date); L69 TextInput (plan.start); L71 TextareaInput (reschedule.reason); L73 role=alert; L78 Button (plan.cancel); L81 Button (reschedule.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   17. **Leave unchanged** `src/pages/appointments/AppointmentsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   18. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `appointments.<step>.title` and `.body` for these steps: `toolbar`, `previous`, `today`, `next`, `rangeTitle`, `viewSwitch`, `viewMonth`, `viewTimeGrid`, `viewAgenda`, `dayCell`, `dayHead`, `moreButton`, `plan`, `legend`, `emptyPeriod`, `loadNotice`, `chip`, `chipKinds`, `teamFilter`, `personChip`, `allChip`, `overdue`, `overdueItem`, `detailPanel`, `detailStatus`, `detailEdit`, `detailReschedule`, `detailCancel`, `detailCancelReason`, `detailFollowUp`, `planDialog`, `planType`, `planCompany`, `planMatch`, `planDeal`, `planContact`, `planDate`, `planStart`, `planEnd`, `planPlace`, `planOwner`, `planError`, `planSave`, `planCancel`, `rescheduleDialog`, `rescheduleFields`, `rescheduleSave`, `drag`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   19. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `appointments.<step>.title` and `.body` for these steps in Albanian: `toolbar`, `previous`, `today`, `next`, `rangeTitle`, `viewSwitch`, `viewMonth`, `viewTimeGrid`, `viewAgenda`, `dayCell`, `dayHead`, `moreButton`, `plan`, `legend`, `emptyPeriod`, `loadNotice`, `chip`, `chipKinds`, `teamFilter`, `personChip`, `allChip`, `overdue`, `overdueItem`, `detailPanel`, `detailStatus`, `detailEdit`, `detailReschedule`, `detailCancel`, `detailCancelReason`, `detailFollowUp`, `planDialog`, `planType`, `planCompany`, `planMatch`, `planDeal`, `planContact`, `planDate`, `planStart`, `planEnd`, `planPlace`, `planOwner`, `planError`, `planSave`, `planCancel`, `rescheduleDialog`, `rescheduleFields`, `rescheduleSave`, `drag`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   20. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'appointments', route: 'appointments' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "appointments"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/appointments.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/appointments/CalendarContent.tsx`, `src/components/calendar/CalendarToolbar.tsx`, `src/components/calendar/CalendarMonthView.tsx`, `src/components/calendar/CalendarTimeGrid.tsx`, `src/components/calendar/CalendarAgenda.tsx`.
   3. **PT-3 Annotate** about 43 sites in those files. Includes: View-state markers on the three renderings; Annotations inside `AppointmentDetailPanel` (shared by two item kinds); Annotations in `PlanActivityDialog` and `RescheduleItemDialog`.
   4. **PT-4 Write the guide**: 48 steps, in tour order (`<id>` becomes the copy key `supportSales:appointments.<id>.title|body`):
      - `toolbar` — the toolbar as a group (info)
      - `previous` — previous period (try-it)
      - `today` — jump to today (try-it)
      - `next` — next period (try-it)
      - `rangeTitle` — the current range title (info)
      - `viewSwitch` — segmented control of views (try-it)
      - `viewMonth` — month view (state: when active)
      - `viewTimeGrid` — week / day time grid (state: when active)
      - `viewAgenda` — agenda list (state: when active)
      - `dayCell` — a day cell (repeat, try-it: opens that day)
      - `dayHead` — day heading button in the time grid (repeat, try-it)
      - `moreButton` — "+n more" button in a month cell (repeat, try-it)
      - `plan` — "Plan" button (needs `activities.add`, try-it, opens the dialog)
      - `legend` — colour legend (info)
      - `emptyPeriod` — nothing in this period (state)
      - `loadNotice` — load notice (`role="alert"`) (state)
      - `chip` — a calendar item (repeat, try-it: opens the detail panel)
      - `chipKinds` — meaning of activity, follow-up and contract-date chips (info, per kind rendered)
      - `teamFilter` — the team filter group (needs calendar scope above OWN)
      - `personChip` — one person chip (repeat, try-it)
      - `allChip` — "everyone" chip (try-it)
      - `overdue` — overdue section; exists only when items are overdue (state)
      - `overdueItem` — an overdue item (repeat)
      - `detailPanel` — the detail drawer (group: detail)
      - `detailStatus` — status buttons: confirm / complete (group: detail, explain-only: changes the item)
      - `detailEdit` — Edit (group: detail, explain-only)
      - `detailReschedule` — Reschedule (group: detail, explain-only)
      - `detailCancel` — Cancel appointment (group: detail, destructive, explain-only)
      - `detailCancelReason` — the cancel-reason prompt (group: detail, state)
      - `detailFollowUp` — follow-up variant of the panel (group: detail, needs `followups.manage`)
      - `planDialog` — dialog root and purpose (group: plan)
      - `planType` — activity type select (group: plan, try-it)
      - `planCompany` — company search; selected company with "change" (group: plan, try-it)
      - `planMatch` — a company search result (group: plan, repeat, explain-only)
      - `planDeal` — deal select, appears after a company is chosen (group: plan)
      - `planContact` — contact select (group: plan)
      - `planDate` — date input (group: plan, try-it)
      - `planStart` — start time (group: plan, try-it)
      - `planEnd` — end time, follows start (group: plan, try-it)
      - `planPlace` — place (group: plan, try-it)
      - `planOwner` — salesperson select (group: plan)
      - `planError` — form error (group: plan, state)
      - `planSave` — Save (group: plan, explain-only: submit)
      - `planCancel` — Cancel (group: plan, explain-only)
      - `rescheduleDialog` — the reschedule dialog (group: reschedule)
      - `rescheduleFields` — date and time (group: reschedule, try-it)
      - `rescheduleSave` — Save (group: reschedule, explain-only)
      - `drag` — dragging a chip to another day reschedules it (info, explain-only: the tour never drags)
   5. **PT-5 Register** `/:tenantSlug/appointments` as page `appointments`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `appointments`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** An empty period shows `emptyPeriod`; item steps (next slice) are skipped. No overdue items: that step is absent.
   - **Loading / skeleton (L):** The grid waits for data. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Chips are repeated; the exemplar is the first visible chip, and the copy explains the three kinds that exist today.
   - **Error / retry (X):** The notice has its own step. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Plan needs `activities.add`. The team filter and follow-up actions follow scope and `followups.manage`. Plan needs `activities.add`; owner select depends on scope.
   - **Dialogs, drawers, menus, nested workflows (D):** The panel is a hand-off from a chip. Both dialogs are hand-offs; the drag step is information only.
   - **Validation and submission (V):** Both dialogs' validation messages are explained only if rendered.
   - **Tabs / sections (T):** View-specific steps are eligible only for the active view; switching view (try-it) re-enters the list.
   - **Destructive or irreversible actions (explain-only) (K):** Cancel and status buttons carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Moving to another week replaces every cell; `dayCell` is repeated and re-picked.
   - The default view differs by viewport; the view-specific steps follow the DOM, not an assumed default.
   - New items created elsewhere appear as chips with the same ids.
   - An item removed while its panel is open closes the layer; the tour treats it as a layer close.
   - Deal and contact selects appear only after a company is chosen: their steps are absent until then.
   - Edit mode of the plan dialog (existing item) changes the title and copy.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Each view renders its own subset of steps; empty and error periods; plan permission.
   - Chip kinds present / absent; scope variants for the team filter; panel hand-off; destructive buttons never fire.
   - Dialog hand-off from the toolbar Plan button and from the overdue section; company-dependent steps; Enter in a field does not submit.
   - Regression: existing tests of `CalendarContent.tsx`, `CalendarToolbar.tsx`, `CalendarMonthView.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No navigation inside the calendar changes data.
   - Real `AppointmentDetailPanel` used; spies show no status update call.
   - Drag is not simulated by the tour (asserted: no pointer events dispatched).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/appointments src/pages/appointments src/components/calendar src/components/panels/AppointmentDetailPanel
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "appointments"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 522.
15. **Dependencies and handoff:** unblocks S09. After this slice **Calendar (appointments, follow-ups, contract dates) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s09"></a>

### S09: Client detail: complete tour

1. **Slice id and title:** S09. Client detail: complete tour. Branch `support-slice-9-client-detail-complete-tour`.
2. **Scope:** Everything above the tabs: title, duplicate-name notice, the action bar with its permission-dependent buttons and the more menu, the summary card and the custom-field panel. The default Timeline tab: the timeline list, the per-channel "log activity" buttons and the activity dialog, the note control. The Appointments tab with its hand-off to the shared Plan activity dialog and appointment detail panel, and the Contracts tab (read-only list). The Deals tab and the Wellness+ tab (employer link, employees, upload entry, member table, remove-from-company dialog).
3. **Purpose:** First of four slices for the client detail page; orients the user before the data tabs. Activities are the most-used action on this page; this makes the dialog's fields explainable without saving anything. Covers the Appointments and Contracts tabs and shows how a page reuses dialogs that another page already annotated. Completes the page. The Wellness+ tab links to members, so wording must match the members pages.
   - **Description.** This slice delivers the complete guided tour of **Client detail** (`/:tenantSlug/clients/:clientId`) and nothing else. A user who opens Support on this page can tour 56 steps in order, ask about any single control, and replay or leave. What the page is for: Read a company; edit it; log an activity per channel; schedule an appointment; price an offer; upload employees; browse timeline, appointments, contracts, deals and Wellness+ tabs. What the tour walks through: Action bar (sales script button, calculate price, employee upload, edit, email, more menu); custom-field panel with a settings button; the follow-ups panel (`FollowUpsPanel`: Plan button, quick follow-up buttons, follow-up list with Complete / Reschedule / Cancel / Reassign); five tab buttons (conditional); timeline (`CompanyTimeline`); one "log activity" button per channel and `ActivityDialog`; Schedule appointment, which opens the shared `PlanActivityDialog`; `AppointmentDetailPanel` for a clicked appointment; contracts, deals and Wellness+ tabs. What changes the tour at runtime: Script button needs `script.view`; the follow-ups panel needs `calendar.view` (Plan: `activities.add`; quick buttons: `followups.manage`); Calculate price needs `offers.edit`; Employee upload needs `members.import`; Contracts, Deals, Wellness tabs need `contracts.validity.view`, `deals.view`, `members.view`; add activity / note need `activities.add` / `notes.add`. Loading, not found, duplicate-name notice, empty timeline, empty tabs. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Client detail** (`clients.detail`; `/:tenantSlug/clients/:clientId`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S07 (Follow-ups: complete tour); S08 (Calendar (appointments, follow-ups, contract dates): complete tour). Existing code it relies on, unchanged since planning: `pages/clients/ClientDetailPage.tsx`, `pages/clients/ClientDetailContent.tsx`, `components/followUps/FollowUpsPanel.tsx`, `components/calendar/PlanActivityDialog.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~630** (under the band (600 to 799)): 16 guide module, loader line, route-map flip + 56 steps x 8 = 448 + 50 annotation sites x 2 = 100 + Annotate `FollowUpsPanel`, `FollowUpQuickButtons` and `FollowUpList` once with component-scoped ids (`followUps.*`); the deal page and the follow-ups page reuse them 14 + `ActivityDialog` annotation of its fields and footer (component is shared with the deal page, so ids are namespaced under `activity.*` and reused there) 22 + Tab-scope wiring for the tabs of this slice 10 + Annotate `MemberBadges` and `RemoveFromCompanyDialog` (shared with the members pages) with component-scoped ids 14 + `vars` for company name interpolation in the first step 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (19 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/clientsDetail.ts`
      - Change: Create the page guide with the 56 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'clients.detail', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.tabs`, `shared.statusBadge`. Each step: `{ id, target: 'clients.detail.<id>', kind, safety, … }`. Steps in state-only elements: `duplicateNotice`, `followUpsEmpty`, `notFound`, `timelineEmpty`, `appointmentsEmpty`, `contractsEmpty`, `dealsEmpty`, `wellnessEmpty`, `wellnessNoContract`. Eligibility (`requires`): `offers.edit`, `members.import`, `script.view`, `calendar.view`, `activities.add`, `followups.manage`, `notes.add`, `contracts.validity.view`, `deals.view`, `deals.edit`, `members.view`. Hand-offs (`opens`/`group`): `menu`, `activity`, `plan`, `detail`, `wellness`.
      - Integration: Loaded lazily through `loaders['clients.detail']` in `pageRegistry.ts`; copy keys resolve to `supportSales:clients.detail.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/clientsDetail.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/clientsDetail.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `offers.edit`, `members.import`, `script.view`, `calendar.view`, `activities.add`, `followups.manage`, `notes.add`, `contracts.validity.view`, `deals.view`, `deals.edit`, `members.view`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'clients.detail': () => import('./guides/clientsDetail')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'clients.detail'` on the entries for `clients/:clientId` and delete `'clients.detail'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/clients/ClientDetailContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientDetailContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L104 permission check [contracts.validity.view]; L105 permission check [deals.view]; L106 permission check [offers.edit]; L107 permission check [members.import]; L109 permission check [members.view]; L114 permission check [activities.add]; L115 permission check [notes.add]; L208 role=status (detail.duplicateNameWarning); L242 Button (detail.calculatePrice); L245 aria-label (detail.calculatePrice); L254 Button (detail.employeeUpload); L257 aria-label (detail.employeeUpload); L264 Button (detail.editAria); L267 aria-label (detail.editAria); L273 Button (detail.emailAria); L276 aria-label (detail.emailAria); L282 DropdownMenu (detail.moreAria); L285 Button (detail.moreAria); L430 button (detail.customFieldSettingsAria); L433 aria-label (detail.customFieldSettingsAria); L474 Tabs (detail.sectionsLabel); L509 Button (detail.channels.${channel}); L531 Button (detail.newAppointment); L543 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/clients/ClientDetailContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/followUps/FollowUpsPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpsPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L36 permission check [calendar.view]; L37 permission check [activities.add]; L74 Button (section.plan).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/followUps/FollowUpQuickButtons.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpQuickButtons`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L39 permission check [followups.manage]; L65 aria-label (quick.label); L74 Button (quick.intervalAria); L78 aria-label (quick.intervalAria); L86 Button (quick.custom).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/followUps/FollowUpList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FollowUpList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L46 permission check [followups.manage]; L47 permission check [followups.manage]; L104 Link (item.openCompany); L115 Link (item.openDeal); L125 aria-label (actions.label); L126 Button (actions.complete); L129 Button (actions.reschedule); L132 Button (actions.cancel); L136 Button (actions.reassign).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/components/clients/CompanyTimeline.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CompanyTimeline`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L139 Button (activity.edit); L280 aria-label (detail.timeline.filtersLabel); L281 button; L290 button; L304 role=alert (detail.timeline.loadError); L333 Button (detail.timeline.loadingMore).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/clients/CompanyTimeline.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   10. **Modify** `src/components/activities/ActivityDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ActivityDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L76 permission check [notes.add]; L77 permission check [activities.add]; L78 permission check [deals.view]; L79 permission check [followups.manage]; L200 SlideOver (activity.editTitle); L207 Button; L211 Button (activity.save); L214 Button (activity.save); L223 role=status (activity.saved); L231 role=alert; L238 aria-label (activity.type); L243 button; L259 TextInput (activity.occurredAt); L270 SelectInput (activity.contact); L286 SelectInput (activity.result); L304 SelectInput (activity.deal); L317 TextareaInput (activity.clientFeedback); L318 TextareaInput (activity.nextAction); L322 TextareaInput (activity.note).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/activities/ActivityDialog.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   11. **Modify** `src/components/clients/ClientContractsTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientContractsTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L57 Button (clientTab.newContract); L107 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/clients/ClientContractsTab.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   12. **Modify** `src/components/clients/ClientDealsTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientDealsTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L47 Button (newDeal); L59 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/clients/ClientDealsTab.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   13. **Modify** `src/pages/membership/CompanyWellnessTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CompanyWellnessTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L90 Button (companyTab.upload); L97 aria-label (companyTab.perTier); L106 Button (companyTab.removeSelected); L118 input (companyTab.selectAll); L131 input (companyTab.select); L140 button; L160 Button (companyTab.openInList); L175 button; L191 role=alert (companyTab.cardLinksFailed); L220 Button (companyTab.cardLinks).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   14. **Modify** `src/pages/membership/MemberBadges.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TierBadge`, `StatusBadge`, `ExpiringBadge`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   15. **Modify** `src/pages/membership/RemoveFromCompanyDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('clients.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RemoveFromCompanyDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L58 Modal (removeEmployer.helpMany); L61 TextInput (removeEmployer.leftOn); L72 TextareaInput (removeEmployer.reason); L83 role=alert (removeEmployer.cancel); L86 Button (removeEmployer.cancel); L87 Button (removeEmployer.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   16. **Leave unchanged** `src/pages/clients/ClientDetailPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   17. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `clients.detail.<step>.title` and `.body` for these steps: `title`, `duplicateNotice`, `calculatePrice`, `employeeUpload`, `edit`, `email`, `more`, `moreItems`, `scriptButton`, `summary`, `contactsList`, `customFields`, `customFieldSettings`, `followUpsPanel`, `followUpOpeners`, `followUpItem`, `followUpsEmpty`, `notFound`, `tabs`, `timelineItem`, `timelineEmpty`, `channelButton`, `addNote`, `activityDialog`, `activityResult`, `activityWhen`, `activityNotes`, `activityFollowUp`, `activitySave`, `activityCancel`, `tabAppointments`, `appointmentsList`, `appointmentItem`, `appointmentsEmpty`, `schedule`, `planRecap`, `detailRecap`, `tabContracts`, `contractsList`, `contractsEmpty`, `contractRowLink`, `contractsStatus`, `tabDeals`, `dealsList`, `dealItem`, `dealsEmpty`, `newDeal`, `tabWellness`, `wellnessSummary`, `wellnessTable`, `wellnessRow`, `wellnessUpload`, `wellnessEmpty`, `wellnessDialog`, `wellnessDialogActions`, `wellnessNoContract`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   18. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `clients.detail.<step>.title` and `.body` for these steps in Albanian: `title`, `duplicateNotice`, `calculatePrice`, `employeeUpload`, `edit`, `email`, `more`, `moreItems`, `scriptButton`, `summary`, `contactsList`, `customFields`, `customFieldSettings`, `followUpsPanel`, `followUpOpeners`, `followUpItem`, `followUpsEmpty`, `notFound`, `tabs`, `timelineItem`, `timelineEmpty`, `channelButton`, `addNote`, `activityDialog`, `activityResult`, `activityWhen`, `activityNotes`, `activityFollowUp`, `activitySave`, `activityCancel`, `tabAppointments`, `appointmentsList`, `appointmentItem`, `appointmentsEmpty`, `schedule`, `planRecap`, `detailRecap`, `tabContracts`, `contractsList`, `contractsEmpty`, `contractRowLink`, `contractsStatus`, `tabDeals`, `dealsList`, `dealItem`, `dealsEmpty`, `newDeal`, `tabWellness`, `wellnessSummary`, `wellnessTable`, `wellnessRow`, `wellnessUpload`, `wellnessEmpty`, `wellnessDialog`, `wellnessDialogActions`, `wellnessNoContract`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   19. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'clients.detail', route: 'clients/:clientId' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "clients.detail"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/clients/ClientDetailContent.tsx`, `src/components/followUps/FollowUpsPanel.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpList.tsx`, `src/components/clients/CompanyTimeline.tsx`.
   3. **PT-3 Annotate** about 50 sites in those files. Includes: Annotate `FollowUpsPanel`, `FollowUpQuickButtons` and `FollowUpList` once with component-scoped ids (`followUps.*`); the deal page and the follow-ups page reuse them; `ActivityDialog` annotation of its fields and footer (component is shared with the deal page, so ids are namespaced under `activity.*` and reused there); Tab-scope wiring for the tabs of this slice; Annotate `MemberBadges` and `RemoveFromCompanyDialog` (shared with the members pages) with component-scoped ids.
   4. **PT-4 Write the guide**: 56 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.detail.<id>.title|body`):
      - `title` — company name, status and risk badge (info)
      - `duplicateNotice` — notice shown when another company shares the name (state)
      - `calculatePrice` — opens the pricing screen (needs `offers.edit`, explain-only: navigation)
      - `employeeUpload` — opens the employee upload (needs `members.import`, explain-only: navigation)
      - `edit` — edit the company (explain-only: navigation)
      - `email` — compose an email to the company (explain-only)
      - `more` — the more menu trigger (try-it, opens menu)
      - `moreItems` — the items inside the menu (group: menu, explain-only; archive-class items carry a warning)
      - `scriptButton` — sales script button (needs `script.view`; opens the right-hand panel, explain-only)
      - `summary` — the summary card: owner, location, status (info)
      - `contactsList` — contact persons shown on the card (repeat)
      - `customFields` — the custom field values (repeat)
      - `customFieldSettings` — the small settings button next to custom fields (explain-only: navigation)
      - `followUpsPanel` — the follow-ups panel: this company's open follow-ups (needs `calendar.view`; component `FollowUpsPanel`, shared with the deal page; component-scoped ids `followUps.*`)
      - `followUpOpeners` — the panel's "Plan" button (needs `activities.add`) and the quick follow-up buttons by configured interval (needs `followups.manage`); both open dialogs (try-it)
      - `followUpItem` — one follow-up with Complete, Reschedule, Cancel and, by scope, Reassign (repeat; the openers are try-it, the rest explain-only)
      - `followUpsEmpty` — no follow-ups (state)
      - `notFound` — not-found / load-failed state (state)
      - `tabs` — the tab list (shared.tabs; try-it)
      - `timelineItem` — one timeline entry (repeat)
      - `timelineEmpty` — empty timeline (state)
      - `channelButton` — a channel button (repeat, try-it, opens the activity dialog)
      - `addNote` — add note control (needs `notes.add`)
      - `activityDialog` — the dialog root and its purpose (group: activity)
      - `activityResult` — result select (group: activity, try-it)
      - `activityWhen` — date / time inputs (group: activity, try-it)
      - `activityNotes` — free-text notes (group: activity, try-it)
      - `activityFollowUp` — optional follow-up scheduling inside the dialog (group: activity, needs `followups.manage`)
      - `activitySave` — Save (group: activity, explain-only: submit)
      - `activityCancel` — Cancel (group: activity, explain-only)
      - `tabAppointments` — Appointments tab (try-it)
      - `appointmentsList` — appointments region
      - `appointmentItem` — one appointment (repeat, try-it: opens the shared appointment detail panel, component-scoped ids `apptDetail.*`)
      - `appointmentsEmpty` — no appointments (state)
      - `schedule` — "Schedule appointment" button (try-it: opens the shared Plan activity dialog, ids `plan.*`, annotated with the calendar page)
      - `planRecap` — the Plan activity dialog is explained by the shared `plan.*` guidance (group: plan, shared)
      - `detailRecap` — the appointment detail panel is explained by the shared `apptDetail.*` guidance (group: detail, shared)
      - `tabContracts` — Contracts tab (needs `contracts.validity.view`, try-it)
      - `contractsList` — contracts of this company (repeat)
      - `contractsEmpty` — no contracts (state)
      - `contractRowLink` — open a contract (repeat, explain-only: navigation)
      - `contractsStatus` — validity badge on a contract (repeat, shared.statusBadge)
      - `tabDeals` — Deals tab (needs `deals.view`, try-it)
      - `dealsList` — deals of this company
      - `dealItem` — one deal (repeat)
      - `dealsEmpty` — no deals (state)
      - `newDeal` — create a deal for this company (needs `deals.edit`, explain-only: navigation)
      - `tabWellness` — Wellness+ tab (needs `members.view`, try-it)
      - `wellnessSummary` — employees counted and contract validity (info)
      - `wellnessTable` — member table (repeat rows)
      - `wellnessRow` — one employee member (repeat, explain-only: navigation); tier and status shown with the shared member badges (`MemberBadges`, annotated here and reused by the members pages)
      - `wellnessUpload` — upload entry from this tab (needs `members.import`, explain-only)
      - `wellnessEmpty` — no linked members (state)
      - `wellnessDialog` — the remove-from-company dialog (`RemoveFromCompanyDialog`, shared with the member page, component-scoped ids `removeFromCompany.*`, annotated here) (group: wellness)
      - `wellnessDialogActions` — its buttons (group: wellness, explain-only)
      - `wellnessNoContract` — message when the company has no valid contract (state)
   5. **PT-5 Register** `/:tenantSlug/clients/:clientId` as page `clients.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `clients.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No timeline entries: only `timelineEmpty` is explained. Empty variants for appointments and contracts. Each tab has its own empty state.
   - **Loading / skeleton (L):** Page-level loading is waited out, then the tour starts at `title`.
   - **Populated, repeated rows or cards (P):** Timeline entries are `repeat`; the first visible one is the exemplar.
   - **Error / retry (X):** Not-found / load-failed has its own single explanatory step and the rest are skipped.
   - **Permission- or workflow-dependent controls (A):** Each action-bar button is dropped when its permission is missing. Add-note and channel buttons are dropped without `notes.add` / `activities.add`; the follow-up block needs `followups.manage`. Contracts tab needs `contracts.validity.view`. Tabs and actions follow `deals.view`, `deals.edit`, `members.view`, `members.import`.
   - **Dialogs, drawers, menus, nested workflows (D):** The more menu is a hand-off step. The channel button opens `ActivityDialog`; the tour explains its fields only after the user opens it. The Plan activity dialog and the appointment detail panel are shared components: this page only declares the hand-offs and reuses their guidance. The Wellness+ dialog is a hand-off.
   - **Tabs / sections (T):** Tab steps carry `scope.tab`; the tour runs the active tab and ends with "other tabs" pointing at the tab list. Tab-scoped steps as in the previous slice.
   - **Destructive or irreversible actions (explain-only) (K):** Archive-class items in the more menu carry a warning and are explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - A company without custom fields or contacts simply lacks those steps.
   - If the user edits and returns while a tour is exited, Resume continues from the stored step id; if that step no longer exists, it falls back to the nearest following step.
   - New activities saved by the user after the tour exits appear as new timeline entries with the same repeated id.
   - If the dialog's result list is empty (lookup not configured) the `activityResult` step is dropped.
   - Tab content loads lazily (the contracts tab loads its own data): the step waits on `aria-busy` rather than assuming an empty tab.
   - Linked members change after an upload in another tab; the table rows are `repeat`, so the new employees need no tour change.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 12 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Permission matrix across the three action buttons.
   - More menu hand-off with the real `DropdownMenu`.
   - Duplicate-name notice present / absent.
   - Real `ActivityDialog`: tour waits for the user to open it, explains five fields, never saves.
   - Timeline with 0, 1 and 50 entries.
   - Permission variants.
   - Tab-scoped eligibility; lazily loaded contracts tab waiting then populated; empty variants.
   - Wellness tab with 0 / 3 / 40 members; no valid contract notice; permission matrix.
   - Regression: existing tests of `ClientDetailContent.tsx`, `FollowUpsPanel.tsx`, `FollowUpQuickButtons.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Tour never navigates; every navigation button is explain-only.
   - The `activity.*` ids are documented as shared with the deals slice that reuses the dialog.
   - Tour from any tab ends with a pointer to the remaining tabs, not an error.
   - All five tabs of the page are reachable from Support; matrix in section 5.7 shows the page complete.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsDetail src/pages/clients src/components/followUps src/components/clients src/components/activities
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 630.
15. **Dependencies and handoff:** unblocks S14, S28, S30. After this slice **Client detail is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s10"></a>

### S10: Pricing screen (offer builder): complete tour

1. **Slice id and title:** S10. Pricing screen (offer builder): complete tour. Branch `support-slice-10-pricing-screen-offer-builder-complete-tour`.
2. **Scope:** The whole pricing screen for both entry routes (from a deal, from a company). In scope: `entry`, `scriptButton`, `dealSelect`, `employees`, `employeeBand`, `businessType`, `businessTypeRisk`, `zone`, `frequency`, `package`, `packageServices`, `extraFields`, `contact`, `discount`, `summary`, `warnings`, `approval`, `save`, `saveDisabled`. Out of scope: every other page (item 16).
3. **Purpose:** A calculation screen where wrong guidance is costly; every step restates what the server calculates and what the user controls.
   - **Description.** This slice delivers the complete guided tour of **Pricing screen (offer builder)** (`/:tenantSlug/deals/:dealId/pricing`, `/:tenantSlug/clients/:clientId/pricing`) and nothing else. A user who opens Support on this page can tour 19 steps in order, ask about any single control, and replay or leave. What the page is for: Build a price from business type, zone, frequency, package and employee band; see the calculation and any approval warning; save the offer on a deal. What the tour walks through: Deal selector (when entered from a company), employee count input, business type, zone, frequency, package (with a services list), contact person, discount inputs, calculation summary, warnings (`role="alert"`), Save. What changes the tour at runtime: Entered from a deal or from a company (deal chosen on screen); Save disabled until `canSave`; discount and approval states depend on pricing settings and permissions. Load error (`pricingScreenError`), warning text, saving. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Pricing screen (offer builder)** (`pricing.offer`; `/:tenantSlug/deals/:dealId/pricing`, `/:tenantSlug/clients/:clientId/pricing`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/pricing/PricingContent.tsx`.
6. **Production LOC estimate:** **~214** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 19 steps x 8 = 152 + 17 annotation sites x 2 = 34 + `vars` for entry mode and derived values read from the summary region 12. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/pricingOffer.ts`
      - Change: Create the page guide with the 19 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'pricing.offer', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'pricing.offer.<id>', kind, safety, … }`. Steps in state-only elements: `warnings`. Eligibility (`requires`): `script.view`. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['pricing.offer']` in `pageRegistry.ts`; copy keys resolve to `supportSales:pricing.offer.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/pricingOffer.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/pricingOffer.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `script.view`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'pricing.offer': () => import('./guides/pricingOffer')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'pricing.offer'` on the entries for `deals/:dealId/pricing`, `clients/:clientId/pricing` and delete `'pricing.offer'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/pricing/PricingContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('pricing.offer.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PricingContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L103 permission check [commercial.view]; L104 permission check [companies.edit]; L107 permission check [discounts.approve]; L305 Link (back.deal); L320 role=alert; L333 SelectInput (deal); L345 TextInput (employees); L357 input (alsoUpdateCompany); L368 SelectInput (businessType); L394 Link (editCompany); L398 SelectInput (zone); L414 SelectInput (frequency); L424 SelectInput (package); L433 aria-label (packageServices); L441 TextInput (discount); L451 TextInput (manualPrice); L464 TextareaInput (reasonPlaceholder); L476 SelectInput (contact); L491 TextareaInput (note); L545 Link (incomplete.link); L558 role=alert (aboveCap); L571 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/pricing/PricingContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/pricing/pricingScreenError.ts`
      - Change: Open the file and annotate the elements the steps name.
      - Implementation details: (non-component module: read it to find the render site)
      - Integration: Consumed by the page components listed in section 3.
      - Removal: No removal.
      - Verification: Guide test.
   7. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `pricing.offer.<step>.title` and `.body` for these steps: `entry`, `scriptButton`, `dealSelect`, `employees`, `employeeBand`, `businessType`, `businessTypeRisk`, `zone`, `frequency`, `package`, `packageServices`, `extraFields`, `contact`, `discount`, `summary`, `warnings`, `approval`, `save`, `saveDisabled`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `pricing.offer.<step>.title` and `.body` for these steps in Albanian: `entry`, `scriptButton`, `dealSelect`, `employees`, `employeeBand`, `businessType`, `businessTypeRisk`, `zone`, `frequency`, `package`, `packageServices`, `extraFields`, `contact`, `discount`, `summary`, `warnings`, `approval`, `save`, `saveDisabled`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'pricing.offer', route: 'deals/:dealId/pricing' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "pricing.offer"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/pricingOffer.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/pricing/PricingContent.tsx`, `src/pages/pricing/pricingScreenError.ts`.
   3. **PT-3 Annotate** about 17 sites in those files. Includes: `vars` for entry mode and derived values read from the summary region.
   4. **PT-4 Write the guide**: 19 steps, in tour order (`<id>` becomes the copy key `supportSales:pricing.offer.<id>.title|body`):
      - `entry` — where the user came from (deal vs company) and why a deal selector may appear
      - `scriptButton` — sales script button (needs `script.view`, explain-only)
      - `dealSelect` — deal chooser when entered from a company (try-it)
      - `employees` — number of employees input; drives the employee band (try-it)
      - `employeeBand` — resulting band (info)
      - `businessType` — business type select (try-it)
      - `businessTypeRisk` — risk surcharge caused by the business type (info)
      - `zone` — price zone select (try-it)
      - `frequency` — visit frequency select (try-it)
      - `package` — package select (try-it)
      - `packageServices` — services included in the chosen package (repeat)
      - `extraFields` — additional inputs rendered by this tenant's configuration (read at slice start)
      - `contact` — contact person select (try-it)
      - `discount` — discount input and cap (try-it, needs the discount permission)
      - `summary` — the calculated price breakdown (info; never edited by the user)
      - `warnings` — alerts such as discount above the cap or approval required (state)
      - `approval` — what happens when approval is needed (info)
      - `save` — Save offer on the deal (explain-only: submit; disabled until `canSave`)
      - `saveDisabled` — why Save is disabled (disabledHint)
   5. **PT-5 Register** `/:tenantSlug/deals/:dealId/pricing`, `/:tenantSlug/clients/:clientId/pricing` as page `pricing.offer`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `pricing.offer`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Configuration loading is waited out.
   - **Error / retry (X):** A configuration load failure shows its own step.
   - **Permission- or workflow-dependent controls (A):** Discount controls and approval notes depend on pricing permissions.
   - **Validation and submission (V):** `save` is explain-only: the tour never saves an offer.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Changing the package changes the services list; the `packageServices` rows are repeated and re-render without tour changes.
   - Warnings appear and disappear as inputs change; their step is eligible only while rendered.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - From-deal and from-company routes; Save disabled then enabled; warnings present / absent.
   - Regression: existing tests of `PricingContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Playwright: no mutating request during the tour on either route.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/pricingOffer src/pages/pricing
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "pricing.offer"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 214.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Pricing screen (offer builder) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s11"></a>

### S11: Discount approvals: complete tour

1. **Slice id and title:** S11. Discount approvals: complete tour. Branch `support-slice-11-discount-approvals-complete-tour`.
2. **Scope:** The approvals queue. In scope: `title`, `table`, `row`, `rowOffer`, `rowDiscount`, `rowRequester`, `rowActions`, `columns`, `pagination`, `empty`, `error`, `denied`. Out of scope: every other page (item 16).
3. **Purpose:** A short page; the slice also pins down how a table with per-row decision actions is guided.
   - **Description.** This slice delivers the complete guided tour of **Discount approvals** (`/:tenantSlug/approvals`) and nothing else. A user who opens Support on this page can tour 12 steps in order, ask about any single control, and replay or leave. What the page is for: Review offers waiting for discount approval. What the tour walks through: DataTable of pending approvals with row actions, Pagination. What changes the tour at runtime: Whole page needs `discounts.approve`; only in the SALES_PROCESS workflow (nav item filter). Empty queue, loading, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Discount approvals** (`approvals`; `/:tenantSlug/approvals`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/approvals/ApprovalsPage.tsx`, `pages/approvals/ApprovalsContent.tsx`.
6. **Production LOC estimate:** **~140** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22 + `ApprovalsContent` row actions annotation (controls read at slice start) 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/approvals.ts`
      - Change: Create the page guide with the 12 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'approvals', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.pagination`. Each step: `{ id, target: 'approvals.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['approvals']` in `pageRegistry.ts`; copy keys resolve to `supportSales:approvals.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/approvals.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/approvals.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'approvals': () => import('./guides/approvals')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'approvals'` on the entries for `approvals` and delete `'approvals'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/approvals/ApprovalsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('approvals.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ApprovalsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L99 DataTable; L105 DataTable empty prop (approvalsList.empty); L114 Pagination.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/approvals/ApprovalsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Leave unchanged** `src/pages/approvals/ApprovalsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `approvals.<step>.title` and `.body` for these steps: `title`, `table`, `row`, `rowOffer`, `rowDiscount`, `rowRequester`, `rowActions`, `columns`, `pagination`, `empty`, `error`, `denied`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `approvals.<step>.title` and `.body` for these steps in Albanian: `title`, `table`, `row`, `rowOffer`, `rowDiscount`, `rowRequester`, `rowActions`, `columns`, `pagination`, `empty`, `error`, `denied`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'approvals', route: 'approvals' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "approvals"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/approvals.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/approvals/ApprovalsContent.tsx`.
   3. **PT-3 Annotate** about 11 sites in those files. Includes: `ApprovalsContent` row actions annotation (controls read at slice start).
   4. **PT-4 Write the guide**: 12 steps, in tour order (`<id>` becomes the copy key `supportSales:approvals.<id>.title|body`):
      - `title` — page heading and what needs approval
      - `table` — queue table region
      - `row` — one pending approval (repeat)
      - `rowOffer` — offer reference link (repeat, explain-only: navigation)
      - `rowDiscount` — requested discount vs the cap (repeat)
      - `rowRequester` — who asked (repeat)
      - `rowActions` — approve / reject controls as rendered (repeat, destructive-class, explain-only)
      - `columns` — column meanings
      - `pagination` — pagination (shared.pagination)
      - `empty` — nothing waiting (state)
      - `error` — load error (state)
      - `denied` — the page is reachable only with `discounts.approve` (info)
   5. **PT-5 Register** `/:tenantSlug/approvals` as page `approvals`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `approvals`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty queue explained. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Skeleton waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Pagination / sorting (G):** Pagination via shared guidance. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error step. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Whole page by permission and workflow.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Approving elsewhere removes the row; pagination total updates.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Empty, 1, 25 rows; pagination step only when more than one page.
   - Regression: existing tests of `ApprovalsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Row decisions are never triggered.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/approvals src/pages/approvals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "approvals"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 140.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Discount approvals is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s12"></a>

### S12: Offers list: complete tour

1. **Slice id and title:** S12. Offers list: complete tour. Branch `support-slice-12-offers-list-complete-tour`.
2. **Scope:** Search, status chips, filters, table and pagination. In scope: `title`, `search`, `statusChips`, `statusChip`, `salesperson`, `createdFrom`, `createdTo`, `clear`, `table`, `row`, `rowStatus`, `rowValue`, `pagination`, `emptyFirst`, `emptyNoMatch`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** List-page pattern with chips; reuses shared filter guidance. It lets a first-time user learn Offers list in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Offers list** (`/:tenantSlug/offers`) and nothing else. A user who opens Support on this page can tour 16 steps in order, ask about any single control, and replay or leave. What the page is for: Search and filter offers by status, salesperson and dates; open one. What the tour walks through: Search; status chips (`aria-pressed`); salesperson select; created-from / created-to; Clear filters; DataTable; Pagination. What changes the tour at runtime: Needs `commercial.view`; salesperson select only above OWN scope; SALES_PROCESS workflow. Empty / no-match, loading, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Offers list** (`offers`; `/:tenantSlug/offers`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/offers/OfferList.tsx`, `pages/offers/OfferListContent.tsx`.
6. **Production LOC estimate:** **~172** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/offers.ts`
      - Change: Create the page guide with the 16 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'offers', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`, `shared.pagination`. Each step: `{ id, target: 'offers.<id>', kind, safety, … }`. Steps in state-only elements: `emptyFirst`, `emptyNoMatch`, `error`. Eligibility (`requires`): `commercial.view`. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['offers']` in `pageRegistry.ts`; copy keys resolve to `supportSales:offers.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/offers.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/offers.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `commercial.view`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'offers': () => import('./guides/offers')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'offers'` on the entries for `offers` and delete `'offers'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/offers/OfferListContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('offers.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `OfferListContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L38 permission check [commercial.view]; L156 TextInput (list.searchLabel); L164 aria-label (list.statuses); L166 button; L173 SelectInput (list.salesperson); L182 TextInput (list.createdFrom); L183 TextInput (list.createdTo); L187 Button (list.clear); L197 DataTable; L203 DataTable empty prop (list.emptyFiltered); L212 Pagination.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/offers/OfferListContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `offers.<step>.title` and `.body` for these steps: `title`, `search`, `statusChips`, `statusChip`, `salesperson`, `createdFrom`, `createdTo`, `clear`, `table`, `row`, `rowStatus`, `rowValue`, `pagination`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `offers.<step>.title` and `.body` for these steps in Albanian: `title`, `search`, `statusChips`, `statusChip`, `salesperson`, `createdFrom`, `createdTo`, `clear`, `table`, `row`, `rowStatus`, `rowValue`, `pagination`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'offers', route: 'offers' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "offers"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/offers.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/offers/OfferListContent.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files.
   4. **PT-4 Write the guide**: 16 steps, in tour order (`<id>` becomes the copy key `supportSales:offers.<id>.title|body`):
      - `title` — heading
      - `search` — search field (try-it)
      - `statusChips` — status chip group (aria-pressed)
      - `statusChip` — one chip (repeat, try-it)
      - `salesperson` — salesperson filter (scope above OWN, try-it)
      - `createdFrom` — created-from date (try-it)
      - `createdTo` — created-to date (try-it)
      - `clear` — Clear filters (exists while a filter is active)
      - `table` — offers table region
      - `row` — one offer (repeat, explain-only: navigation)
      - `rowStatus` — status badge (repeat, shared.statusBadge)
      - `rowValue` — value column (repeat, needs `commercial.view`)
      - `pagination` — pagination (shared.pagination)
      - `emptyFirst` — no offers yet (state)
      - `emptyNoMatch` — nothing matches the filters (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/offers` as page `offers`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `offers`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Distinct first-use and no-match empties.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Chips and filters change the result; `clear` follows filter state.
   - **Pagination / sorting (G):** Shared pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Value column and salesperson by permission and scope.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Toggling a chip while the tour sits on `statusChips` does not disturb it.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Chip toggling; empties; scope variants.
   - Regression: existing tests of `OfferListContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Playwright list tour with zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/offers src/pages/offers
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "offers"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 172.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Offers list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s13"></a>

### S13: Deal form (create and edit): complete tour

1. **Slice id and title:** S13. Deal form (create and edit): complete tour. Branch `support-slice-13-deal-form-create-and-edit-complete`.
2. **Scope:** Create and edit deal. In scope: `mode`, `companySearch`, `companyMatch`, `companyChosen`, `changeCompany`, `type`, `title`, `value`, `salesperson`, `notes`, `formError`, `fieldErrors`, `cancel`, `save`. Out of scope: every other page (item 16).
3. **Purpose:** Company search by typing is the interesting dynamic part. It lets a first-time user learn Deal form (create and edit) in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Deal form (create and edit)** (`/:tenantSlug/deals/new`, `/:tenantSlug/deals/:dealId/edit`) and nothing else. A user who opens Support on this page can tour 14 steps in order, ask about any single control, and replay or leave. What the page is for: Create or edit a deal; pick the company by search; set type, value, owner, notes. What the tour walks through: Company search with matches list and "change company"; type; value/title inputs; salesperson select; notes textarea; Cancel; Save. What changes the tour at runtime: Salesperson select needs `companies.reassign`; needs `deals.edit`. Field errors, `role="alert"` form error, saving. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Deal form (create and edit)** (`deals.form`; `/:tenantSlug/deals/new`, `/:tenantSlug/deals/:dealId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/deals/DealFormContent.tsx`.
6. **Production LOC estimate:** **~154** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dealsForm.ts`
      - Change: Create the page guide with the 14 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'deals.form', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'deals.form.<id>', kind, safety, … }`. Steps in state-only elements: `companyChosen`, `formError`, `fieldErrors`. Eligibility (`requires`): `companies.reassign`. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['deals.form']` in `pageRegistry.ts`; copy keys resolve to `supportSales:deals.form.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dealsForm.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dealsForm.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `companies.reassign`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'deals.form': () => import('./guides/dealsForm')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'deals.form'` on the entries for `deals/new`, `deals/:dealId/edit` and delete `'deals.form'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/deals/DealFormContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DealFormContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L43 permission check [companies.reassign]; L144 form (breadcrumb); L159 Button (form.companyChange); L166 TextInput (form.companySearch); L179 button; L192 SelectInput (form.type); L199 TextInput (form.expectedClose); L208 TextInput (form.title); L219 SelectInput (form.salesperson); L231 TextareaInput (form.notes); L241 role=alert; L247 Button (form.cancel); L250 Button (form.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/deals/DealFormContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `deals.form.<step>.title` and `.body` for these steps: `mode`, `companySearch`, `companyMatch`, `companyChosen`, `changeCompany`, `type`, `title`, `value`, `salesperson`, `notes`, `formError`, `fieldErrors`, `cancel`, `save`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `deals.form.<step>.title` and `.body` for these steps in Albanian: `mode`, `companySearch`, `companyMatch`, `companyChosen`, `changeCompany`, `type`, `title`, `value`, `salesperson`, `notes`, `formError`, `fieldErrors`, `cancel`, `save`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'deals.form', route: 'deals/new' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "deals.form"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dealsForm.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/DealFormContent.tsx`.
   3. **PT-3 Annotate** about 13 sites in those files.
   4. **PT-4 Write the guide**: 14 steps, in tour order (`<id>` becomes the copy key `supportSales:deals.form.<id>.title|body`):
      - `mode` — create vs edit
      - `companySearch` — company search field (try-it)
      - `companyMatch` — a search result (repeat, explain-only)
      - `companyChosen` — chosen company with change button (state)
      - `changeCompany` — change the company (try-it)
      - `type` — deal type select (try-it)
      - `title` — title / value input (try-it)
      - `value` — value input (try-it)
      - `salesperson` — owner select (needs `companies.reassign`)
      - `notes` — notes (try-it)
      - `formError` — form error (state)
      - `fieldErrors` — inline errors (state)
      - `cancel` — back (explain-only: navigation)
      - `save` — Save (explain-only: submit)
   5. **PT-5 Register** `/:tenantSlug/deals/new`, `/:tenantSlug/deals/:dealId/edit` as page `deals.form`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `deals.form`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Edit-mode load. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Permission- or workflow-dependent controls (A):** Owner select by permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** None beyond the result list. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Errors explained if rendered. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Search results appear after typing; absent results skip `companyMatch`.
   - Choosing a company swaps the search for the chosen state.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Create vs edit; permission; search result presence.
   - Regression: existing tests of `DealFormContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Submit lock verified in a unit test with Enter.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dealsForm src/pages/deals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "deals.form"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 154.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Deal form (create and edit) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s14"></a>

### S14: Deal detail: complete tour

1. **Slice id and title:** S14. Deal detail: complete tour. Branch `support-slice-14-deal-detail-complete-tour`.
2. **Scope:** Header, the open / won / lost action sets, the actions menu, the stage select and the history list. The offers section and the activities section. The six dialogs of the page.
3. **Purpose:** Open, won and lost deals expose different controls; the tour follows what is rendered. Both are repeated, data-driven lists with row actions. All are data-changing; every confirm button is explain-only.
   - **Description.** This slice delivers the complete guided tour of **Deal detail** (`/:tenantSlug/deals/:dealId`) and nothing else. A user who opens Support on this page can tour 63 steps in order, ask about any single control, and replay or leave. What the page is for: Read a deal; move its stage; win, lose or reopen it; reassign; delete; manage its offers and activities. What the tour walks through: Sales script button; Win / Lose / Reopen / Edit buttons; actions menu; stage select; history list; offers section (offers, pricing link, create contract); activities section (add, list); the shared follow-ups panel (`FollowUpsPanel`); Win, Lose, Reopen and Reassign dialogs; delete ConfirmDialog. What changes the tour at runtime: Edit needs `deals.edit`; Reassign `companies.reassign`; Delete `deals.delete`; Reopen `deals.reopen`; Win is disabled without an offer; open vs closed deals show different actions. Open vs won vs lost deal; empty offers/activities; dialog validation (`disabled` until a reason/comment). The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Deal detail** (`deals.detail`; `/:tenantSlug/deals/:dealId`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S09 (Client detail: complete tour). Existing code it relies on, unchanged since planning: `pages/deals/DealDetailContent.tsx`, `pages/deals/DealClosingModals.tsx`, `pages/deals/DealActivitiesSection.tsx`, `pages/deals/DealOffersSection.tsx`.
6. **Production LOC estimate:** **~658** (under the band (600 to 799)): 16 guide module, loader line, route-map flip + 63 steps x 8 = 504 + 57 annotation sites x 2 = 114 + Open / won / lost mode markers on the action bar 8 + Annotations across `DealClosingModals` (component-scoped `dealClosing.*`, reused by the pipeline board) and the two inline dialogs in `DealDetailContent` 16. Copy is JSON and not counted.
7. **File-Level Change Plan** (14 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dealsDetail.ts`
      - Change: Create the page guide with the 63 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'deals.detail', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'deals.detail.<id>', kind, safety, … }`. Steps in state-only elements: `stateBanner`, `offersEmpty`, `activitiesEmpty`. Eligibility (`requires`): `deals.reopen`, `deals.edit`, `companies.reassign`, `deals.delete`, `script.view`, `offers.edit`, `discounts.approve`, `activities.add`. Hand-offs (`opens`/`group`): `menu`, `offer`, `win`, `lose`, `reopen`, `reassign`, `delete`, `all`.
      - Integration: Loaded lazily through `loaders['deals.detail']` in `pageRegistry.ts`; copy keys resolve to `supportSales:deals.detail.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dealsDetail.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dealsDetail.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `deals.reopen`, `deals.edit`, `companies.reassign`, `deals.delete`, `script.view`, `offers.edit`, `discounts.approve`, `activities.add`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'deals.detail': () => import('./guides/dealsDetail')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'deals.detail'` on the entries for `deals/:dealId` and delete `'deals.detail'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/deals/DealDetailContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DealDetailContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L51 permission check [deals.edit]; L52 permission check [companies.reassign]; L53 permission check [deals.delete]; L54 permission check [deals.reopen]; L87 Link (detail.back); L156 Link (detail.back); L164 Link; L172 Link (renewal.of); L182 Button (win.action); L185 Button (lose.action); L191 Button (reopen.action); L196 Button (detail.edit); L201 DropdownMenu (detail.actions); L204 Button (detail.actions); L222 SelectInput (detail.moveTo); L257 Button; L323 Link (contract.open); L326 Button (contract.create); L448 Modal (detail.reassignTitle); L450 SelectInput (detail.reassignLabel); L463 Button (form.cancel); L466 Button (detail.reassignConfirm); L474 ConfirmDialog (detail.deleteTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/deals/DealDetailContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/deals/DealOffersSection.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DealOffersSection`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L51 permission check [commercial.view]; L52 permission check [offers.edit]; L100 Button (offers.calculate); L112 aria-label (detail.offers).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/deals/DealOffersSection.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/components/offers/OfferActions.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `OfferActions`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L129 Button (actions.preview); L132 SelectInput (actions.language); L141 Button (actions.download); L146 Button (actions.edit); L151 Button (done.ready); L160 Button (actions.markSent); L165 Button (actions.markAccepted); L170 Button (actions.markRejected); L175 Button (actions.revise); L180 Button (actions.approve); L185 Button (actions.reject); L190 Button (actions.withdraw); L196 role=status (approval.waitingManual); L207 ConfirmDialog (sent.title); L219 TextInput (sent.date); L231 ConfirmDialog (accepted.title); L242 TextareaInput (response.note); L247 ConfirmDialog (rejected.title); L258 TextareaInput (response.note); L263 ConfirmDialog (revise.title); L273 ConfirmDialog (approval.approveManualTitle); L300 TextInput; L314 TextareaInput (approval.comment); L327 ConfirmDialog (approval.rejectManualTitle); L343 TextareaInput (approval.comment); L356 ConfirmDialog (approval.withdrawTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/pages/deals/DealActivitiesSection.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DealActivitiesSection`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L31 permission check [activities.add]; L32 permission check [notes.add]; L68 Button; L95 Button (activity.edit).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/components/activities/ActivityDetails.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ActivityDetails`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/components/activities/useCanEditActivity.ts`
      - Change: Open the file and annotate the elements the steps name.
      - Implementation details: (non-component module: read it to find the render site)
      - Integration: Consumed by the page components listed in section 3.
      - Removal: No removal.
      - Verification: Guide test.
   11. **Modify** `src/pages/deals/DealClosingModals.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('deals.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `WinDealModal`, `LoseDealModal`, `ReopenDealModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L93 Modal (win.title); L95 role=alert (win.noOffer); L97 aria-label (win.fromOffer); L121 TextInput (win.closingDate); L124 input (win.closeFollowUps); L129 Button (form.cancel); L132 Button (win.confirm); L171 Modal (lose.title); L174 SelectInput (lose.reason); L184 TextareaInput (lose.note); L186 Button (form.cancel); L189 Button (lose.confirm); L226 Modal (reopen.title); L228 SelectInput (reopen.stage); L235 TextareaInput (reopen.comment); L237 Button (form.cancel); L240 Button (reopen.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   12. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `deals.detail.<step>.title` and `.body` for these steps: `title`, `stateBanner`, `win`, `winDisabled`, `lose`, `reopen`, `edit`, `actionsMenu`, `actionReassign`, `actionDelete`, `stageSelect`, `summary`, `historyItem`, `scriptButton`, `offersSection`, `offersEmpty`, `offer`, `offerOpen`, `offerPricing`, `createContract`, `offerWin`, `offerActionsBar`, `preview`, `offerLanguage`, `download`, `editOffer`, `submitApproval`, `send`, `accept`, `reject`, `revise`, `approveDiscount`, `rejectDiscount`, `withdraw`, `offerDialogs`, `offerDialogFields`, `offerDialogConfirm`, `offerNotice`, `activitiesSection`, `addActivity`, `activity`, `activityDetails`, `activityEdit`, `activitiesEmpty`, `followUpsPanel`, `winDialog`, `winFromOffer`, `winDate`, `winCloseFollowUps`, `winConfirm`, `loseDialog`, `loseReason`, `loseConfirm`, `reopenDialog`, `reopenStage`, `reopenComment`, `reopenConfirm`, `reassignDialog`, `reassignOwner`, `reassignConfirm`, `deleteDialog`, `deleteConfirm`, `dialogCancel`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   13. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `deals.detail.<step>.title` and `.body` for these steps in Albanian: `title`, `stateBanner`, `win`, `winDisabled`, `lose`, `reopen`, `edit`, `actionsMenu`, `actionReassign`, `actionDelete`, `stageSelect`, `summary`, `historyItem`, `scriptButton`, `offersSection`, `offersEmpty`, `offer`, `offerOpen`, `offerPricing`, `createContract`, `offerWin`, `offerActionsBar`, `preview`, `offerLanguage`, `download`, `editOffer`, `submitApproval`, `send`, `accept`, `reject`, `revise`, `approveDiscount`, `rejectDiscount`, `withdraw`, `offerDialogs`, `offerDialogFields`, `offerDialogConfirm`, `offerNotice`, `activitiesSection`, `addActivity`, `activity`, `activityDetails`, `activityEdit`, `activitiesEmpty`, `followUpsPanel`, `winDialog`, `winFromOffer`, `winDate`, `winCloseFollowUps`, `winConfirm`, `loseDialog`, `loseReason`, `loseConfirm`, `reopenDialog`, `reopenStage`, `reopenComment`, `reopenConfirm`, `reassignDialog`, `reassignOwner`, `reassignConfirm`, `deleteDialog`, `deleteConfirm`, `dialogCancel`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   14. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'deals.detail', route: 'deals/:dealId' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "deals.detail"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dealsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/DealDetailContent.tsx`, `src/pages/deals/DealOffersSection.tsx`, `src/components/offers/OfferActions.tsx`, `src/pages/deals/DealActivitiesSection.tsx`, `src/components/activities/ActivityDetails.tsx`.
   3. **PT-3 Annotate** about 57 sites in those files. Includes: Open / won / lost mode markers on the action bar; Annotations across `DealClosingModals` (component-scoped `dealClosing.*`, reused by the pipeline board) and the two inline dialogs in `DealDetailContent`.
   4. **PT-4 Write the guide**: 63 steps, in tour order (`<id>` becomes the copy key `supportSales:deals.detail.<id>.title|body`):
      - `title` — deal title, company, stage badge
      - `stateBanner` — won / lost banner (state)
      - `win` — Win (open deals, explain-only; disabled without an offer)
      - `winDisabled` — why Win is disabled (disabledHint)
      - `lose` — Lose (open deals, explain-only: opens a dialog but changes data on confirm)
      - `reopen` — Reopen (closed deals, needs `deals.reopen`, explain-only)
      - `edit` — Edit (needs `deals.edit`, explain-only: navigation)
      - `actionsMenu` — actions menu trigger (try-it, opens menu)
      - `actionReassign` — Reassign (group: menu, needs `companies.reassign`, explain-only)
      - `actionDelete` — Delete (group: menu, destructive, needs `deals.delete`, explain-only)
      - `stageSelect` — move to stage (try-it for opening; changing it changes data: explain-only)
      - `summary` — summary facts (value, owner, dates)
      - `historyItem` — one history entry (repeat)
      - `scriptButton` — sales script button (needs `script.view`, explain-only)
      - `offersSection` — offers section
      - `offersEmpty` — no offers (state)
      - `offer` — one offer (repeat)
      - `offerOpen` — open the offer (repeat, explain-only)
      - `offerPricing` — go to pricing (needs `offers.edit`, explain-only: navigation)
      - `createContract` — create a contract from a won offer (needs contracts permission, explain-only: creates data)
      - `offerWin` — win with this offer (explain-only)
      - `offerActionsBar` — the per-offer action bar (`OfferActions`, component-scoped ids `offerActions.*`)
      - `preview` — Preview PDF (try-it: read-only)
      - `offerLanguage` — document language select (try-it)
      - `download` — Download PDF (try-it: read-only)
      - `editOffer` — Edit offer (draft, needs `offers.edit`, explain-only: navigation)
      - `submitApproval` — the button at `OfferActions` line ~151 (read at slice start; likely submit for approval) (explain-only)
      - `send` — mark as sent (explain-only: changes status)
      - `accept` — mark accepted (explain-only)
      - `reject` — mark rejected (explain-only)
      - `revise` — revise the offer (explain-only)
      - `approveDiscount` — approve the discount (needs `discounts.approve`, explain-only)
      - `rejectDiscount` — reject the discount (needs `discounts.approve`, explain-only)
      - `withdraw` — withdraw the approval request (explain-only)
      - `offerDialogs` — the confirmation dialogs, some requiring a reason (group: offer, vars: dialog title)
      - `offerDialogFields` — their reason and comment fields (group: offer, try-it)
      - `offerDialogConfirm` — their confirm buttons (group: offer, destructive-class, explain-only)
      - `offerNotice` — status notice (`role="status"`, state)
      - `activitiesSection` — activities section
      - `addActivity` — add an activity (needs `activities.add`, try-it, opens the shared activity dialog)
      - `activity` — one activity (repeat)
      - `activityDetails` — expand an activity to read its details (`ActivityDetails`, repeat, try-it)
      - `activityEdit` — edit own activity (repeat, needs edit rights, explain-only)
      - `activitiesEmpty` — none yet (state)
      - `followUpsPanel` — the follow-ups panel of this deal (reuses the component-scoped `followUps.*` guidance written with the client detail slice)
      - `winDialog` — Win dialog (group: win)
      - `winFromOffer` — facts taken from the offer (group: win)
      - `winDate` — closing date (group: win, try-it)
      - `winCloseFollowUps` — close open follow-ups checkbox (group: win, try-it)
      - `winConfirm` — Confirm (group: win, explain-only)
      - `loseDialog` — Lose dialog (group: lose)
      - `loseReason` — reason select (group: lose, try-it)
      - `loseConfirm` — Confirm (group: lose, destructive, explain-only)
      - `reopenDialog` — Reopen dialog (group: reopen)
      - `reopenStage` — stage select (group: reopen, try-it)
      - `reopenComment` — comment required (group: reopen, try-it)
      - `reopenConfirm` — Confirm (group: reopen, disabledHint until a comment exists, explain-only)
      - `reassignDialog` — Reassign dialog (group: reassign)
      - `reassignOwner` — owner select (group: reassign, try-it)
      - `reassignConfirm` — Save (group: reassign, disabledHint, explain-only)
      - `deleteDialog` — delete ConfirmDialog (group: delete, destructive)
      - `deleteConfirm` — danger confirm (group: delete, destructive, explain-only)
      - `dialogCancel` — Cancel in each dialog (group: all, explain-only)
   5. **PT-5 Register** `/:tenantSlug/deals/:dealId` as page `deals.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `deals.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Both sections have empty states. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** History is repeated. Offers and activities repeat.
   - **Error / retry (X):** Not found / load error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Edit, Reassign, Delete, Reopen by permission. Offer and activity actions by permission; edit by ownership (`useCanEditActivity`). Which dialogs can be opened depends on permission and deal state.
   - **Dialogs, drawers, menus, nested workflows (D):** Menu hand-off. The activity dialog reuses the `activity.*` guidance introduced with the client timeline slice. Each dialog is entered by a hand-off from the page button or menu item.
   - **Validation and submission (V):** Disabled confirm buttons explain what is missing.
   - **Destructive or irreversible actions (explain-only) (K):** Delete and Lose carry warnings. Lose, delete and win carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Closing the deal (by the user after exiting) changes the action set; resuming the tour recomputes eligibility and drops buttons that no longer exist.
   - New offers saved from the pricing screen appear as rows with the same id.
   - If the deal is closed in another tab while a dialog step is current, the layer closes and the tour returns to the page level.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Open / won / lost fixtures; permission matrix; disabled Win with and without an offer.
   - 0 / 3 offers; ownership-dependent edit button; shared dialog guidance reused.
   - Each dialog hand-off with real `Modal`; confirm buttons never invoke the service (spies).
   - Regression: existing tests of `DealDetailContent.tsx`, `DealOffersSection.tsx`, `OfferActions.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No stage change possible while touring.
   - Reuse of `activity.*` is asserted (no duplicate copy keys).
   - Playwright: open each dialog, finish tour, zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dealsDetail src/pages/deals src/components/offers src/components/activities
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "deals.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 658.
15. **Dependencies and handoff:** unblocks S15. After this slice **Deal detail is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s15"></a>

### S15: Pipeline board: complete tour

1. **Slice id and title:** S15. Pipeline board: complete tour. Branch `support-slice-15-pipeline-board-complete-tour`.
2. **Scope:** The board and its repeated structures. In scope: `title`, `viewSwitch`, `newDeal`, `board`, `column`, `columnCount`, `columnEmpty`, `card`, `cardCompany`, `cardValue`, `cardMarkers`, `cardMenu`, `cardMenuItems`, `loadMore`, `moveToClosed`, `closingRecap`, `boardEmpty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** The clearest "repeated card" case: any number of deals, columns and per-column paging with a fixed step list.
   - **Description.** This slice delivers the complete guided tour of **Pipeline board** (`/:tenantSlug/pipeline`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: See deals by stage, open a deal, create one, move a deal to another stage. What the tour walks through: View switch (board / list); "New deal"; stage columns with counts; deal cards; per-card "move to" menu; per-column "load more". What changes the tour at runtime: Move needs `deals.edit`; deal values need `commercial.view`; New deal needs `deals.edit`. Empty column, partial load per column, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Pipeline board** (`pipeline.board`; `/:tenantSlug/pipeline`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S14 (Deal detail: complete tour). Existing code it relies on, unchanged since planning: `pages/deals/DealsPage.tsx`, `pages/deals/PipelineBoardContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`, `pages/deals/DealMarkers.tsx`.
6. **Production LOC estimate:** **~198** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + `DealMarkers` and column annotations 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (11 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/pipelineBoard.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'pipeline.board', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'pipeline.board.<id>', kind, safety, … }`. Steps in state-only elements: `boardEmpty`, `error`. Eligibility (`requires`): `deals.edit`, `commercial.view`. Hand-offs (`opens`/`group`): `menu`, `closing`.
      - Integration: Loaded lazily through `loaders['pipeline.board']` in `pageRegistry.ts`; copy keys resolve to `supportSales:pipeline.board.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/pipelineBoard.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/pipelineBoard.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `deals.edit`, `commercial.view`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'pipeline.board': () => import('./guides/pipelineBoard')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'pipeline.board'` on the entries for `pipeline` and delete `'pipeline.board'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/deals/PipelineBoardContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('pipeline.board.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PipelineBoardContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L43 permission check [deals.edit]; L127 Button (newDeal); L146 aria-label (board.columnLabel); L194 Button (board.loadMore); L280 DropdownMenu (board.moveTo); L284 button (board.moveToFor); L301 Link.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/deals/PipelineBoardContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/deals/PipelineViewSwitch.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('pipeline.board.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PipelineViewSwitch`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L16 aria-label (views.label); L18 Link.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/deals/DealMarkers.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('pipeline.board.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DealMarkers`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Leave unchanged** `src/pages/deals/DealsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   9. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `pipeline.board.<step>.title` and `.body` for these steps: `title`, `viewSwitch`, `newDeal`, `board`, `column`, `columnCount`, `columnEmpty`, `card`, `cardCompany`, `cardValue`, `cardMarkers`, `cardMenu`, `cardMenuItems`, `loadMore`, `moveToClosed`, `closingRecap`, `boardEmpty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `pipeline.board.<step>.title` and `.body` for these steps in Albanian: `title`, `viewSwitch`, `newDeal`, `board`, `column`, `columnCount`, `columnEmpty`, `card`, `cardCompany`, `cardValue`, `cardMarkers`, `cardMenu`, `cardMenuItems`, `loadMore`, `moveToClosed`, `closingRecap`, `boardEmpty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   11. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'pipeline.board', route: 'pipeline' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "pipeline.board"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/pipelineBoard.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/PipelineBoardContent.tsx`, `src/pages/deals/PipelineViewSwitch.tsx`, `src/pages/deals/DealMarkers.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: `DealMarkers` and column annotations.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportSales:pipeline.board.<id>.title|body`):
      - `title` — heading
      - `viewSwitch` — board / list switch (PipelineViewSwitch, explain-only: navigation)
      - `newDeal` — New deal (needs `deals.edit`, explain-only: navigation)
      - `board` — the board region
      - `column` — one stage column with its label and count (repeat)
      - `columnCount` — the count badge (repeat)
      - `columnEmpty` — an empty column (repeat, state)
      - `card` — one deal card (repeat, explain-only: navigation)
      - `cardCompany` — company name on the card (repeat)
      - `cardValue` — deal value (repeat, needs `commercial.view`)
      - `cardMarkers` — overdue / stale markers (repeat, DealMarkers)
      - `cardMenu` — "move to" menu trigger (repeat, needs `deals.edit`, try-it, opens menu)
      - `cardMenuItems` — stages offered (group: menu, explain-only: moves the deal)
      - `loadMore` — load more in a column (repeat, try-it)
      - `moveToClosed` — choosing a closing stage in the move menu opens the shared Win or Lose dialog (try-it: opens the dialog)
      - `closingRecap` — those dialogs are explained by the shared `dealClosing.*` guidance written with the deal page (group: closing, shared)
      - `boardEmpty` — no deals at all (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/pipeline` as page `pipeline.board`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `pipeline.board`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No deals: board shows empty columns and `boardEmpty` is explained.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Columns and cards are `repeat`; a column that has 200 cards still contributes one `card` exemplar.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Move menu and New deal by `deals.edit`; value by `commercial.view`.
   - **Dialogs, drawers, menus, nested workflows (D):** Move menu hand-off; items explain-only because a click would move the deal, except that the closing stages open the shared Win and Lose dialogs, which are hand-offs.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Load more adds cards to a column: same ids; exemplar unchanged.
   - A deal moved by a teammate while the tour runs re-renders columns; exemplar re-picked.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 9 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - 0 / 1 / 50 cards per column produce identical eligible ids except empties; move-menu items never move a deal.
   - Regression: existing tests of `PipelineBoardContent.tsx`, `PipelineViewSwitch.tsx`, `DealMarkers.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Board tour has zero mutating requests.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/pipelineBoard src/pages/deals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "pipeline.board"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 198.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Pipeline board is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s16"></a>

### S16: Pipeline list: complete tour

1. **Slice id and title:** S16. Pipeline list: complete tour. Branch `support-slice-16-pipeline-list-complete-tour`.
2. **Scope:** The list alternative of the pipeline. In scope: `viewSwitch`, `newDeal`, `search`, `stageChips`, `stageChip`, `typeChips`, `typeChip`, `salesperson`, `businessType`, `area`, `city`, `closeFrom`, `closeTo`, `clear`, `table`, `row`, `rowValue`, `rowStage`, `pagination`, `emptyFirst`, `emptyNoMatch`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Many filters; each is explained once through shared kinds. It lets a first-time user learn Pipeline list in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Pipeline list** (`/:tenantSlug/pipeline/list`) and nothing else. A user who opens Support on this page can tour 22 steps in order, ask about any single control, and replay or leave. What the page is for: Filter deals by stage, type, owner, business type, area, city and close dates; open or create one. What the tour walks through: New deal; search; stage chips and type chips (`role="group"`); salesperson, business type, area, city selects; close-from / close-to; Clear filters; DataTable; Pagination. What changes the tour at runtime: Salesperson filter above OWN scope; values need `commercial.view`. Empty / no-match, loading, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Pipeline list** (`pipeline.list`; `/:tenantSlug/pipeline/list`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/deals/DealListContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`.
6. **Production LOC estimate:** **~232** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 22 steps x 8 = 176 + 20 annotation sites x 2 = 40. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/pipelineList.ts`
      - Change: Create the page guide with the 22 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'pipeline.list', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`, `shared.pagination`. Each step: `{ id, target: 'pipeline.list.<id>', kind, safety, … }`. Steps in state-only elements: `emptyFirst`, `emptyNoMatch`, `error`. Eligibility (`requires`): `deals.edit`, `commercial.view`. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['pipeline.list']` in `pageRegistry.ts`; copy keys resolve to `supportSales:pipeline.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/pipelineList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/pipelineList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `deals.edit`, `commercial.view`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'pipeline.list': () => import('./guides/pipelineList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'pipeline.list'` on the entries for `pipeline/list` and delete `'pipeline.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/deals/DealListContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('pipeline.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DealListContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L54 permission check [commercial.view]; L55 permission check [deals.view]; L214 Button (newDeal); L223 TextInput (list.searchLabel); L232 aria-label (list.stages); L234 button; L245 aria-label (list.types); L247 button; L261 SelectInput (list.salesperson); L270 SelectInput (list.businessType); L278 SelectInput (list.area); L293 SelectInput (list.city); L301 TextInput (list.closeFrom); L302 TextInput (list.closeTo); L308 TextInput (list.${key}); L320 Button (list.clear); L330 DataTable; L337 DataTable empty prop (list.emptyFiltered); L346 Pagination.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/deals/DealListContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `pipeline.list.<step>.title` and `.body` for these steps: `viewSwitch`, `newDeal`, `search`, `stageChips`, `stageChip`, `typeChips`, `typeChip`, `salesperson`, `businessType`, `area`, `city`, `closeFrom`, `closeTo`, `clear`, `table`, `row`, `rowValue`, `rowStage`, `pagination`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `pipeline.list.<step>.title` and `.body` for these steps in Albanian: `viewSwitch`, `newDeal`, `search`, `stageChips`, `stageChip`, `typeChips`, `typeChip`, `salesperson`, `businessType`, `area`, `city`, `closeFrom`, `closeTo`, `clear`, `table`, `row`, `rowValue`, `rowStage`, `pagination`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'pipeline.list', route: 'pipeline/list' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "pipeline.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/pipelineList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/DealListContent.tsx`.
   3. **PT-3 Annotate** about 20 sites in those files.
   4. **PT-4 Write the guide**: 22 steps, in tour order (`<id>` becomes the copy key `supportSales:pipeline.list.<id>.title|body`):
      - `viewSwitch` — board / list switch (explain-only: navigation)
      - `newDeal` — New deal (needs `deals.edit`, explain-only: navigation)
      - `search` — search (try-it)
      - `stageChips` — stage chip group (role=group)
      - `stageChip` — one stage chip (repeat, try-it)
      - `typeChips` — deal type chip group
      - `typeChip` — one type chip (repeat, try-it)
      - `salesperson` — salesperson filter (scope above OWN, try-it)
      - `businessType` — business type filter (try-it)
      - `area` — area filter (try-it)
      - `city` — city filter (disabledHint)
      - `closeFrom` — close-from date (try-it)
      - `closeTo` — close-to date (try-it)
      - `clear` — Clear filters (while active)
      - `table` — deals table
      - `row` — one deal (repeat, explain-only: navigation)
      - `rowValue` — value (repeat, needs `commercial.view`)
      - `rowStage` — stage badge (repeat, shared.statusBadge)
      - `pagination` — pagination (shared.pagination)
      - `emptyFirst` — no deals (state)
      - `emptyNoMatch` — no deal matches (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/pipeline/list` as page `pipeline.list`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `pipeline.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empty variants. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Chips and filters. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Scope and value permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Filter state survives while the tour runs; clear appears only when needed.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Filters, empties, 0/1/30 rows, permission variants.
   - Regression: existing tests of `DealListContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No navigation except via explicit user Exit.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/pipelineList src/pages/deals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "pipeline.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 232.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Pipeline list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s17"></a>

### S17: Quotations list (legacy workflow): complete tour

1. **Slice id and title:** S17. Quotations list (legacy workflow): complete tour. Branch `support-slice-17-quotations-list-legacy-workflow-complete-tour`.
2. **Scope:** Legacy-workflow quotations list. In scope: `title`, `newQuotation`, `statusFilters`, `statusFilter`, `search`, `table`, `row`, `rowStatus`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Only tenants on LEGACY_QUOTATIONS see this page; the guide declares `requires.workflow`.
   - **Description.** This slice delivers the complete guided tour of **Quotations list (legacy workflow)** (`/:tenantSlug/quotations`) and nothing else. A user who opens Support on this page can tour 13 steps in order, ask about any single control, and replay or leave. What the page is for: Browse quotations by status, search, create one, per-row actions. What the tour walks through: New quotation; five status filter buttons; search; table with per-row actions menu; static `disabled` Previous/Next. What changes the tour at runtime: Only in the LEGACY_QUOTATIONS workflow (nav `workflow` filter) and with `quotations.manage`. Empty, loading, error; **Previous/Next static `disabled`** (not explained). The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Quotations list (legacy workflow)** (`quotations.list`; `/:tenantSlug/quotations`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/quotations/QuotationList.tsx`, `pages/quotations/QuotationListContent.tsx`.
6. **Production LOC estimate:** **~144** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/quotationsList.ts`
      - Change: Create the page guide with the 13 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'quotations.list', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'quotations.list.<id>', kind, safety, … }`. Steps in state-only elements: `emptyFirst`, `emptyNoMatch`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `menu`.
      - Integration: Loaded lazily through `loaders['quotations.list']` in `pageRegistry.ts`; copy keys resolve to `supportSales:quotations.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/quotationsList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/quotationsList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'quotations.list': () => import('./guides/quotationsList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'quotations.list'` on the entries for `quotations` and delete `'quotations.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/quotations/QuotationListContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('quotations.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `QuotationListContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L33 permission check [commercial.view]; L41 permission check [quotations.approve]; L105 Button (list.createQuotation); L116 button (list.tabAll); L122 button (list.tabDraft); L129 button (list.tabPending); L136 button (list.tabSent); L142 button (list.tabCompleted); L150 TextInput (list.searchPlaceholder); L173 Button (list.createQuotation); L221 DropdownMenu; L223 button (list.viewDetails); L248 Button; L251 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `quotations.list.<step>.title` and `.body` for these steps: `title`, `newQuotation`, `statusFilters`, `statusFilter`, `search`, `table`, `row`, `rowStatus`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `quotations.list.<step>.title` and `.body` for these steps in Albanian: `title`, `newQuotation`, `statusFilters`, `statusFilter`, `search`, `table`, `row`, `rowStatus`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'quotations.list', route: 'quotations' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "quotations.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/quotationsList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/quotations/QuotationListContent.tsx`.
   3. **PT-3 Annotate** about 12 sites in those files.
   4. **PT-4 Write the guide**: 13 steps, in tour order (`<id>` becomes the copy key `supportSales:quotations.list.<id>.title|body`):
      - `title` — heading
      - `newQuotation` — New quotation (explain-only: navigation)
      - `statusFilters` — status filter button group
      - `statusFilter` — one status button (repeat, try-it)
      - `search` — search (try-it)
      - `table` — table region
      - `row` — one quotation (repeat, explain-only: navigation)
      - `rowStatus` — status badge (repeat, shared.statusBadge)
      - `rowMenu` — row actions trigger (repeat, try-it, opens menu)
      - `rowMenuItems` — actions (group: menu, explain-only)
      - `emptyFirst` — no quotations, with its Add action (state)
      - `emptyNoMatch` — no match (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/quotations` as page `quotations.list`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `quotations.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading rows are waited out. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Status and search. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Previous/Next are static `disabled`: not explained.
   - **Error / retry (X):** Load error step. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Workflow and `quotations.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Status filter changes the list; rows re-pick.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Workflow gating: not eligible under SALES_PROCESS.
   - Regression: existing tests of `QuotationListContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Under SALES_PROCESS the Support panel shows no guide for this page and the route redirect/guard behaves as before.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/quotationsList src/pages/quotations
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "quotations.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 144.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Quotations list (legacy workflow) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Previous / Next buttons (static `disabled`): left unannotated and unexplained (section 3.4).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

