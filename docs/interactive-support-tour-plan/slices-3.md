# Support tour plan: slice document 3 of 6 (S18 to S30)

Part of the Interactive Support and Tour System plan. Overview, inventory, architecture, dependencies, traceability, testing, risks and the checklist are in [00-overview.md](00-overview.md). This document holds the full specifications of 13 slices. Section numbers such as "section 3.4" refer to the overview; the standard procedure (6.1) and the assumptions (0.2) are repeated here so the document can be used on its own.

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

<a id="s18"></a>

### S18: Quotation form (create and edit): complete tour

1. **Slice id and title:** S18. Quotation form (create and edit): complete tour. Branch `support-slice-18-quotation-form-create-and-edit-complete`.
2. **Scope:** Quotation create / edit with line items. In scope: `mode`, `client`, `validity`, `lines`, `lineRow`, `lineProduct`, `lineWarehouse`, `lineQuantity`, `linePrice`, `addLine`, `removeLine`, `totals`, `cancel`, `save`. Out of scope: every other page (item 16).
3. **Purpose:** Repeated rows entered by the user; the line row id is repeated. It lets a first-time user learn Quotation form (create and edit) in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Quotation form (create and edit)** (`/:tenantSlug/quotations/new`, `/:tenantSlug/quotations/:id/edit`) and nothing else. A user who opens Support on this page can tour 14 steps in order, ask about any single control, and replay or leave. What the page is for: Create or edit a quotation with client, validity and line items (product, warehouse, quantity, price). What the tour walks through: Client select, validity input, line-items table with product / warehouse / quantity / price inputs, Add line, remove line, Cancel, Save. What changes the tour at runtime: Legacy workflow only. Row validation, saving. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Quotation form (create and edit)** (`quotations.form`; `/:tenantSlug/quotations/new`, `/:tenantSlug/quotations/:id/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/quotations/CreateQuotation.tsx`, `pages/quotations/EditQuotation.tsx`, `pages/quotations/QuotationFormContent.tsx`.
6. **Production LOC estimate:** **~154** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/quotationsForm.ts`
      - Change: Create the page guide with the 14 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'quotations.form', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'quotations.form.<id>', kind, safety, … }`. Steps in state-only elements: none. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['quotations.form']` in `pageRegistry.ts`; copy keys resolve to `supportSales:quotations.form.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/quotationsForm.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/quotationsForm.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'quotations.form': () => import('./guides/quotationsForm')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'quotations.form'` on the entries for `quotations/new`, `quotations/:id/edit` and delete `'quotations.form'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/quotations/QuotationFormContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('quotations.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `QuotationFormContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L115 form (breadcrumb); L126 Button (form.save); L127 Button (form.save); L149 SelectInput; L164 TextInput; L179 Button (form.addRow); L210 SelectInput; L236 SelectInput; L256 TextInput; L275 TextInput; L291 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/quotations/CreateQuotation.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('quotations.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CreateQuotation`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/quotations/EditQuotation.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('quotations.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `EditQuotation`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `quotations.form.<step>.title` and `.body` for these steps: `mode`, `client`, `validity`, `lines`, `lineRow`, `lineProduct`, `lineWarehouse`, `lineQuantity`, `linePrice`, `addLine`, `removeLine`, `totals`, `cancel`, `save`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `quotations.form.<step>.title` and `.body` for these steps in Albanian: `mode`, `client`, `validity`, `lines`, `lineRow`, `lineProduct`, `lineWarehouse`, `lineQuantity`, `linePrice`, `addLine`, `removeLine`, `totals`, `cancel`, `save`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'quotations.form', route: 'quotations/new' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "quotations.form"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/quotationsForm.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/quotations/QuotationFormContent.tsx`, `src/pages/quotations/CreateQuotation.tsx`, `src/pages/quotations/EditQuotation.tsx`.
   3. **PT-3 Annotate** about 13 sites in those files.
   4. **PT-4 Write the guide**: 14 steps, in tour order (`<id>` becomes the copy key `supportSales:quotations.form.<id>.title|body`):
      - `mode` — create vs edit
      - `client` — client select (try-it)
      - `validity` — validity input (try-it)
      - `lines` — line items table
      - `lineRow` — one line (repeat)
      - `lineProduct` — product select (repeat, try-it)
      - `lineWarehouse` — warehouse select (repeat, try-it)
      - `lineQuantity` — quantity (repeat, try-it)
      - `linePrice` — unit price (repeat, try-it)
      - `addLine` — Add line (try-it: draft only)
      - `removeLine` — remove a line (repeat, explain-only)
      - `totals` — totals (info)
      - `cancel` — Cancel (explain-only: navigation)
      - `save` — Save (explain-only: submit)
   5. **PT-5 Register** `/:tenantSlug/quotations/new`, `/:tenantSlug/quotations/:id/edit` as page `quotations.form`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `quotations.form`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Edit-mode load. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Lines repeat; adding ten lines adds no steps.
   - **Permission- or workflow-dependent controls (A):** Legacy workflow only. Steps for controls the user cannot use are absent rather than greyed out.
   - **Validation and submission (V):** Row errors. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Lines added during the tour use the repeat id.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Create vs edit; 1 and 12 lines; submit lock.
   - Regression: existing tests of `QuotationFormContent.tsx`, `CreateQuotation.tsx`, `EditQuotation.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No quotation is created.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/quotationsForm src/pages/quotations
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "quotations.form"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 154.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Quotation form (create and edit) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s19"></a>

### S19: Quotation detail: complete tour

1. **Slice id and title:** S19. Quotation detail: complete tour. Branch `support-slice-19-quotation-detail-complete-tour`.
2. **Scope:** Status-driven action buttons and the document. In scope: `back`, `status`, `edit`, `returnToDraft`, `submit`, `approve`, `markAccepted`, `markRejected`, `expire`, `share`, `convert`, `download`, `lines`, `totals`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Eleven buttons render by status; the tour follows the DOM. It lets a first-time user learn Quotation detail in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Quotation detail** (`/:tenantSlug/quotations/:id`) and nothing else. A user who opens Support on this page can tour 15 steps in order, ask about any single control, and replay or leave. What the page is for: Read a quotation and move it through its lifecycle (submit, approve, accept, reject, expire, return to draft), edit, share link, convert. What the tour walks through: Back; Edit; status-dependent action buttons (Return to draft, Submit, Approve, Mark accepted, Mark rejected, Expire); share / convert / download actions; line-item table; error banner. What changes the tour at runtime: Which buttons render depends on status and permission; legacy workflow only. One layout per status; `role="alert"` error banner. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Quotation detail** (`quotations.detail`; `/:tenantSlug/quotations/:id`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/quotations/QuotationDetail.tsx`, `pages/quotations/QuotationDetailContent.tsx`.
6. **Production LOC estimate:** **~164** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 15 steps x 8 = 120 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/quotationsDetail.ts`
      - Change: Create the page guide with the 15 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'quotations.detail', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'quotations.detail.<id>', kind, safety, … }`. Steps in state-only elements: `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['quotations.detail']` in `pageRegistry.ts`; copy keys resolve to `supportSales:quotations.detail.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/quotationsDetail.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/quotationsDetail.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'quotations.detail': () => import('./guides/quotationsDetail')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'quotations.detail'` on the entries for `quotations/:id` and delete `'quotations.detail'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/quotations/QuotationDetailContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('quotations.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `QuotationDetailContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L27 permission check [commercial.view]; L170 button; L189 Button (detail.edit); L192 Button (detail.returnToDraft); L195 Button (detail.submit); L198 Button (detail.approve); L201 Button (detail.markAccepted); L204 Button (detail.markRejected); L207 Button (detail.expire); L211 Button; L221 Button; L247 Button (share.downloadPdf); L259 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/quotations/QuotationDetailContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `quotations.detail.<step>.title` and `.body` for these steps: `back`, `status`, `edit`, `returnToDraft`, `submit`, `approve`, `markAccepted`, `markRejected`, `expire`, `share`, `convert`, `download`, `lines`, `totals`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `quotations.detail.<step>.title` and `.body` for these steps in Albanian: `back`, `status`, `edit`, `returnToDraft`, `submit`, `approve`, `markAccepted`, `markRejected`, `expire`, `share`, `convert`, `download`, `lines`, `totals`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'quotations.detail', route: 'quotations/:id' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "quotations.detail"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/quotationsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/quotations/QuotationDetailContent.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files.
   4. **PT-4 Write the guide**: 15 steps, in tour order (`<id>` becomes the copy key `supportSales:quotations.detail.<id>.title|body`):
      - `back` — back (explain-only: navigation)
      - `status` — current status badge
      - `edit` — Edit (draft only, explain-only: navigation)
      - `returnToDraft` — Return to draft (explain-only: changes status)
      - `submit` — Submit (explain-only)
      - `approve` — Approve (needs approval permission, explain-only)
      - `markAccepted` — Mark accepted (explain-only)
      - `markRejected` — Mark rejected (destructive-class, explain-only)
      - `expire` — Expire (explain-only)
      - `share` — share link (explain-only)
      - `convert` — convert to invoice (explain-only: creates data)
      - `download` — download PDF (try-it: read-only)
      - `lines` — line items table (repeat rows)
      - `totals` — totals
      - `error` — error banner (state)
   5. **PT-5 Register** `/:tenantSlug/quotations/:id` as page `quotations.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `quotations.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Error banner. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Buttons per status and permission: at most six of the eleven exist at once.
   - **Destructive or irreversible actions (explain-only) (K):** Reject / expire / convert carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - After the user changes status and re-enters, a different button set is eligible.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - One fixture per status.
   - Regression: existing tests of `QuotationDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No status transition occurs during the tour.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/quotationsDetail src/pages/quotations
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "quotations.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 164.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Quotation detail is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s20"></a>

### S20: Invoices list: complete tour

1. **Slice id and title:** S20. Invoices list: complete tour. Branch `support-slice-20-invoices-list-complete-tour`.
2. **Scope:** Invoices list. In scope: `title`, `search`, `table`, `row`, `rowStatus`, `rowTotal`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`, `back`. Out of scope: every other page (item 16).
3. **Purpose:** Short list page; pins the row-actions pattern for invoices. It lets a first-time user learn Invoices list in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Invoices list** (`/:tenantSlug/invoices`) and nothing else. A user who opens Support on this page can tour 12 steps in order, ask about any single control, and replay or leave. What the page is for: Browse and search invoices; per-row actions. What the tour walks through: Back/title, search, table, per-row actions menu, static `disabled` Previous/Next. What changes the tour at runtime: Needs `invoices.manage`. Empty, loading, error; **Previous/Next static `disabled`** (not explained). The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Invoices list** (`invoices.list`; `/:tenantSlug/invoices`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/invoices/InvoiceList.tsx`, `pages/invoices/InvoiceListContent.tsx`.
6. **Production LOC estimate:** **~134** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/invoicesList.ts`
      - Change: Create the page guide with the 12 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'invoices.list', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'invoices.list.<id>', kind, safety, … }`. Steps in state-only elements: `emptyFirst`, `emptyNoMatch`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `menu`.
      - Integration: Loaded lazily through `loaders['invoices.list']` in `pageRegistry.ts`; copy keys resolve to `supportSales:invoices.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/invoicesList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/invoicesList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'invoices.list': () => import('./guides/invoicesList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'invoices.list'` on the entries for `invoices` and delete `'invoices.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/invoices/InvoiceListContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('invoices.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InvoiceListContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L26 permission check [commercial.view]; L80 button (list.tabAll); L90 TextInput (list.searchPlaceholder); L152 DropdownMenu; L154 button (list.viewDetails); L176 button; L177 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/invoices/InvoiceListContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `invoices.list.<step>.title` and `.body` for these steps: `title`, `search`, `table`, `row`, `rowStatus`, `rowTotal`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`, `back`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `invoices.list.<step>.title` and `.body` for these steps in Albanian: `title`, `search`, `table`, `row`, `rowStatus`, `rowTotal`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`, `back`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'invoices.list', route: 'invoices' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "invoices.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/invoicesList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/invoices/InvoiceListContent.tsx`.
   3. **PT-3 Annotate** about 11 sites in those files.
   4. **PT-4 Write the guide**: 12 steps, in tour order (`<id>` becomes the copy key `supportSales:invoices.list.<id>.title|body`):
      - `title` — heading
      - `search` — search (try-it)
      - `table` — table region
      - `row` — one invoice (repeat, explain-only: navigation)
      - `rowStatus` — status (repeat, shared.statusBadge)
      - `rowTotal` — total (repeat)
      - `rowMenu` — actions trigger (repeat, try-it, opens menu)
      - `rowMenuItems` — actions (group: menu, explain-only)
      - `emptyFirst` — no invoices (state)
      - `emptyNoMatch` — no match (state)
      - `error` — load error (state)
      - `back` — back link (explain-only: navigation)
   5. **PT-5 Register** `/:tenantSlug/invoices` as page `invoices.list`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `invoices.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Search. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Previous/Next static `disabled`: not explained.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `invoices.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Rows re-pick after search.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empties; 0/1/30 rows.
   - Regression: existing tests of `InvoiceListContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/invoicesList src/pages/invoices
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "invoices.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 134.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Invoices list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Previous / Next buttons (static `disabled`): left unannotated and unexplained (section 3.4).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s21"></a>

### S21: Invoice detail: complete tour

1. **Slice id and title:** S21. Invoice detail: complete tour. Branch `support-slice-21-invoice-detail-complete-tour`.
2. **Scope:** Invoice detail. In scope: `back`, `status`, `send`, `markPaid`, `void`, `download`, `lines`, `totals`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Status-dependent actions. It lets a first-time user learn Invoice detail in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Invoice detail** (`/:tenantSlug/invoices/:id`) and nothing else. A user who opens Support on this page can tour 9 steps in order, ask about any single control, and replay or leave. What the page is for: Read an invoice; send, mark paid, void, download. What the tour walks through: Back; Send; Mark paid; Void; Download; line table; error banner. What changes the tour at runtime: Buttons depend on invoice status. Status-dependent actions; `role="alert"` banner. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Invoice detail** (`invoices.detail`; `/:tenantSlug/invoices/:id`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/invoices/InvoiceDetail.tsx`, `pages/invoices/InvoiceDetailContent.tsx`.
6. **Production LOC estimate:** **~104** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/invoicesDetail.ts`
      - Change: Create the page guide with the 9 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'invoices.detail', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'invoices.detail.<id>', kind, safety, … }`. Steps in state-only elements: `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['invoices.detail']` in `pageRegistry.ts`; copy keys resolve to `supportSales:invoices.detail.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/invoicesDetail.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/invoicesDetail.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'invoices.detail': () => import('./guides/invoicesDetail')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'invoices.detail'` on the entries for `invoices/:id` and delete `'invoices.detail'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/invoices/InvoiceDetailContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('invoices.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InvoiceDetailContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L24 permission check [commercial.view]; L105 button; L122 Button (detail.send); L125 Button (detail.markPaid); L128 Button (detail.void); L130 Button (detail.downloadPdf); L137 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `invoices.detail.<step>.title` and `.body` for these steps: `back`, `status`, `send`, `markPaid`, `void`, `download`, `lines`, `totals`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `invoices.detail.<step>.title` and `.body` for these steps in Albanian: `back`, `status`, `send`, `markPaid`, `void`, `download`, `lines`, `totals`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'invoices.detail', route: 'invoices/:id' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "invoices.detail"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/invoicesDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/invoices/InvoiceDetailContent.tsx`.
   3. **PT-3 Annotate** about 8 sites in those files.
   4. **PT-4 Write the guide**: 9 steps, in tour order (`<id>` becomes the copy key `supportSales:invoices.detail.<id>.title|body`):
      - `back` — back (explain-only: navigation)
      - `status` — status badge
      - `send` — Send (draft, explain-only)
      - `markPaid` — Mark paid (sent, explain-only)
      - `void` — Void (destructive, explain-only)
      - `download` — Download (try-it: read-only)
      - `lines` — line table (repeat rows)
      - `totals` — totals
      - `error` — error banner (state)
   5. **PT-5 Register** `/:tenantSlug/invoices/:id` as page `invoices.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `invoices.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Banner. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Buttons by status. Steps for controls the user cannot use are absent rather than greyed out.
   - **Destructive or irreversible actions (explain-only) (K):** Void warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Different status, different buttons.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Fixture per status.
   - Regression: existing tests of `InvoiceDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/invoicesDetail src/pages/invoices
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "invoices.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 104.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Invoice detail is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s22"></a>

### S22: Contracts list: complete tour

1. **Slice id and title:** S22. Contracts list: complete tour. Branch `support-slice-22-contracts-list-complete-tour`.
2. **Scope:** Contracts list. In scope: `title`, `newContract`, `search`, `validity`, `salesperson`, `endsFrom`, `endsTo`, `onlyOverdue`, `table`, `row`, `rowValidity`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Filter-heavy list with an action menu. It lets a first-time user learn Contracts list in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Contracts list** (`/:tenantSlug/contracts`) and nothing else. A user who opens Support on this page can tour 16 steps in order, ask about any single control, and replay or leave. What the page is for: Search and filter contracts by validity, salesperson, end dates and overdue; open one; create one. What the tour walks through: New contract; search; validity select; salesperson select; ends-from / ends-to; "only overdue" checkbox; table with per-row actions menu; static `disabled` Previous/Next. What changes the tour at runtime: Needs `contracts.validity.view`; salesperson/scope filters by permission. Empty, loading, error; **Previous/Next static `disabled`** (not explained). The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Contracts list** (`contracts.list`; `/:tenantSlug/contracts`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/contracts/ContractList.tsx`, `pages/contracts/ContractListContent.tsx`.
6. **Production LOC estimate:** **~172** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/contractsList.ts`
      - Change: Create the page guide with the 16 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'contracts.list', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'contracts.list.<id>', kind, safety, … }`. Steps in state-only elements: `emptyFirst`, `emptyNoMatch`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `menu`.
      - Integration: Loaded lazily through `loaders['contracts.list']` in `pageRegistry.ts`; copy keys resolve to `supportSales:contracts.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/contractsList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/contractsList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'contracts.list': () => import('./guides/contractsList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'contracts.list'` on the entries for `contracts` and delete `'contracts.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/contracts/ContractListContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('contracts.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContractListContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L75 permission check [commercial.view]; L76 permission check [payments.view]; L180 Button (list.newContract); L195 button; L205 TextInput (list.searchPlaceholder); L215 SelectInput (list.filterValidity); L221 SelectInput (list.filterSalesperson); L229 TextInput (list.filterEndsFrom); L230 TextInput (list.filterEndsTo); L233 input (list.filterOverdue); L343 DropdownMenu; L345 button; L372 button; L375 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/contracts/ContractListContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `contracts.list.<step>.title` and `.body` for these steps: `title`, `newContract`, `search`, `validity`, `salesperson`, `endsFrom`, `endsTo`, `onlyOverdue`, `table`, `row`, `rowValidity`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `contracts.list.<step>.title` and `.body` for these steps in Albanian: `title`, `newContract`, `search`, `validity`, `salesperson`, `endsFrom`, `endsTo`, `onlyOverdue`, `table`, `row`, `rowValidity`, `rowMenu`, `rowMenuItems`, `emptyFirst`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'contracts.list', route: 'contracts' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "contracts.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/contractsList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/contracts/ContractListContent.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files.
   4. **PT-4 Write the guide**: 16 steps, in tour order (`<id>` becomes the copy key `supportSales:contracts.list.<id>.title|body`):
      - `title` — heading
      - `newContract` — New contract (explain-only: navigation)
      - `search` — search (try-it)
      - `validity` — validity filter (try-it)
      - `salesperson` — salesperson filter (scope above OWN, try-it)
      - `endsFrom` — ends-from date (try-it)
      - `endsTo` — ends-to date (try-it)
      - `onlyOverdue` — only overdue checkbox (try-it)
      - `table` — table region
      - `row` — one contract (repeat, explain-only: navigation)
      - `rowValidity` — validity badge (repeat, shared.statusBadge)
      - `rowMenu` — actions trigger (repeat, try-it, opens menu)
      - `rowMenuItems` — actions (group: menu, explain-only)
      - `emptyFirst` — no contracts (state)
      - `emptyNoMatch` — no match (state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/contracts` as page `contracts.list`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `contracts.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Previous/Next static `disabled`: not explained.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission and scope. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Filter combinations that return nothing swap to `emptyNoMatch`.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Filters; empties; scope.
   - Regression: existing tests of `ContractListContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/contractsList src/pages/contracts
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "contracts.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 172.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Contracts list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Previous / Next buttons (static `disabled`): left unannotated and unexplained (section 3.4).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s23"></a>

### S23: Contract form (create and edit): complete tour

1. **Slice id and title:** S23. Contract form (create and edit): complete tour. Branch `support-slice-23-contract-form-create-and-edit-complete`.
2. **Scope:** Contract create / edit. In scope: `mode`, `company`, `deal`, `startDate`, `endDate`, `value`, `paymentTerms`, `schedule`, `notes`, `fieldErrors`, `cancel`, `save`. Out of scope: every other page (item 16).
3. **Purpose:** Dates and values have rules the server enforces; the tour states them without testing them.
   - **Description.** This slice delivers the complete guided tour of **Contract form (create and edit)** (`/:tenantSlug/contracts/new`, `/:tenantSlug/contracts/:contractId/edit`) and nothing else. A user who opens Support on this page can tour 12 steps in order, ask about any single control, and replay or leave. What the page is for: Create or edit a contract: company, dates, value, payment schedule. What the tour walks through: Nine selects/inputs (company, deal, dates, value, payment terms…), Cancel, Save. What changes the tour at runtime: Edit vs create share one component. Field errors, saving. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Contract form (create and edit)** (`contracts.form`; `/:tenantSlug/contracts/new`, `/:tenantSlug/contracts/:contractId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/contracts/ContractFormPage.tsx`, `pages/contracts/ContractFormContent.tsx`.
6. **Production LOC estimate:** **~134** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/contractsForm.ts`
      - Change: Create the page guide with the 12 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'contracts.form', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'contracts.form.<id>', kind, safety, … }`. Steps in state-only elements: `fieldErrors`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['contracts.form']` in `pageRegistry.ts`; copy keys resolve to `supportSales:contracts.form.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/contractsForm.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/contractsForm.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'contracts.form': () => import('./guides/contractsForm')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'contracts.form'` on the entries for `contracts/new`, `contracts/:contractId/edit` and delete `'contracts.form'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/contracts/ContractFormContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('contracts.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContractFormContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L204 form (form.client); L207 SelectInput (form.client); L250 TextInput (form.planName); L258 TextInput (form.amount); L270 SelectInput (form.billingPeriod); L285 SelectInput (form.assignedUserId); L299 TextInput (form.startsAt); L308 TextInput (form.endsAt); L318 TextInput (form.renewalDate); L327 TextareaInput (form.notes); L352 Button (form.cancel); L355 Button (form.submitEdit).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/contracts/ContractFormPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `contracts.form.<step>.title` and `.body` for these steps: `mode`, `company`, `deal`, `startDate`, `endDate`, `value`, `paymentTerms`, `schedule`, `notes`, `fieldErrors`, `cancel`, `save`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `contracts.form.<step>.title` and `.body` for these steps in Albanian: `mode`, `company`, `deal`, `startDate`, `endDate`, `value`, `paymentTerms`, `schedule`, `notes`, `fieldErrors`, `cancel`, `save`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'contracts.form', route: 'contracts/new' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "contracts.form"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/contractsForm.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/contracts/ContractFormContent.tsx`.
   3. **PT-3 Annotate** about 11 sites in those files.
   4. **PT-4 Write the guide**: 12 steps, in tour order (`<id>` becomes the copy key `supportSales:contracts.form.<id>.title|body`):
      - `mode` — create vs edit
      - `company` — company select (try-it)
      - `deal` — related deal (try-it)
      - `startDate` — start (try-it)
      - `endDate` — end (try-it)
      - `value` — value (try-it)
      - `paymentTerms` — payment terms (try-it)
      - `schedule` — instalment schedule fields (try-it)
      - `notes` — notes (try-it)
      - `fieldErrors` — validation (state)
      - `cancel` — Cancel (explain-only: navigation)
      - `save` — Save (explain-only: submit)
   5. **PT-5 Register** `/:tenantSlug/contracts/new`, `/:tenantSlug/contracts/:contractId/edit` as page `contracts.form`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `contracts.form`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Edit-mode load. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Permission- or workflow-dependent controls (A):** None beyond route access. Steps for controls the user cannot use are absent rather than greyed out.
   - **Validation and submission (V):** Errors. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Edit mode prefilled values do not alter steps.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Create vs edit.
   - Regression: existing tests of `ContractFormContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Submit lock verified.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/contractsForm src/pages/contracts
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "contracts.form"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 134.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Contract form (create and edit) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s24"></a>

### S24: Contract detail: complete tour

1. **Slice id and title:** S24. Contract detail: complete tour. Branch `support-slice-24-contract-detail-complete-tour`.
2. **Scope:** Header, lifecycle actions and the terms block. The lower blocks and the two confirmation patterns (ConfirmDialog and the reason Modal). The `ContractPaymentsCard` (about 590 lines): the instalment schedule, its export, the instalment drawer with its invoice / receipt / reverse / correct / edit / remove modes, and the add-instalment dialog.
3. **Purpose:** About ten lifecycle buttons render by status; this slice covers the action set and the read-only blocks. File upload and reason dialogs are the risky parts of this page. This is the money-changing part of the contract page: every submit is explain-only, and the forms inside the drawer are explained field by field without being submitted. It was missed by the first inventory (found by walking the page's imports) and is the reason PT-2 now includes that walk.
   - **Description.** This slice delivers the complete guided tour of **Contract detail** (`/:tenantSlug/contracts/:contractId`) and nothing else. A user who opens Support on this page can tour 53 steps in order, ask about any single control, and replay or leave. What the page is for: Run a contract through its lifecycle (pending signature, activate, suspend, reinstate, cancel, renew); attach documents; read terms, notes and history. What the tour walks through: About ten lifecycle buttons that render by status (Edit, Refresh, Mark pending signature, Activate, Suspend/Reinstate, Start renewal, Renew, Cancel); linked deal; terms (rich text); document upload (hidden file input) and file rows; notes; history; ConfirmDialogs; reason Modal; and the **instalment schedule card** (`ContractPaymentsCard`: export, add-instalment dialog, per-instalment drawer with invoice / receipt / reverse / correct / edit / remove modes and forms). What changes the tour at runtime: Every lifecycle button depends on contract status; some need extra permissions. Warning banner (`role="alert"`), reason dialog validation. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Contract detail** (`contracts.detail`; `/:tenantSlug/contracts/:contractId`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/contracts/ContractDetail.tsx`, `pages/contracts/ContractDetailContent.tsx`, `components/contracts/ContractPaymentsCard.tsx`.
6. **Production LOC estimate:** **~568** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 53 steps x 8 = 424 + 48 annotation sites x 2 = 96 + Annotations for the hidden file input trigger and both dialogs 10 + Annotate `ContractPaymentsCard` (table rows, drawer modes, forms) with component-scoped ids 22. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/contractsDetail.ts`
      - Change: Create the page guide with the 53 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'contracts.detail', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`. Each step: `{ id, target: 'contracts.detail.<id>', kind, safety, … }`. Steps in state-only elements: `notFound`, `documentsEmpty`, `instalmentsEmpty`. Eligibility (`requires`): `payments.view`. Hand-offs (`opens`/`group`): `confirm`, `reason`, `instalment`, `add`.
      - Integration: Loaded lazily through `loaders['contracts.detail']` in `pageRegistry.ts`; copy keys resolve to `supportSales:contracts.detail.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/contractsDetail.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/contractsDetail.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `payments.view`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'contracts.detail': () => import('./guides/contractsDetail')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'contracts.detail'` on the entries for `contracts/:contractId` and delete `'contracts.detail'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/contracts/ContractDetailContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('contracts.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContractDetailContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L241 Button (detail.edit); L250 Button (detail.refreshFromDeal); L255 Button (detail.markPendingSignature); L260 Button (detail.replaceDocument); L265 Button (detail.activate); L270 Button (detail.reinstate); L275 Button (detail.suspend); L280 Button (detail.startRenewal); L285 Button (detail.renew); L290 Button (detail.cancel); L305 role=alert; L326 button; L354 button (detail.openDeal); L437 button (detail.renews); L454 button (detail.renewedBy); L469 button (detail.openRenewalDeal); L517 Button (detail.uploadDocument); L528 button; L546 input; L617 ConfirmDialog (detail.markPendingSignature); L626 ConfirmDialog (detail.activate); L636 Modal (detail.suspend); L648 TextareaInput (detail.reasonLabel); L655 Button; L658 Button (detail.confirmReason).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/contracts/ContractDetailContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/components/contracts/ContractPaymentsCard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('contracts.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContractPaymentsCard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L97 permission check [payments.view]; L258 Button; L276 Button; L292 role=alert (payments.exportFailed); L363 Button (payments.open); L374 SlideOver (payments.drawerTitle); L419 Button (payments.recordInvoice); L424 Button (payments.markPending); L433 Button (payments.recordReceipt); L438 Button (payments.reverseReceipt); L443 Button (payments.correctStatus); L449 Button (payments.change); L452 Button (payments.remove); L461 role=alert; L467 form; L477 TextInput (payments.invoiceNumber); L478 TextInput (payments.invoiceDate); L482 TextInput (payments.receiptAmount); L493 TextInput (payments.receivedOn); L494 SelectInput (payments.methodLabel); L504 SelectInput (payments.correctTo); L514 TextInput (payments.dueDate); L516 TextInput (payments.amount); L518 TextareaInput (payments.note); L522 TextareaInput (payments.reason); L530 role=alert; L535 Button (payments.confirm); L538 Button (payments.confirm); L569 Modal (payments.addTitle); L571 TextInput (payments.dueDate); L572 TextInput (payments.amount); L574 TextInput (payments.note); L577 TextareaInput (payments.reason); L581 role=alert; L586 Button (payments.save); L589 Button (payments.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/contracts/ContractPaymentsCard.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `contracts.detail.<step>.title` and `.body` for these steps: `title`, `warning`, `edit`, `markPendingSignature`, `activate`, `suspend`, `reinstate`, `startRenewal`, `renew`, `cancelContract`, `terms`, `dealLink`, `notFound`, `documents`, `uploadButton`, `fileRow`, `fileRemove`, `documentsEmpty`, `notes`, `historyItem`, `confirmDialog`, `confirmMessage`, `confirmOk`, `reasonDialog`, `reasonLabel`, `reasonConfirm`, `reasonCancel`, `paymentsCard`, `exportInstalments`, `addInstalment`, `instalmentRow`, `instalmentStatus`, `instalmentOpen`, `drawer`, `actionInvoice`, `actionSecondary`, `actionReceipt`, `actionReverse`, `actionCorrect`, `actionEdit`, `actionRemove`, `formInvoice`, `formReceipt`, `formCorrect`, `formEdit`, `formSubmit`, `formCancel`, `drawerError`, `addDialog`, `addFields`, `addConfirm`, `cardError`, `instalmentsEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `contracts.detail.<step>.title` and `.body` for these steps in Albanian: `title`, `warning`, `edit`, `markPendingSignature`, `activate`, `suspend`, `reinstate`, `startRenewal`, `renew`, `cancelContract`, `terms`, `dealLink`, `notFound`, `documents`, `uploadButton`, `fileRow`, `fileRemove`, `documentsEmpty`, `notes`, `historyItem`, `confirmDialog`, `confirmMessage`, `confirmOk`, `reasonDialog`, `reasonLabel`, `reasonConfirm`, `reasonCancel`, `paymentsCard`, `exportInstalments`, `addInstalment`, `instalmentRow`, `instalmentStatus`, `instalmentOpen`, `drawer`, `actionInvoice`, `actionSecondary`, `actionReceipt`, `actionReverse`, `actionCorrect`, `actionEdit`, `actionRemove`, `formInvoice`, `formReceipt`, `formCorrect`, `formEdit`, `formSubmit`, `formCancel`, `drawerError`, `addDialog`, `addFields`, `addConfirm`, `cardError`, `instalmentsEmpty`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'contracts.detail', route: 'contracts/:contractId' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "contracts.detail"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/contractsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/contracts/ContractDetailContent.tsx`, `src/components/contracts/ContractPaymentsCard.tsx`.
   3. **PT-3 Annotate** about 48 sites in those files. Includes: Annotations for the hidden file input trigger and both dialogs; Annotate `ContractPaymentsCard` (table rows, drawer modes, forms) with component-scoped ids.
   4. **PT-4 Write the guide**: 53 steps, in tour order (`<id>` becomes the copy key `supportSales:contracts.detail.<id>.title|body`):
      - `title` — number, company, status
      - `warning` — warning banner (`role="alert"`, state)
      - `edit` — Edit (explain-only: navigation)
      - `markPendingSignature` — Mark pending signature (explain-only)
      - `activate` — Activate (explain-only)
      - `suspend` — Suspend (destructive-class, explain-only)
      - `reinstate` — Reinstate (explain-only)
      - `startRenewal` — Start renewal (explain-only: creates data)
      - `renew` — Renew (explain-only: creates data)
      - `cancelContract` — Cancel contract (destructive, explain-only)
      - `terms` — terms heading, fields, validity and dates
      - `dealLink` — link to the deal (explain-only: navigation)
      - `notFound` — not found / load error (state)
      - `documents` — documents block
      - `uploadButton` — Attach document (explain-only: the hidden file input is never opened)
      - `fileRow` — one attached file, with its open link (repeat)
      - `fileRemove` — remove (repeat, destructive, explain-only)
      - `documentsEmpty` — no files (state)
      - `notes` — notes block
      - `historyItem` — one history entry (repeat)
      - `confirmDialog` — the confirm dialog (group: confirm)
      - `confirmMessage` — its consequence text (group: confirm, vars: dialog title)
      - `confirmOk` — confirm (group: confirm, explain-only)
      - `reasonDialog` — reason dialog (group: reason)
      - `reasonLabel` — reason field (group: reason, try-it)
      - `reasonConfirm` — confirm (group: reason, disabledHint until a reason, explain-only)
      - `reasonCancel` — Cancel (group: reason, explain-only)
      - `paymentsCard` — the instalment schedule card (component `ContractPaymentsCard`, component-scoped ids `contractPayments.*`)
      - `exportInstalments` — Export (needs `payments.view`, try-it: read-only download)
      - `addInstalment` — Add instalment (try-it: opens the dialog)
      - `instalmentRow` — one instalment: due date, amount, status (repeat)
      - `instalmentStatus` — status badge: planned, invoiced, paid, … (repeat, shared.statusBadge)
      - `instalmentOpen` — open the instalment drawer (repeat, try-it)
      - `drawer` — the instalment drawer and its summary (group: instalment)
      - `actionInvoice` — create invoice (group: instalment, explain-only: creates a document)
      - `actionSecondary` — the second primary action in the drawer (read at slice start; group: instalment, explain-only)
      - `actionReceipt` — record receipt (group: instalment, explain-only: records money)
      - `actionReverse` — reverse (group: instalment, destructive-class, explain-only)
      - `actionCorrect` — correct status (group: instalment, explain-only)
      - `actionEdit` — edit due date and amount (group: instalment, explain-only)
      - `actionRemove` — remove the instalment (group: instalment, destructive, explain-only)
      - `formInvoice` — invoice number, invoice date and a required comment (group: instalment, try-it)
      - `formReceipt` — received-on date (not in the future) and method (group: instalment, try-it)
      - `formCorrect` — corrected status (group: instalment, try-it)
      - `formEdit` — due date and amount (group: instalment, try-it)
      - `formSubmit` — the drawer's confirm button (group: instalment, disabledHint until valid, explain-only)
      - `formCancel` — Cancel (group: instalment, explain-only)
      - `drawerError` — error text (group: instalment, `role="alert"`, state)
      - `addDialog` — add-instalment dialog (group: add)
      - `addFields` — due date, amount, note and the required comment (group: add, try-it)
      - `addConfirm` — Add (group: add, disabledHint until due date, amount and comment exist, explain-only)
      - `cardError` — card-level error (`role="alert"`, state)
      - `instalmentsEmpty` — no instalments yet (state)
   5. **PT-5 Register** `/:tenantSlug/contracts/:contractId` as page `contracts.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `contracts.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty documents. No instalments yet.
   - **Loading / skeleton (L):** Waits. Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Files and history repeat. Instalment rows repeat; the drawer's action set differs by status, so the group steps are eligible per rendered button.
   - **Error / retry (X):** Warning banner and error. Card and drawer errors.
   - **Permission- or workflow-dependent controls (A):** Buttons per status and permission. Upload / remove by permission. Export needs `payments.view`; the drawer actions depend on instalment status and permissions.
   - **Dialogs, drawers, menus, nested workflows (D):** Both dialogs are hand-offs. The drawer and the add dialog are hand-offs.
   - **Validation and submission (V):** Reason is required. Required comments, dates not in the future, amount format: explained as rendered; Save is locked.
   - **Destructive or irreversible actions (explain-only) (K):** Suspend, cancel and renew carry warnings. Remove and confirm are warned. Reverse and remove are destructive; invoice and receipt create financial records.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The status changes only through the user after Exit; resuming recomputes the button set.
   - Files uploaded after the tour appear as repeated rows.
   - Which drawer actions exist depends on the instalment's status; each is its own step and is skipped when its button is not rendered.
   - An instalment invoiced or paid elsewhere changes the row and the drawer action set; the exemplar row is re-read.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - One fixture per status.
   - Upload button never opens a file chooser during the tour; dialogs.
   - One fixture per instalment status; drawer hand-off with the real `SlideOver`; no invoice, receipt, reversal or removal request is sent (allow-list empty).
   - Regression: existing tests of `ContractDetailContent.tsx`, `ContractPaymentsCard.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No lifecycle request is sent.
   - Zero mutations including uploads.
   - Zero financial mutations, verified by `expectNoMutations` with an empty allow-list.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/contractsDetail src/pages/contracts src/components/contracts
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "contracts.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 568.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Contract detail is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s25"></a>

### S25: Payments overview: complete tour

1. **Slice id and title:** S25. Payments overview: complete tour. Branch `support-slice-25-payments-overview-complete-tour`.
2. **Scope:** Filters, totals, export, table, pagination. In scope: `title`, `export`, `search`, `status`, `salesperson`, `dueFrom`, `dueTo`, `extraFilter`, `city`, `dueNotInvoiced`, `totals`, `table`, `row`, `rowStatus`, `rowInvoice`, `pagination`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Eight filters plus export; shared filter guidance keeps this readable. It lets a first-time user learn Payments overview in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Payments overview** (`/:tenantSlug/payments`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: Filter instalments, read totals, export CSV. What the tour walks through: Export CSV; search; status, salesperson, due-from, due-to, two more selects, city; "due not invoiced" checkbox; totals; table; Pagination. What changes the tour at runtime: Needs `payments.view`; scope-dependent salesperson filter. Empty (`role="alert"`), loading, export busy. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Payments overview** (`payments`; `/:tenantSlug/payments`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/payments/PaymentsOverview.tsx`, `pages/payments/PaymentsOverviewContent.tsx`.
6. **Production LOC estimate:** **~198** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + `exporting` state hint (export disabled while running or with zero rows) 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/payments.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'payments', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.statusBadge`, `shared.pagination`. Each step: `{ id, target: 'payments.<id>', kind, safety, … }`. Steps in state-only elements: `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['payments']` in `pageRegistry.ts`; copy keys resolve to `supportSales:payments.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/payments.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/payments.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'payments': () => import('./guides/payments')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'payments'` on the entries for `payments` and delete `'payments'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/payments/PaymentsOverviewContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('payments.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PaymentsOverviewContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L70 permission check [commercial.view]; L138 Button (exportCsv); L145 TextInput (filterSearch); L152 SelectInput (filterStatus); L160 SelectInput (filterSalesperson); L168 TextInput (filterDueFrom); L169 TextInput (filterDueTo); L170 SelectInput (filterArea); L185 SelectInput (filterCity); L194 input (filterDueNotInvoiced); L200 aria-label (totalsLabel); L218 role=alert (failed); L293 Pagination (items).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/payments/PaymentsOverviewContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `payments.<step>.title` and `.body` for these steps: `title`, `export`, `search`, `status`, `salesperson`, `dueFrom`, `dueTo`, `extraFilter`, `city`, `dueNotInvoiced`, `totals`, `table`, `row`, `rowStatus`, `rowInvoice`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `payments.<step>.title` and `.body` for these steps in Albanian: `title`, `export`, `search`, `status`, `salesperson`, `dueFrom`, `dueTo`, `extraFilter`, `city`, `dueNotInvoiced`, `totals`, `table`, `row`, `rowStatus`, `rowInvoice`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'payments', route: 'payments' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "payments"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/payments.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/payments/PaymentsOverviewContent.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: `exporting` state hint (export disabled while running or with zero rows).
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportSales:payments.<id>.title|body`):
      - `title` — heading
      - `export` — Export CSV (try-it: downloads a file, changes no data)
      - `search` — search (try-it)
      - `status` — status filter (try-it)
      - `salesperson` — salesperson filter (scope above OWN)
      - `dueFrom` — due-from (try-it)
      - `dueTo` — due-to (try-it)
      - `extraFilter` — further select filters (labels read at slice start; one step per filter)
      - `city` — city filter
      - `dueNotInvoiced` — due-not-invoiced checkbox (try-it)
      - `totals` — totals strip (info: follow the filters)
      - `table` — table region
      - `row` — one instalment (repeat)
      - `rowStatus` — status (repeat, shared.statusBadge)
      - `rowInvoice` — invoice link (repeat, explain-only: navigation)
      - `pagination` — pagination (shared.pagination)
      - `empty` — no instalments (`role="alert"`, state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/payments` as page `payments`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `payments`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty explained. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters + totals recompute. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission and scope. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Export is disabled with zero rows: the step shows the disabled hint.
   - Totals change with filters; the step describes what they sum, not the numbers.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Export disabled/enabled; empties; filters.
   - Regression: existing tests of `PaymentsOverviewContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Export is explained but never triggered (it is explain-only unless the user presses it after Exit).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/payments src/pages/payments
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "payments"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 198.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Payments overview is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s26"></a>

### S26: Renewals: complete tour

1. **Slice id and title:** S26. Renewals: complete tour. Branch `support-slice-26-renewals-complete-tour`.
2. **Scope:** The whole page. In scope: `title`, `windowTabs`, `tab`, `search`, `salesperson`, `table`, `row`, `rowEnd`, `rowState`, `actionsColumn`, `startRenewal`, `notRenewing`, `undo`, `dialog`, `dialogReason`, `dialogSave`, `dialogCancel`, `pagination`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** A work-list page with row buttons and a reason dialog. It lets a first-time user learn Renewals in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Renewals** (`/:tenantSlug/renewals`) and nothing else. A user who opens Support on this page can tour 20 steps in order, ask about any single control, and replay or leave. What the page is for: Work the renewal list by window (about to end, just ended…): start a renewal, mark "not renewing" with a reason, undo. What the tour walks through: Window tabs; search; salesperson select; table with row buttons (Start renewal, Not renewing, Undo); "not renewing" Modal (reason select); Pagination. What changes the tour at runtime: Needs `contracts.validity.view`; action column only on the work-list windows. Empty (`role="alert"`), loading, modal validation. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Renewals** (`renewals`; `/:tenantSlug/renewals`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/renewals/Renewals.tsx`, `pages/renewals/RenewalsContent.tsx`.
6. **Production LOC estimate:** **~212** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/renewals.ts`
      - Change: Create the page guide with the 20 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'renewals', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.tabs`, `shared.statusBadge`, `shared.pagination`. Each step: `{ id, target: 'renewals.<id>', kind, safety, … }`. Steps in state-only elements: `actionsColumn`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `notRenewing`.
      - Integration: Loaded lazily through `loaders['renewals']` in `pageRegistry.ts`; copy keys resolve to `supportSales:renewals.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/renewals.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/renewals.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'renewals': () => import('./guides/renewals')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'renewals'` on the entries for `renewals` and delete `'renewals'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/renewals/RenewalsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('renewals.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RenewalsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L158 Tabs (tabsLabel); L162 TextInput (filterSearch); L170 SelectInput (filterSalesperson); L183 role=alert (failed); L202 aria-label (columnActions); L248 button; L260 button; L285 Button (startRenewal); L290 Button (markNotRenewing); L295 Button (undoNotRenewing); L309 Pagination (items); L366 Modal (notRenewing.title); L369 SelectInput (notRenewing.reason); L379 TextareaInput (notRenewing.note); L381 Button (notRenewing.cancel); L384 Button (notRenewing.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/renewals/RenewalsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `renewals.<step>.title` and `.body` for these steps: `title`, `windowTabs`, `tab`, `search`, `salesperson`, `table`, `row`, `rowEnd`, `rowState`, `actionsColumn`, `startRenewal`, `notRenewing`, `undo`, `dialog`, `dialogReason`, `dialogSave`, `dialogCancel`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `renewals.<step>.title` and `.body` for these steps in Albanian: `title`, `windowTabs`, `tab`, `search`, `salesperson`, `table`, `row`, `rowEnd`, `rowState`, `actionsColumn`, `startRenewal`, `notRenewing`, `undo`, `dialog`, `dialogReason`, `dialogSave`, `dialogCancel`, `pagination`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'renewals', route: 'renewals' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "renewals"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/renewals.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/renewals/RenewalsContent.tsx`.
   3. **PT-3 Annotate** about 18 sites in those files.
   4. **PT-4 Write the guide**: 20 steps, in tour order (`<id>` becomes the copy key `supportSales:renewals.<id>.title|body`):
      - `title` — heading
      - `windowTabs` — window tabs (shared.tabs, try-it)
      - `tab` — one window tab (repeat, try-it)
      - `search` — search (try-it)
      - `salesperson` — salesperson filter (scope above OWN)
      - `table` — table region
      - `row` — one contract (repeat, explain-only: navigation)
      - `rowEnd` — end date and days left (repeat)
      - `rowState` — renewal state badge (repeat, shared.statusBadge)
      - `actionsColumn` — the action column appears only on work-list windows (state)
      - `startRenewal` — Start renewal (repeat, explain-only: creates data)
      - `notRenewing` — Not renewing (repeat, try-it: opens the dialog)
      - `undo` — Undo not renewing (repeat, explain-only)
      - `dialog` — the reason dialog (group: notRenewing)
      - `dialogReason` — reason select (group: notRenewing, try-it)
      - `dialogSave` — Save (group: notRenewing, disabledHint until a reason, explain-only)
      - `dialogCancel` — Cancel (group: notRenewing, explain-only)
      - `pagination` — pagination (shared.pagination)
      - `empty` — empty window (`role="alert"`, state)
      - `error` — load error (state)
   5. **PT-5 Register** `/:tenantSlug/renewals` as page `renewals`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `renewals`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty per window. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Search. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Dialog hand-off. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Reason required. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Window tabs scope the row actions.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Switching windows changes which action buttons exist; the eligible list follows.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Each window; dialog hand-off; empties.
   - Regression: existing tests of `RenewalsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/renewals src/pages/renewals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "renewals"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 212.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Renewals is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s27"></a>

### S27: Performance: complete tour

1. **Slice id and title:** S27. Performance: complete tour. Branch `support-slice-27-performance-complete-tour`.
2. **Scope:** The main screen. The detail panel and the records dialog. In scope: `title`, `exportCsv`, `exportPdf`, `period`, `customRange`, `compare`, `picker`, `pickerClear`, `table`, `column`, `personRow`, `personLink`, `figureButton`, `delta`, `empty`, `error`, `detail`, `detailClose`, `grain`, `indicator`, `viewToggle`, `chart`, `detailTable`, `detailError`, `recordsDialog`, `recordsTable`, `recordsPagination`, `recordsClose`. Out of scope: every other page (item 16).
3. **Purpose:** Period logic and comparison; export buttons are explained, not pressed. Second half of the page.
   - **Description.** This slice delivers the complete guided tour of **Performance** (`/:tenantSlug/performance`) and nothing else. A user who opens Support on this page can tour 28 steps in order, ask about any single control, and replay or leave. What the page is for: Compare salespeople over a period; export; open one person's detail with chart or table; open the underlying records. What the tour walks through: Export CSV / PDF; period select + custom dates; compare checkbox; person chips and Clear; table with per-person link and per-figure record buttons; detail panel (grain, indicator, chart/table toggle, close); records dialog with Pagination. What changes the tour at runtime: Needs `performance.view`; scope narrows the rows. Empty (`role="alert"`), detail load failure. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Performance** (`performance`; `/:tenantSlug/performance`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/performance/Performance.tsx`, `pages/performance/PerformanceContent.tsx`, `pages/performance/PerformanceDetail.tsx`, `pages/performance/PerformanceRecordsDialog.tsx`.
6. **Production LOC estimate:** **~290** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 28 steps x 8 = 224 + 25 annotation sites x 2 = 50. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/performance.ts`
      - Change: Create the page guide with the 28 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'performance', version: 1, namespace: 'supportSales', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.pagination`. Each step: `{ id, target: 'performance.<id>', kind, safety, … }`. Steps in state-only elements: `delta`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `detail`, `records`.
      - Integration: Loaded lazily through `loaders['performance']` in `pageRegistry.ts`; copy keys resolve to `supportSales:performance.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/performance.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/performance.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'performance': () => import('./guides/performance')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'performance'` on the entries for `performance` and delete `'performance'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/performance/PerformanceContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('performance.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PerformanceContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L37 permission check [commercial.view]; L109 button (openRecords); L112 aria-label (openRecords); L143 Button (exportCsv); L146 Button (exportPdf); L154 SelectInput (filterPeriod); L163 TextInput (filterFrom); L164 TextInput (filterTo); L168 input (compare); L177 button; L188 button (allSalespeople); L208 role=alert (failed); L241 button (deactivated).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/performance/PerformanceContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/performance/PerformanceDetail.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('performance.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PerformanceDetail`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L71 aria-label (detailTitle); L74 Button (closeDetail); L79 SelectInput (grain); L84 SelectInput (chartIndicator); L92 aria-label (viewLabel); L93 button (viewChart); L96 button (viewTable); L103 role=alert (failed); L105 aria-label (chartLabel).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/performance/PerformanceRecordsDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('performance.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PerformanceRecordsDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L82 Modal; L101 role=alert (recordsFailed); L140 Pagination (records).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/locales/en/supportSales.json`
      - Change: Add `performance.<step>.title` and `.body` for these steps: `title`, `exportCsv`, `exportPdf`, `period`, `customRange`, `compare`, `picker`, `pickerClear`, `table`, `column`, `personRow`, `personLink`, `figureButton`, `delta`, `empty`, `error`, `detail`, `detailClose`, `grain`, `indicator`, `viewToggle`, `chart`, `detailTable`, `detailError`, `recordsDialog`, `recordsTable`, `recordsPagination`, `recordsClose`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSales.json`
      - Change: Add `performance.<step>.title` and `.body` for these steps in Albanian: `title`, `exportCsv`, `exportPdf`, `period`, `customRange`, `compare`, `picker`, `pickerClear`, `table`, `column`, `personRow`, `personLink`, `figureButton`, `delta`, `empty`, `error`, `detail`, `detailClose`, `grain`, `indicator`, `viewToggle`, `chart`, `detailTable`, `detailError`, `recordsDialog`, `recordsTable`, `recordsPagination`, `recordsClose`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSales')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'performance', route: 'performance' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "performance"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/performance.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/performance/PerformanceContent.tsx`, `src/pages/performance/PerformanceDetail.tsx`, `src/pages/performance/PerformanceRecordsDialog.tsx`.
   3. **PT-3 Annotate** about 25 sites in those files.
   4. **PT-4 Write the guide**: 28 steps, in tour order (`<id>` becomes the copy key `supportSales:performance.<id>.title|body`):
      - `title` — heading
      - `exportCsv` — Export CSV (try-it: read-only download)
      - `exportPdf` — Export PDF (try-it: read-only download)
      - `period` — period select (try-it)
      - `customRange` — custom from / to dates (appear only for the custom preset)
      - `compare` — compare with previous period checkbox (try-it)
      - `picker` — person chips (repeat, try-it)
      - `pickerClear` — Clear selection (appears when people are chosen)
      - `table` — comparison table
      - `column` — a figure column (repeat)
      - `personRow` — one salesperson (repeat)
      - `personLink` — open this person's detail (repeat, try-it: opens the detail panel)
      - `figureButton` — open the records behind a figure (repeat, try-it: opens the records dialog)
      - `delta` — comparison deltas (state: compare on)
      - `empty` — empty (`role="alert"`, state)
      - `error` — load error (state)
      - `detail` — detail panel region (group: detail)
      - `detailClose` — Close (group: detail, explain-only)
      - `grain` — week / month select (group: detail, try-it)
      - `indicator` — indicator select (group: detail, try-it)
      - `viewToggle` — chart / table toggle (group: detail, try-it)
      - `chart` — chart as an image with text alternative (group: detail)
      - `detailTable` — table view (group: detail, repeat rows)
      - `detailError` — failed to load (group: detail, state)
      - `recordsDialog` — records dialog (group: records)
      - `recordsTable` — records table (group: records, repeat rows)
      - `recordsPagination` — pagination (group: records, shared.pagination)
      - `recordsClose` — Close (group: records, explain-only)
   5. **PT-5 Register** `/:tenantSlug/performance` as page `performance`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `performance`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. Empty records. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Period, picker. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** No pagination on this table. Pagination in the dialog.
   - **Error / retry (X):** Error. Detail failure. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Scope narrows rows. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Hand-offs to the detail panel and records dialog (next slice). Both are hand-offs.
   - **Tabs / sections (T):** Chart / table views. Tab-scoped steps run for the active tab only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Toggling compare adds delta cells; the `delta` step becomes eligible only when present.
   - Switching grain re-renders the chart; steps unaffected.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Presets; compare on/off; scope.
   - Hand-offs; view toggle; records pagination.
   - Regression: existing tests of `PerformanceContent.tsx`, `PerformanceDetail.tsx`, `PerformanceRecordsDialog.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Downloads are not triggered by the tour.
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/performance src/pages/performance
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "performance"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 290.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Performance is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

## Page tours: Wellness+ membership

<a id="s28"></a>

### S28: Members list: complete tour

1. **Slice id and title:** S28. Members list: complete tour. Branch `support-slice-28-members-list-complete-tour`.
2. **Scope:** The Wellness+ member list. In scope: `title`, `newMember`, `search`, `tier`, `status`, `validity`, `source`, `leftRange`, `sortBy`, `expiringSoon`, `vipReviewDue`, `formerEmployee`, `clear`, `table`, `row`, `rowNumber`, `rowTier`, `rowStatus`, `pagination`, `empty`, `emptyNoMatch`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Filter-heavy list; the conditional left-from / left-to inputs show runtime-dependent controls.
   - **Description.** This slice delivers the complete guided tour of **Members list** (`/:tenantSlug/members`) and nothing else. A user who opens Support on this page can tour 22 steps in order, ask about any single control, and replay or leave. What the page is for: Search and filter Wellness+ members; open or register one. What the tour walks through: New member; search; tier, status, validity, source selects; left-from / left-to (shown for former employees); sort select; three checkboxes (expiring soon, VIP review due, former employee); Clear; total; hand-rolled table; Pagination. What changes the tour at runtime: New member needs `members.manage`; page needs `members.view`; SALES_PROCESS workflow. Empty, loading, `role="alert"` load error, total summary. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Members list** (`members.list`; `/:tenantSlug/members`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S09 (Client detail: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/MembersList.tsx`, `pages/membership/MembersContent.tsx`, `pages/membership/MemberBadges.tsx`.
6. **Production LOC estimate:** **~232** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 22 steps x 8 = 176 + 20 annotation sites x 2 = 40. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersList.ts`
      - Change: Create the page guide with the 22 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.list', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.pagination`. Each step: `{ id, target: 'members.list.<id>', kind, safety, … }`. Steps in state-only elements: `leftRange`, `empty`, `emptyNoMatch`. Eligibility (`requires`): `members.manage`. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['members.list']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.list.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersList.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersList.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `members.manage`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.list': () => import('./guides/membersList')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.list'` on the entries for `members` and delete `'members.list'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/MembersContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.list.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MembersContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L106 Button (list.new); L116 TextInput (list.searchLabel); L124 SelectInput (list.filters.tier); L130 SelectInput (list.filters.status); L136 SelectInput (list.filters.validity); L141 SelectInput (list.filters.source); L149 TextInput (list.filters.leftFrom); L150 TextInput (list.filters.leftTo); L153 SelectInput (list.sortBy); L160 input (list.filters.expiringSoon); L164 input (list.filters.vipReviewDue); L168 input (list.filters.formerEmployee); L174 Button; L187 role=status (list.total); L207 role=alert (list.loadFailed); L256 Pagination.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/membership/MemberBadges.tsx`
      - Change: Read only: annotated with the client detail Wellness+ tab. Do not edit.
   7. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.list.<step>.title` and `.body` for these steps: `title`, `newMember`, `search`, `tier`, `status`, `validity`, `source`, `leftRange`, `sortBy`, `expiringSoon`, `vipReviewDue`, `formerEmployee`, `clear`, `table`, `row`, `rowNumber`, `rowTier`, `rowStatus`, `pagination`, `empty`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.list.<step>.title` and `.body` for these steps in Albanian: `title`, `newMember`, `search`, `tier`, `status`, `validity`, `source`, `leftRange`, `sortBy`, `expiringSoon`, `vipReviewDue`, `formerEmployee`, `clear`, `table`, `row`, `rowNumber`, `rowTier`, `rowStatus`, `pagination`, `empty`, `emptyNoMatch`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.list', route: 'members' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.list"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/MembersContent.tsx`.
   3. **PT-3 Annotate** about 20 sites in those files.
   4. **PT-4 Write the guide**: 22 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.list.<id>.title|body`):
      - `title` — heading and total (`role="status"`)
      - `newMember` — New member (needs `members.manage`, explain-only: navigation)
      - `search` — search by name, number, phone, email (try-it)
      - `tier` — tier filter (try-it)
      - `status` — status filter (try-it)
      - `validity` — validity filter (try-it)
      - `source` — source filter (corporate / individual / family) (try-it)
      - `leftRange` — left-from and left-to dates; shown only when the source filter is former employees (state)
      - `sortBy` — sort select (try-it)
      - `expiringSoon` — expiring soon checkbox (try-it)
      - `vipReviewDue` — VIP review due checkbox (try-it)
      - `formerEmployee` — former employee checkbox (try-it)
      - `clear` — Clear filters (while active)
      - `table` — member table region
      - `row` — one member (repeat, explain-only: navigation)
      - `rowNumber` — member number (repeat)
      - `rowTier` — tier badge (repeat, MemberBadges)
      - `rowStatus` — status and validity badges (repeat)
      - `pagination` — pagination (shared.pagination)
      - `empty` — no members (state)
      - `emptyNoMatch` — no match (state)
      - `error` — load failed (`role="alert"`, state)
   5. **PT-5 Register** `/:tenantSlug/members` as page `members.list`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** First-use and no-match empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Search and ten filters; conditional date inputs.
   - **Pagination / sorting (G):** Shared pagination plus the sort select.
   - **Error / retry (X):** Error row. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** New member by `members.manage`; page by `members.view`.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The page is a hand-rolled `<table>`; rows are annotated directly. At 360 px it stays a table: the exemplar is the first `tr`.
   - Choosing "former employees" reveals the date range; its step becomes eligible on the next frame.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Source filter reveals date inputs; empties; 0/1/60 rows; permissions.
   - Regression: existing tests of `MembersContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations; the list tour works for a Reception-like role with only `members.view`.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersList src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 232.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Members list is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s29"></a>

### S29: Member form (register and edit): complete tour

1. **Slice id and title:** S29. Member form (register and edit): complete tour. Branch `support-slice-29-member-form-register-and-edit-complete`.
2. **Scope:** Member register and edit, including the duplicate dialog. In scope: `mode`, `noTier`, `firstName`, `lastName`, `dateOfBirth`, `phone`, `email`, `identifierRule`, `language`, `city`, `noMedical`, `formError`, `cancel`, `save`, `duplicateDialog`, `duplicateOpen`, `duplicateSave`, `duplicateCancel`. Out of scope: every other page (item 16).
3. **Purpose:** The form deliberately has no tier, status, number or expiry control; the tour says so.
   - **Description.** This slice delivers the complete guided tour of **Member form (register and edit)** (`/:tenantSlug/members/new`, `/:tenantSlug/members/:memberId/edit`) and nothing else. A user who opens Support on this page can tour 18 steps in order, ask about any single control, and replay or leave. What the page is for: Register or edit personal details; resolve a duplicate warning. What the tour walks through: First, last name; date of birth; phone; email; language; city; identifier error; Cancel; Save; duplicate-member Modal (open existing, cancel, "different person, save"). What changes the tour at runtime: Needs `members.manage`. No tier / status / number control exists by design. Field errors, identifier error, generic error, duplicate dialog. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Member form (register and edit)** (`members.form`; `/:tenantSlug/members/new`, `/:tenantSlug/members/:memberId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/MemberFormPage.tsx`, `pages/membership/MemberFormContent.tsx`.
6. **Production LOC estimate:** **~192** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersForm.ts`
      - Change: Create the page guide with the 18 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.form', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'members.form.<id>', kind, safety, … }`. Steps in state-only elements: `identifierRule`, `formError`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `duplicate`.
      - Integration: Loaded lazily through `loaders['members.form']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.form.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersForm.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersForm.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.form': () => import('./guides/membersForm')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.form'` on the entries for `members/new`, `members/:memberId/edit` and delete `'members.form'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/MemberFormContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.form.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MemberFormContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L122 form (form.editTitle); L132 TextInput (form.firstName); L133 TextInput (form.lastName); L134 TextInput (form.dateOfBirth); L135 TextInput (form.phone); L136 TextInput (form.email); L137 SelectInput (form.language); L142 SelectInput (form.city); L148 role=alert (form.errors.identifier); L150 TextareaInput (form.note); L153 role=alert (form.errors.generic); L155 Button (form.cancel); L156 Button (form.saving); L161 Modal (duplicate.title); L171 Button (duplicate.open); L176 Button (duplicate.cancel); L177 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/membership/MemberFormPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.form.<step>.title` and `.body` for these steps: `mode`, `noTier`, `firstName`, `lastName`, `dateOfBirth`, `phone`, `email`, `identifierRule`, `language`, `city`, `noMedical`, `formError`, `cancel`, `save`, `duplicateDialog`, `duplicateOpen`, `duplicateSave`, `duplicateCancel`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.form.<step>.title` and `.body` for these steps in Albanian: `mode`, `noTier`, `firstName`, `lastName`, `dateOfBirth`, `phone`, `email`, `identifierRule`, `language`, `city`, `noMedical`, `formError`, `cancel`, `save`, `duplicateDialog`, `duplicateOpen`, `duplicateSave`, `duplicateCancel`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.form', route: 'members/new' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.form"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersForm.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/MemberFormContent.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.form.<id>.title|body`):
      - `mode` — register vs edit
      - `noTier` — why there is no tier / number field (info: calculated by the system)
      - `firstName` — first name (try-it)
      - `lastName` — last name (try-it)
      - `dateOfBirth` — date of birth (try-it)
      - `phone` — phone (try-it)
      - `email` — email (try-it)
      - `identifierRule` — at least one of date of birth, phone or email (state: shows with the identifier error)
      - `language` — language select (try-it)
      - `city` — predefined city select (try-it)
      - `noMedical` — no medical information is stored here (info)
      - `formError` — generic error (state)
      - `cancel` — Cancel (explain-only: navigation)
      - `save` — Save (explain-only: submit)
      - `duplicateDialog` — possible duplicate dialog (group: duplicate)
      - `duplicateOpen` — open the existing member (group: duplicate, repeat, explain-only)
      - `duplicateSave` — "Different person, save" (group: duplicate, explain-only)
      - `duplicateCancel` — Cancel (group: duplicate, explain-only)
   5. **PT-5 Register** `/:tenantSlug/members/new`, `/:tenantSlug/members/:memberId/edit` as page `members.form`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.form`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Edit load. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Permission- or workflow-dependent controls (A):** `members.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** The duplicate dialog appears only after a server 409; it can be explained only if the user reaches it, so the group is skipped silently otherwise.
   - **Validation and submission (V):** Identifier and generic errors. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Duplicate matches are a repeated list.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Register vs edit; duplicate hand-off with an msw 409.
   - Regression: existing tests of `MemberFormContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No member is created.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersForm src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.form"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 192.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Member form (register and edit) is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s30"></a>

### S30: Member detail: complete tour

1. **Slice id and title:** S30. Member detail: complete tour. Branch `support-slice-30-member-detail-complete-tour`.
2. **Scope:** Everything above the tabs. Overview, Terms, History and Note tabs (read-only blocks). Payments tab, receipt links and the void dialog. Family group, add / link / remove dialogs. VIP tab: current VIP term, requests, request and decision. The remaining dialogs.
3. **Purpose:** First of five slices for the member page. Explains how the effective tier is shown without ever offering a way to type it. Void is data-changing and irreversible in effect; explain-only. Largest tab (405 lines). Approver vs requester roles see different controls. Closes the page.
   - **Description.** This slice delivers the complete guided tour of **Member detail** (`/:tenantSlug/members/:memberId`) and nothing else. A user who opens Support on this page can tour 97 steps in order, ask about any single control, and replay or leave. What the page is for: Read a member (tier, terms, payments, family, VIP, history, note); record a payment; correct a tier; remove from a company; show the card; suspend, reinstate or close. What the tour walks through: Header with badges; Record payment, Correct tier, Remove from company, Card, Edit, status actions; seven tabs (overview, terms, payments, family, VIP, history, note); receipt links; Void payment dialog; family add/link/remove dialogs; VIP request and decision; status Modal. What changes the tour at runtime: Nearly every action has its own permission (`members.manage`, `members.payments.view/record`, `members.vip.*`); Close is destructive. Loading, not found, load failed, per-tab empty states, dialog errors. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Member detail** (`members.detail`; `/:tenantSlug/members/:memberId`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S09 (Client detail: complete tour). Existing code it relies on, unchanged since planning: `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~1000** (within the 800 to 1,200 band around the 1,000-line target): 16 guide module, loader line, route-map flip + 97 steps x 8 = 776 + 87 annotation sites x 2 = 174 + Annotations in `FamilyTab` dialogs (11 inputs) 14 + Annotations across `RecordPaymentModal`, `CorrectTierDialog`, `RemoveFromCompanyDialog`, `MemberCardDialog` and the status Modal 20. Copy is JSON and not counted.
7. **File-Level Change Plan** (16 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/membersDetail.ts`
      - Change: Create the page guide with the 97 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'members.detail', version: 1, namespace: 'supportMembers', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.tabs`. Each step: `{ id, target: 'members.detail.<id>', kind, safety, … }`. Steps in state-only elements: `loading`, `notFound`, `termsEmpty`, `paymentsEmpty`, `familyEmpty`, `notPrincipal`, `ownRequest`, `vipEmpty`. Eligibility (`requires`): `members.payments.record`, `members.manage`, `members.payments.view`, `members.vip.approve`. Hand-offs (`opens`/`group`): `void`, `add`, `remove`, `request`, `decision`, `pay`, `correct`, `leave`, `card`, `status`.
      - Integration: Loaded lazily through `loaders['members.detail']` in `pageRegistry.ts`; copy keys resolve to `supportMembers:members.detail.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/membersDetail.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/membersDetail.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility for `members.payments.record`, `members.manage`, `members.payments.view`, `members.vip.approve`, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'members.detail': () => import('./guides/membersDetail')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'members.detail'` on the entries for `members/:memberId` and delete `'members.detail'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/membership/MemberDetailContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MemberDetailContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L138 role=status (detail.back); L142 role=alert (detail.back); L143 Button (detail.back); L185 Button (payments.record); L190 Button (detail.correctTier.button); L195 Button (removeEmployer.button); L200 Button (card.button); L204 Button (detail.edit); L208 Button (detail.actions.${a}); L234 Tabs (detail.tabs.label); L335 button (payments.openReceipt); L361 Button (payments.tab.void); L542 Modal (payments.voidDialog.title); L545 TextareaInput (payments.voidDialog.reason); L555 role=alert (payments.voidDialog.${voidError}); L557 Button (payments.voidDialog.cancel); L558 Button (payments.voidDialog.confirm); L563 Modal (detail.statusDialog.${action}); L567 TextareaInput (detail.statusDialog.reason); L577 role=alert (detail.statusDialog.failed); L579 Button (detail.statusDialog.cancel); L580 Button (detail.statusDialog.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/membership/FamilyTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FamilyTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L90 button; L106 Button (family.remove); L130 button (validity.valid); L144 Button (family.add); L190 Modal (family.removeDialog.title); L193 TextareaInput (family.removeDialog.reason); L203 role=alert (family.removeDialog.failed); L205 Button (family.removeDialog.cancel); L206 Button (family.removeDialog.confirm); L308 Modal (family.addDialog.title); L310 SelectInput (family.addDialog.mode); L324 TextInput (form.firstName); L325 TextInput (form.lastName); L326 TextInput (form.dateOfBirth); L327 TextInput (form.phone); L328 TextInput (form.email); L332 TextInput (family.addDialog.search); L334 SelectInput (family.addDialog.member); L344 SelectInput (family.addDialog.relationship); L360 input; L371 role=alert (family.addDialog.cancel); L373 Button (family.addDialog.cancel); L374 Button (family.addDialog.save); L379 Modal (duplicate.title); L390 Button (duplicate.cancel); L391 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/membership/VipTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `VipTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L80 Button (vip.request); L81 Button (vip.end); L131 Button (vip.decide.approve); L132 Button (vip.decide.reject); L145 Modal (vip.endDialog.title); L148 TextareaInput (vip.reason); L158 role=alert (vip.cancel); L160 Button (vip.cancel); L161 Button (vip.endDialog.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/pages/membership/VipDecisionDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `VipDecisionDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L46 Modal (vip.decide.requestedWith); L50 TextareaInput; L60 role=alert (vip.decide.cancel); L62 Button (vip.decide.cancel); L63 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/pages/membership/RecordPaymentModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RecordPaymentModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L103 Modal (payments.drawer.title); L105 TextInput (payments.drawer.receivedOn); L114 role=status (payments.drawer.noOptions); L115 role=alert (payments.drawer.loadFailed); L118 SelectInput (payments.drawer.option); L129 aria-label (payments.drawer.quote); L168 SelectInput (payments.drawer.method); L173 TextareaInput (payments.drawer.note); L175 role=alert (payments.drawer.${saveError}); L177 Button (payments.drawer.cancel); L178 Button (payments.drawer.save).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/pages/membership/CorrectTierDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CorrectTierDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L51 Modal (detail.correctTier.title); L54 SelectInput (detail.correctTier.tier); L58 TextInput (detail.correctTier.endsOn); L68 TextareaInput (detail.correctTier.reason); L78 role=alert (detail.correctTier.failed); L80 Button (detail.correctTier.cancel); L81 Button (detail.correctTier.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Modify** `src/pages/membership/RemoveFromCompanyDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RemoveFromCompanyDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L58 Modal (removeEmployer.helpMany); L61 TextInput (removeEmployer.leftOn); L72 TextareaInput (removeEmployer.reason); L83 role=alert (removeEmployer.cancel); L86 Button (removeEmployer.cancel); L87 Button (removeEmployer.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   12. **Modify** `src/pages/membership/MemberCardDialog.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('members.detail.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `MemberCardDialog`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L101 Modal (card.title); L103 role=status (card.loadFailed); L104 role=alert (card.loadFailed); L116 input (card.replaced); L119 role=status (card.replaced); L120 role=alert (card.replaceFailed); L121 role=status (card.copied); L124 Button (card.copy); L125 Button (card.printCard); L126 Button (card.printA6); L127 Button (card.replace); L134 Modal (card.replaceDialog.title); L138 Button (card.replaceDialog.cancel); L139 Button (card.replaceDialog.confirm).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   13. **Leave unchanged** `src/pages/membership/MemberDetailPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   14. **Modify** `src/locales/en/supportMembers.json`
      - Change: Add `members.detail.<step>.title` and `.body` for these steps: `title`, `badges`, `recordPayment`, `correctTier`, `removeFromCompany`, `card`, `edit`, `statusActions`, `closeMember`, `tabs`, `back`, `loading`, `notFound`, `tabOverview`, `overviewFields`, `effectiveTier`, `tabTerms`, `termsTable`, `termRow`, `termSource`, `termsEmpty`, `tabHistory`, `tierHistory`, `statusHistory`, `tabNote`, `noteWarning`, `noteField`, `noteSave`, `tabPayments`, `paymentsTable`, `paymentRow`, `receiptLink`, `voidedMarker`, `voidButton`, `voidDialog`, `voidReason`, `voidError`, `voidConfirm`, `voidCancel`, `paymentsEmpty`, `paymentsHidden`, `tabFamily`, `principal`, `familyTable`, `familyRow`, `relationship`, `familyEmpty`, `addFamily`, `addDialog`, `addMode`, `addRelationship`, `addConfirmTick`, `addFields`, `addSearch`, `addMatch`, `addSave`, `removeFamily`, `removeDialog`, `removeConfirm`, `notPrincipal`, `familyDiscount`, `tabVip`, `vipStatus`, `requestsTable`, `requestRow`, `requestStatus`, `requestVip`, `requestDialog`, `requestReason`, `requestSave`, `approve`, `reject`, `decisionDialog`, `decisionComment`, `decisionConfirm`, `ownRequest`, `vipEmpty`, `paymentDrawer`, `payKind`, `payTier`, `payMethod`, `payDate`, `payAmount`, `payWarnings`, `paySave`, `correctDialog`, `correctTier`, `correctReason`, `correctSave`, `removeRecap`, `cardDialog`, `cardCopy`, `cardPrint`, `cardReplace`, `statusDialog`, `statusReason`, `statusConfirm`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   15. **Modify** `src/locales/sq/supportMembers.json`
      - Change: Add `members.detail.<step>.title` and `.body` for these steps in Albanian: `title`, `badges`, `recordPayment`, `correctTier`, `removeFromCompany`, `card`, `edit`, `statusActions`, `closeMember`, `tabs`, `back`, `loading`, `notFound`, `tabOverview`, `overviewFields`, `effectiveTier`, `tabTerms`, `termsTable`, `termRow`, `termSource`, `termsEmpty`, `tabHistory`, `tierHistory`, `statusHistory`, `tabNote`, `noteWarning`, `noteField`, `noteSave`, `tabPayments`, `paymentsTable`, `paymentRow`, `receiptLink`, `voidedMarker`, `voidButton`, `voidDialog`, `voidReason`, `voidError`, `voidConfirm`, `voidCancel`, `paymentsEmpty`, `paymentsHidden`, `tabFamily`, `principal`, `familyTable`, `familyRow`, `relationship`, `familyEmpty`, `addFamily`, `addDialog`, `addMode`, `addRelationship`, `addConfirmTick`, `addFields`, `addSearch`, `addMatch`, `addSave`, `removeFamily`, `removeDialog`, `removeConfirm`, `notPrincipal`, `familyDiscount`, `tabVip`, `vipStatus`, `requestsTable`, `requestRow`, `requestStatus`, `requestVip`, `requestDialog`, `requestReason`, `requestSave`, `approve`, `reject`, `decisionDialog`, `decisionComment`, `decisionConfirm`, `ownRequest`, `vipEmpty`, `paymentDrawer`, `payKind`, `payTier`, `payMethod`, `payDate`, `payAmount`, `payWarnings`, `paySave`, `correctDialog`, `correctTier`, `correctReason`, `correctSave`, `removeRecap`, `cardDialog`, `cardCopy`, `cardPrint`, `cardReplace`, `statusDialog`, `statusReason`, `statusConfirm`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportMembers')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   16. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'members.detail', route: 'members/:memberId' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "members.detail"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/MemberDetailContent.tsx`, `src/pages/membership/FamilyTab.tsx`, `src/pages/membership/VipTab.tsx`, `src/pages/membership/VipDecisionDialog.tsx`, `src/pages/membership/RecordPaymentModal.tsx`.
   3. **PT-3 Annotate** about 87 sites in those files. Includes: Annotations in `FamilyTab` dialogs (11 inputs); Annotations across `RecordPaymentModal`, `CorrectTierDialog`, `RemoveFromCompanyDialog`, `MemberCardDialog` and the status Modal.
   4. **PT-4 Write the guide**: 97 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.detail.<id>.title|body`):
      - `title` — name, number, tier, status, validity
      - `badges` — tier / status / validity badges (MemberBadges)
      - `recordPayment` — Record payment (needs `members.payments.record`, try-it: opens the drawer/modal)
      - `correctTier` — Correct tier (permission, try-it: opens dialog)
      - `removeFromCompany` — Remove from company (employees only, try-it: opens dialog)
      - `card` — Card (try-it: opens card dialog)
      - `edit` — Edit (needs `members.manage`, explain-only: navigation)
      - `statusActions` — suspend / reinstate / close / reopen buttons (repeat; button set follows status)
      - `closeMember` — Close (destructive, explain-only)
      - `tabs` — seven tabs (shared.tabs, try-it)
      - `back` — back to the list (explain-only: navigation)
      - `loading` — loading placeholder (state)
      - `notFound` — not found / load failed with Back (state)
      - `tabOverview` — Overview tab (try-it)
      - `overviewFields` — personal data fields (repeat)
      - `effectiveTier` — effective tier and why it is calculated (info)
      - `tabTerms` — Terms tab (try-it)
      - `termsTable` — term history table
      - `termRow` — one term (repeat)
      - `termSource` — term source badge (paid / sponsored / VIP / downgrade) (repeat)
      - `termsEmpty` — no terms (state: Bronze is the floor)
      - `tabHistory` — History tab (try-it)
      - `tierHistory` — tier history (repeat)
      - `statusHistory` — status history (repeat)
      - `tabNote` — Note tab (try-it)
      - `noteWarning` — "no medical information" warning (info)
      - `noteField` — note text (try-it, needs `members.manage`)
      - `noteSave` — save note (explain-only: submit)
      - `tabPayments` — Payments tab (needs `members.payments.view`, try-it)
      - `paymentsTable` — payments table
      - `paymentRow` — one payment (repeat)
      - `receiptLink` — open receipt PDF (repeat, try-it: read-only)
      - `voidedMarker` — voided marker (repeat, state)
      - `voidButton` — Void on the latest payment only (needs permission, try-it: opens dialog)
      - `voidDialog` — void dialog (group: void)
      - `voidReason` — reason (group: void, try-it)
      - `voidError` — error text (group: void, state)
      - `voidConfirm` — Void (group: void, destructive, explain-only)
      - `voidCancel` — Cancel (group: void, explain-only)
      - `paymentsEmpty` — no payments (state)
      - `paymentsHidden` — Reception sees no payment data at all (info)
      - `tabFamily` — Family tab (try-it)
      - `principal` — principal member and group summary
      - `familyTable` — family members table
      - `familyRow` — one family member (repeat)
      - `relationship` — relationship and who confirmed it (repeat)
      - `familyEmpty` — no family members (state)
      - `addFamily` — Add family member (needs `members.manage`, try-it: opens dialog)
      - `addDialog` — add dialog (group: add)
      - `addMode` — create new vs link existing (group: add, try-it)
      - `addRelationship` — relationship select (group: add, try-it)
      - `addConfirmTick` — "I confirmed the relationship" tick (group: add, try-it)
      - `addFields` — new member fields (group: add, try-it)
      - `addSearch` — search an existing member (group: add, try-it)
      - `addMatch` — a search match (group: add, repeat, explain-only)
      - `addSave` — Add (group: add, explain-only)
      - `removeFamily` — Remove from group (repeat, destructive, try-it: opens dialog)
      - `removeDialog` — remove dialog (group: remove)
      - `removeConfirm` — Remove (group: remove, destructive, explain-only)
      - `notPrincipal` — a family member cannot add a group (state)
      - `familyDiscount` — family price applies (info)
      - `tabVip` — VIP tab (try-it, with pending-request count)
      - `vipStatus` — current VIP term and review date
      - `requestsTable` — VIP requests
      - `requestRow` — one request (repeat)
      - `requestStatus` — request status badge (repeat)
      - `requestVip` — Request VIP (needs `members.manage`, try-it: opens dialog)
      - `requestDialog` — request dialog (group: request)
      - `requestReason` — reason (group: request, try-it)
      - `requestSave` — Send (group: request, explain-only)
      - `approve` — Approve (needs `members.vip.approve`, try-it: opens dialog)
      - `reject` — Reject (needs `members.vip.approve`, try-it: opens dialog)
      - `decisionDialog` — decision dialog (group: decision)
      - `decisionComment` — comment (group: decision, try-it)
      - `decisionConfirm` — Confirm (group: decision, explain-only)
      - `ownRequest` — you cannot approve your own request (state)
      - `vipEmpty` — no requests (state)
      - `paymentDrawer` — record-payment dialog (group: pay)
      - `payKind` — kind (new / renewal / upgrade) (group: pay, try-it)
      - `payTier` — target tier (group: pay, try-it)
      - `payMethod` — method (group: pay, try-it)
      - `payDate` — date, not in the future (group: pay, try-it)
      - `payAmount` — the calculated amount: there is no amount field (group: pay, info)
      - `payWarnings` — downgrade-Silver / sponsored-Silver warnings (group: pay, state)
      - `paySave` — Record (group: pay, explain-only)
      - `correctDialog` — correct tier dialog (group: correct)
      - `correctTier` — tier select (group: correct, try-it)
      - `correctReason` — reason (group: correct, try-it)
      - `correctSave` — Save (group: correct, explain-only)
      - `removeRecap` — the remove-from-company dialog is explained by the shared `removeFromCompany.*` guidance written with the client detail Wellness+ tab (group: leave, shared)
      - `cardDialog` — member card dialog (group: card)
      - `cardCopy` — copy link (group: card, try-it: clipboard only)
      - `cardPrint` — print (group: card, try-it)
      - `cardReplace` — replace link (group: card, destructive-class, explain-only)
      - `statusDialog` — suspend / reinstate / close / reopen dialog (group: status)
      - `statusReason` — reason (group: status, try-it)
      - `statusConfirm` — Confirm (group: status, explain-only; Close is destructive)
   5. **PT-5 Register** `/:tenantSlug/members/:memberId` as page `members.detail`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No terms yet, no history. Empty payments. No family. No requests.
   - **Loading / skeleton (L):** Loading is a one-line `role="status"`; the tour waits.
   - **Populated, repeated rows or cards (P):** Terms and history rows repeat. Rows repeat. Rows. Rows.
   - **Error / retry (X):** Not found and load failed. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Each button needs its own permission. Note editing needs `members.manage`. The tab and the Void button exist only with their permissions: a user without `members.payments.view` gets no payment steps. Add / remove need `members.manage`; a family member (not a principal) sees a different tab. Requester vs approver. Each dialog is reachable only with its permission.
   - **Dialogs, drawers, menus, nested workflows (D):** Void dialog hand-off. Two dialogs. Two dialogs. Five dialogs as hand-offs.
   - **Validation and submission (V):** Note save locked. Reason required. Required tick and relationship. Comment required. Reasons and dates.
   - **Tabs / sections (T):** Four tabs; tab-scoped steps. Tab scope. Tab scope.
   - **Destructive or irreversible actions (explain-only) (K):** Close carries a warning. Void warning. Remove warning. Replace-link, close and remove carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Suspending a member (by the user) changes the button set; the eligible list recomputes after Exit/Resume.
   - New terms appear after a payment (in another session) as new rows with the same ids.
   - Only the latest non-voided payment has a Void button; after a void the next payment gains it.
   - Search matches are a repeated list; no match shows the empty result.
   - A request decided elsewhere changes its row; the approve / reject buttons disappear.
   - The payment quote is calculated server-side; its text changes with kind and tier, and the `payAmount` step reads it at display time, never from a stored copy.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 15 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Permission matrix; status fixtures.
   - Tab scoping; empty vs populated terms.
   - Reception vs agent; latest-only void; hand-off.
   - Principal vs family member; both dialogs; permission.
   - Requester vs approver vs both; own-request rule.
   - Each dialog hand-off; the card link token never appears in any announcement or log (token privacy test).
   - Regression: existing tests of `MemberDetailContent.tsx`, `FamilyTab.tsx`, `VipTab.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
   - Tour leaves the note unchanged.
   - No void request sent.
   - No family link is created or removed.
   - No VIP decision recorded.
   - Card link token is not written to the announcer, console or storage.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/membersDetail src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "members.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 1000.
15. **Dependencies and handoff:** unblocks S35. After this slice **Member detail is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

