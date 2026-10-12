# Support tour plan: slice document 5 of 6 (S43 to S54)

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

## Page tours: Settings and form builder

<a id="s43"></a>

### S43: Settings: Statuses: complete tour

1. **Slice id and title:** S43. Settings: Statuses: complete tour. Branch `support-slice-43-settings-statuses-complete-tour`.
2. **Scope:** Deal stage labels and the stale-deals threshold. In scope: `title`, `row`, `labelSq`, `labelEn`, `edit`, `rowSave`, `rowCancel`, `moveUp`, `moveDown`, `staleDays`, `staleSave`, `staleSaved`, `error`, `loadFailed`. Out of scope: every other page (item 16).
3. **Purpose:** Editing labels affects every user. It lets a first-time user learn Settings: Statuses in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Statuses** (`/:tenantSlug/settings/statuses`) and nothing else. A user who opens Support on this page can tour 14 steps in order, ask about any single control, and replay or leave. What the page is for: Rename deal stage labels (sq and en), reorder, and set the stale-deals threshold. What the tour walks through: Rows with label inputs (sq, en), Save / Cancel, Edit, Move up / Move down icon buttons; stale-deals input + Save. What changes the tour at runtime: Needs `settings.manage`. Load failed, error, saved status. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Statuses** (`settings.statuses`; `/:tenantSlug/settings/statuses`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/statuses/StatusesSettingsPage.tsx`, `pages/settings/statuses/StatusesSettingsContent.tsx`.
6. **Production LOC estimate:** **~154** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsStatuses.ts`
      - Change: Create the page guide with the 14 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.statuses', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.statuses.<id>', kind, safety, … }`. Steps in state-only elements: `staleSaved`, `error`, `loadFailed`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.statuses']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.statuses.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsStatuses.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsStatuses.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.statuses': () => import('./guides/settingsStatuses')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.statuses'` on the entries for `settings/statuses` and delete `'settings.statuses'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/statuses/StatusesSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.statuses.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `StatusesSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L51 role=alert (statuses.loadFailed); L105 role=alert (statuses.columns.order); L122 input (statuses.columns.labelSq); L129 input (statuses.columns.labelEn); L143 Button (statuses.save); L146 Button (statuses.cancel); L157 Button (statuses.moveUp); L160 aria-label (statuses.moveUp); L166 Button (statuses.moveDown); L169 aria-label (statuses.moveDown); L191 Button (statuses.edit); L194 aria-label (statuses.edit); L263 input; L277 Button (statuses.staleDeals.saveAria); L288 role=alert (statuses.staleDeals.saved); L292 role=status (statuses.staleDeals.saved).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/statuses/StatusesSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Leave unchanged** `src/pages/settings/statuses/StatusesSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.statuses.<step>.title` and `.body` for these steps: `title`, `row`, `labelSq`, `labelEn`, `edit`, `rowSave`, `rowCancel`, `moveUp`, `moveDown`, `staleDays`, `staleSave`, `staleSaved`, `error`, `loadFailed`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.statuses.<step>.title` and `.body` for these steps in Albanian: `title`, `row`, `labelSq`, `labelEn`, `edit`, `rowSave`, `rowCancel`, `moveUp`, `moveDown`, `staleDays`, `staleSave`, `staleSaved`, `error`, `loadFailed`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.statuses', route: 'settings/statuses' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.statuses"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsStatuses.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/statuses/StatusesSettingsContent.tsx`.
   3. **PT-3 Annotate** about 13 sites in those files.
   4. **PT-4 Write the guide**: 14 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.statuses.<id>.title|body`):
      - `title` — heading
      - `row` — one stage (repeat)
      - `labelSq` — Albanian label (repeat, try-it)
      - `labelEn` — English label (repeat, try-it)
      - `edit` — Edit (repeat, try-it)
      - `rowSave` — Save (repeat, explain-only)
      - `rowCancel` — Cancel (repeat, explain-only)
      - `moveUp` — Move up (repeat, aria-label per name, explain-only: changes order)
      - `moveDown` — Move down (repeat, explain-only)
      - `staleDays` — stale-deals threshold (try-it)
      - `staleSave` — Save threshold (explain-only)
      - `staleSaved` — saved status (state)
      - `error` — error (state)
      - `loadFailed` — load failed (state)
   5. **PT-5 Register** `/:tenantSlug/settings/statuses` as page `settings.statuses`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.statuses`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `settings.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Reordered rows keep ids.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Edit mode on and off.
   - Regression: existing tests of `StatusesSettingsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsStatuses src/pages/settings/statuses
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.statuses"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 154.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Statuses is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s44"></a>

### S44: Settings: Wellness+: complete tour

1. **Slice id and title:** S44. Settings: Wellness+: complete tour. Branch `support-slice-44-settings-wellness-complete-tour`.
2. **Scope:** Four tabs. In scope: `tabs`, `tabTiers`, `tierRow`, `tierFee`, `tierTerm`, `tierLabels`, `tierSave`, `tabRules`, `familyDiscount`, `graceDays`, `windowDays`, `prefixes`, `rulesSave`, `tabRelationships`, `relationshipRow`, `addRelationship`, `tabBenefits`, `benefitGrid`, `benefitRow`, `benefitCell`, `addService`, `readOnly`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** The read-only variant for non-administrators is first-class here. It lets a first-time user learn Settings: Wellness+ in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Wellness+** (`/:tenantSlug/settings/wellness-plus/:tab?`) and nothing else. A user who opens Support on this page can tour 23 steps in order, ask about any single control, and replay or leave. What the page is for: Set tier fees and terms, membership rules, family relationships and the benefit table. What the tour walks through: Four tabs; tier rows with fee / term / label inputs; rules inputs; relationships table (add, activate); benefits grid (percent per service and tier, add service). What changes the tour at runtime: Edit needs `wellnessplus.settings.manage`; `members.view` / `members.verify` see only the read-only benefits tab. `role="alert"` error per panel. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Wellness+** (`settings.wellnessPlus`; `/:tenantSlug/settings/wellness-plus/:tab?`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/wellnessPlus/WellnessPlusSettingsPage.tsx`, `pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `pages/settings/wellnessPlus/TiersPanel.tsx`, `pages/settings/wellnessPlus/RulesPanel.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~242** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 23 steps x 8 = 184 + 21 annotation sites x 2 = 42. Copy is JSON and not counted.
7. **File-Level Change Plan** (13 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsWellnessPlus.ts`
      - Change: Create the page guide with the 23 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.wellnessPlus', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.wellnessPlus.<id>', kind, safety, … }`. Steps in state-only elements: `readOnly`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.wellnessPlus']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.wellnessPlus.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsWellnessPlus.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsWellnessPlus.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.wellnessPlus': () => import('./guides/settingsWellnessPlus')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.wellnessPlus'` on the entries for `settings/wellness-plus/:tab?` and delete `'settings.wellnessPlus'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.wellnessPlus.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `WELLNESS_PLUS_TABS`, `WellnessPlusSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L56 Tabs (wellnessPlus.title); L71 role=alert (wellnessPlus.loadFailed).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/wellnessPlus/WellnessPlusSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/settings/wellnessPlus/TiersPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.wellnessPlus.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TiersPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L71 form; L83 input; L96 Button (wellnessPlus.save); L100 role=alert; L105 role=status (wellnessPlus.saved).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/settings/wellnessPlus/RulesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.wellnessPlus.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RulesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L59 form; L71 input; L88 Button (wellnessPlus.save); L92 role=alert; L97 role=status (wellnessPlus.saved).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/pages/settings/wellnessPlus/RelationshipsPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.wellnessPlus.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RelationshipsPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L54 role=alert (wellnessPlus.loading); L75 Button (wellnessPlus.deactivate); L85 form; L94 input (wellnessPlus.nameEn); L98 input (wellnessPlus.relationships.add); L100 Button (wellnessPlus.relationships.add); L104 role=alert.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/pages/settings/wellnessPlus/BenefitsPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.wellnessPlus.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `BenefitsPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L75 role=alert (wellnessPlus.loading); L105 input; L121 Button (wellnessPlus.deactivate); L131 role=alert (wellnessPlus.benefits.addTitle); L135 form; L144 input (wellnessPlus.nameEn); L148 input (wellnessPlus.benefits.add); L150 Button (wellnessPlus.benefits.add).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Leave unchanged** `src/pages/settings/wellnessPlus/WellnessPlusSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   11. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.wellnessPlus.<step>.title` and `.body` for these steps: `tabs`, `tabTiers`, `tierRow`, `tierFee`, `tierTerm`, `tierLabels`, `tierSave`, `tabRules`, `familyDiscount`, `graceDays`, `windowDays`, `prefixes`, `rulesSave`, `tabRelationships`, `relationshipRow`, `addRelationship`, `tabBenefits`, `benefitGrid`, `benefitRow`, `benefitCell`, `addService`, `readOnly`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   12. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.wellnessPlus.<step>.title` and `.body` for these steps in Albanian: `tabs`, `tabTiers`, `tierRow`, `tierFee`, `tierTerm`, `tierLabels`, `tierSave`, `tabRules`, `familyDiscount`, `graceDays`, `windowDays`, `prefixes`, `rulesSave`, `tabRelationships`, `relationshipRow`, `addRelationship`, `tabBenefits`, `benefitGrid`, `benefitRow`, `benefitCell`, `addService`, `readOnly`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   13. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.wellnessPlus', route: 'settings/wellness-plus/:tab?' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.wellnessPlus"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsWellnessPlus.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `src/pages/settings/wellnessPlus/TiersPanel.tsx`, `src/pages/settings/wellnessPlus/RulesPanel.tsx`, `src/pages/settings/wellnessPlus/RelationshipsPanel.tsx`, `src/pages/settings/wellnessPlus/BenefitsPanel.tsx`.
   3. **PT-3 Annotate** about 21 sites in those files.
   4. **PT-4 Write the guide**: 23 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.wellnessPlus.<id>.title|body`):
      - `tabs` — tab bar (limited to benefits for read-only users)
      - `tabTiers` — Tiers and fees (try-it)
      - `tierRow` — one tier (repeat)
      - `tierFee` — fee (repeat, try-it; absent for Bronze and VIP)
      - `tierTerm` — term months (repeat, try-it)
      - `tierLabels` — labels (repeat, try-it)
      - `tierSave` — Save (explain-only)
      - `tabRules` — Rules (try-it)
      - `familyDiscount` — family discount percent (try-it)
      - `graceDays` — grace days (try-it)
      - `windowDays` — expiring-soon window (try-it)
      - `prefixes` — member and receipt prefixes (try-it)
      - `rulesSave` — Save (explain-only)
      - `tabRelationships` — Relationships (try-it)
      - `relationshipRow` — one relationship (repeat)
      - `addRelationship` — add (try-it)
      - `tabBenefits` — Benefits (try-it)
      - `benefitGrid` — benefits grid (tiers as columns)
      - `benefitRow` — a service row (repeat)
      - `benefitCell` — a percent cell (repeat, try-it for the administrator, read-only otherwise)
      - `addService` — add a service (needs manage, try-it)
      - `readOnly` — read-only notice (state)
      - `error` — panel error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/wellness-plus/:tab?` as page `settings.wellnessPlus`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.wellnessPlus`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows and cells. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Administrator vs read-only user sees different tabs and no edit controls.
   - **Validation and submission (V):** Saves locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Four tabs. Tab-scoped steps run for the active tab only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The benefit grid has a service per row and a column per tier; adding a service adds a row with the same ids.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Administrator vs read-only; empty grid.
   - Regression: existing tests of `WellnessPlusSettingsContent.tsx`, `TiersPanel.tsx`, `RulesPanel.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsWellnessPlus src/pages/settings/wellnessPlus
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.wellnessPlus"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 242.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Wellness+ is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s45"></a>

### S45: Settings: Contracts and payments: complete tour

1. **Slice id and title:** S45. Settings: Contracts and payments: complete tour. Branch `support-slice-45-settings-contracts-and-payments-complete-tour`.
2. **Scope:** Contract defaults form. In scope: `title`, `field`, `fieldHelp`, `save`, `saveDisabled`, `saved`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Smallest settings page. Documented lean exception: one page, one form. It lets a first-time user learn Settings: Contracts and payments in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Contracts and payments** (`/:tenantSlug/settings/contracts`) and nothing else. A user who opens Support on this page can tour 7 steps in order, ask about any single control, and replay or leave. What the page is for: Set contract and payment defaults. What the tour walks through: One settings form with an input and Save. What changes the tour at runtime: Needs `settings.manage`. Saving / saved / error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Contracts and payments** (`settings.contracts`; `/:tenantSlug/settings/contracts`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/contracts/ContractSettingsPage.tsx`, `pages/settings/contracts/ContractSettingsContent.tsx`.
6. **Production LOC estimate:** **~84** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 7 steps x 8 = 56 + 6 annotation sites x 2 = 12. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsContracts.ts`
      - Change: Create the page guide with the 7 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.contracts', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.contracts.<id>', kind, safety, … }`. Steps in state-only elements: `saved`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.contracts']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.contracts.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsContracts.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsContracts.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.contracts': () => import('./guides/settingsContracts')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.contracts'` on the entries for `settings/contracts` and delete `'settings.contracts'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/contracts/ContractSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.contracts.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContractSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L98 role=alert (contractSettings.loading); L103 form; L115 input; L132 Button (contractSettings.save); L135 role=alert (contractSettings.saved); L136 role=status (contractSettings.saved).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/contracts/ContractSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Leave unchanged** `src/pages/settings/contracts/ContractSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.contracts.<step>.title` and `.body` for these steps: `title`, `field`, `fieldHelp`, `save`, `saveDisabled`, `saved`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.contracts.<step>.title` and `.body` for these steps in Albanian: `title`, `field`, `fieldHelp`, `save`, `saveDisabled`, `saved`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.contracts', route: 'settings/contracts' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.contracts"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsContracts.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/contracts/ContractSettingsContent.tsx`.
   3. **PT-3 Annotate** about 6 sites in those files.
   4. **PT-4 Write the guide**: 7 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.contracts.<id>.title|body`):
      - `title` — heading
      - `field` — the setting input (read at slice start)
      - `fieldHelp` — what the setting changes (info)
      - `save` — Save (disabled until dirty, explain-only)
      - `saveDisabled` — why disabled (disabledHint)
      - `saved` — saved status (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/contracts` as page `settings.contracts`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.contracts`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `settings.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Dirty tracking toggles the Save hint.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Dirty and clean.
   - Regression: existing tests of `ContractSettingsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Nothing saved.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsContracts src/pages/settings/contracts
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.contracts"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 84.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Contracts and payments is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s46"></a>

### S46: Settings: Audit log: complete tour

1. **Slice id and title:** S46. Settings: Audit log: complete tour. Branch `support-slice-46-settings-audit-log-complete-tour`.
2. **Scope:** Audit filters, table, detail drawer, export. In scope: `title`, `export`, `from`, `to`, `entityType`, `action`, `user`, `table`, `row`, `rowWhen`, `rowActor`, `pagination`, `drawer`, `drawerDiff`, `drawerClose`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Read-only history; export writes a file. It lets a first-time user learn Settings: Audit log in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Audit log** (`/:tenantSlug/settings/audit`) and nothing else. A user who opens Support on this page can tour 17 steps in order, ask about any single control, and replay or leave. What the page is for: Filter the audit trail, open an entry, export. What the tour walks through: Export; from / to date inputs; three selects; DataTable; Pagination; entry SlideOver. What changes the tour at runtime: Needs `audit.view`. Empty, `role="alert"` failure. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Audit log** (`settings.audit`; `/:tenantSlug/settings/audit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/audit/AuditLogSettingsPage.tsx`, `pages/settings/audit/AuditLogContent.tsx`, `pages/settings/audit/AuditEntryDetail.tsx`.
6. **Production LOC estimate:** **~182** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsAudit.ts`
      - Change: Create the page guide with the 17 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.audit', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11) and uses shared kinds: `shared.pagination`. Each step: `{ id, target: 'settings.audit.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `entry`.
      - Integration: Loaded lazily through `loaders['settings.audit']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.audit.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsAudit.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsAudit.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.audit': () => import('./guides/settingsAudit')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.audit'` on the entries for `settings/audit` and delete `'settings.audit'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/audit/AuditLogContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.audit.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AuditLogContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L150 Button (export); L158 input (filters.to); L162 input (filters.user); L164 SelectInput (filters.user); L175 SelectInput (filters.entityType); L193 SelectInput (filters.action); L206 role=alert (loadFailed); L209 DataTable; L216 DataTable empty prop (empty.title); L218 Pagination (detail.title); L222 SlideOver (detail.title).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/audit/AuditLogContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/settings/audit/AuditEntryDetail.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.audit.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AuditEntryDetail`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Leave unchanged** `src/pages/settings/audit/AuditLogSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   8. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.audit.<step>.title` and `.body` for these steps: `title`, `export`, `from`, `to`, `entityType`, `action`, `user`, `table`, `row`, `rowWhen`, `rowActor`, `pagination`, `drawer`, `drawerDiff`, `drawerClose`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.audit.<step>.title` and `.body` for these steps in Albanian: `title`, `export`, `from`, `to`, `entityType`, `action`, `user`, `table`, `row`, `rowWhen`, `rowActor`, `pagination`, `drawer`, `drawerDiff`, `drawerClose`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.audit', route: 'settings/audit' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.audit"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsAudit.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/audit/AuditLogContent.tsx`, `src/pages/settings/audit/AuditEntryDetail.tsx`.
   3. **PT-3 Annotate** about 15 sites in those files.
   4. **PT-4 Write the guide**: 17 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.audit.<id>.title|body`):
      - `title` — heading
      - `export` — Export (try-it: read-only download)
      - `from` — from date (try-it)
      - `to` — to date (try-it)
      - `entityType` — entity type filter (try-it)
      - `action` — action filter (try-it)
      - `user` — user filter (try-it)
      - `table` — audit table
      - `row` — one entry (repeat, try-it: opens the drawer)
      - `rowWhen` — time (repeat)
      - `rowActor` — actor (repeat)
      - `pagination` — pagination (shared.pagination)
      - `drawer` — entry detail drawer (group: entry)
      - `drawerDiff` — old and new values (group: entry, repeat rows)
      - `drawerClose` — close (group: entry, explain-only)
      - `empty` — empty (state)
      - `error` — load failed (state)
   5. **PT-5 Register** `/:tenantSlug/settings/audit` as page `settings.audit`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.audit`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (P11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `audit.view`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Drawer. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Entity types come from `useAuditEntityTypes`; the filter step explains the list, not its items.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Filters; drawer hand-off.
   - Regression: existing tests of `AuditLogContent.tsx`, `AuditEntryDetail.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsAudit src/pages/settings/audit
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.audit"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 182.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Audit log is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s47"></a>

### S47: Settings: Integrations: complete tour

1. **Slice id and title:** S47. Settings: Integrations: complete tour. Branch `support-slice-47-settings-integrations-complete-tour`.
2. **Scope:** Providers. In scope: `title`, `breadcrumb`, `ownerNotice`, `provider`, `status`, `connectedSince`, `connect`, `disconnect`, `processing`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Connect is an outward-facing action. It lets a first-time user learn Settings: Integrations in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Integrations** (`/:tenantSlug/settings/integrations`) and nothing else. A user who opens Support on this page can tour 10 steps in order, ask about any single control, and replay or leave. What the page is for: Connect or disconnect external providers. What the tour walks through: Breadcrumb; per-provider card with status, connected-since date, Connect / Disconnect buttons; owner-only notice. What changes the tour at runtime: Needs `integrations.manage`; Connect vs Disconnect by state; button disabled while processing. Connected / not connected per provider, processing. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Integrations** (`settings.integrations`; `/:tenantSlug/settings/integrations`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/IntegrationsPage.tsx`.
6. **Production LOC estimate:** **~114** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 10 steps x 8 = 80 + 9 annotation sites x 2 = 18. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsIntegrations.ts`
      - Change: Create the page guide with the 10 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.integrations', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.integrations.<id>', kind, safety, … }`. Steps in state-only elements: `ownerNotice`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.integrations']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.integrations.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsIntegrations.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsIntegrations.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.integrations': () => import('./guides/settingsIntegrations')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.integrations'` on the entries for `settings/integrations` and delete `'settings.integrations'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/IntegrationsPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.integrations.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `IntegrationsPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L50 permission check [integrations.manage]; L176 button; L196 button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.integrations.<step>.title` and `.body` for these steps: `title`, `breadcrumb`, `ownerNotice`, `provider`, `status`, `connectedSince`, `connect`, `disconnect`, `processing`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.integrations.<step>.title` and `.body` for these steps in Albanian: `title`, `breadcrumb`, `ownerNotice`, `provider`, `status`, `connectedSince`, `connect`, `disconnect`, `processing`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.integrations', route: 'settings/integrations' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.integrations"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsIntegrations.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/IntegrationsPage.tsx`.
   3. **PT-3 Annotate** about 9 sites in those files.
   4. **PT-4 Write the guide**: 10 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.integrations.<id>.title|body`):
      - `title` — heading
      - `breadcrumb` — breadcrumb
      - `ownerNotice` — owner-only notice (state)
      - `provider` — one provider card (repeat)
      - `status` — connected / not connected (repeat, state)
      - `connectedSince` — connected since (repeat)
      - `connect` — Connect (repeat, explain-only: starts an external flow)
      - `disconnect` — Disconnect (repeat, destructive-class, explain-only)
      - `processing` — processing state (repeat, disabledHint)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/integrations` as page `settings.integrations`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.integrations`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Processing. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Providers repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `integrations.manage`; connect vs disconnect by state.
   - **Destructive or irreversible actions (explain-only) (K):** Disconnect warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Provider list comes from a definition array; adding one is covered.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Connected and not connected providers.
   - Regression: existing tests of `IntegrationsPage.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No OAuth/redirect started.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsIntegrations src/pages
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.integrations"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 114.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Integrations is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s48"></a>

### S48: Settings: Client management: complete tour

1. **Slice id and title:** S48. Settings: Client management: complete tour. Branch `support-slice-48-settings-client-management-complete-tour`.
2. **Scope:** Custom fields tab and the field slide-over. Forms tab. In scope: `tabs`, `tabFields`, `importFields`, `addField`, `fieldTable`, `fieldRow`, `fieldMoveUp`, `fieldMoveDown`, `fieldEdit`, `fieldDelete`, `slideOver`, `fieldLabel`, `fieldType`, `fieldOptions`, `optionAdd`, `optionRemove`, `fieldRequired`, `fieldEntity`, `fieldSave`, `deleteConfirm`, `empty`, `error`, `tabForms`, `createForm`, `fromTemplate`, `formRow`, `formEdit`, `formSubmissions`, `formDuplicate`, `formSaveTemplate`, `formDelete`, `createDialog`, `createName`, `createOk`, `templateDialog`, `templateRow`, `templateUse`, `templateDelete`, `confirmDelete`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Defines what appears on the client form. Form management; leads into the builder (separate slices).
   - **Description.** This slice delivers the complete guided tour of **Settings: Client management** (`/:tenantSlug/settings/client-management`) and nothing else. A user who opens Support on this page can tour 41 steps in order, ask about any single control, and replay or leave. What the page is for: Define custom fields for companies; manage client forms (create, templates, duplicate, save as template, delete). What the tour walks through: Two tab buttons; custom-fields tab (Excel import entry, Add field, rows with move up / down / edit / delete, SlideOver field editor with type, options, required); forms tab (Create form, From template Modal, rows with edit / submissions / duplicate / save as template / delete; ConfirmDialogs). What changes the tour at runtime: Needs `settings.manage`; form actions need `forms.manage`. Empty lists, errors, confirmations. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Client management** (`settings.clientManagement`; `/:tenantSlug/settings/client-management`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/ClientSettingsPage.tsx`, `pages/settings/ClientSettingsContent.tsx`, `pages/settings/ClientFormsTab.tsx`.
6. **Production LOC estimate:** **~426** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 41 steps x 8 = 328 + 37 annotation sites x 2 = 74 + Annotations in the slide-over body 8. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsClientManagement.ts`
      - Change: Create the page guide with the 41 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.clientManagement', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.clientManagement.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`, `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `field`, `delete`, `create`, `template`, `confirm`.
      - Integration: Loaded lazily through `loaders['settings.clientManagement']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.clientManagement.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsClientManagement.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsClientManagement.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.clientManagement': () => import('./guides/settingsClientManagement')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.clientManagement'` on the entries for `settings/client-management` and delete `'settings.clientManagement'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/ClientSettingsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.clientManagement.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientSettingsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L182 button (clientManagement.tabCustomFields); L188 button (clientManagement.tabForm); L210 Button (clientManagement.addField); L246 button (clientManagement.moveUpAria); L254 button (clientManagement.moveDownAria); L262 button (clientManagement.editFieldAria); L269 button (clientManagement.deleteFieldAria); L299 SlideOver (clientManagement.editFieldTitle); L305 Button; L308 Button; L319 role=alert (clientManagement.fieldName); L323 TextInput (clientManagement.fieldName); L329 SelectInput (clientManagement.fieldType); L348 button (clientManagement.removeOptionAria); L351 aria-label (clientManagement.removeOptionAria); L360 TextInput (clientManagement.optionsPlaceholder); L371 Button (clientManagement.addOption); L378 SelectInput (clientManagement.role); L399 input; L413 ConfirmDialog (clientManagement.deleteFieldTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/ClientSettingsContent.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/pages/settings/ClientFormsTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.clientManagement.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ClientFormsTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L107 Button (formBuilder.newFromTemplate); L114 Button (formBuilder.createForm); L121 role=alert; L123 role=alert; L143 Button (formBuilder.makeIntake); L152 Button (submissions.title); L160 Button (formBuilder.duplicate); L163 Button (formBuilder.saveAsTemplate); L167 Button (formBuilder.delete); L183 Modal (formBuilder.createForm); L185 TextInput (formBuilder.formName); L191 role=alert (formBuilder.cancel); L193 Button (formBuilder.cancel); L196 Button (formBuilder.creating); L203 Modal (formBuilder.templatePickerTitle); L211 role=alert (formBuilder.noTemplates); L220 Button (formBuilder.useTemplate); L223 Button (formBuilder.delete); L234 ConfirmDialog (formBuilder.deleteFormTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/ClientFormsTab.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   7. **Leave unchanged** `src/pages/settings/ClientSettingsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   8. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.clientManagement.<step>.title` and `.body` for these steps: `tabs`, `tabFields`, `importFields`, `addField`, `fieldTable`, `fieldRow`, `fieldMoveUp`, `fieldMoveDown`, `fieldEdit`, `fieldDelete`, `slideOver`, `fieldLabel`, `fieldType`, `fieldOptions`, `optionAdd`, `optionRemove`, `fieldRequired`, `fieldEntity`, `fieldSave`, `deleteConfirm`, `empty`, `error`, `tabForms`, `createForm`, `fromTemplate`, `formRow`, `formEdit`, `formSubmissions`, `formDuplicate`, `formSaveTemplate`, `formDelete`, `createDialog`, `createName`, `createOk`, `templateDialog`, `templateRow`, `templateUse`, `templateDelete`, `confirmDelete`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.clientManagement.<step>.title` and `.body` for these steps in Albanian: `tabs`, `tabFields`, `importFields`, `addField`, `fieldTable`, `fieldRow`, `fieldMoveUp`, `fieldMoveDown`, `fieldEdit`, `fieldDelete`, `slideOver`, `fieldLabel`, `fieldType`, `fieldOptions`, `optionAdd`, `optionRemove`, `fieldRequired`, `fieldEntity`, `fieldSave`, `deleteConfirm`, `empty`, `error`, `tabForms`, `createForm`, `fromTemplate`, `formRow`, `formEdit`, `formSubmissions`, `formDuplicate`, `formSaveTemplate`, `formDelete`, `createDialog`, `createName`, `createOk`, `templateDialog`, `templateRow`, `templateUse`, `templateDelete`, `confirmDelete`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.clientManagement', route: 'settings/client-management' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.clientManagement"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsClientManagement.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/ClientSettingsContent.tsx`, `src/pages/settings/ClientFormsTab.tsx`.
   3. **PT-3 Annotate** about 37 sites in those files. Includes: Annotations in the slide-over body.
   4. **PT-4 Write the guide**: 41 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.clientManagement.<id>.title|body`):
      - `tabs` — two tab buttons
      - `tabFields` — Custom fields (try-it)
      - `importFields` — Excel import entry in this tab (`ExcelImportButton`, explain-only: opens a file chooser and creates data)
      - `addField` — Add field (try-it: opens slide-over)
      - `fieldTable` — field list
      - `fieldRow` — one field (repeat)
      - `fieldMoveUp` — Move up (repeat, explain-only: changes order)
      - `fieldMoveDown` — Move down (repeat, explain-only)
      - `fieldEdit` — Edit (repeat, try-it)
      - `fieldDelete` — Delete (repeat, destructive, try-it: opens confirm)
      - `slideOver` — field editor drawer (group: field)
      - `fieldLabel` — label (group: field, try-it)
      - `fieldType` — type select (group: field, try-it)
      - `fieldOptions` — options list for select types (group: field, repeat)
      - `optionAdd` — add option (group: field, try-it)
      - `optionRemove` — remove option (group: field, repeat, explain-only)
      - `fieldRequired` — required checkbox (group: field, try-it)
      - `fieldEntity` — entity select (group: field, try-it)
      - `fieldSave` — Save (group: field, explain-only)
      - `deleteConfirm` — delete confirm (group: delete, destructive)
      - `empty` — no custom fields (state)
      - `error` — save error (state)
      - `tabForms` — Forms (try-it)
      - `createForm` — Create form (try-it: opens dialog)
      - `fromTemplate` — From template (try-it: opens dialog)
      - `formRow` — one form (repeat)
      - `formEdit` — open in builder (repeat, explain-only: navigation)
      - `formSubmissions` — view submissions (repeat, explain-only: navigation)
      - `formDuplicate` — Duplicate (repeat, explain-only)
      - `formSaveTemplate` — Save as template (repeat, explain-only)
      - `formDelete` — Delete (repeat, destructive, try-it: opens confirm)
      - `createDialog` — create dialog (group: create)
      - `createName` — name (group: create, try-it)
      - `createOk` — Create (group: create, explain-only)
      - `templateDialog` — template dialog (group: template)
      - `templateRow` — a template (group: template, repeat)
      - `templateUse` — Use (group: template, repeat, explain-only)
      - `templateDelete` — delete template (group: template, repeat, destructive)
      - `confirmDelete` — confirm (group: confirm, destructive)
      - `empty` — no forms (state)
      - `error` — action errors (state)
   5. **PT-5 Register** `/:tenantSlug/settings/client-management` as page `settings.clientManagement`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.clientManagement`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No fields. No forms. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. Rows and templates. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `settings.manage`. `forms.manage`.
   - **Dialogs, drawers, menus, nested workflows (D):** Drawer and confirm. Three dialogs.
   - **Validation and submission (V):** Locked. Name required. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Two tabs. Second tab. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. Deletes warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The options step exists only for select-type fields; it follows the rendered type.
   - Single-select creation is a known gap (TD-007); the guide must not claim it works: verify at slice start.
   - Duplicating a form (user, after Exit) adds a row.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 16 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Type-dependent options; drawer hand-off.
   - Empty vs populated; dialogs.
   - Regression: existing tests of `ClientSettingsContent.tsx`, `ClientFormsTab.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No field created.
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsClientManagement src/pages/settings
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.clientManagement"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 426.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Client management is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s49"></a>

### S49: Settings: Notifications: complete tour

1. **Slice id and title:** S49. Settings: Notifications: complete tour. Branch `support-slice-49-settings-notifications-complete-tour`.
2. **Scope:** Notification policy form. In scope: `breadcrumb`, `readOnlyNotice`, `masterToggle`, `eventToggles`, `recipientToggles`, `timing`, `digest`, `quietHours`, `channelToggles`, `discard`, `save`, `saved`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Read-only for non-owners: the tour explains that instead of pretending to edit. It lets a first-time user learn Settings: Notifications in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Notifications** (`/:tenantSlug/settings/notifications`) and nothing else. A user who opens Support on this page can tour 13 steps in order, ask about any single control, and replay or leave. What the page is for: Read (everyone) or edit (owner) the email notification policy. What the tour walks through: Breadcrumb; about a dozen checkboxes and a `select` for timing; Discard; Save. What changes the tour at runtime: Readable by everyone; **all controls are disabled for non-owners** and the server refuses their writes. Loading, saving, read-only. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Notifications** (`settings.notifications`; `/:tenantSlug/settings/notifications`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/settings/NotificationSettingsPage.tsx`.
6. **Production LOC estimate:** **~144** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **File-Level Change Plan** (8 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsNotifications.ts`
      - Change: Create the page guide with the 13 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.notifications', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.notifications.<id>', kind, safety, … }`. Steps in state-only elements: `readOnlyNotice`, `saved`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['settings.notifications']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.notifications.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsNotifications.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsNotifications.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.notifications': () => import('./guides/settingsNotifications')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.notifications'` on the entries for `settings/notifications` and delete `'settings.notifications'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/NotificationSettingsPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.notifications.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `NotificationSettingsPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L72 permission check [settings.manage]; L161 aria-label (breadcrumb); L195 input; L222 input; L244 input; L269 input; L283 select; L319 input; L341 input; L351 input; L370 input; L384 input; L405 input; L422 input; L439 Button; L442 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/pages/settings/NotificationSettingsPage.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   6. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.notifications.<step>.title` and `.body` for these steps: `breadcrumb`, `readOnlyNotice`, `masterToggle`, `eventToggles`, `recipientToggles`, `timing`, `digest`, `quietHours`, `channelToggles`, `discard`, `save`, `saved`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   7. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.notifications.<step>.title` and `.body` for these steps in Albanian: `breadcrumb`, `readOnlyNotice`, `masterToggle`, `eventToggles`, `recipientToggles`, `timing`, `digest`, `quietHours`, `channelToggles`, `discard`, `save`, `saved`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.notifications', route: 'settings/notifications' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.notifications"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsNotifications.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/NotificationSettingsPage.tsx`.
   3. **PT-3 Annotate** about 12 sites in those files.
   4. **PT-4 Write the guide**: 13 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.notifications.<id>.title|body`):
      - `breadcrumb` — breadcrumb
      - `readOnlyNotice` — all controls disabled for non-owners (state)
      - `masterToggle` — master switch (try-it for owners)
      - `eventToggles` — per-event checkboxes (repeat, try-it)
      - `recipientToggles` — recipient options (repeat, try-it)
      - `timing` — timing select (try-it)
      - `digest` — digest option (try-it)
      - `quietHours` — quiet hours inputs (try-it)
      - `channelToggles` — channel options (repeat)
      - `discard` — Discard (disabledHint until changed, explain-only)
      - `save` — Save (explain-only: submit)
      - `saved` — saved (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/notifications` as page `settings.notifications`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.notifications`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Owner vs non-owner: for non-owners every control step becomes info with a disabled hint.
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Control list read at slice start (12 inputs).
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Owner vs staff.
   - Regression: existing tests of `NotificationSettingsPage.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Nothing saved.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsNotifications src/pages/settings
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.notifications"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 144.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Notifications is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s50"></a>

### S50: Settings: Warehouses: complete tour

1. **Slice id and title:** S50. Settings: Warehouses: complete tour. Branch `support-slice-50-settings-warehouses-complete-tour`.
2. **Scope:** Warehouse management. In scope: `breadcrumb`, `add`, `table`, `row`, `rowEdit`, `rowDelete`, `formModal`, `formFields`, `formSave`, `deleteConfirm`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Inventory settings; scope ALL required. It lets a first-time user learn Settings: Warehouses in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Settings: Warehouses** (`/:tenantSlug/settings/warehouses`) and nothing else. A user who opens Support on this page can tour 12 steps in order, ask about any single control, and replay or leave. What the page is for: Add, edit and delete warehouses. What the tour walks through: Breadcrumb; Add warehouse; table; WarehouseFormModal; delete confirmation. What changes the tour at runtime: Needs `inventory.manage` at scope ALL. Empty, error. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Warehouses** (`settings.warehouses`; `/:tenantSlug/settings/warehouses`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/inventory/WarehouseList/WarehouseList.tsx`, `components/inventory/WarehouseTable`, `components/inventory/WarehouseFormModal`.
6. **Production LOC estimate:** **~134** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsWarehouses.ts`
      - Change: Create the page guide with the 12 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.warehouses', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.warehouses.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `form`, `confirm`.
      - Integration: Loaded lazily through `loaders['settings.warehouses']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.warehouses.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsWarehouses.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsWarehouses.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.warehouses': () => import('./guides/settingsWarehouses')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.warehouses'` on the entries for `settings/warehouses` and delete `'settings.warehouses'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/inventory/WarehouseList/WarehouseList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.warehouses.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `WarehouseList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L84 permission check [inventory.manage]; L94 button (warehouses.addButton); L103 KPICard (warehouses.totalActive); L110 KPICard (warehouses.capacityUsed); L117 KPICard (warehouses.hubTraffic); L183 aria-label (warehouses.breadcrumbSettings).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/components/inventory/WarehouseFormModal/WarehouseFormModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.warehouses.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `WarehouseFormModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L45 Modal; L51 form (warehouses.formNameLabel); L53 TextInput (warehouses.formNameLabel); L62 TextareaInput (warehouses.formAddressLabel); L73 Button (warehouses.saveFacility); L76 Button (warehouses.saveFacility).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.warehouses.<step>.title` and `.body` for these steps: `breadcrumb`, `add`, `table`, `row`, `rowEdit`, `rowDelete`, `formModal`, `formFields`, `formSave`, `deleteConfirm`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.warehouses.<step>.title` and `.body` for these steps in Albanian: `breadcrumb`, `add`, `table`, `row`, `rowEdit`, `rowDelete`, `formModal`, `formFields`, `formSave`, `deleteConfirm`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.warehouses', route: 'settings/warehouses' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.warehouses"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsWarehouses.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/inventory/WarehouseList/WarehouseList.tsx`.
   3. **PT-3 Annotate** about 11 sites in those files.
   4. **PT-4 Write the guide**: 12 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.warehouses.<id>.title|body`):
      - `breadcrumb` — breadcrumb
      - `add` — Add warehouse (try-it: opens modal)
      - `table` — warehouses table
      - `row` — one warehouse (repeat)
      - `rowEdit` — edit (repeat, try-it)
      - `rowDelete` — delete (repeat, destructive, try-it: opens confirm)
      - `formModal` — warehouse dialog (group: form)
      - `formFields` — fields (group: form, try-it)
      - `formSave` — Save (group: form, explain-only)
      - `deleteConfirm` — confirm (group: confirm, destructive)
      - `empty` — none yet (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/warehouses` as page `settings.warehouses`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.warehouses`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `inventory.manage` ALL. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Stock in a warehouse blocks deletion; the confirm text is read from the dialog.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empty vs rows; dialogs.
   - Regression: existing tests of `WarehouseList.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsWarehouses src/pages/inventory/WarehouseList src/components/inventory
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.warehouses"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 134.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Warehouses is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s51"></a>

### S51: Settings: Categories: complete tour

1. **Slice id and title:** S51. Settings: Categories: complete tour. Branch `support-slice-51-settings-categories-complete-tour`.
2. **Scope:** Category management. In scope: `breadcrumb`, `showArchived`, `add`, `table`, `row`, `rowEdit`, `rowDelete`, `formModal`, `formFields`, `formSave`, `deleteModal`, `archivedMarker`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Has a visibly disabled "more (soon)" button that must not be explained as working.
   - **Description.** This slice delivers the complete guided tour of **Settings: Categories** (`/:tenantSlug/settings/categories`) and nothing else. A user who opens Support on this page can tour 14 steps in order, ask about any single control, and replay or leave. What the page is for: Add, rename, archive and delete product categories. What the tour walks through: "Show archived" checkbox; Add; per-row Edit / Delete icon buttons (`title`) and a `disabled` "more (soon)" button; form and delete modals. What changes the tour at runtime: Needs `inventory.manage` at scope ALL. Empty, archived view. **The per-row "more" button is `disabled` with a "coming soon" title** and is not explained as functional. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Settings: Categories** (`settings.categories`; `/:tenantSlug/settings/categories`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/inventory/CategoryList/CategoryList.tsx`, `components/inventory/CategoryFormModal`, `components/inventory/DeleteCategoryModal`.
6. **Production LOC estimate:** **~154** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **File-Level Change Plan** (10 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/settingsCategories.ts`
      - Change: Create the page guide with the 14 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'settings.categories', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'settings.categories.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `form`, `delete`.
      - Integration: Loaded lazily through `loaders['settings.categories']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:settings.categories.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/settingsCategories.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/settingsCategories.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'settings.categories': () => import('./guides/settingsCategories')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'settings.categories'` on the entries for `settings/categories` and delete `'settings.categories'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/inventory/CategoryList/CategoryList.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.categories.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CategoryList`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L44 permission check [inventory.manage]; L156 input (categories.showArchived); L159 button (categories.newCategory); L208 button (categories.edit); L211 button (categories.delete); L214 button (categories.moreSoon); L251 button (categories.cleaningUp).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/components/inventory/CategoryFormModal/CategoryFormModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.categories.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CategoryFormModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L45 Modal; L51 form (categories.formNameLabel); L53 TextInput (categories.formNameLabel); L62 TextareaInput (categories.formDescriptionLabel); L72 Button (categories.saveCategory); L75 Button (categories.saveCategory).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/inventory/DeleteCategoryModal/DeleteCategoryModal.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('settings.categories.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DeleteCategoryModal`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L24 Modal (categories.deleteTitle); L46 Button; L51 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `settings.categories.<step>.title` and `.body` for these steps: `breadcrumb`, `showArchived`, `add`, `table`, `row`, `rowEdit`, `rowDelete`, `formModal`, `formFields`, `formSave`, `deleteModal`, `archivedMarker`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `settings.categories.<step>.title` and `.body` for these steps in Albanian: `breadcrumb`, `showArchived`, `add`, `table`, `row`, `rowEdit`, `rowDelete`, `formModal`, `formFields`, `formSave`, `deleteModal`, `archivedMarker`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   10. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'settings.categories', route: 'settings/categories' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "settings.categories"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsCategories.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/inventory/CategoryList/CategoryList.tsx`.
   3. **PT-3 Annotate** about 13 sites in those files.
   4. **PT-4 Write the guide**: 14 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.categories.<id>.title|body`):
      - `breadcrumb` — breadcrumb
      - `showArchived` — show archived (try-it)
      - `add` — Add category (try-it: opens modal)
      - `table` — categories table
      - `row` — one category (repeat)
      - `rowEdit` — Edit (repeat, try-it)
      - `rowDelete` — Delete (repeat, destructive, try-it)
      - `formModal` — category dialog (group: form)
      - `formFields` — fields (group: form, try-it)
      - `formSave` — Save (group: form, explain-only)
      - `deleteModal` — delete dialog with options (group: delete, destructive)
      - `archivedMarker` — archived marker (repeat, state)
      - `empty` — none (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/categories` as page `settings.categories`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.categories`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty / archived-empty. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Show archived. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The per-row "more" button is `disabled` with a coming-soon title; it is excluded and listed in the exclusions table.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Asserts the disabled button carries no `data-tour`.
   - Regression: existing tests of `CategoryList.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/settingsCategories src/pages/inventory/CategoryList src/components/inventory
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "settings.categories"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 154.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Categories is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Per-row "more" button (`disabled`, "coming soon"): left unannotated and unexplained (section 3.4).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s52"></a>

### S52: Form submissions: complete tour

1. **Slice id and title:** S52. Form submissions: complete tour. Branch `support-slice-52-form-submissions-complete-tour`.
2. **Scope:** Submissions of one form. In scope: `back`, `formTitle`, `actions`, `table`, `row`, `rowView`, `overlay`, `overlayPrint`, `overlayClose`, `empty`, `error`. Out of scope: every other page (item 16).
3. **Purpose:** Read-only list with a detail overlay. It lets a first-time user learn Form submissions in the order they would use it, with the real controls highlighted and nothing operated for them.
   - **Description.** This slice delivers the complete guided tour of **Form submissions** (`/:tenantSlug/settings/client-management/forms/:formId/submissions`) and nothing else. A user who opens Support on this page can tour 11 steps in order, ask about any single control, and replay or leave. What the page is for: List submissions of a form and open one. What the tour walks through: Back / actions buttons; submissions table with View; detail overlay (`role="dialog"`) with close and print. What changes the tour at runtime: Needs `forms.manage`. Empty, error, detail overlay. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Form submissions** (`forms.submissions`; `/:tenantSlug/settings/client-management/forms/:formId/submissions`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S06 (Client form (create and edit): complete tour). Existing code it relies on, unchanged since planning: `pages/settings/FormSubmissionsPage.tsx`, `pages/settings/FormSubmissionsContent.tsx`.
6. **Production LOC estimate:** **~124** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 11 steps x 8 = 88 + 10 annotation sites x 2 = 20. Copy is JSON and not counted.
7. **File-Level Change Plan** (9 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/formsSubmissions.ts`
      - Change: Create the page guide with the 11 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'forms.submissions', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'forms.submissions.<id>', kind, safety, … }`. Steps in state-only elements: `empty`, `error`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `detail`.
      - Integration: Loaded lazily through `loaders['forms.submissions']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:forms.submissions.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/formsSubmissions.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/formsSubmissions.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'forms.submissions': () => import('./guides/formsSubmissions')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'forms.submissions'` on the entries for `settings/client-management/forms/:formId/submissions` and delete `'forms.submissions'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/FormSubmissionsContent.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.submissions.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FormSubmissionsContent`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L99 Button (submissions.backToForm); L110 Button; L120 role=alert (submissions.loading); L148 Button (submissions.view); L163 Button; L175 Button.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Leave unchanged** `src/pages/settings/FormSubmissionsPage.tsx`
      - Change: Page wrapper that mounts `AppLayout` and `Sidebar`; it needs no change because the launcher (P09) and host (P08) are already mounted by `AppLayout`/`TenantGuard`.
   7. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `forms.submissions.<step>.title` and `.body` for these steps: `back`, `formTitle`, `actions`, `table`, `row`, `rowView`, `overlay`, `overlayPrint`, `overlayClose`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   8. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `forms.submissions.<step>.title` and `.body` for these steps in Albanian: `back`, `formTitle`, `actions`, `table`, `row`, `rowView`, `overlay`, `overlayPrint`, `overlayClose`, `empty`, `error`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   9. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'forms.submissions', route: 'settings/client-management/forms/:formId/submissions' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)`; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "forms.submissions"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/formsSubmissions.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/FormSubmissionsContent.tsx`.
   3. **PT-3 Annotate** about 10 sites in those files.
   4. **PT-4 Write the guide**: 11 steps, in tour order (`<id>` becomes the copy key `supportSettings:forms.submissions.<id>.title|body`):
      - `back` — back to forms (explain-only: navigation)
      - `formTitle` — form name and count
      - `actions` — header buttons (read at slice start)
      - `table` — submissions table
      - `row` — one submission (repeat)
      - `rowView` — View (repeat, try-it: opens the overlay)
      - `overlay` — detail overlay (group: detail)
      - `overlayPrint` — Print (group: detail, try-it: opens a print view)
      - `overlayClose` — Close (group: detail, explain-only)
      - `empty` — no submissions (state)
      - `error` — error (state)
   5. **PT-5 Register** `/:tenantSlug/settings/client-management/forms/:formId/submissions` as page `forms.submissions`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `forms.submissions`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** None. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `forms.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Overlay. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New submissions from the public form appear as rows.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - 0/1/30 rows; overlay.
   - Regression: existing tests of `FormSubmissionsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/formsSubmissions src/pages/settings
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "forms.submissions"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 124.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Form submissions is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

<a id="s53"></a>

### S53: Form builder: complete tour

1. **Slice id and title:** S53. Form builder: complete tour. Branch `support-slice-53-form-builder-complete-tour`.
2. **Scope:** The builder has no `AppLayout`, so it needs its own Support entry, the host mount, and guidance for the title bar and status bar. Home (clipboard, font/format, editing) and Insert (pages, insert) tabs. Layout tab and the five contextual tabs (picture, field, text box, shape, section). Left rail, canvas surface and its interactions, Add menu, right-click menu. The right-hand properties panel.
3. **Purpose:** Establishes the builder context; later slices guide the ribbon, canvas and panels. Commands are selection-dependent; disabled ones are explained, not hidden. Contextual tabs exist only while an object is selected: the textbook runtime-appearance case. Drag, resize and snapping are described, not performed. Largest single component of the builder (562 lines); content depends on the selected object type.
   - **Description.** This slice delivers the complete guided tour of **Form builder** (`/:tenantSlug/settings/client-management/forms/:formId`) and nothing else. A user who opens Support on this page can tour 71 steps in order, ask about any single control, and replay or leave. What the page is for: Design a printable / fillable form on a page canvas: add sections and elements, format text, lay out, manage pages, edit properties, undo / redo, zoom, autosave. What the tour walks through: Title bar (back, name, undo, redo, save status), ribbon tabs Home / Insert / Layout plus contextual tabs (picture, field, text box, shape, section) with `RibbonButton`s, Page rail (add, go to, move, duplicate, delete), canvas with right-click context menu, Add menu, Properties panel, Status bar with zoom. What changes the tour at runtime: Needs `forms.manage`; contextual ribbon tabs exist only while an object is selected; many commands are disabled without a selection. **Not wrapped in `AppLayout`**: it has no header Help button. Empty page, selection-dependent commands, autosave states, history availability. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Form builder** (`forms.builder`; `/:tenantSlug/settings/client-management/forms/:formId`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour); S06 (Client form (create and edit): complete tour). Existing code it relies on, unchanged since planning: `pages/settings/FormBuilderPage.tsx`, `components/forms/canvas/FormBuilder.tsx`, `components/forms/canvas/ribbon/*`, `components/forms/canvas/PageRail.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~783** (under the band (600 to 799)): 16 guide module, loader line, route-map flip + 71 steps x 8 = 568 + 64 annotation sites x 2 = 128 + `SupportHost` mount in `FormBuilderPage` and a Help `RibbonButton`/title-bar button calling the store (the builder is full-screen, outside `AppLayout`) 25 + `RibbonButton tourId` prop and group annotations 12 + Annotations in `PageRail`, `AddMenu`, `FormCanvas`, `CanvasSection`, `CanvasElement` 18 + Annotations in `PropertiesPanel` (562 lines) 16. Copy is JSON and not counted.
7. **File-Level Change Plan** (24 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/formsBuilder.ts`
      - Change: Create the page guide with the 71 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'forms.builder', version: 1, namespace: 'supportSettings', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'forms.builder.<id>', kind, safety, … }`. Steps in state-only elements: `saveStatus`, `disabledWhy`, `contextualTab`, `editLabel`, `formatPane`, `alignGroup`, `distribute`, `arrange`, `emptyPage`, `noSelection`, `size`, `text`, `fieldKey`, `required`, `options`, `style`, `image`, `sectionProps`, `validation`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): `add`, `context`.
      - Integration: Loaded lazily through `loaders['forms.builder']` in `pageRegistry.ts`; copy keys resolve to `supportSettings:forms.builder.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/formsBuilder.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/formsBuilder.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'forms.builder': () => import('./guides/formsBuilder')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'forms.builder'` on the entries for `settings/client-management/forms/:formId` and delete `'forms.builder'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/settings/FormBuilderPage.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FormBuilderPage`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/components/forms/canvas/ribbon/TitleBar.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `TitleBar`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L117 button (formBuilder.back); L122 DropdownMenu (formBuilder.file); L125 button (formBuilder.file); L139 aria-label (formBuilder.ribbon.undoGroup); L140 button (formBuilder.undo); L144 aria-label (formBuilder.undo); L149 button (formBuilder.redo); L153 aria-label (formBuilder.redo); L178 Button; L188 Button.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/components/forms/canvas/ribbon/StatusBar.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `StatusBar`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L109 button (formBuilder.retry); L128 button (formBuilder.zoomOut); L132 aria-label (formBuilder.zoomOut); L137 DropdownMenu; L141 button (formBuilder.zoomLevel); L144 aria-label (formBuilder.zoomLevel); L151 button (formBuilder.zoomIn); L155 aria-label (formBuilder.zoomIn).
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/components/forms/canvas/ribbon/HomeTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `HomeTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/components/forms/canvas/ribbon/InsertTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `InsertTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/components/forms/canvas/ribbon/RibbonButton.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RibbonButton`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L45 button.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Modify** `src/components/forms/registry/FormattingToolbar.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FormattingToolbar`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L97 aria-label (formattingToolbar.label); L103 select (formattingToolbar.paragraphStyle); L115 select (formattingToolbar.fontFamily); L127 select (formattingToolbar.fontSize); L188 input; L197 input; L204 select (formattingToolbar.lineHeight); L239 button.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/forms/registry/FormattingToolbar.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   12. **Modify** `src/components/forms/canvas/ribbon/LayoutTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `LayoutTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   13. **Modify** `src/components/forms/canvas/ribbon/ContextualTab.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContextualTab`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   14. **Modify** `src/components/forms/canvas/PageRail.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PageRail`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L43 aria-label (pageRail.label); L46 button (pageRail.addPage); L54 button (pageRail.goToPage); L59 aria-label (pageRail.goToPage); L80 button (pageRail.movePageUp); L84 aria-label (pageRail.movePageUp); L89 button (pageRail.movePageDown); L93 aria-label (pageRail.movePageDown); L98 button (pageRail.duplicatePage); L101 aria-label (pageRail.duplicatePage); L106 button (pageRail.deletePage); L110 aria-label (pageRail.deletePage); L121 button (pageRail.removeEmptyPages).
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   15. **Modify** `src/components/forms/canvas/AddMenu.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `AddMenu`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L65 button (addMenu.addItem); L69 aria-label (addMenu.addItem); L82 button (addMenu.addItem); L87 aria-label (addMenu.addItem); L110 input; L116 aria-label (addMenu.uploadImage); L120 role=alert.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   16. **Modify** `src/components/forms/canvas/FormCanvas.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `FormCanvas`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   17. **Modify** `src/components/forms/canvas/CanvasSection.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CanvasSection`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L132 input (formBuilder.sectionTitle); L137 aria-label (formBuilder.sectionTitle); L153 button (formBuilder.removeSection); L156 aria-label (formBuilder.removeSection).
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   18. **Modify** `src/components/forms/canvas/CanvasElement.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `CanvasElement`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L147 input; L155 aria-label (formBuilder.label); L162 button (formBuilder.removeItem); L165 aria-label (formBuilder.removeItem).
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   19. **Modify** `src/components/ui/ContextMenu/ContextMenu.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ContextMenu`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L159 button.
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: Extend the existing `src/components/ui/ContextMenu/ContextMenu.test.tsx` with an assertion that the annotated ids are present for the empty and the populated render.
   20. **Modify** `src/components/forms/canvas/PropertiesPanel.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('forms.builder.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PropertiesPanel`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L100 TextInput (formBuilder.sectionTitle); L175 TextInput (formBuilder.label); L182 SelectInput (formBuilder.fieldType); L208 SelectInput (formBuilder.control); L245 SelectInput (formBuilder.optionColumns); L268 SelectInput (formBuilder.fieldLayout); L290 SelectInput (formBuilder.density); L308 TextInput (formBuilder.placeholder); L316 input (formBuilder.required); L338 TextInput (formBuilder.dataKey); L362 button (formBuilder.editOnPage); L370 TextInput (formBuilder.imageAlt); L387 SelectInput (formBuilder.dividerOrientation); L474 button (formBuilder.closePane); L524 TextInput (formBuilder.width); L530 TextInput (formBuilder.height); L543 TextInput (formBuilder.horizontal); L549 TextInput (formBuilder.vertical).
      - Integration: The component is rendered by `FormBuilder`, which has its own chrome and no `AppLayout`; it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   21. **Leave unchanged** `src/components/forms/canvas/keyboard.ts`
      - Change: Read only, to find the labels, data shapes and conditions the steps depend on. Do not edit.
   22. **Modify** `src/locales/en/supportSettings.json`
      - Change: Add `forms.builder.<step>.title` and `.body` for these steps: `supportEntry`, `back`, `formName`, `saveStatus`, `saveNow`, `undo`, `redo`, `ribbonTabs`, `statusBar`, `zoomOut`, `zoomLevel`, `zoomIn`, `shortcuts`, `tabHome`, `paste`, `cut`, `copy`, `duplicate`, `formatting`, `selectAll`, `tabInsert`, `blankPage`, `insertItem`, `disabledWhy`, `tabLayout`, `pageGroup`, `duplicatePage`, `movePageUp`, `movePageDown`, `deletePage`, `removeEmptyPages`, `viewGroup`, `navigationPane`, `contextualTab`, `editLabel`, `formatPane`, `alignGroup`, `distribute`, `arrange`, `rail`, `railAdd`, `railPage`, `railMove`, `railDuplicate`, `railDelete`, `canvas`, `section`, `element`, `selectionHandles`, `drag`, `inlineEdit`, `addMenu`, `addSection`, `addComponent`, `addImage`, `contextMenu`, `contextItems`, `emptyPage`, `panel`, `noSelection`, `tabs`, `size`, `text`, `fieldKey`, `required`, `options`, `style`, `image`, `sectionProps`, `validation`, `binding`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   23. **Modify** `src/locales/sq/supportSettings.json`
      - Change: Add `forms.builder.<step>.title` and `.body` for these steps in Albanian: `supportEntry`, `back`, `formName`, `saveStatus`, `saveNow`, `undo`, `redo`, `ribbonTabs`, `statusBar`, `zoomOut`, `zoomLevel`, `zoomIn`, `shortcuts`, `tabHome`, `paste`, `cut`, `copy`, `duplicate`, `formatting`, `selectAll`, `tabInsert`, `blankPage`, `insertItem`, `disabledWhy`, `tabLayout`, `pageGroup`, `duplicatePage`, `movePageUp`, `movePageDown`, `deletePage`, `removeEmptyPages`, `viewGroup`, `navigationPane`, `contextualTab`, `editLabel`, `formatPane`, `alignGroup`, `distribute`, `arrange`, `rail`, `railAdd`, `railPage`, `railMove`, `railDuplicate`, `railDelete`, `canvas`, `section`, `element`, `selectionHandles`, `drag`, `inlineEdit`, `addMenu`, `addSection`, `addComponent`, `addImage`, `contextMenu`, `contextItems`, `emptyPage`, `panel`, `noSelection`, `tabs`, `size`, `text`, `fieldKey`, `required`, `options`, `style`, `image`, `sectionProps`, `validation`, `binding`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportSettings')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   24. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'forms.builder', route: 'settings/client-management/forms/:formId' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "forms.builder"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/formsBuilder.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/FormBuilderPage.tsx`, `src/components/forms/canvas/ribbon/TitleBar.tsx`, `src/components/forms/canvas/ribbon/StatusBar.tsx`, `src/components/forms/canvas/ribbon/HomeTab.tsx`, `src/components/forms/canvas/ribbon/InsertTab.tsx`.
   3. **PT-3 Annotate** about 64 sites in those files. Includes: `SupportHost` mount in `FormBuilderPage` and a Help `RibbonButton`/title-bar button calling the store (the builder is full-screen, outside `AppLayout`); `RibbonButton tourId` prop and group annotations; Annotations in `PageRail`, `AddMenu`, `FormCanvas`, `CanvasSection`, `CanvasElement`; Annotations in `PropertiesPanel` (562 lines).
   4. **PT-4 Write the guide**: 71 steps, in tour order (`<id>` becomes the copy key `supportSettings:forms.builder.<id>.title|body`):
      - `supportEntry` — the new Help button in the title bar (explain-only)
      - `back` — back to forms (explain-only: navigation)
      - `formName` — form name field (try-it)
      - `saveStatus` — autosave status (state)
      - `saveNow` — Save (explain-only)
      - `undo` — Undo (disabledHint when history is empty, explain-only)
      - `redo` — Redo (disabledHint, explain-only)
      - `ribbonTabs` — ribbon tab list (try-it)
      - `statusBar` — status bar region
      - `zoomOut` — Zoom out (try-it: view only)
      - `zoomLevel` — zoom level (try-it)
      - `zoomIn` — Zoom in (try-it)
      - `shortcuts` — keyboard shortcuts overview (info, from `keyboard.ts`)
      - `tabHome` — Home tab (try-it)
      - `paste` — Paste (disabled when the clipboard is empty)
      - `cut` — Cut (disabled without selection)
      - `copy` — Copy (disabled without selection)
      - `duplicate` — Duplicate (disabled without selection)
      - `formatting` — text formatting toolbar (repeat buttons; disabled without a text editor)
      - `selectAll` — Select all (try-it)
      - `tabInsert` — Insert tab (try-it)
      - `blankPage` — Blank page (explain-only: changes the document)
      - `insertItem` — an insert command (repeat)
      - `disabledWhy` — why commands are greyed (state)
      - `tabLayout` — Layout tab (try-it)
      - `pageGroup` — pages group
      - `duplicatePage` — Duplicate page (explain-only)
      - `movePageUp` — Move page up (explain-only)
      - `movePageDown` — Move page down (explain-only)
      - `deletePage` — Delete page (destructive, explain-only)
      - `removeEmptyPages` — Remove empty pages (explain-only)
      - `viewGroup` — view group
      - `navigationPane` — Navigation pane toggle (try-it)
      - `contextualTab` — a contextual tab appears while something is selected (state)
      - `editLabel` — Edit label / Edit on page (state: contextual)
      - `formatPane` — Format pane (state: contextual, try-it)
      - `alignGroup` — align buttons (state: contextual, repeat)
      - `distribute` — distribute horizontally / vertically (state: contextual)
      - `arrange` — duplicate / delete object (state: contextual, delete destructive)
      - `rail` — page rail region
      - `railAdd` — Add page (explain-only)
      - `railPage` — one page thumbnail: go to page (repeat, try-it)
      - `railMove` — Move up / down (repeat, explain-only)
      - `railDuplicate` — Duplicate (repeat, explain-only)
      - `railDelete` — Delete (repeat, destructive, explain-only)
      - `canvas` — page canvas
      - `section` — a section (repeat)
      - `element` — an element (repeat)
      - `selectionHandles` — resize handles (info)
      - `drag` — drag to move, snapping guides (info; the tour never drags)
      - `inlineEdit` — double click to edit text (info)
      - `addMenu` — Add menu (try-it: opens menu)
      - `addSection` — Section (group: add, explain-only)
      - `addComponent` — a component type (group: add, repeat, explain-only)
      - `addImage` — Upload image (group: add, explain-only)
      - `contextMenu` — right-click menu (info: opened by the user)
      - `contextItems` — its items (group: context, repeat, explain-only)
      - `emptyPage` — empty page hint (state)
      - `panel` — properties panel region
      - `noSelection` — nothing selected hint (state)
      - `tabs` — panel sections (if present, explain-only)
      - `size` — size and position fields (state: selection, explain-only)
      - `text` — text properties (state: text element, explain-only)
      - `fieldKey` — field key / client field binding (state: field element, explain-only)
      - `required` — required toggle (state: field element, explain-only)
      - `options` — options list (state: select field, repeat)
      - `style` — fill / border (state: shape, explain-only)
      - `image` — image source (state: picture, explain-only)
      - `sectionProps` — section properties (state: section, explain-only)
      - `validation` — validation messages (state)
      - `binding` — which client attribute a field maps to (info)
   5. **PT-5 Register** `/:tenantSlug/settings/client-management/forms/:formId` as page `forms.builder`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `forms.builder`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** A new empty document. Nothing selected. No selection: contextual steps are absent. Empty page. No selection.
   - **Loading / skeleton (L):** Document loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Sections and elements repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Autosave failure state. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `forms.manage`. Selection-dependent enabled state. Which contextual tab exists depends on selection type. Selection dependent. Content differs by type.
   - **Dialogs, drawers, menus, nested workflows (D):** None. Menus are hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (P13).
   - **Validation and submission (V):** Field-level validation. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Ribbon tabs. Two tabs. Permanent and contextual tabs. Sections.
   - **Destructive or irreversible actions (explain-only) (K):** Delete page and delete object warned. Delete page warned.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Undo / Redo enabled state follows history; the disabled hint appears only while disabled.
   - Zoom steps are view-only try-its.
   - As the user selects an element the commands enable; the step list does not change but the disabled hint disappears.
   - Selecting an element by the user creates the contextual tab; the tour offers it as a hand-off ("select a field to see its tab").
   - Page count changes with the document; rail pages are repeated.
   - Zoom changes geometry; spotlight follows because it reads live rects.
   - Panel content changes with selection; each step is eligible only when its block is rendered.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 12 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Entry point present in the builder; host mounted; zoom changes view only.
   - Commands with and without selection; clipboard state.
   - Each contextual kind via a selected fixture element.
   - 0 / 1 / 5 pages; menus; no document mutation.
   - One fixture per element type.
   - Regression: existing tests of `FormBuilderPage.tsx`, `TitleBar.tsx`, `StatusBar.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - The builder has a working Support entry (it had none).
   - No document edit while touring (document JSON unchanged).
   - Page and object deletion never executed.
   - No pointer drag dispatched (asserted).
   - The builder autosaves any document change (`useAutosave`), so every editing control in the builder is explain-only (decision R9); the document JSON and the network log are unchanged after a full tour (asserted).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/formsBuilder src/pages/settings src/components/forms/canvas/ribbon src/components/forms/canvas src/components/forms/registry
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "forms.builder"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 783.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Form builder is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

## Page tours: dashboards, reports, inventory, notifications

<a id="s54"></a>

### S54: Dashboard: Sales User: complete tour

1. **Slice id and title:** S54. Dashboard: Sales User: complete tour. Branch `support-slice-54-dashboard-sales-user-complete-tour`.
2. **Scope:** The shared `RoleDashboardFrame` (period, location, refresh, tiles, chart / table, empty and error) as seen by a Sales User, and the context hook that tells Support which dashboard variant is showing.
3. **Purpose:** The four role dashboards share one frame. This slice guides it once; later dashboard slices only add their own panels. It also adds the variant publication that `DashboardLanding` needs (SUP-01).
   - **Description.** This slice delivers the complete guided tour of **Dashboard: Sales User** (`/:tenantSlug/dashboard (role = SALES_USER)`) and nothing else. A user who opens Support on this page can tour 16 steps in order, ask about any single control, and replay or leave. What the page is for: Read my leads, deals, follow-ups, offers and sales; change period and place; open the list behind a figure. What the tour walks through: Period select + custom dates; Area, City selects; "Calculated at" + Refresh; KPI tiles (links); pipeline chart with chart / table toggle. What changes the tour at runtime: Figures the user may not see are simply absent (server-side); this is the **shared frame** of the four role dashboards. Empty state, `role="alert"` failure, `aria-busy` tiles. The tour never operates the page: it highlights, explains and waits for the user; every control that changes data is explain-only. When the slice is done the page appears in the Support panel with its tour, its control list and its replay state, and every step has English and Albanian copy.
4. **Page association:** one page only: **Dashboard: Sales User** (`dashboard.salesUser`; `/:tenantSlug/dashboard (role = SALES_USER)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S04 (Foundation 4: nested layers, read-only enforcement and Explain a control); S05 (Clients list: complete tour). Existing code it relies on, unchanged since planning: `pages/dashboard/SalesUserDashboard.tsx`, `pages/dashboard/RoleDashboardFrame.tsx`, `pages/dashboard/PeriodSelector.tsx`, `pages/dashboard/RefreshBar.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~190** (**below 600: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28 + `useSupportContext({ variant })` calls in `DashboardLanding` (and the fallback variants) so `dashboard.<variant>` is resolved 12 + `RoleDashboardFrame` props `showPeriod`/`showLocation` reflected as step eligibility 6. Copy is JSON and not counted.
7. **File-Level Change Plan** (15 files; paths relative to `frontend/`; symbols marked (new) are proposed, all others exist today):
   1. **Create** `src/lib/support/guides/dashboardSalesUser.ts`
      - Change: Create the page guide with the 16 steps listed in item 8, in tour order. Export default `definePageGuide({ pageId: 'dashboard.salesUser', version: 1, namespace: 'supportOps', steps })`.
      - Implementation details: Imports `definePageGuide` (P11). Each step: `{ id, target: 'dashboard.salesUser.<id>', kind, safety, … }`. Steps in state-only elements: `customDates`, `empty`, `loading`. Eligibility (`requires`): none beyond page access. Hand-offs (`opens`/`group`): none.
      - Integration: Loaded lazily through `loaders['dashboard.salesUser']` in `pageRegistry.ts`; copy keys resolve to `supportOps:dashboard.salesUser.<id>`; the host (P08) runs it; P15/P16 list its steps as explainable controls.
      - Removal: No removal: new or additive.
      - Verification: `src/lib/support/guides/dashboardSalesUser.test.tsx` (ST-1 to ST-5) and the page's Playwright row.
   2. **Create** `src/lib/support/guides/dashboardSalesUser.test.tsx`
      - Change: Create the guide test first: `assertGuideIntegrity`, per-state resolution against the rendered page, change-during-tour, eligibility, read-only spies, and the slice-specific cases of item 11.
      - Implementation details: Renders the real content component(s) with msw handlers from `src/mocks`, an auth user with a given `permissions` map, and the Support host (`renderWithSupport`, P08).
      - Integration: Uses the same providers as the existing page tests.
      - Removal: None.
      - Verification: It is the verification for this slice.
   3. **Modify** `src/lib/support/pageRegistry.ts`
      - Change: Add the loader entry `'dashboard.salesUser': () => import('./guides/dashboardSalesUser')` to the `loaders` record.
      - Implementation details: `loaders`
      - Integration: Makes `hasGuide` true for the page in `useSupportPage`.
      - Removal: No removal.
      - Verification: Route-map guard test (P03) requires a loader for every mapped page.
   4. **Modify** `src/lib/support/routeMap.ts`
      - Change: Set `pageId: 'dashboard.salesUser'` on the entries for `dashboard` and delete `'dashboard.salesUser'` from `PLANNED_PAGES`.
      - Implementation details: `ROUTE_MAP`, `PLANNED_PAGES`
      - Integration: The patterns must equal the `path` strings in `src/routes/index.tsx`.
      - Removal: Remove only the id from `PLANNED_PAGES`: safe because the guard test now requires the loader instead.
      - Verification: `routeMap.test.ts`.
   5. **Modify** `src/pages/dashboard/SalesUserDashboard.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `SalesUserDashboard`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   6. **Modify** `src/pages/dashboard/RoleDashboardFrame.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RoleDashboardFrame`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L69 SelectInput (role.area); L77 SelectInput (role.city); L90 role=alert (role.loadFailed); L101 KpiTile (role.pipelineChart).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   7. **Modify** `src/pages/dashboard/PeriodSelector.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `PeriodSelector`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L22 SelectInput (role.period); L31 TextInput (role.from); L32 TextInput (role.to).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   8. **Modify** `src/pages/dashboard/RefreshBar.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `RefreshBar`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L21 Button (role.refresh).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   9. **Modify** `src/pages/dashboard/KpiTile.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `KpiTile`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L37 Link (role.openList).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   10. **Modify** `src/pages/dashboard/ChartWithTable.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `ChartWithTable`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L29 aria-label (role.view); L31 button (role.${choice}).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   11. **Modify** `src/pages/dashboard/EmptyState.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `EmptyState`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): L10 role=status (role.emptyTitle).
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   12. **Modify** `src/pages/dashboard/DashboardLanding.tsx`
      - Change: Annotate the elements that implement the steps of this slice with `tourProps('dashboard.salesUser.<step>')` (plain elements, `Button`, `TextInput`, `SelectInput` spread it) or the `tourId` prop (`DataTable`, `Tabs`, `Pagination`, `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu` items, field containers). Mark repeated structures with `repeat`. Do not add wrappers, change handlers or touch styling.
      - Implementation details: Exports: `DashboardLanding`. Locate each step's element by its i18n key or `aria-label`; current anchors in this file (line numbers may drift, search by key): none found: read the file.
      - Integration: The component is rendered inside `AppLayout` by its page wrapper (see section 3); it keeps its own state, services and permission checks untouched, and the tour only reads the resulting DOM.
      - Removal: No removal: attribute-only change.
      - Verification: No test file exists next to it: cover it in the guide test (do not create a new component test unless a regression appears).
   13. **Modify** `src/locales/en/supportOps.json`
      - Change: Add `dashboard.salesUser.<step>.title` and `.body` for these steps: `title`, `refresh`, `calculatedAt`, `period`, `customDates`, `area`, `city`, `tiles`, `tile`, `tilePeriod`, `chart`, `chartToggle`, `chartTable`, `empty`, `error`, `loading`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   14. **Modify** `src/locales/sq/supportOps.json`
      - Change: Add `dashboard.salesUser.<step>.title` and `.body` for these steps in Albanian: `title`, `refresh`, `calculatedAt`, `period`, `customDates`, `area`, `city`, `tiles`, `tile`, `tilePeriod`, `chart`, `chartToggle`, `chartTable`, `empty`, `error`, `loading`. Add `.when`, `.warning`, `.disabled` for steps that need them (warning steps, steps with a disabled hint).
      - Implementation details: Flat nested JSON like the other namespaces (`pageId` object containing step objects).
      - Integration: Loaded by `loadSupportCopy('supportOps')` (P04); not statically imported.
      - Removal: No removal.
      - Verification: `npm run check:translations` and `assertGuideIntegrity` key check.
   15. **Modify** `tests/e2e/support.spec.ts`
      - Change: Add the table entry `{ page: 'dashboard.salesUser', route: 'dashboard' }`: open the route, open Support, start the tour, press Next to the end, assert no console error, no navigation, and `expectNoMutations(page)` with the read-only POST endpoints of this page in the allow-list; repeat at 360 px.
      - Implementation details: The spec created in P09; helper from `tests/e2e/support/noMutations.ts` (P14).
      - Integration: Runs in the `support` Playwright project.
      - Removal: No removal.
      - Verification: `npx playwright test --project=support --grep "dashboard.salesUser"`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dashboardSalesUser.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: read in context during planning; re-read to catch drift): `src/pages/dashboard/SalesUserDashboard.tsx`, `src/pages/dashboard/RoleDashboardFrame.tsx`, `src/pages/dashboard/PeriodSelector.tsx`, `src/pages/dashboard/RefreshBar.tsx`, `src/pages/dashboard/KpiTile.tsx`.
   3. **PT-3 Annotate** about 14 sites in those files. Includes: `useSupportContext({ variant })` calls in `DashboardLanding` (and the fallback variants) so `dashboard.<variant>` is resolved; `RoleDashboardFrame` props `showPeriod`/`showLocation` reflected as step eligibility.
   4. **PT-4 Write the guide**: 16 steps, in tour order (`<id>` becomes the copy key `supportOps:dashboard.salesUser.<id>.title|body`):
      - `title` — dashboard title and subtitle
      - `refresh` — "Calculated at" and Refresh (try-it: recalculates, read-only)
      - `calculatedAt` — when the figures were calculated; they are worked out on open, not stored (info)
      - `period` — period select (try-it)
      - `customDates` — from / to inputs, only for the custom period (state)
      - `area` — area filter (try-it)
      - `city` — city filter, depends on the area (try-it)
      - `tiles` — the figure tiles (info)
      - `tile` — one figure tile (repeat; the link opens the list behind the figure, explain-only: navigation)
      - `tilePeriod` — whether a tile follows the period (repeat, info)
      - `chart` — pipeline chart (info, text alternative)
      - `chartToggle` — chart / table toggle (`aria-pressed`, try-it)
      - `chartTable` — table view (repeat rows)
      - `empty` — empty dashboard (state)
      - `error` — load failed (`role="alert"`, state)
      - `loading` — `aria-busy` tiles (state)
   5. **PT-5 Register** `/:tenantSlug/dashboard (role = SALES_USER)` as page `dashboard.salesUser`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `dashboard.salesUser`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty dashboard explained. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Tiles busy. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Tiles repeat; a figure the user may not see is simply absent, so the tile list differs per user and role.
   - **Search / filtered results (F):** Period, area, city. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Figures per permission; period selector absent on some dashboards (Administrator).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Different tiles for different users: the exemplar rule applies and the copy says "each tile".
   - Refresh re-renders tiles; the highlighted tile is re-picked.
   - Targets are resolved in the live DOM when needed and on each settled change (P02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Variant publication: Support resolves `dashboard.salesUser` only after the role resolves, and shows no guide while `kind === null`; empty vs populated; hidden figure.
   - Regression: existing tests of `SalesUserDashboard.tsx`, `RoleDashboardFrame.tsx`, `PeriodSelector.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Support on /dashboard offers the right guide for each of the four roles (verified in later slices).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dashboardSalesUser src/pages/dashboard
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "dashboard.salesUser"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 190.
15. **Dependencies and handoff:** unblocks S55, S56, S57. After this slice **Dashboard: Sales User is complete**: every applicable state in 7.3 is covered.
16. **Intentionally excluded from this slice:**
   - Any other page. Shared components reused from other pages are only referenced here, not re-annotated (see item 5 and section 5.3).
   - Any behavioural change, refactor, new wrapper element, style change or fix of a defect found in the page; defects are reported, not fixed here.
   - Any backend, schema, route-table or dependency change.

