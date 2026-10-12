# Wellness Albania Platform: Interactive Support and Tour System Implementation Plan (slice-based)

| Item | Value |
|---|---|
| Status | **Plan only.** Nothing in this document has been implemented, run or tested. No application source, schema, configuration, dependency or test was changed to produce it. |
| Source | The task brief "Prepare a Slice-Based Implementation Plan for the Interactive Support & Tour System", read against the repository at branch `m-end-offer-letter` (HEAD `3913138b`), `docs/milestone-4-implementation-plan.md`, `.agentrules`, `task.md` and `.github/workflows/ci.yml` |
| Scope | One phase: a reusable, context-aware, page-by-page interactive support and guided-tour system for the whole authenticated application (tenant workspace and platform console) |
| Builds on | The current frontend (`frontend/`, React 19, React Router 7, zustand, i18next, CSS Modules). Backend untouched. |
| Approach | Vertical slices, one branch (`support-slice-N-<name>`) and one PR per slice, tests first. At the end of each slice something works that a person can see or that a test proves. |
| Slices | **95** (16 infrastructure-only, 79 page-tour slices covering 64 application pages) |
| Production LOC | About 19,302 lines across the phase; per-slice estimates in section 6 |
| Date | 12.10.2026 |

---

## 0. How to read this plan

The task asks for ten sections. The repository's own planning document (`docs/milestone-4-implementation-plan.md`) uses a different, narrative order. This plan keeps the repository's *conventions* (vertical slices, tests first, "Depends on", "Done when", cross-cutting rules, decisions to confirm, traceability) and the task's *required contents*. Where they overlap, the repository wording is kept.

| Task section | Where it is here |
|---|---|
| 5.1 Overview and objectives | Section 1 |
| 5.2 Repository findings and architecture | Section 2 |
| 5.3 Page and control inventory | Section 3 |
| 5.4 Proposed architecture and design | Section 4 |
| 5.5 Phase-level dependency overview | Section 5 |
| 5.6 Detailed slice specifications | Section 6 |
| 5.7 Page coverage and traceability matrix | Section 7 |
| 5.8 Testing and verification strategy | Section 8 |
| 5.9 Risks, assumptions, unresolved decisions | Section 9 |
| 5.10 Final completeness checklist | Section 10 |

Conventions used throughout:

- Evidence levels for the page inventory: **Read in context** (render code read during planning), **Extracted** (control, label and permission lines extracted and cross-checked, conditions not read in context) and **Profiled** (size and counts only). The repository findings in section 2 were read directly. **Proposed** means a design decision of this plan. Every page slice starts by re-inventorying its files whatever the level.
- Slice ids are `S01`..`S95` in implementation order. A slice only depends on lower ids (verified mechanically when this document was generated, by a throwaway script that is not part of the repository).
- State codes in the inventory and matrices: **E** empty, **L** loading, **P** populated or repeated rows, **F** search or filtered results, **G** pagination or sorting, **X** error and retry, **A** permission- or workflow-dependent controls, **D** dialogs, drawers, menus and nested workflows, **V** validation and submission, **T** tabs or sections, **K** destructive or irreversible actions.
- Control-category codes: **C1** buttons, **C2** icon-only buttons, **C3** navigation and breadcrumbs, **C4** search and filters, **C5** tabs and segmented controls, **C6** dropdowns and action menus, **C7** form fields, validation and submit, **C8** tables, cards, pagination and sorting, **C9** create, view, edit, duplicate, archive and delete actions, **C10** dialogs, drawers and confirmation prompts, **C11** toolbars and bulk operations, **C12** settings and permission-dependent controls, **C13** empty-state actions.

### 0.1 Methodology conventions inherited from the repository

| Convention | Source | How this plan applies it |
|---|---|---|
| Vertical slices, one branch and one PR per slice, tests first, "something works at the end of each slice" | `docs/milestone-4-implementation-plan.md` section 1 | Same. Branch `support-slice-N-<name>`. |
| TDD is mandatory: failing test, run it, see it fail for the expected reason, minimal implementation, refactor | `.agentrules` ("Development Workflow") | Every slice's first task is the red test. Section 8. |
| Requirement ID in the test title | M4 plan, cross-cutting rule 1 | Internal ids `SUP-01`..`SUP-20` (below) go in test titles. |
| Translations in `sq` and `en`, `npm run check:translations` passes | M4 plan rule 8; `frontend/scripts/check-translations.mjs` | Every slice that adds copy. Greek and Italian may lag and fall back to English, as the script allows. |
| 360 px screens added to `mobile360.spec.ts` | M4 plan rule 8 | S09 adds the Support panel; every page slice adds its page to the Support end-to-end table. |
| Route coverage guard test that reads the router | `frontend/src/routes/mobile360Coverage.test.ts` | S03 copies the pattern for Support. |
| Business rules in the domain, controllers thin | `.agentrules` (backend) | Not applicable: this phase is frontend only. The Support module likewise keeps its rules in pure modules (`tourMachine`, `stepEligibility`) and keeps components thin. |
| `docs/` is not versioned | `.gitignore` (`/docs/`, "Client documents (kept locally, not versioned)") | This plan, like the M4 plan, lives in `docs/` and is not tracked by git. |

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

### 0.3 Internal requirement ids

| Id | Requirement |
|---|---|
| SUP-01 | Context-aware Support entry point (page detected, relevant help offered) |
| SUP-02 | Page-specific guided tour explaining the real interface |
| SUP-03 | Next, Back, Skip, Exit, step progress, completion state, normal use resumes |
| SUP-04 | Explain a single control without running the whole tour |
| SUP-05 | Coverage of every discovered, functional, user-facing control |
| SUP-06 | Runtime synchronisation with the live DOM (appear, disappear, move, replace, disable) |
| SUP-07 | Reusable guidance for repeated data-driven structures (no per-record steps) |
| SUP-08 | Safe handling of missing, stale, duplicate and disabled targets |
| SUP-09 | Respect for permissions, scopes and workflow-dependent UI |
| SUP-10 | Nested layers: dialogs, drawers, dropdowns, tabs |
| SUP-11 | Explicit behaviour for empty, loading, error and conditional states |
| SUP-12 | Safety: the tour never performs or triggers a data-changing operation |
| SUP-13 | Keyboard operation and focus management |
| SUP-14 | Screen-reader labelling and announcements |
| SUP-15 | Responsive behaviour (360 px to desktop), off-screen targets |
| SUP-16 | Reduced-motion and forced-colours support |
| SUP-17 | Progress persistence, resume and replay |
| SUP-18 | Translations (sq and en required, el and it follow) and language switching |
| SUP-19 | No cost for users who never open Support (lazy loading, bundle size) |
| SUP-20 | Traceability: every route is mapped to a guide or an explicit exclusion |

---

## 1. Overview and objectives

### 1.1 The feature

A **Support** entry point on every authenticated page that knows which page and tab the user is on, and offers help for *that* page: a guided tour that highlights the real controls on the real interface, a way to ask about one control without taking the tour, and a way to replay or leave. The tour reads the live page, so it is correct for an empty workspace and for a workspace with two hundred records, for an Administrator and for Reception, on a phone and on a desktop.

### 1.2 Intended users

Everyone who signs in: the Wellness Albania Administrator, CEO, Sales Manager, Sales User and Reception roles (permission-driven, not role-driven: see `usePermission`), tenant owners and staff in the legacy workflow, and the platform Super Admin in the `/admin` console. Because menus and actions differ by permission and by `tenantSalesWorkflow`, help must differ the same way.

### 1.3 Expected behaviour (what "done" looks like)

1. The Support button in the header and the Support item in the sidebar open a panel titled for the current page (or tab).
2. **Tour this page** highlights each relevant control in turn, with a short explanation, "when to use it", warnings for destructive actions, Next, Back, Skip tour, Exit, "Step n of N", and a completion card.
3. **Explain a control** lists only the controls that exist on screen now, or lets the user point at one, and explains it in a single card.
4. Steps follow the data: empty state, first row, filtered-empty, error and loaded states are each explained only when they are what the user sees; twenty records never mean twenty steps.
5. A tour **never changes data**. It does not click, submit, drag, upload or delete for the user, and while it runs the explained controls cannot be activated.
6. It is usable by keyboard and screen reader, works from 360 px up, respects reduced motion, and costs nothing to people who never open Support.

### 1.4 Scope

In scope: shared tour infrastructure (S01 to S16); guided help for the **64 application pages** in section 3, including all tabs, dialogs, drawers and menus reachable from them. Out of scope: public customer pages, pre-login pages, print layouts, status pages (section 3.3); any backend change; analytics; auto-start; video or screenshot tutorials; third-party tour libraries.

### 1.5 What exists today versus what is planned

| Exists today (confirmed) | Planned by this phase |
|---|---|
| A header help button (`AppLayout.tsx`) with an `aria-label` and **no `onClick`** | A working launcher (S09) |
| A sidebar "Support" item (`Sidebar.tsx`) with `href="#support"` and `preventDefault` | The same launcher (S09) |
| `Tooltip` (hover/focus text), `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu`, `Tabs`, `DataTable` | Optional `tourId` props on them (S10); no behaviour change |
| Per-user conveniences in `localStorage` (theme), a persistent host mounted in `TenantGuard` (sales script panel) | The same two patterns for progress and for the Support host |
| No tour, onboarding or walkthrough code; no tour library in `package.json` | The whole phase |

### 1.6 Success criteria

| # | Criterion | Proven by |
|---|---|---|
| SC1 | Every route in the router is either mapped to a guide or excluded with a reason, and CI fails when a new route is neither | S03 route guard; S95 turns the last placeholder into a hard test |
| SC2 | Every one of the 64 pages offers a tour that reaches its last step in a seeded workspace with zero data-changing requests | Per-page Playwright case + `expectNoMutations` (S14) |
| SC3 | A page with 1 record and a page with 200 records yield the same step ids | Per-page dynamic test; inventory list slice has the explicit 20-product case |
| SC4 | Removing, disabling, replacing or adding a target while a tour runs never strands or misleads the user | S02, S08 integration tests |
| SC5 | A user without a permission never sees a step for that permission | S04 and every page's permission test |
| SC6 | The main bundle does not grow by guide or copy size | S04 and S03 tests; `npm run build` size recorded in S09 |
| SC7 | Keyboard-only and screen-reader walk-through of one tour per area passes a manual checklist | S07, S17, S95 |
| SC8 | `npm run typecheck`, `lint`, `check:translations`, `npx vitest run` and the Playwright `support` and `mobile-360` projects pass on the merged phase | CI (section 8.8) |

---

## 2. Repository findings and architecture

Everything below was read in the repository during planning. Paths are relative to the repository root. "Impact" is what the finding changes in this plan.

### 2.1 Findings that materially shape the plan

| # | Finding (confirmed) | Evidence | Impact on the plan |
|---|---|---|---|
| F1 | The router is a plain exported array, `createBrowserRouter(routes)`. 64 child routes sit under `/:tenantSlug` (84 `path` entries in all), plus six explicit `/admin*` routes, public routes (`/q/:token`, `/f/:token`, `/m/:token`, `/v/:token`), pre-login pages and `*`. | `frontend/src/routes/index.tsx` (`export const routes`, line 103; `createBrowserRouter`, line 923) | Page context comes from matching the URL against a map; a test can walk the exported array (S03). No change to the route table is needed. |
| F2 | `TenantGuard` stays mounted while the user moves between tenant pages and already hosts a persistent sibling, `SalesScriptPanelHost`, "because every page mounts its own `AppLayout`". | `frontend/src/routes/TenantGuard.tsx` | The Support host is mounted next to it (S08). Tours survive page-internal re-renders. |
| F3 | There is **no shared page frame**. Every `*Page.tsx` (42 lines each) wraps its content in `AppLayout` + `Sidebar` + `useNavigation`; `MembershipShell` does it for the Wellness+ pages; `SuperAdminShell` does it for `/admin*` (all six admin routes render the same shell). The form builder is **not** wrapped in `AppLayout`. | `frontend/src/pages/clients/ClientListPage.tsx`, `pages/membership/MembershipShell.tsx`, `pages/shell/SuperAdminShell.tsx`, `pages/settings/FormBuilderPage.tsx` | One launcher in `AppLayout` covers nearly every page. The admin host mounts in `SuperAdminShell`; the builder needs its own entry (S77). |
| F4 | **Two controls already pretend to be Support and do nothing.** The header `HelpCircle` button has an `aria-label` and no `onClick`. The sidebar "Support" item is `href="#support"` with `onClick={(e) => e.preventDefault()}`. | `frontend/src/components/layout/AppLayout/AppLayout.tsx`; `components/layout/Sidebar/Sidebar.tsx` | Both become the launcher (S09). |
| F5 | **Other inert controls exist and must not be explained as working.** The header search `<input>` has no value or handler. The sidebar "New entry" button's `onNewEntryClick` is never passed by any page (searched `src`). Clients, Contracts, Invoices and Quotations lists have **static `disabled` Previous / Next** buttons. The category list has a `disabled` "more (soon)" button. The staff dashboard has a `disabled` button with no handler. | `AppLayout.tsx`; `Sidebar.tsx`; `ClientListContent.tsx`; `ContractListContent.tsx`; `InvoiceListContent.tsx`; `QuotationListContent.tsx`; `CategoryList.tsx`; `StaffDashboard.tsx` | Recorded in the exclusions table (section 3.4) and in risk R6 and R10. A test asserts these carry no `data-tour`. The team is also told (this is a finding, not a task of the phase). |
| F6 | Shared UI primitives: `Button`, `TextInput` and `SelectInput` spread rest props onto their element; `DataTable` (loading skeleton, `empty` prop, sort, selection; one layout renders at a time, table on desktop and cards on a phone), `Tabs` (WAI-ARIA tabs), `Pagination`, `ConfirmDialog` exist. `DropdownMenu` is **portalled to `body`**, built from an `items` array and closes on outside click. `Modal` and `SlideOver` render **inline** (not portalled) with framer-motion exit animation, lock body scroll, close on a **document-level Escape listener**, have **no focus trap**, and `SlideOver` uses the fixed id `slideover-title`. | `frontend/src/components/ui/*` | Rows, headers, menu items, tabs, dialogs and field containers need a pass-through attribute (S10). Esc arbitration and exit-animation tolerance are designed explicitly (S07, S13; risks R4, R5, R7). |
| F7 | **Many pages hand-roll their tables and pagination** (Members, Contracts, Renewals, Payments, Quotations, Invoices, Verify) instead of using `DataTable`. | `pages/membership/MembersContent.tsx`, `pages/renewals/RenewalsContent.tsx`, `pages/contracts/ContractListContent.tsx` and others | Annotation is per page and cannot rely on `DataTable`; the repeated-row rule is the same either way (risk R3). |
| F8 | Authorization in the UI is `usePermission(key)` (key present in `user.permissions`) and `usePermissionScope(key)` (`OWN`, `TEAM`, `ALL`), loaded from `GET /auth/me`; `permissionsVersion` changes when permissions change; `tenantSalesWorkflow` (`LEGACY_QUOTATIONS` or `SALES_PROCESS`) filters nav items and pages. `SUPER_ADMIN` sits outside the permission system. | `frontend/src/hooks/usePermission.ts`, `hooks/useNavigation.ts`, `store/useAuthStore.ts`, `routes/RequirePermission.tsx`, `routes/RoleGuard.tsx` | Step eligibility copies these semantics exactly (S04) and never reads `role`. |
| F9 | Role dashboards share one frame: `DashboardLanding` asks the server for the dashboard kind (renders nothing until it knows), then renders `RoleDashboardFrame` with role-specific content; a `fallback` renders `BusinessOwnerShell` or `StaffShell`; Reception is redirected. | `pages/dashboard/DashboardLanding.tsx`, `RoleDashboardFrame.tsx` | The page id depends on a variant published by the page; the frame is guided once (dashboard slices). |
| F10 | i18n: four languages (`en`, `sq`, `el`, `it`); **every locale file is statically imported** in `i18n/index.ts` (resources are bundled); namespaces listed in `i18n/config.ts`; `check-translations.mjs` requires `sq` complete, lets `el` and `it` lag, and fails on orphan keys. `el` and `it` already lack several files. | `frontend/src/i18n/index.ts`, `i18n/config.ts`, `scripts/check-translations.mjs` | Support copy for ~64 pages must be **lazy-loaded**, not added to the static import list (S04, risk R11). |
| F11 | Motion and layering: `prefers-reduced-motion` handled in four CSS files; z-index tokens end at `--z-tooltip: 100`; the impersonation banner is pinned at a **literal `z-index: 1000`**; the sales script panel uses `--z-modal`. | `frontend/src/styles/tokens.css`, `components/layout/ImpersonationBanner/ImpersonationBanner.module.css`, `index.css`, `Tooltip.module.css` | A new `--z-tour` above 1000 (S05); the mobile sheet leaves room for the banner (risk R16). |
| F12 | Test stack: Vitest 4 (jsdom, `src/setupTests.ts` with msw server and stubs for pointer capture and `IntersectionObserver`), React Testing Library, msw, Playwright with projects `chromium`, `setup`, `desktop`, `mobile-360` (Pixel 5 at 360 px, skipped unless `E2E_ADMIN_PASSWORD`), Storybook with the a11y addon. Tests are colocated as `*.test.tsx`. CI frontend job: `npm ci`, `npm run typecheck`, `npm run lint` (oxlint), `npm run check:translations`, `npx vitest run`; a separate `e2e-mobile` job runs `--project=mobile-360`. | `frontend/vitest.config.ts`, `src/setupTests.ts`, `playwright.config.ts`, `tests/e2e/*`, `.github/workflows/ci.yml` | jsdom has no layout, so geometry is verified in Playwright (risk R8). A `support` Playwright project is added in S09 following the `desktop` project's pattern. |
| F13 | **Large page components.** The form builder is a 2,028-line canvas editor with its own chrome (title bar, ribbon with Home / Insert / Layout and five contextual tabs, page rail, properties panel, status bar) and autosave. `ClientDetailContent` (604 lines), `ContractDetailContent` (669), `MemberDetailContent` (588), `PeoplePage` (590), `PricingContent` (580), `ClientListContent` (581), `InventoryList` (533), `ProductForm` (649). | `components/forms/canvas/FormBuilder.tsx` and the files named | These pages get several steps' worth of slices; the builder is the only place where editing controls must be explain-only because of autosave (risk R9). |
| F14 | No tour, onboarding or walkthrough code exists; no tour library is a dependency; `data-tour` is unused; `data-testid` appears 32 times in `src`. | `frontend/package.json`; search of `src` | Hand-written, attribute-based design (section 4); no new dependency. |
| F15 | The existing plan format (M4) is the model: header table, "How to read", slice overview, cross-cutting rules, decisions to confirm, per-slice Goal / Depends on / Backend / Frontend / Tests / Done when, inputs needed, traceability. Plans for M1 to M3 are referenced but are not in `docs/`. | `docs/milestone-4-implementation-plan.md` | This document follows it. No competing format is introduced. |
| F16 | Debt and conventions to respect: dead controls are treated as a defect family (comments cite TD-020); the permission matrix is enforced by tests (`permissionMatrix.test.ts`, `routeCoverage.test.ts` on the backend); server errors stay in English (TD-016); Albanian text awaits native review (TD-019). | `task.md`; comments in `ClientListContent.tsx` | Support never claims a dead control works; Albanian copy follows the existing review process; Support text avoids server error strings. |

### 2.2 What the codebase does not tell us (stated, not guessed)

| Unknown | Why it matters | How the plan handles it |
|---|---|---|
| Exact labels, options and column sets of ~30 profiled pages (`ev: P` in section 3) | Step lists could differ in detail | Task 2 of each such slice is a re-inventory against the file; the step list below is the starting hypothesis. See risk R13. |
| Whether `GET /auth/me` returns every permission a page checks at the moment a tour starts | A stale `permissions` map would offer a step the user cannot use | Eligibility recomputes on `permissionsVersion` (S04); the target must also exist in the DOM, so a stale permission cannot produce a step for a control that is not rendered. |
| Whether any backend endpoint exists for per-user preferences | Would allow server-side progress | Not investigated: decision D3 keeps `localStorage`. |
| Real behaviour of the camera scanner and file chooser in automation | Both open browser UI | The tour never starts them (explain-only); no automation needed. |
| CI environment for Playwright | The existing mobile suite skips without `E2E_ADMIN_PASSWORD` | Same skip rule for the `support` project; unit and component tests carry the guarantees that must not depend on a seeded server. |

---

## 3. Page and control inventory

### 3.1 How the inventory was built

The router file (`frontend/src/routes/index.tsx`) was parsed: all 84 `path` entries are accounted for below, either under a page (3.2) or as an excluded route with a reason (3.3). For each page, the page wrapper and its content component were opened (`ev: Confirmed`) or profiled by size, control counts, ARIA labels, dialogs, permission checks and state markers (`ev: Profiled`; the first slice of that page re-inventories it). Controls that exist but do nothing are listed in 3.4 and are not explained. The inventory is not a copy of page names: control lists were taken from the source (`<Button>`, `aria-label`, `<Tabs>`, `<DropdownMenu>`, `<Modal>`, `<SlideOver>`, `<ConfirmDialog>`, `empty=`, `usePermission`, `role="alert"`).

Evidence levels: **Read in context** (the render code was read), **Extracted** (button, label, tab, dialog, `empty=` and permission lines were extracted from the source and cross-checked, but surrounding conditions were not read), **Profiled** (sizes and counts only). Only the first level is trusted for conditions; the first task of every slice re-inventories its files whatever the level. **States** are the codes from section 0 that exist for the page.

### 3.2 Pages

#### Sales workflow

**1. Clients list** (`clients.list`)
- **Route(s):** `/:tenantSlug/clients`
- **Evidence:** Read in context
- **Main workflows:** Find a company (search, filters, archived view); open it; add one; archive or restore one.
- **Interactive controls:** Breadcrumb and title; `ExcelImportButton` (import clients, template download); Filter toggle (`aria-pressed`); "Add client"; name search; a mine / team / all select; archived-view toggle; filter bar (business type, risk level, area, city, salesperson, status, a "needs completion" toggle, Clear filters); `DataTable` (name with an "incomplete" badge, status, validity, assigned, risk, area, contact, actions) with row click and a per-row menu (View details, Delete = archive, Restore); archive `ConfirmDialog`; "Showing X of Y".
- **Conditional / permission-dependent:** The mine / team / all select only for `companies.view` scope TEAM or ALL (its Team option only for ALL); the archived toggle, Delete and Restore only with `companies.delete`; Delete only outside the archived view, Restore only inside it; the Add-client empty action only with no search term and outside the archived view; Clear filters only while a filter is active; the filter bar only while shown. **Restore runs immediately with no confirmation.**
- **States that exist:** E L P F X A D K. Three distinct empty states (first use, no match for a search term, archived view); load error banner (`role="alert"`). **Previous/Next are static `disabled` buttons with no handler** and are not explained.
- **Source files:** `pages/clients/ClientListPage.tsx`, `pages/clients/ClientListContent.tsx`, `components/ui/DataTable/DataTable.tsx`, `components/ui/DropdownMenu/DropdownMenu.tsx`
- **Slices:** [S17](#s17), [S18](#s18)

**2. Client form (create and edit)** (`clients.form`)
- **Route(s):** `/:tenantSlug/clients/new`, `/:tenantSlug/clients/:clientId/edit`
- **Evidence:** Read in context
- **Main workflows:** Create a company or edit one; attach contact persons and custom field values; optionally create a deal at the same time.
- **Interactive controls:** Title and subtitle; Cancel; "Save client"; error banner; the tenant's own form rendered by `FormRenderer` in fill mode (sections and controls come from the form builder, present only if the tenant has a form); "Company profile" card (business type required, website, area / city cascade and more, read at slice start); "Contact persons" card (`ContactPersonsEditor`); "First deal" card with a checkbox; "Internal notes" textarea.
- **Conditional / permission-dependent:** The first-deal card only when creating and with `deals.edit`; city depends on area; the tenant form only if one exists; one component serves both routes (`isEdit`). **In edit mode `ContactPersonsEditor` saves each change through its own endpoints immediately (not on Save), so its controls are explain-only there; in create mode it edits a draft.**
- **States that exist:** L A D V. Validation messages per field, submit error banner, edit-mode loading.
- **Source files:** `pages/clients/ClientFormPage.tsx`, `pages/clients/ClientFormContent.tsx`, `pages/clients/ContactPersonsEditor.tsx`, `components/ui/CustomFieldInput`
- **Slices:** [S19](#s19)

**3. Client detail** (`clients.detail`)
- **Route(s):** `/:tenantSlug/clients/:clientId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a company; edit it; log an activity per channel; schedule an appointment; price an offer; upload employees; browse timeline, appointments, contracts, deals and Wellness+ tabs.
- **Interactive controls:** Action bar (sales script button, calculate price, employee upload, edit, email, more menu); custom-field panel with a settings button; the follow-ups panel (`FollowUpsPanel`: Plan button, quick follow-up buttons, follow-up list with Complete / Reschedule / Cancel / Reassign); five tab buttons (conditional); timeline (`CompanyTimeline`); one "log activity" button per channel and `ActivityDialog`; Schedule appointment, which opens the shared `PlanActivityDialog`; `AppointmentDetailPanel` for a clicked appointment; contracts, deals and Wellness+ tabs.
- **Conditional / permission-dependent:** Script button needs `script.view`; the follow-ups panel needs `calendar.view` (Plan: `activities.add`; quick buttons: `followups.manage`); Calculate price needs `offers.edit`; Employee upload needs `members.import`; Contracts, Deals, Wellness tabs need `contracts.validity.view`, `deals.view`, `members.view`; add activity / note need `activities.add` / `notes.add`.
- **States that exist:** E L P X A D T K. Loading, not found, duplicate-name notice, empty timeline, empty tabs.
- **Source files:** `pages/clients/ClientDetailPage.tsx`, `pages/clients/ClientDetailContent.tsx`, `components/followUps/FollowUpsPanel.tsx`, `components/calendar/PlanActivityDialog.tsx`, `components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`, `components/clients/CompanyTimeline.tsx`, `components/clients/ClientContractsTab.tsx`, `components/clients/ClientDealsTab.tsx`, `pages/membership/CompanyWellnessTab.tsx`, `components/activities/ActivityDialog.tsx`
- **Slices:** [S23](#s23), [S24](#s24), [S25](#s25)

**4. Pricing screen (offer builder)** (`pricing.offer`)
- **Route(s):** `/:tenantSlug/deals/:dealId/pricing`, `/:tenantSlug/clients/:clientId/pricing`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Build a price from business type, zone, frequency, package and employee band; see the calculation and any approval warning; save the offer on a deal.
- **Interactive controls:** Deal selector (when entered from a company), employee count input, business type, zone, frequency, package (with a services list), contact person, discount inputs, calculation summary, warnings (`role="alert"`), Save.
- **Conditional / permission-dependent:** Entered from a deal or from a company (deal chosen on screen); Save disabled until `canSave`; discount and approval states depend on pricing settings and permissions.
- **States that exist:** L X A V. Load error (`pricingScreenError`), warning text, saving.
- **Source files:** `pages/pricing/PricingContent.tsx`
- **Slices:** [S26](#s26)

**5. Calendar (appointments, follow-ups, contract dates)** (`appointments`)
- **Route(s):** `/:tenantSlug/appointments`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Move through time, switch view, filter by team member, open an item, plan an activity, reschedule (dialog or drag), act on overdue items.
- **Interactive controls:** Toolbar (previous, today, next, view segmented control, Plan); month grid, time grid and agenda; chips for activities, follow-ups and contract dates; legend; team filter chips; overdue section; detail panel (SlideOver) with status, edit, reschedule, cancel; Plan activity dialog; Reschedule dialog.
- **Conditional / permission-dependent:** Calendar scope (`calendar.view` OWN/TEAM/ALL) decides the team filter; Plan needs `activities.add`; follow-up actions need `followups.manage`; contract date chips only for contract viewers.
- **States that exist:** E L P X A D T V. Empty period (`role="status"`), load notice (`role="alert"`), overdue section appears only when items are overdue.
- **Source files:** `pages/appointments/AppointmentsPage.tsx`, `pages/appointments/CalendarContent.tsx`, `components/calendar/CalendarToolbar.tsx`, `components/calendar/CalendarMonthView.tsx`, `components/calendar/CalendarTimeGrid.tsx`, `components/calendar/CalendarAgenda.tsx`, `components/calendar/TeamFilter.tsx`, `components/calendar/OverdueSection.tsx`, `components/calendar/PlanActivityDialog.tsx`, `components/calendar/RescheduleItemDialog.tsx`, `components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`
- **Slices:** [S21](#s21), [S22](#s22)

**6. Follow-ups** (`followUps`)
- **Route(s):** `/:tenantSlug/follow-ups`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** See my follow-ups or the team's, filter to overdue, complete / reschedule / cancel a follow-up.
- **Interactive controls:** Tabs (mine / team), salesperson select (team tab), "overdue only" checkbox, `FollowUpList` rows with Complete, Reschedule, Cancel and (by scope) Reassign, and their action modals.
- **Conditional / permission-dependent:** Team tab and salesperson filter by `calendar.view` scope; actions need `followups.manage`.
- **States that exist:** E L P F X A D T. Empty list per tab, loading, error.
- **Source files:** `pages/followUps/FollowUpsPage.tsx`, `pages/followUps/FollowUpsContent.tsx`, `components/followUps/FollowUpList.tsx`, `components/followUps/FollowUpActionModals.tsx`, `components/followUps/FollowUpQuickButtons.tsx`
- **Slices:** [S20](#s20)

**7. Discount approvals** (`approvals`)
- **Route(s):** `/:tenantSlug/approvals`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Review offers waiting for discount approval.
- **Interactive controls:** DataTable of pending approvals with row actions, Pagination.
- **Conditional / permission-dependent:** Whole page needs `discounts.approve`; only in the SALES_PROCESS workflow (nav item filter).
- **States that exist:** E L P G X A. Empty queue, loading, error.
- **Source files:** `pages/approvals/ApprovalsPage.tsx`, `pages/approvals/ApprovalsContent.tsx`
- **Slices:** [S27](#s27)

**8. Offers list** (`offers`)
- **Route(s):** `/:tenantSlug/offers`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search and filter offers by status, salesperson and dates; open one.
- **Interactive controls:** Search; status chips (`aria-pressed`); salesperson select; created-from / created-to; Clear filters; DataTable; Pagination.
- **Conditional / permission-dependent:** Needs `commercial.view`; salesperson select only above OWN scope; SALES_PROCESS workflow.
- **States that exist:** E L P F G X A. Empty / no-match, loading, error.
- **Source files:** `pages/offers/OfferList.tsx`, `pages/offers/OfferListContent.tsx`
- **Slices:** [S28](#s28)

**9. Pipeline board** (`pipeline.board`)
- **Route(s):** `/:tenantSlug/pipeline`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** See deals by stage, open a deal, create one, move a deal to another stage.
- **Interactive controls:** View switch (board / list); "New deal"; stage columns with counts; deal cards; per-card "move to" menu; per-column "load more".
- **Conditional / permission-dependent:** Move needs `deals.edit`; deal values need `commercial.view`; New deal needs `deals.edit`.
- **States that exist:** E L P X A D. Empty column, partial load per column, error.
- **Source files:** `pages/deals/DealsPage.tsx`, `pages/deals/PipelineBoardContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`, `pages/deals/DealMarkers.tsx`
- **Slices:** [S33](#s33)

**10. Pipeline list** (`pipeline.list`)
- **Route(s):** `/:tenantSlug/pipeline/list`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter deals by stage, type, owner, business type, area, city and close dates; open or create one.
- **Interactive controls:** New deal; search; stage chips and type chips (`role="group"`); salesperson, business type, area, city selects; close-from / close-to; Clear filters; DataTable; Pagination.
- **Conditional / permission-dependent:** Salesperson filter above OWN scope; values need `commercial.view`.
- **States that exist:** E L P F G X A. Empty / no-match, loading, error.
- **Source files:** `pages/deals/DealListContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`
- **Slices:** [S34](#s34)

**11. Deal form (create and edit)** (`deals.form`)
- **Route(s):** `/:tenantSlug/deals/new`, `/:tenantSlug/deals/:dealId/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Create or edit a deal; pick the company by search; set type, value, owner, notes.
- **Interactive controls:** Company search with matches list and "change company"; type; value/title inputs; salesperson select; notes textarea; Cancel; Save.
- **Conditional / permission-dependent:** Salesperson select needs `companies.reassign`; needs `deals.edit`.
- **States that exist:** L A V. Field errors, `role="alert"` form error, saving.
- **Source files:** `pages/deals/DealFormContent.tsx`
- **Slices:** [S29](#s29)

**12. Deal detail** (`deals.detail`)
- **Route(s):** `/:tenantSlug/deals/:dealId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a deal; move its stage; win, lose or reopen it; reassign; delete; manage its offers and activities.
- **Interactive controls:** Sales script button; Win / Lose / Reopen / Edit buttons; actions menu; stage select; history list; offers section (offers, pricing link, create contract); activities section (add, list); the shared follow-ups panel (`FollowUpsPanel`); Win, Lose, Reopen and Reassign dialogs; delete ConfirmDialog.
- **Conditional / permission-dependent:** Edit needs `deals.edit`; Reassign `companies.reassign`; Delete `deals.delete`; Reopen `deals.reopen`; Win is disabled without an offer; open vs closed deals show different actions.
- **States that exist:** E L P X A D V K. Open vs won vs lost deal; empty offers/activities; dialog validation (`disabled` until a reason/comment).
- **Source files:** `pages/deals/DealDetailContent.tsx`, `pages/deals/DealClosingModals.tsx`, `pages/deals/DealActivitiesSection.tsx`, `pages/deals/DealOffersSection.tsx`
- **Slices:** [S30](#s30), [S31](#s31), [S32](#s32)

**13. Quotations list (legacy workflow)** (`quotations.list`)
- **Route(s):** `/:tenantSlug/quotations`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Browse quotations by status, search, create one, per-row actions.
- **Interactive controls:** New quotation; five status filter buttons; search; table with per-row actions menu; static `disabled` Previous/Next.
- **Conditional / permission-dependent:** Only in the LEGACY_QUOTATIONS workflow (nav `workflow` filter) and with `quotations.manage`.
- **States that exist:** E L P F X A. Empty, loading, error; **Previous/Next static `disabled`** (not explained).
- **Source files:** `pages/quotations/QuotationList.tsx`, `pages/quotations/QuotationListContent.tsx`
- **Slices:** [S35](#s35)

**14. Quotation form (create and edit)** (`quotations.form`)
- **Route(s):** `/:tenantSlug/quotations/new`, `/:tenantSlug/quotations/:id/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Create or edit a quotation with client, validity and line items (product, warehouse, quantity, price).
- **Interactive controls:** Client select, validity input, line-items table with product / warehouse / quantity / price inputs, Add line, remove line, Cancel, Save.
- **Conditional / permission-dependent:** Legacy workflow only.
- **States that exist:** L P A V. Row validation, saving.
- **Source files:** `pages/quotations/CreateQuotation.tsx`, `pages/quotations/EditQuotation.tsx`, `pages/quotations/QuotationFormContent.tsx`
- **Slices:** [S36](#s36)

**15. Quotation detail** (`quotations.detail`)
- **Route(s):** `/:tenantSlug/quotations/:id`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a quotation and move it through its lifecycle (submit, approve, accept, reject, expire, return to draft), edit, share link, convert.
- **Interactive controls:** Back; Edit; status-dependent action buttons (Return to draft, Submit, Approve, Mark accepted, Mark rejected, Expire); share / convert / download actions; line-item table; error banner.
- **Conditional / permission-dependent:** Which buttons render depends on status and permission; legacy workflow only.
- **States that exist:** L X A K. One layout per status; `role="alert"` error banner.
- **Source files:** `pages/quotations/QuotationDetail.tsx`, `pages/quotations/QuotationDetailContent.tsx`
- **Slices:** [S37](#s37)

**16. Invoices list** (`invoices.list`)
- **Route(s):** `/:tenantSlug/invoices`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Browse and search invoices; per-row actions.
- **Interactive controls:** Back/title, search, table, per-row actions menu, static `disabled` Previous/Next.
- **Conditional / permission-dependent:** Needs `invoices.manage`.
- **States that exist:** E L P F X A. Empty, loading, error; **Previous/Next static `disabled`** (not explained).
- **Source files:** `pages/invoices/InvoiceList.tsx`, `pages/invoices/InvoiceListContent.tsx`
- **Slices:** [S38](#s38)

**17. Invoice detail** (`invoices.detail`)
- **Route(s):** `/:tenantSlug/invoices/:id`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read an invoice; send, mark paid, void, download.
- **Interactive controls:** Back; Send; Mark paid; Void; Download; line table; error banner.
- **Conditional / permission-dependent:** Buttons depend on invoice status.
- **States that exist:** L X A K. Status-dependent actions; `role="alert"` banner.
- **Source files:** `pages/invoices/InvoiceDetail.tsx`, `pages/invoices/InvoiceDetailContent.tsx`
- **Slices:** [S39](#s39)

**18. Contracts list** (`contracts.list`)
- **Route(s):** `/:tenantSlug/contracts`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search and filter contracts by validity, salesperson, end dates and overdue; open one; create one.
- **Interactive controls:** New contract; search; validity select; salesperson select; ends-from / ends-to; "only overdue" checkbox; table with per-row actions menu; static `disabled` Previous/Next.
- **Conditional / permission-dependent:** Needs `contracts.validity.view`; salesperson/scope filters by permission.
- **States that exist:** E L P F X A. Empty, loading, error; **Previous/Next static `disabled`** (not explained).
- **Source files:** `pages/contracts/ContractList.tsx`, `pages/contracts/ContractListContent.tsx`
- **Slices:** [S40](#s40)

**19. Contract form (create and edit)** (`contracts.form`)
- **Route(s):** `/:tenantSlug/contracts/new`, `/:tenantSlug/contracts/:contractId/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Create or edit a contract: company, dates, value, payment schedule.
- **Interactive controls:** Nine selects/inputs (company, deal, dates, value, payment terms…), Cancel, Save.
- **Conditional / permission-dependent:** Edit vs create share one component.
- **States that exist:** L A V. Field errors, saving.
- **Source files:** `pages/contracts/ContractFormPage.tsx`, `pages/contracts/ContractFormContent.tsx`
- **Slices:** [S41](#s41)

**20. Contract detail** (`contracts.detail`)
- **Route(s):** `/:tenantSlug/contracts/:contractId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Run a contract through its lifecycle (pending signature, activate, suspend, reinstate, cancel, renew); attach documents; read terms, notes and history.
- **Interactive controls:** About ten lifecycle buttons that render by status (Edit, Refresh, Mark pending signature, Activate, Suspend/Reinstate, Start renewal, Renew, Cancel); linked deal; terms (rich text); document upload (hidden file input) and file rows; notes; history; ConfirmDialogs; reason Modal; and the **instalment schedule card** (`ContractPaymentsCard`: export, add-instalment dialog, per-instalment drawer with invoice / receipt / reverse / correct / edit / remove modes and forms).
- **Conditional / permission-dependent:** Every lifecycle button depends on contract status; some need extra permissions.
- **States that exist:** L P X A D V K. Warning banner (`role="alert"`), reason dialog validation.
- **Source files:** `pages/contracts/ContractDetail.tsx`, `pages/contracts/ContractDetailContent.tsx`, `components/contracts/ContractPaymentsCard.tsx`
- **Slices:** [S42](#s42), [S43](#s43)

**21. Payments overview** (`payments`)
- **Route(s):** `/:tenantSlug/payments`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter instalments, read totals, export CSV.
- **Interactive controls:** Export CSV; search; status, salesperson, due-from, due-to, two more selects, city; "due not invoiced" checkbox; totals; table; Pagination.
- **Conditional / permission-dependent:** Needs `payments.view`; scope-dependent salesperson filter.
- **States that exist:** E L P F G X A. Empty (`role="alert"`), loading, export busy.
- **Source files:** `pages/payments/PaymentsOverview.tsx`, `pages/payments/PaymentsOverviewContent.tsx`
- **Slices:** [S44](#s44)

**22. Renewals** (`renewals`)
- **Route(s):** `/:tenantSlug/renewals`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Work the renewal list by window (about to end, just ended…): start a renewal, mark "not renewing" with a reason, undo.
- **Interactive controls:** Window tabs; search; salesperson select; table with row buttons (Start renewal, Not renewing, Undo); "not renewing" Modal (reason select); Pagination.
- **Conditional / permission-dependent:** Needs `contracts.validity.view`; action column only on the work-list windows.
- **States that exist:** E L P F G X A D T V. Empty (`role="alert"`), loading, modal validation.
- **Source files:** `pages/renewals/Renewals.tsx`, `pages/renewals/RenewalsContent.tsx`
- **Slices:** [S45](#s45)

**23. Performance** (`performance`)
- **Route(s):** `/:tenantSlug/performance`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Compare salespeople over a period; export; open one person's detail with chart or table; open the underlying records.
- **Interactive controls:** Export CSV / PDF; period select + custom dates; compare checkbox; person chips and Clear; table with per-person link and per-figure record buttons; detail panel (grain, indicator, chart/table toggle, close); records dialog with Pagination.
- **Conditional / permission-dependent:** Needs `performance.view`; scope narrows the rows.
- **States that exist:** E L P F G X A D T. Empty (`role="alert"`), detail load failure.
- **Source files:** `pages/performance/Performance.tsx`, `pages/performance/PerformanceContent.tsx`, `pages/performance/PerformanceDetail.tsx`, `pages/performance/PerformanceRecordsDialog.tsx`
- **Slices:** [S46](#s46)

#### Wellness+ membership

**24. Members list** (`members.list`)
- **Route(s):** `/:tenantSlug/members`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search and filter Wellness+ members; open or register one.
- **Interactive controls:** New member; search; tier, status, validity, source selects; left-from / left-to (shown for former employees); sort select; three checkboxes (expiring soon, VIP review due, former employee); Clear; total; hand-rolled table; Pagination.
- **Conditional / permission-dependent:** New member needs `members.manage`; page needs `members.view`; SALES_PROCESS workflow.
- **States that exist:** E L P F G X A. Empty, loading, `role="alert"` load error, total summary.
- **Source files:** `pages/membership/MembersList.tsx`, `pages/membership/MembersContent.tsx`, `pages/membership/MemberBadges.tsx`
- **Slices:** [S47](#s47)

**25. Member form (register and edit)** (`members.form`)
- **Route(s):** `/:tenantSlug/members/new`, `/:tenantSlug/members/:memberId/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Register or edit personal details; resolve a duplicate warning.
- **Interactive controls:** First, last name; date of birth; phone; email; language; city; identifier error; Cancel; Save; duplicate-member Modal (open existing, cancel, "different person, save").
- **Conditional / permission-dependent:** Needs `members.manage`. No tier / status / number control exists by design.
- **States that exist:** L D V A. Field errors, identifier error, generic error, duplicate dialog.
- **Source files:** `pages/membership/MemberFormPage.tsx`, `pages/membership/MemberFormContent.tsx`
- **Slices:** [S48](#s48)

**26. Member detail** (`members.detail`)
- **Route(s):** `/:tenantSlug/members/:memberId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a member (tier, terms, payments, family, VIP, history, note); record a payment; correct a tier; remove from a company; show the card; suspend, reinstate or close.
- **Interactive controls:** Header with badges; Record payment, Correct tier, Remove from company, Card, Edit, status actions; seven tabs (overview, terms, payments, family, VIP, history, note); receipt links; Void payment dialog; family add/link/remove dialogs; VIP request and decision; status Modal.
- **Conditional / permission-dependent:** Nearly every action has its own permission (`members.manage`, `members.payments.view/record`, `members.vip.*`); Close is destructive.
- **States that exist:** E L P X A D V T K. Loading, not found, load failed, per-tab empty states, dialog errors.
- **Source files:** `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx`, `pages/membership/RecordPaymentModal.tsx`, `pages/membership/CorrectTierDialog.tsx`, `pages/membership/RemoveFromCompanyDialog.tsx`, `pages/membership/MemberCardDialog.tsx`, `pages/membership/VipDecisionDialog.tsx`
- **Slices:** [S49](#s49), [S50](#s50), [S51](#s51), [S52](#s52)

**27. Membership payments** (`members.payments`)
- **Route(s):** `/:tenantSlug/members/payments`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter payments, read totals (voided excluded), export CSV, open a receipt.
- **Interactive controls:** Export CSV; from / to; tier, kind, method, status selects; Clear; summary; table with receipt link; Pagination.
- **Conditional / permission-dependent:** Needs `members.payments.view`.
- **States that exist:** E L P F G X A. Empty, loading, `role="alert"` failure, summary.
- **Source files:** `pages/membership/MemberPaymentsPage.tsx`, `pages/membership/MemberPaymentsContent.tsx`
- **Slices:** [S53](#s53)

**28. Membership reports** (`members.reports`)
- **Route(s):** `/:tenantSlug/members/reports`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter by tier, segment, employer, area, city; read figure sections (chart / table toggle) and working lists; export each as CSV.
- **Interactive controls:** Five filters + Clear; report sections with chart/table toggle (`aria-pressed`) and per-section CSV; working-list panels with CSV.
- **Conditional / permission-dependent:** Needs `members.reports.view`.
- **States that exist:** E L P F X A. Loading, `role="alert"` error, empty lists.
- **Source files:** `pages/membership/reports/MembershipReportsPage.tsx`, `pages/membership/reports/MembershipReportsContent.tsx`, `pages/membership/reports/reportSections.ts`
- **Slices:** [S54](#s54)

**29. Verify member (Reception)** (`members.verify`)
- **Route(s):** `/:tenantSlug/members/verify`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Scan a card with the camera or search by name / number and see Valid / Not valid.
- **Interactive controls:** Scan button (camera), search form (`role="search"`), candidate buttons, result panel with actions.
- **Conditional / permission-dependent:** Needs `members.verify`; camera needs browser permission and HTTPS.
- **States that exist:** L F X A D. Idle, checking (`role="status"`), no matches, failed, result.
- **Source files:** `pages/membership/VerifyMemberPage.tsx`, `pages/membership/verify/VerifyMemberContent.tsx`, `pages/membership/verify/QrScanner.tsx`, `pages/membership/verify/ReceptionResult.tsx`
- **Slices:** [S55](#s55)

**30. Employee upload** (`members.employeeUpload`)
- **Route(s):** `/:tenantSlug/members/employee-upload`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Pick a company with a valid contract, upload a spreadsheet, preview created / linked / skipped / error rows, confirm, download the result, review history.
- **Interactive controls:** Download template; company search + results + "change"; file input; Upload; preview counts and table; Confirm; Cancel; result panel (download, "upload another"); history table with downloads.
- **Conditional / permission-dependent:** Needs `members.import`; confirm disabled when nothing would be created or linked.
- **States that exist:** E L P X A V. Idle, uploading, preview, outcome, `role="alert"` error, empty history.
- **Source files:** `pages/membership/EmployeeUploadPage.tsx`, `pages/membership/EmployeeUploadContent.tsx`
- **Slices:** [S56](#s56)

**31. VIP requests** (`members.vipRequests`)
- **Route(s):** `/:tenantSlug/members/vip-requests`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Approvers review pending VIP requests and approve or reject with a comment.
- **Interactive controls:** Status select; table with member link; Approve / Reject per row; decision dialog; Pagination.
- **Conditional / permission-dependent:** Needs `members.vip.approve`; an approver cannot approve their own request (server rule).
- **States that exist:** E L P F G X A D V. Empty, loading, `role="alert"` failure.
- **Source files:** `pages/membership/VipRequestsPage.tsx`, `pages/membership/VipRequestsContent.tsx`, `pages/membership/VipDecisionDialog.tsx`
- **Slices:** [S57](#s57)

#### Settings and form builder

**32. Settings: Company** (`settings.company`)
- **Route(s):** `/:tenantSlug/settings`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Edit the company profile and workspace options; save or discard.
- **Interactive controls:** Breadcrumb; text inputs (name, address, city, state, postal code and more); four native selects (options to be read at slice start); the workspace `LanguagePicker`; one checkbox; Discard; Save.
- **Conditional / permission-dependent:** Section reachable with `settings.manage` (SettingsLayout nav).
- **States that exist:** L X A V. Loading, saving, saved, error.
- **Source files:** `pages/settings/AccountSettingsPage.tsx`, `components/layout/SettingsLayout/SettingsLayout.tsx`
- **Slices:** [S58](#s58)

**33. Settings: My profile** (`settings.profile`)
- **Route(s):** `/:tenantSlug/settings/profile`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Edit my details, avatar and password.
- **Interactive controls:** Breadcrumb; profile inputs + Save; password inputs + Change password.
- **Conditional / permission-dependent:** Available to every tenant user (no permission).
- **States that exist:** L X V. Saving, success, field errors.
- **Source files:** `pages/settings/profile/ProfilePage.tsx`
- **Slices:** [S59](#s59)

**34. Settings: Team** (`settings.team`)
- **Route(s):** `/:tenantSlug/settings/team`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Invite a teammate, edit role, deactivate / reactivate.
- **Interactive controls:** Invite button; member rows with Edit, Deactivate, Reactivate icon buttons (each with `aria-label` per email); Invite and Edit modals; deactivate ConfirmDialog; role select.
- **Conditional / permission-dependent:** Needs `users.manage`; Reactivate vs Deactivate by status.
- **States that exist:** E L P X A D V K. Empty, `role="alert"` errors, modal validation.
- **Source files:** `pages/settings/team/TeamSettingsPage.tsx`, `pages/settings/team/TeamSettingsContent.tsx`, `pages/settings/team/InviteMemberModal.tsx`, `pages/settings/team/EditMemberModal.tsx`
- **Slices:** [S60](#s60)

**35. Settings: Roles and permissions** (`settings.roles`)
- **Route(s):** `/:tenantSlug/settings/roles`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Pick a role, copy / rename / delete it, grant permissions and scopes, save.
- **Interactive controls:** Role list; Copy, Rename, Delete; permission checkboxes; per-permission scope `<select>`; Save (disabled until dirty); name Modal; delete ConfirmDialog.
- **Conditional / permission-dependent:** Needs `roles.manage`; system roles cannot be renamed or deleted (server rule).
- **States that exist:** L X A D V K. Load failed (`role="alert"`), dirty state, delete error.
- **Source files:** `pages/settings/roles/RolesSettingsPage.tsx`, `pages/settings/roles/RolesSettingsContent.tsx`, `pages/settings/roles/RoleNameModal.tsx`
- **Slices:** [S61](#s61)

**36. Settings: Lists** (`settings.lists`)
- **Route(s):** `/:tenantSlug/settings/lists/:list?`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Maintain lookup lists: risk levels, business types, areas, cities, follow-up intervals, lost reasons, activity results.
- **Interactive controls:** Tab bar; per-tab `LookupListEditor` (add, rename, order, deactivate); areas and cities have dialogs and the city list depends on an area.
- **Conditional / permission-dependent:** Needs `settings.manage` or `activityResults.manage`; tabs differ by permission.
- **States that exist:** E L P X A D T V. Per-list empty / loading / error.
- **Source files:** `pages/settings/lists/ListsSettingsPage.tsx`, `pages/settings/lists/ListsSettingsContent.tsx`, `components/settings/LookupListEditor`, `pages/settings/lists/AreasList.tsx`, `pages/settings/lists/CitiesList.tsx`
- **Slices:** [S62](#s62)

**37. Settings: Sales script** (`settings.salesScript`)
- **Route(s):** `/:tenantSlug/settings/sales-script`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Edit the script per language, preview, save draft, publish, view or restore a version.
- **Interactive controls:** Language and mode (edit / preview) toggle groups; section editors; Save draft; Publish (ConfirmDialog); version history with View and Restore; version Modal.
- **Conditional / permission-dependent:** Needs `script.edit`.
- **States that exist:** E L X A D T V K. Load error, empty draft, busy.
- **Source files:** `pages/settings/salesScript/SalesScriptSettingsPage.tsx`, `pages/settings/salesScript/SalesScriptSettingsContent.tsx`
- **Slices:** [S63](#s63)

**38. Settings: Pricing** (`settings.pricing`)
- **Route(s):** `/:tenantSlug/settings/pricing/:tab?`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Configure employee bands, risk surcharges, visit frequencies, price zones, the discount cap, services, packages, offer wording and test the calculator.
- **Interactive controls:** Nine tabs (bands, risk, frequencies, zones, cap, services, packages, offer, calculator), each with its own panel: tables with inline edit, add / remove, dialogs.
- **Conditional / permission-dependent:** Needs `pricing.manage`.
- **States that exist:** E L P X D T V K. Per-panel load error (`role="alert"`), empty, dialogs.
- **Source files:** `pages/settings/pricing/PricingSettingsPage.tsx`, `pages/settings/pricing/PricingSettingsContent.tsx`, `pages/settings/pricing/pricingTabs.ts`
- **Slices:** [S64](#s64), [S65](#s65)

**39. Settings: Statuses** (`settings.statuses`)
- **Route(s):** `/:tenantSlug/settings/statuses`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Rename deal stage labels (sq and en), reorder, and set the stale-deals threshold.
- **Interactive controls:** Rows with label inputs (sq, en), Save / Cancel, Edit, Move up / Move down icon buttons; stale-deals input + Save.
- **Conditional / permission-dependent:** Needs `settings.manage`.
- **States that exist:** L X V. Load failed, error, saved status.
- **Source files:** `pages/settings/statuses/StatusesSettingsPage.tsx`, `pages/settings/statuses/StatusesSettingsContent.tsx`
- **Slices:** [S66](#s66)

**40. Settings: Wellness+** (`settings.wellnessPlus`)
- **Route(s):** `/:tenantSlug/settings/wellness-plus/:tab?`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Set tier fees and terms, membership rules, family relationships and the benefit table.
- **Interactive controls:** Four tabs; tier rows with fee / term / label inputs; rules inputs; relationships table (add, activate); benefits grid (percent per service and tier, add service).
- **Conditional / permission-dependent:** Edit needs `wellnessplus.settings.manage`; `members.view` / `members.verify` see only the read-only benefits tab.
- **States that exist:** L X A T V. `role="alert"` error per panel.
- **Source files:** `pages/settings/wellnessPlus/WellnessPlusSettingsPage.tsx`, `pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `pages/settings/wellnessPlus/TiersPanel.tsx`, `pages/settings/wellnessPlus/RulesPanel.tsx`, `pages/settings/wellnessPlus/RelationshipsPanel.tsx`, `pages/settings/wellnessPlus/BenefitsPanel.tsx`
- **Slices:** [S67](#s67)

**41. Settings: Contracts and payments** (`settings.contracts`)
- **Route(s):** `/:tenantSlug/settings/contracts`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Set contract and payment defaults.
- **Interactive controls:** One settings form with an input and Save.
- **Conditional / permission-dependent:** Needs `settings.manage`.
- **States that exist:** L X V. Saving / saved / error.
- **Source files:** `pages/settings/contracts/ContractSettingsPage.tsx`, `pages/settings/contracts/ContractSettingsContent.tsx`
- **Slices:** [S68](#s68)

**42. Settings: Audit log** (`settings.audit`)
- **Route(s):** `/:tenantSlug/settings/audit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter the audit trail, open an entry, export.
- **Interactive controls:** Export; from / to date inputs; three selects; DataTable; Pagination; entry SlideOver.
- **Conditional / permission-dependent:** Needs `audit.view`.
- **States that exist:** E L P F G X A D. Empty, `role="alert"` failure.
- **Source files:** `pages/settings/audit/AuditLogSettingsPage.tsx`, `pages/settings/audit/AuditLogContent.tsx`, `pages/settings/audit/AuditEntryDetail.tsx`
- **Slices:** [S69](#s69)

**43. Settings: Integrations** (`settings.integrations`)
- **Route(s):** `/:tenantSlug/settings/integrations`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Connect or disconnect external providers.
- **Interactive controls:** Breadcrumb; per-provider card with status, connected-since date, Connect / Disconnect buttons; owner-only notice.
- **Conditional / permission-dependent:** Needs `integrations.manage`; Connect vs Disconnect by state; button disabled while processing.
- **States that exist:** L P X A. Connected / not connected per provider, processing.
- **Source files:** `pages/IntegrationsPage.tsx`
- **Slices:** [S70](#s70)

**44. Settings: Client management** (`settings.clientManagement`)
- **Route(s):** `/:tenantSlug/settings/client-management`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Define custom fields for companies; manage client forms (create, templates, duplicate, save as template, delete).
- **Interactive controls:** Two tab buttons; custom-fields tab (Excel import entry, Add field, rows with move up / down / edit / delete, SlideOver field editor with type, options, required); forms tab (Create form, From template Modal, rows with edit / submissions / duplicate / save as template / delete; ConfirmDialogs).
- **Conditional / permission-dependent:** Needs `settings.manage`; form actions need `forms.manage`.
- **States that exist:** E L P X A D T V K. Empty lists, errors, confirmations.
- **Source files:** `pages/settings/ClientSettingsPage.tsx`, `pages/settings/ClientSettingsContent.tsx`, `pages/settings/ClientFormsTab.tsx`
- **Slices:** [S71](#s71), [S72](#s72)

**45. Settings: Notifications** (`settings.notifications`)
- **Route(s):** `/:tenantSlug/settings/notifications`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Read (everyone) or edit (owner) the email notification policy.
- **Interactive controls:** Breadcrumb; about a dozen checkboxes and a `select` for timing; Discard; Save.
- **Conditional / permission-dependent:** Readable by everyone; **all controls are disabled for non-owners** and the server refuses their writes.
- **States that exist:** L X A V. Loading, saving, read-only.
- **Source files:** `pages/settings/NotificationSettingsPage.tsx`
- **Slices:** [S73](#s73)

**46. Settings: Warehouses** (`settings.warehouses`)
- **Route(s):** `/:tenantSlug/settings/warehouses`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Add, edit and delete warehouses.
- **Interactive controls:** Breadcrumb; Add warehouse; table; WarehouseFormModal; delete confirmation.
- **Conditional / permission-dependent:** Needs `inventory.manage` at scope ALL.
- **States that exist:** E L P X A D V K. Empty, error.
- **Source files:** `pages/inventory/WarehouseList/WarehouseList.tsx`, `components/inventory/WarehouseTable`, `components/inventory/WarehouseFormModal`
- **Slices:** [S74](#s74)

**47. Settings: Categories** (`settings.categories`)
- **Route(s):** `/:tenantSlug/settings/categories`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Add, rename, archive and delete product categories.
- **Interactive controls:** "Show archived" checkbox; Add; per-row Edit / Delete icon buttons (`title`) and a `disabled` "more (soon)" button; form and delete modals.
- **Conditional / permission-dependent:** Needs `inventory.manage` at scope ALL.
- **States that exist:** E L P F X A D V K. Empty, archived view. **The per-row "more" button is `disabled` with a "coming soon" title** and is not explained as functional.
- **Source files:** `pages/inventory/CategoryList/CategoryList.tsx`, `components/inventory/CategoryFormModal`, `components/inventory/DeleteCategoryModal`
- **Slices:** [S75](#s75)

**48. Form submissions** (`forms.submissions`)
- **Route(s):** `/:tenantSlug/settings/client-management/forms/:formId/submissions`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** List submissions of a form and open one.
- **Interactive controls:** Back / actions buttons; submissions table with View; detail overlay (`role="dialog"`) with close and print.
- **Conditional / permission-dependent:** Needs `forms.manage`.
- **States that exist:** E L P X A D. Empty, error, detail overlay.
- **Source files:** `pages/settings/FormSubmissionsPage.tsx`, `pages/settings/FormSubmissionsContent.tsx`
- **Slices:** [S76](#s76)

**49. Form builder** (`forms.builder`)
- **Route(s):** `/:tenantSlug/settings/client-management/forms/:formId`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Design a printable / fillable form on a page canvas: add sections and elements, format text, lay out, manage pages, edit properties, undo / redo, zoom, autosave.
- **Interactive controls:** Title bar (back, name, undo, redo, save status), ribbon tabs Home / Insert / Layout plus contextual tabs (picture, field, text box, shape, section) with `RibbonButton`s, Page rail (add, go to, move, duplicate, delete), canvas with right-click context menu, Add menu, Properties panel, Status bar with zoom.
- **Conditional / permission-dependent:** Needs `forms.manage`; contextual ribbon tabs exist only while an object is selected; many commands are disabled without a selection. **Not wrapped in `AppLayout`**: it has no header Help button.
- **States that exist:** E L A D T K. Empty page, selection-dependent commands, autosave states, history availability.
- **Source files:** `pages/settings/FormBuilderPage.tsx`, `components/forms/canvas/FormBuilder.tsx`, `components/forms/canvas/ribbon/*`, `components/forms/canvas/PageRail.tsx`, `components/forms/canvas/FormCanvas.tsx`, `components/forms/canvas/AddMenu.tsx`, `components/forms/canvas/PropertiesPanel.tsx`
- **Slices:** [S77](#s77), [S78](#s78), [S79](#s79)

#### Dashboards, reports, inventory, notifications

**50. Notifications** (`notifications`)
- **Route(s):** `/:tenantSlug/notifications`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read notifications, open one, mark all read.
- **Interactive controls:** Mark all read; notification rows (buttons).
- **Conditional / permission-dependent:** No role gate; rows scoped to the recipient server-side.
- **States that exist:** E L P X. Empty, loading, error.
- **Source files:** `pages/notifications/NotificationsPage.tsx`, `pages/notifications/NotificationsContent.tsx`
- **Slices:** [S86](#s86)

**51. Reports** (`reports`)
- **Route(s):** `/:tenantSlug/reports`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Read revenue, client, inventory and appointment charts and tables; refresh.
- **Interactive controls:** Refresh and one more header button; chart sections (monthly revenue, client distribution, inventory value, appointment stats, client trend), appointments-by-staff and low-stock tables.
- **Conditional / permission-dependent:** Needs `reports.view`.
- **States that exist:** E L P X A. Loading grid (`aria-busy`), two `role="alert"` banners.
- **Source files:** `pages/ReportsPage.tsx`
- **Slices:** [S87](#s87)

**52. Inventory list** (`inventory.list`)
- **Route(s):** `/:tenantSlug/inventory`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Find products, filter, select several for bulk actions, adjust stock, delete.
- **Interactive controls:** Add product; search; category, warehouse, status, brand filters; Clear; `InventoryTable` with selectable rows and a per-row actions menu; bulk bar ("n selected" + three actions + Clear selection); error banner with Retry; Pagination; stock adjustment panel; two ConfirmDialogs.
- **Conditional / permission-dependent:** Needs `inventory.manage`; bulk bar only while rows are selected.
- **States that exist:** E L P F G X A D K. Empty vs filtered-empty (with Clear), error with Retry, loading.
- **Source files:** `pages/inventory/InventoryList/InventoryList.tsx`, `components/inventory/StockAdjustmentPanel`
- **Slices:** [S88](#s88), [S89](#s89)

**53. Product form (create and edit)** (`inventory.form`)
- **Route(s):** `/:tenantSlug/inventory/new`, `/:tenantSlug/inventory/:productId/edit`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Create or edit a product: information, pricing and stock, details, images; delete from the danger zone.
- **Interactive controls:** Back; section cards (information, pricing and stock, details, danger zone); name, price inputs; category select; `WarehouseStockAllocation` (stock per warehouse); image manager; Discard; Save; delete ConfirmDialog.
- **Conditional / permission-dependent:** Edit-only danger zone; needs `inventory.manage`.
- **States that exist:** L A D V K. Field errors, saving, unsaved-changes confirm.
- **Source files:** `pages/inventory/ProductForm/ProductForm.tsx`, `components/inventory/ProductImageManager`
- **Slices:** [S90](#s90)

**54. Dashboard: Sales User** (`dashboard.salesUser`)
- **Route(s):** `/:tenantSlug/dashboard (role = SALES_USER)`
- **Evidence:** Read in context
- **Main workflows:** Read my leads, deals, follow-ups, offers and sales; change period and place; open the list behind a figure.
- **Interactive controls:** Period select + custom dates; Area, City selects; "Calculated at" + Refresh; KPI tiles (links); pipeline chart with chart / table toggle.
- **Conditional / permission-dependent:** Figures the user may not see are simply absent (server-side); this is the **shared frame** of the four role dashboards.
- **States that exist:** E L P F X A. Empty state, `role="alert"` failure, `aria-busy` tiles.
- **Source files:** `pages/dashboard/SalesUserDashboard.tsx`, `pages/dashboard/RoleDashboardFrame.tsx`, `pages/dashboard/PeriodSelector.tsx`, `pages/dashboard/RefreshBar.tsx`, `pages/dashboard/KpiTile.tsx`, `pages/dashboard/ChartWithTable.tsx`, `pages/dashboard/EmptyState.tsx`
- **Slices:** [S80](#s80)

**55. Dashboard: Sales Manager** (`dashboard.salesManager`)
- **Route(s):** `/:tenantSlug/dashboard (role = SALES_MANAGER)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Team figures and per-salesperson comparison.
- **Interactive controls:** Shared frame plus a salesperson select and a per-salesperson table (value and overdue columns appear only when the server returns them), with a reasons breakdown (confirm at slice start).
- **Conditional / permission-dependent:** Value / follow-up columns exist only if the server returns them.
- **States that exist:** E P F A. Empty table.
- **Source files:** `pages/dashboard/SalesManagerDashboard.tsx`
- **Slices:** [S81](#s81)

**56. Dashboard: Administrator** (`dashboard.administrator`)
- **Route(s):** `/:tenantSlug/dashboard (role = ADMINISTRATOR)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Workspace state now: pricing, users per role, items needing attention, recent changes.
- **Interactive controls:** Four labelled panels (no period selector by design); tables inside.
- **Conditional / permission-dependent:** Recent changes panel conditional.
- **States that exist:** E P A. Empty panels.
- **Source files:** `pages/dashboard/AdministratorDashboard.tsx`
- **Slices:** [S82](#s82)

**57. Dashboard: CEO** (`dashboard.ceo`)
- **Route(s):** `/:tenantSlug/dashboard (role = CEO)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Company-wide view: team, contracts, payments, and the Wellness+ block.
- **Interactive controls:** Shared frame; panels for team, contracts, payments, Wellness+ (`data-block="wellnessPlus"`) and Wellness+ renewals; tables inside.
- **Conditional / permission-dependent:** Wellness+ block only in the SALES_PROCESS workflow.
- **States that exist:** E P A. Empty panels.
- **Source files:** `pages/dashboard/CeoDashboard.tsx`
- **Slices:** [S83](#s83)

**58. Dashboard: Business owner (fallback)** (`dashboard.legacyOwner`)
- **Route(s):** `/:tenantSlug/dashboard (fallback, scope ALL)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Whole-tenant overview when the server cannot name a role dashboard; open appointments, plan, view all activity.
- **Interactive controls:** View appointments; Plan; stat cards; recent-activity list with "view all".
- **Conditional / permission-dependent:** Shown only as the fallback in `DashboardLanding`.
- **States that exist:** E L P X. Several loading / empty / error branches.
- **Source files:** `pages/dashboard/BusinessOwnerDashboard.tsx`, `pages/shell/BusinessOwnerShell.tsx`
- **Slices:** [S84](#s84)

**59. Dashboard: Staff (fallback)** (`dashboard.legacyStaff`)
- **Route(s):** `/:tenantSlug/dashboard (fallback, scope OWN / TEAM)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Staff overview: today's schedule, activity, quick actions.
- **Interactive controls:** Two filter-like buttons, Export, "view calendar", `StaffScheduleTable` rows, "view all activity". **`StaffScheduleTable` has several `disabled` "coming soon" controls (view calendar, per-row more, call, directions, mark complete) and one header button is `disabled` and unwired.**
- **Conditional / permission-dependent:** Fallback only.
- **States that exist:** E L P X. Many loading / empty branches.
- **Source files:** `pages/dashboard/StaffDashboard.tsx`, `pages/shell/StaffShell.tsx`
- **Slices:** [S85](#s85)

#### Platform administration (Super Admin)

**60. Platform dashboard (Super Admin)** (`admin.dashboard`)
- **Route(s):** `/admin`, `/admin/dashboard`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Platform overview; jump to create a tenant.
- **Interactive controls:** New tenant button; summary cards and a recent list (contents read at slice start).
- **Conditional / permission-dependent:** Role `SUPER_ADMIN` (outside the permission system).
- **States that exist:** E L P X. Loading / empty branches.
- **Source files:** `pages/dashboard/SuperAdminDashboard.tsx`, `pages/shell/SuperAdminShell.tsx`
- **Slices:** [S95](#s95)

**61. Platform: Tenants** (`admin.tenants`)
- **Route(s):** `/admin/tenants`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** List workspaces, create one, suspend / reactivate, delete (type the slug to confirm).
- **Interactive controls:** New tenant; `TenantManagementTable` rows with actions (exact set read at slice start); CreateTenantModal; suspend / reactivate ConfirmDialog; delete ConfirmDialog with a typed-slug input.
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`; suspend vs reactivate by state.
- **States that exist:** E L P X D V K. Empty, `role="alert"` errors.
- **Source files:** `pages/admin/TenantsPage.tsx`, `components/widgets/TenantManagementTable`, `pages/admin/CreateTenantModal.tsx`
- **Slices:** [S91](#s91)

**62. Platform: People** (`admin.people`)
- **Route(s):** `/admin/people`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search platform users, filter, invite, change role, deactivate / reactivate, delete.
- **Interactive controls:** Search; two selects; Invite; DataTable with a per-user actions menu; several ConfirmDialogs (one has radio inputs); the invite modal. Exact list read at slice start.
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`.
- **States that exist:** E L P F X D V K. Empty, loading, errors.
- **Source files:** `pages/admin/PeoplePage.tsx`, `pages/admin/InviteUserModal.tsx`
- **Slices:** [S92](#s92)

**63. Platform: Settings** (`admin.settings`)
- **Route(s):** `/admin/setting`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Set platform defaults and apply them in bulk to all or selected tenants.
- **Interactive controls:** Scope radios (all / selected); "choose tenants" button + picker Modal; native selects for defaults; checkbox; scope summary; Apply (ConfirmDialog).
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`.
- **States that exist:** L X D V K. Loading, summary, confirm.
- **Source files:** `pages/admin/PlatformSettingsPage.tsx`, `pages/admin/TenantPickerModal.tsx`
- **Slices:** [S93](#s93)

**64. Platform: My profile** (`admin.profile`)
- **Route(s):** `/admin/profile`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Edit my details and password.
- **Interactive controls:** Profile inputs + Save; password inputs + Change; one further action button guarded by a ConfirmDialog that contains an input (exact action read at slice start).
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`.
- **States that exist:** L X D V K. Saving, errors.
- **Source files:** `pages/admin/AdminProfilePage.tsx`
- **Slices:** [S94](#s94)

### 3.3 Routes without a tour

| Route | Reason |
|---|---|
| `/` | Redirect to /login; no UI of its own. |
| `/login` | Pre-login, single form, outside `AppLayout` (no Support entry); self-explanatory. Revisit as decision D6. |
| `/forgot-password` | Pre-login single field; outside `AppLayout`. |
| `/reset-password` | Pre-login two fields; outside `AppLayout`. |
| `/invite/:token` | Pre-login invitation acceptance; outside `AppLayout`. |
| `/invitations/accept` | Pre-login invitation acceptance; outside `AppLayout`. |
| `/q/:token` | Public customer quotation: an external audience and no application shell; the Support module is not loaded. |
| `/f/:token` | Public client form; external audience, no shell. |
| `/m/:token` | Public Wellness+ member card; external audience, lazily loaded bundle that must stay light (M4 Slice 11). |
| `/v/:token` | Public / staff verification link; external audience, no tenant shell. |
| `/:tenantSlug/settings/client-management/forms/:formId/print` | Print layout (30 lines): no interactive controls. |
| `/:tenantSlug/settings/client-management/forms/:formId/submissions/:submissionId/print` | Print layout (37 lines): no interactive controls. |
| `/:tenantSlug (index)` | Same screen as `/:tenantSlug/dashboard`; covered by the dashboard pages. |
| `/:tenantSlug/dashboard (Reception)` | Reception has no dashboard: `DashboardLanding` redirects to the company list. |
| `/unauthorized` | 403 status page. |
| `*` | 404 status page. |
| `/admin/* (wildcard)` | Redirected by `SuperAdminShell`; the five real sub-pages are covered. |

### 3.4 Controls that exist but are not explained

Explaining a control that does nothing would be a false statement in the product. These are left out on purpose, are asserted to carry no `data-tour`, and are reported to the team (R6, R10).

| Control | Where | Why excluded |
|---|---|---|
| Header search `<input>` | `AppLayout.tsx` | No `value` or handler |
| Sidebar "New entry" button | `Sidebar.tsx` | `onNewEntryClick` is never passed by any page |
| Previous / Next buttons (static `disabled`, not wired) | Clients list | Static `disabled` buttons with no handler: the list does not page |
| Previous / Next buttons (static `disabled`) | Quotations list (legacy workflow) | Static `disabled` buttons with no handler: the list does not page |
| Previous / Next buttons (static `disabled`) | Invoices list | Static `disabled` buttons with no handler: the list does not page |
| Previous / Next buttons (static `disabled`) | Contracts list | Static `disabled` buttons with no handler: the list does not page |
| Per-row "more" button (`disabled`, "coming soon") | Settings: Categories | `disabled`, with a "coming soon" title |
| Disabled schedule button (`disabled`, no handler) | Dashboard: Staff (fallback) | Static `disabled` button with no handler |
| `StaffScheduleTable` coming-soon buttons: view calendar, per-row more, call, directions, mark complete (`disabled`) | Dashboard: Staff (fallback) | `disabled`, with a "coming soon" title |

### 3.5 Shared components and where they appear

| Component | Appears on | Guidance comes from |
|---|---|---|
| AppLayout header and Sidebar | every authenticated page except the form builder | S09, S12 |
| DataTable (rows, empty, loading, sort, cards) | Clients list, Offers, Pipeline list, Approvals, Audit log, People, Inventory list (`InventoryTable`) | S10 |
| Pagination | Approvals, Offers, Pipeline list, Payments, Renewals, Performance records, Members lists, VIP requests, Audit log, Inventory list | S10, S11 |
| DropdownMenu (row and header menus) | Clients, Client detail, Deal detail, Pipeline board, Contracts, Invoices, Quotations, People | S10, S13 |
| ConfirmDialog | Clients list, Deal detail, Contract detail, Team, Roles, Sales script, Inventory, Admin pages, Client management | S10, S13 |
| Modal / SlideOver | most detail, settings and admin pages | S10, S13 |
| Tabs | Client detail, Member detail, Renewals, Follow-ups, Lists, Pricing settings, Wellness+ settings, Client management | S10, S13 |
| ActivityDialog | Client detail, Deal detail | S24 (first use), S30 |
| FollowUpsPanel, FollowUpList, FollowUpQuickButtons, follow-up action modals | Follow-ups page, Client detail, Deal detail | S23, S20 |
| PlanActivityDialog, AppointmentDetailPanel | Calendar, Client detail, Follow-ups panel | S22 |
| ContractPaymentsCard | Contract detail | S43 |
| ValidityBadge, RiskBadge | Clients list, Client detail, Contracts | status-badge shared guidance (S11) |
| MemberBadges | Client detail (Wellness+ tab), Members list, Member detail, Payments | S25 (first use), then the members slices |
| RoleDashboardFrame / KpiTile / ChartWithTable | four role dashboards | dashboard slices |
| LookupListEditor | Settings: Lists (seven tabs) | S62 |
| NotificationBell panel | every page (header) | S12 |
| SalesScriptPanel (right-hand panel) | every tenant page | S12 (shell) |

---

## 4. Proposed architecture and design

Everything in this section is a **proposal** grounded in the findings of section 2. Where the repository cannot settle a choice, a decision rule is given instead of a guess (4.14).

### 4.1 Principles

1. **The real interface is the target.** The tour highlights elements that are on the page now. It never shows screenshots, copies of controls or a parallel tutorial UI.
2. **Look up, never hold.** The engine stores *target ids*, not elements, and resolves them in the live DOM when they are needed and again after every settled change. A stale element reference cannot exist.
3. **Describe kinds, not records.** Guidance attaches to repeated structures (a row, a card, a menu item) through one shared id. Twenty products and two hundred products yield identical steps.
4. **Read-only by construction.** The tour never activates an application control. This is enforced at runtime (S14), in definitions (lint, S11) and in end-to-end tests, not by convention.
5. **Pure core, thin shell.** The state machine, eligibility rules and resolver status logic are plain TypeScript modules, tested without React.
6. **No cost until used.** The launcher is small; the host, guides and copy are lazy chunks.
7. **Follow the app, don't fork it.** Eligibility mirrors `usePermission`, `usePermissionScope`, `tenantSalesWorkflow` and the nav filter so Support can never disagree with the menu.

### 4.2 Module map

```
frontend/src/
  store/useSupportStore.ts                 panel open, mode, session, page context             (S03)
  lib/support/
    types.ts                               PageGuide, GuideStep, TargetSpec, Requirement        (S01)
    tourMachine.ts                         pure reducer: start/next/back/skip/exit/wait/lost   (S01)
    targetResolver.ts  domObserverHub.ts   find + status + one shared MutationObserver          (S02)
    useTargetElement.ts                    hook: element, status, rect                          (S02)
    routeMap.ts  pageRegistry.ts           URL -> page id; lazy guide loaders                   (S03)
    useSupportPage.ts                      current page, tab, variant                           (S03)
    stepEligibility.ts progressStorage.ts  permissions/workflow/viewport; localStorage          (S04)
    supportCopy.ts                         lazy-load support copy per language                  (S04)
    tourProps.ts                           typed data-tour attribute helper                     (S10)
    sharedGuidance.ts defineGuide.ts       reusable control kinds; guide builder                (S11)
    guideLint.ts stepFactories.ts          definition rules; list/form/detail step families     (S11)
    layoutAdapters.ts                      open/close sidebar, mobile search (view state only)  (S12)
    layerStack.ts useLayerWatcher.ts       dialogs, drawers, menus as scopes and hand-offs      (S13)
    interactionGuard.ts                    capture-phase read-only enforcement                  (S14)
    useExplainableControls.ts usePickMode.ts   "Explain a control"                              (S15, S16)
    guides/*.ts                            one file per page (lazy)                             (S17 onward)
  components/support/
    SupportLauncher  SupportPanel  ControlList  PickBanner                                       (S09, S15, S16)
    SupportHost  SpotlightMask  TourPopover  LiveAnnouncer                                       (S05 to S08)
  locales/{en,sq}/support*.json            support, supportSales, supportMembers,
                                           supportSettings, supportOps, supportAdmin            (S09 onward)
```

The layout follows the repository's technical-type split (`store/`, `hooks/`-style helpers, `components/<feature>/`) with `lib/` as the home of framework-free logic (`lib/motion.ts` is the existing precedent).

### 4.3 Core concepts

```ts
// types.ts (sketch; the slice writes the real file test-first)
type StepSafety = 'explain-only' | 'try-it';           // default explain-only
type StepKind = 'info' | 'control' | 'field' | 'filter' | 'tab' | 'menu' | 'opener' | 'region';

interface Requirement {
  permission?: string | string[];      // all held (a key is held if permissions[key] !== undefined)
  anyPermission?: string[];
  minScope?: 'OWN' | 'TEAM' | 'ALL';
  workflow?: 'SALES_PROCESS' | 'LEGACY_QUOTATIONS';
  viewport?: 'desktop' | 'mobile';
}

interface GuideStep {
  id: string;                          // unique in the guide; copy keys derive from pageId + id
  target: string;                      // data-tour id, e.g. 'clients.list.add'
  kind: StepKind;
  safety?: StepSafety;
  repeat?: boolean;                    // many instances expected; exemplar rule applies
  within?: string;                     // resolve inside the first matching parent target
  requires?: Requirement;              // eligibility
  opens?: string;                      // this try-it step makes a layer appear (hand-off)
  group?: string;                      // belongs inside that layer
  warning?: boolean;                   // destructive or irreversible: callout + never try-it
  use?: string;                        // 'shared.pagination' etc.
  scope?: { tab?: string };            // only while this tab is open
  needs?: 'sidebar' | 'mobileSearch';  // layout adapter
}

interface PageGuide { pageId: string; version: number; namespace: string; steps: GuideStep[]; }
```

Copy never lives in the guide. The key convention is `<namespace>:<pageId>.<stepId>.title|body|when|warning|disabled`; `title` and `body` are required, the others optional.

### 4.4 Determining the current page context

| Question | Decision | Why (repository evidence) |
|---|---|---|
| How is the page found? | `routeMap.ts` lists every router pattern (relative to `/:tenantSlug`, plus `/admin*`) and the page id it belongs to, or `null` with a reason. `resolvePageId(pathname)` strips the tenant prefix and uses `matchPath`. | The route table is a plain exported array (F1); a map beside it is cheaper and safer than adding `handle` metadata to 64 route objects. |
| How is a missing mapping caught? | A test walks the exported `routes` array and fails for any pattern that is neither mapped nor excluded (the same technique as `mobile360Coverage.test.ts`). | A new route cannot ship without a Support decision (SUP-20). |
| Dashboards, where one URL shows different screens by role? | The page publishes its variant: `DashboardLanding` and its fallbacks call `useSupportContext({ variant })`. The page id becomes `dashboard.<variant>`; before the server answers there is no variant and therefore no guide, and the panel says so. | `DashboardLanding` renders nothing until the kind is known (F9). |
| Tabs (`settings/pricing/:tab?`, `settings/lists/:list?`, `settings/wellness-plus/:tab?`, client and member detail tabs, renewals windows)? | The tab is `scope.tab`, read from the URL where the route has it and published by the page where it does not. Steps may carry `scope: { tab }`. The panel offers **Tour this tab**. | Several pages keep the tab in the URL (F1); the rest are `Tabs` components with local state. |
| Create and edit routes that share a component? | One page id, two route patterns, and `vars.mode` for mode-specific copy. | Same component serves both (for example `ProductForm`, `ClientFormContent`). |
| Pages with no `AppLayout` (form builder)? | Own entry button; host mounted in the page. | F3. |

### 4.5 Registering and identifying real UI targets

**Options considered**

| Option | For | Against | Verdict |
|---|---|---|---|
| **A. Explicit `data-tour` attributes + runtime lookup** | Stable under refactors, restyling and translation; one selector; no extra React plumbing (`Button`, `TextInput`, `SelectInput` already spread props); trivially covers repeated nodes; testable in jsdom | Needs annotation edits in pages; a developer can delete one | **Chosen** |
| B. Wrapper component `<TourTarget id>` with ref registration | Type-safe | Extra DOM or `cloneElement` on a codebase full of hand-rolled markup; registration and unmount bookkeeping is exactly where duplicate and stale registrations come from | Rejected |
| C. Discovery by role, text or class | No edits | Four UI languages; CSS-module class names are hashed; fragile | Rejected |
| D. Third-party tour library (driver.js, react-joyride, Shepherd) | Fast start | New dependency; `Modal`/`SlideOver`/`DropdownMenu` interplay (inline vs portal, document Esc listeners, no focus trap) must be hand-solved anyway; limited control over the read-only guarantee and i18n loading | Rejected; revisit only if S08 shows the hand-written overlay cannot meet S05 and S07 acceptance (decision rule 4.14-1) |

**Id grammar.** `<pageId>.<control>` for page controls (`clients.list.add`), `shell.<control>` for the shared chrome, `activity.*` and similar for components shared by several pages. `tourProps(id, { repeat })` (S10) validates the format in development. An element may carry several ids as a space-separated token list.

**Annotation rule.** Edit the existing element; never add a wrapper. For shared components add the optional `tourId` prop (S10). Highlight the field container, not just the `<input>`, so the label is inside the ring.

### 4.6 Repeated, data-driven structures

- Rows, cards, chips, menu items and list entries carry **one shared id** and are flagged `repeat` in the guide. `DataTable` applies `rowTourId` to every row in both its table and card layouts (S10).
- A repeat step highlights the **first visible instance** (the exemplar) and its copy says it applies to every row. A control inside a row uses `within` to resolve inside that exemplar.
- When the exemplar disappears (filtered out, deleted, paged away) the resolver picks the next instance on the next frame; with none left the step is `missing` and is skipped.
- "Explain a control" and pick mode look an element up by id, so any instance can be asked about and the answer is the same.
- Counting rows is never needed. There is deliberately no step whose existence depends on the number of records, except the *empty state*, which is a different element.

### 4.7 Reacting to changing data and layout

One shared `MutationObserver` on `document.body` (child list, subtree, and a short attribute list) feeds the resolver; callbacks are batched to one per animation frame. One `ResizeObserver` watches the active target. The spotlight additionally follows ancestor scrolls (captured, as `DropdownMenu` already does) and window resizes.

| Situation | Behaviour | Slice |
|---|---|---|
| Target not present when the step is entered, and a region is busy (`aria-busy="true"` or `data-tour-busy`, which `DataTable` loading sets) | Popover shows "Loading this part of the page…" for at most 4 s, then treats the target as missing | S02, S08 |
| Target absent, nothing busy | Step skipped, polite announcement "Skipped: <title> is not available right now", progress denominator shrinks by one | S08 |
| Target disappears while it is the current step | Popover switches in place to "This item changed or is no longer on the page" with Next, Back, Exit; if the same id reappears the step is restored | S01, S08 |
| Target replaced by a new node with the same id (re-render, list refresh) | Detected by identity; spotlight re-binds; step does not restart | S02 |
| Target becomes disabled | Still highlighted; popover appends the step's `disabled` hint ("Save becomes available once you change something") | S06, S08 |
| Target moves (layout shift, sidebar opens, rows reflow) | Spotlight follows within one frame | S05 |
| Target is outside the viewport | `scrollIntoView` (instant under reduced motion) with room for the sticky header and the mobile sheet | S08 |
| Repeated target removed, filtered or paged away | Exemplar re-picked, or step skipped when none remain | S02 |
| Data added (new row, new record) | Same id, automatic coverage; nothing to do | S02, S10 |
| Filter, search or page change while a tour runs | The tour does not react to the data itself; steps whose targets vanish are skipped, steps whose targets appear (for example **Clear filters**) become eligible on the next navigation | S08 |
| Permission or workflow changes (`permissionsVersion` changes) | Eligibility recomputed; the machine receives `STEPS_CHANGED`; the current step is re-anchored if it was dropped | S04, S01 |
| Route changes | The tour ends (outcome `exited`, resume point saved) and says so | S08 |
| Language changes | Copy re-renders from keys; no restart | S04 |
| Viewport crosses 768 px | Placement and sheet mode re-evaluated; steps tagged `viewport` re-filtered; `needs: 'sidebar'` re-applied | S06, S12 |
| Duplicate registration of a non-repeat id | One `console.warn` in development; first visible instance used in production | S02 |

Progress is always "position among the currently eligible steps". It can change mid-tour (3 of 8 becomes 3 of 7) and the change is announced.

### 4.8 Guiding through dialogs, drawers, dropdowns and tabs

Because the tour never clicks for the user, nested guidance is a **hand-off**:

1. A step with `opens: 'X'` and `safety: 'try-it'` highlights the opener ("Open the actions menu to continue").
2. The machine enters `waiting` (reason `user-action`). The user clicks. The tour's guard allows exactly that target.
3. When layer `X` appears (a `role="dialog"` or `role="menu"` or an element with `data-tour-layer`), the resolver scopes to it and the steps with `group: 'X'` run.
4. When the layer closes, the tour returns to the page level (or to the opener if the layer closed before its group finished).
5. "Skip this part" in the waiting popover jumps over the whole group; so does the opener becoming disabled or missing.

Exit animations (`AnimatePresence`) get a 600 ms grace period so a closing dialog is not mistaken for a lost target. A second layer opened on top becomes the new scope root. Tabs use the same mechanism with `advanceWhen` = the tab has `aria-selected="true"`.

Escape: while the tour is `running`, Esc exits the tour only (capture phase, `stopPropagation`); while it is `waiting` or inside a group, Esc is left to the application layer, which closes it, and the tour returns to the page level (decision rule 4.14-3, risk R7).

### 4.9 Unavailable targets, in one table

| Resolver status | Meaning | Engine response |
|---|---|---|
| `found` | Connected, laid out, not hidden | Show the step |
| `disabled` | Found but `disabled` or `aria-disabled` | Show the step with its disabled hint |
| `offscreen` | Found outside the viewport | Scroll, then show |
| `pending` | Absent inside a busy region | Wait up to 4 s |
| `missing` | Absent, not busy | Skip, announce |
| `lost` | Was found for this step and is gone | In-place "changed" card; restore if it returns |

There is no state in which the tour points at an unrelated element: a status other than `found`, `disabled` or `offscreen` never draws a spotlight.

### 4.10 Safety invariants

| # | Invariant | Mechanism | Slice |
|---|---|---|---|
| I1 | The tour never calls `.click()`, `.submit()`, `dispatchEvent` or an application callback | Source-grep test under `lib/support`; code review rule | S14 |
| I2 | While a tour step is `explain-only`, the explained control cannot be activated by pointer or keyboard | Capture-phase guard cancels `click`, `pointerdown`, `mousedown`, `touchstart`, and Enter or Space on the target | S14 |
| I3 | Destructive or irreversible controls are always `explain-only` | `warning: true` implies explain-only; lint rejects the combination; runtime throws in development | S11, S14 |
| I4 | Forms cannot be submitted while a tour runs, even from a field the user may type in | Capture-phase `submit` cancel, with a one-time hint | S14 |
| I5 | The tour changes no application state except two view-state adapters (open sidebar, open mobile search), restored when the step changes or the tour ends | `layoutAdapters.ts` snapshot and restore | S12 |
| I6 | No `POST`, `PUT`, `PATCH` or `DELETE` is sent during a tour | `expectNoMutations` in every page's end-to-end case, with an explicit allow-list for the few read-only POST endpoints (pricing calculator, upload preview), risk R14 | S14, all page slices |
| I7 | In the form builder, whose editing triggers autosave, every editing control is explain-only | Builder slices declare it; lint cannot enforce it, the builder end-to-end case asserts the document JSON is unchanged | forms.builder slices |

### 4.11 Accessibility, motion and responsiveness

| Concern | Design |
|---|---|
| Focus | On start remember `document.activeElement`; on each step focus the popover heading; on end restore (or `main` if the element is gone). Popover Tab order: Back, Next or Finish, Skip tour, Exit (plus "Go to the control" on `try-it` steps). |
| Keyboard | Esc exits (rule in 4.8). ArrowRight and ArrowLeft move between steps only when focus is inside the popover and never while typing. No shortcut exists while no tour runs. |
| Screen reader | Popover is `role="dialog"` with `aria-modal="false"`, `aria-labelledby`, `aria-describedby`. A polite live region announces "Step n of N: title", skips, loss, completion and the submit lock. The target gets a reversible `aria-describedby` token pointing at the body text. The mask is `aria-hidden`. |
| Visible focus and highlight | A 2 px ring in the existing focus colour; not colour alone (the warning callout has an icon and text); `forced-colors` mode draws the ring with system colours and drops the dim. |
| Reduced motion | No glide of the spotlight, instant `scrollIntoView`, no fade (`prefers-reduced-motion: reduce`, as `Tooltip` and `Toast` already do). |
| Small screens | Under 768 px the popover is a bottom sheet; the host passes its height so the target is scrolled clear of it; the sidebar and mobile search bar are opened by adapters when a step needs them; the impersonation banner (z-index 1000, pinned at the bottom) is accounted for. 360 px is a hard requirement (existing NFR-USE rules). |
| Language | All text from keys; switching language re-renders. Long Albanian strings are checked at 360 px in the Playwright case. |
| Destructive actions | A warning callout (icon plus text) on every destructive step; the control is explain-only. |

### 4.12 Persistence

`localStorage` key `wellness-support-progress`: `{ "<userId>:<tenantSlug>": { "<pageId>": { v, completedAt?, dismissedAt?, lastStepId? } } }`. Used for the check marks and Resume and Replay labels in the Support panel. Every access is wrapped in try/catch (storage may be blocked), a guide `version` bump invalidates old records, and nothing depends on it for correctness. It is never read to start a tour automatically (A5).

### 4.13 Copy, translation and loading

Guides are TypeScript modules loaded by dynamic `import()` the first time the panel opens on a page. Copy lives in six lazily loaded namespaces (`support`, `supportSales`, `supportMembers`, `supportSettings`, `supportOps`, `supportAdmin`) loaded with `import.meta.glob` and added to i18next on demand; they are deliberately **not** added to the static import list in `i18n/index.ts`. `check-translations.mjs` already scans every `locales/<lang>/*.json`, so completeness (`sq`) and orphan checks apply without a script change. A unit test (S11) additionally proves that every key a guide derives exists in `en` and `sq`, which the script cannot know.

### 4.14 Decisions the repository cannot settle, and the rule used instead

| # | Uncertainty | Decision rule |
|---|---|---|
| 1 | Is a hand-written overlay good enough, or is a library needed? | Build it. If S08's acceptance (focus, Esc arbitration, mobile sheet, no stranded states) cannot be met without more than about 150 extra production lines, stop and bring a library proposal to review before S09. |
| 2 | Do the ~30 profiled pages have more or fewer controls than listed? | Re-inventory in task 2 of the first slice of each page. If the step list grows so the estimate exceeds 300, split at a state boundary and renumber (for example `a`/`b`) rather than exceed the band; if it shrinks below 150, keep the slice and record the exception. |
| 3 | Escape inside nested layers | Esc belongs to the layer the user opened; the tour yields while `waiting` or inside a group. Revisit only if user testing shows accidental exits. |
| 4 | Whether a "try-it" is safe | A step may be `try-it` only if it changes view state or a local draft (open, tab, filter, typing in an input, expanding), never data. If in doubt, `explain-only`. Lint enforces the kinds; review enforces the judgement. |
| 5 | Read-only POST endpoints | List them in the PR that adds the page and in the allow-list of `expectNoMutations`; any other mutating request fails the test. |
| 6 | Dead or placeholder controls found later | Do not annotate. Record in the exclusions table. If the team wires one later, add a step in a follow-up slice. |
| 7 | Auto-offering a tour on first visit | Not built (A5). If requested, it is one panel-level change in S09's code using `progressStorage`, plus a decision about interruption. |

### 4.15 Trade-offs, plainly

- **Attributes over wrappers** costs a one-line edit per control in ~70 files, and in exchange gives stable, translation-proof, testable targets. The risk (a developer deletes an attribute) is turned into a failing test by the per-guide fixture check (section 8).
- **Hand-written engine over a library** costs roughly 3,900 production lines of infrastructure, and in exchange gives the exact read-only guarantee, the exact nested-layer behaviour and no new dependency.
- **Lazy copy and guides** add a loader and a loading moment on first open, and in exchange keep every existing user's bundle unchanged (F10).
- **Exemplar for repeats** means the tour cannot say "this row" about a specific record, and in exchange it never goes stale.
- **No auto-start** means discovery depends on the Support button, and in exchange nobody is interrupted.

---

## 5. Phase-level dependency overview

### 5.1 Shape of the phase

```
FOUNDATION (infrastructure only, S01-S16)
  S01 engine ──┬─ S02 resolver ──┬─ S05 mask ── S06 popover ── S07 focus/keys ─┐
               ├─ S03 registry ──┤                                              ├─ S08 host ── S09 launcher+panel
               └─ S04 eligibility/storage/copy loader ──────────────────────────┘        │
  S02 ── S10 shared UI pass-through ── S11 shared guidance + lint ── S12 shell chrome (also needs S08)
                                                  S08+S10 ── S13 nested layers ── S14 read-only guard
                                  S09+S11+S14 ── S15 explain-a-control list ── S16 pick mode
                                                                                   │
PILOT GATE  S17-S18  Clients list (first real guide; validates S01-S16 on live data)
                                                                                   │
PAGE TOURS  S19 ... S95   every page slice depends on S16 (foundation) and S18 (pilot accepted),
                                plus its own earlier slices, plus the explicit edges below
```

### 5.2 Rules of the sequence

1. **Foundation before pages.** No page slice starts until S16 is merged.
2. **Pilot gate.** S17 and S18 prove the mechanism on one real page. Every other page slice depends on S18, so a design flaw found there is fixed once, in the foundation, before dozens of guides depend on it.
3. **A page's slices run in order.** Apart from the explicit edges in 5.3, a slice needs no other page.
4. **Cross-page edges are only where a component or pattern is genuinely shared**, and are listed in the table below (for example the activity dialog, the follow-ups panel, the plan and appointment dialogs, the member badges and VIP decision dialog, the remove-from-company dialog, the deal closing dialogs, the lookup editor, the language picker, the form renderer, the tenant table and the role-dashboard frame).
5. **Areas are largely independent** after the pilot: a team can run Sales, Members, Settings, Operations and Admin in parallel, respecting the cross-area edges in 5.3 (for example the members list waits for the client detail Wellness+ tab). The order in this document is the single-developer order.
6. **Each page slice also depends, implicitly, on the page's source files being unchanged since planning.** If a feature slice of another project changes the page, the first task (re-inventory) catches it.

### 5.3 Explicit cross-page edges

| Slice | Needs (besides foundation, pilot and its own earlier slices) | Why |
|---|---|---|
| S23 (Client detail: header, action bar, summary, custom fields and follow-ups panel) | S20 (Follow-ups: tabs, filters, list and actions) | reuses the follow-up action modals annotated with the follow-ups page (`followUps.modal.*`); this slice annotates the shared `FollowUpsPanel`, `FollowUpQuickButtons` and `FollowUpList` for the follow-ups page and the deal page |
| S24 (Client detail: timeline, activity logging and the appointments tab) | S22 (Calendar: items, detail panel, Plan activity and rescheduling) | the Schedule button opens the shared `PlanActivityDialog` and a clicked appointment opens the shared `AppointmentDetailPanel`, both annotated with the calendar (`plan.*`, `apptDetail.*`) |
| S30 (Deal detail: header, stage, history, activities and the follow-ups panel) | S24 (Client detail: timeline, activity logging and the appointments tab) | reuses the `activity.*` ids of the shared `ActivityDialog` and the `followUps.*` ids of the shared follow-ups panel, annotated and given copy in the client detail slices |
| S81 (Dashboard: Sales Manager) | S80 (Dashboard: Sales User and the shared role-dashboard frame) | reuses the shared role-dashboard frame guidance (`includeFrame()`) written there |
| S82 (Dashboard: Administrator) | S80 (Dashboard: Sales User and the shared role-dashboard frame) | same shared frame guidance |
| S83 (Dashboard: CEO) | S80 (Dashboard: Sales User and the shared role-dashboard frame) | same shared frame guidance |
| S65 (Settings: Pricing, services, packages, offer wording and test calculator) | S62 (Settings: Lists, all seven tabs) | the packages panel uses the shared `LookupListEditor`, annotated with the lists page (`lookupList.*`) |
| S59 (Settings: My profile) | S58 (Settings: Company) | reuses the `LanguagePicker` annotated there (`language.*`) |
| S93 (Platform: Settings) | S58 (Settings: Company) | reuses the `LanguagePicker` annotated with the company settings (`language.*`) |
| S76 (Form submissions) | S19 (Client form: fields, contacts, custom fields and create-deal option) | the submission overlay renders the shared `FormRenderer`, annotated with the client form |
| S77 (Form builder: entry point, title bar, status bar, ribbon Home and Insert tabs) | S19 (Client form: fields, contacts, custom fields and create-deal option) | the builder canvas renders the shared `FormRenderer`, annotated with the client form |
| S95 (Platform dashboard, and phase closure) | S91 (Platform: Tenants) | reuses the `TenantManagementTable` annotated with the tenants page (`tenantTable.*`) |
| S47 (Members list) | S25 (Client detail: deals and Wellness+ tabs) | reuses the `MemberBadges` (tier, status, expiring) annotated with the Wellness+ tab of the client page |
| S52 (Member detail: record payment, correct tier, remove from company, card and status dialogs) | S25 (Client detail: deals and Wellness+ tabs) | the remove-from-company dialog is shared with the Wellness+ tab; its `removeFromCompany.*` ids are annotated there |
| S33 (Pipeline board: columns, cards, move menu and load more) | S32 (Deal detail: win, lose, reopen, reassign and delete dialogs) | the move menu opens the shared Win and Lose dialogs, annotated with the deal page (`dealClosing.*`) |
| S57 (VIP requests) | S50 (Member detail: payments and VIP tabs, receipt, void and decision dialogs) | reuses the `VipDecisionDialog` annotations made with the VIP tab |

### 5.4 Which tours depend on which foundation slice

| Foundation slice | Needed by | Reason |
|---|---|---|
| S01, S02, S03, S04 | all | engine, targets, page context, eligibility, persistence, copy loading |
| S05, S06, S07, S08 | all | what the user sees and how they move |
| S09 | all | the only way to start a tour |
| S10 | every page with a table, tabs, dropdown, dialog or form field (all) | pass-through attributes |
| S11 | all | shared guidance, authoring helpers, lint |
| S12 | every page (shell steps); mobile coverage | sidebar and header |
| S13 | pages with menus, dialogs, drawers, tabs (all but a handful of simple pages) | hand-off |
| S14 | all | read-only guarantee |
| S15, S16 | all (feature-level) | "Explain a control" on every guide automatically |

### 5.5 Dependency table

| Slice | Title | Kind | Depends on |
|---|---|---|---|
| S01 | Tour engine model and state machine (pure) | infrastructure | - |
| S02 | Target resolver and live DOM synchronisation | infrastructure | S01 |
| S03 | Support store, page-context registry and route-coverage guard | infrastructure | S01 |
| S04 | Step eligibility, progress persistence and lazy copy loader | infrastructure | S01, S03 |
| S05 | Spotlight overlay layer | infrastructure | S02 |
| S06 | Tour popover: content, progress and navigation controls | infrastructure | S05 |
| S07 | Focus management, keyboard and screen-reader announcements | infrastructure | S06 |
| S08 | Support host: session orchestration and mounting | infrastructure | S03, S04, S05, S06, S07, S02 |
| S09 | Support launcher and contextual help panel | infrastructure | S08 |
| S10 | Annotation pass-through on shared UI components | infrastructure | S02 |
| S11 | Shared guidance library and guide-authoring helpers | infrastructure | S01, S04, S10 |
| S12 | Application shell chrome: annotations, layout adapters and shell guide | infrastructure | S08, S10, S11 |
| S13 | Nested layers: dialogs, drawers, menus and tabs | infrastructure | S08, S10 |
| S14 | Explain-only enforcement and safety watchdog | infrastructure | S13 |
| S15 | Explain a control: control list | infrastructure | S09, S11, S14 |
| S16 | Explain a control: pick mode | infrastructure | S15 |
| S17 | Clients list: header, search and filters (pilot) | Clients list | S16 (foundation) |
| S18 | Clients list: states, rows, row menu and archive / restore | Clients list | S17 |
| S19 | Client form: fields, contacts, custom fields and create-deal option | Client form (create and edit) | S16 (foundation), S18 |
| S20 | Follow-ups: tabs, filters, list and actions | Follow-ups | S16 (foundation), S18 |
| S21 | Calendar: toolbar, views, team filter, overdue section and page states | Calendar (appointments, follow-ups, contract dates) | S16 (foundation), S18 |
| S22 | Calendar: items, detail panel, Plan activity and rescheduling | Calendar (appointments, follow-ups, contract dates) | S21, S18 |
| S23 | Client detail: header, action bar, summary, custom fields and follow-ups panel | Client detail | S16 (foundation), S18, S20 |
| S24 | Client detail: timeline, activity logging and the appointments tab | Client detail | S23, S18, S22 |
| S25 | Client detail: deals and Wellness+ tabs | Client detail | S24, S18 |
| S26 | Pricing screen: inputs, calculation, warnings and save | Pricing screen (offer builder) | S16 (foundation), S18 |
| S27 | Discount approvals | Discount approvals | S16 (foundation), S18 |
| S28 | Offers list | Offers list | S16 (foundation), S18 |
| S29 | Deal form | Deal form (create and edit) | S16 (foundation), S18 |
| S30 | Deal detail: header, stage, history, activities and the follow-ups panel | Deal detail | S16 (foundation), S18, S24 |
| S31 | Deal detail: offers section and the per-offer action bar | Deal detail | S30, S18 |
| S32 | Deal detail: win, lose, reopen, reassign and delete dialogs | Deal detail | S31, S18 |
| S33 | Pipeline board: columns, cards, move menu and load more | Pipeline board | S16 (foundation), S18, S32 |
| S34 | Pipeline list: filters, table and pagination | Pipeline list | S16 (foundation), S18 |
| S35 | Quotations list | Quotations list (legacy workflow) | S16 (foundation), S18 |
| S36 | Quotation form (create and edit) | Quotation form (create and edit) | S16 (foundation), S18 |
| S37 | Quotation detail | Quotation detail | S16 (foundation), S18 |
| S38 | Invoices list | Invoices list | S16 (foundation), S18 |
| S39 | Invoice detail | Invoice detail | S16 (foundation), S18 |
| S40 | Contracts list | Contracts list | S16 (foundation), S18 |
| S41 | Contract form | Contract form (create and edit) | S16 (foundation), S18 |
| S42 | Contract detail: lifecycle, terms, documents, notes, history and reason dialogs | Contract detail | S16 (foundation), S18 |
| S43 | Contract detail: instalment schedule card, drawer and add-instalment dialog | Contract detail | S42, S18 |
| S44 | Payments overview | Payments overview | S16 (foundation), S18 |
| S45 | Renewals: windows, filters, table, row actions and the not-renewing dialog | Renewals | S16 (foundation), S18 |
| S46 | Performance: comparison, filters, export, person detail and records dialog | Performance | S16 (foundation), S18 |
| S47 | Members list | Members list | S16 (foundation), S18, S25 |
| S48 | Member form (register and edit) | Member form (register and edit) | S16 (foundation), S18 |
| S49 | Member detail: header, action bar and the overview, terms, history and note tabs | Member detail | S16 (foundation), S18 |
| S50 | Member detail: payments and VIP tabs, receipt, void and decision dialogs | Member detail | S49, S18 |
| S51 | Member detail: family tab | Member detail | S50, S18 |
| S52 | Member detail: record payment, correct tier, remove from company, card and status dialogs | Member detail | S51, S18, S25 |
| S53 | Membership payments | Membership payments | S16 (foundation), S18 |
| S54 | Membership reports | Membership reports | S16 (foundation), S18 |
| S55 | Verify member (Reception) | Verify member (Reception) | S16 (foundation), S18 |
| S56 | Employee upload | Employee upload | S16 (foundation), S18 |
| S57 | VIP requests | VIP requests | S16 (foundation), S18, S50 |
| S58 | Settings: Company | Settings: Company | S16 (foundation), S18 |
| S59 | Settings: My profile | Settings: My profile | S16 (foundation), S18, S58 |
| S60 | Settings: Team | Settings: Team | S16 (foundation), S18 |
| S61 | Settings: Roles and permissions | Settings: Roles and permissions | S16 (foundation), S18 |
| S62 | Settings: Lists, all seven tabs | Settings: Lists | S16 (foundation), S18 |
| S63 | Settings: Sales script | Settings: Sales script | S16 (foundation), S18 |
| S64 | Settings: Pricing, tabs, employee bands, risk surcharges, frequencies, zones and discount cap | Settings: Pricing | S16 (foundation), S18 |
| S65 | Settings: Pricing, services, packages, offer wording and test calculator | Settings: Pricing | S64, S18, S62 |
| S66 | Settings: Statuses | Settings: Statuses | S16 (foundation), S18 |
| S67 | Settings: Wellness+ | Settings: Wellness+ | S16 (foundation), S18 |
| S68 | Settings: Contracts and payments | Settings: Contracts and payments | S16 (foundation), S18 |
| S69 | Settings: Audit log | Settings: Audit log | S16 (foundation), S18 |
| S70 | Settings: Integrations | Settings: Integrations | S16 (foundation), S18 |
| S71 | Settings: Client management, custom fields | Settings: Client management | S16 (foundation), S18 |
| S72 | Settings: Client management, forms tab | Settings: Client management | S71, S18 |
| S73 | Settings: Notifications | Settings: Notifications | S16 (foundation), S18 |
| S74 | Settings: Warehouses | Settings: Warehouses | S16 (foundation), S18 |
| S75 | Settings: Categories | Settings: Categories | S16 (foundation), S18 |
| S76 | Form submissions | Form submissions | S16 (foundation), S18, S19 |
| S77 | Form builder: entry point, title bar, status bar, ribbon Home and Insert tabs | Form builder | S16 (foundation), S18, S19 |
| S78 | Form builder: ribbon Layout and contextual tabs, and the properties panel | Form builder | S77, S18 |
| S79 | Form builder: page rail, canvas, add menu and context menu | Form builder | S78, S18 |
| S80 | Dashboard: Sales User and the shared role-dashboard frame | Dashboard: Sales User | S16 (foundation), S18 |
| S81 | Dashboard: Sales Manager | Dashboard: Sales Manager | S16 (foundation), S18, S80 |
| S82 | Dashboard: Administrator | Dashboard: Administrator | S16 (foundation), S18, S80 |
| S83 | Dashboard: CEO | Dashboard: CEO | S16 (foundation), S18, S80 |
| S84 | Dashboard: Business owner (fallback) | Dashboard: Business owner (fallback) | S16 (foundation), S18 |
| S85 | Dashboard: Staff (fallback) | Dashboard: Staff (fallback) | S16 (foundation), S18 |
| S86 | Notifications page | Notifications | S16 (foundation), S18 |
| S87 | Reports | Reports | S16 (foundation), S18 |
| S88 | Inventory list: header, filters and states | Inventory list | S16 (foundation), S18 |
| S89 | Inventory list: rows, selection, bulk actions, stock and delete | Inventory list | S88, S18 |
| S90 | Product form | Product form (create and edit) | S16 (foundation), S18 |
| S91 | Platform: Tenants | Platform: Tenants | S16 (foundation), S18 |
| S92 | Platform: People | Platform: People | S16 (foundation), S18 |
| S93 | Platform: Settings | Platform: Settings | S16 (foundation), S18, S58 |
| S94 | Platform: My profile | Platform: My profile | S16 (foundation), S18 |
| S95 | Platform dashboard, and phase closure | Platform dashboard (Super Admin) | S16 (foundation), S18, S91 |

---

## 6. Detailed slice specifications

Every slice has the fifteen fields the task requires, numbered 1 to 15. Slices S01 to S16 are the foundation; S17 and S18 are the pilot gate; the rest are page tours in the order given in section 5. Shared wording for the page-slice tasks is repeated in each slice on purpose, so that a slice can be handed to an engineer on its own.

### 6.0 Slice index, sizes and exceptions

Production LOC are estimates (assumption A1 and A3), not measurements. Bands: **in** 200 to 300; **near** 150 to 199 (approximately the target); **short** under 150 (documented exception). No slice exceeds 300.

| Slice | Title | Kind | Est. LOC | Band | Steps |
|---|---|---|---|---|---|
| [S01](#s01) | Tour engine model and state machine (pure) | infra | 240 | in | - |
| [S02](#s02) | Target resolver and live DOM synchronisation | infra | 260 | in | - |
| [S03](#s03) | Support store, page-context registry and route-coverage guard | infra | 270 | in | - |
| [S04](#s04) | Step eligibility, progress persistence and lazy copy loader | infra | 240 | in | - |
| [S05](#s05) | Spotlight overlay layer | infra | 240 | in | - |
| [S06](#s06) | Tour popover: content, progress and navigation controls | infra | 290 | in | - |
| [S07](#s07) | Focus management, keyboard and screen-reader announcements | infra | 230 | in | - |
| [S08](#s08) | Support host: session orchestration and mounting | infra | 250 | in | - |
| [S09](#s09) | Support launcher and contextual help panel | infra | 270 | in | - |
| [S10](#s10) | Annotation pass-through on shared UI components | infra | 175 | near | - |
| [S11](#s11) | Shared guidance library and guide-authoring helpers | infra | 280 | in | - |
| [S12](#s12) | Application shell chrome: annotations, layout adapters and shell guide | infra | 230 | in | - |
| [S13](#s13) | Nested layers: dialogs, drawers, menus and tabs | infra | 270 | in | - |
| [S14](#s14) | Explain-only enforcement and safety watchdog | infra | 180 | near | - |
| [S15](#s15) | Explain a control: control list | infra | 240 | in | - |
| [S16](#s16) | Explain a control: pick mode | infra | 200 | in | - |
| [S17](#s17) | Clients list: header, search and filters (pilot) | Clients list | 190 | near | 17 |
| [S18](#s18) | Clients list: states, rows, row menu and archive / restore | Clients list | 232 | in | 21 |
| [S19](#s19) | Client form: fields, contacts, custom fields and create-deal option | Client form (create and edit) | 212 | in | 18 |
| [S20](#s20) | Follow-ups: tabs, filters, list and actions | Follow-ups | 202 | in | 18 |
| [S21](#s21) | Calendar: toolbar, views, team filter, overdue section and page states | Calendar (appointments, follow-ups, contract dates) | 230 | in | 21 |
| [S22](#s22) | Calendar: items, detail panel, Plan activity and rescheduling | Calendar (appointments, follow-ups, contract dates) | 298 | in | 27 |
| [S23](#s23) | Client detail: header, action bar, summary, custom fields and follow-ups panel | Client detail | 212 | in | 18 |
| [S24](#s24) | Client detail: timeline, activity logging and the appointments tab | Client detail | 274 | in | 24 |
| [S25](#s25) | Client detail: deals and Wellness+ tabs | Client detail | 158 | near | 14 |
| [S26](#s26) | Pricing screen: inputs, calculation, warnings and save | Pricing screen (offer builder) | 214 | in | 19 |
| [S27](#s27) | Discount approvals | Discount approvals | 140 | short | 12 |
| [S28](#s28) | Offers list | Offers list | 172 | near | 16 |
| [S29](#s29) | Deal form | Deal form (create and edit) | 154 | near | 14 |
| [S30](#s30) | Deal detail: header, stage, history, activities and the follow-ups panel | Deal detail | 230 | in | 21 |
| [S31](#s31) | Deal detail: offers section and the per-offer action bar | Deal detail | 242 | in | 24 |
| [S32](#s32) | Deal detail: win, lose, reopen, reassign and delete dialogs | Deal detail | 198 | near | 18 |
| [S33](#s33) | Pipeline board: columns, cards, move menu and load more | Pipeline board | 198 | near | 18 |
| [S34](#s34) | Pipeline list: filters, table and pagination | Pipeline list | 232 | in | 22 |
| [S35](#s35) | Quotations list | Quotations list (legacy workflow) | 144 | short | 13 |
| [S36](#s36) | Quotation form (create and edit) | Quotation form (create and edit) | 154 | near | 14 |
| [S37](#s37) | Quotation detail | Quotation detail | 164 | near | 15 |
| [S38](#s38) | Invoices list | Invoices list | 134 | short | 12 |
| [S39](#s39) | Invoice detail | Invoice detail | 104 | short | 9 |
| [S40](#s40) | Contracts list | Contracts list | 172 | near | 16 |
| [S41](#s41) | Contract form | Contract form (create and edit) | 134 | short | 12 |
| [S42](#s42) | Contract detail: lifecycle, terms, documents, notes, history and reason dialogs | Contract detail | 290 | in | 27 |
| [S43](#s43) | Contract detail: instalment schedule card, drawer and add-instalment dialog | Contract detail | 282 | in | 26 |
| [S44](#s44) | Payments overview | Payments overview | 198 | near | 18 |
| [S45](#s45) | Renewals: windows, filters, table, row actions and the not-renewing dialog | Renewals | 212 | in | 20 |
| [S46](#s46) | Performance: comparison, filters, export, person detail and records dialog | Performance | 290 | in | 28 |
| [S47](#s47) | Members list | Members list | 232 | in | 22 |
| [S48](#s48) | Member form (register and edit) | Member form (register and edit) | 192 | near | 18 |
| [S49](#s49) | Member detail: header, action bar and the overview, terms, history and note tabs | Member detail | 290 | in | 28 |
| [S50](#s50) | Member detail: payments and VIP tabs, receipt, void and decision dialogs | Member detail | 290 | in | 29 |
| [S51](#s51) | Member detail: family tab | Member detail | 216 | in | 20 |
| [S52](#s52) | Member detail: record payment, correct tier, remove from company, card and status dialogs | Member detail | 222 | in | 20 |
| [S53](#s53) | Membership payments | Membership payments | 182 | near | 17 |
| [S54](#s54) | Membership reports | Membership reports | 190 | near | 17 |
| [S55](#s55) | Verify member (Reception) | Verify member (Reception) | 144 | short | 13 |
| [S56](#s56) | Employee upload | Employee upload | 230 | in | 21 |
| [S57](#s57) | VIP requests | VIP requests | 164 | near | 15 |
| [S58](#s58) | Settings: Company | Settings: Company | 186 | near | 16 |
| [S59](#s59) | Settings: My profile | Settings: My profile | 164 | near | 15 |
| [S60](#s60) | Settings: Team | Settings: Team | 220 | in | 20 |
| [S61](#s61) | Settings: Roles and permissions | Settings: Roles and permissions | 222 | in | 20 |
| [S62](#s62) | Settings: Lists, all seven tabs | Settings: Lists | 294 | in | 26 |
| [S63](#s63) | Settings: Sales script | Settings: Sales script | 182 | near | 17 |
| [S64](#s64) | Settings: Pricing, tabs, employee bands, risk surcharges, frequencies, zones and discount cap | Settings: Pricing | 286 | in | 27 |
| [S65](#s65) | Settings: Pricing, services, packages, offer wording and test calculator | Settings: Pricing | 232 | in | 23 |
| [S66](#s66) | Settings: Statuses | Settings: Statuses | 154 | near | 14 |
| [S67](#s67) | Settings: Wellness+ | Settings: Wellness+ | 242 | in | 23 |
| [S68](#s68) | Settings: Contracts and payments | Settings: Contracts and payments | 84 | short | 7 |
| [S69](#s69) | Settings: Audit log | Settings: Audit log | 182 | near | 17 |
| [S70](#s70) | Settings: Integrations | Settings: Integrations | 114 | short | 10 |
| [S71](#s71) | Settings: Client management, custom fields | Settings: Client management | 240 | in | 22 |
| [S72](#s72) | Settings: Client management, forms tab | Settings: Client management | 192 | near | 19 |
| [S73](#s73) | Settings: Notifications | Settings: Notifications | 144 | short | 13 |
| [S74](#s74) | Settings: Warehouses | Settings: Warehouses | 134 | short | 12 |
| [S75](#s75) | Settings: Categories | Settings: Categories | 154 | near | 14 |
| [S76](#s76) | Form submissions | Form submissions | 124 | short | 11 |
| [S77](#s77) | Form builder: entry point, title bar, status bar, ribbon Home and Insert tabs | Form builder | 289 | in | 24 |
| [S78](#s78) | Form builder: ribbon Layout and contextual tabs, and the properties panel | Form builder | 296 | in | 28 |
| [S79](#s79) | Form builder: page rail, canvas, add menu and context menu | Form builder | 210 | in | 19 |
| [S80](#s80) | Dashboard: Sales User and the shared role-dashboard frame | Dashboard: Sales User | 190 | near | 16 |
| [S81](#s81) | Dashboard: Sales Manager | Dashboard: Sales Manager | 118 | short | 9 |
| [S82](#s82) | Dashboard: Administrator | Dashboard: Administrator | 104 | short | 9 |
| [S83](#s83) | Dashboard: CEO | Dashboard: CEO | 124 | short | 11 |
| [S84](#s84) | Dashboard: Business owner (fallback) | Dashboard: Business owner (fallback) | 114 | short | 10 |
| [S85](#s85) | Dashboard: Staff (fallback) | Dashboard: Staff (fallback) | 134 | short | 12 |
| [S86](#s86) | Notifications page | Notifications | 94 | short | 8 |
| [S87](#s87) | Reports | Reports | 172 | near | 16 |
| [S88](#s88) | Inventory list: header, filters and states | Inventory list | 154 | near | 14 |
| [S89](#s89) | Inventory list: rows, selection, bulk actions, stock and delete | Inventory list | 232 | in | 22 |
| [S90](#s90) | Product form | Product form (create and edit) | 298 | in | 28 |
| [S91](#s91) | Platform: Tenants | Platform: Tenants | 202 | in | 18 |
| [S92](#s92) | Platform: People | Platform: People | 292 | in | 27 |
| [S93](#s93) | Platform: Settings | Platform: Settings | 192 | near | 18 |
| [S94](#s94) | Platform: My profile | Platform: My profile | 144 | short | 13 |
| [S95](#s95) | Platform dashboard, and phase closure | Platform dashboard (Super Admin) | 110 | short | 9 |

**Distribution.** Infrastructure (16): 14 in band, 2 near, 0 short. Page-tour slices (79): 35 in band, 25 near, 19 short. Total estimated production code: about 19,302 lines.

**Exception E1: short page slices.** These pages expose fewer than about 14 functional controls, so a single-page slice cannot reach 150 lines, and the rules forbid both combining two pages in one slice and padding. Each was already merged with every neighbouring slice of the *same* page that fitted within 300 lines. They are accepted as exceptions if decision D1 is confirmed.

| Slice | Page | Est. LOC | Steps | Why it cannot be larger |
|---|---|---|---|---|
| [S27](#s27) | Discount approvals | 140 | 12 | One small screen: 12 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S35](#s35) | Quotations list (legacy workflow) | 144 | 13 | One small screen: 13 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S38](#s38) | Invoices list | 134 | 12 | One small screen: 12 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S39](#s39) | Invoice detail | 104 | 9 | One small screen: 9 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S41](#s41) | Contract form (create and edit) | 134 | 12 | One small screen: 12 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S55](#s55) | Verify member (Reception) | 144 | 13 | One small screen: 13 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S68](#s68) | Settings: Contracts and payments | 84 | 7 | One small screen: 7 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S70](#s70) | Settings: Integrations | 114 | 10 | One small screen: 10 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S73](#s73) | Settings: Notifications | 144 | 13 | One small screen: 13 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S74](#s74) | Settings: Warehouses | 134 | 12 | One small screen: 12 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S76](#s76) | Form submissions | 124 | 11 | One small screen: 11 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S81](#s81) | Dashboard: Sales Manager | 118 | 9 | One small screen: 9 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S82](#s82) | Dashboard: Administrator | 104 | 9 | One small screen: 9 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S83](#s83) | Dashboard: CEO | 124 | 11 | One small screen: 11 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S84](#s84) | Dashboard: Business owner (fallback) | 114 | 10 | One small screen: 10 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S85](#s85) | Dashboard: Staff (fallback) | 134 | 12 | One small screen: 12 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S86](#s86) | Notifications | 94 | 8 | One small screen: 8 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S94](#s94) | Platform: My profile | 144 | 13 | One small screen: 13 explainable controls and states; no neighbouring slice of the same page exists to merge with. |
| [S95](#s95) | Platform dashboard (Super Admin) | 110 | 9 | One small screen: 9 explainable controls and states; no neighbouring slice of the same page exists to merge with. |

Slices in the 150 to 199 band are listed in the index above; they are within about 25% of the lower bound and are not treated as exceptions, but the reviewer may reclassify them (D1).

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

- **SA-1** On the page's route(s), Support → Tour this page reaches the last step of the slice for a user holding every permission involved; Back, Skip tour and Exit behave as specified in S06 to S08.
- **SA-2** Zero data-changing requests during the tour; explained controls cannot be activated while it runs.
- **SA-3** Tests, typecheck, lint, `check:translations` and build pass; every step has a `title` and `body` in `en` and `sq`.
- **SA-4** The page appears in the Support panel with Explain a control listing the slice's controls that exist on screen.

**Standard evidence (SE).**

- **SE-1** Red-then-green commit history. **SE-2** Vitest report for the guide test and the touched components' tests. **SE-3** Playwright report for the page's row, desktop and 360 px, with one screenshot of the highlighted state per area of the slice. **SE-4** Measured production LOC next to the estimate; the page's row in 7.3 true for the states the slice claims.

#### Foundation (infrastructure only)

### S01: Tour engine model and state machine (pure)

1. **Slice id and title:** S01. Tour engine model and state machine (pure). Branch `support-slice-1-tour-engine-model-and-state-machine`.
2. **Scope:** The data model (`PageGuide`, `GuideStep`, `TargetSpec`, `Requirement`) and a framework-free reducer that owns every tour transition. No React, no DOM.
3. **Purpose:** Everything else (resolver, overlay, host) renders or feeds this machine. Making it pure lets the Next/Back/Skip/Exit/finish rules, the shrinking-step-list rule and the waiting/lost states be proven with table-driven tests before any UI exists.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-03, SUP-08, SUP-10, SUP-17.
5. **Prerequisites:** none inside the phase. Existing functionality it builds on: nothing (new modules).
6. **Production LOC estimate:** **~240** (within the 200 to 300 target): types.ts: GuideStep, PageGuide, TargetSpec, Requirement, StepSafety, MachineState, MachineEvent ~70; tourMachine.ts: reducer + selectors (progress, current, isLast, canBack) ~170
7. **Files and components:**
   - New: `src/lib/support/types.ts`, `src/lib/support/tourMachine.ts`, `src/lib/support/tourMachine.test.ts`
8. **Implementation tasks (in order):**
   1. Write failing table-driven tests first (see Testing), run them and confirm they fail because `tourMachine` does not exist.
   2. Define the types. A step is `{ id, target, kind, safety, repeat?, within?, requires?, opens?, group?, use?, vars?, scope? }`; user-visible text is never stored here, only keys derived from `pageId` + `step.id` (`<pageId>.<stepId>.title|body|when|warning|disabled`). `safety` is `explain-only` (default) or `try-it`.
   3. Define machine states: `idle`, `running` (`steps`, `index`), `waiting` (`reason: loading | user-action`, with the parent index), `lost` (target vanished mid-step), `finished` (`outcome: completed | skipped | exited`).
   4. Define events: `START`, `NEXT`, `BACK`, `SKIP_TOUR`, `EXIT`, `STEPS_CHANGED(eligibleIds)`, `TARGET_PENDING`, `TARGET_READY`, `TARGET_LOST`, `TARGET_RESTORED`, `HOLD_FOR_USER(layerId)`, `LAYER_OPENED`, `LAYER_CLOSED`.
   5. Implement the reducer. Decisions encoded here: **Exit** closes now and keeps the resume point; **Skip tour** ends now and marks the guide dismissed; **Next on the last step** finishes with `completed`; **Back at index 0** is a no-op; a `STEPS_CHANGED` that removes the current step re-anchors to the nearest following eligible step (or the last one).
   6. Export selectors `progress(state) -> { index, total }` (index is the position inside the *currently eligible* list), `currentStep`, `isLast`, `canGoBack`.
   7. Refactor; confirm the module imports nothing from React, the DOM or the router.
9. **Runtime behavior:**
   - Not user-visible. Defines the observable contract used by S06-S09: a tour is always in exactly one machine state, and every state has an exit.
10. **Dynamic UI considerations:**
   - `STEPS_CHANGED` is the single entry point for "the page changed under the tour": the list may grow or shrink at any time and the index is re-derived from the current step id, never kept as a bare number.
   - A step whose target is gone moves the machine to `lost` rather than throwing or advancing silently.
11. **Testing requirements:**
   - SUP-03: table-driven transitions for every (state, event) pair, including NEXT on the last step, BACK on the first, EXIT then START resuming at the saved index.
   - SUP-08: `STEPS_CHANGED` removing the current step, removing an earlier step (index shifts, current step unchanged), adding a step before the current one.
   - SUP-10: `HOLD_FOR_USER` then `LAYER_OPENED` enters the nested group; `LAYER_CLOSED` returns to the parent step.
   - A source-grep test: `tourMachine.ts` and `types.ts` import neither `react`, `react-dom`, `react-router-dom` nor any `document`/`window` global.
12. **Acceptance criteria:**
   - All machine tests pass.
   - The reducer is deterministic: the same event sequence yields the same state (asserted by replaying a recorded sequence).
   - No file in the slice touches an existing source file.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (240); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S02, S03, S04, S11. S02-S08 import `types.ts` and drive the machine through dispatched events only. Terminology fixed for the phase: Exit = keep resume point; Skip tour = dismiss.

### S02: Target resolver and live DOM synchronisation

1. **Slice id and title:** S02. Target resolver and live DOM synchronisation. Branch `support-slice-2-target-resolver-and-live-dom-synchronisation`.
2. **Scope:** Finds the real element for a step, reports its status, and re-evaluates whenever the page changes. One shared `MutationObserver`, one `ResizeObserver` per active target.
3. **Purpose:** This is the answer to the "dynamic data" requirement. Targets are looked up in the live DOM at the moment they are needed and again on every settled change, so the tour can never hold a stale element reference.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-06, SUP-07, SUP-08, SUP-15.
5. **Prerequisites:** S01 (Tour engine model and state machine (pure)). Existing functionality it builds on: `setupTests.ts`.
6. **Production LOC estimate:** **~260** (within the 200 to 300 target): targetResolver.ts: selector build, scope root, visibility, disabled, pick strategy, `within`, status ~100; domObserverHub.ts: single MutationObserver, rAF-batched, subscriber set, attribute filter ~80; useTargetElement.ts: hook returning `{ element, status, rect }`, ResizeObserver, unmount cleanup ~80
7. **Files and components:**
   - Existing, touched: `src/setupTests.ts` (test-only: ResizeObserver stub; not counted)
   - New: `src/lib/support/targetResolver.ts`, `src/lib/support/domObserverHub.ts`, `src/lib/support/useTargetElement.ts`, `src/lib/support/targetResolver.test.tsx`, `src/lib/support/useTargetElement.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first, run, confirm they fail for the expected reason (modules absent).
   2. Selector rule: a target id `a.b.c` resolves with `[data-tour~="a.b.c"]` (space-separated token match so one element can carry two ids). Ids are namespaced `<pageId>.<control>`; shell ids use the `shell.` prefix.
   3. Scope root: the topmost open layer (`[role="dialog"][aria-modal="true"]`, `[role="menu"]`, or an element carrying `data-tour-layer`) if one is open, otherwise `document` restricted to `main`. A step may force the root with `scope: "page" | "shell" | "layer"`.
   4. Status per lookup: `found` (connected, laid out, not `aria-hidden`), `disabled` (found, `disabled` or `aria-disabled="true"`), `offscreen` (found, outside the viewport), `pending` (absent but an ancestor of the expected location has `aria-busy="true"` or `data-tour-busy`), `missing`, `lost` (was found earlier for this step, now disconnected).
   5. Pick strategy for repeated ids: `first` visible in DOM order (default), `nth`, or `within` a parent target so row-level controls resolve inside the first row.
   6. Observer hub: one `MutationObserver` on `document.body` (childList, subtree, attributes limited to `data-tour`, `disabled`, `aria-disabled`, `aria-hidden`, `aria-busy`, `hidden`, `class`), callbacks batched with `requestAnimationFrame`; subscribers register a callback and get one notification per frame.
   7. `useTargetElement(spec)` subscribes to the hub, returns the element/status/rect, attaches a `ResizeObserver` to the element while it is the active target, and unsubscribes on unmount or when the spec changes.
   8. Development-only guard: when a non-`repeat` id is found on more than one *visible* element, `console.warn` once per id with both elements' tag/classes.
   9. Refactor; verify there is no module-level mutable state besides the hub singleton.
9. **Runtime behavior:**
   - Not user-visible. After this slice a hook can answer "where is the control called `clients.list.add` right now, and in what state?" at any moment.
10. **Dynamic UI considerations:**
   - Nodes added, removed, replaced (same id, new element) and toggled disabled all produce exactly one status update per frame.
   - A replaced element is detected by identity (`element !== previous`) and re-measured; the step does not restart.
   - Duplicate registrations: tolerated for ids declared `repeat`, warned in development for all others; the resolver still returns the first visible instance so production never breaks.
   - jsdom has no layout: tests inject rects through a `getBoundingClientRect` stub helper; real geometry is verified in Playwright from S09.
11. **Testing requirements:**
   - SUP-06: add, remove, replace and disable a target node and assert status transitions `missing -> found -> lost -> found -> disabled`.
   - SUP-07: three `repeat` rows; remove the first; `first` pick moves to the second without a new subscription.
   - SUP-08: `aria-busy` ancestor reports `pending`, then `missing` after the configured wait using fake timers; a dev duplicate warns exactly once.
   - SUP-10 groundwork: with an open `role="dialog"` the scope root becomes the dialog and targets outside it report `missing`.
   - Unmount removes the observer callbacks (hub subscriber count returns to zero).
12. **Acceptance criteria:**
   - All resolver tests pass.
   - Importing the module has no side effect until the first subscription (no observer is created at import).
   - No existing production file is modified.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (260); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S05, S08, S10. S05 and S08 consume `useTargetElement`. Every later page slice may rely on `data-tour` tokens, `repeat`/`within` picking and the `pending/missing/lost` vocabulary.

### S03: Support store, page-context registry and route-coverage guard

1. **Slice id and title:** S03. Support store, page-context registry and route-coverage guard. Branch `support-slice-3-support-store-page-context-registry-and`.
2. **Scope:** A zustand store for the Support session, and a registry that turns the current URL into a page id, with a test that fails when a route is neither mapped nor explicitly excluded.
3. **Purpose:** Route-aware page detection and the traceability guarantee (SUP-20). Following `mobile360Coverage.test.ts`, a new route cannot be added without deciding its Support status.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-01, SUP-19, SUP-20.
5. **Prerequisites:** S01 (Tour engine model and state machine (pure)). Existing functionality it builds on: `routes/index.tsx`.
6. **Production LOC estimate:** **~270** (within the 200 to 300 target): useSupportStore.ts: panelOpen, mode (`tour|single|pick|none`), session, context `{pageId, variant, scope}`, actions ~90; routeMap.ts: ordered `{pattern, pageId | null, reason?}` for every route in the inventory + `PLANNED_PAGES` ~90; pageRegistry.ts: `resolvePageId(pathname, variant)` via `matchPath`, lazy guide loader table, `isExcluded` ~60; useSupportPage.ts: hook reading `useLocation` + store variant/scope ~30
7. **Files and components:**
   - Existing, touched: `src/routes/index.tsx` (read only: exported `routes` array is walked by the test)
   - New: `src/store/useSupportStore.ts`, `src/lib/support/routeMap.ts`, `src/lib/support/pageRegistry.ts`, `src/lib/support/useSupportPage.ts`, `src/lib/support/routeMap.test.ts`, `src/store/useSupportStore.test.ts`
8. **Implementation tasks (in order):**
   1. Write failing tests first (route walker, resolver cases, store transitions).
   2. Create `useSupportStore` following `useSalesScriptStore.ts` / `useThemeStore.ts` style: plain `create`, no persistence (persistence is S04).
   3. Create `routeMap.ts`: one entry per route pattern relative to `/:tenantSlug` (e.g. `clients/:clientId`, `settings/pricing/:tab?`) plus the `/admin*` patterns. Entries point to a page id; excluded routes carry `pageId: null` and a `reason` (print views, pre-login pages, public customer pages, 403/404). `PLANNED_PAGES` lists page ids whose guide does not exist yet.
   4. Create `pageRegistry.ts`: `resolvePageId` strips the `/:tenantSlug` prefix, tries patterns in declaration order with `matchPath`, and appends the dashboard variant (`dashboard.<variant>`). Guides are loaded through `const loaders: Record<PageId, () => Promise<PageGuide>>` using dynamic `import()` so the guides are code-split (SUP-19).
   5. Create `useSupportPage()` returning `{ pageId, scope, hasGuide, isPlanned }`; `scope` carries the active tab for pages with `:tab?` routes.
   6. Write the coverage test: walk the exported `routes` array recursively, build full patterns, and assert each is present in `routeMap` (mapped or excluded with reason); assert no `routeMap` entry refers to a route that no longer exists; assert every page id in `routeMap` is either in `loaders` or in `PLANNED_PAGES`.
   7. Add the guard test "no planned pages remain" as an `it.todo`. Each page slice deletes its own id from `PLANNED_PAGES`; the last page slice (S95) empties it and turns the `it.todo` into a real test.
9. **Runtime behavior:**
   - Not user-visible. The store exists; no component reads it yet.
10. **Dynamic UI considerations:**
   - Page id is derived, never stored: navigating changes `useSupportPage()` output on the same render as the router.
   - Variant and tab are published by pages (`setContext`) and cleared on unmount, so a stale variant cannot leak to the next page.
11. **Testing requirements:**
   - SUP-20: the route walker (every `path` in `routes` is mapped or excluded; no orphan entries).
   - SUP-01: `resolvePageId` for representative URLs: `/acme/clients`, `/acme/clients/c1`, `/acme/clients/new`, `/acme/clients/c1/edit`, `/acme/settings/pricing/zones`, `/acme/deals/d1/pricing`, `/admin/tenants`, `/acme/dashboard` with and without a variant.
   - SUP-19: loaders are functions (no guide module is imported eagerly): asserted by grepping `pageRegistry.ts` for static `guides/` imports.
   - Store: open/close panel, set/clear context, mode transitions.
12. **Acceptance criteria:**
   - The coverage test passes against the real router today.
   - Adding a throw-away route to a copy of the table in the test makes the test fail with a message naming the route.
   - Only new files are added; `routes/index.tsx` is unchanged.
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

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (270); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S04, S08. Every page slice adds exactly: one `loaders` line, flips one `routeMap` entry from planned to mapped, and removes the id from `PLANNED_PAGES`. S09 reads `useSupportPage()` to decide what the Support panel offers.

### S04: Step eligibility, progress persistence and lazy copy loader

1. **Slice id and title:** S04. Step eligibility, progress persistence and lazy copy loader. Branch `support-slice-4-step-eligibility-progress-persistence-and-lazy`.
2. **Scope:** Decides which steps apply to this user right now (permission, scope, workflow, viewport), remembers progress per user, and loads Support copy on demand instead of bundling it.
3. **Purpose:** Keeps the tour honest about permissions (SUP-09), resumable (SUP-17) and free for users who never open Support (SUP-19: every `locales/*` file is statically imported today, so support copy for ~60 pages must not join that bundle).
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-09, SUP-17, SUP-18, SUP-19.
5. **Prerequisites:** S01 (Tour engine model and state machine (pure)); S03 (Support store, page-context registry and route-coverage guard). Existing functionality it builds on: `i18n/config.ts`, `store/useAuthStore.ts`, `frontend/scripts/check-translations.mjs`.
6. **Production LOC estimate:** **~240** (within the 200 to 300 target): stepEligibility.ts: `requires` evaluation over `user.permissions` (key present, min scope), workflow, viewport; `useEligibleSteps` ~90; progressStorage.ts: versioned localStorage map keyed by user+tenant, safe read/write, `completed|dismissed|lastStepId` ~90; supportCopy.ts: `loadSupportCopy(ns, lng)` via `import.meta.glob`, `addResourceBundle`, reload on `languageChanged` ~60
7. **Files and components:**
   - Existing, touched: `src/i18n/config.ts` (NAMESPACES list), `src/store/useAuthStore.ts` (read: `permissions`, `permissionsVersion`, `tenantSalesWorkflow`), `scripts/check-translations.mjs` (read: scans `locales/<lng>/*.json`)
   - New: `src/lib/support/stepEligibility.ts`, `src/lib/support/progressStorage.ts`, `src/lib/support/supportCopy.ts`, `src/lib/support/stepEligibility.test.ts`, `src/lib/support/progressStorage.test.ts`, `src/lib/support/supportCopy.test.ts`
8. **Implementation tasks (in order):**
   1. Write failing tests first.
   2. `Requirement` shape: `{ permission?: string | string[]; anyPermission?: string[]; minScope?: "OWN"|"TEAM"|"ALL"; workflow?: "SALES_PROCESS"|"LEGACY_QUOTATIONS"; viewport?: "desktop"|"mobile" }`. Semantics copy `usePermission` (a key is held if `permissions[key] !== undefined`) and `useNavigation` (workflow compare) so Support never disagrees with the menu.
   3. `useEligibleSteps(guide)` memoises on `permissionsVersion`, `tenantSalesWorkflow` and the viewport; it never reads `role`.
   4. `progressStorage`: key `wellness-support-progress`, value `{ [userId:tenantSlug]: { [pageId]: { v: guideVersion, completedAt?, dismissedAt?, lastStepId? } } }`; every access wrapped in try/catch (private mode, blocked storage); a record with an older `v` than the guide is treated as absent (guide edits re-offer the tour).
   5. `supportCopy`: `import.meta.glob("../../locales/*/support*.json")` loaders; `loadSupportCopy(ns)` adds the bundle for the active language and for `en` (fallback), and re-runs on `languageChanged` so a language switch mid-tour re-renders text without restarting.
   6. Add namespace names to `NAMESPACES` in `i18n/config.ts` only as *types* (the static import list in `i18n/index.ts` is deliberately not extended).
   7. Refactor; confirm no static import of any `support*.json` exists outside `supportCopy.ts`.
9. **Runtime behavior:**
   - Not user-visible yet. After this slice a guide can say "only for holders of `deals.edit`" and have the engine drop the step, and progress survives reload.
10. **Dynamic UI considerations:**
   - Permission or workflow change (`permissionsVersion` changes on `/auth/me` refresh) re-runs eligibility; the machine receives `STEPS_CHANGED`.
   - Viewport crossing the 768 px breakpoint re-runs eligibility for `viewport`-tagged steps.
11. **Testing requirements:**
   - SUP-09: each `Requirement` field with held/not-held/scope-too-low users; a user holding the permission only at `OWN` fails `minScope: "ALL"`.
   - SUP-09: switching `tenantSalesWorkflow` removes workflow-tagged steps on the next render.
   - SUP-17: round-trip, version bump invalidates, corrupt JSON ignored, `localStorage` that throws does not crash.
   - SUP-18/SUP-19: copy is not present in the i18n store until `loadSupportCopy` runs; after a language change the new language is present; a static-import grep finds none.
12. **Acceptance criteria:**
   - Eligibility, storage and loader tests pass.
   - `npm run check:translations` still passes (no support files exist yet).
   - Bundle check: `npm run build` output is unchanged in size apart from the three small modules (recorded in the PR).
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (240); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S08, S11. S08 filters guides through `useEligibleSteps` and reads/writes progress. Page slices add copy to `support*.json` files without touching `i18n/index.ts`.

### S05: Spotlight overlay layer

1. **Slice id and title:** S05. Spotlight overlay layer. Branch `support-slice-5-spotlight-overlay-layer`.
2. **Scope:** The visual highlight: a dimmed backdrop with a hole around the target, following scroll, resize and layout changes. Visual only: it intercepts no clicks (blocking is S14).
3. **Purpose:** Shows the user *which real control* is being explained, using the live interface rather than screenshots.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-02, SUP-15, SUP-16.
5. **Prerequisites:** S02 (Target resolver and live DOM synchronisation). Existing functionality it builds on: `styles/tokens.css`.
6. **Production LOC estimate:** **~240** (within the 200 to 300 target): SpotlightMask.tsx: four-panel dim around a rounded hole, ring, `aria-hidden`, portal to body ~90; useTargetRect.ts: rect with scroll (capture) / resize / ResizeObserver, rAF-throttled ~60; SpotlightMask.module.css: backdrop, ring, transitions, reduced-motion and forced-colors rules, `--z-tour` ~90
7. **Files and components:**
   - Existing, touched: `src/styles/tokens.css` (add `--z-tour`; `--z-tooltip` is 100 and the impersonation banner is a literal 1000, so the token must exceed 1000)
   - New: `src/components/support/SpotlightMask.tsx`, `src/components/support/SpotlightMask.module.css`, `src/lib/support/useTargetRect.ts`, `src/components/support/SpotlightMask.test.tsx`, `src/components/support/SpotlightMask.stories.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first (rect stubbed).
   2. Add `--z-tour` to `tokens.css` above the banner literal; document the reason in a comment, as other tokens do.
   3. `useTargetRect(element)` returns the padded rect and re-measures on window resize, any ancestor scroll (capture phase, as `DropdownMenu` does), element resize, and hub notifications.
   4. `SpotlightMask` renders four fixed panels (top, bottom, left, right of the hole) rather than a `clip-path`, so page scrolling with the wheel keeps working; the ring is a 2 px outline using the existing focus colour token with an offset.
   5. CSS: transition on position/size only when `prefers-reduced-motion: no-preference`; under `forced-colors: active` the dim is dropped and the ring uses `Highlight`/`CanvasText` so the target stays identifiable.
   6. Story with a fixed target, following the repo's UI-component convention (`*.stories.tsx`, a11y addon).
9. **Runtime behavior:**
   - A highlighted hole follows the target as the page scrolls or resizes. With reduced motion the hole jumps instead of gliding. With no target nothing renders.
10. **Dynamic UI considerations:**
   - If the target moves (layout shift, sidebar open, table re-render) the hole follows within one frame.
   - If the target is replaced by a new node with the same id the hole re-binds without flicker.
11. **Testing requirements:**
   - SUP-02/15: hole equals padded rect; updates on scroll and resize events; renders nothing without a rect.
   - SUP-16: reduced-motion media query removes the transition class (matchMedia stub); forced-colors class present.
   - The panels have `aria-hidden="true"` and `pointer-events: none`.
12. **Acceptance criteria:**
   - Component tests pass; story renders in Storybook with no a11y violations.
   - The overlay never changes layout (no scrollbars appear/disappear when it mounts).
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/styles
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (240); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S06, S08. S08 mounts the mask with the active target element. S14 adds the interaction guard; the mask itself stays purely visual.

### S06: Tour popover: content, progress and navigation controls

1. **Slice id and title:** S06. Tour popover: content, progress and navigation controls. Branch `support-slice-6-tour-popover-content-progress-and-navigation`.
2. **Scope:** The card that explains the step: title, body, "when to use", warning and disabled-hint blocks, progress, Back/Next/Skip tour/Exit, completion state, waiting and lost-target variants, desktop placement and a mobile bottom sheet.
3. **Purpose:** Delivers SUP-03 visually. Content is purely derived from keys, so the same component renders any page's step.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-03, SUP-11, SUP-14, SUP-15, SUP-16.
5. **Prerequisites:** S05 (Spotlight overlay layer). Existing functionality it builds on: `components/ui/Button/Button.tsx`, `components/ui/DropdownMenu/DropdownMenu.tsx`.
6. **Production LOC estimate:** **~290** (within the 200 to 300 target): TourPopover.tsx: variants step | waiting | lost | completed, progress "n of N", buttons, `role="dialog"` ~140; popoverPlacement.ts: prefer side, flip, clamp with margin, arrow offset, sheet mode under 768 px ~60; TourPopover.module.css: card, sheet, arrow, reduced motion ~90
7. **Files and components:**
   - Existing, touched: `src/components/ui/Button/Button.tsx` (reuse as-is), `src/components/ui/DropdownMenu/DropdownMenu.tsx` (reference only for the flip/clamp placement approach; not refactored)
   - New: `src/components/support/TourPopover.tsx`, `src/components/support/TourPopover.module.css`, `src/lib/support/popoverPlacement.ts`, `src/components/support/TourPopover.test.tsx`, `src/lib/support/popoverPlacement.test.ts`, `src/components/support/TourPopover.stories.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first.
   2. `popoverPlacement(targetRect, popoverSize, viewport, preferred)` returns `{ top, left, side, arrow }`: prefers the requested side, flips when it does not fit, clamps within an 8 px margin (same constants as `DropdownMenu`), and returns `mode: "sheet"` below 768 px.
   3. `TourPopover` props: `{ step, copy, index, total, status, onNext, onBack, onSkip, onExit, onFinish }`. Renders `role="dialog"` with `aria-modal="false"`, `aria-labelledby` (title id from `useId`) and `aria-describedby` (body id).
   4. Sections: title; body; "When to use it" (only if the key exists); warning callout for steps flagged destructive (icon plus text, not colour alone); disabled hint appended when `status === "disabled"`.
   5. Navigation: Back (hidden on the first step), Next (becomes "Finish" on the last), "Skip tour", "Exit". Progress is shown as text ("Step 3 of 8") and as a `progress`-role bar with `aria-valuenow`.
   6. Variants: `waiting` ("Loading this part of the page…"), `lost` ("This item changed or is no longer on the page" with Next/Back/Exit), `completed` ("You're done" with Replay and Close).
   7. Under 768 px render as a bottom sheet with `scroll-margin-bottom` support so the highlighted target is not covered (the host passes the sheet height).
   8. Story for each variant.
9. **Runtime behavior:**
   - Popover sits beside the highlighted control (desktop) or docks at the bottom (phone). The user can always Exit. Last step shows Finish, then a completion card.
10. **Dynamic UI considerations:**
   - Total and index come from the currently eligible list, so "Step 3 of 8" can change to "Step 3 of 7" when a step is dropped; the live region (S07) announces the change.
   - If the target is lost mid-step the popover switches to the `lost` variant in place; it does not unmount, so focus is not dropped.
11. **Testing requirements:**
   - SUP-03: every button fires its callback; Back hidden on first; Finish on last; completion variant offers Replay.
   - SUP-14: `aria-labelledby/describedby` resolve to existing nodes; progress has `aria-valuenow/max`.
   - SUP-15: placement unit tests (fits below, flips above, clamps left/right, returns sheet under 768 px).
   - SUP-11: waiting and lost variants render the right text and still expose Exit.
12. **Acceptance criteria:**
   - Component and placement tests pass.
   - Stories for all variants pass the Storybook a11y check.
   - Keyboard order inside the card is Back, Next/Finish, Skip tour, Exit (asserted).
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/ui/Button src/components/ui/DropdownMenu
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (290); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S07, S08. S07 adds focus and keyboard behaviour around this component. S13 reuses the `waiting` variant for "open the dialog to continue".

### S07: Focus management, keyboard and screen-reader announcements

1. **Slice id and title:** S07. Focus management, keyboard and screen-reader announcements. Branch `support-slice-7-focus-management-keyboard-and-screen-reader`.
2. **Scope:** Moves and restores focus, owns tour keyboard shortcuts, announces step changes, and links the highlighted control to its explanation with a reversible `aria-describedby`.
3. **Purpose:** Delivers SUP-13 and SUP-14. `Modal`/`SlideOver` have no focus trap and `Escape` is handled by document listeners, so the tour must arbitrate explicitly instead of assuming a focus-trap library.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-13, SUP-14, SUP-10.
5. **Prerequisites:** S06 (Tour popover: content, progress and navigation controls). Existing functionality it builds on: `components/ui/Modal/Modal.tsx`, `components/ui/SlideOver/SlideOver.tsx`.
6. **Production LOC estimate:** **~230** (within the 200 to 300 target): useTourFocus.ts: remember launcher, focus popover on step change, restore on end ~60; useTourKeyboard.ts: capture-phase Esc, ArrowLeft/Right inside the card, Tab cycling, input guard ~80; LiveAnnouncer.tsx: polite live region, de-duplicated messages ~40; describeTarget.ts: add/restore a token in `aria-describedby` ~50
7. **Files and components:**
   - Existing, touched: `src/components/ui/Modal/Modal.tsx` (read: document-level Escape listener), `src/components/ui/SlideOver/SlideOver.tsx` (read: the same listener)
   - New: `src/lib/support/useTourFocus.ts`, `src/lib/support/useTourKeyboard.ts`, `src/components/support/LiveAnnouncer.tsx`, `src/lib/support/describeTarget.ts`, `src/lib/support/useTourFocus.test.tsx`, `src/lib/support/useTourKeyboard.test.tsx`, `src/lib/support/describeTarget.test.ts`
8. **Implementation tasks (in order):**
   1. Write failing tests first.
   2. `useTourFocus`: store `document.activeElement` at start; on each step focus the popover heading (`tabIndex=-1`); on end restore to the stored element if still connected, else to `main`.
   3. `useTourKeyboard`: one `keydown` listener on `document` in the capture phase while a tour is running. `Escape` -> Exit and `stopPropagation()` so a `Modal`/`SlideOver` behind it does not also close — **except** in `waiting: user-action` where Escape belongs to the app layer the user opened (documented decision; see risk R7). ArrowRight/ArrowLeft act as Next/Back only when focus is inside the popover and never when the focus is in an input, textarea, select or contenteditable.
   4. Tab cycles within the popover's buttons (plus the "Go to the control" button on `try-it` steps) without trapping the page when the tour is in `waiting`.
   5. `LiveAnnouncer`: `role="status"` region; announces "Step n of N: <title>", "Skipped: <title> is not available right now", "Tour closed", and the completion message; identical consecutive messages are suppressed.
   6. `describeTarget(el, id)` appends the body id to the element's existing `aria-describedby` and restores the exact previous value on cleanup (never clobbers an existing description).
9. **Runtime behavior:**
   - Screen-reader users hear the step title and position; keyboard users can drive the whole tour and always get back to where they started. Escape exits the tour without closing an unrelated dialog.
10. **Dynamic UI considerations:**
   - When the eligible list shrinks mid-tour the announcer says so once.
   - When the target element is replaced, `describeTarget` moves the description to the new node.
11. **Testing requirements:**
   - SUP-13: Esc exits and restores focus to the launcher; Esc in `waiting` is not intercepted; arrows ignored while typing in an input.
   - SUP-14: announcer text for next/back/skip-missing/finish; duplicate suppression; described-by add and exact restore, including when an existing value is present.
   - SUP-10: with a `Modal` open behind the tour, Esc closes only the tour (the modal's `onClose` is not called).
12. **Acceptance criteria:**
   - Tests pass.
   - Manual keyboard pass recorded in the PR: start, Next, Back, Esc, restore.
   - No global shortcut is registered while no tour runs (asserted by listener count).
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/ui/Modal src/components/ui/SlideOver
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (230); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S08. S08 wires these hooks into the host. S13 relies on the Esc arbitration rule.

### S08: Support host: session orchestration and mounting

1. **Slice id and title:** S08. Support host: session orchestration and mounting. Branch `support-slice-8-support-host-session-orchestration-and-mounting`.
2. **Scope:** The component that joins machine, resolver, eligibility, overlay, popover and accessibility into one running tour, plus scroll-into-view, missing/pending/lost handling and route-change handling. Mounted once per shell.
3. **Purpose:** Makes the engine run end-to-end for a fixture guide. `TenantGuard` already hosts `SalesScriptPanelHost` because every page mounts its own `AppLayout`; the Support host follows the same precedent so a tour survives page-internal re-renders.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-02, SUP-03, SUP-06, SUP-08, SUP-15, SUP-17, SUP-19.
5. **Prerequisites:** S03 (Support store, page-context registry and route-coverage guard); S04 (Step eligibility, progress persistence and lazy copy loader); S05 (Spotlight overlay layer); S06 (Tour popover: content, progress and navigation controls); S07 (Focus management, keyboard and screen-reader announcements); S02 (Target resolver and live DOM synchronisation). Existing functionality it builds on: `routes/TenantGuard.tsx`, `pages/shell/SuperAdminShell.tsx`, `components/panels/SalesScriptPanel/SalesScriptPanel.tsx`.
6. **Production LOC estimate:** **~250** (within the 200 to 300 target): SupportHost.tsx: lazy mount, composes mask + popover + announcer, portal ~60; useTourSession.ts: machine + resolver + eligibility + progress; skip/wait/lost policy; route-change end ~150; scrollTargetIntoView.ts: reduced-motion-aware `scrollIntoView`, sticky-header offset, sheet clearance ~30; TenantGuard.tsx / SuperAdminShell.tsx mounts (`React.lazy` + `Suspense`) ~10
7. **Files and components:**
   - Existing, touched: `src/routes/TenantGuard.tsx`, `src/pages/shell/SuperAdminShell.tsx`, `src/components/panels/SalesScriptPanel/SalesScriptPanel.tsx` (pattern reference)
   - New: `src/components/support/SupportHost.tsx`, `src/lib/support/useTourSession.ts`, `src/lib/support/scrollTargetIntoView.ts`, `src/components/support/SupportHost.test.tsx`, `src/lib/support/useTourSession.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first using a fixture guide registered through the test seam of `pageRegistry` (no real page guide exists yet).
   2. `useTourSession` policy, as testable functions: on entering a step resolve its target; `found/disabled` -> show; `offscreen` -> `scrollTargetIntoView` then show; `pending` -> `waiting(loading)` for at most 4 s; `missing` (or pending timeout) -> announce "Skipped" and advance (or finish if it was the last); `lost` -> machine `lost`, and if the same id reappears within the session the step is restored.
   3. Route change: when `useSupportPage().pageId` changes while a tour runs, end the tour with outcome `exited`, save `lastStepId`, announce "Tour closed because you moved to another page".
   4. Persist: `completed` on finish, `dismissed` on Skip tour, `lastStepId` on Exit.
   5. `SupportHost` is `React.lazy` + `Suspense fallback={null}` and renders nothing until the store says a session exists, so the cost for users who never open Support is the lazy chunk reference (SUP-19).
   6. Mount in `TenantGuard` next to `SalesScriptPanelHost`, and in `SuperAdminShell` (which all six `/admin*` routes share, so `routes/index.tsx` stays unchanged).
   7. Wire `useTourFocus`, `useTourKeyboard`, `LiveAnnouncer`, `describeTarget`.
9. **Runtime behavior:**
   - With the fixture guide started from the store: spotlight and popover appear on the first eligible step, Next/Back work, a missing step is skipped with an announcement, a tour left by navigation closes cleanly, and normal use resumes (no leftover overlay, listeners, attributes or focus changes).
10. **Dynamic UI considerations:**
   - This slice is where "target disappears, becomes disabled, moves, or is replaced while a tour is active" is first proven end to end with an integration test that mutates a fixture DOM during a running tour.
   - Eligible list changes (permission/workflow) re-enter via `STEPS_CHANGED`.
11. **Testing requirements:**
   - SUP-02/03: a three-step fixture runs from start to completion; progress persisted as completed.
   - SUP-06/08: remove step 2's target before reaching it (skipped + announced), remove the current target (lost variant), re-add it (restored), disable it (hint shown), replace it (spotlight follows).
   - SUP-17: Exit then restart resumes at `lastStepId`; Skip tour marks dismissed.
   - SUP-19: with no session, `SupportHost` renders null and registers zero observers/listeners.
   - Cleanup test: after finish the DOM has no `aria-describedby` residue, no overlay nodes and no document listeners from the tour.
12. **Acceptance criteria:**
   - Integration tests pass.
   - Playwright is not required yet (no user-visible launcher until S09).
   - `routes/index.tsx` is unmodified.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/routes src/pages/shell src/components/panels/SalesScriptPanel
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (250); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S09, S12, S13. S09 only needs to call `useSupportStore.getState().startTour()` to start a real tour. S13 and S14 extend `useTourSession` rather than replacing it.

### S09: Support launcher and contextual help panel

1. **Slice id and title:** S09. Support launcher and contextual help panel. Branch `support-slice-9-support-launcher-and-contextual-help-panel`.
2. **Scope:** Replaces the two dead Support entry points with one working launcher, and adds the panel that offers page-specific actions. Adds the Playwright `support` project and a first end-to-end case.
3. **Purpose:** Delivers SUP-01. Two controls already pretend to be Support and do nothing: the header `HelpCircle` button (no `onClick`) and the sidebar "Support" item (`href="#support"` with `preventDefault`). Both become real, and neither is left dead.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-01, SUP-03, SUP-14, SUP-15, SUP-17, SUP-18.
5. **Prerequisites:** S08 (Support host: session orchestration and mounting). Existing functionality it builds on: `components/layout/AppLayout/AppLayout.tsx`, `components/layout/Sidebar/Sidebar.tsx`, `locales/en/common.json`.
6. **Production LOC estimate:** **~270** (within the 200 to 300 target): SupportLauncher.tsx: icon button + `openPanel`, `aria-expanded`, shared by header and sidebar ~40; SupportPanel.tsx: title of current page/tab, actions, status line, no-guide and planned-page states, Esc/outside close, close on route change ~130; SupportPanel.module.css: anchored popover, bottom sheet under 768 px, reduced motion ~80; AppLayout.tsx / Sidebar.tsx / playwright.config.ts edits ~20
7. **Files and components:**
   - Existing, touched: `src/components/layout/AppLayout/AppLayout.tsx` (header help button), `src/components/layout/Sidebar/Sidebar.tsx` (bottom "Support" link), `src/locales/en/common.json` (`header.help`, `actions.support` already exist), `src/i18n/config.ts` (add `support` namespace name), `playwright.config.ts`, `tests/e2e/mobile360.spec.ts`
   - New: `src/components/support/SupportLauncher.tsx`, `src/components/support/SupportPanel.tsx`, `src/components/support/SupportPanel.module.css`, `src/locales/en/support.json`, `src/locales/sq/support.json`, `tests/e2e/support.spec.ts`, `src/components/support/SupportPanel.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first (panel states, launcher wiring, sidebar link no longer `preventDefault`-dead).
   2. `SupportLauncher` replaces the `<button className={helpBtn}>` in `AppLayout.tsx`; keep the existing class and `aria-label` (`header.help`), add `aria-haspopup="dialog"`, `aria-expanded`. The Sidebar "Support" item calls the same store action (also closing the mobile sidebar).
   3. `SupportPanel` reads `useSupportPage()`: heading "Help for <page or tab title>"; **Tour this page** (label becomes **Tour this tab** when `scope` is set); **Resume tour (step n of N)** when `lastStepId` exists; **Replay tour** after completion with a completed mark; **No help yet** state for planned pages (honest: names the page, offers nothing fake); **Exit** closes the panel.
   4. Panel closes on route change, outside click and Escape; focus returns to the launcher.
   5. Load `support` copy through `loadSupportCopy` on first open (SUP-19); the panel renders a skeleton for the instant it takes.
   6. Create `support.json` (en, sq) for panel strings; el/it fall back to en (allowed by `check-translations` for non-required languages).
   7. Playwright: add a `support` project (desktop Chrome, depends on `setup`, like `desktop`), a first case "open Support on the dashboard and see the panel", and add the panel to `mobile360.spec.ts` at 360 px (no horizontal overflow, panel fully visible).
9. **Runtime behavior:**
   - Clicking the header help button or the sidebar Support item opens the panel. On a page without a guide yet the panel says so. Choosing Tour this page starts the tour from S08 for pages that have a guide (none until S17).
10. **Dynamic UI considerations:**
   - The panel reflects the current route at all times: after navigation it re-resolves the page id; for tabbed pages it re-resolves when the tab changes.
   - It never shows actions for a guide the user is not eligible for (zero eligible steps -> treated as no guide).
11. **Testing requirements:**
   - SUP-01: panel shows the resolved page title; planned page shows the no-help state; excluded route never mounts the launcher (public pages have no `AppLayout`).
   - SUP-17: resume/replay labels from stored progress.
   - SUP-14/15: launcher is a real `button` with `aria-expanded`; 360 px Playwright case; focus returns to launcher.
   - Regression: existing `AppLayout.test.tsx` and `Sidebar.test.tsx` still pass.
12. **Acceptance criteria:**
   - The two formerly dead controls are live and covered by tests.
   - `npx playwright test --project=support` and `--project=mobile-360` include the panel case.
   - `npm run check:translations` passes with the new `support.json`.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/layout/AppLayout src/components/layout/Sidebar
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --project=mobile-360   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (270); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S15. Every page slice from S17 makes its page appear in this panel simply by registering a guide. S15 adds the "Explain a control" action to this panel.

### S10: Annotation pass-through on shared UI components

1. **Slice id and title:** S10. Annotation pass-through on shared UI components. Branch `support-slice-10-annotation-pass-through-on-shared-ui`.
2. **Scope:** A tiny typed helper `tourProps(id, opts)` and `tourId` props on the shared components that cannot currently carry a `data-tour` attribute on the right element.
3. **Purpose:** `Button`, `TextInput`, `SelectInput` already spread rest props onto their element, but `DataTable` rows/headers, `Tabs`, `Pagination`, `DropdownMenu` items, `Modal`, `SlideOver`, `ConfirmDialog`, `Card`/`KpiTile` and the field containers do not. Without this, every page would hand-roll wrappers.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-05, SUP-07.
5. **Prerequisites:** S02 (Target resolver and live DOM synchronisation). Existing functionality it builds on: `components/ui/DataTable/DataTable.tsx`, `components/ui/Tabs/Tabs.tsx`, `components/ui/Pagination/*`.
6. **Production LOC estimate:** **~175** (just under the target (150 to 199)): tourProps.ts: builds `{ "data-tour": id, "data-tour-repeat"?: true }`, dev check of id format `^[a-z][A-Za-z0-9]*(\.[a-z][A-Za-z0-9-]*)+$` ~30; DataTable: `rowTourId`, `tourId` on wrapper/header/sort/empty/loading; both desktop table and mobile card layouts ~45; Tabs / Pagination / Card / KPICard: `tourId` (+ per-tab ids `<id>.tab.<tab>`) ~35; DropdownMenu item `tourId`; Modal / SlideOver / ConfirmDialog `tourId` on the dialog root ~40; TextInput / SelectInput: `tourId` on the field container (label + control), not only the `<input>` ~25
7. **Files and components:**
   - Existing, touched: `src/components/ui/DataTable/DataTable.tsx`, `src/components/ui/Tabs/Tabs.tsx`, `src/components/ui/Pagination/*`, `src/components/ui/DropdownMenu/DropdownMenu.tsx`, `src/components/ui/Modal/Modal.tsx`, `src/components/ui/SlideOver/SlideOver.tsx`, `src/components/ui/ConfirmDialog/ConfirmDialog.tsx`, `src/components/ui/Card/*`, `src/components/ui/KPICard/*`, `src/components/ui/TextInput/TextInput.tsx`, `src/components/ui/SelectInput/SelectInput.tsx`
   - New: `src/lib/support/tourProps.ts`, `src/lib/support/tourProps.test.ts`
8. **Implementation tasks (in order):**
   1. Write failing tests first for each component (attribute present on the correct element, absent when the prop is omitted).
   2. `DataTable`: `rowTourId` adds `data-tour` and `data-tour-repeat` to every `<tr>` and every mobile card (only one layout renders at a time, existing behaviour); `tourId` adds `<id>` on the wrapper, `<id>.empty` on the empty state, `<id>.loading` plus `aria-busy="true"` on the skeleton, and `<id>.sort.<column>` on sortable headers.
   3. `Tabs`: `tourId` -> tablist `data-tour=<id>`, each tab `<id>.tab.<tabId>`; the active tab panel is page-owned and annotated by the page.
   4. `DropdownMenu`: `DropdownMenuItemType.tourId` -> `data-tour` on the rendered menu item (menu content is portalled to `body`, which is why items need their own attribute).
   5. `Modal`, `SlideOver`, `ConfirmDialog`: `tourId` on the `role="dialog"` root plus `data-tour-layer` so the resolver (S02) scopes to it.
   6. `TextInput`/`SelectInput`: `tourId` on the container so the highlight covers label, control and message.
   7. No behaviour, markup order or class changes elsewhere; existing snapshots/tests must be untouched.
9. **Runtime behavior:**
   - No visible change. After this slice any page can mark rows, headers, tabs, dialogs and fields.
10. **Dynamic UI considerations:**
   - Because ids are attributes on rendered nodes, every row rendered later (new record, next page, filter change) carries the same id automatically: the mechanism behind "20 products need no 20 steps".
11. **Testing requirements:**
   - SUP-07: DataTable with 3 then 20 rows -> 20 elements share one `rowTourId`, mobile layout likewise, header sort ids present only for `sortable` columns.
   - SUP-05: each component forwards the id to the documented element; omitted prop adds no attribute.
   - Regression: existing tests for every touched component pass unchanged.
12. **Acceptance criteria:**
   - All touched component tests and `Storybook` stories still pass.
   - A diff review confirms only additive optional props.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/ui/DataTable src/components/ui/Tabs src/components/ui/Pagination src/components/ui/DropdownMenu src/components/ui/Modal src/components/ui/SlideOver src/components/ui/ConfirmDialog src/components/ui/Card src/components/ui/KPICard src/components/ui/TextInput src/components/ui/SelectInput
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (175); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S11, S12, S13. Page slices annotate with `{...tourProps("clients.list.add")}` or `tourId=` props only; no new wrapper elements.

### S11: Shared guidance library and guide-authoring helpers

1. **Slice id and title:** S11. Shared guidance library and guide-authoring helpers. Branch `support-slice-11-shared-guidance-library-and-guide-authoring`.
2. **Scope:** Reusable copy and behaviour for control families that appear on many pages, plus the typed helpers and lint that every page guide uses.
3. **Purpose:** Satisfies "shared UI components should have reusable guidance" and "do not duplicate common infrastructure". A page says `use: "shared.pagination"` and gets the explanation, safety class and disabled hint, with its own subject interpolated.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-05, SUP-07, SUP-12, SUP-18.
5. **Prerequisites:** S01 (Tour engine model and state machine (pure)); S04 (Step eligibility, progress persistence and lazy copy loader); S10 (Annotation pass-through on shared UI components). Existing functionality it builds on: `locales/en/support.json and sq/support.json`.
6. **Production LOC estimate:** **~280** (within the 200 to 300 target): sharedGuidance.ts: ~16 shared control kinds (search, filter select, date range, status chips, sortable header, pagination, row-actions menu, status badge, tabs, bulk select, export, refresh, back link, save/discard bar, confirm dialog, empty-state action) ~100; defineGuide.ts: typed `definePageGuide`, key derivation, `resolveStepCopy` with `{{subject}}` interpolation and runtime vars (e.g. dialog title read from `aria-labelledby`) ~60; guideLint.ts: unique ids, `repeat` declared for rows, destructive => explain-only, `try-it` only for openers/tabs/filters/fields, keys present in en and sq, shell ids not reused ~60; stepFactories.ts: `listPageSteps`, `formPageSteps`, `detailHeaderSteps` (used by 10+, 6+ and 8+ pages respectively) ~60
7. **Files and components:**
   - Existing, touched: `src/locales/en/support.json and sq/support.json (shared keys)`
   - New: `src/lib/support/sharedGuidance.ts`, `src/lib/support/defineGuide.ts`, `src/lib/support/guideLint.ts`, `src/lib/support/stepFactories.ts`, `src/lib/support/sharedGuidance.test.ts`, `src/lib/support/guideLint.test.ts`
8. **Implementation tasks (in order):**
   1. Write failing tests first (lint rules with deliberately broken guides).
   2. Each shared kind: `{ kind, safety, titleKey, bodyKey, whenKey?, disabledKey?, warning? }` with copy in `support.json` under `shared.*`.
   3. `definePageGuide({ pageId, version, namespace, steps })` returns a frozen guide and derives copy keys by convention `<namespace>:<pageId>.<stepId>.title|body|when|warning|disabled`.
   4. `guideLint` is a function used by (a) every page slice's integrity test, (b) a dev-only startup check. Rules: step ids unique; `target` ids match the id grammar; `repeat` required where the target id ends `.row`/`.card`/`.item`; destructive steps (`warning`) must be `explain-only`; a step cannot be both `try-it` and `submit`; `try-it` is allowed only for kinds `tab|filter|field|menu|opener`; every copy key exists in `en` and `sq`.
   5. `stepFactories`: only the three families with proven repetition; each returns plain step objects the page can override or extend.
   6. Refactor to keep the library free of page-specific wording.
9. **Runtime behavior:**
   - No visible change; a page guide can now be written in ~1 line per standard control.
10. **Dynamic UI considerations:**
   - Shared guidance applies to *kinds*, so every instance of a kind (every row menu, every filter select) is covered by the same entry; interpolation uses runtime values read from the target (e.g. the visible dialog title) so copy never goes stale when data changes.
11. **Testing requirements:**
   - SUP-12: lint rejects `try-it` on a step flagged destructive and on a submit button.
   - SUP-07: lint rejects a `.row` target without `repeat`.
   - SUP-18: lint reports a key missing in `sq`.
   - SUP-05: each shared kind resolves copy in en and sq; interpolation of `{{subject}}`.
12. **Acceptance criteria:**
   - Lint and shared tests pass.
   - A sample guide in the tests passes lint; five broken variants each fail with a distinct message.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (280); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S12, S15. Page slices import `definePageGuide`, `listPageSteps` etc. and run `assertGuideIntegrity(guide)` in their test. New shared kinds are added here only when a second page needs them.

### S12: Application shell chrome: annotations, layout adapters and shell guide

1. **Slice id and title:** S12. Application shell chrome: annotations, layout adapters and shell guide. Branch `support-slice-12-application-shell-chrome-annotations-layout-adapters`.
2. **Scope:** Annotates the header and sidebar that every page shares, lets the tour open the mobile sidebar and mobile search bar when a step needs them (restoring them afterwards), and provides the short shell guide that page tours can include.
3. **Purpose:** The shell is on every page but is not a page. It is guided once here. The sidebar is off-canvas on phones (`isSidebarOpen` state in `AppLayout`), so a nav step would otherwise point at an invisible element.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-02, SUP-05, SUP-09, SUP-15.
5. **Prerequisites:** S08 (Support host: session orchestration and mounting); S10 (Annotation pass-through on shared UI components); S11 (Shared guidance library and guide-authoring helpers). Existing functionality it builds on: `components/layout/AppLayout/AppLayout.tsx`, `components/layout/Sidebar/Sidebar.tsx`, `hooks/useNavigation.ts`.
6. **Production LOC estimate:** **~230** (within the 200 to 300 target): AppLayout / Sidebar / bell / script button / theme toggle annotations ~30; layoutAdapters.ts: register/unregister `{ open, close, isOpen }` per area (`sidebar`, `mobileSearch`), restore-on-exit snapshot ~70; guides/shell.ts: ~10 steps (brand/menu button, sidebar nav region, one exemplar nav item, theme, notifications, sales script (permission), Support, profile menu, log out) ~90; AppLayout effect registering adapters; step `needs` handling in `useTourSession` ~40
7. **Files and components:**
   - Existing, touched: `src/components/layout/AppLayout/AppLayout.tsx`, `src/components/layout/Sidebar/Sidebar.tsx`, `src/hooks/useNavigation.ts` (read: items filtered by permission and `tenantSalesWorkflow`), `src/components/notifications/NotificationBell.tsx`, `src/components/salesScript/SalesScriptButton.tsx`, `src/components/ui/ThemeToggle`
   - New: `src/lib/support/layoutAdapters.ts`, `src/lib/support/guides/shell.ts`, `src/lib/support/guides/shell.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first.
   2. Annotate: `shell.menu` (mobile menu button), `shell.nav` (the nav section), `shell.nav.item` (`repeat`, one per rendered item), `shell.theme`, `shell.notifications`, `shell.script` (only rendered with `script.view`), `shell.support`, `shell.profile`, `shell.logout`, `shell.org`.
   3. **Exclusions, recorded in the guide file as comments with the reason:** the header search `<input>` (no `value`/`onChange`, does nothing) and the sidebar "New entry" button (`onNewEntryClick` is never passed by any page) are *not* explained as functional. They are inert today; documenting them as working would be wrong. They are listed as an open item for the team (R10).
   4. `layoutAdapters`: `AppLayout` registers `sidebar` (`setIsSidebarOpen`) and `mobileSearch` adapters in an effect; a step may declare `needs: "sidebar"`; `useTourSession` calls `open()` before resolving, records the prior state, and restores it when the step changes or the tour ends. Adapters only change *view state*; they never click.
   5. Nav steps use the exemplar rule: because the menu differs per user (permission and workflow filters), the guide explains the region and one exemplar item and says that the menu lists what the user may open; pick-mode (S16) lets users ask about any individual item.
   6. Write `guides/shell.ts` with `definePageGuide`; it is not a route page, it is included by page guides through `includeShell()` (default off; a page opts in for its first step group).
9. **Runtime behavior:**
   - On a phone, a tour step about the navigation opens the sidebar, highlights it, and closes it again afterwards. On desktop the same step highlights the always-visible sidebar. The permission-dependent items shown are exactly those the user can see.
10. **Dynamic UI considerations:**
   - If the nav changes (permission refresh, follow-up badge appears) the exemplar re-resolves.
   - If the user rotates the device or resizes across 768 px, the adapter re-evaluates `needs`.
11. **Testing requirements:**
   - SUP-15: with a mobile-width `matchMedia`, a `needs: "sidebar"` step opens the sidebar then restores `isOpen=false` on exit.
   - SUP-09: a user without `script.view` has no `shell.script` target and that step is dropped.
   - SUP-05: every annotated shell control exists in the rendered `AppLayout` + `Sidebar`; the excluded two are not annotated (asserted).
   - Regression: `AppLayout.test.tsx`, `Sidebar.test.tsx` unchanged and green.
12. **Acceptance criteria:**
   - Tests pass; Playwright `support` case runs the shell guide at desktop and 360 px.
   - The two inert controls are listed in the PR description as findings.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/layout/AppLayout src/components/layout/Sidebar src/hooks src/components/notifications src/components/salesScript src/components/ui
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (230); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. Page guides may `includeShell()`; the SuperAdmin pages reuse the same chrome. Layout `needs` mechanism is available to any step.

### S13: Nested layers: dialogs, drawers, menus and tabs

1. **Slice id and title:** S13. Nested layers: dialogs, drawers, menus and tabs. Branch `support-slice-13-nested-layers-dialogs-drawers-menus-and`.
2. **Scope:** Teaches the engine to guide through UI that only exists after a user action: dropdown menus, `Modal`, `SlideOver`, `ConfirmDialog` and tab panels. Defines hand-off steps, group steps, return-on-close and the Escape arbitration rule.
3. **Purpose:** Delivers SUP-10. The tour never clicks for the user, so nested guidance is a *hand-off*: highlight the opener, wait for the layer to appear, then continue inside it.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-10, SUP-08, SUP-13.
5. **Prerequisites:** S08 (Support host: session orchestration and mounting); S10 (Annotation pass-through on shared UI components). Existing functionality it builds on: `lib/support/useTourSession.ts`, `components/ui/DropdownMenu/DropdownMenu.tsx`, `components/ui/Modal/Modal.tsx, SlideOver.tsx, ConfirmDialog.tsx`.
6. **Production LOC estimate:** **~270** (within the 200 to 300 target): layerStack.ts: topmost-layer detection (`role=dialog|menu`, `data-tour-layer`), layer ids from `data-tour` ~70; useLayerWatcher.ts: hub-driven `LAYER_OPENED/CLOSED` events, 600 ms grace for exit animations ~60; useTourSession.ts extension: `opens`/`group`/`advanceWhen`, hold-for-user, return to parent, Esc rule ~110; TourPopover waiting-for-user variant copy wiring ~30
7. **Files and components:**
   - Existing, touched: `src/lib/support/useTourSession.ts` (extends), `src/components/ui/DropdownMenu/DropdownMenu.tsx` (menu is portalled to `body`; closes on outside click), `src/components/ui/Modal/Modal.tsx, SlideOver.tsx, ConfirmDialog.tsx`
   - New: `src/lib/support/layerStack.ts`, `src/lib/support/useLayerWatcher.ts`, `src/lib/support/layerStack.test.ts`, `src/lib/support/nestedGuide.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first with a fixture page whose button opens a fixture dialog.
   2. Step fields: `opens: "<layerId>"` marks an opener (`safety: "try-it"` required); `group: "<layerId>"` marks steps that belong inside that layer; `advanceWhen` defaults to "layer `<layerId>` present".
   3. Flow: opener step shows "Try it: click here" -> machine `HOLD_FOR_USER(layerId)` -> the user clicks (the tour does not) -> `LAYER_OPENED` -> the group's steps run with the resolver scoped to that layer -> when the layer closes, `LAYER_CLOSED` returns to the step after the opener (or the opener again if the user closed it before the group finished, with a "Want to see it again?" note).
   4. If the user never opens the layer, "Skip this part" in the waiting popover jumps past the whole group; the group is also skipped automatically if the opener becomes missing/disabled (e.g. permission lost).
   5. Escape arbitration (decision rule, R7): tour in `running` -> Esc exits the tour only; tour in `waiting: user-action` or inside a group -> Esc is left to the layer (so it closes the dialog) and the tour then returns to the parent step.
   6. Dropdown menus: menu items live in a portal; the resolver's layer scope picks `[role="menu"]`; the outside-click close in `DropdownMenu` is not triggered by tour UI because the popover is inside `SupportHost`, which stops pointer events from reaching the document handler only for its own subtree (verified in a test using the real `DropdownMenu`).
   7. Tabs: tab steps are `try-it` with `advanceWhen` = target `<tabs>.tab.<id>` has `aria-selected="true"`; panel steps carry `scope: { tab }`.
9. **Runtime behavior:**
   - A step says "Open the actions menu" and waits. After the user opens it, the tour explains the items; closing the menu returns to the page level. Dialog steps explain fields and buttons without submitting.
10. **Dynamic UI considerations:**
   - Layers that close from outside (data refresh, permission change) are treated like a closed layer.
   - A second layer opened on top of the first (e.g. archive confirm from a menu) becomes the new scope root; closing it returns to the previous layer.
11. **Testing requirements:**
   - SUP-10: opener -> hold -> open -> group steps -> close -> parent; user closes early; user never opens and uses Skip this part; opener disabled mid-wait.
   - SUP-13: Esc behaviour in the three modes with a real `Modal`.
   - SUP-08: layer exit animation (`AnimatePresence`) does not cause a false `lost`.
   - Real-component test: `DropdownMenu` + `ConfirmDialog` from the repo, not mocks.
12. **Acceptance criteria:**
   - Nested-guide integration tests pass with real `DropdownMenu`, `Modal`, `SlideOver`, `ConfirmDialog`.
   - Existing `Modal`/`SlideOver`/`DropdownMenu` tests pass unchanged.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support src/components/ui/DropdownMenu
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (270); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S14. Page slices declare `opens`/`group` in data only; no page writes layer logic.

### S14: Explain-only enforcement and safety watchdog

1. **Slice id and title:** S14. Explain-only enforcement and safety watchdog. Branch `support-slice-14-explain-only-enforcement-and-safety-watchdog`.
2. **Scope:** A capture-phase interaction guard that makes it impossible to trigger an application action by accident during a tour, plus the test utilities that prove "no data was changed".
3. **Purpose:** Delivers SUP-12. A tour explains Delete, Void, Close, Cancel contract and every Save/Submit; it must never run them. The invariant is enforced at runtime, linted in definitions (S11) and asserted end to end.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-12, SUP-13.
5. **Prerequisites:** S13 (Nested layers: dialogs, drawers, menus and tabs). Existing functionality it builds on: `lib/support/useTourSession.ts`.
6. **Production LOC estimate:** **~180** (just under the target (150 to 199)): interactionGuard.ts: capture listeners for `click`, `pointerdown`, `mousedown`, `touchstart`, `keydown` (Enter/Space on explain-only targets), `submit`, `dragstart`; allow-list = popover, current `try-it` target subtree, active layer when waiting ~120; useTourSession.ts: install/remove guard per step, message "Exit the tour to use this control", announce once ~40; Dev-time assertion: a destructive step reaching runtime as `try-it` throws in development ~20
7. **Files and components:**
   - Existing, touched: `src/lib/support/useTourSession.ts` (installs the guard)
   - New: `src/lib/support/interactionGuard.ts`, `src/lib/support/interactionGuard.test.tsx`, `tests/e2e/support/noMutations.ts`
8. **Implementation tasks (in order):**
   1. Write failing tests first (a fixture page with Delete, Save and a form).
   2. While a tour is `running`, the guard cancels (`preventDefault` + `stopPropagation`) any `click`/`pointerdown`/`mousedown`/`touchstart` whose target is outside the allow-list. The allow-list is: the tour UI; the subtree of the current step's target **only if** `safety: "try-it"`; the active layer when `waiting`.
   3. `keydown` Enter/Space on a focused explain-only target is cancelled so a keyboard user cannot activate it either.
   4. A global `submit` capture cancel: forms cannot be submitted while a tour runs, even from a field the user is allowed to type in. The popover shows "Exit the tour to submit" once, and the announcer repeats it.
   5. The guard never calls `.click()`, `.submit()`, `dispatchEvent` or any app callback; a source-grep test asserts these calls do not appear under `lib/support`.
   6. Playwright utility `expectNoMutations(page)` that fails on any `POST|PUT|PATCH|DELETE` request between start and end of a tour, used by every page's end-to-end case. Some read-only calls use POST (the pricing test calculator, the employee-upload preview): the helper takes an explicit allow-list of such endpoints, and a page slice must name any it adds in its PR (risk R14).
9. **Runtime behavior:**
   - While a tour runs the page behaves like a read-only museum: scrolling and typing in allowed fields work, clicking or pressing Enter on an explain-only control shows the hint and does nothing. After Exit/finish the page is fully interactive again.
10. **Dynamic UI considerations:**
   - The allow-list is recomputed per step, so changing steps changes what is clickable; a target replaced mid-step keeps the same rule because it is keyed by id, not element.
   - Guard listeners are removed on every exit path (finish, Exit, Skip, route change, unmount).
11. **Testing requirements:**
   - SUP-12: click/Enter/Space/submit on Delete, Save and a form inside a running tour -> the app handlers (spies) are never called; same controls work after Exit.
   - SUP-12: source grep for `.click(`, `.submit(`, `dispatchEvent(` under `lib/support`.
   - SUP-13: Tab still moves focus; Space scrolls the page when not on an explain-only target.
   - Listener count returns to baseline after every end path.
12. **Acceptance criteria:**
   - Guard tests pass.
   - Playwright helper compiles and is exercised by one case in `support.spec.ts` (start/finish a fixture tour; zero mutating requests).
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (180); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S15. This closes the foundation. Page slices declare `warning`/`explain-only`; they cannot weaken it.

### S15: Explain a control: control list

1. **Slice id and title:** S15. Explain a control: control list. Branch `support-slice-15-explain-a-control-control-list`.
2. **Scope:** Adds "Explain a control" to the Support panel: a list of the controls on the current page that actually exist right now, each opening a single-step explanation without starting the tour.
3. **Purpose:** Delivers SUP-04. A user who only needs one answer is not forced through a walkthrough.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-04, SUP-05, SUP-07, SUP-11, SUP-14.
5. **Prerequisites:** S09 (Support launcher and contextual help panel); S11 (Shared guidance library and guide-authoring helpers); S14 (Explain-only enforcement and safety watchdog). Existing functionality it builds on: `components/support/SupportPanel.tsx`, `lib/support/tourMachine.ts`.
6. **Production LOC estimate:** **~240** (within the 200 to 300 target): useExplainableControls.ts: steps of the active guide whose target resolves now and whose eligibility passes; dedupes repeated instances to one entry; groups by section ~70; ControlList.tsx: searchable list with keyboard support, "Show me" -> single mode, back to list ~100; ControlList.module.css ~40; Machine/session `single` mode: one step, highlight + popover, Close ~30
7. **Files and components:**
   - Existing, touched: `src/components/support/SupportPanel.tsx`, `src/lib/support/tourMachine.ts` (add the single-step mode)
   - New: `src/lib/support/useExplainableControls.ts`, `src/components/support/ControlList.tsx`, `src/components/support/ControlList.module.css`, `src/components/support/ControlList.test.tsx`, `src/lib/support/useExplainableControls.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first.
   2. `useExplainableControls(guide)` returns entries for steps whose target is `found|disabled` in the current DOM and whose `requires` pass; repeated targets collapse to one entry flagged "appears on every row". Entries for controls that do not exist now (e.g. a Clear button when no filter is active) are *not* listed; the list updates live from the observer hub.
   3. `ControlList` lives inside `SupportPanel`: filter box (`role="searchbox"`), listbox semantics (`role="listbox"`/`option`), arrow-key navigation, Enter = show.
   4. Single mode: highlight + popover with only Close (and "Explain another"), no progress, no Next/Back; `ArrowRight/Left` disabled.
   5. Empty state: "No controls on this page can be explained yet" when a page has a guide with no resolvable step (e.g. still loading) with a Retry that re-queries.
9. **Runtime behavior:**
   - Support -> Explain a control shows only what is on screen now. Choosing one highlights it and explains it in a single card; Close returns to normal use immediately.
10. **Dynamic UI considerations:**
   - List updates when data arrives (loading -> populated), when filters create or remove controls, and when a tab changes.
   - Explaining a repeated control highlights the first visible instance and says it applies to every row.
11. **Testing requirements:**
   - SUP-04: choose a control -> single popover; Close ends the session with no progress write.
   - SUP-11: while the fixture page is `aria-busy` the list shows loading, then fills.
   - SUP-07: 20 fixture rows give one entry.
   - SUP-09: permission-gated entries absent for a user without the permission.
12. **Acceptance criteria:**
   - Panel tests pass; Playwright `support` case: open panel -> Explain a control -> pick -> Close, zero mutations.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (240); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks S16. Every guide step is automatically an explainable control; page slices add nothing for this feature.

### S16: Explain a control: pick mode

1. **Slice id and title:** S16. Explain a control: pick mode. Branch `support-slice-16-explain-a-control-pick-mode`.
2. **Scope:** Point-and-ask: the user hovers (or tabs through) the page and any annotated control can be explained on click or Enter.
3. **Purpose:** Covers controls that are not in the page's step list but are annotated, and individual items of runtime-dependent sets such as the permission-filtered nav.
4. **Page association:** **infrastructure only**. No page tour is implemented or extended. Requirements served: SUP-04, SUP-05, SUP-13, SUP-14.
5. **Prerequisites:** S15 (Explain a control: control list). Existing functionality it builds on: `components/support/SupportPanel.tsx`.
6. **Production LOC estimate:** **~200** (within the 200 to 300 target): usePickMode.ts: pointer highlight of the nearest `[data-tour]` ancestor, click/Enter to select, keyboard cycling over visible annotated targets, Esc to leave ~120; PickBanner.tsx: "Pick a control · Esc to cancel", live-announced current candidate ~50; Fallback copy resolution: step copy -> shared kind -> "No help written for this control yet" (never invented text) ~30
7. **Files and components:**
   - Existing, touched: `src/components/support/SupportPanel.tsx`
   - New: `src/lib/support/usePickMode.ts`, `src/components/support/PickBanner.tsx`, `src/lib/support/usePickMode.test.tsx`, `src/components/support/PickBanner.test.tsx`
8. **Implementation tasks (in order):**
   1. Write failing tests first.
   2. Pointer: `pointermove` highlights the nearest ancestor carrying `data-tour` (using the same mask); click selects it and is swallowed by the guard so the control itself does not fire.
   3. Keyboard: Tab / Shift+Tab move through the annotated, visible targets in DOM order (announced); Enter selects; Esc leaves pick mode.
   4. Resolution of copy for the picked id: the active guide's step with that target; else the shared guidance for its `data-tour-kind`; else a clearly marked "No help written for this control yet" card (honest fallback).
   5. Touch: first tap highlights and shows the card, second tap on Close leaves; no hover dependence.
9. **Runtime behavior:**
   - A banner appears, the page can be explored by pointer or keyboard, and picking any annotated control explains it in a single card.
10. **Dynamic UI considerations:**
   - Targets are queried on each move/tab press, so controls that appeared after the mode started are available and removed ones are not.
   - The nav items (permission-filtered) are each pickable, which the page tour deliberately does not enumerate.
11. **Testing requirements:**
   - SUP-04: hover highlights, click explains and the underlying button handler is not called; Esc leaves.
   - SUP-13: keyboard cycling skips non-visible targets; announces candidate names.
   - SUP-05: the fallback card appears for an annotated control with no step and no shared kind.
12. **Acceptance criteria:**
   - Tests pass; Playwright pick-mode case at 360 px with touch emulation.
   - Tests, typecheck, lint, translation check and build pass.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support src/components/support
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** the red-then-green commit history; the Vitest report for the listed test files; for slices with UI, Storybook stories passing the a11y addon; the measured production LOC next to the estimate (200); and the observable behaviour stated under Runtime behavior.
15. **Dependencies and handoff:** unblocks all page slices (first: S17); it is a foundation or gate slice. End of foundation. S17 starts the pilot page and doubles as the gate that validates the mechanism on real data.

#### Page tours: Pilot gate and Sales workflow

### S17: Clients list: header, search and filters (pilot)

1. **Slice id and title:** S17. Clients list: header, search and filters (pilot). Branch `support-slice-17-clients-list-header-search-and-filters`.
2. **Scope:** First real page guide. Proves the whole stack on live data: registry entry, lazy guide, copy loading, annotation, eligibility by scope, runtime appearance of controls.
3. **Purpose:** Validates the foundation on one page before 60 more depend on it. If this slice exposes a design flaw, the foundation is fixed before S19.
4. **Page association:** one page only: **Clients list** (`clients.list`; `/:tenantSlug/clients`); slice 1 of 2. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode). Existing code it relies on, unchanged since planning: `pages/clients/ClientListPage.tsx`, `pages/clients/ClientListContent.tsx`, `components/ui/DataTable/DataTable.tsx`, `components/ui/DropdownMenu/DropdownMenu.tsx`.
6. **Production LOC estimate:** **~190** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30 + `data-tour-state` markers on the filter row and empty branches so later slices can tell "no filters" from "filters active" 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): 
   - Existing, read only: `src/hooks/useClients.ts` (read), `src/locales/en/clients.json` (read: `list.*` keys the labels come from)
   - New: `src/lib/support/guides/clientsList.ts`, `src/lib/support/guides/clientsList.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: read in context during planning; re-read to catch drift): the files in item 7.
   3. **PT-3 Annotate** about 15 sites in those files. Includes: `data-tour-state` markers on the filter row and empty branches so later slices can tell "no filters" from "filters active".
   4. **PT-4 Write the guide**: 17 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.list.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/clients` as page `clients.list`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `clients.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Search / filtered results (F):** With a filter applied the `clear` step becomes eligible; with none it is skipped. Showing the filter bar (try-it on `filterToggle`) makes the `filterBar` and the filter steps eligible; hiding it removes them.
   - **Pagination / sorting (G):** There is no pagination to explain: the Previous/Next buttons are static `disabled` placeholders and are deliberately left out.
   - **Permission- or workflow-dependent controls (A):** A user whose `companies.view` scope is OWN has no `reach` step; a user without `companies.delete` has no `archivedToggle` step.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Typing in the search field or changing a filter while the tour sits on `search` does not move the tour; the highlighted field is the same node.
   - Applying a filter makes `clear` appear; the tour list is recomputed on the next navigation and the announcer says the count changed.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Render `ClientListContent` (msw) with the host: tour reaches every step for an ALL-scope user with `companies.delete`, skips `reach` for OWN scope, skips `archivedToggle` without `companies.delete`, skips the filter steps while the bar is hidden, skips `clear` until a filter is chosen.
   - Pilot gate test: with 0, 1 and 25 clients the same eligible-step ids result for this slice (no data-driven steps).
   - Regression: existing tests of the touched files pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Support -> Tour this page works on /clients for a real seeded workspace.
   - Pilot review checklist is ticked in the PR: bundle delta of the main chunk is zero; guide and copy load only after Support opens; Esc, focus and reduced-motion behave.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsList
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 190.
15. **Dependencies and handoff:** unblocks S18. Later slices of this page extend the same guide and may rely on the ids `clients.list.*` and the registration made in slice 1.

### S18: Clients list: states, rows, row menu and archive / restore

1. **Slice id and title:** S18. Clients list: states, rows, row menu and archive / restore. Branch `support-slice-18-clients-list-states-rows-row-menu`.
2. **Scope:** Everything that depends on data: loading, error and three empty states, the repeated row, the per-row actions menu, and the archive / restore flow including the confirmation dialog.
3. **Purpose:** Shows the dynamic-data mechanism on the pilot page: 1 row or 200 rows produce the same steps, and the menu and dialog are guided without being operated.
4. **Page association:** one page only: **Clients list** (`clients.list`; `/:tenantSlug/clients`); slice 2 of 2. Not infrastructure.
5. **Prerequisites:** S17 (Clients list: header, search and filters (pilot)). Existing code it relies on, unchanged since planning: `pages/clients/ClientListPage.tsx`, `pages/clients/ClientListContent.tsx`, `components/ui/DataTable/DataTable.tsx`, `components/ui/DropdownMenu/DropdownMenu.tsx`.
6. **Production LOC estimate:** **~232** (within the 200 to 300 target): 6 extend the guide and registration + 21 steps x 8 = 168 + 19 annotation sites x 2 = 38 + Group wiring for the menu and archive dialog (`opens`/`group`), `tourId` on the `DropdownMenu` items and `ConfirmDialog` 20. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/clients/ClientListContent.tsx` (row, menu, empty branches, dialog)
   - Extended: `src/lib/support/guides/clientsList.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: read in context during planning; re-read to catch drift): the files in item 7.
   3. **PT-3 Annotate** about 19 sites in those files. Includes: Group wiring for the menu and archive dialog (`opens`/`group`), `tourId` on the `DropdownMenu` items and `ConfirmDialog`.
   4. **PT-4 Extend the guide**: 21 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.list.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `clients.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Exactly one of `emptyFirst`, `emptyNoMatch`, `emptyArchived` exists in the DOM at a time; the tour explains the one that is there.
   - **Loading / skeleton (L):** While the skeleton is shown (`aria-busy`) the tour waits up to 4 s, then skips the data-dependent steps.
   - **Populated, repeated rows or cards (P):** `row`, `rowName`, `rowStatus`, `rowValidity`, `rowAssigned`, `rowRisk`, `rowMenu` are `repeat`: the first visible row is the exemplar, and the copy says it applies to every row.
   - **Error / retry (X):** The error banner step appears only while the banner is rendered.
   - **Permission- or workflow-dependent controls (A):** Without `companies.delete` the `menuArchive` step is dropped; in the archived view `menuRestore` replaces it.
   - **Dialogs, drawers, menus, nested workflows (D):** The user opens the row menu (try-it); the tour then explains the items; the archive dialog appears only if the user chooses the menu item, and its confirm button can never be activated during the tour.
   - **Destructive or irreversible actions (explain-only) (K):** Archive and confirm carry a warning callout; nothing is archived by the tour.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Create or archive a client from another tab and return: the exemplar row is re-picked; if the exemplar row is archived while the tour highlights it, the step re-picks the next row instead of pointing at a removed node.
   - Switching to the archived view mid-tour swaps `menuArchive` for `menuRestore`; the eligible list updates.
   - Search with no match swaps the table for `emptyNoMatch`; a `row` step becomes missing and is skipped.
   - Deleting the last client shows `emptyFirst` and the tour offers it as a step.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - msw returns 0, 1 and 200 clients: eligible step ids differ only by the presence of row steps and the empty-state steps, never by count.
   - Remove the exemplar row mid-tour (msw + refetch): spotlight moves to the next row, no console warning.
   - Walk through the archive dialog with the real `ConfirmDialog`: `archiveConfirm` click and Enter are swallowed (spy never called), the dialog stays open, the tour then returns to the page.
   - User without `companies.delete`: no archive steps.
   - Regression: existing tests of the touched files pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - In a seeded workspace the tour never changes a client (Playwright `expectNoMutations`).
   - All three empty states are reachable and explained.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsList src/pages/clients
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 232.
15. **Dependencies and handoff:** unblocks all page slices (first: S19); it is a foundation or gate slice. After this slice **Clients list is complete**: every applicable state in 7.3 is covered.

### S19: Client form: fields, contacts, custom fields and create-deal option

1. **Slice id and title:** S19. Client form: fields, contacts, custom fields and create-deal option. Branch `support-slice-19-client-form-fields-contacts-custom-fields`.
2. **Scope:** One slice for both routes (the component is shared): identity and classification fields, location, contact persons editor, tenant custom fields, the optional deal, validation and the save / cancel bar.
3. **Purpose:** Teaches data entry for a company without ever submitting it.
4. **Page association:** one page only: **Client form (create and edit)** (`clients.form`; `/:tenantSlug/clients/new`, `/:tenantSlug/clients/:clientId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/clients/ClientFormPage.tsx`, `pages/clients/ClientFormContent.tsx`, `pages/clients/ContactPersonsEditor.tsx`, `components/ui/CustomFieldInput`.
6. **Production LOC estimate:** **~212** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Mode-dependent copy and safety via `vars.mode` for two routes sharing one guide, including the edit-mode contact editor being explain-only 12 + `FormRenderer` annotation of each rendered control (`tenantField`); the renderer is shared with the public form and the builder, so the id is applied only when it renders in the client form 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/clients/ClientFormContent.tsx`, `src/pages/clients/ContactPersonsEditor.tsx`, `src/components/forms/FormRenderer`
   - New: `src/lib/support/guides/clientsForm.ts`, `src/lib/support/guides/clientsForm.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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
15. **Dependencies and handoff:** unblocks S76, S77. After this slice **Client form (create and edit) is complete**: every applicable state in 7.3 is covered.

### S20: Follow-ups: tabs, filters, list and actions

1. **Slice id and title:** S20. Follow-ups: tabs, filters, list and actions. Branch `support-slice-20-follow-ups-tabs-filters-list-and`.
2. **Scope:** Mine / team tabs, salesperson filter, overdue-only toggle, the list and its complete / reschedule / cancel / reassign actions and modals.
3. **Purpose:** One slice (about 25 steps) for a compact page.
4. **Page association:** one page only: **Follow-ups** (`followUps`; `/:tenantSlug/follow-ups`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/followUps/FollowUpsPage.tsx`, `pages/followUps/FollowUpsContent.tsx`, `components/followUps/FollowUpList.tsx`, `components/followUps/FollowUpActionModals.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~202** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Annotations in `FollowUpActionModals`; the list and its buttons are annotated with the client detail slice and reused here 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/followUps/FollowUpsContent.tsx`, `src/components/followUps/FollowUpList.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpActionModals.tsx`
   - New: `src/lib/support/guides/followUps.ts`, `src/lib/support/guides/followUps.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** The action modals are hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Tabs / sections (T):** Tab scope. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Cancel carries a warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Completing a follow-up in another tab removes its row; if it was the exemplar the next row is picked.
   - The overdue badge in the sidebar (shared nav) is polled; not a tour concern.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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
15. **Dependencies and handoff:** unblocks S23. After this slice **Follow-ups is complete**: every applicable state in 7.3 is covered.

### S21: Calendar: toolbar, views, team filter, overdue section and page states

1. **Slice id and title:** S21. Calendar: toolbar, views, team filter, overdue section and page states. Branch `support-slice-21-calendar-toolbar-views-team-filter-overdue`.
2. **Scope:** The toolbar, the view switch, the month / week / day / agenda renderings as regions, the legend and the empty / error states.
3. **Purpose:** Orientation for the calendar before its items and dialogs.
4. **Page association:** one page only: **Calendar (appointments, follow-ups, contract dates)** (`appointments`; `/:tenantSlug/appointments`); slice 1 of 2. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/appointments/AppointmentsPage.tsx`, `pages/appointments/CalendarContent.tsx`, `components/calendar/CalendarToolbar.tsx`, `components/calendar/CalendarMonthView.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~230** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 21 steps x 8 = 168 + 19 annotation sites x 2 = 38 + View-state markers on the three renderings 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/appointments/CalendarContent.tsx`, `src/components/calendar/CalendarToolbar.tsx`, `src/components/calendar/CalendarMonthView.tsx`, `src/components/calendar/CalendarTimeGrid.tsx`, `src/components/calendar/CalendarAgenda.tsx`
   - New: `src/lib/support/guides/appointments.ts`, `src/lib/support/guides/appointments.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/appointments.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/appointments/CalendarContent.tsx`, `src/components/calendar/CalendarToolbar.tsx`, `src/components/calendar/CalendarMonthView.tsx`, `src/components/calendar/CalendarTimeGrid.tsx`, `src/components/calendar/CalendarAgenda.tsx`.
   3. **PT-3 Annotate** about 19 sites in those files. Includes: View-state markers on the three renderings.
   4. **PT-4 Write the guide**: 21 steps, in tour order (`<id>` becomes the copy key `supportSales:appointments.<id>.title|body`):
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
      - `teamFilter` — the team filter group (needs calendar scope above OWN)
      - `personChip` — one person chip (repeat, try-it)
      - `allChip` — "everyone" chip (try-it)
      - `overdue` — overdue section; exists only when items are overdue (state)
      - `overdueItem` — an overdue item (repeat)
   5. **PT-5 Register** `/:tenantSlug/appointments` as page `appointments`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `appointments`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** An empty period shows `emptyPeriod`; item steps (next slice) are skipped.
   - **Loading / skeleton (L):** The grid waits for data. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Chips are repeated; the exemplar is the first visible chip, and the copy explains the three kinds that exist today.
   - **Error / retry (X):** The notice has its own step. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Plan needs `activities.add`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** The panel is a hand-off from a chip.
   - **Tabs / sections (T):** View-specific steps are eligible only for the active view; switching view (try-it) re-enters the list.
   - **Destructive or irreversible actions (explain-only) (K):** Cancel and status buttons carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Moving to another week replaces every cell; `dayCell` is repeated and re-picked.
   - The default view differs by viewport; the view-specific steps follow the DOM, not an assumed default.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Each view renders its own subset of steps; empty and error periods; plan permission.
   - Regression: existing tests of `CalendarContent.tsx`, `CalendarToolbar.tsx`, `CalendarMonthView.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No navigation inside the calendar changes data.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/appointments src/pages/appointments src/components/calendar
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "appointments"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 230.
15. **Dependencies and handoff:** unblocks S22. Later slices of this page extend the same guide and may rely on the ids `appointments.*` and the registration made in slice 1.

### S22: Calendar: items, detail panel, Plan activity and rescheduling

1. **Slice id and title:** S22. Calendar: items, detail panel, Plan activity and rescheduling. Branch `support-slice-22-calendar-items-detail-panel-plan-activity`.
2. **Scope:** Calendar chips (activities, follow-ups, contract dates), the team filter, the overdue section and the detail panel with its actions. The Plan activity dialog, the reschedule dialog and drag-to-reschedule.
3. **Purpose:** Covers the objects on the calendar and what can be done with them. The data-entry parts of the calendar.
4. **Page association:** one page only: **Calendar (appointments, follow-ups, contract dates)** (`appointments`; `/:tenantSlug/appointments`); slice 2 of 2. Not infrastructure.
5. **Prerequisites:** S21 (Calendar: toolbar, views, team filter, overdue section and page states); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/appointments/AppointmentsPage.tsx`, `pages/appointments/CalendarContent.tsx`, `components/calendar/CalendarToolbar.tsx`, `components/calendar/CalendarMonthView.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~298** (within the 200 to 300 target): 6 extend the guide and registration + 27 steps x 8 = 216 + 24 annotation sites x 2 = 48 + Annotations inside `AppointmentDetailPanel` (shared by two item kinds) 14 + Annotations in `PlanActivityDialog` and `RescheduleItemDialog` 14. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/components/calendar/CalendarChip.tsx`, `src/components/calendar/ContractDateChip.tsx`, `src/components/calendar/TeamFilter.tsx`, `src/components/calendar/OverdueSection.tsx`, `src/components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`, `src/components/calendar/PlanActivityDialog.tsx`, `src/components/calendar/RescheduleItemDialog.tsx`
   - Extended: `src/lib/support/guides/appointments.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/appointments.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/components/calendar/CalendarChip.tsx`, `src/components/calendar/ContractDateChip.tsx`, `src/components/calendar/TeamFilter.tsx`, `src/components/calendar/OverdueSection.tsx`, `src/components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`.
   3. **PT-3 Annotate** about 24 sites in those files. Includes: Annotations inside `AppointmentDetailPanel` (shared by two item kinds); Annotations in `PlanActivityDialog` and `RescheduleItemDialog`.
   4. **PT-4 Extend the guide**: 27 steps, in tour order (`<id>` becomes the copy key `supportSales:appointments.<id>.title|body`):
      - `chip` — a calendar item (repeat, try-it: opens the detail panel)
      - `chipKinds` — meaning of activity, follow-up and contract-date chips (info, per kind rendered)
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `appointments`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No overdue items: that step is absent.
   - **Populated, repeated rows or cards (P):** Chips are repeated; the exemplar is the first visible chip, and the copy explains the three kinds that exist today.
   - **Permission- or workflow-dependent controls (A):** The team filter and follow-up actions follow scope and `followups.manage`. Plan needs `activities.add`; owner select depends on scope.
   - **Dialogs, drawers, menus, nested workflows (D):** The panel is a hand-off from a chip. Both dialogs are hand-offs; the drag step is information only.
   - **Validation and submission (V):** Both dialogs' validation messages are explained only if rendered.
   - **Destructive or irreversible actions (explain-only) (K):** Cancel and status buttons carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New items created elsewhere appear as chips with the same ids.
   - An item removed while its panel is open closes the layer; the tour treats it as a layer close.
   - Deal and contact selects appear only after a company is chosen: their steps are absent until then.
   - Edit mode of the plan dialog (existing item) changes the title and copy.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Chip kinds present / absent; scope variants for the team filter; panel hand-off; destructive buttons never fire.
   - Dialog hand-off from the toolbar Plan button and from the overdue section; company-dependent steps; Enter in a field does not submit.
   - Regression: existing tests of `CalendarChip.tsx`, `ContractDateChip.tsx`, `TeamFilter.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Real `AppointmentDetailPanel` used; spies show no status update call.
   - Drag is not simulated by the tour (asserted: no pointer events dispatched).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/appointments src/components/calendar src/components/panels/AppointmentDetailPanel
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "appointments"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 298.
15. **Dependencies and handoff:** unblocks S24. After this slice **Calendar (appointments, follow-ups, contract dates) is complete**: every applicable state in 7.3 is covered.

### S23: Client detail: header, action bar, summary, custom fields and follow-ups panel

1. **Slice id and title:** S23. Client detail: header, action bar, summary, custom fields and follow-ups panel. Branch `support-slice-23-client-detail-header-action-bar-summary`.
2. **Scope:** Everything above the tabs: title, duplicate-name notice, the action bar with its permission-dependent buttons and the more menu, the summary card and the custom-field panel.
3. **Purpose:** First of four slices for the client detail page; orients the user before the data tabs.
4. **Page association:** one page only: **Client detail** (`clients.detail`; `/:tenantSlug/clients/:clientId`); slice 1 of 3. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S20 (Follow-ups: tabs, filters, list and actions). Existing code it relies on, unchanged since planning: `pages/clients/ClientDetailPage.tsx`, `pages/clients/ClientDetailContent.tsx`, `components/followUps/FollowUpsPanel.tsx`, `components/calendar/PlanActivityDialog.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~212** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Annotate `FollowUpsPanel`, `FollowUpQuickButtons` and `FollowUpList` once with component-scoped ids (`followUps.*`); the deal page and the follow-ups page reuse them 14 + `vars` for company name interpolation in the first step 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/clients/ClientDetailContent.tsx`, `src/components/followUps/FollowUpsPanel.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpList.tsx`
   - New: `src/lib/support/guides/clientsDetail.ts`, `src/lib/support/guides/clientsDetail.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/clients/ClientDetailContent.tsx`, `src/components/followUps/FollowUpsPanel.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpList.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: Annotate `FollowUpsPanel`, `FollowUpQuickButtons` and `FollowUpList` once with component-scoped ids (`followUps.*`); the deal page and the follow-ups page reuse them.
   4. **PT-4 Write the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.detail.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/clients/:clientId` as page `clients.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `clients.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Loading / skeleton (L):** Page-level loading is waited out, then the tour starts at `title`.
   - **Error / retry (X):** Not-found / load-failed has its own single explanatory step and the rest are skipped.
   - **Permission- or workflow-dependent controls (A):** Each action-bar button is dropped when its permission is missing.
   - **Dialogs, drawers, menus, nested workflows (D):** The more menu is a hand-off step. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Destructive or irreversible actions (explain-only) (K):** Archive-class items in the more menu carry a warning and are explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - A company without custom fields or contacts simply lacks those steps.
   - If the user edits and returns while a tour is exited, Resume continues from the stored step id; if that step no longer exists, it falls back to the nearest following step.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Permission matrix across the three action buttons.
   - More menu hand-off with the real `DropdownMenu`.
   - Duplicate-name notice present / absent.
   - Regression: existing tests of `ClientDetailContent.tsx`, `FollowUpsPanel.tsx`, `FollowUpQuickButtons.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Tour never navigates; every navigation button is explain-only.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsDetail src/pages/clients src/components/followUps
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 212.
15. **Dependencies and handoff:** unblocks S24. Later slices of this page extend the same guide and may rely on the ids `clients.detail.*` and the registration made in slice 1.

### S24: Client detail: timeline, activity logging and the appointments tab

1. **Slice id and title:** S24. Client detail: timeline, activity logging and the appointments tab. Branch `support-slice-24-client-detail-timeline-activity-logging-and`.
2. **Scope:** The default Timeline tab: the timeline list, the per-channel "log activity" buttons and the activity dialog, the note control. The Appointments tab with its hand-off to the shared Plan activity dialog and appointment detail panel, and the Contracts tab (read-only list).
3. **Purpose:** Activities are the most-used action on this page; this makes the dialog's fields explainable without saving anything. Covers the Appointments and Contracts tabs and shows how a page reuses dialogs that another page already annotated.
4. **Page association:** one page only: **Client detail** (`clients.detail`; `/:tenantSlug/clients/:clientId`); slice 2 of 3. Not infrastructure.
5. **Prerequisites:** S23 (Client detail: header, action bar, summary, custom fields and follow-ups panel); S18 (Clients list: states, rows, row menu and archive / restore); S22 (Calendar: items, detail panel, Plan activity and rescheduling). Existing code it relies on, unchanged since planning: `pages/clients/ClientDetailPage.tsx`, `pages/clients/ClientDetailContent.tsx`, `components/followUps/FollowUpsPanel.tsx`, `components/calendar/PlanActivityDialog.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~274** (within the 200 to 300 target): 6 extend the guide and registration + 24 steps x 8 = 192 + 22 annotation sites x 2 = 44 + `ActivityDialog` annotation of its fields and footer (component is shared with the deal page, so ids are namespaced under `activity.*` and reused there) 22 + Tab-scope wiring for the tabs of this slice 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/clients/ClientDetailContent.tsx`, `src/components/clients/CompanyTimeline.tsx`, `src/components/activities/ActivityDialog.tsx`, `src/components/clients/ClientContractsTab.tsx`
   - Extended: `src/lib/support/guides/clientsDetail.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/clients/ClientDetailContent.tsx`, `src/components/clients/CompanyTimeline.tsx`, `src/components/activities/ActivityDialog.tsx`, `src/components/clients/ClientContractsTab.tsx`.
   3. **PT-3 Annotate** about 22 sites in those files. Includes: `ActivityDialog` annotation of its fields and footer (component is shared with the deal page, so ids are namespaced under `activity.*` and reused there); Tab-scope wiring for the tabs of this slice.
   4. **PT-4 Extend the guide**: 24 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `clients.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No timeline entries: only `timelineEmpty` is explained. Empty variants for appointments and contracts.
   - **Populated, repeated rows or cards (P):** Timeline entries are `repeat`; the first visible one is the exemplar.
   - **Permission- or workflow-dependent controls (A):** Add-note and channel buttons are dropped without `notes.add` / `activities.add`; the follow-up block needs `followups.manage`. Contracts tab needs `contracts.validity.view`.
   - **Dialogs, drawers, menus, nested workflows (D):** The channel button opens `ActivityDialog`; the tour explains its fields only after the user opens it. The Plan activity dialog and the appointment detail panel are shared components: this page only declares the hand-offs and reuses their guidance.
   - **Tabs / sections (T):** Tab steps carry `scope.tab`; the tour runs the active tab and ends with "other tabs" pointing at the tab list.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New activities saved by the user after the tour exits appear as new timeline entries with the same repeated id.
   - If the dialog's result list is empty (lookup not configured) the `activityResult` step is dropped.
   - Tab content loads lazily (the contracts tab loads its own data): the step waits on `aria-busy` rather than assuming an empty tab.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Real `ActivityDialog`: tour waits for the user to open it, explains five fields, never saves.
   - Timeline with 0, 1 and 50 entries.
   - Permission variants.
   - Tab-scoped eligibility; lazily loaded contracts tab waiting then populated; empty variants.
   - Regression: existing tests of `ClientDetailContent.tsx`, `CompanyTimeline.tsx`, `ActivityDialog.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - The `activity.*` ids are documented as shared with the deals slice that reuses the dialog.
   - Tour from any tab ends with a pointer to the remaining tabs, not an error.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsDetail src/pages/clients src/components/clients src/components/activities
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 274.
15. **Dependencies and handoff:** unblocks S25, S30. Later slices of this page extend the same guide and may rely on the ids `clients.detail.*` and the registration made in slice 1.

### S25: Client detail: deals and Wellness+ tabs

1. **Slice id and title:** S25. Client detail: deals and Wellness+ tabs. Branch `support-slice-25-client-detail-deals-and-wellness-tabs`.
2. **Scope:** The Deals tab and the Wellness+ tab (employer link, employees, upload entry, member table, remove-from-company dialog).
3. **Purpose:** Completes the page. The Wellness+ tab links to members, so wording must match the members pages.
4. **Page association:** one page only: **Client detail** (`clients.detail`; `/:tenantSlug/clients/:clientId`); slice 3 of 3. Not infrastructure.
5. **Prerequisites:** S24 (Client detail: timeline, activity logging and the appointments tab); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/clients/ClientDetailPage.tsx`, `pages/clients/ClientDetailContent.tsx`, `components/followUps/FollowUpsPanel.tsx`, `components/calendar/PlanActivityDialog.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~158** (just under the target (150 to 199)): 6 extend the guide and registration + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26 + Annotate `MemberBadges` and `RemoveFromCompanyDialog` (shared with the members pages) with component-scoped ids 14. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/components/clients/ClientDealsTab.tsx`, `src/pages/membership/CompanyWellnessTab.tsx`, `src/pages/membership/MemberBadges.tsx`, `src/pages/membership/RemoveFromCompanyDialog.tsx`
   - Extended: `src/lib/support/guides/clientsDetail.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/clientsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/components/clients/ClientDealsTab.tsx`, `src/pages/membership/CompanyWellnessTab.tsx`, `src/pages/membership/MemberBadges.tsx`, `src/pages/membership/RemoveFromCompanyDialog.tsx`.
   3. **PT-3 Annotate** about 13 sites in those files. Includes: Annotate `MemberBadges` and `RemoveFromCompanyDialog` (shared with the members pages) with component-scoped ids.
   4. **PT-4 Extend the guide**: 14 steps, in tour order (`<id>` becomes the copy key `supportSales:clients.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `clients.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Each tab has its own empty state. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Permission- or workflow-dependent controls (A):** Tabs and actions follow `deals.view`, `deals.edit`, `members.view`, `members.import`.
   - **Dialogs, drawers, menus, nested workflows (D):** The Wellness+ dialog is a hand-off.
   - **Tabs / sections (T):** Tab-scoped steps as in the previous slice.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Linked members change after an upload in another tab; the table rows are `repeat`, so the new employees need no tour change.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Wellness tab with 0 / 3 / 40 members; no valid contract notice; permission matrix.
   - Regression: existing tests of `ClientDealsTab.tsx`, `CompanyWellnessTab.tsx`, `MemberBadges.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - All five tabs of the page are reachable from Support; matrix in section 5.7 shows the page complete.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/clientsDetail src/components/clients src/pages/membership
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "clients.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 158.
15. **Dependencies and handoff:** unblocks S47, S52. After this slice **Client detail is complete**: every applicable state in 7.3 is covered.

### S26: Pricing screen: inputs, calculation, warnings and save

1. **Slice id and title:** S26. Pricing screen: inputs, calculation, warnings and save. Branch `support-slice-26-pricing-screen-inputs-calculation-warnings-and`.
2. **Scope:** The whole pricing screen for both entry routes (from a deal, from a company).
3. **Purpose:** A calculation screen where wrong guidance is costly; every step restates what the server calculates and what the user controls.
4. **Page association:** one page only: **Pricing screen (offer builder)** (`pricing.offer`; `/:tenantSlug/deals/:dealId/pricing`, `/:tenantSlug/clients/:clientId/pricing`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/pricing/PricingContent.tsx`.
6. **Production LOC estimate:** **~214** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 19 steps x 8 = 152 + 17 annotation sites x 2 = 34 + `vars` for entry mode and derived values read from the summary region 12. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/pricing/PricingContent.tsx`, `src/pages/pricing/pricingScreenError.ts`
   - New: `src/lib/support/guides/pricingOffer.ts`, `src/lib/support/guides/pricingOffer.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S27: Discount approvals

1. **Slice id and title:** S27. Discount approvals. Branch `support-slice-27-discount-approvals`.
2. **Scope:** The approvals queue.
3. **Purpose:** A short page; the slice also pins down how a table with per-row decision actions is guided.
4. **Page association:** one page only: **Discount approvals** (`approvals`; `/:tenantSlug/approvals`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/approvals/ApprovalsPage.tsx`, `pages/approvals/ApprovalsContent.tsx`.
6. **Production LOC estimate:** **~140** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22 + `ApprovalsContent` row actions annotation (controls read at slice start) 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/approvals/ApprovalsContent.tsx`
   - New: `src/lib/support/guides/approvals.ts`, `src/lib/support/guides/approvals.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination via shared guidance. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error step. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Whole page by permission and workflow.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Approving elsewhere removes the row; pagination total updates.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S28: Offers list

1. **Slice id and title:** S28. Offers list. Branch `support-slice-28-offers-list`.
2. **Scope:** Search, status chips, filters, table and pagination.
3. **Purpose:** List-page pattern with chips; reuses shared filter guidance.
4. **Page association:** one page only: **Offers list** (`offers`; `/:tenantSlug/offers`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/offers/OfferList.tsx`, `pages/offers/OfferListContent.tsx`.
6. **Production LOC estimate:** **~172** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/offers/OfferListContent.tsx`
   - New: `src/lib/support/guides/offers.ts`, `src/lib/support/guides/offers.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Shared pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Value column and salesperson by permission and scope.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Toggling a chip while the tour sits on `statusChips` does not disturb it.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S29: Deal form

1. **Slice id and title:** S29. Deal form. Branch `support-slice-29-deal-form`.
2. **Scope:** Create and edit deal.
3. **Purpose:** Company search by typing is the interesting dynamic part.
4. **Page association:** one page only: **Deal form (create and edit)** (`deals.form`; `/:tenantSlug/deals/new`, `/:tenantSlug/deals/:dealId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/deals/DealFormContent.tsx`.
6. **Production LOC estimate:** **~154** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/deals/DealFormContent.tsx`
   - New: `src/lib/support/guides/dealsForm.ts`, `src/lib/support/guides/dealsForm.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** None beyond the result list. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Errors explained if rendered. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Search results appear after typing; absent results skip `companyMatch`.
   - Choosing a company swaps the search for the chosen state.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S30: Deal detail: header, stage, history, activities and the follow-ups panel

1. **Slice id and title:** S30. Deal detail: header, stage, history, activities and the follow-ups panel. Branch `support-slice-30-deal-detail-header-stage-history-activities`.
2. **Scope:** Header, the open / won / lost action sets, the actions menu, the stage select and the history list.
3. **Purpose:** Open, won and lost deals expose different controls; the tour follows what is rendered.
4. **Page association:** one page only: **Deal detail** (`deals.detail`; `/:tenantSlug/deals/:dealId`); slice 1 of 3. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S24 (Client detail: timeline, activity logging and the appointments tab). Existing code it relies on, unchanged since planning: `pages/deals/DealDetailContent.tsx`, `pages/deals/DealClosingModals.tsx`, `pages/deals/DealActivitiesSection.tsx`, `pages/deals/DealOffersSection.tsx`.
6. **Production LOC estimate:** **~230** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 21 steps x 8 = 168 + 19 annotation sites x 2 = 38 + Open / won / lost mode markers on the action bar 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/deals/DealDetailContent.tsx`
   - New: `src/lib/support/guides/dealsDetail.ts`, `src/lib/support/guides/dealsDetail.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dealsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/DealDetailContent.tsx`.
   3. **PT-3 Annotate** about 19 sites in those files. Includes: Open / won / lost mode markers on the action bar.
   4. **PT-4 Write the guide**: 21 steps, in tour order (`<id>` becomes the copy key `supportSales:deals.detail.<id>.title|body`):
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
      - `activitiesSection` — activities section
      - `addActivity` — add an activity (needs `activities.add`, try-it, opens the shared activity dialog)
      - `activity` — one activity (repeat)
      - `activityDetails` — expand an activity to read its details (`ActivityDetails`, repeat, try-it)
      - `activityEdit` — edit own activity (repeat, needs edit rights, explain-only)
      - `activitiesEmpty` — none yet (state)
      - `followUpsPanel` — the follow-ups panel of this deal (reuses the component-scoped `followUps.*` guidance written with the client detail slice)
   5. **PT-5 Register** `/:tenantSlug/deals/:dealId` as page `deals.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `deals.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Both sections have empty states. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** History is repeated. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Not found / load error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Edit, Reassign, Delete, Reopen by permission.
   - **Dialogs, drawers, menus, nested workflows (D):** Menu hand-off. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Destructive or irreversible actions (explain-only) (K):** Delete and Lose carry warnings. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Closing the deal (by the user after exiting) changes the action set; resuming the tour recomputes eligibility and drops buttons that no longer exist.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Open / won / lost fixtures; permission matrix; disabled Win with and without an offer.
   - Regression: existing tests of `DealDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No stage change possible while touring.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dealsDetail src/pages/deals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "deals.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 230.
15. **Dependencies and handoff:** unblocks S31. Later slices of this page extend the same guide and may rely on the ids `deals.detail.*` and the registration made in slice 1.

### S31: Deal detail: offers section and the per-offer action bar

1. **Slice id and title:** S31. Deal detail: offers section and the per-offer action bar. Branch `support-slice-31-deal-detail-offers-section-and-the`.
2. **Scope:** The offers section and the activities section.
3. **Purpose:** Both are repeated, data-driven lists with row actions.
4. **Page association:** one page only: **Deal detail** (`deals.detail`; `/:tenantSlug/deals/:dealId`); slice 2 of 3. Not infrastructure.
5. **Prerequisites:** S30 (Deal detail: header, stage, history, activities and the follow-ups panel); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/deals/DealDetailContent.tsx`, `pages/deals/DealClosingModals.tsx`, `pages/deals/DealActivitiesSection.tsx`, `pages/deals/DealOffersSection.tsx`.
6. **Production LOC estimate:** **~242** (within the 200 to 300 target): 6 extend the guide and registration + 24 steps x 8 = 192 + 22 annotation sites x 2 = 44. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/deals/DealOffersSection.tsx`, `src/components/offers/OfferActions.tsx`, `src/pages/deals/DealActivitiesSection.tsx`, `src/components/activities/ActivityDetails.tsx`, `src/components/activities/useCanEditActivity.ts`
   - Extended: `src/lib/support/guides/dealsDetail.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dealsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/DealOffersSection.tsx`, `src/components/offers/OfferActions.tsx`, `src/pages/deals/DealActivitiesSection.tsx`, `src/components/activities/ActivityDetails.tsx`, `src/components/activities/useCanEditActivity.ts`.
   3. **PT-3 Annotate** about 22 sites in those files.
   4. **PT-4 Extend the guide**: 24 steps, in tour order (`<id>` becomes the copy key `supportSales:deals.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `deals.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Both sections have empty states. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Offers and activities repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** Offer and activity actions by permission; edit by ownership (`useCanEditActivity`).
   - **Dialogs, drawers, menus, nested workflows (D):** The activity dialog reuses the `activity.*` guidance introduced with the client timeline slice.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New offers saved from the pricing screen appear as rows with the same id.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - 0 / 3 offers; ownership-dependent edit button; shared dialog guidance reused.
   - Regression: existing tests of `DealOffersSection.tsx`, `OfferActions.tsx`, `DealActivitiesSection.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Reuse of `activity.*` is asserted (no duplicate copy keys).
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 242.
15. **Dependencies and handoff:** unblocks S32. Later slices of this page extend the same guide and may rely on the ids `deals.detail.*` and the registration made in slice 1.

### S32: Deal detail: win, lose, reopen, reassign and delete dialogs

1. **Slice id and title:** S32. Deal detail: win, lose, reopen, reassign and delete dialogs. Branch `support-slice-32-deal-detail-win-lose-reopen-reassign`.
2. **Scope:** The six dialogs of the page.
3. **Purpose:** All are data-changing; every confirm button is explain-only.
4. **Page association:** one page only: **Deal detail** (`deals.detail`; `/:tenantSlug/deals/:dealId`); slice 3 of 3. Not infrastructure.
5. **Prerequisites:** S31 (Deal detail: offers section and the per-offer action bar); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/deals/DealDetailContent.tsx`, `pages/deals/DealClosingModals.tsx`, `pages/deals/DealActivitiesSection.tsx`, `pages/deals/DealOffersSection.tsx`.
6. **Production LOC estimate:** **~198** (just under the target (150 to 199)): 6 extend the guide and registration + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Annotations across `DealClosingModals` (component-scoped `dealClosing.*`, reused by the pipeline board) and the two inline dialogs in `DealDetailContent` 16. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/deals/DealClosingModals.tsx`, `src/pages/deals/DealDetailContent.tsx`
   - Extended: `src/lib/support/guides/dealsDetail.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/dealsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/deals/DealClosingModals.tsx`, `src/pages/deals/DealDetailContent.tsx`.
   3. **PT-3 Annotate** about 16 sites in those files. Includes: Annotations across `DealClosingModals` (component-scoped `dealClosing.*`, reused by the pipeline board) and the two inline dialogs in `DealDetailContent`.
   4. **PT-4 Extend the guide**: 18 steps, in tour order (`<id>` becomes the copy key `supportSales:deals.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `deals.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Permission- or workflow-dependent controls (A):** Which dialogs can be opened depends on permission and deal state.
   - **Dialogs, drawers, menus, nested workflows (D):** Each dialog is entered by a hand-off from the page button or menu item.
   - **Validation and submission (V):** Disabled confirm buttons explain what is missing.
   - **Destructive or irreversible actions (explain-only) (K):** Lose, delete and win carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - If the deal is closed in another tab while a dialog step is current, the layer closes and the tour returns to the page level.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Each dialog hand-off with real `Modal`; confirm buttons never invoke the service (spies).
   - Regression: existing tests of `DealClosingModals.tsx`, `DealDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Playwright: open each dialog, finish tour, zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/dealsDetail src/pages/deals
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "deals.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 198.
15. **Dependencies and handoff:** unblocks S33. After this slice **Deal detail is complete**: every applicable state in 7.3 is covered.

### S33: Pipeline board: columns, cards, move menu and load more

1. **Slice id and title:** S33. Pipeline board: columns, cards, move menu and load more. Branch `support-slice-33-pipeline-board-columns-cards-move-menu`.
2. **Scope:** The board and its repeated structures.
3. **Purpose:** The clearest "repeated card" case: any number of deals, columns and per-column paging with a fixed step list.
4. **Page association:** one page only: **Pipeline board** (`pipeline.board`; `/:tenantSlug/pipeline`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S32 (Deal detail: win, lose, reopen, reassign and delete dialogs). Existing code it relies on, unchanged since planning: `pages/deals/DealsPage.tsx`, `pages/deals/PipelineBoardContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`, `pages/deals/DealMarkers.tsx`.
6. **Production LOC estimate:** **~198** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + `DealMarkers` and column annotations 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/deals/PipelineBoardContent.tsx`, `src/pages/deals/PipelineViewSwitch.tsx`, `src/pages/deals/DealMarkers.tsx`
   - New: `src/lib/support/guides/pipelineBoard.ts`, `src/lib/support/guides/pipelineBoard.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 9 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S34: Pipeline list: filters, table and pagination

1. **Slice id and title:** S34. Pipeline list: filters, table and pagination. Branch `support-slice-34-pipeline-list-filters-table-and-pagination`.
2. **Scope:** The list alternative of the pipeline.
3. **Purpose:** Many filters; each is explained once through shared kinds.
4. **Page association:** one page only: **Pipeline list** (`pipeline.list`; `/:tenantSlug/pipeline/list`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/deals/DealListContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`.
6. **Production LOC estimate:** **~232** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 22 steps x 8 = 176 + 20 annotation sites x 2 = 40. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/deals/DealListContent.tsx`
   - New: `src/lib/support/guides/pipelineList.ts`, `src/lib/support/guides/pipelineList.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Scope and value permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Filter state survives while the tour runs; clear appears only when needed.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S35: Quotations list

1. **Slice id and title:** S35. Quotations list. Branch `support-slice-35-quotations-list`.
2. **Scope:** Legacy-workflow quotations list.
3. **Purpose:** Only tenants on LEGACY_QUOTATIONS see this page; the guide declares `requires.workflow`.
4. **Page association:** one page only: **Quotations list (legacy workflow)** (`quotations.list`; `/:tenantSlug/quotations`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/quotations/QuotationList.tsx`, `pages/quotations/QuotationListContent.tsx`.
6. **Production LOC estimate:** **~144** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/quotations/QuotationListContent.tsx`
   - New: `src/lib/support/guides/quotationsList.ts`, `src/lib/support/guides/quotationsList.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Status filter changes the list; rows re-pick.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S36: Quotation form (create and edit)

1. **Slice id and title:** S36. Quotation form (create and edit). Branch `support-slice-36-quotation-form-create-and-edit`.
2. **Scope:** Quotation create / edit with line items.
3. **Purpose:** Repeated rows entered by the user; the line row id is repeated.
4. **Page association:** one page only: **Quotation form (create and edit)** (`quotations.form`; `/:tenantSlug/quotations/new`, `/:tenantSlug/quotations/:id/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/quotations/CreateQuotation.tsx`, `pages/quotations/EditQuotation.tsx`, `pages/quotations/QuotationFormContent.tsx`.
6. **Production LOC estimate:** **~154** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/quotations/QuotationFormContent.tsx`, `src/pages/quotations/CreateQuotation.tsx`, `src/pages/quotations/EditQuotation.tsx`
   - New: `src/lib/support/guides/quotationsForm.ts`, `src/lib/support/guides/quotationsForm.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S37: Quotation detail

1. **Slice id and title:** S37. Quotation detail. Branch `support-slice-37-quotation-detail`.
2. **Scope:** Status-driven action buttons and the document.
3. **Purpose:** Eleven buttons render by status; the tour follows the DOM.
4. **Page association:** one page only: **Quotation detail** (`quotations.detail`; `/:tenantSlug/quotations/:id`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/quotations/QuotationDetail.tsx`, `pages/quotations/QuotationDetailContent.tsx`.
6. **Production LOC estimate:** **~164** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 15 steps x 8 = 120 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/quotations/QuotationDetailContent.tsx`
   - New: `src/lib/support/guides/quotationsDetail.ts`, `src/lib/support/guides/quotationsDetail.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S38: Invoices list

1. **Slice id and title:** S38. Invoices list. Branch `support-slice-38-invoices-list`.
2. **Scope:** Invoices list.
3. **Purpose:** Short list page; pins the row-actions pattern for invoices.
4. **Page association:** one page only: **Invoices list** (`invoices.list`; `/:tenantSlug/invoices`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/invoices/InvoiceList.tsx`, `pages/invoices/InvoiceListContent.tsx`.
6. **Production LOC estimate:** **~134** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/invoices/InvoiceListContent.tsx`
   - New: `src/lib/support/guides/invoicesList.ts`, `src/lib/support/guides/invoicesList.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Rows re-pick after search.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S39: Invoice detail

1. **Slice id and title:** S39. Invoice detail. Branch `support-slice-39-invoice-detail`.
2. **Scope:** Invoice detail.
3. **Purpose:** Status-dependent actions.
4. **Page association:** one page only: **Invoice detail** (`invoices.detail`; `/:tenantSlug/invoices/:id`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/invoices/InvoiceDetail.tsx`, `pages/invoices/InvoiceDetailContent.tsx`.
6. **Production LOC estimate:** **~104** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/invoices/InvoiceDetailContent.tsx`
   - New: `src/lib/support/guides/invoicesDetail.ts`, `src/lib/support/guides/invoicesDetail.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S40: Contracts list

1. **Slice id and title:** S40. Contracts list. Branch `support-slice-40-contracts-list`.
2. **Scope:** Contracts list.
3. **Purpose:** Filter-heavy list with an action menu.
4. **Page association:** one page only: **Contracts list** (`contracts.list`; `/:tenantSlug/contracts`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/contracts/ContractList.tsx`, `pages/contracts/ContractListContent.tsx`.
6. **Production LOC estimate:** **~172** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/contracts/ContractListContent.tsx`
   - New: `src/lib/support/guides/contractsList.ts`, `src/lib/support/guides/contractsList.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Filter combinations that return nothing swap to `emptyNoMatch`.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S41: Contract form

1. **Slice id and title:** S41. Contract form. Branch `support-slice-41-contract-form`.
2. **Scope:** Contract create / edit.
3. **Purpose:** Dates and values have rules the server enforces; the tour states them without testing them.
4. **Page association:** one page only: **Contract form (create and edit)** (`contracts.form`; `/:tenantSlug/contracts/new`, `/:tenantSlug/contracts/:contractId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/contracts/ContractFormPage.tsx`, `pages/contracts/ContractFormContent.tsx`.
6. **Production LOC estimate:** **~134** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/contracts/ContractFormContent.tsx`
   - New: `src/lib/support/guides/contractsForm.ts`, `src/lib/support/guides/contractsForm.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
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

### S42: Contract detail: lifecycle, terms, documents, notes, history and reason dialogs

1. **Slice id and title:** S42. Contract detail: lifecycle, terms, documents, notes, history and reason dialogs. Branch `support-slice-42-contract-detail-lifecycle-terms-documents-notes`.
2. **Scope:** Header, lifecycle actions and the terms block. The lower blocks and the two confirmation patterns (ConfirmDialog and the reason Modal).
3. **Purpose:** About ten lifecycle buttons render by status; this slice covers the action set and the read-only blocks. File upload and reason dialogs are the risky parts of this page.
4. **Page association:** one page only: **Contract detail** (`contracts.detail`; `/:tenantSlug/contracts/:contractId`); slice 1 of 2. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/contracts/ContractDetail.tsx`, `pages/contracts/ContractDetailContent.tsx`, `components/contracts/ContractPaymentsCard.tsx`.
6. **Production LOC estimate:** **~290** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 27 steps x 8 = 216 + 24 annotation sites x 2 = 48 + Annotations for the hidden file input trigger and both dialogs 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/contracts/ContractDetailContent.tsx`
   - New: `src/lib/support/guides/contractsDetail.ts`, `src/lib/support/guides/contractsDetail.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/contractsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/contracts/ContractDetailContent.tsx`.
   3. **PT-3 Annotate** about 24 sites in those files. Includes: Annotations for the hidden file input trigger and both dialogs.
   4. **PT-4 Write the guide**: 27 steps, in tour order (`<id>` becomes the copy key `supportSales:contracts.detail.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/contracts/:contractId` as page `contracts.detail`, **PT-6 Copy** in namespace `supportSales`, **PT-7 End-to-end row** `contracts.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty documents. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Files and history repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Warning banner and error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Buttons per status and permission. Upload / remove by permission.
   - **Dialogs, drawers, menus, nested workflows (D):** Both dialogs are hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Reason is required. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Suspend, cancel and renew carry warnings. Remove and confirm are warned.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The status changes only through the user after Exit; resuming recomputes the button set.
   - Files uploaded after the tour appear as repeated rows.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - One fixture per status.
   - Upload button never opens a file chooser during the tour; dialogs.
   - Regression: existing tests of `ContractDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No lifecycle request is sent.
   - Zero mutations including uploads.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/contractsDetail src/pages/contracts
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "contracts.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 290.
15. **Dependencies and handoff:** unblocks S43. Later slices of this page extend the same guide and may rely on the ids `contracts.detail.*` and the registration made in slice 1.

### S43: Contract detail: instalment schedule card, drawer and add-instalment dialog

1. **Slice id and title:** S43. Contract detail: instalment schedule card, drawer and add-instalment dialog. Branch `support-slice-43-contract-detail-instalment-schedule-card-drawer`.
2. **Scope:** The `ContractPaymentsCard` (about 590 lines): the instalment schedule, its export, the instalment drawer with its invoice / receipt / reverse / correct / edit / remove modes, and the add-instalment dialog.
3. **Purpose:** This is the money-changing part of the contract page: every submit is explain-only, and the forms inside the drawer are explained field by field without being submitted. It was missed by the first inventory (found by walking the page's imports) and is the reason PT-2 now includes that walk.
4. **Page association:** one page only: **Contract detail** (`contracts.detail`; `/:tenantSlug/contracts/:contractId`); slice 2 of 2. Not infrastructure.
5. **Prerequisites:** S42 (Contract detail: lifecycle, terms, documents, notes, history and reason dialogs); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/contracts/ContractDetail.tsx`, `pages/contracts/ContractDetailContent.tsx`, `components/contracts/ContractPaymentsCard.tsx`.
6. **Production LOC estimate:** **~282** (within the 200 to 300 target): 6 extend the guide and registration + 26 steps x 8 = 208 + 23 annotation sites x 2 = 46 + Annotate `ContractPaymentsCard` (table rows, drawer modes, forms) with component-scoped ids 22. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/components/contracts/ContractPaymentsCard.tsx`, `src/pages/contracts/ContractDetailContent.tsx`
   - Extended: `src/lib/support/guides/contractsDetail.ts`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/contractsDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/components/contracts/ContractPaymentsCard.tsx`, `src/pages/contracts/ContractDetailContent.tsx`.
   3. **PT-3 Annotate** about 23 sites in those files. Includes: Annotate `ContractPaymentsCard` (table rows, drawer modes, forms) with component-scoped ids.
   4. **PT-4 Extend the guide**: 26 steps, in tour order (`<id>` becomes the copy key `supportSales:contracts.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSales`; **PT-7** extend the end-to-end row `contracts.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No instalments yet. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Instalment rows repeat; the drawer's action set differs by status, so the group steps are eligible per rendered button.
   - **Error / retry (X):** Card and drawer errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Export needs `payments.view`; the drawer actions depend on instalment status and permissions.
   - **Dialogs, drawers, menus, nested workflows (D):** The drawer and the add dialog are hand-offs.
   - **Validation and submission (V):** Required comments, dates not in the future, amount format: explained as rendered; Save is locked.
   - **Destructive or irreversible actions (explain-only) (K):** Reverse and remove are destructive; invoice and receipt create financial records.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Which drawer actions exist depends on the instalment's status; each is its own step and is skipped when its button is not rendered.
   - An instalment invoiced or paid elsewhere changes the row and the drawer action set; the exemplar row is re-read.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - One fixture per instalment status; drawer hand-off with the real `SlideOver`; no invoice, receipt, reversal or removal request is sent (allow-list empty).
   - Regression: existing tests of `ContractPaymentsCard.tsx`, `ContractDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero financial mutations, verified by `expectNoMutations` with an empty allow-list.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/contractsDetail src/components/contracts src/pages/contracts
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "contracts.detail"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 282.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Contract detail is complete**: every applicable state in 7.3 is covered.

### S44: Payments overview

1. **Slice id and title:** S44. Payments overview. Branch `support-slice-44-payments-overview`.
2. **Scope:** Filters, totals, export, table, pagination.
3. **Purpose:** Eight filters plus export; shared filter guidance keeps this readable.
4. **Page association:** one page only: **Payments overview** (`payments`; `/:tenantSlug/payments`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/payments/PaymentsOverview.tsx`, `pages/payments/PaymentsOverviewContent.tsx`.
6. **Production LOC estimate:** **~198** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + `exporting` state hint (export disabled while running or with zero rows) 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/payments/PaymentsOverviewContent.tsx`
   - New: `src/lib/support/guides/payments.ts`, `src/lib/support/guides/payments.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission and scope. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Export is disabled with zero rows: the step shows the disabled hint.
   - Totals change with filters; the step describes what they sum, not the numbers.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S45: Renewals: windows, filters, table, row actions and the not-renewing dialog

1. **Slice id and title:** S45. Renewals: windows, filters, table, row actions and the not-renewing dialog. Branch `support-slice-45-renewals-windows-filters-table-row-actions`.
2. **Scope:** The whole page.
3. **Purpose:** A work-list page with row buttons and a reason dialog.
4. **Page association:** one page only: **Renewals** (`renewals`; `/:tenantSlug/renewals`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/renewals/Renewals.tsx`, `pages/renewals/RenewalsContent.tsx`.
6. **Production LOC estimate:** **~212** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/renewals/RenewalsContent.tsx`
   - New: `src/lib/support/guides/renewals.ts`, `src/lib/support/guides/renewals.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Dialog hand-off. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Reason required. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Window tabs scope the row actions.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Switching windows changes which action buttons exist; the eligible list follows.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S46: Performance: comparison, filters, export, person detail and records dialog

1. **Slice id and title:** S46. Performance: comparison, filters, export, person detail and records dialog. Branch `support-slice-46-performance-comparison-filters-export-person-detail`.
2. **Scope:** The main screen. The detail panel and the records dialog.
3. **Purpose:** Period logic and comparison; export buttons are explained, not pressed. Second half of the page.
4. **Page association:** one page only: **Performance** (`performance`; `/:tenantSlug/performance`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/performance/Performance.tsx`, `pages/performance/PerformanceContent.tsx`, `pages/performance/PerformanceDetail.tsx`, `pages/performance/PerformanceRecordsDialog.tsx`.
6. **Production LOC estimate:** **~290** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 28 steps x 8 = 224 + 25 annotation sites x 2 = 50. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/performance/PerformanceContent.tsx`, `src/pages/performance/PerformanceDetail.tsx`, `src/pages/performance/PerformanceRecordsDialog.tsx`
   - New: `src/lib/support/guides/performance.ts`, `src/lib/support/guides/performance.test.tsx`. Touched: `locales/{en,sq}/supportSales.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

#### Page tours: Wellness+ membership

### S47: Members list

1. **Slice id and title:** S47. Members list. Branch `support-slice-47-members-list`.
2. **Scope:** The Wellness+ member list.
3. **Purpose:** Filter-heavy list; the conditional left-from / left-to inputs show runtime-dependent controls.
4. **Page association:** one page only: **Members list** (`members.list`; `/:tenantSlug/members`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S25 (Client detail: deals and Wellness+ tabs). Existing code it relies on, unchanged since planning: `pages/membership/MembersList.tsx`, `pages/membership/MembersContent.tsx`, `pages/membership/MemberBadges.tsx`.
6. **Production LOC estimate:** **~232** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 22 steps x 8 = 176 + 20 annotation sites x 2 = 40. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/MembersContent.tsx`
   - Existing, read only: `src/pages/membership/MemberBadges.tsx` (read: annotated with the client detail Wellness+ tab)
   - New: `src/lib/support/guides/membersList.ts`, `src/lib/support/guides/membersList.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S48: Member form (register and edit)

1. **Slice id and title:** S48. Member form (register and edit). Branch `support-slice-48-member-form-register-and-edit`.
2. **Scope:** Member register and edit, including the duplicate dialog.
3. **Purpose:** The form deliberately has no tier, status, number or expiry control; the tour says so.
4. **Page association:** one page only: **Member form (register and edit)** (`members.form`; `/:tenantSlug/members/new`, `/:tenantSlug/members/:memberId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/MemberFormPage.tsx`, `pages/membership/MemberFormContent.tsx`.
6. **Production LOC estimate:** **~192** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/MemberFormContent.tsx`
   - New: `src/lib/support/guides/membersForm.ts`, `src/lib/support/guides/membersForm.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S49: Member detail: header, action bar and the overview, terms, history and note tabs

1. **Slice id and title:** S49. Member detail: header, action bar and the overview, terms, history and note tabs. Branch `support-slice-49-member-detail-header-action-bar-and`.
2. **Scope:** Everything above the tabs. Overview, Terms, History and Note tabs (read-only blocks).
3. **Purpose:** First of five slices for the member page. Explains how the effective tier is shown without ever offering a way to type it.
4. **Page association:** one page only: **Member detail** (`members.detail`; `/:tenantSlug/members/:memberId`); slice 1 of 4. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~290** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 28 steps x 8 = 224 + 25 annotation sites x 2 = 50. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/MemberDetailContent.tsx`
   - New: `src/lib/support/guides/membersDetail.ts`, `src/lib/support/guides/membersDetail.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/MemberDetailContent.tsx`.
   3. **PT-3 Annotate** about 25 sites in those files.
   4. **PT-4 Write the guide**: 28 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.detail.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/members/:memberId` as page `members.detail`, **PT-6 Copy** in namespace `supportMembers`, **PT-7 End-to-end row** `members.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No terms yet, no history. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Loading is a one-line `role="status"`; the tour waits.
   - **Populated, repeated rows or cards (P):** Terms and history rows repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Not found and load failed. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Each button needs its own permission. Note editing needs `members.manage`.
   - **Validation and submission (V):** Note save locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Four tabs; tab-scoped steps. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Close carries a warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Suspending a member (by the user) changes the button set; the eligible list recomputes after Exit/Resume.
   - New terms appear after a payment (in another session) as new rows with the same ids.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Permission matrix; status fixtures.
   - Tab scoping; empty vs populated terms.
   - Regression: existing tests of `MemberDetailContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
   - Tour leaves the note unchanged.
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 290.
15. **Dependencies and handoff:** unblocks S50. Later slices of this page extend the same guide and may rely on the ids `members.detail.*` and the registration made in slice 1.

### S50: Member detail: payments and VIP tabs, receipt, void and decision dialogs

1. **Slice id and title:** S50. Member detail: payments and VIP tabs, receipt, void and decision dialogs. Branch `support-slice-50-member-detail-payments-and-vip-tabs`.
2. **Scope:** Payments tab, receipt links and the void dialog. VIP tab: current VIP term, requests, request and decision.
3. **Purpose:** Void is data-changing and irreversible in effect; explain-only. Approver vs requester roles see different controls.
4. **Page association:** one page only: **Member detail** (`members.detail`; `/:tenantSlug/members/:memberId`); slice 2 of 4. Not infrastructure.
5. **Prerequisites:** S49 (Member detail: header, action bar and the overview, terms, history and note tabs); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~290** (within the 200 to 300 target): 6 extend the guide and registration + 29 steps x 8 = 232 + 26 annotation sites x 2 = 52. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/MemberDetailContent.tsx`, `src/pages/membership/VipTab.tsx`, `src/pages/membership/VipDecisionDialog.tsx`
   - Extended: `src/lib/support/guides/membersDetail.ts`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/MemberDetailContent.tsx`, `src/pages/membership/VipTab.tsx`, `src/pages/membership/VipDecisionDialog.tsx`.
   3. **PT-3 Annotate** about 26 sites in those files.
   4. **PT-4 Extend the guide**: 29 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportMembers`; **PT-7** extend the end-to-end row `members.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty payments. No requests. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Rows repeat. Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** The tab and the Void button exist only with their permissions: a user without `members.payments.view` gets no payment steps. Requester vs approver.
   - **Dialogs, drawers, menus, nested workflows (D):** Void dialog hand-off. Two dialogs.
   - **Validation and submission (V):** Reason required. Comment required.
   - **Tabs / sections (T):** Tab scope. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Void warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Only the latest non-voided payment has a Void button; after a void the next payment gains it.
   - A request decided elsewhere changes its row; the approve / reject buttons disappear.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Reception vs agent; latest-only void; hand-off.
   - Requester vs approver vs both; own-request rule.
   - Regression: existing tests of `MemberDetailContent.tsx`, `VipTab.tsx`, `VipDecisionDialog.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No void request sent.
   - No VIP decision recorded.
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 290.
15. **Dependencies and handoff:** unblocks S51, S57. Later slices of this page extend the same guide and may rely on the ids `members.detail.*` and the registration made in slice 1.

### S51: Member detail: family tab

1. **Slice id and title:** S51. Member detail: family tab. Branch `support-slice-51-member-detail-family-tab`.
2. **Scope:** Family group, add / link / remove dialogs.
3. **Purpose:** Largest tab (405 lines).
4. **Page association:** one page only: **Member detail** (`members.detail`; `/:tenantSlug/members/:memberId`); slice 3 of 4. Not infrastructure.
5. **Prerequisites:** S50 (Member detail: payments and VIP tabs, receipt, void and decision dialogs); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~216** (within the 200 to 300 target): 6 extend the guide and registration + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36 + Annotations in `FamilyTab` dialogs (11 inputs) 14. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/FamilyTab.tsx`
   - Extended: `src/lib/support/guides/membersDetail.ts`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/FamilyTab.tsx`.
   3. **PT-3 Annotate** about 18 sites in those files. Includes: Annotations in `FamilyTab` dialogs (11 inputs).
   4. **PT-4 Extend the guide**: 20 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportMembers`; **PT-7** extend the end-to-end row `members.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No family. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** Add / remove need `members.manage`; a family member (not a principal) sees a different tab.
   - **Dialogs, drawers, menus, nested workflows (D):** Two dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Required tick and relationship. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Tab scope. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Remove warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Search matches are a repeated list; no match shows the empty result.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - SUP-09: permission, scope or workflow variants of the steps that carry `needs` or a scope rule.
   - Principal vs family member; both dialogs; permission.
   - Regression: existing tests of `FamilyTab.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No family link is created or removed.
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 216.
15. **Dependencies and handoff:** unblocks S52. Later slices of this page extend the same guide and may rely on the ids `members.detail.*` and the registration made in slice 1.

### S52: Member detail: record payment, correct tier, remove from company, card and status dialogs

1. **Slice id and title:** S52. Member detail: record payment, correct tier, remove from company, card and status dialogs. Branch `support-slice-52-member-detail-record-payment-correct-tier`.
2. **Scope:** The remaining dialogs.
3. **Purpose:** Closes the page.
4. **Page association:** one page only: **Member detail** (`members.detail`; `/:tenantSlug/members/:memberId`); slice 4 of 4. Not infrastructure.
5. **Prerequisites:** S51 (Member detail: family tab); S18 (Clients list: states, rows, row menu and archive / restore); S25 (Client detail: deals and Wellness+ tabs). Existing code it relies on, unchanged since planning: `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~222** (within the 200 to 300 target): 6 extend the guide and registration + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36 + Annotations across `RecordPaymentModal`, `CorrectTierDialog`, `RemoveFromCompanyDialog`, `MemberCardDialog` and the status Modal 20. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/RecordPaymentModal.tsx`, `src/pages/membership/CorrectTierDialog.tsx`, `src/pages/membership/RemoveFromCompanyDialog.tsx`, `src/pages/membership/MemberCardDialog.tsx`, `src/pages/membership/MemberDetailContent.tsx`
   - Extended: `src/lib/support/guides/membersDetail.ts`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/membersDetail.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/membership/RecordPaymentModal.tsx`, `src/pages/membership/CorrectTierDialog.tsx`, `src/pages/membership/RemoveFromCompanyDialog.tsx`, `src/pages/membership/MemberCardDialog.tsx`, `src/pages/membership/MemberDetailContent.tsx`.
   3. **PT-3 Annotate** about 18 sites in those files. Includes: Annotations across `RecordPaymentModal`, `CorrectTierDialog`, `RemoveFromCompanyDialog`, `MemberCardDialog` and the status Modal.
   4. **PT-4 Extend the guide**: 20 steps, in tour order (`<id>` becomes the copy key `supportMembers:members.detail.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportMembers`; **PT-7** extend the end-to-end row `members.detail`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Permission- or workflow-dependent controls (A):** Each dialog is reachable only with its permission.
   - **Dialogs, drawers, menus, nested workflows (D):** Five dialogs as hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Reasons and dates. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Replace-link, close and remove carry warnings.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The payment quote is calculated server-side; its text changes with kind and tier, and the `payAmount` step reads it at display time, never from a stored copy.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Each dialog hand-off; the card link token never appears in any announcement or log (token privacy test).
   - Regression: existing tests of `RecordPaymentModal.tsx`, `CorrectTierDialog.tsx`, `RemoveFromCompanyDialog.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 222.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Member detail is complete**: every applicable state in 7.3 is covered.

### S53: Membership payments

1. **Slice id and title:** S53. Membership payments. Branch `support-slice-53-membership-payments`.
2. **Scope:** Payments list.
3. **Purpose:** Totals exclude voided payments; the tour states that.
4. **Page association:** one page only: **Membership payments** (`members.payments`; `/:tenantSlug/members/payments`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/MemberPaymentsPage.tsx`, `pages/membership/MemberPaymentsContent.tsx`.
6. **Production LOC estimate:** **~182** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/MemberPaymentsContent.tsx`
   - New: `src/lib/support/guides/membersPayments.ts`, `src/lib/support/guides/membersPayments.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.payments.view`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Export disabled with zero rows: disabled hint.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S54: Membership reports

1. **Slice id and title:** S54. Membership reports. Branch `support-slice-54-membership-reports`.
2. **Scope:** Filters, figure sections, working lists, exports.
3. **Purpose:** Sections are generated from `reportSections.ts`, so steps are generated per section, not per figure.
4. **Page association:** one page only: **Membership reports** (`members.reports`; `/:tenantSlug/members/reports`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/reports/MembershipReportsPage.tsx`, `pages/membership/reports/MembershipReportsContent.tsx`, `pages/membership/reports/reportSections.ts`.
6. **Production LOC estimate:** **~190** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30 + `data-report` section ids mapped onto `tourId` for the generated sections 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/reports/MembershipReportsContent.tsx`, `src/pages/membership/reports/reportSections.ts`
   - New: `src/lib/support/guides/membersReports.ts`, `src/lib/support/guides/membersReports.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S55: Verify member (Reception)

1. **Slice id and title:** S55. Verify member (Reception). Branch `support-slice-55-verify-member-reception`.
2. **Scope:** Scan and search.
3. **Purpose:** Camera use is the only browser-permission feature; the tour never starts the camera.
4. **Page association:** one page only: **Verify member (Reception)** (`members.verify`; `/:tenantSlug/members/verify`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/VerifyMemberPage.tsx`, `pages/membership/verify/VerifyMemberContent.tsx`, `pages/membership/verify/QrScanner.tsx`, `pages/membership/verify/ReceptionResult.tsx`.
6. **Production LOC estimate:** **~144** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/verify/VerifyMemberContent.tsx`, `src/pages/membership/verify/QrScanner.tsx`, `src/pages/membership/verify/ReceptionResult.tsx`
   - New: `src/lib/support/guides/membersVerify.ts`, `src/lib/support/guides/membersVerify.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S56: Employee upload

1. **Slice id and title:** S56. Employee upload. Branch `support-slice-56-employee-upload`.
2. **Scope:** Upload flow, preview, outcome and history.
3. **Purpose:** A multi-stage page: stage steps are state-driven.
4. **Page association:** one page only: **Employee upload** (`members.employeeUpload`; `/:tenantSlug/members/employee-upload`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/membership/EmployeeUploadPage.tsx`, `pages/membership/EmployeeUploadContent.tsx`.
6. **Production LOC estimate:** **~230** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 21 steps x 8 = 168 + 19 annotation sites x 2 = 38 + Stage markers (`idle | preview | outcome`) on the three regions 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/EmployeeUploadContent.tsx`
   - New: `src/lib/support/guides/membersEmployeeUpload.ts`, `src/lib/support/guides/membersEmployeeUpload.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S57: VIP requests

1. **Slice id and title:** S57. VIP requests. Branch `support-slice-57-vip-requests`.
2. **Scope:** Approver queue.
3. **Purpose:** Short page; decision dialog covered in detail on the member page, referenced here.
4. **Page association:** one page only: **VIP requests** (`members.vipRequests`; `/:tenantSlug/members/vip-requests`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S50 (Member detail: payments and VIP tabs, receipt, void and decision dialogs). Existing code it relies on, unchanged since planning: `pages/membership/VipRequestsPage.tsx`, `pages/membership/VipRequestsContent.tsx`, `pages/membership/VipDecisionDialog.tsx`.
6. **Production LOC estimate:** **~164** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 15 steps x 8 = 120 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/membership/VipRequestsContent.tsx`, `src/pages/membership/VipDecisionDialog.tsx`
   - New: `src/lib/support/guides/membersVipRequests.ts`, `src/lib/support/guides/membersVipRequests.test.tsx`. Touched: `locales/{en,sq}/supportMembers.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `members.vip.approve`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Dialog. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Comment. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Decided requests leave the pending list.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

#### Page tours: Settings and form builder

### S58: Settings: Company

1. **Slice id and title:** S58. Settings: Company. Branch `support-slice-58-settings-company`.
2. **Scope:** Company settings page, with the settings side navigation.
3. **Purpose:** First settings page; also guides the `SettingsLayout` section list once for all settings pages.
4. **Page association:** one page only: **Settings: Company** (`settings.company`; `/:tenantSlug/settings`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/AccountSettingsPage.tsx`, `components/layout/SettingsLayout/SettingsLayout.tsx`.
6. **Production LOC estimate:** **~186** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28 + `SettingsLayout` nav annotation (items repeat per rendered section) 10 + `LanguagePicker` annotated with component-scoped ids (`language.*`), reused by the profile and platform settings pages 4. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/AccountSettingsPage.tsx`, `src/components/settings/LanguagePicker.tsx`, `src/components/layout/SettingsLayout/SettingsLayout.tsx`
   - New: `src/lib/support/guides/settingsCompany.ts`, `src/lib/support/guides/settingsCompany.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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
15. **Dependencies and handoff:** unblocks S59, S93. After this slice **Settings: Company is complete**: every applicable state in 7.3 is covered.

### S59: Settings: My profile

1. **Slice id and title:** S59. Settings: My profile. Branch `support-slice-59-settings-my-profile`.
2. **Scope:** Profile and password.
3. **Purpose:** Available to every tenant user.
4. **Page association:** one page only: **Settings: My profile** (`settings.profile`; `/:tenantSlug/settings/profile`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S58 (Settings: Company). Existing code it relies on, unchanged since planning: `pages/settings/profile/ProfilePage.tsx`.
6. **Production LOC estimate:** **~164** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 15 steps x 8 = 120 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/profile/ProfilePage.tsx`
   - New: `src/lib/support/guides/settingsProfile.ts`, `src/lib/support/guides/settingsProfile.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
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

### S60: Settings: Team

1. **Slice id and title:** S60. Settings: Team. Branch `support-slice-60-settings-team`.
2. **Scope:** Team list, invite, edit, deactivate / reactivate.
3. **Purpose:** Per-member icon buttons have per-email labels; the tour must reuse them without leaking emails into announcements beyond what is on screen.
4. **Page association:** one page only: **Settings: Team** (`settings.team`; `/:tenantSlug/settings/team`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/team/TeamSettingsPage.tsx`, `pages/settings/team/TeamSettingsContent.tsx`, `pages/settings/team/InviteMemberModal.tsx`, `pages/settings/team/EditMemberModal.tsx`.
6. **Production LOC estimate:** **~220** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36 + Annotations in `InviteMemberModal` and `EditMemberModal` 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/team/TeamSettingsContent.tsx`, `src/pages/settings/team/InviteMemberModal.tsx`, `src/pages/settings/team/EditMemberModal.tsx`
   - New: `src/lib/support/guides/settingsTeam.ts`, `src/lib/support/guides/settingsTeam.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Three dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Email and role. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Deactivate warning: access ends within the token lifetime (TD-010).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The row buttons are per-row; the exemplar is the first row that has the button.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S61: Settings: Roles and permissions

1. **Slice id and title:** S61. Settings: Roles and permissions. Branch `support-slice-61-settings-roles-and-permissions`.
2. **Scope:** Role list, role actions, permission matrix with scopes, save.
3. **Purpose:** The densest settings page; the matrix is generated from the permission catalogue so it must be guided by kind.
4. **Page association:** one page only: **Settings: Roles and permissions** (`settings.roles`; `/:tenantSlug/settings/roles`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/roles/RolesSettingsPage.tsx`, `pages/settings/roles/RolesSettingsContent.tsx`, `pages/settings/roles/RoleNameModal.tsx`.
6. **Production LOC estimate:** **~222** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 20 steps x 8 = 160 + 18 annotation sites x 2 = 36 + `permission`/`scope` ids generated from the catalogue key (`permission.<key>`) 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/roles/RolesSettingsContent.tsx`, `src/pages/settings/roles/RoleNameModal.tsx`
   - New: `src/lib/support/guides/settingsRoles.ts`, `src/lib/support/guides/settingsRoles.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Two dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Save locked; dirty tracking. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warning. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - A permission added to the catalogue appears as a new checkbox with the same repeat id.
   - Toggling a checkbox (try-it) makes `dirty` true; Save never fires.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S62: Settings: Lists, all seven tabs

1. **Slice id and title:** S62. Settings: Lists, all seven tabs. Branch `support-slice-62-settings-lists-all-seven-tabs`.
2. **Scope:** Tab bar and the shared `LookupListEditor`, with the risk-level and business-type tabs. The five remaining tabs.
3. **Purpose:** Introduces the lookup editor guidance reused by four more tabs. Cities depend on areas; intervals are numeric; activity results are permission-scoped.
4. **Page association:** one page only: **Settings: Lists** (`settings.lists`; `/:tenantSlug/settings/lists/:list?`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/lists/ListsSettingsPage.tsx`, `pages/settings/lists/ListsSettingsContent.tsx`, `components/settings/LookupListEditor`, `pages/settings/lists/AreasList.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~294** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 26 steps x 8 = 208 + 23 annotation sites x 2 = 46 + `LookupListEditor` annotations with component-scoped ids (`lookupList.*`), shared with the other tabs and with the pricing packages panel 14 + Annotations for the five list components 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/lists/ListsSettingsContent.tsx`, `src/components/settings/LookupListEditor`, `src/pages/settings/lists/RiskLevelsList.tsx`, `src/pages/settings/lists/BusinessTypesList.tsx`, `src/pages/settings/lists/AreasList.tsx`, `src/pages/settings/lists/CitiesList.tsx`, `src/pages/settings/lists/FollowUpIntervalsList.tsx`, `src/pages/settings/lists/LostReasonsList.tsx`, `src/pages/settings/lists/ActivityResultsList.tsx`
   - New: `src/lib/support/guides/settingsLists.ts`, `src/lib/support/guides/settingsLists.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 13 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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
15. **Dependencies and handoff:** unblocks S65. After this slice **Settings: Lists is complete**: every applicable state in 7.3 is covered.

### S63: Settings: Sales script

1. **Slice id and title:** S63. Settings: Sales script. Branch `support-slice-63-settings-sales-script`.
2. **Scope:** Script editor, preview, drafts, versions.
3. **Purpose:** Publish is outward-facing: every agent sees the new script.
4. **Page association:** one page only: **Settings: Sales script** (`settings.salesScript`; `/:tenantSlug/settings/sales-script`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/salesScript/SalesScriptSettingsPage.tsx`, `pages/settings/salesScript/SalesScriptSettingsContent.tsx`.
6. **Production LOC estimate:** **~182** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/salesScript/SalesScriptSettingsContent.tsx`
   - New: `src/lib/support/guides/settingsSalesScript.ts`, `src/lib/support/guides/settingsSalesScript.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S64: Settings: Pricing, tabs, employee bands, risk surcharges, frequencies, zones and discount cap

1. **Slice id and title:** S64. Settings: Pricing, tabs, employee bands, risk surcharges, frequencies, zones and discount cap. Branch `support-slice-64-settings-pricing-tabs-employee-bands-risk`.
2. **Scope:** Tab bar, employee bands panel, risk surcharges panel. Three panels.
3. **Purpose:** First of four slices; introduces `settings.pricing` panels and their inline-edit tables. Zones and frequencies feed the offer builder; the guide references that.
4. **Page association:** one page only: **Settings: Pricing** (`settings.pricing`; `/:tenantSlug/settings/pricing/:tab?`); slice 1 of 2. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/pricing/PricingSettingsPage.tsx`, `pages/settings/pricing/PricingSettingsContent.tsx`, `pages/settings/pricing/pricingTabs.ts`.
6. **Production LOC estimate:** **~286** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 27 steps x 8 = 216 + 24 annotation sites x 2 = 48 + `PricingSettingsContent` tab panel scoping (`scope.tab` from the route) 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/pricing/PricingSettingsContent.tsx`, `src/pages/settings/pricing/EmployeeBandsPanel.tsx`, `src/pages/settings/pricing/RiskSurchargesPanel.tsx`, `src/pages/settings/pricing/pricingTabs.ts`, `src/pages/settings/pricing/VisitFrequenciesPanel.tsx`, `src/pages/settings/pricing/PriceZonesPanel.tsx`, `src/pages/settings/pricing/DiscountCapPanel.tsx`
   - New: `src/lib/support/guides/settingsPricing.ts`, `src/lib/support/guides/settingsPricing.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsPricing.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/pricing/PricingSettingsContent.tsx`, `src/pages/settings/pricing/EmployeeBandsPanel.tsx`, `src/pages/settings/pricing/RiskSurchargesPanel.tsx`, `src/pages/settings/pricing/pricingTabs.ts`, `src/pages/settings/pricing/VisitFrequenciesPanel.tsx`.
   3. **PT-3 Annotate** about 24 sites in those files. Includes: `PricingSettingsContent` tab panel scoping (`scope.tab` from the route).
   4. **PT-4 Write the guide**: 27 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.pricing.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/settings/pricing/:tab?` as page `settings.pricing`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.pricing`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No bands. No zones / frequencies. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Panel error. Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `pricing.manage`. Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Band dialog. None. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Overlap rule. Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Tabs. Tabs. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Remove warned. Removal warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Tab is part of the URL, so the Support panel says "Tour this tab" and the context follows the URL.
   - Rows added by the user are repeated.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 14 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Tab scoping; dialog; empty.
   - Each tab; empty.
   - Regression: existing tests of `PricingSettingsContent.tsx`, `EmployeeBandsPanel.tsx`, `RiskSurchargesPanel.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No pricing value changed.
   - Zero mutations.
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 286.
15. **Dependencies and handoff:** unblocks S65. Later slices of this page extend the same guide and may rely on the ids `settings.pricing.*` and the registration made in slice 1.

### S65: Settings: Pricing, services, packages, offer wording and test calculator

1. **Slice id and title:** S65. Settings: Pricing, services, packages, offer wording and test calculator. Branch `support-slice-65-settings-pricing-services-packages-offer-wording`.
2. **Scope:** Services and packages panels. Offer settings and the calculator.
3. **Purpose:** Packages group services; the description columns are shared. The calculator is a safe, read-only sandbox, so its inputs are try-it.
4. **Page association:** one page only: **Settings: Pricing** (`settings.pricing`; `/:tenantSlug/settings/pricing/:tab?`); slice 2 of 2. Not infrastructure.
5. **Prerequisites:** S64 (Settings: Pricing, tabs, employee bands, risk surcharges, frequencies, zones and discount cap); S18 (Clients list: states, rows, row menu and archive / restore); S62 (Settings: Lists, all seven tabs). Existing code it relies on, unchanged since planning: `pages/settings/pricing/PricingSettingsPage.tsx`, `pages/settings/pricing/PricingSettingsContent.tsx`, `pages/settings/pricing/pricingTabs.ts`.
6. **Production LOC estimate:** **~232** (within the 200 to 300 target): 6 extend the guide and registration + 23 steps x 8 = 184 + 21 annotation sites x 2 = 42. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/pricing/ServicesPanel.tsx`, `src/pages/settings/pricing/PackagesPanel.tsx`, `src/pages/settings/pricing/descriptionColumns.tsx`, `src/pages/settings/pricing/OfferSettingsPanel.tsx`, `src/pages/settings/pricing/TestCalculatorPanel.tsx`
   - Extended: `src/lib/support/guides/settingsPricing.ts`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsPricing.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/pricing/ServicesPanel.tsx`, `src/pages/settings/pricing/PackagesPanel.tsx`, `src/pages/settings/pricing/descriptionColumns.tsx`, `src/pages/settings/pricing/OfferSettingsPanel.tsx`, `src/pages/settings/pricing/TestCalculatorPanel.tsx`.
   3. **PT-3 Annotate** about 21 sites in those files.
   4. **PT-4 Extend the guide**: 23 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.pricing.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSettings`; **PT-7** extend the end-to-end row `settings.pricing`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** None yet. Calculator empty until run.
   - **Loading / skeleton (L):** Waits. Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** Permission. Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Service dialog. None. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Offer save locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Tabs. Tabs. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Remove warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Seven icon buttons per package row carry `aria-label`s; the guide reuses them.
   - Calculator inputs list follows the live configuration.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Packages with 0, 1, 12 rows.
   - Calculator run is allowed and mutation-free.
   - Regression: existing tests of `ServicesPanel.tsx`, `PackagesPanel.tsx`, `descriptionColumns.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 232.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Pricing is complete**: every applicable state in 7.3 is covered.

### S66: Settings: Statuses

1. **Slice id and title:** S66. Settings: Statuses. Branch `support-slice-66-settings-statuses`.
2. **Scope:** Deal stage labels and the stale-deals threshold.
3. **Purpose:** Editing labels affects every user.
4. **Page association:** one page only: **Settings: Statuses** (`settings.statuses`; `/:tenantSlug/settings/statuses`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/statuses/StatusesSettingsPage.tsx`, `pages/settings/statuses/StatusesSettingsContent.tsx`.
6. **Production LOC estimate:** **~154** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/statuses/StatusesSettingsContent.tsx`
   - New: `src/lib/support/guides/settingsStatuses.ts`, `src/lib/support/guides/settingsStatuses.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S67: Settings: Wellness+

1. **Slice id and title:** S67. Settings: Wellness+. Branch `support-slice-67-settings-wellness`.
2. **Scope:** Four tabs.
3. **Purpose:** The read-only variant for non-administrators is first-class here.
4. **Page association:** one page only: **Settings: Wellness+** (`settings.wellnessPlus`; `/:tenantSlug/settings/wellness-plus/:tab?`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/wellnessPlus/WellnessPlusSettingsPage.tsx`, `pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `pages/settings/wellnessPlus/TiersPanel.tsx`, `pages/settings/wellnessPlus/RulesPanel.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~242** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 23 steps x 8 = 184 + 21 annotation sites x 2 = 42. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `src/pages/settings/wellnessPlus/TiersPanel.tsx`, `src/pages/settings/wellnessPlus/RulesPanel.tsx`, `src/pages/settings/wellnessPlus/RelationshipsPanel.tsx`, `src/pages/settings/wellnessPlus/BenefitsPanel.tsx`
   - New: `src/lib/support/guides/settingsWellnessPlus.ts`, `src/lib/support/guides/settingsWellnessPlus.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S68: Settings: Contracts and payments

1. **Slice id and title:** S68. Settings: Contracts and payments. Branch `support-slice-68-settings-contracts-and-payments`.
2. **Scope:** Contract defaults form.
3. **Purpose:** Smallest settings page. Documented lean exception: one page, one form.
4. **Page association:** one page only: **Settings: Contracts and payments** (`settings.contracts`; `/:tenantSlug/settings/contracts`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/contracts/ContractSettingsPage.tsx`, `pages/settings/contracts/ContractSettingsContent.tsx`.
6. **Production LOC estimate:** **~84** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 7 steps x 8 = 56 + 6 annotation sites x 2 = 12. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/contracts/ContractSettingsContent.tsx`
   - New: `src/lib/support/guides/settingsContracts.ts`, `src/lib/support/guides/settingsContracts.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
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

### S69: Settings: Audit log

1. **Slice id and title:** S69. Settings: Audit log. Branch `support-slice-69-settings-audit-log`.
2. **Scope:** Audit filters, table, detail drawer, export.
3. **Purpose:** Read-only history; export writes a file.
4. **Page association:** one page only: **Settings: Audit log** (`settings.audit`; `/:tenantSlug/settings/audit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/audit/AuditLogSettingsPage.tsx`, `pages/settings/audit/AuditLogContent.tsx`, `pages/settings/audit/AuditEntryDetail.tsx`.
6. **Production LOC estimate:** **~182** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 17 steps x 8 = 136 + 15 annotation sites x 2 = 30. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/audit/AuditLogContent.tsx`, `src/pages/settings/audit/AuditEntryDetail.tsx`
   - New: `src/lib/support/guides/settingsAudit.ts`, `src/lib/support/guides/settingsAudit.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `audit.view`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Drawer. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Entity types come from `useAuditEntityTypes`; the filter step explains the list, not its items.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S70: Settings: Integrations

1. **Slice id and title:** S70. Settings: Integrations. Branch `support-slice-70-settings-integrations`.
2. **Scope:** Providers.
3. **Purpose:** Connect is an outward-facing action.
4. **Page association:** one page only: **Settings: Integrations** (`settings.integrations`; `/:tenantSlug/settings/integrations`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/IntegrationsPage.tsx`.
6. **Production LOC estimate:** **~114** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 10 steps x 8 = 80 + 9 annotation sites x 2 = 18. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/IntegrationsPage.tsx`
   - New: `src/lib/support/guides/settingsIntegrations.ts`, `src/lib/support/guides/settingsIntegrations.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 6 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S71: Settings: Client management, custom fields

1. **Slice id and title:** S71. Settings: Client management, custom fields. Branch `support-slice-71-settings-client-management-custom-fields`.
2. **Scope:** Custom fields tab and the field slide-over.
3. **Purpose:** Defines what appears on the client form.
4. **Page association:** one page only: **Settings: Client management** (`settings.clientManagement`; `/:tenantSlug/settings/client-management`); slice 1 of 2. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/ClientSettingsPage.tsx`, `pages/settings/ClientSettingsContent.tsx`, `pages/settings/ClientFormsTab.tsx`.
6. **Production LOC estimate:** **~240** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 22 steps x 8 = 176 + 20 annotation sites x 2 = 40 + Annotations in the slide-over body 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/ClientSettingsContent.tsx`
   - New: `src/lib/support/guides/settingsClientManagement.ts`, `src/lib/support/guides/settingsClientManagement.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsClientManagement.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/ClientSettingsContent.tsx`.
   3. **PT-3 Annotate** about 20 sites in those files. Includes: Annotations in the slide-over body.
   4. **PT-4 Write the guide**: 22 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.clientManagement.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/settings/client-management` as page `settings.clientManagement`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `settings.clientManagement`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No fields. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Error. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `settings.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Drawer and confirm. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Two tabs. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The options step exists only for select-type fields; it follows the rendered type.
   - Single-select creation is a known gap (TD-007); the guide must not claim it works: verify at slice start.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Type-dependent options; drawer hand-off.
   - Regression: existing tests of `ClientSettingsContent.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No field created.
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 240.
15. **Dependencies and handoff:** unblocks S72. Later slices of this page extend the same guide and may rely on the ids `settings.clientManagement.*` and the registration made in slice 1.

### S72: Settings: Client management, forms tab

1. **Slice id and title:** S72. Settings: Client management, forms tab. Branch `support-slice-72-settings-client-management-forms-tab`.
2. **Scope:** Forms tab.
3. **Purpose:** Form management; leads into the builder (separate slices).
4. **Page association:** one page only: **Settings: Client management** (`settings.clientManagement`; `/:tenantSlug/settings/client-management`); slice 2 of 2. Not infrastructure.
5. **Prerequisites:** S71 (Settings: Client management, custom fields); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/ClientSettingsPage.tsx`, `pages/settings/ClientSettingsContent.tsx`, `pages/settings/ClientFormsTab.tsx`.
6. **Production LOC estimate:** **~192** (just under the target (150 to 199)): 6 extend the guide and registration + 19 steps x 8 = 152 + 17 annotation sites x 2 = 34. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/ClientFormsTab.tsx`
   - Extended: `src/lib/support/guides/settingsClientManagement.ts`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/settingsClientManagement.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/settings/ClientFormsTab.tsx`.
   3. **PT-3 Annotate** about 17 sites in those files.
   4. **PT-4 Extend the guide**: 19 steps, in tour order (`<id>` becomes the copy key `supportSettings:settings.clientManagement.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSettings`; **PT-7** extend the end-to-end row `settings.clientManagement`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No forms. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Waits. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows and templates. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Error / retry (X):** Errors. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `forms.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Three dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Name required. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Second tab. Tab-scoped steps run for the active tab only.
   - **Destructive or irreversible actions (explain-only) (K):** Deletes warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Duplicating a form (user, after Exit) adds a row.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 9 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empty vs populated; dialogs.
   - Regression: existing tests of `ClientFormsTab.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 192.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Settings: Client management is complete**: every applicable state in 7.3 is covered.

### S73: Settings: Notifications

1. **Slice id and title:** S73. Settings: Notifications. Branch `support-slice-73-settings-notifications`.
2. **Scope:** Notification policy form.
3. **Purpose:** Read-only for non-owners: the tour explains that instead of pretending to edit.
4. **Page association:** one page only: **Settings: Notifications** (`settings.notifications`; `/:tenantSlug/settings/notifications`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/NotificationSettingsPage.tsx`.
6. **Production LOC estimate:** **~144** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/NotificationSettingsPage.tsx`
   - New: `src/lib/support/guides/settingsNotifications.ts`, `src/lib/support/guides/settingsNotifications.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S74: Settings: Warehouses

1. **Slice id and title:** S74. Settings: Warehouses. Branch `support-slice-74-settings-warehouses`.
2. **Scope:** Warehouse management.
3. **Purpose:** Inventory settings; scope ALL required.
4. **Page association:** one page only: **Settings: Warehouses** (`settings.warehouses`; `/:tenantSlug/settings/warehouses`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/inventory/WarehouseList/WarehouseList.tsx`, `components/inventory/WarehouseTable`, `components/inventory/WarehouseFormModal`.
6. **Production LOC estimate:** **~134** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/inventory/WarehouseList/WarehouseList.tsx`, `src/components/inventory/WarehouseFormModal`
   - New: `src/lib/support/guides/settingsWarehouses.ts`, `src/lib/support/guides/settingsWarehouses.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Stock in a warehouse blocks deletion; the confirm text is read from the dialog.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S75: Settings: Categories

1. **Slice id and title:** S75. Settings: Categories. Branch `support-slice-75-settings-categories`.
2. **Scope:** Category management.
3. **Purpose:** Has a visibly disabled "more (soon)" button that must not be explained as working.
4. **Page association:** one page only: **Settings: Categories** (`settings.categories`; `/:tenantSlug/settings/categories`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/inventory/CategoryList/CategoryList.tsx`, `components/inventory/CategoryFormModal`, `components/inventory/DeleteCategoryModal`.
6. **Production LOC estimate:** **~154** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/inventory/CategoryList/CategoryList.tsx`, `src/components/inventory/CategoryFormModal`, `src/components/inventory/DeleteCategoryModal`
   - New: `src/lib/support/guides/settingsCategories.ts`, `src/lib/support/guides/settingsCategories.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - The per-row "more" button is `disabled` with a coming-soon title; it is excluded and listed in the exclusions table.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S76: Form submissions

1. **Slice id and title:** S76. Form submissions. Branch `support-slice-76-form-submissions`.
2. **Scope:** Submissions of one form.
3. **Purpose:** Read-only list with a detail overlay.
4. **Page association:** one page only: **Form submissions** (`forms.submissions`; `/:tenantSlug/settings/client-management/forms/:formId/submissions`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S19 (Client form: fields, contacts, custom fields and create-deal option). Existing code it relies on, unchanged since planning: `pages/settings/FormSubmissionsPage.tsx`, `pages/settings/FormSubmissionsContent.tsx`.
6. **Production LOC estimate:** **~124** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 11 steps x 8 = 88 + 10 annotation sites x 2 = 20. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/FormSubmissionsContent.tsx`
   - New: `src/lib/support/guides/formsSubmissions.ts`, `src/lib/support/guides/formsSubmissions.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Overlay. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New submissions from the public form appear as rows.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S77: Form builder: entry point, title bar, status bar, ribbon Home and Insert tabs

1. **Slice id and title:** S77. Form builder: entry point, title bar, status bar, ribbon Home and Insert tabs. Branch `support-slice-77-form-builder-entry-point-title-bar`.
2. **Scope:** The builder has no `AppLayout`, so it needs its own Support entry, the host mount, and guidance for the title bar and status bar. Home (clipboard, font/format, editing) and Insert (pages, insert) tabs.
3. **Purpose:** Establishes the builder context; later slices guide the ribbon, canvas and panels. Commands are selection-dependent; disabled ones are explained, not hidden.
4. **Page association:** one page only: **Form builder** (`forms.builder`; `/:tenantSlug/settings/client-management/forms/:formId`); slice 1 of 3. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S19 (Client form: fields, contacts, custom fields and create-deal option). Existing code it relies on, unchanged since planning: `pages/settings/FormBuilderPage.tsx`, `components/forms/canvas/FormBuilder.tsx`, `components/forms/canvas/ribbon/*`, `components/forms/canvas/PageRail.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~289** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 24 steps x 8 = 192 + 22 annotation sites x 2 = 44 + `SupportHost` mount in `FormBuilderPage` and a Help `RibbonButton`/title-bar button calling the store (the builder is full-screen, outside `AppLayout`) 25 + `RibbonButton tourId` prop and group annotations 12. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/settings/FormBuilderPage.tsx`, `src/components/forms/canvas/ribbon/TitleBar.tsx`, `src/components/forms/canvas/ribbon/StatusBar.tsx`, `src/components/forms/canvas/ribbon/HomeTab.tsx`, `src/components/forms/canvas/ribbon/InsertTab.tsx`, `src/components/forms/canvas/ribbon/RibbonButton.tsx`, `src/components/forms/registry/FormattingToolbar`
   - Existing, read only: `src/components/forms/canvas/keyboard.ts` (read)
   - New: `src/lib/support/guides/formsBuilder.ts`, `src/lib/support/guides/formsBuilder.test.tsx`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/formsBuilder.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/pages/settings/FormBuilderPage.tsx`, `src/components/forms/canvas/ribbon/TitleBar.tsx`, `src/components/forms/canvas/ribbon/StatusBar.tsx`, `src/components/forms/canvas/ribbon/HomeTab.tsx`, `src/components/forms/canvas/ribbon/InsertTab.tsx`.
   3. **PT-3 Annotate** about 22 sites in those files. Includes: `SupportHost` mount in `FormBuilderPage` and a Help `RibbonButton`/title-bar button calling the store (the builder is full-screen, outside `AppLayout`); `RibbonButton tourId` prop and group annotations.
   4. **PT-4 Write the guide**: 24 steps, in tour order (`<id>` becomes the copy key `supportSettings:forms.builder.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/settings/client-management/forms/:formId` as page `forms.builder`, **PT-6 Copy** in namespace `supportSettings`, **PT-7 End-to-end row** `forms.builder`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** A new empty document. Nothing selected.
   - **Loading / skeleton (L):** Document loading. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Error / retry (X):** Autosave failure state. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `forms.manage`. Selection-dependent enabled state.
   - **Dialogs, drawers, menus, nested workflows (D):** None. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Tabs / sections (T):** Ribbon tabs. Two tabs. Tab-scoped steps run for the active tab only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Undo / Redo enabled state follows history; the disabled hint appears only while disabled.
   - Zoom steps are view-only try-its.
   - As the user selects an element the commands enable; the step list does not change but the disabled hint disappears.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Entry point present in the builder; host mounted; zoom changes view only.
   - Commands with and without selection; clipboard state.
   - Regression: existing tests of `FormBuilderPage.tsx`, `TitleBar.tsx`, `StatusBar.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - The builder has a working Support entry (it had none).
   - No document edit while touring (document JSON unchanged).
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 289.
15. **Dependencies and handoff:** unblocks S78. Later slices of this page extend the same guide and may rely on the ids `forms.builder.*` and the registration made in slice 1.

### S78: Form builder: ribbon Layout and contextual tabs, and the properties panel

1. **Slice id and title:** S78. Form builder: ribbon Layout and contextual tabs, and the properties panel. Branch `support-slice-78-form-builder-ribbon-layout-and-contextual`.
2. **Scope:** Layout tab and the five contextual tabs (picture, field, text box, shape, section). The right-hand properties panel.
3. **Purpose:** Contextual tabs exist only while an object is selected: the textbook runtime-appearance case. Largest single component of the builder (562 lines); content depends on the selected object type.
4. **Page association:** one page only: **Form builder** (`forms.builder`; `/:tenantSlug/settings/client-management/forms/:formId`); slice 2 of 3. Not infrastructure.
5. **Prerequisites:** S77 (Form builder: entry point, title bar, status bar, ribbon Home and Insert tabs); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/FormBuilderPage.tsx`, `components/forms/canvas/FormBuilder.tsx`, `components/forms/canvas/ribbon/*`, `components/forms/canvas/PageRail.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~296** (within the 200 to 300 target): 6 extend the guide and registration + 28 steps x 8 = 224 + 25 annotation sites x 2 = 50 + Annotations in `PropertiesPanel` (562 lines) 16. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/components/forms/canvas/ribbon/LayoutTab.tsx`, `src/components/forms/canvas/ribbon/ContextualTab.tsx`, `src/components/forms/canvas/PropertiesPanel.tsx`
   - Extended: `src/lib/support/guides/formsBuilder.ts`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/formsBuilder.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/components/forms/canvas/ribbon/LayoutTab.tsx`, `src/components/forms/canvas/ribbon/ContextualTab.tsx`, `src/components/forms/canvas/PropertiesPanel.tsx`.
   3. **PT-3 Annotate** about 25 sites in those files. Includes: Annotations in `PropertiesPanel` (562 lines).
   4. **PT-4 Extend the guide**: 28 steps, in tour order (`<id>` becomes the copy key `supportSettings:forms.builder.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSettings`; **PT-7** extend the end-to-end row `forms.builder`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** No selection: contextual steps are absent. No selection.
   - **Permission- or workflow-dependent controls (A):** Which contextual tab exists depends on selection type. Content differs by type.
   - **Validation and submission (V):** Field-level validation. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Tabs / sections (T):** Permanent and contextual tabs. Sections.
   - **Destructive or irreversible actions (explain-only) (K):** Delete page and delete object warned.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Selecting an element by the user creates the contextual tab; the tour offers it as a hand-off ("select a field to see its tab").
   - Panel content changes with selection; each step is eligible only when its block is rendered.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - Each contextual kind via a selected fixture element.
   - One fixture per element type.
   - Regression: existing tests of `LayoutTab.tsx`, `ContextualTab.tsx`, `PropertiesPanel.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Page and object deletion never executed.
   - The builder autosaves any document change (`useAutosave`), so every editing control in the builder is explain-only (decision R9); the document JSON and the network log are unchanged after a full tour (asserted).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/formsBuilder src/components/forms/canvas/ribbon src/components/forms/canvas
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "forms.builder"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 296.
15. **Dependencies and handoff:** unblocks S79. Later slices of this page extend the same guide and may rely on the ids `forms.builder.*` and the registration made in slice 1.

### S79: Form builder: page rail, canvas, add menu and context menu

1. **Slice id and title:** S79. Form builder: page rail, canvas, add menu and context menu. Branch `support-slice-79-form-builder-page-rail-canvas-add`.
2. **Scope:** Left rail, canvas surface and its interactions, Add menu, right-click menu.
3. **Purpose:** Drag, resize and snapping are described, not performed.
4. **Page association:** one page only: **Form builder** (`forms.builder`; `/:tenantSlug/settings/client-management/forms/:formId`); slice 3 of 3. Not infrastructure.
5. **Prerequisites:** S78 (Form builder: ribbon Layout and contextual tabs, and the properties panel); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/settings/FormBuilderPage.tsx`, `components/forms/canvas/FormBuilder.tsx`, `components/forms/canvas/ribbon/*`, `components/forms/canvas/PageRail.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~210** (within the 200 to 300 target): 6 extend the guide and registration + 19 steps x 8 = 152 + 17 annotation sites x 2 = 34 + Annotations in `PageRail`, `AddMenu`, `FormCanvas`, `CanvasSection`, `CanvasElement` 18. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/components/forms/canvas/PageRail.tsx`, `src/components/forms/canvas/AddMenu.tsx`, `src/components/forms/canvas/FormCanvas.tsx`, `src/components/forms/canvas/CanvasSection.tsx`, `src/components/forms/canvas/CanvasElement.tsx`, `src/components/ui/ContextMenu`
   - Extended: `src/lib/support/guides/formsBuilder.ts`. Touched: `locales/{en,sq}/supportSettings.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/formsBuilder.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: profiled only; read the files fully and treat the steps as a hypothesis): `src/components/forms/canvas/PageRail.tsx`, `src/components/forms/canvas/AddMenu.tsx`, `src/components/forms/canvas/FormCanvas.tsx`, `src/components/forms/canvas/CanvasSection.tsx`, `src/components/forms/canvas/CanvasElement.tsx`.
   3. **PT-3 Annotate** about 17 sites in those files. Includes: Annotations in `PageRail`, `AddMenu`, `FormCanvas`, `CanvasSection`, `CanvasElement`.
   4. **PT-4 Extend the guide**: 19 steps, in tour order (`<id>` becomes the copy key `supportSettings:forms.builder.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportSettings`; **PT-7** extend the end-to-end row `forms.builder`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Empty page. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Populated, repeated rows or cards (P):** Sections and elements repeat. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Permission- or workflow-dependent controls (A):** Selection dependent. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Menus are hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Destructive or irreversible actions (explain-only) (K):** Delete page warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Page count changes with the document; rail pages are repeated.
   - Zoom changes geometry; spotlight follows because it reads live rects.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 8 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - 0 / 1 / 5 pages; menus; no document mutation.
   - Regression: existing tests of `PageRail.tsx`, `AddMenu.tsx`, `FormCanvas.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - No pointer drag dispatched (asserted).
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/formsBuilder src/components/forms/canvas src/components/ui
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "forms.builder"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 210.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Form builder is complete**: every applicable state in 7.3 is covered.

#### Page tours: Dashboards, reports, inventory, notifications

### S80: Dashboard: Sales User and the shared role-dashboard frame

1. **Slice id and title:** S80. Dashboard: Sales User and the shared role-dashboard frame. Branch `support-slice-80-dashboard-sales-user-and-the-shared`.
2. **Scope:** The shared `RoleDashboardFrame` (period, location, refresh, tiles, chart / table, empty and error) as seen by a Sales User, and the context hook that tells Support which dashboard variant is showing.
3. **Purpose:** The four role dashboards share one frame. This slice guides it once; later dashboard slices only add their own panels. It also adds the variant publication that `DashboardLanding` needs (SUP-01).
4. **Page association:** one page only: **Dashboard: Sales User** (`dashboard.salesUser`; `/:tenantSlug/dashboard (role = SALES_USER)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/dashboard/SalesUserDashboard.tsx`, `pages/dashboard/RoleDashboardFrame.tsx`, `pages/dashboard/PeriodSelector.tsx`, `pages/dashboard/RefreshBar.tsx` and the other files in section 3.
6. **Production LOC estimate:** **~190** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28 + `useSupportContext({ variant })` calls in `DashboardLanding` (and the fallback variants) so `dashboard.<variant>` is resolved 12 + `RoleDashboardFrame` props `showPeriod`/`showLocation` reflected as step eligibility 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/SalesUserDashboard.tsx`, `src/pages/dashboard/RoleDashboardFrame.tsx`, `src/pages/dashboard/PeriodSelector.tsx`, `src/pages/dashboard/RefreshBar.tsx`, `src/pages/dashboard/KpiTile.tsx`, `src/pages/dashboard/ChartWithTable.tsx`, `src/pages/dashboard/EmptyState.tsx`, `src/pages/dashboard/DashboardLanding.tsx`
   - New: `src/lib/support/guides/dashboardSalesUser.ts`, `src/lib/support/guides/dashboardSalesUser.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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
15. **Dependencies and handoff:** unblocks S81, S82, S83. After this slice **Dashboard: Sales User is complete**: every applicable state in 7.3 is covered.

### S81: Dashboard: Sales Manager

1. **Slice id and title:** S81. Dashboard: Sales Manager. Branch `support-slice-81-dashboard-sales-manager`.
2. **Scope:** Manager-only additions to the shared frame.
3. **Purpose:** Salesperson picker and the per-salesperson table.
4. **Page association:** one page only: **Dashboard: Sales Manager** (`dashboard.salesManager`; `/:tenantSlug/dashboard (role = SALES_MANAGER)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S80 (Dashboard: Sales User and the shared role-dashboard frame). Existing code it relies on, unchanged since planning: `pages/dashboard/SalesManagerDashboard.tsx`.
6. **Production LOC estimate:** **~118** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16 + `includeFrame()` helper shared with the other role dashboards 14. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/SalesManagerDashboard.tsx`
   - New: `src/lib/support/guides/dashboardSalesManager.ts`, `src/lib/support/guides/dashboardSalesManager.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S82: Dashboard: Administrator

1. **Slice id and title:** S82. Dashboard: Administrator. Branch `support-slice-82-dashboard-administrator`.
2. **Scope:** Four panels, no period selector.
3. **Purpose:** Describes the workspace now.
4. **Page association:** one page only: **Dashboard: Administrator** (`dashboard.administrator`; `/:tenantSlug/dashboard (role = ADMINISTRATOR)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S80 (Dashboard: Sales User and the shared role-dashboard frame). Existing code it relies on, unchanged since planning: `pages/dashboard/AdministratorDashboard.tsx`.
6. **Production LOC estimate:** **~104** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/AdministratorDashboard.tsx`
   - New: `src/lib/support/guides/dashboardAdministrator.ts`, `src/lib/support/guides/dashboardAdministrator.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S83: Dashboard: CEO

1. **Slice id and title:** S83. Dashboard: CEO. Branch `support-slice-83-dashboard-ceo`.
2. **Scope:** CEO panels including the Wellness+ block.
3. **Purpose:** The Wellness+ block is workflow-dependent.
4. **Page association:** one page only: **Dashboard: CEO** (`dashboard.ceo`; `/:tenantSlug/dashboard (role = CEO)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S80 (Dashboard: Sales User and the shared role-dashboard frame). Existing code it relies on, unchanged since planning: `pages/dashboard/CeoDashboard.tsx`.
6. **Production LOC estimate:** **~124** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 11 steps x 8 = 88 + 10 annotation sites x 2 = 20. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/CeoDashboard.tsx`
   - New: `src/lib/support/guides/dashboardCeo.ts`, `src/lib/support/guides/dashboardCeo.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 5 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S84: Dashboard: Business owner (fallback)

1. **Slice id and title:** S84. Dashboard: Business owner (fallback). Branch `support-slice-84-dashboard-business-owner-fallback`.
2. **Scope:** Fallback owner dashboard.
3. **Purpose:** Reachable only when the server cannot name a role dashboard; documented lean exception.
4. **Page association:** one page only: **Dashboard: Business owner (fallback)** (`dashboard.legacyOwner`; `/:tenantSlug/dashboard (fallback, scope ALL)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/dashboard/BusinessOwnerDashboard.tsx`, `pages/shell/BusinessOwnerShell.tsx`.
6. **Production LOC estimate:** **~114** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 10 steps x 8 = 80 + 9 annotation sites x 2 = 18. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/BusinessOwnerDashboard.tsx`, `src/pages/shell/BusinessOwnerShell.tsx`
   - New: `src/lib/support/guides/dashboardLegacyOwner.ts`, `src/lib/support/guides/dashboardLegacyOwner.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S85: Dashboard: Staff (fallback)

1. **Slice id and title:** S85. Dashboard: Staff (fallback). Branch `support-slice-85-dashboard-staff-fallback`.
2. **Scope:** Fallback staff dashboard.
3. **Purpose:** Contains a disabled, unwired button that must not be explained as working.
4. **Page association:** one page only: **Dashboard: Staff (fallback)** (`dashboard.legacyStaff`; `/:tenantSlug/dashboard (fallback, scope OWN / TEAM)`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/dashboard/StaffDashboard.tsx`, `pages/shell/StaffShell.tsx`.
6. **Production LOC estimate:** **~134** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 12 steps x 8 = 96 + 11 annotation sites x 2 = 22. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/StaffDashboard.tsx`, `src/pages/shell/StaffShell.tsx`
   - New: `src/lib/support/guides/dashboardLegacyStaff.ts`, `src/lib/support/guides/dashboardLegacyStaff.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S86: Notifications page

1. **Slice id and title:** S86. Notifications page. Branch `support-slice-86-notifications-page`.
2. **Scope:** Notification list.
3. **Purpose:** Small page. Documented lean exception: its bell and panel are guided in the shell slice.
4. **Page association:** one page only: **Notifications** (`notifications`; `/:tenantSlug/notifications`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/notifications/NotificationsPage.tsx`, `pages/notifications/NotificationsContent.tsx`.
6. **Production LOC estimate:** **~94** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 8 steps x 8 = 64 + 7 annotation sites x 2 = 14. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/notifications/NotificationsContent.tsx`
   - New: `src/lib/support/guides/notifications.ts`, `src/lib/support/guides/notifications.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S87: Reports

1. **Slice id and title:** S87. Reports. Branch `support-slice-87-reports`.
2. **Scope:** General reports page.
3. **Purpose:** Charts and tables with refresh.
4. **Page association:** one page only: **Reports** (`reports`; `/:tenantSlug/reports`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/ReportsPage.tsx`.
6. **Production LOC estimate:** **~172** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 16 steps x 8 = 128 + 14 annotation sites x 2 = 28. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/ReportsPage.tsx`
   - New: `src/lib/support/guides/reports.ts`, `src/lib/support/guides/reports.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 3 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S88: Inventory list: header, filters and states

1. **Slice id and title:** S88. Inventory list: header, filters and states. Branch `support-slice-88-inventory-list-header-filters-and-states`.
2. **Scope:** Add product, search, four filters, clear, loading, error with retry, empty states.
3. **Purpose:** Shows both empty variants (no products vs filtered-empty with Clear).
4. **Page association:** one page only: **Inventory list** (`inventory.list`; `/:tenantSlug/inventory`); slice 1 of 2. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/inventory/InventoryList/InventoryList.tsx`, `components/inventory/StockAdjustmentPanel`.
6. **Production LOC estimate:** **~154** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 14 steps x 8 = 112 + 13 annotation sites x 2 = 26. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/inventory/InventoryList/InventoryList.tsx`
   - New: `src/lib/support/guides/inventoryList.ts`, `src/lib/support/guides/inventoryList.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/inventoryList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/inventory/InventoryList/InventoryList.tsx`.
   3. **PT-3 Annotate** about 13 sites in those files.
   4. **PT-4 Write the guide**: 14 steps, in tour order (`<id>` becomes the copy key `supportOps:inventory.list.<id>.title|body`):
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
   5. **PT-5 Register** `/:tenantSlug/inventory` as page `inventory.list`, **PT-6 Copy** in namespace `supportOps`, **PT-7 End-to-end row** `inventory.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Empty state (E):** Two empties. The empty state is explained only when that element is rendered; the tour never invents one.
   - **Loading / skeleton (L):** Skeleton. The tour waits for the busy region (at most 4 s), then continues or skips; a skeleton is never explained as if it were data.
   - **Populated, repeated rows or cards (P):** Rows covered next. These are repeated structures: one exemplar is highlighted and the step list is the same for any number of records.
   - **Search / filtered results (F):** Filters. Filter or search results change which steps exist; the tour never changes the filters itself.
   - **Pagination / sorting (G):** Pagination covered in the next slice.
   - **Error / retry (X):** Error + Retry. The error step exists only while the error element is rendered; read-only retry controls may be try-it, anything else is explain-only.
   - **Permission- or workflow-dependent controls (A):** `inventory.manage`. Steps for controls the user cannot use are absent rather than greyed out.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Brand filter appears only when brands exist.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
11. **Testing requirements:** ST-1 to ST-5 and:
   - Empties; error + retry; brand present / absent.
   - Regression: existing tests of `InventoryList.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
   - Zero mutations.
13. **Verification commands:**

   ```
   cd frontend
   npx vitest run src/lib/support/guides/inventoryList src/pages/inventory/InventoryList
   npm run typecheck
   npm run lint
   npm run check:translations
   npm run build
   npx playwright test --project=support --grep "inventory.list"   # needs the seeded workspace and E2E_ADMIN_PASSWORD
   ```

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 154.
15. **Dependencies and handoff:** unblocks S89. Later slices of this page extend the same guide and may rely on the ids `inventory.list.*` and the registration made in slice 1.

### S89: Inventory list: rows, selection, bulk actions, stock and delete

1. **Slice id and title:** S89. Inventory list: rows, selection, bulk actions, stock and delete. Branch `support-slice-89-inventory-list-rows-selection-bulk-actions`.
2. **Scope:** Rows (the "20 products" case), selection, bulk bar, adjust stock, delete confirmations, pagination.
3. **Purpose:** Reference slice for "adding 20 products needs no 20 steps".
4. **Page association:** one page only: **Inventory list** (`inventory.list`; `/:tenantSlug/inventory`); slice 2 of 2. Not infrastructure.
5. **Prerequisites:** S88 (Inventory list: header, filters and states); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/inventory/InventoryList/InventoryList.tsx`, `components/inventory/StockAdjustmentPanel`.
6. **Production LOC estimate:** **~232** (within the 200 to 300 target): 6 extend the guide and registration + 22 steps x 8 = 176 + 20 annotation sites x 2 = 40 + Annotations in `InventoryList` rows, bulk bar and the stock indicator 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/inventory/InventoryList/InventoryList.tsx`, `src/components/inventory/InventoryTable`, `src/components/ui/MultiLocationStockIndicator`, `src/components/inventory/StockAdjustmentPanel`
   - Extended: `src/lib/support/guides/inventoryList.ts`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`.
8. **Implementation tasks (in order; PT = standard procedure, section 6.1):**
   1. **PT-1 Red first** in `src/lib/support/guides/inventoryList.test.tsx`: ST-1 to ST-5 plus the slice-specific tests of item 11.
   2. **PT-2 Re-inventory** (evidence: control lines extracted during planning, conditions not read in context; read the files fully and verify every condition): `src/pages/inventory/InventoryList/InventoryList.tsx`.
   3. **PT-3 Annotate** about 20 sites in those files. Includes: Annotations in `InventoryList` rows, bulk bar and the stock indicator.
   4. **PT-4 Extend the guide**: 22 steps, in tour order (`<id>` becomes the copy key `supportOps:inventory.list.<id>.title|body`):
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
   5. **PT-5** nothing to register (done in slice 1 of this page); **PT-6 Copy** in namespace `supportOps`; **PT-7** extend the end-to-end row `inventory.list`.
   6. **PT-8 Green, refactor, verify.**
9. **Runtime behavior:**
   - **Populated, repeated rows or cards (P):** Twenty or two hundred products share the same row ids; the exemplar is the first row.
   - **Search / filtered results (F):** Selection survives filtering; bulk count describes the selection.
   - **Pagination / sorting (G):** Pagination. Pagination and sorting are explained through the shared guidance (S11) when they exist.
   - **Permission- or workflow-dependent controls (A):** Permission. Steps for controls the user cannot use are absent rather than greyed out.
   - **Dialogs, drawers, menus, nested workflows (D):** Stock panel and two ConfirmDialogs as hand-offs.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Selecting rows (try-it) makes the bulk bar appear; the tour treats it as a runtime-appearing region and the bulk steps become eligible.
   - Deselecting removes them.
   - Paging to the next page keeps the same step list.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 7 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
11. **Testing requirements:** ST-1 to ST-5 and:
   - 0 / 1 / 20 / 200 products; selection toggling; bulk actions never executed.
   - Regression: existing tests of `InventoryList.tsx` pass unchanged.
12. **Acceptance criteria:** SA-1 to SA-4 and:
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

14. **Completion evidence:** SE-1 to SE-4; measured production LOC against the estimate of 232.
15. **Dependencies and handoff:** unblocks nothing depends on it directly. After this slice **Inventory list is complete**: every applicable state in 7.3 is covered.

### S90: Product form

1. **Slice id and title:** S90. Product form. Branch `support-slice-90-product-form`.
2. **Scope:** Create / edit, the first three section cards. Image manager, save / discard, delete.
3. **Purpose:** Product fields. Danger zone only in edit mode.
4. **Page association:** one page only: **Product form (create and edit)** (`inventory.form`; `/:tenantSlug/inventory/new`, `/:tenantSlug/inventory/:productId/edit`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/inventory/ProductForm/ProductForm.tsx`, `components/inventory/ProductImageManager`.
6. **Production LOC estimate:** **~298** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 28 steps x 8 = 224 + 25 annotation sites x 2 = 50 + `ProductImageManager` annotations 8. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/inventory/ProductForm/ProductForm.tsx`, `src/components/inventory/WarehouseStockAllocation`, `src/components/inventory/ProductImageManager`
   - New: `src/lib/support/guides/inventoryForm.ts`, `src/lib/support/guides/inventoryForm.test.tsx`. Touched: `locales/{en,sq}/supportOps.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Discard and delete confirms. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Errors. Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Warehouse rows depend on configured warehouses.
   - Images added by the user are repeated.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

#### Page tours: Platform administration (Super Admin)

### S91: Platform: Tenants

1. **Slice id and title:** S91. Platform: Tenants. Branch `support-slice-91-platform-tenants`.
2. **Scope:** Tenant list, create, suspend / reactivate, delete with typed slug.
3. **Purpose:** First platform-administration page; confirms the host works under `SuperAdminShell`, which has no `TenantGuard`.
4. **Page association:** one page only: **Platform: Tenants** (`admin.tenants`; `/admin/tenants`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/admin/TenantsPage.tsx`, `components/widgets/TenantManagementTable`, `pages/admin/CreateTenantModal.tsx`.
6. **Production LOC estimate:** **~202** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32 + Annotations in `TenantManagementTable` and `CreateTenantModal` 10. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/admin/TenantsPage.tsx`, `src/components/widgets/TenantManagementTable`, `src/pages/admin/CreateTenantModal.tsx`
   - New: `src/lib/support/guides/adminTenants.ts`, `src/lib/support/guides/adminTenants.test.tsx`. Touched: `locales/{en,sq}/supportAdmin.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Three dialogs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Slug match. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Suspend and delete warned: workspace users lose access.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - New tenants appear as rows.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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
15. **Dependencies and handoff:** unblocks S95. After this slice **Platform: Tenants is complete**: every applicable state in 7.3 is covered.

### S92: Platform: People

1. **Slice id and title:** S92. Platform: People. Branch `support-slice-92-platform-people`.
2. **Scope:** Search, role and status filters, table, per-user menu. Invite and the confirmation dialogs.
3. **Purpose:** Platform-wide users. Data-changing dialogs; confirm buttons explain-only.
4. **Page association:** one page only: **Platform: People** (`admin.people`; `/admin/people`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/admin/PeoplePage.tsx`, `pages/admin/InviteUserModal.tsx`.
6. **Production LOC estimate:** **~292** (within the 200 to 300 target): 16 guide module, loader line, route-map flip + 27 steps x 8 = 216 + 24 annotation sites x 2 = 48 + Annotations in `InviteUserModal` and the inline dialogs 12. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/admin/PeoplePage.tsx`, `src/pages/admin/InviteUserModal.tsx`
   - New: `src/lib/support/guides/adminPeople.ts`, `src/lib/support/guides/adminPeople.test.tsx`. Touched: `locales/{en,sq}/supportAdmin.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Menu. Five dialogs as hand-offs. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Delete warned. Delete and deactivate warned.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Rows re-pick after filtering.
   - Radio set follows platform roles.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 4 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S93: Platform: Settings

1. **Slice id and title:** S93. Platform: Settings. Branch `support-slice-93-platform-settings`.
2. **Scope:** Platform defaults and bulk apply.
3. **Purpose:** Bulk apply changes many tenants at once: the strongest warning in the phase.
4. **Page association:** one page only: **Platform: Settings** (`admin.settings`; `/admin/setting`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S58 (Settings: Company). Existing code it relies on, unchanged since planning: `pages/admin/PlatformSettingsPage.tsx`, `pages/admin/TenantPickerModal.tsx`.
6. **Production LOC estimate:** **~192** (just under the target (150 to 199)): 16 guide module, loader line, route-map flip + 18 steps x 8 = 144 + 16 annotation sites x 2 = 32. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/admin/PlatformSettingsPage.tsx`, `src/pages/admin/TenantPickerModal.tsx`
   - New: `src/lib/support/guides/adminSettings.ts`, `src/lib/support/guides/adminSettings.test.tsx`. Touched: `locales/{en,sq}/supportAdmin.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** Picker and confirm. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Apply is bulk and effectively irreversible.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - Picker rows are repeated.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 1 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

### S94: Platform: My profile

1. **Slice id and title:** S94. Platform: My profile. Branch `support-slice-94-platform-my-profile`.
2. **Scope:** Platform administrator profile.
3. **Purpose:** Same shape as the tenant profile.
4. **Page association:** one page only: **Platform: My profile** (`admin.profile`; `/admin/profile`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore). Existing code it relies on, unchanged since planning: `pages/admin/AdminProfilePage.tsx`.
6. **Production LOC estimate:** **~144** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 13 steps x 8 = 104 + 12 annotation sites x 2 = 24. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/admin/AdminProfilePage.tsx`
   - New: `src/lib/support/guides/adminProfile.ts`, `src/lib/support/guides/adminProfile.test.tsx`. Touched: `locales/{en,sq}/supportAdmin.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - **Dialogs, drawers, menus, nested workflows (D):** One confirm dialog. Dialogs, drawers and menus are entered by hand-off: the user opens them, the tour explains them (S13).
   - **Validation and submission (V):** Locked. Submit is locked while the tour runs; validation messages are explained as rendered and never provoked.
   - **Destructive or irreversible actions (explain-only) (K):** Warned. The control carries a warning callout and is explain-only.
   - **Entry:** Support → Tour this page starts at the first eligible step of this slice's group; Explain a control lists this slice's controls that exist on screen now.
10. **Dynamic UI considerations:**
   - None beyond forms.
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists.
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

### S95: Platform dashboard, and phase closure

1. **Slice id and title:** S95. Platform dashboard, and phase closure. Branch `support-slice-95-platform-dashboard-and-phase-closure`.
2. **Scope:** Super Admin dashboard. Also the last slice of the phase: it empties `PLANNED_PAGES` and enables the "no planned pages remain" guard.
3. **Purpose:** Closes coverage (SUP-20).
4. **Page association:** one page only: **Platform dashboard (Super Admin)** (`admin.dashboard`; `/admin`, `/admin/dashboard`); slice 1 of 1. Not infrastructure.
5. **Prerequisites:** S16 (Explain a control: pick mode); S18 (Clients list: states, rows, row menu and archive / restore); S91 (Platform: Tenants). Existing code it relies on, unchanged since planning: `pages/dashboard/SuperAdminDashboard.tsx`, `pages/shell/SuperAdminShell.tsx`.
6. **Production LOC estimate:** **~110** (**below 150: documented exception (R1, D1)**): 16 guide module, loader line, route-map flip + 9 steps x 8 = 72 + 8 annotation sites x 2 = 16 + Remove the final id from `PLANNED_PAGES` and turn the `it.todo` guard into a real test 6. Copy is JSON and not counted.
7. **Files and components:**
   - Existing, annotated (attributes only, no wrappers): `src/pages/dashboard/SuperAdminDashboard.tsx`, `src/pages/shell/SuperAdminShell.tsx`
   - New: `src/lib/support/guides/adminDashboard.ts`, `src/lib/support/guides/adminDashboard.test.tsx`. Touched: `locales/{en,sq}/supportAdmin.json`, `tests/e2e/support.spec.ts`, `src/lib/support/pageRegistry.ts`, `routeMap.ts`.
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
   - Targets are resolved in the live DOM when needed and on each settled change (S02); steps marked (state) are eligible only while their element exists. 2 steps are `repeat`: the first visible instance is the exemplar, so the number of records never changes the step list (SC3).
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

---

## 7. Page coverage and traceability matrix

### 7.1 Router path to page to slices

Every `path` in `routes/index.tsx` appears here. Generated from the file; a path missing from the inventory stops the generator.

| Router path | Page or exclusion | Slices |
|---|---|---|
| `/` | excluded: Redirect to /login; no UI of its own. | none |
| `/invite/:token` | excluded: Pre-login invitation acceptance; outside `AppLayout`. | none |
| `/invitations/accept` | excluded: Pre-login invitation acceptance; outside `AppLayout`. | none |
| `/login` | excluded: Pre-login, single form, outside `AppLayout` (no Support entry); self-explanatory. Revisit as decision D6. | none |
| `/q/:token` | excluded: Public customer quotation: an external audience and no application shell; the Support module is not loaded. | none |
| `/m/:token` | excluded: Public Wellness+ member card; external audience, lazily loaded bundle that must stay light (M4 Slice 11). | none |
| `/v/:token` | excluded: Public / staff verification link; external audience, no tenant shell. | none |
| `/f/:token` | excluded: Public client form; external audience, no shell. | none |
| `/forgot-password` | excluded: Pre-login single field; outside `AppLayout`. | none |
| `/reset-password` | excluded: Pre-login two fields; outside `AppLayout`. | none |
| `/:tenantSlug` | excluded: Same screen as `/:tenantSlug/dashboard`; covered by the dashboard pages. | none |
| `/:tenantSlug/dashboard` | Dashboard: Sales User (`dashboard.salesUser`); Dashboard: Sales Manager (`dashboard.salesManager`); Dashboard: Administrator (`dashboard.administrator`); Dashboard: CEO (`dashboard.ceo`); Dashboard: Business owner (fallback) (`dashboard.legacyOwner`); Dashboard: Staff (fallback) (`dashboard.legacyStaff`); excluded: Reception has no dashboard: `DashboardLanding` redirects to the company list. | [S80](#s80), [S81](#s81), [S82](#s82), [S83](#s83), [S84](#s84), [S85](#s85) |
| `/:tenantSlug/settings` | Settings: Company (`settings.company`) | [S58](#s58) |
| `/:tenantSlug/settings/team` | Settings: Team (`settings.team`) | [S60](#s60) |
| `/:tenantSlug/settings/roles` | Settings: Roles and permissions (`settings.roles`) | [S61](#s61) |
| `/:tenantSlug/settings/lists/:list?` | Settings: Lists (`settings.lists`) | [S62](#s62) |
| `/:tenantSlug/settings/sales-script` | Settings: Sales script (`settings.salesScript`) | [S63](#s63) |
| `/:tenantSlug/settings/pricing/:tab?` | Settings: Pricing (`settings.pricing`) | [S64](#s64), [S65](#s65) |
| `/:tenantSlug/settings/statuses` | Settings: Statuses (`settings.statuses`) | [S66](#s66) |
| `/:tenantSlug/settings/wellness-plus/:tab?` | Settings: Wellness+ (`settings.wellnessPlus`) | [S67](#s67) |
| `/:tenantSlug/settings/contracts` | Settings: Contracts and payments (`settings.contracts`) | [S68](#s68) |
| `/:tenantSlug/settings/audit` | Settings: Audit log (`settings.audit`) | [S69](#s69) |
| `/:tenantSlug/settings/integrations` | Settings: Integrations (`settings.integrations`) | [S70](#s70) |
| `/:tenantSlug/settings/profile` | Settings: My profile (`settings.profile`) | [S59](#s59) |
| `/:tenantSlug/reports` | Reports (`reports`) | [S87](#s87) |
| `/:tenantSlug/clients` | Clients list (`clients.list`) | [S17](#s17), [S18](#s18) |
| `/:tenantSlug/clients/new` | Client form (create and edit) (`clients.form`) | [S19](#s19) |
| `/:tenantSlug/clients/:clientId` | Client detail (`clients.detail`) | [S23](#s23), [S24](#s24), [S25](#s25) |
| `/:tenantSlug/clients/:clientId/edit` | Client form (create and edit) (`clients.form`) | [S19](#s19) |
| `/:tenantSlug/appointments` | Calendar (appointments, follow-ups, contract dates) (`appointments`) | [S21](#s21), [S22](#s22) |
| `/:tenantSlug/settings/client-management` | Settings: Client management (`settings.clientManagement`) | [S71](#s71), [S72](#s72) |
| `/:tenantSlug/settings/client-management/forms/:formId` | Form builder (`forms.builder`) | [S77](#s77), [S78](#s78), [S79](#s79) |
| `/:tenantSlug/settings/client-management/forms/:formId/submissions` | Form submissions (`forms.submissions`) | [S76](#s76) |
| `/:tenantSlug/settings/client-management/forms/:formId/print` | excluded: Print layout (30 lines): no interactive controls. | none |
| `/:tenantSlug/settings/client-management/forms/:formId/submissions/:submissionId/print` | excluded: Print layout (37 lines): no interactive controls. | none |
| `/:tenantSlug/settings/notifications` | Settings: Notifications (`settings.notifications`) | [S73](#s73) |
| `/:tenantSlug/inventory` | Inventory list (`inventory.list`) | [S88](#s88), [S89](#s89) |
| `/:tenantSlug/inventory/new` | Product form (create and edit) (`inventory.form`) | [S90](#s90) |
| `/:tenantSlug/inventory/:productId/edit` | Product form (create and edit) (`inventory.form`) | [S90](#s90) |
| `/:tenantSlug/settings/warehouses` | Settings: Warehouses (`settings.warehouses`) | [S74](#s74) |
| `/:tenantSlug/settings/categories` | Settings: Categories (`settings.categories`) | [S75](#s75) |
| `/:tenantSlug/notifications` | Notifications (`notifications`) | [S86](#s86) |
| `/:tenantSlug/offers` | Offers list (`offers`) | [S28](#s28) |
| `/:tenantSlug/follow-ups` | Follow-ups (`followUps`) | [S20](#s20) |
| `/:tenantSlug/approvals` | Discount approvals (`approvals`) | [S27](#s27) |
| `/:tenantSlug/quotations` | Quotations list (legacy workflow) (`quotations.list`) | [S35](#s35) |
| `/:tenantSlug/quotations/new` | Quotation form (create and edit) (`quotations.form`) | [S36](#s36) |
| `/:tenantSlug/quotations/:id` | Quotation detail (`quotations.detail`) | [S37](#s37) |
| `/:tenantSlug/invoices` | Invoices list (`invoices.list`) | [S38](#s38) |
| `/:tenantSlug/invoices/:id` | Invoice detail (`invoices.detail`) | [S39](#s39) |
| `/:tenantSlug/contracts` | Contracts list (`contracts.list`) | [S40](#s40) |
| `/:tenantSlug/contracts/new` | Contract form (create and edit) (`contracts.form`) | [S41](#s41) |
| `/:tenantSlug/members` | Members list (`members.list`) | [S47](#s47) |
| `/:tenantSlug/members/new` | Member form (register and edit) (`members.form`) | [S48](#s48) |
| `/:tenantSlug/members/payments` | Membership payments (`members.payments`) | [S53](#s53) |
| `/:tenantSlug/members/reports` | Membership reports (`members.reports`) | [S54](#s54) |
| `/:tenantSlug/members/verify` | Verify member (Reception) (`members.verify`) | [S55](#s55) |
| `/:tenantSlug/members/employee-upload` | Employee upload (`members.employeeUpload`) | [S56](#s56) |
| `/:tenantSlug/members/vip-requests` | VIP requests (`members.vipRequests`) | [S57](#s57) |
| `/:tenantSlug/members/:memberId` | Member detail (`members.detail`) | [S49](#s49), [S50](#s50), [S51](#s51), [S52](#s52) |
| `/:tenantSlug/members/:memberId/edit` | Member form (register and edit) (`members.form`) | [S48](#s48) |
| `/:tenantSlug/contracts/:contractId` | Contract detail (`contracts.detail`) | [S42](#s42), [S43](#s43) |
| `/:tenantSlug/payments` | Payments overview (`payments`) | [S44](#s44) |
| `/:tenantSlug/renewals` | Renewals (`renewals`) | [S45](#s45) |
| `/:tenantSlug/performance` | Performance (`performance`) | [S46](#s46) |
| `/:tenantSlug/contracts/:contractId/edit` | Contract form (create and edit) (`contracts.form`) | [S41](#s41) |
| `/:tenantSlug/pipeline` | Pipeline board (`pipeline.board`) | [S33](#s33) |
| `/:tenantSlug/pipeline/list` | Pipeline list (`pipeline.list`) | [S34](#s34) |
| `/:tenantSlug/deals/new` | Deal form (create and edit) (`deals.form`) | [S29](#s29) |
| `/:tenantSlug/deals/:dealId` | Deal detail (`deals.detail`) | [S30](#s30), [S31](#s31), [S32](#s32) |
| `/:tenantSlug/deals/:dealId/pricing` | Pricing screen (offer builder) (`pricing.offer`) | [S26](#s26) |
| `/:tenantSlug/clients/:clientId/pricing` | Pricing screen (offer builder) (`pricing.offer`) | [S26](#s26) |
| `/:tenantSlug/deals/:dealId/edit` | Deal form (create and edit) (`deals.form`) | [S29](#s29) |
| `/:tenantSlug/quotations/:id/edit` | Quotation form (create and edit) (`quotations.form`) | [S36](#s36) |
| `/admin` | Platform dashboard (Super Admin) (`admin.dashboard`) | [S95](#s95) |
| `/admin/dashboard` | Platform dashboard (Super Admin) (`admin.dashboard`) | [S95](#s95) |
| `/admin/tenants` | Platform: Tenants (`admin.tenants`) | [S91](#s91) |
| `/admin/people` | Platform: People (`admin.people`) | [S92](#s92) |
| `/admin/setting` | Platform: Settings (`admin.settings`) | [S93](#s93) |
| `/admin/profile` | Platform: My profile (`admin.profile`) | [S94](#s94) |
| `/admin/*` | excluded: Redirected by `SuperAdminShell`; the five real sub-pages are covered. | none |
| `/unauthorized` | excluded: 403 status page. | none |
| `*` | excluded: 404 status page. | none |

### 7.2 Page to slices

| # | Page | Id | Slices | Tour complete after |
|---|---|---|---|---|
| 1 | Clients list | `clients.list` | [S17](#s17), [S18](#s18) | [S18](#s18) |
| 2 | Client form (create and edit) | `clients.form` | [S19](#s19) | [S19](#s19) |
| 3 | Client detail | `clients.detail` | [S23](#s23), [S24](#s24), [S25](#s25) | [S25](#s25) |
| 4 | Pricing screen (offer builder) | `pricing.offer` | [S26](#s26) | [S26](#s26) |
| 5 | Calendar (appointments, follow-ups, contract dates) | `appointments` | [S21](#s21), [S22](#s22) | [S22](#s22) |
| 6 | Follow-ups | `followUps` | [S20](#s20) | [S20](#s20) |
| 7 | Discount approvals | `approvals` | [S27](#s27) | [S27](#s27) |
| 8 | Offers list | `offers` | [S28](#s28) | [S28](#s28) |
| 9 | Pipeline board | `pipeline.board` | [S33](#s33) | [S33](#s33) |
| 10 | Pipeline list | `pipeline.list` | [S34](#s34) | [S34](#s34) |
| 11 | Deal form (create and edit) | `deals.form` | [S29](#s29) | [S29](#s29) |
| 12 | Deal detail | `deals.detail` | [S30](#s30), [S31](#s31), [S32](#s32) | [S32](#s32) |
| 13 | Quotations list (legacy workflow) | `quotations.list` | [S35](#s35) | [S35](#s35) |
| 14 | Quotation form (create and edit) | `quotations.form` | [S36](#s36) | [S36](#s36) |
| 15 | Quotation detail | `quotations.detail` | [S37](#s37) | [S37](#s37) |
| 16 | Invoices list | `invoices.list` | [S38](#s38) | [S38](#s38) |
| 17 | Invoice detail | `invoices.detail` | [S39](#s39) | [S39](#s39) |
| 18 | Contracts list | `contracts.list` | [S40](#s40) | [S40](#s40) |
| 19 | Contract form (create and edit) | `contracts.form` | [S41](#s41) | [S41](#s41) |
| 20 | Contract detail | `contracts.detail` | [S42](#s42), [S43](#s43) | [S43](#s43) |
| 21 | Payments overview | `payments` | [S44](#s44) | [S44](#s44) |
| 22 | Renewals | `renewals` | [S45](#s45) | [S45](#s45) |
| 23 | Performance | `performance` | [S46](#s46) | [S46](#s46) |
| 24 | Members list | `members.list` | [S47](#s47) | [S47](#s47) |
| 25 | Member form (register and edit) | `members.form` | [S48](#s48) | [S48](#s48) |
| 26 | Member detail | `members.detail` | [S49](#s49), [S50](#s50), [S51](#s51), [S52](#s52) | [S52](#s52) |
| 27 | Membership payments | `members.payments` | [S53](#s53) | [S53](#s53) |
| 28 | Membership reports | `members.reports` | [S54](#s54) | [S54](#s54) |
| 29 | Verify member (Reception) | `members.verify` | [S55](#s55) | [S55](#s55) |
| 30 | Employee upload | `members.employeeUpload` | [S56](#s56) | [S56](#s56) |
| 31 | VIP requests | `members.vipRequests` | [S57](#s57) | [S57](#s57) |
| 32 | Settings: Company | `settings.company` | [S58](#s58) | [S58](#s58) |
| 33 | Settings: My profile | `settings.profile` | [S59](#s59) | [S59](#s59) |
| 34 | Settings: Team | `settings.team` | [S60](#s60) | [S60](#s60) |
| 35 | Settings: Roles and permissions | `settings.roles` | [S61](#s61) | [S61](#s61) |
| 36 | Settings: Lists | `settings.lists` | [S62](#s62) | [S62](#s62) |
| 37 | Settings: Sales script | `settings.salesScript` | [S63](#s63) | [S63](#s63) |
| 38 | Settings: Pricing | `settings.pricing` | [S64](#s64), [S65](#s65) | [S65](#s65) |
| 39 | Settings: Statuses | `settings.statuses` | [S66](#s66) | [S66](#s66) |
| 40 | Settings: Wellness+ | `settings.wellnessPlus` | [S67](#s67) | [S67](#s67) |
| 41 | Settings: Contracts and payments | `settings.contracts` | [S68](#s68) | [S68](#s68) |
| 42 | Settings: Audit log | `settings.audit` | [S69](#s69) | [S69](#s69) |
| 43 | Settings: Integrations | `settings.integrations` | [S70](#s70) | [S70](#s70) |
| 44 | Settings: Client management | `settings.clientManagement` | [S71](#s71), [S72](#s72) | [S72](#s72) |
| 45 | Settings: Notifications | `settings.notifications` | [S73](#s73) | [S73](#s73) |
| 46 | Settings: Warehouses | `settings.warehouses` | [S74](#s74) | [S74](#s74) |
| 47 | Settings: Categories | `settings.categories` | [S75](#s75) | [S75](#s75) |
| 48 | Form submissions | `forms.submissions` | [S76](#s76) | [S76](#s76) |
| 49 | Form builder | `forms.builder` | [S77](#s77), [S78](#s78), [S79](#s79) | [S79](#s79) |
| 50 | Notifications | `notifications` | [S86](#s86) | [S86](#s86) |
| 51 | Reports | `reports` | [S87](#s87) | [S87](#s87) |
| 52 | Inventory list | `inventory.list` | [S88](#s88), [S89](#s89) | [S89](#s89) |
| 53 | Product form (create and edit) | `inventory.form` | [S90](#s90) | [S90](#s90) |
| 54 | Dashboard: Sales User | `dashboard.salesUser` | [S80](#s80) | [S80](#s80) |
| 55 | Dashboard: Sales Manager | `dashboard.salesManager` | [S81](#s81) | [S81](#s81) |
| 56 | Dashboard: Administrator | `dashboard.administrator` | [S82](#s82) | [S82](#s82) |
| 57 | Dashboard: CEO | `dashboard.ceo` | [S83](#s83) | [S83](#s83) |
| 58 | Dashboard: Business owner (fallback) | `dashboard.legacyOwner` | [S84](#s84) | [S84](#s84) |
| 59 | Dashboard: Staff (fallback) | `dashboard.legacyStaff` | [S85](#s85) | [S85](#s85) |
| 60 | Platform dashboard (Super Admin) | `admin.dashboard` | [S95](#s95) | [S95](#s95) |
| 61 | Platform: Tenants | `admin.tenants` | [S91](#s91) | [S91](#s91) |
| 62 | Platform: People | `admin.people` | [S92](#s92) | [S92](#s92) |
| 63 | Platform: Settings | `admin.settings` | [S93](#s93) | [S93](#s93) |
| 64 | Platform: My profile | `admin.profile` | [S94](#s94) | [S94](#s94) |

### 7.3 Page by runtime state

Cell = slice numbers that cover the state; `.` = the state does not exist on that page (so an omission is visible as an empty cell where a state *does* exist, and the generator fails if there is one).

| Page | E | L | P | F | G | X | A | D | V | T | K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Clients list | 18 | 18 | 18 | 17 | . | 18 | 17, 18 | 18 | . | . | 18 |
| Client form (create and edit) | . | 19 | . | . | . | . | 19 | 19 | 19 | . | . |
| Client detail | 24, 25 | 23 | 24 | . | . | 23 | 23, 24, 25 | 23, 24, 25 | . | 24, 25 | 23 |
| Pricing screen (offer builder) | . | 26 | . | . | . | 26 | 26 | . | 26 | . | . |
| Calendar (appointments, follow-ups, contract dates) | 21, 22 | 21 | 21, 22 | . | . | 21 | 21, 22 | 21, 22 | 22 | 21 | . |
| Follow-ups | 20 | 20 | 20 | 20 | . | 20 | 20 | 20 | . | 20 | . |
| Discount approvals | 27 | 27 | 27 | . | 27 | 27 | 27 | . | . | . | . |
| Offers list | 28 | 28 | 28 | 28 | 28 | 28 | 28 | . | . | . | . |
| Pipeline board | 33 | 33 | 33 | . | . | 33 | 33 | 33 | . | . | . |
| Pipeline list | 34 | 34 | 34 | 34 | 34 | 34 | 34 | . | . | . | . |
| Deal form (create and edit) | . | 29 | . | . | . | . | 29 | . | 29 | . | . |
| Deal detail | 30, 31 | 30 | 30, 31 | . | . | 30 | 30, 31, 32 | 30, 31, 32 | 32 | . | 30, 32 |
| Quotations list (legacy workflow) | 35 | 35 | 35 | 35 | . | 35 | 35 | . | . | . | . |
| Quotation form (create and edit) | . | 36 | 36 | . | . | . | 36 | . | 36 | . | . |
| Quotation detail | . | 37 | . | . | . | 37 | 37 | . | . | . | 37 |
| Invoices list | 38 | 38 | 38 | 38 | . | 38 | 38 | . | . | . | . |
| Invoice detail | . | 39 | . | . | . | 39 | 39 | . | . | . | 39 |
| Contracts list | 40 | 40 | 40 | 40 | . | 40 | 40 | . | . | . | . |
| Contract form (create and edit) | . | 41 | . | . | . | . | 41 | . | 41 | . | . |
| Contract detail | . | 42, 43 | 42, 43 | . | . | 42, 43 | 42, 43 | 42, 43 | 42, 43 | . | 42, 43 |
| Payments overview | 44 | 44 | 44 | 44 | 44 | 44 | 44 | . | . | . | . |
| Renewals | 45 | 45 | 45 | 45 | 45 | 45 | 45 | 45 | 45 | 45 | . |
| Performance | 46 | 46 | 46 | 46 | 46 | 46 | 46 | 46 | . | 46 | . |
| Members list | 47 | 47 | 47 | 47 | 47 | 47 | 47 | . | . | . | . |
| Member form (register and edit) | . | 48 | . | . | . | . | 48 | 48 | 48 | . | . |
| Member detail | 49, 50, 51 | 49 | 49, 50, 51 | . | . | 49 | 49, 50, 51, 52 | 50, 51, 52 | 49, 50, 51, 52 | 49, 50, 51 | 49, 50, 51, 52 |
| Membership payments | 53 | 53 | 53 | 53 | 53 | 53 | 53 | . | . | . | . |
| Membership reports | 54 | 54 | 54 | 54 | . | 54 | 54 | . | . | . | . |
| Verify member (Reception) | . | 55 | . | 55 | . | 55 | 55 | 55 | . | . | . |
| Employee upload | 56 | 56 | 56 | . | . | 56 | 56 | . | 56 | . | . |
| VIP requests | 57 | 57 | 57 | 57 | 57 | 57 | 57 | 57 | 57 | . | . |
| Settings: Company | . | 58 | . | . | . | 58 | 58 | . | 58 | . | . |
| Settings: My profile | . | 59 | . | . | . | 59 | . | . | 59 | . | . |
| Settings: Team | 60 | 60 | 60 | . | . | 60 | 60 | 60 | 60 | . | 60 |
| Settings: Roles and permissions | . | 61 | . | . | . | 61 | 61 | 61 | 61 | . | 61 |
| Settings: Lists | 62 | 62 | 62 | . | . | 62 | 62 | 62 | 62 | 62 | . |
| Settings: Sales script | 63 | 63 | . | . | . | 63 | 63 | 63 | 63 | 63 | 63 |
| Settings: Pricing | 64, 65 | 64, 65 | 64, 65 | . | . | 64, 65 | . | 64, 65 | 64, 65 | 64, 65 | 64, 65 |
| Settings: Statuses | . | 66 | . | . | . | 66 | . | . | 66 | . | . |
| Settings: Wellness+ | . | 67 | . | . | . | 67 | 67 | . | 67 | 67 | . |
| Settings: Contracts and payments | . | 68 | . | . | . | 68 | . | . | 68 | . | . |
| Settings: Audit log | 69 | 69 | 69 | 69 | 69 | 69 | 69 | 69 | . | . | . |
| Settings: Integrations | . | 70 | 70 | . | . | 70 | 70 | . | . | . | . |
| Settings: Client management | 71, 72 | 71, 72 | 71, 72 | . | . | 71, 72 | 71, 72 | 71, 72 | 71, 72 | 71, 72 | 71, 72 |
| Settings: Notifications | . | 73 | . | . | . | 73 | 73 | . | 73 | . | . |
| Settings: Warehouses | 74 | 74 | 74 | . | . | 74 | 74 | 74 | 74 | . | 74 |
| Settings: Categories | 75 | 75 | 75 | 75 | . | 75 | 75 | 75 | 75 | . | 75 |
| Form submissions | 76 | 76 | 76 | . | . | 76 | 76 | 76 | . | . | . |
| Form builder | 77, 78, 79 | 77 | . | . | . | . | 77, 78, 79 | 77, 79 | . | 77, 78 | 78, 79 |
| Notifications | 86 | 86 | 86 | . | . | 86 | . | . | . | . | . |
| Reports | 87 | 87 | 87 | . | . | 87 | 87 | . | . | . | . |
| Inventory list | 88 | 88 | 88, 89 | 88, 89 | 88, 89 | 88 | 88, 89 | 89 | . | . | 89 |
| Product form (create and edit) | . | 90 | . | . | . | . | 90 | 90 | 90 | . | 90 |
| Dashboard: Sales User | 80 | 80 | 80 | 80 | . | 80 | 80 | . | . | . | . |
| Dashboard: Sales Manager | 81 | . | 81 | 81 | . | . | 81 | . | . | . | . |
| Dashboard: Administrator | 82 | . | 82 | . | . | . | 82 | . | . | . | . |
| Dashboard: CEO | 83 | . | 83 | . | . | . | 83 | . | . | . | . |
| Dashboard: Business owner (fallback) | 84 | 84 | 84 | . | . | 84 | . | . | . | . | . |
| Dashboard: Staff (fallback) | 85 | 85 | 85 | . | . | 85 | . | . | . | . | . |
| Platform dashboard (Super Admin) | 95 | 95 | 95 | . | . | 95 | . | . | . | . | . |
| Platform: Tenants | 91 | 91 | 91 | . | . | 91 | . | 91 | 91 | . | 91 |
| Platform: People | 92 | 92 | 92 | 92 | . | 92 | . | 92 | 92 | . | 92 |
| Platform: Settings | . | 93 | . | . | . | 93 | . | 93 | 93 | . | 93 |
| Platform: My profile | . | 94 | . | . | . | 94 | . | 94 | 94 | . | 94 |

State legend: **E** Empty state; **L** Loading / skeleton; **P** Populated, repeated rows or cards; **F** Search / filtered results; **G** Pagination / sorting; **X** Error / retry; **A** Permission- or workflow-dependent controls; **D** Dialogs, drawers, menus, nested workflows; **V** Validation and submission; **T** Tabs / sections; **K** Destructive or irreversible actions (explain-only).

### 7.4 Control category to guidance and pages

| Category | Mechanism and shared guidance | Pages (first slice) |
|---|---|---|
| **C1** Primary / secondary buttons | S11 shared kinds, S14 explain-only | clients.list (S17), clients.form (S19), clients.detail (S23), pricing.offer (S26), appointments (S21), followUps (S20), pipeline.board (S33), pipeline.list (S34), deals.form (S29), deals.detail (S30), quotations.list (S35), quotations.form (S36), quotations.detail (S37), invoices.detail (S39), contracts.list (S40), contracts.form (S41), contracts.detail (S42), payments (S44), performance (S46), members.list (S47), members.form (S48), members.detail (S49), members.payments (S53), members.reports (S54), members.verify (S55), members.employeeUpload (S56), settings.company (S58), settings.profile (S59), settings.team (S60), settings.roles (S61), settings.lists (S62), settings.salesScript (S63), settings.pricing (S64), settings.statuses (S66), settings.wellnessPlus (S67), settings.contracts (S68), settings.audit (S69), settings.integrations (S70), settings.clientManagement (S71), settings.notifications (S73), settings.warehouses (S74), settings.categories (S75), forms.submissions (S76), forms.builder (S77), notifications (S86), reports (S87), inventory.list (S88), inventory.form (S90), dashboard.salesUser (S80), dashboard.legacyOwner (S84), dashboard.legacyStaff (S85), admin.dashboard (S95), admin.tenants (S91), admin.people (S92), admin.settings (S93), admin.profile (S94) |
| **C2** Icon-only buttons | S10 (reuse `aria-label`), S11 | clients.list (S17), clients.detail (S23), appointments (S21), pipeline.board (S33), settings.team (S60), settings.lists (S62), settings.pricing (S64), settings.statuses (S66), settings.clientManagement (S71), settings.categories (S75), forms.builder (S77) |
| **C3** Navigation items, breadcrumbs, back links | S12 shell, page slices for breadcrumbs | settings.company (S58), settings.profile (S59), settings.integrations (S70), settings.notifications (S73), settings.warehouses (S74) |
| **C4** Search fields and filters | S11 search / filter / date kinds, S10 field containers | clients.list (S17), appointments (S21), followUps (S20), offers (S28), pipeline.list (S34), quotations.list (S35), invoices.list (S38), contracts.list (S40), payments (S44), renewals (S45), performance (S46), members.list (S47), members.payments (S53), members.reports (S54), members.verify (S55), members.vipRequests (S57), settings.audit (S69), inventory.list (S88), dashboard.salesUser (S80), dashboard.salesManager (S81), admin.people (S92) |
| **C5** Tabs and segmented controls | S10 Tabs, S13 tab hand-off | clients.detail (S23), appointments (S21), followUps (S20), pipeline.board (S33), renewals (S45), performance (S46), members.detail (S49), members.reports (S54), settings.lists (S62), settings.salesScript (S63), settings.pricing (S64), settings.wellnessPlus (S67), settings.clientManagement (S71), forms.builder (S77), dashboard.salesUser (S80) |
| **C6** Dropdowns and action menus | S10 DropdownMenu items, S13 hand-off | clients.list (S17), clients.detail (S23), pipeline.board (S33), deals.detail (S30), quotations.list (S35), invoices.list (S38), contracts.list (S40), members.detail (S49), settings.roles (S61), forms.builder (S77), admin.tenants (S91), admin.people (S92) |
| **C7** Form fields, validation, submit | S10 field containers, S11 form steps, S14 submit lock | clients.form (S19), pricing.offer (S26), deals.form (S29), quotations.form (S36), contracts.form (S41), members.form (S48), members.detail (S49), members.employeeUpload (S56), settings.company (S58), settings.profile (S59), settings.roles (S61), settings.pricing (S64), settings.statuses (S66), settings.wellnessPlus (S67), settings.contracts (S68), settings.notifications (S73), forms.builder (S77), inventory.form (S90), admin.settings (S93), admin.profile (S94) |
| **C8** Tables, cards, pagination, sorting | S10 DataTable, S02 repeat, S11 pagination and sort | clients.list (S17), approvals (S27), offers (S28), pipeline.board (S33), pipeline.list (S34), quotations.list (S35), quotations.form (S36), invoices.list (S38), contracts.list (S40), payments (S44), renewals (S45), performance (S46), members.list (S47), members.payments (S53), members.reports (S54), members.employeeUpload (S56), members.vipRequests (S57), settings.audit (S69), forms.submissions (S76), reports (S87), inventory.list (S88), dashboard.salesUser (S80), dashboard.salesManager (S81), dashboard.administrator (S82), dashboard.ceo (S83), admin.people (S92) |
| **C9** Create / view / edit / duplicate / archive / delete actions | S11, S14 | clients.list (S17), clients.form (S19), clients.detail (S23), followUps (S20), approvals (S27), pipeline.board (S33), deals.form (S29), deals.detail (S30), quotations.form (S36), quotations.detail (S37), invoices.detail (S39), contracts.form (S41), contracts.detail (S42), renewals (S45), members.form (S48), members.detail (S49), members.vipRequests (S57), settings.team (S60), settings.roles (S61), settings.lists (S62), settings.salesScript (S63), settings.pricing (S64), settings.integrations (S70), settings.clientManagement (S71), settings.warehouses (S74), settings.categories (S75), forms.builder (S77), notifications (S86), inventory.list (S88), inventory.form (S90), admin.tenants (S91), admin.people (S92) |
| **C10** Dialogs, drawers, confirmation prompts | S10 dialog roots, S13 nested layers | clients.list (S17), clients.detail (S23), appointments (S21), followUps (S20), deals.detail (S30), contracts.detail (S42), renewals (S45), performance (S46), members.form (S48), members.detail (S49), members.vipRequests (S57), settings.team (S60), settings.roles (S61), settings.lists (S62), settings.salesScript (S63), settings.pricing (S64), settings.audit (S69), settings.clientManagement (S71), settings.warehouses (S74), settings.categories (S75), forms.submissions (S76), inventory.list (S88), inventory.form (S90), admin.tenants (S91), admin.people (S92), admin.settings (S93), admin.profile (S94) |
| **C11** Toolbars, bulk operations | S11 bulk and export kinds, S14 | appointments (S21), payments (S44), performance (S46), members.payments (S53), members.reports (S54), members.employeeUpload (S56), settings.audit (S69), forms.builder (S77), reports (S87), inventory.list (S88), admin.settings (S93) |
| **C12** Settings and permission-dependent controls | S04 eligibility, S12 nav | clients.list (S17), clients.form (S19), clients.detail (S23), pricing.offer (S26), appointments (S21), followUps (S20), approvals (S27), offers (S28), pipeline.board (S33), pipeline.list (S34), deals.form (S29), deals.detail (S30), quotations.list (S35), quotations.form (S36), quotations.detail (S37), invoices.list (S38), invoices.detail (S39), contracts.list (S40), contracts.detail (S42), payments (S44), renewals (S45), performance (S46), members.list (S47), members.detail (S49), members.payments (S53), members.reports (S54), members.verify (S55), members.employeeUpload (S56), members.vipRequests (S57), settings.company (S58), settings.team (S60), settings.roles (S61), settings.lists (S62), settings.salesScript (S63), settings.pricing (S64), settings.statuses (S66), settings.wellnessPlus (S67), settings.contracts (S68), settings.audit (S69), settings.integrations (S70), settings.clientManagement (S71), settings.notifications (S73), settings.warehouses (S74), settings.categories (S75), forms.submissions (S76), forms.builder (S77), reports (S87), inventory.list (S88), inventory.form (S90), dashboard.salesUser (S80), dashboard.salesManager (S81), dashboard.administrator (S82), dashboard.ceo (S83) |
| **C13** Empty-state actions | S10 DataTable empty, S11 | clients.list (S17), appointments (S21), approvals (S27), offers (S28), pipeline.list (S34), quotations.list (S35), invoices.list (S38), contracts.list (S40), payments (S44), renewals (S45), members.list (S47), members.payments (S53), forms.submissions (S76), notifications (S86), inventory.list (S88), dashboard.legacyOwner (S84), dashboard.legacyStaff (S85), admin.dashboard (S95), admin.people (S92) |

### 7.5 Requirement to slices

| Id | Delivered by (infrastructure) | Verified on pages by |
|---|---|---|
| SUP-01 | S03, S09 | every page slice (panel offers the page) |
| SUP-02 | S05, S08, S12 | every page slice |
| SUP-03 | S01, S06, S08, S09 | S06 to S08; every page tour runs end to end |
| SUP-04 | S15, S16 | S15, S16; every page via its guide |
| SUP-05 | S10, S11, S12, S15, S16 | every page slice (inventory 3.2) and 3.4 exclusions |
| SUP-06 | S02, S08 | every page slice (change-during-tour test) |
| SUP-07 | S02, S10, S11, S15 | pages with P in 7.3 |
| SUP-08 | S01, S02, S08, S13 | every page slice |
| SUP-09 | S04, S12 | pages with A in 7.3 |
| SUP-10 | S01, S07, S13 | pages with D in 7.3 |
| SUP-11 | S06, S15 | pages with E, L or X in 7.3 |
| SUP-12 | S11, S14 | every page slice (Playwright `expectNoMutations`) |
| SUP-13 | S07, S13, S14, S16 | S07; manual pass in S17 and the last slice |
| SUP-14 | S06, S07, S09, S15, S16 | S06, S07; manual pass |
| SUP-15 | S02, S05, S06, S08, S09, S12 | every page slice (360 px row) |
| SUP-16 | S05, S06 | S05; spot check |
| SUP-17 | S01, S04, S08, S09 | S04, S08, S09 |
| SUP-18 | S04, S09, S11 | every page slice (`check:translations`) |
| SUP-19 | S03, S04, S08 | S03, S04, S09 build-size note |
| SUP-20 | S03 | S03 guard, S95 closure |

---

## 8. Testing and verification strategy

No test in this document has been run. Commands are the ones that exist in `frontend/package.json` and `.github/workflows/ci.yml`; none was invented.

### 8.1 Workflow (mandatory, from `.agentrules`)

1. Write the failing test(s) first and commit them (history shows red before green).
2. Run them and confirm they fail **for the expected reason** (module missing, attribute absent), not by accident.
3. Implement the minimum to pass.
4. Refactor with the suite green.
5. Only then run the slice's verification commands and open the PR.

Test titles carry the requirement id (`SUP-08 a vanished target moves the tour to the lost state`), following the M4 rule.

### 8.2 Layers

| Layer | Tool | What it proves | Where |
|---|---|---|---|
| Pure units | Vitest | Machine transitions; eligibility; persistence round trip; id grammar; guide lint; placement maths | S01, S04, S10, S11, S06 |
| DOM-level units | Vitest + jsdom + RTL | Resolver statuses; observer hub; mask follows a stubbed rect; popover variants; announcer; describedby restore; guard cancels events | S02, S05, S06, S07, S14 |
| Integration with the **real** shared UI | Vitest + RTL | Nested hand-off using the real `DropdownMenu`, `Modal`, `SlideOver`, `ConfirmDialog`; Esc arbitration against a real `Modal`; DataTable rows in both layouts | S10, S13 |
| Page guide tests | Vitest + RTL + msw | Per page: guide lint passes; every step resolves in some rendered fixture state; empty vs populated vs error; permission matrix; change-during-tour; submit lock | every page slice |
| Coverage guards | Vitest | Every router path is mapped or excluded (S03); no planned pages remain (last slice); every derived copy key exists in `en` and `sq` (S11); no inert control carries `data-tour` | S03, S11, last slice |
| End to end | Playwright (`support` project, `mobile-360`) | Real geometry, scrolling, focus, 360 px, zero mutating requests, whole tours on a seeded workspace | S09 onward, one table-driven spec |
| Accessibility | Storybook a11y addon; RTL role and label assertions; manual keyboard and screen-reader pass | Names, roles, order, announcements | S05, S06, S07, S09; manual in S17 and the last slice |
| Regression | Existing suites | Touched components behave as before | S09, S10, S12, S13 and every page slice |

### 8.3 What each required topic maps to

| Topic in the brief | Test(s) | Slice(s) |
|---|---|---|
| Shared tour-engine behaviour | Machine tables; session integration with a fixture guide | S01, S08 |
| Page-specific walkthroughs | Per-page guide test + per-page Playwright case | every page slice |
| Correct target selection | Resolver tests; per-guide "every step resolves" fixture check; scope-root tests with an open dialog | S02, S13, page slices |
| Missing and stale targets | Remove, replace, hide, disable a target during a running fixture tour; `lost` restoration | S02, S08 |
| Empty and populated states | Page tests with msw returning 0, 1, N records; same eligible step ids except empty-state steps | page slices; inventory list has the 20-product case |
| Data added after initial render | Add a row through the fixture after the tour starts; no step change | S02, S10, page slices |
| Data edited or deleted in a session | Remove the exemplar row mid-tour; spotlight moves; no console warning | S02, S18, S89 |
| Conditional and permission-dependent controls | Eligibility matrix; per-page permission variants; workflow variants | S04, page slices |
| Dynamic forms, dropdowns and dialogs | Hand-off with real components; dependent selects (city after area); disabled-until-valid buttons | S13, page slices |
| Keyboard and accessibility | Focus restore, Esc rule, arrow keys ignored in inputs, announcer, describedby | S07, S09, S15, S16 |
| Regression risk to existing pages | Existing tests for every touched file; attribute-only diffs; no new wrappers (diff review) | all |
| Safety | Guard tests; source grep; `expectNoMutations` | S14 and every page slice |
| Bundle impact | Static-import grep; `npm run build` size note in PRs | S03, S04, S09 |

### 8.4 Fixtures and utilities

- **Fixture guide and fixture page** (test code, introduced in S08): a small component with a button, a repeated list, a dependent select, a menu and a dialog, used by S08 to S16.
- **`assertGuideIntegrity(guide)`** (S11): lint plus key existence, called by every page test.
- **`renderWithSupport(ui, { user, route })`** (S08): wraps the existing providers, an auth user with a given `permissions` map and workflow, the host and a router.
- **`mockRect(element, rect)`** (S02): jsdom has no layout; rects are injected.
- **`expectNoMutations(page, { allow })`** (S14, Playwright).
- Existing msw handlers in `frontend/src/mocks` are reused; page tests override per case.

### 8.5 Playwright

- New project `support` (desktop Chrome, depends on `setup`, same pattern as `desktop`), and the Support panel added to `mobile360.spec.ts`.
- One table-driven spec, `frontend/tests/e2e/support.spec.ts`, with an entry per page: open the page, open Support, start the tour, press Next to the end, assert no console error, no navigation, no mutating request. Each page slice adds one row.
- Needs a seeded workspace and `E2E_ADMIN_PASSWORD`, exactly like the mobile suite; it is skipped without them. Because of that, **nothing that must hold is proven only by Playwright**: the unit and component layers carry the guarantees, and Playwright adds geometry, focus and the network assertion.

### 8.6 Manual checks (recorded in PRs, not automated)

Keyboard-only walk of one tour per area; one screen-reader pass (NVDA or VoiceOver) on the pilot, the form builder and the Super Admin page; reduced-motion and forced-colours spot checks; Albanian string length at 360 px. Albanian copy follows the existing native-review process (TD-019).

### 8.7 Definition of done for every slice

Red-then-green history; all new tests pass; existing tests pass; the verification commands of the slice pass; acceptance criteria demonstrated; for page slices, the page's row in section 7 is true after merge; the PR description states the measured production LOC next to the estimate.

### 8.8 Commands (all from `frontend/`)

| Purpose | Command | Source |
|---|---|---|
| Unit and component tests | `npx vitest run` (scoped: `npx vitest run src/lib/support src/pages/<dir>`) | `ci.yml` frontend job |
| Type check | `npm run typecheck` (`tsc -b --force`) | `package.json` |
| Lint | `npm run lint` (`oxlint`) | `package.json` |
| Translation catalogues | `npm run check:translations` | `package.json` |
| Build | `npm run build` (`tsc -b && vite build`) | `package.json` |
| Storybook | `npm run storybook` / `npm run build-storybook` | `package.json` |
| End to end | `npx playwright test --project=support` and `--project=mobile-360` (needs `E2E_ADMIN_PASSWORD`; `support` project added in S09) | `playwright.config.ts` |

---

## 9. Risks, assumptions and unresolved decisions

### 9.1 Risks

| # | Risk | Impact | How the sequence addresses it |
|---|---|---|---|
| R1 | **The one-page-per-slice rule and the 200 to 300 LOC target conflict for small pages.** A page with fewer than about 14 functional controls cannot reach 200 lines of production code, and combining two pages in one slice is forbidden. | 19 page slices are estimated below 150 lines and 25 between 150 and 199 (list in 6.0). | Same-page slices were merged wherever the merged size stayed within 300; first-use shared work is bundled into the first page that needs it; the remainder are documented exceptions, not padded. Decision D1 asks the reviewer to accept a floor for single-page slices. |
| R2 | **Annotation drift.** A developer renames or deletes a `data-tour` attribute, or restructures JSX so an id lands on a different element. | A step silently skips or points at the wrong control. | Per-guide fixture test that every step resolves in at least one rendered state; the route and key guards; `tourProps` format check; the `data-tour` id is the only coupling (no CSS or text coupling). |
| R3 | **Hand-rolled tables and pagination** on many pages (F7) instead of the shared `DataTable`. | Repeat annotation is per page; inconsistent markup. | Same `repeat` rule on any element; each page slice annotates its own rows; no refactor to `DataTable` (out of scope). |
| R4 | **`Modal` and `SlideOver` have no focus trap, render inline, close on a document Escape listener and animate out with framer-motion.** | Focus handling and false "lost target" during exit animations. | 600 ms exit grace and layer scoping (S13); Esc arbitration (S07, S13); tested with the real components, not mocks. |
| R5 | **`DropdownMenu` portals to `body` and closes on outside click.** | Interacting with tour UI could close the menu being explained. | Tour UI is stopped from reaching the menu's document handler only for its own subtree; tested against the real `DropdownMenu` (S13). |
| R6 | **Placeholder controls on pages**: static `disabled` Previous / Next (Clients, Contracts, Invoices, Quotations), `disabled` "more (soon)" (Categories), unwired disabled button (Staff dashboard). | Explaining them would state something false. | Excluded and listed (3.4); tests assert they carry no `data-tour`. If the team wires one later, a follow-up slice adds its step. |
| R7 | **Escape means two things** when a nested layer is open. | Accidental tour exit, or a dialog that will not close. | Decision rule 4.14-3; tested with a real `Modal`; revisit only on evidence. |
| R8 | **jsdom has no layout; Playwright needs a seeded server.** | Geometry (spotlight position, scroll, 360 px) cannot be proven in unit tests, and CI may skip the end-to-end project. | Logic is tested with stubbed rects; Playwright adds geometry; the skip rule matches the existing mobile suite; nothing essential is proven only end to end. |
| R9 | **The form builder autosaves every document change.** | A "try-it" edit would persist data. | Every editing control in the builder is explain-only (invariant I7); the builder's end-to-end case asserts the document JSON and the network log are unchanged. |
| R10 | **Inert shell controls**: header search input (no handler) and sidebar "New entry" (never given a handler). | Explaining them as functional would be wrong; but they are on every page. | Not annotated; recorded in S12 and in 3.4; reported to the team as a finding, not fixed here. |
| R11 | **Bundle size and i18n.** All locale files are statically imported (F10); support copy for the whole app could add hundreds of kilobytes per language. | Slower first load for everyone. | Copy and guides are lazy (S03, S04); a test forbids static imports; the build size is recorded in S09's PR. |
| R12 | **Stale permissions.** `permissions` come from `/auth/me`. | A step for a control the user can no longer use. | Eligibility recomputes on `permissionsVersion`; and the control must also exist in the DOM, so a stale map cannot produce a step for something not rendered. |
| R13 | **Estimate uncertainty (about +/-30%) for the profiled pages** (`ev: P`, section 3). | A slice could exceed 300 or fall short of its estimate. | Re-inventory is task 2 of each such slice; rule 4.14-2 (split at a state boundary rather than exceed the band). |
| R14 | **Read-only POST endpoints** (pricing test calculator, upload preview) would trip a naive "no POST" check. | False failures, or pressure to loosen the check. | Explicit per-endpoint allow-list in `expectNoMutations`, named in the PR that adds the page. |
| R15 | **Translation volume.** Roughly 1409 steps, each with a required title and body in `en` and `sq`, plus optional hints. | Review and consistency burden; Albanian awaits native review (TD-019). | Shared guidance covers common controls once; copy is added slice by slice; `el` and `it` fall back to English. |
| R16 | **Mobile layering.** The bottom sheet, the impersonation banner (z-index 1000, bottom), the sales script panel (right) and the off-canvas sidebar compete for space. | A target hidden behind the sheet or banner. | `--z-tour` above 1000; the host passes the sheet height to scroll logic; Playwright 360 px case on every page. |
| R17 | **Dashboard variant arrives asynchronously.** | Support shows no guide for a moment on `/dashboard`. | The panel says the page is still loading; no wrong guide is ever offered. |
| R18 | **A lazy chunk fails to load** (offline, deploy in progress). | Support appears dead. | The panel shows an error with Retry, never a silent failure. |
| R19 | **Foundation proves wrong on real data.** | Rework across many slices. | Pilot gate (S17 and S18) before any other page; decision rule 4.14-1. |

### 9.2 Decisions to confirm (the plan assumes the answers shown)

| # | Decision | Assumed answer | Affects |
|---|---|---|---|
| D1 | Accept page slices below 200 LOC where the page is genuinely small and slices may not be combined? | Yes, floor about 80 lines, each listed in 6.0 with its reason | 19 slices |
| D2 | Offer a tour automatically on a user's first visit to a page? | No (A5) | S09 only if changed |
| D3 | Keep progress in `localStorage` or in the backend? | `localStorage`; backend untouched (A4) | S04 |
| D4 | Hand-written overlay or a tour library? | Hand-written (4.5, rule 4.14-1) | S05 to S08 |
| D5 | Treat role dashboards as separate pages? | Yes (A2); if they are one page, up to three of the six dashboard slices could be combined | dashboard slices |
| D6 | Include the sign-in family (`/login`, forgot / reset password, invitation pages)? | No; single forms outside `AppLayout`, self-explanatory | none (a later slice would need a separate launcher) |
| D7 | Fix the inert header search and "New entry" controls? | Out of scope; reported | S12 |
| D8 | Register `SUP-xx` ids in `scripts/srs-requirements.json`? | No (A7) | none |
| D9 | Native review of Albanian Support copy before release? | Follow the existing process (TD-019) | all copy |

### 9.3 Open items outside this phase

The inert controls in R6 and R10; the el / it catalogue gaps; backend `Previous / Next` pagination for the four hand-rolled lists. They are findings of this planning pass, not tasks of the phase.

---

## 10. Final completeness checklist

This checklist validates the **plan**. Ticks are the author's, based on the checks run on the generated document (the generator script verified items marked "script"). They do not claim anything is implemented.

- [x] The repository was inspected: router, shells, layout, UI primitives, state, i18n, tests, CI, existing plans (section 2; evidence paths given).
- [x] Existing planning conventions were followed (slices, branches, tests first, requirement ids in titles, cross-cutting rules, decisions to confirm, traceability); conflicts and gaps are listed as A1 to A9.
- [x] All relevant pages were inventoried from the router: 64 pages and 17 excluded routes, each excluded route with a reason (section 3). **Script:** every `path` in `routes/index.tsx` is either in a page's route list or in the exclusion list.
- [x] Shared infrastructure is covered by S01 to S16 and split so none exceeds 300 lines. **Script:** no infrastructure slice is above 300.
- [x] Every in-scope page has a planned tour (section 7.2). **Script:** every page has at least one slice, and no slice is attached to more than one page.
- [x] No slice implements tours for more than one page (the slice record carries exactly one page id or none). **Script.**
- [x] Complex pages are split across multiple slices (Clients list, Client detail, Calendar (appointments, follow-ups, contract dates), Deal detail, Contract detail, Member detail, Settings: Pricing, Settings: Client management, Form builder, Inventory list), and small pages are not padded. **Script:** the list is computed.
- [ ] **Production LOC estimates satisfy the 200 to 300 target for every slice.** *They do not for 19 slices (below 150) and 25 slices (150 to 199).* Reasons and the proposed acceptance are in R1, D1 and 6.0. No slice exceeds 300. **Script:** distribution reported in the table in 6.0.
- [x] Dynamic data and conditional UI are addressed: exemplar rule, observer-based resolution, statuses, permission eligibility, workflow eligibility, hand-off for nested layers (section 4).
- [x] Acceptance criteria and tests are specified for every slice (section 6), with the layers and commands in section 8.
- [x] Dependencies are ordered correctly. **Script:** every dependency points at a lower slice id; no cycles.
- [x] Every runtime state declared applicable for a page is covered by at least one of that page's slices (section 7.3). **Script:** reports zero uncovered cells.
- [x] The plan does not require implementation changes before it is reviewed: it adds one file under `docs/` and changes nothing else.
- [ ] Reviewer confirms decisions D1 to D9 (section 9.2).
- [ ] Reviewer confirms the page definition (A2) and the dashboards-as-separate-pages choice (D5), since the one-page-per-slice rule depends on them.

---
