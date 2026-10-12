# Wellness Albania Platform: Interactive Support and Tour System Implementation Plan (slice-based)

| Item | Value |
|---|---|
| Status | **Plan only.** Nothing in this document has been implemented, run or tested. No application source, schema, configuration, dependency or test was changed to produce it. |
| Source | The task brief "Prepare a Slice-Based Implementation Plan for the Interactive Support & Tour System", read against the repository at branch `m-end-offer-letter` (HEAD `3913138b`), `docs/milestone-4-implementation-plan.md`, `.agentrules`, `task.md` and `.github/workflows/ci.yml` |
| Scope | One phase: a reusable, context-aware, page-by-page interactive support and guided-tour system for the whole authenticated application (tenant workspace and platform console) |
| Builds on | The current frontend (`frontend/`, React 19, React Router 7, zustand, i18next, CSS Modules). Backend untouched. |
| Approach | Vertical slices, one branch (`support-slice-N-<name>`) and one PR per slice, tests first. At the end of each slice something works that a person can see or that a test proves. |
| Slices | **68** (4 infrastructure-only, 64 page-tour slices covering 64 application pages) |
| Production LOC | About 19,210 lines across the phase; per-slice estimates in section 6 |
| Date | 12.10.2026 |


> ## If you were asked to implement a slice ("implement slice 7", "do S07")
>
> 1. "Slice N" means the heading `### SNN:` in the slice document listed for it in the table in section 6. Open **only** that slice, plus the standard procedure (6.1) and the assumptions (0.2) repeated below. Do not read the overview in full.
> 2. Read the slice's **Prerequisites** (item 5) and confirm each prerequisite slice is already merged (the overview, `00-overview.md`, has the slice-to-document table in section 6 and the dependency table in 5.6). If one is not merged, stop and say so; do not build it as a side effect.
> 3. Foundation slices (S01 to S04) are made of parts P01 to P16; read every part inside the slice.
> 4. Work test-first. Apply the **File-Level Change Plan** (item 7) file by file; follow item 8 for task order; keep to item 16 (what is excluded).
> 5. Verify with item 13, check item 12, and report the measured production LOC next to the estimate in item 6.
> 6. One slice = one branch `support-slice-N-<name>` and one PR. Never implement anything from another slice and never annotate a control listed in section 3.4 of the overview.
> 7. Page slices marked "profiled" or "extracted" in the overview are hypotheses: re-inventory the files first (PT-2) and report differences before editing.

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
- Slice ids are `P01`..`S68` in implementation order. A slice only depends on lower ids (verified mechanically when this document was generated, by a throwaway script that is not part of the repository).
- State codes in the inventory and matrices: **E** empty, **L** loading, **P** populated or repeated rows, **F** search or filtered results, **G** pagination or sorting, **X** error and retry, **A** permission- or workflow-dependent controls, **D** dialogs, drawers, menus and nested workflows, **V** validation and submission, **T** tabs or sections, **K** destructive or irreversible actions.
- Control-category codes: **C1** buttons, **C2** icon-only buttons, **C3** navigation and breadcrumbs, **C4** search and filters, **C5** tabs and segmented controls, **C6** dropdowns and action menus, **C7** form fields, validation and submit, **C8** tables, cards, pagination and sorting, **C9** create, view, edit, duplicate, archive and delete actions, **C10** dialogs, drawers and confirmation prompts, **C11** toolbars and bulk operations, **C12** settings and permission-dependent controls, **C13** empty-state actions.

### 0.1 Methodology conventions inherited from the repository

| Convention | Source | How this plan applies it |
|---|---|---|
| Vertical slices, one branch and one PR per slice, tests first, "something works at the end of each slice" | `docs/milestone-4-implementation-plan.md` section 1 | Same. Branch `support-slice-N-<name>`. |
| TDD is mandatory: failing test, run it, see it fail for the expected reason, minimal implementation, refactor | `.agentrules` ("Development Workflow") | Every slice's first task is the red test. Section 8. |
| Requirement ID in the test title | M4 plan, cross-cutting rule 1 | Internal ids `SUP-01`..`SUP-20` (below) go in test titles. |
| Translations in `sq` and `en`, `npm run check:translations` passes | M4 plan rule 8; `frontend/scripts/check-translations.mjs` | Every slice that adds copy. Greek and Italian may lag and fall back to English, as the script allows. |
| 360 px screens added to `mobile360.spec.ts` | M4 plan rule 8 | P09 adds the Support panel; every page slice adds its page to the Support end-to-end table. |
| Route coverage guard test that reads the router | `frontend/src/routes/mobile360Coverage.test.ts` | P03 copies the pattern for Support. |
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

In scope: shared tour infrastructure (P01 to P16); guided help for the **64 application pages** in section 3, including all tabs, dialogs, drawers and menus reachable from them. Out of scope: public customer pages, pre-login pages, print layouts, status pages (section 3.3); any backend change; analytics; auto-start; video or screenshot tutorials; third-party tour libraries.

### 1.5 What exists today versus what is planned

| Exists today (confirmed) | Planned by this phase |
|---|---|
| A header help button (`AppLayout.tsx`) with an `aria-label` and **no `onClick`** | A working launcher (P09) |
| A sidebar "Support" item (`Sidebar.tsx`) with `href="#support"` and `preventDefault` | The same launcher (P09) |
| `Tooltip` (hover/focus text), `Modal`, `SlideOver`, `ConfirmDialog`, `DropdownMenu`, `Tabs`, `DataTable` | Optional `tourId` props on them (P10); no behaviour change |
| Per-user conveniences in `localStorage` (theme), a persistent host mounted in `TenantGuard` (sales script panel) | The same two patterns for progress and for the Support host |
| No tour, onboarding or walkthrough code; no tour library in `package.json` | The whole phase |

### 1.6 Success criteria

| # | Criterion | Proven by |
|---|---|---|
| SC1 | Every route in the router is either mapped to a guide or excluded with a reason, and CI fails when a new route is neither | P03 route guard; S68 turns the last placeholder into a hard test |
| SC2 | Every one of the 64 pages offers a tour that reaches its last step in a seeded workspace with zero data-changing requests | Per-page Playwright case + `expectNoMutations` (P14) |
| SC3 | A page with 1 record and a page with 200 records yield the same step ids | Per-page dynamic test; inventory list slice has the explicit 20-product case |
| SC4 | Removing, disabling, replacing or adding a target while a tour runs never strands or misleads the user | P02, P08 integration tests |
| SC5 | A user without a permission never sees a step for that permission | P04 and every page's permission test |
| SC6 | The main bundle does not grow by guide or copy size | P04 and P03 tests; `npm run build` size recorded in P09 |
| SC7 | Keyboard-only and screen-reader walk-through of one tour per area passes a manual checklist | P07, S05, S68 |
| SC8 | `npm run typecheck`, `lint`, `check:translations`, `npx vitest run` and the Playwright `support` and `mobile-360` projects pass on the merged phase | CI (section 8.8) |

---

## 2. Repository findings and architecture

Everything below was read in the repository during planning. Paths are relative to the repository root. "Impact" is what the finding changes in this plan.

### 2.1 Findings that materially shape the plan

| # | Finding (confirmed) | Evidence | Impact on the plan |
|---|---|---|---|
| F1 | The router is a plain exported array, `createBrowserRouter(routes)`. 64 child routes sit under `/:tenantSlug` (84 `path` entries in all), plus six explicit `/admin*` routes, public routes (`/q/:token`, `/f/:token`, `/m/:token`, `/v/:token`), pre-login pages and `*`. | `frontend/src/routes/index.tsx` (`export const routes`, line 103; `createBrowserRouter`, line 923) | Page context comes from matching the URL against a map; a test can walk the exported array (P03). No change to the route table is needed. |
| F2 | `TenantGuard` stays mounted while the user moves between tenant pages and already hosts a persistent sibling, `SalesScriptPanelHost`, "because every page mounts its own `AppLayout`". | `frontend/src/routes/TenantGuard.tsx` | The Support host is mounted next to it (P08). Tours survive page-internal re-renders. |
| F3 | There is **no shared page frame**. Every `*Page.tsx` (42 lines each) wraps its content in `AppLayout` + `Sidebar` + `useNavigation`; `MembershipShell` does it for the Wellness+ pages; `SuperAdminShell` does it for `/admin*` (all six admin routes render the same shell). The form builder is **not** wrapped in `AppLayout`. | `frontend/src/pages/clients/ClientListPage.tsx`, `pages/membership/MembershipShell.tsx`, `pages/shell/SuperAdminShell.tsx`, `pages/settings/FormBuilderPage.tsx` | One launcher in `AppLayout` covers nearly every page. The admin host mounts in `SuperAdminShell`; the builder needs its own entry (S53). |
| F4 | **Two controls already pretend to be Support and do nothing.** The header `HelpCircle` button has an `aria-label` and no `onClick`. The sidebar "Support" item is `href="#support"` with `onClick={(e) => e.preventDefault()}`. | `frontend/src/components/layout/AppLayout/AppLayout.tsx`; `components/layout/Sidebar/Sidebar.tsx` | Both become the launcher (P09). |
| F5 | **Other inert controls exist and must not be explained as working.** The header search `<input>` has no value or handler. The sidebar "New entry" button's `onNewEntryClick` is never passed by any page (searched `src`). Clients, Contracts, Invoices and Quotations lists have **static `disabled` Previous / Next** buttons. The category list has a `disabled` "more (soon)" button. The staff dashboard has a `disabled` button with no handler. | `AppLayout.tsx`; `Sidebar.tsx`; `ClientListContent.tsx`; `ContractListContent.tsx`; `InvoiceListContent.tsx`; `QuotationListContent.tsx`; `CategoryList.tsx`; `StaffDashboard.tsx` | Recorded in the exclusions table (section 3.4) and in risk R6 and R10. A test asserts these carry no `data-tour`. The team is also told (this is a finding, not a task of the phase). |
| F6 | Shared UI primitives: `Button`, `TextInput` and `SelectInput` spread rest props onto their element; `DataTable` (loading skeleton, `empty` prop, sort, selection; one layout renders at a time, table on desktop and cards on a phone), `Tabs` (WAI-ARIA tabs), `Pagination`, `ConfirmDialog` exist. `DropdownMenu` is **portalled to `body`**, built from an `items` array and closes on outside click. `Modal` and `SlideOver` render **inline** (not portalled) with framer-motion exit animation, lock body scroll, close on a **document-level Escape listener**, have **no focus trap**, and `SlideOver` uses the fixed id `slideover-title`. | `frontend/src/components/ui/*` | Rows, headers, menu items, tabs, dialogs and field containers need a pass-through attribute (P10). Esc arbitration and exit-animation tolerance are designed explicitly (P07, P13; risks R4, R5, R7). |
| F7 | **Many pages hand-roll their tables and pagination** (Members, Contracts, Renewals, Payments, Quotations, Invoices, Verify) instead of using `DataTable`. | `pages/membership/MembersContent.tsx`, `pages/renewals/RenewalsContent.tsx`, `pages/contracts/ContractListContent.tsx` and others | Annotation is per page and cannot rely on `DataTable`; the repeated-row rule is the same either way (risk R3). |
| F8 | Authorization in the UI is `usePermission(key)` (key present in `user.permissions`) and `usePermissionScope(key)` (`OWN`, `TEAM`, `ALL`), loaded from `GET /auth/me`; `permissionsVersion` changes when permissions change; `tenantSalesWorkflow` (`LEGACY_QUOTATIONS` or `SALES_PROCESS`) filters nav items and pages. `SUPER_ADMIN` sits outside the permission system. | `frontend/src/hooks/usePermission.ts`, `hooks/useNavigation.ts`, `store/useAuthStore.ts`, `routes/RequirePermission.tsx`, `routes/RoleGuard.tsx` | Step eligibility copies these semantics exactly (P04) and never reads `role`. |
| F9 | Role dashboards share one frame: `DashboardLanding` asks the server for the dashboard kind (renders nothing until it knows), then renders `RoleDashboardFrame` with role-specific content; a `fallback` renders `BusinessOwnerShell` or `StaffShell`; Reception is redirected. | `pages/dashboard/DashboardLanding.tsx`, `RoleDashboardFrame.tsx` | The page id depends on a variant published by the page; the frame is guided once (dashboard slices). |
| F10 | i18n: four languages (`en`, `sq`, `el`, `it`); **every locale file is statically imported** in `i18n/index.ts` (resources are bundled); namespaces listed in `i18n/config.ts`; `check-translations.mjs` requires `sq` complete, lets `el` and `it` lag, and fails on orphan keys. `el` and `it` already lack several files. | `frontend/src/i18n/index.ts`, `i18n/config.ts`, `scripts/check-translations.mjs` | Support copy for ~64 pages must be **lazy-loaded**, not added to the static import list (P04, risk R11). |
| F11 | Motion and layering: `prefers-reduced-motion` handled in four CSS files; z-index tokens end at `--z-tooltip: 100`; the impersonation banner is pinned at a **literal `z-index: 1000`**; the sales script panel uses `--z-modal`. | `frontend/src/styles/tokens.css`, `components/layout/ImpersonationBanner/ImpersonationBanner.module.css`, `index.css`, `Tooltip.module.css` | A new `--z-tour` above 1000 (P05); the mobile sheet leaves room for the banner (risk R16). |
| F12 | Test stack: Vitest 4 (jsdom, `src/setupTests.ts` with msw server and stubs for pointer capture and `IntersectionObserver`), React Testing Library, msw, Playwright with projects `chromium`, `setup`, `desktop`, `mobile-360` (Pixel 5 at 360 px, skipped unless `E2E_ADMIN_PASSWORD`), Storybook with the a11y addon. Tests are colocated as `*.test.tsx`. CI frontend job: `npm ci`, `npm run typecheck`, `npm run lint` (oxlint), `npm run check:translations`, `npx vitest run`; a separate `e2e-mobile` job runs `--project=mobile-360`. | `frontend/vitest.config.ts`, `src/setupTests.ts`, `playwright.config.ts`, `tests/e2e/*`, `.github/workflows/ci.yml` | jsdom has no layout, so geometry is verified in Playwright (risk R8). A `support` Playwright project is added in P09 following the `desktop` project's pattern. |
| F13 | **Large page components.** The form builder is a 2,028-line canvas editor with its own chrome (title bar, ribbon with Home / Insert / Layout and five contextual tabs, page rail, properties panel, status bar) and autosave. `ClientDetailContent` (604 lines), `ContractDetailContent` (669), `MemberDetailContent` (588), `PeoplePage` (590), `PricingContent` (580), `ClientListContent` (581), `InventoryList` (533), `ProductForm` (649). | `components/forms/canvas/FormBuilder.tsx` and the files named | These pages get several steps' worth of slices; the builder is the only place where editing controls must be explain-only because of autosave (risk R9). |
| F14 | No tour, onboarding or walkthrough code exists; no tour library is a dependency; `data-tour` is unused; `data-testid` appears 32 times in `src`. | `frontend/package.json`; search of `src` | Hand-written, attribute-based design (section 4); no new dependency. |
| F15 | The existing plan format (M4) is the model: header table, "How to read", slice overview, cross-cutting rules, decisions to confirm, per-slice Goal / Depends on / Backend / Frontend / Tests / Done when, inputs needed, traceability. Plans for M1 to M3 are referenced but are not in `docs/`. | `docs/milestone-4-implementation-plan.md` | This document follows it. No competing format is introduced. |
| F16 | Debt and conventions to respect: dead controls are treated as a defect family (comments cite TD-020); the permission matrix is enforced by tests (`permissionMatrix.test.ts`, `routeCoverage.test.ts` on the backend); server errors stay in English (TD-016); Albanian text awaits native review (TD-019). | `task.md`; comments in `ClientListContent.tsx` | Support never claims a dead control works; Albanian copy follows the existing review process; Support text avoids server error strings. |

### 2.2 What the codebase does not tell us (stated, not guessed)

| Unknown | Why it matters | How the plan handles it |
|---|---|---|
| Exact labels, options and column sets of ~30 profiled pages (`ev: P` in section 3) | Step lists could differ in detail | Task 2 of each such slice is a re-inventory against the file; the step list below is the starting hypothesis. See risk R13. |
| Whether `GET /auth/me` returns every permission a page checks at the moment a tour starts | A stale `permissions` map would offer a step the user cannot use | Eligibility recomputes on `permissionsVersion` (P04); the target must also exist in the DOM, so a stale permission cannot produce a step for a control that is not rendered. |
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
- **Slices:** [S05](slices-1.md#s05)

**2. Client form (create and edit)** (`clients.form`)
- **Route(s):** `/:tenantSlug/clients/new`, `/:tenantSlug/clients/:clientId/edit`
- **Evidence:** Read in context
- **Main workflows:** Create a company or edit one; attach contact persons and custom field values; optionally create a deal at the same time.
- **Interactive controls:** Title and subtitle; Cancel; "Save client"; error banner; the tenant's own form rendered by `FormRenderer` in fill mode (sections and controls come from the form builder, present only if the tenant has a form); "Company profile" card (business type required, website, area / city cascade and more, read at slice start); "Contact persons" card (`ContactPersonsEditor`); "First deal" card with a checkbox; "Internal notes" textarea.
- **Conditional / permission-dependent:** The first-deal card only when creating and with `deals.edit`; city depends on area; the tenant form only if one exists; one component serves both routes (`isEdit`). **In edit mode `ContactPersonsEditor` saves each change through its own endpoints immediately (not on Save), so its controls are explain-only there; in create mode it edits a draft.**
- **States that exist:** L A D V. Validation messages per field, submit error banner, edit-mode loading.
- **Source files:** `pages/clients/ClientFormPage.tsx`, `pages/clients/ClientFormContent.tsx`, `pages/clients/ContactPersonsEditor.tsx`, `components/ui/CustomFieldInput`
- **Slices:** [S06](slices-1.md#s06)

**3. Client detail** (`clients.detail`)
- **Route(s):** `/:tenantSlug/clients/:clientId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a company; edit it; log an activity per channel; schedule an appointment; price an offer; upload employees; browse timeline, appointments, contracts, deals and Wellness+ tabs.
- **Interactive controls:** Action bar (sales script button, calculate price, employee upload, edit, email, more menu); custom-field panel with a settings button; the follow-ups panel (`FollowUpsPanel`: Plan button, quick follow-up buttons, follow-up list with Complete / Reschedule / Cancel / Reassign); five tab buttons (conditional); timeline (`CompanyTimeline`); one "log activity" button per channel and `ActivityDialog`; Schedule appointment, which opens the shared `PlanActivityDialog`; `AppointmentDetailPanel` for a clicked appointment; contracts, deals and Wellness+ tabs.
- **Conditional / permission-dependent:** Script button needs `script.view`; the follow-ups panel needs `calendar.view` (Plan: `activities.add`; quick buttons: `followups.manage`); Calculate price needs `offers.edit`; Employee upload needs `members.import`; Contracts, Deals, Wellness tabs need `contracts.validity.view`, `deals.view`, `members.view`; add activity / note need `activities.add` / `notes.add`.
- **States that exist:** E L P X A D T K. Loading, not found, duplicate-name notice, empty timeline, empty tabs.
- **Source files:** `pages/clients/ClientDetailPage.tsx`, `pages/clients/ClientDetailContent.tsx`, `components/followUps/FollowUpsPanel.tsx`, `components/calendar/PlanActivityDialog.tsx`, `components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`, `components/clients/CompanyTimeline.tsx`, `components/clients/ClientContractsTab.tsx`, `components/clients/ClientDealsTab.tsx`, `pages/membership/CompanyWellnessTab.tsx`, `components/activities/ActivityDialog.tsx`
- **Slices:** [S09](slices-2.md#s09)

**4. Pricing screen (offer builder)** (`pricing.offer`)
- **Route(s):** `/:tenantSlug/deals/:dealId/pricing`, `/:tenantSlug/clients/:clientId/pricing`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Build a price from business type, zone, frequency, package and employee band; see the calculation and any approval warning; save the offer on a deal.
- **Interactive controls:** Deal selector (when entered from a company), employee count input, business type, zone, frequency, package (with a services list), contact person, discount inputs, calculation summary, warnings (`role="alert"`), Save.
- **Conditional / permission-dependent:** Entered from a deal or from a company (deal chosen on screen); Save disabled until `canSave`; discount and approval states depend on pricing settings and permissions.
- **States that exist:** L X A V. Load error (`pricingScreenError`), warning text, saving.
- **Source files:** `pages/pricing/PricingContent.tsx`
- **Slices:** [S10](slices-2.md#s10)

**5. Calendar (appointments, follow-ups, contract dates)** (`appointments`)
- **Route(s):** `/:tenantSlug/appointments`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Move through time, switch view, filter by team member, open an item, plan an activity, reschedule (dialog or drag), act on overdue items.
- **Interactive controls:** Toolbar (previous, today, next, view segmented control, Plan); month grid, time grid and agenda; chips for activities, follow-ups and contract dates; legend; team filter chips; overdue section; detail panel (SlideOver) with status, edit, reschedule, cancel; Plan activity dialog; Reschedule dialog.
- **Conditional / permission-dependent:** Calendar scope (`calendar.view` OWN/TEAM/ALL) decides the team filter; Plan needs `activities.add`; follow-up actions need `followups.manage`; contract date chips only for contract viewers.
- **States that exist:** E L P X A D T V. Empty period (`role="status"`), load notice (`role="alert"`), overdue section appears only when items are overdue.
- **Source files:** `pages/appointments/AppointmentsPage.tsx`, `pages/appointments/CalendarContent.tsx`, `components/calendar/CalendarToolbar.tsx`, `components/calendar/CalendarMonthView.tsx`, `components/calendar/CalendarTimeGrid.tsx`, `components/calendar/CalendarAgenda.tsx`, `components/calendar/TeamFilter.tsx`, `components/calendar/OverdueSection.tsx`, `components/calendar/PlanActivityDialog.tsx`, `components/calendar/RescheduleItemDialog.tsx`, `components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`
- **Slices:** [S08](slices-2.md#s08)

**6. Follow-ups** (`followUps`)
- **Route(s):** `/:tenantSlug/follow-ups`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** See my follow-ups or the team's, filter to overdue, complete / reschedule / cancel a follow-up.
- **Interactive controls:** Tabs (mine / team), salesperson select (team tab), "overdue only" checkbox, `FollowUpList` rows with Complete, Reschedule, Cancel and (by scope) Reassign, and their action modals.
- **Conditional / permission-dependent:** Team tab and salesperson filter by `calendar.view` scope; actions need `followups.manage`.
- **States that exist:** E L P F X A D T. Empty list per tab, loading, error.
- **Source files:** `pages/followUps/FollowUpsPage.tsx`, `pages/followUps/FollowUpsContent.tsx`, `components/followUps/FollowUpList.tsx`, `components/followUps/FollowUpActionModals.tsx`, `components/followUps/FollowUpQuickButtons.tsx`
- **Slices:** [S07](slices-1.md#s07)

**7. Discount approvals** (`approvals`)
- **Route(s):** `/:tenantSlug/approvals`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Review offers waiting for discount approval.
- **Interactive controls:** DataTable of pending approvals with row actions, Pagination.
- **Conditional / permission-dependent:** Whole page needs `discounts.approve`; only in the SALES_PROCESS workflow (nav item filter).
- **States that exist:** E L P G X A. Empty queue, loading, error.
- **Source files:** `pages/approvals/ApprovalsPage.tsx`, `pages/approvals/ApprovalsContent.tsx`
- **Slices:** [S11](slices-2.md#s11)

**8. Offers list** (`offers`)
- **Route(s):** `/:tenantSlug/offers`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search and filter offers by status, salesperson and dates; open one.
- **Interactive controls:** Search; status chips (`aria-pressed`); salesperson select; created-from / created-to; Clear filters; DataTable; Pagination.
- **Conditional / permission-dependent:** Needs `commercial.view`; salesperson select only above OWN scope; SALES_PROCESS workflow.
- **States that exist:** E L P F G X A. Empty / no-match, loading, error.
- **Source files:** `pages/offers/OfferList.tsx`, `pages/offers/OfferListContent.tsx`
- **Slices:** [S12](slices-2.md#s12)

**9. Pipeline board** (`pipeline.board`)
- **Route(s):** `/:tenantSlug/pipeline`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** See deals by stage, open a deal, create one, move a deal to another stage.
- **Interactive controls:** View switch (board / list); "New deal"; stage columns with counts; deal cards; per-card "move to" menu; per-column "load more".
- **Conditional / permission-dependent:** Move needs `deals.edit`; deal values need `commercial.view`; New deal needs `deals.edit`.
- **States that exist:** E L P X A D. Empty column, partial load per column, error.
- **Source files:** `pages/deals/DealsPage.tsx`, `pages/deals/PipelineBoardContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`, `pages/deals/DealMarkers.tsx`
- **Slices:** [S15](slices-2.md#s15)

**10. Pipeline list** (`pipeline.list`)
- **Route(s):** `/:tenantSlug/pipeline/list`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter deals by stage, type, owner, business type, area, city and close dates; open or create one.
- **Interactive controls:** New deal; search; stage chips and type chips (`role="group"`); salesperson, business type, area, city selects; close-from / close-to; Clear filters; DataTable; Pagination.
- **Conditional / permission-dependent:** Salesperson filter above OWN scope; values need `commercial.view`.
- **States that exist:** E L P F G X A. Empty / no-match, loading, error.
- **Source files:** `pages/deals/DealListContent.tsx`, `pages/deals/PipelineViewSwitch.tsx`
- **Slices:** [S16](slices-2.md#s16)

**11. Deal form (create and edit)** (`deals.form`)
- **Route(s):** `/:tenantSlug/deals/new`, `/:tenantSlug/deals/:dealId/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Create or edit a deal; pick the company by search; set type, value, owner, notes.
- **Interactive controls:** Company search with matches list and "change company"; type; value/title inputs; salesperson select; notes textarea; Cancel; Save.
- **Conditional / permission-dependent:** Salesperson select needs `companies.reassign`; needs `deals.edit`.
- **States that exist:** L A V. Field errors, `role="alert"` form error, saving.
- **Source files:** `pages/deals/DealFormContent.tsx`
- **Slices:** [S13](slices-2.md#s13)

**12. Deal detail** (`deals.detail`)
- **Route(s):** `/:tenantSlug/deals/:dealId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a deal; move its stage; win, lose or reopen it; reassign; delete; manage its offers and activities.
- **Interactive controls:** Sales script button; Win / Lose / Reopen / Edit buttons; actions menu; stage select; history list; offers section (offers, pricing link, create contract); activities section (add, list); the shared follow-ups panel (`FollowUpsPanel`); Win, Lose, Reopen and Reassign dialogs; delete ConfirmDialog.
- **Conditional / permission-dependent:** Edit needs `deals.edit`; Reassign `companies.reassign`; Delete `deals.delete`; Reopen `deals.reopen`; Win is disabled without an offer; open vs closed deals show different actions.
- **States that exist:** E L P X A D V K. Open vs won vs lost deal; empty offers/activities; dialog validation (`disabled` until a reason/comment).
- **Source files:** `pages/deals/DealDetailContent.tsx`, `pages/deals/DealClosingModals.tsx`, `pages/deals/DealActivitiesSection.tsx`, `pages/deals/DealOffersSection.tsx`
- **Slices:** [S14](slices-2.md#s14)

**13. Quotations list (legacy workflow)** (`quotations.list`)
- **Route(s):** `/:tenantSlug/quotations`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Browse quotations by status, search, create one, per-row actions.
- **Interactive controls:** New quotation; five status filter buttons; search; table with per-row actions menu; static `disabled` Previous/Next.
- **Conditional / permission-dependent:** Only in the LEGACY_QUOTATIONS workflow (nav `workflow` filter) and with `quotations.manage`.
- **States that exist:** E L P F X A. Empty, loading, error; **Previous/Next static `disabled`** (not explained).
- **Source files:** `pages/quotations/QuotationList.tsx`, `pages/quotations/QuotationListContent.tsx`
- **Slices:** [S17](slices-2.md#s17)

**14. Quotation form (create and edit)** (`quotations.form`)
- **Route(s):** `/:tenantSlug/quotations/new`, `/:tenantSlug/quotations/:id/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Create or edit a quotation with client, validity and line items (product, warehouse, quantity, price).
- **Interactive controls:** Client select, validity input, line-items table with product / warehouse / quantity / price inputs, Add line, remove line, Cancel, Save.
- **Conditional / permission-dependent:** Legacy workflow only.
- **States that exist:** L P A V. Row validation, saving.
- **Source files:** `pages/quotations/CreateQuotation.tsx`, `pages/quotations/EditQuotation.tsx`, `pages/quotations/QuotationFormContent.tsx`
- **Slices:** [S18](slices-3.md#s18)

**15. Quotation detail** (`quotations.detail`)
- **Route(s):** `/:tenantSlug/quotations/:id`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a quotation and move it through its lifecycle (submit, approve, accept, reject, expire, return to draft), edit, share link, convert.
- **Interactive controls:** Back; Edit; status-dependent action buttons (Return to draft, Submit, Approve, Mark accepted, Mark rejected, Expire); share / convert / download actions; line-item table; error banner.
- **Conditional / permission-dependent:** Which buttons render depends on status and permission; legacy workflow only.
- **States that exist:** L X A K. One layout per status; `role="alert"` error banner.
- **Source files:** `pages/quotations/QuotationDetail.tsx`, `pages/quotations/QuotationDetailContent.tsx`
- **Slices:** [S19](slices-3.md#s19)

**16. Invoices list** (`invoices.list`)
- **Route(s):** `/:tenantSlug/invoices`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Browse and search invoices; per-row actions.
- **Interactive controls:** Back/title, search, table, per-row actions menu, static `disabled` Previous/Next.
- **Conditional / permission-dependent:** Needs `invoices.manage`.
- **States that exist:** E L P F X A. Empty, loading, error; **Previous/Next static `disabled`** (not explained).
- **Source files:** `pages/invoices/InvoiceList.tsx`, `pages/invoices/InvoiceListContent.tsx`
- **Slices:** [S20](slices-3.md#s20)

**17. Invoice detail** (`invoices.detail`)
- **Route(s):** `/:tenantSlug/invoices/:id`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read an invoice; send, mark paid, void, download.
- **Interactive controls:** Back; Send; Mark paid; Void; Download; line table; error banner.
- **Conditional / permission-dependent:** Buttons depend on invoice status.
- **States that exist:** L X A K. Status-dependent actions; `role="alert"` banner.
- **Source files:** `pages/invoices/InvoiceDetail.tsx`, `pages/invoices/InvoiceDetailContent.tsx`
- **Slices:** [S21](slices-3.md#s21)

**18. Contracts list** (`contracts.list`)
- **Route(s):** `/:tenantSlug/contracts`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search and filter contracts by validity, salesperson, end dates and overdue; open one; create one.
- **Interactive controls:** New contract; search; validity select; salesperson select; ends-from / ends-to; "only overdue" checkbox; table with per-row actions menu; static `disabled` Previous/Next.
- **Conditional / permission-dependent:** Needs `contracts.validity.view`; salesperson/scope filters by permission.
- **States that exist:** E L P F X A. Empty, loading, error; **Previous/Next static `disabled`** (not explained).
- **Source files:** `pages/contracts/ContractList.tsx`, `pages/contracts/ContractListContent.tsx`
- **Slices:** [S22](slices-3.md#s22)

**19. Contract form (create and edit)** (`contracts.form`)
- **Route(s):** `/:tenantSlug/contracts/new`, `/:tenantSlug/contracts/:contractId/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Create or edit a contract: company, dates, value, payment schedule.
- **Interactive controls:** Nine selects/inputs (company, deal, dates, value, payment terms…), Cancel, Save.
- **Conditional / permission-dependent:** Edit vs create share one component.
- **States that exist:** L A V. Field errors, saving.
- **Source files:** `pages/contracts/ContractFormPage.tsx`, `pages/contracts/ContractFormContent.tsx`
- **Slices:** [S23](slices-3.md#s23)

**20. Contract detail** (`contracts.detail`)
- **Route(s):** `/:tenantSlug/contracts/:contractId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Run a contract through its lifecycle (pending signature, activate, suspend, reinstate, cancel, renew); attach documents; read terms, notes and history.
- **Interactive controls:** About ten lifecycle buttons that render by status (Edit, Refresh, Mark pending signature, Activate, Suspend/Reinstate, Start renewal, Renew, Cancel); linked deal; terms (rich text); document upload (hidden file input) and file rows; notes; history; ConfirmDialogs; reason Modal; and the **instalment schedule card** (`ContractPaymentsCard`: export, add-instalment dialog, per-instalment drawer with invoice / receipt / reverse / correct / edit / remove modes and forms).
- **Conditional / permission-dependent:** Every lifecycle button depends on contract status; some need extra permissions.
- **States that exist:** L P X A D V K. Warning banner (`role="alert"`), reason dialog validation.
- **Source files:** `pages/contracts/ContractDetail.tsx`, `pages/contracts/ContractDetailContent.tsx`, `components/contracts/ContractPaymentsCard.tsx`
- **Slices:** [S24](slices-3.md#s24)

**21. Payments overview** (`payments`)
- **Route(s):** `/:tenantSlug/payments`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter instalments, read totals, export CSV.
- **Interactive controls:** Export CSV; search; status, salesperson, due-from, due-to, two more selects, city; "due not invoiced" checkbox; totals; table; Pagination.
- **Conditional / permission-dependent:** Needs `payments.view`; scope-dependent salesperson filter.
- **States that exist:** E L P F G X A. Empty (`role="alert"`), loading, export busy.
- **Source files:** `pages/payments/PaymentsOverview.tsx`, `pages/payments/PaymentsOverviewContent.tsx`
- **Slices:** [S25](slices-3.md#s25)

**22. Renewals** (`renewals`)
- **Route(s):** `/:tenantSlug/renewals`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Work the renewal list by window (about to end, just ended…): start a renewal, mark "not renewing" with a reason, undo.
- **Interactive controls:** Window tabs; search; salesperson select; table with row buttons (Start renewal, Not renewing, Undo); "not renewing" Modal (reason select); Pagination.
- **Conditional / permission-dependent:** Needs `contracts.validity.view`; action column only on the work-list windows.
- **States that exist:** E L P F G X A D T V. Empty (`role="alert"`), loading, modal validation.
- **Source files:** `pages/renewals/Renewals.tsx`, `pages/renewals/RenewalsContent.tsx`
- **Slices:** [S26](slices-3.md#s26)

**23. Performance** (`performance`)
- **Route(s):** `/:tenantSlug/performance`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Compare salespeople over a period; export; open one person's detail with chart or table; open the underlying records.
- **Interactive controls:** Export CSV / PDF; period select + custom dates; compare checkbox; person chips and Clear; table with per-person link and per-figure record buttons; detail panel (grain, indicator, chart/table toggle, close); records dialog with Pagination.
- **Conditional / permission-dependent:** Needs `performance.view`; scope narrows the rows.
- **States that exist:** E L P F G X A D T. Empty (`role="alert"`), detail load failure.
- **Source files:** `pages/performance/Performance.tsx`, `pages/performance/PerformanceContent.tsx`, `pages/performance/PerformanceDetail.tsx`, `pages/performance/PerformanceRecordsDialog.tsx`
- **Slices:** [S27](slices-3.md#s27)

#### Wellness+ membership

**24. Members list** (`members.list`)
- **Route(s):** `/:tenantSlug/members`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search and filter Wellness+ members; open or register one.
- **Interactive controls:** New member; search; tier, status, validity, source selects; left-from / left-to (shown for former employees); sort select; three checkboxes (expiring soon, VIP review due, former employee); Clear; total; hand-rolled table; Pagination.
- **Conditional / permission-dependent:** New member needs `members.manage`; page needs `members.view`; SALES_PROCESS workflow.
- **States that exist:** E L P F G X A. Empty, loading, `role="alert"` load error, total summary.
- **Source files:** `pages/membership/MembersList.tsx`, `pages/membership/MembersContent.tsx`, `pages/membership/MemberBadges.tsx`
- **Slices:** [S28](slices-3.md#s28)

**25. Member form (register and edit)** (`members.form`)
- **Route(s):** `/:tenantSlug/members/new`, `/:tenantSlug/members/:memberId/edit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Register or edit personal details; resolve a duplicate warning.
- **Interactive controls:** First, last name; date of birth; phone; email; language; city; identifier error; Cancel; Save; duplicate-member Modal (open existing, cancel, "different person, save").
- **Conditional / permission-dependent:** Needs `members.manage`. No tier / status / number control exists by design.
- **States that exist:** L D V A. Field errors, identifier error, generic error, duplicate dialog.
- **Source files:** `pages/membership/MemberFormPage.tsx`, `pages/membership/MemberFormContent.tsx`
- **Slices:** [S29](slices-3.md#s29)

**26. Member detail** (`members.detail`)
- **Route(s):** `/:tenantSlug/members/:memberId`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read a member (tier, terms, payments, family, VIP, history, note); record a payment; correct a tier; remove from a company; show the card; suspend, reinstate or close.
- **Interactive controls:** Header with badges; Record payment, Correct tier, Remove from company, Card, Edit, status actions; seven tabs (overview, terms, payments, family, VIP, history, note); receipt links; Void payment dialog; family add/link/remove dialogs; VIP request and decision; status Modal.
- **Conditional / permission-dependent:** Nearly every action has its own permission (`members.manage`, `members.payments.view/record`, `members.vip.*`); Close is destructive.
- **States that exist:** E L P X A D V T K. Loading, not found, load failed, per-tab empty states, dialog errors.
- **Source files:** `pages/membership/MemberDetailPage.tsx`, `pages/membership/MemberDetailContent.tsx`, `pages/membership/FamilyTab.tsx`, `pages/membership/VipTab.tsx`, `pages/membership/RecordPaymentModal.tsx`, `pages/membership/CorrectTierDialog.tsx`, `pages/membership/RemoveFromCompanyDialog.tsx`, `pages/membership/MemberCardDialog.tsx`, `pages/membership/VipDecisionDialog.tsx`
- **Slices:** [S30](slices-3.md#s30)

**27. Membership payments** (`members.payments`)
- **Route(s):** `/:tenantSlug/members/payments`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter payments, read totals (voided excluded), export CSV, open a receipt.
- **Interactive controls:** Export CSV; from / to; tier, kind, method, status selects; Clear; summary; table with receipt link; Pagination.
- **Conditional / permission-dependent:** Needs `members.payments.view`.
- **States that exist:** E L P F G X A. Empty, loading, `role="alert"` failure, summary.
- **Source files:** `pages/membership/MemberPaymentsPage.tsx`, `pages/membership/MemberPaymentsContent.tsx`
- **Slices:** [S31](slices-4.md#s31)

**28. Membership reports** (`members.reports`)
- **Route(s):** `/:tenantSlug/members/reports`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter by tier, segment, employer, area, city; read figure sections (chart / table toggle) and working lists; export each as CSV.
- **Interactive controls:** Five filters + Clear; report sections with chart/table toggle (`aria-pressed`) and per-section CSV; working-list panels with CSV.
- **Conditional / permission-dependent:** Needs `members.reports.view`.
- **States that exist:** E L P F X A. Loading, `role="alert"` error, empty lists.
- **Source files:** `pages/membership/reports/MembershipReportsPage.tsx`, `pages/membership/reports/MembershipReportsContent.tsx`, `pages/membership/reports/reportSections.ts`
- **Slices:** [S32](slices-4.md#s32)

**29. Verify member (Reception)** (`members.verify`)
- **Route(s):** `/:tenantSlug/members/verify`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Scan a card with the camera or search by name / number and see Valid / Not valid.
- **Interactive controls:** Scan button (camera), search form (`role="search"`), candidate buttons, result panel with actions.
- **Conditional / permission-dependent:** Needs `members.verify`; camera needs browser permission and HTTPS.
- **States that exist:** L F X A D. Idle, checking (`role="status"`), no matches, failed, result.
- **Source files:** `pages/membership/VerifyMemberPage.tsx`, `pages/membership/verify/VerifyMemberContent.tsx`, `pages/membership/verify/QrScanner.tsx`, `pages/membership/verify/ReceptionResult.tsx`
- **Slices:** [S33](slices-4.md#s33)

**30. Employee upload** (`members.employeeUpload`)
- **Route(s):** `/:tenantSlug/members/employee-upload`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Pick a company with a valid contract, upload a spreadsheet, preview created / linked / skipped / error rows, confirm, download the result, review history.
- **Interactive controls:** Download template; company search + results + "change"; file input; Upload; preview counts and table; Confirm; Cancel; result panel (download, "upload another"); history table with downloads.
- **Conditional / permission-dependent:** Needs `members.import`; confirm disabled when nothing would be created or linked.
- **States that exist:** E L P X A V. Idle, uploading, preview, outcome, `role="alert"` error, empty history.
- **Source files:** `pages/membership/EmployeeUploadPage.tsx`, `pages/membership/EmployeeUploadContent.tsx`
- **Slices:** [S34](slices-4.md#s34)

**31. VIP requests** (`members.vipRequests`)
- **Route(s):** `/:tenantSlug/members/vip-requests`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Approvers review pending VIP requests and approve or reject with a comment.
- **Interactive controls:** Status select; table with member link; Approve / Reject per row; decision dialog; Pagination.
- **Conditional / permission-dependent:** Needs `members.vip.approve`; an approver cannot approve their own request (server rule).
- **States that exist:** E L P F G X A D V. Empty, loading, `role="alert"` failure.
- **Source files:** `pages/membership/VipRequestsPage.tsx`, `pages/membership/VipRequestsContent.tsx`, `pages/membership/VipDecisionDialog.tsx`
- **Slices:** [S35](slices-4.md#s35)

#### Settings and form builder

**32. Settings: Company** (`settings.company`)
- **Route(s):** `/:tenantSlug/settings`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Edit the company profile and workspace options; save or discard.
- **Interactive controls:** Breadcrumb; text inputs (name, address, city, state, postal code and more); four native selects (options to be read at slice start); the workspace `LanguagePicker`; one checkbox; Discard; Save.
- **Conditional / permission-dependent:** Section reachable with `settings.manage` (SettingsLayout nav).
- **States that exist:** L X A V. Loading, saving, saved, error.
- **Source files:** `pages/settings/AccountSettingsPage.tsx`, `components/layout/SettingsLayout/SettingsLayout.tsx`
- **Slices:** [S36](slices-4.md#s36)

**33. Settings: My profile** (`settings.profile`)
- **Route(s):** `/:tenantSlug/settings/profile`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Edit my details, avatar and password.
- **Interactive controls:** Breadcrumb; profile inputs + Save; password inputs + Change password.
- **Conditional / permission-dependent:** Available to every tenant user (no permission).
- **States that exist:** L X V. Saving, success, field errors.
- **Source files:** `pages/settings/profile/ProfilePage.tsx`
- **Slices:** [S37](slices-4.md#s37)

**34. Settings: Team** (`settings.team`)
- **Route(s):** `/:tenantSlug/settings/team`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Invite a teammate, edit role, deactivate / reactivate.
- **Interactive controls:** Invite button; member rows with Edit, Deactivate, Reactivate icon buttons (each with `aria-label` per email); Invite and Edit modals; deactivate ConfirmDialog; role select.
- **Conditional / permission-dependent:** Needs `users.manage`; Reactivate vs Deactivate by status.
- **States that exist:** E L P X A D V K. Empty, `role="alert"` errors, modal validation.
- **Source files:** `pages/settings/team/TeamSettingsPage.tsx`, `pages/settings/team/TeamSettingsContent.tsx`, `pages/settings/team/InviteMemberModal.tsx`, `pages/settings/team/EditMemberModal.tsx`
- **Slices:** [S38](slices-4.md#s38)

**35. Settings: Roles and permissions** (`settings.roles`)
- **Route(s):** `/:tenantSlug/settings/roles`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Pick a role, copy / rename / delete it, grant permissions and scopes, save.
- **Interactive controls:** Role list; Copy, Rename, Delete; permission checkboxes; per-permission scope `<select>`; Save (disabled until dirty); name Modal; delete ConfirmDialog.
- **Conditional / permission-dependent:** Needs `roles.manage`; system roles cannot be renamed or deleted (server rule).
- **States that exist:** L X A D V K. Load failed (`role="alert"`), dirty state, delete error.
- **Source files:** `pages/settings/roles/RolesSettingsPage.tsx`, `pages/settings/roles/RolesSettingsContent.tsx`, `pages/settings/roles/RoleNameModal.tsx`
- **Slices:** [S39](slices-4.md#s39)

**36. Settings: Lists** (`settings.lists`)
- **Route(s):** `/:tenantSlug/settings/lists/:list?`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Maintain lookup lists: risk levels, business types, areas, cities, follow-up intervals, lost reasons, activity results.
- **Interactive controls:** Tab bar; per-tab `LookupListEditor` (add, rename, order, deactivate); areas and cities have dialogs and the city list depends on an area.
- **Conditional / permission-dependent:** Needs `settings.manage` or `activityResults.manage`; tabs differ by permission.
- **States that exist:** E L P X A D T V. Per-list empty / loading / error.
- **Source files:** `pages/settings/lists/ListsSettingsPage.tsx`, `pages/settings/lists/ListsSettingsContent.tsx`, `components/settings/LookupListEditor`, `pages/settings/lists/AreasList.tsx`, `pages/settings/lists/CitiesList.tsx`
- **Slices:** [S40](slices-4.md#s40)

**37. Settings: Sales script** (`settings.salesScript`)
- **Route(s):** `/:tenantSlug/settings/sales-script`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Edit the script per language, preview, save draft, publish, view or restore a version.
- **Interactive controls:** Language and mode (edit / preview) toggle groups; section editors; Save draft; Publish (ConfirmDialog); version history with View and Restore; version Modal.
- **Conditional / permission-dependent:** Needs `script.edit`.
- **States that exist:** E L X A D T V K. Load error, empty draft, busy.
- **Source files:** `pages/settings/salesScript/SalesScriptSettingsPage.tsx`, `pages/settings/salesScript/SalesScriptSettingsContent.tsx`
- **Slices:** [S41](slices-4.md#s41)

**38. Settings: Pricing** (`settings.pricing`)
- **Route(s):** `/:tenantSlug/settings/pricing/:tab?`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Configure employee bands, risk surcharges, visit frequencies, price zones, the discount cap, services, packages, offer wording and test the calculator.
- **Interactive controls:** Nine tabs (bands, risk, frequencies, zones, cap, services, packages, offer, calculator), each with its own panel: tables with inline edit, add / remove, dialogs.
- **Conditional / permission-dependent:** Needs `pricing.manage`.
- **States that exist:** E L P X D T V K. Per-panel load error (`role="alert"`), empty, dialogs.
- **Source files:** `pages/settings/pricing/PricingSettingsPage.tsx`, `pages/settings/pricing/PricingSettingsContent.tsx`, `pages/settings/pricing/pricingTabs.ts`
- **Slices:** [S42](slices-4.md#s42)

**39. Settings: Statuses** (`settings.statuses`)
- **Route(s):** `/:tenantSlug/settings/statuses`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Rename deal stage labels (sq and en), reorder, and set the stale-deals threshold.
- **Interactive controls:** Rows with label inputs (sq, en), Save / Cancel, Edit, Move up / Move down icon buttons; stale-deals input + Save.
- **Conditional / permission-dependent:** Needs `settings.manage`.
- **States that exist:** L X V. Load failed, error, saved status.
- **Source files:** `pages/settings/statuses/StatusesSettingsPage.tsx`, `pages/settings/statuses/StatusesSettingsContent.tsx`
- **Slices:** [S43](slices-5.md#s43)

**40. Settings: Wellness+** (`settings.wellnessPlus`)
- **Route(s):** `/:tenantSlug/settings/wellness-plus/:tab?`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Set tier fees and terms, membership rules, family relationships and the benefit table.
- **Interactive controls:** Four tabs; tier rows with fee / term / label inputs; rules inputs; relationships table (add, activate); benefits grid (percent per service and tier, add service).
- **Conditional / permission-dependent:** Edit needs `wellnessplus.settings.manage`; `members.view` / `members.verify` see only the read-only benefits tab.
- **States that exist:** L X A T V. `role="alert"` error per panel.
- **Source files:** `pages/settings/wellnessPlus/WellnessPlusSettingsPage.tsx`, `pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `pages/settings/wellnessPlus/TiersPanel.tsx`, `pages/settings/wellnessPlus/RulesPanel.tsx`, `pages/settings/wellnessPlus/RelationshipsPanel.tsx`, `pages/settings/wellnessPlus/BenefitsPanel.tsx`
- **Slices:** [S44](slices-5.md#s44)

**41. Settings: Contracts and payments** (`settings.contracts`)
- **Route(s):** `/:tenantSlug/settings/contracts`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Set contract and payment defaults.
- **Interactive controls:** One settings form with an input and Save.
- **Conditional / permission-dependent:** Needs `settings.manage`.
- **States that exist:** L X V. Saving / saved / error.
- **Source files:** `pages/settings/contracts/ContractSettingsPage.tsx`, `pages/settings/contracts/ContractSettingsContent.tsx`
- **Slices:** [S45](slices-5.md#s45)

**42. Settings: Audit log** (`settings.audit`)
- **Route(s):** `/:tenantSlug/settings/audit`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Filter the audit trail, open an entry, export.
- **Interactive controls:** Export; from / to date inputs; three selects; DataTable; Pagination; entry SlideOver.
- **Conditional / permission-dependent:** Needs `audit.view`.
- **States that exist:** E L P F G X A D. Empty, `role="alert"` failure.
- **Source files:** `pages/settings/audit/AuditLogSettingsPage.tsx`, `pages/settings/audit/AuditLogContent.tsx`, `pages/settings/audit/AuditEntryDetail.tsx`
- **Slices:** [S46](slices-5.md#s46)

**43. Settings: Integrations** (`settings.integrations`)
- **Route(s):** `/:tenantSlug/settings/integrations`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Connect or disconnect external providers.
- **Interactive controls:** Breadcrumb; per-provider card with status, connected-since date, Connect / Disconnect buttons; owner-only notice.
- **Conditional / permission-dependent:** Needs `integrations.manage`; Connect vs Disconnect by state; button disabled while processing.
- **States that exist:** L P X A. Connected / not connected per provider, processing.
- **Source files:** `pages/IntegrationsPage.tsx`
- **Slices:** [S47](slices-5.md#s47)

**44. Settings: Client management** (`settings.clientManagement`)
- **Route(s):** `/:tenantSlug/settings/client-management`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Define custom fields for companies; manage client forms (create, templates, duplicate, save as template, delete).
- **Interactive controls:** Two tab buttons; custom-fields tab (Excel import entry, Add field, rows with move up / down / edit / delete, SlideOver field editor with type, options, required); forms tab (Create form, From template Modal, rows with edit / submissions / duplicate / save as template / delete; ConfirmDialogs).
- **Conditional / permission-dependent:** Needs `settings.manage`; form actions need `forms.manage`.
- **States that exist:** E L P X A D T V K. Empty lists, errors, confirmations.
- **Source files:** `pages/settings/ClientSettingsPage.tsx`, `pages/settings/ClientSettingsContent.tsx`, `pages/settings/ClientFormsTab.tsx`
- **Slices:** [S48](slices-5.md#s48)

**45. Settings: Notifications** (`settings.notifications`)
- **Route(s):** `/:tenantSlug/settings/notifications`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Read (everyone) or edit (owner) the email notification policy.
- **Interactive controls:** Breadcrumb; about a dozen checkboxes and a `select` for timing; Discard; Save.
- **Conditional / permission-dependent:** Readable by everyone; **all controls are disabled for non-owners** and the server refuses their writes.
- **States that exist:** L X A V. Loading, saving, read-only.
- **Source files:** `pages/settings/NotificationSettingsPage.tsx`
- **Slices:** [S49](slices-5.md#s49)

**46. Settings: Warehouses** (`settings.warehouses`)
- **Route(s):** `/:tenantSlug/settings/warehouses`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Add, edit and delete warehouses.
- **Interactive controls:** Breadcrumb; Add warehouse; table; WarehouseFormModal; delete confirmation.
- **Conditional / permission-dependent:** Needs `inventory.manage` at scope ALL.
- **States that exist:** E L P X A D V K. Empty, error.
- **Source files:** `pages/inventory/WarehouseList/WarehouseList.tsx`, `components/inventory/WarehouseTable`, `components/inventory/WarehouseFormModal`
- **Slices:** [S50](slices-5.md#s50)

**47. Settings: Categories** (`settings.categories`)
- **Route(s):** `/:tenantSlug/settings/categories`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Add, rename, archive and delete product categories.
- **Interactive controls:** "Show archived" checkbox; Add; per-row Edit / Delete icon buttons (`title`) and a `disabled` "more (soon)" button; form and delete modals.
- **Conditional / permission-dependent:** Needs `inventory.manage` at scope ALL.
- **States that exist:** E L P F X A D V K. Empty, archived view. **The per-row "more" button is `disabled` with a "coming soon" title** and is not explained as functional.
- **Source files:** `pages/inventory/CategoryList/CategoryList.tsx`, `components/inventory/CategoryFormModal`, `components/inventory/DeleteCategoryModal`
- **Slices:** [S51](slices-5.md#s51)

**48. Form submissions** (`forms.submissions`)
- **Route(s):** `/:tenantSlug/settings/client-management/forms/:formId/submissions`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** List submissions of a form and open one.
- **Interactive controls:** Back / actions buttons; submissions table with View; detail overlay (`role="dialog"`) with close and print.
- **Conditional / permission-dependent:** Needs `forms.manage`.
- **States that exist:** E L P X A D. Empty, error, detail overlay.
- **Source files:** `pages/settings/FormSubmissionsPage.tsx`, `pages/settings/FormSubmissionsContent.tsx`
- **Slices:** [S52](slices-5.md#s52)

**49. Form builder** (`forms.builder`)
- **Route(s):** `/:tenantSlug/settings/client-management/forms/:formId`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Design a printable / fillable form on a page canvas: add sections and elements, format text, lay out, manage pages, edit properties, undo / redo, zoom, autosave.
- **Interactive controls:** Title bar (back, name, undo, redo, save status), ribbon tabs Home / Insert / Layout plus contextual tabs (picture, field, text box, shape, section) with `RibbonButton`s, Page rail (add, go to, move, duplicate, delete), canvas with right-click context menu, Add menu, Properties panel, Status bar with zoom.
- **Conditional / permission-dependent:** Needs `forms.manage`; contextual ribbon tabs exist only while an object is selected; many commands are disabled without a selection. **Not wrapped in `AppLayout`**: it has no header Help button.
- **States that exist:** E L A D T K. Empty page, selection-dependent commands, autosave states, history availability.
- **Source files:** `pages/settings/FormBuilderPage.tsx`, `components/forms/canvas/FormBuilder.tsx`, `components/forms/canvas/ribbon/*`, `components/forms/canvas/PageRail.tsx`, `components/forms/canvas/FormCanvas.tsx`, `components/forms/canvas/AddMenu.tsx`, `components/forms/canvas/PropertiesPanel.tsx`
- **Slices:** [S53](slices-5.md#s53)

#### Dashboards, reports, inventory, notifications

**50. Notifications** (`notifications`)
- **Route(s):** `/:tenantSlug/notifications`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Read notifications, open one, mark all read.
- **Interactive controls:** Mark all read; notification rows (buttons).
- **Conditional / permission-dependent:** No role gate; rows scoped to the recipient server-side.
- **States that exist:** E L P X. Empty, loading, error.
- **Source files:** `pages/notifications/NotificationsPage.tsx`, `pages/notifications/NotificationsContent.tsx`
- **Slices:** [S60](slices-6.md#s60)

**51. Reports** (`reports`)
- **Route(s):** `/:tenantSlug/reports`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Read revenue, client, inventory and appointment charts and tables; refresh.
- **Interactive controls:** Refresh and one more header button; chart sections (monthly revenue, client distribution, inventory value, appointment stats, client trend), appointments-by-staff and low-stock tables.
- **Conditional / permission-dependent:** Needs `reports.view`.
- **States that exist:** E L P X A. Loading grid (`aria-busy`), two `role="alert"` banners.
- **Source files:** `pages/ReportsPage.tsx`
- **Slices:** [S61](slices-6.md#s61)

**52. Inventory list** (`inventory.list`)
- **Route(s):** `/:tenantSlug/inventory`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Find products, filter, select several for bulk actions, adjust stock, delete.
- **Interactive controls:** Add product; search; category, warehouse, status, brand filters; Clear; `InventoryTable` with selectable rows and a per-row actions menu; bulk bar ("n selected" + three actions + Clear selection); error banner with Retry; Pagination; stock adjustment panel; two ConfirmDialogs.
- **Conditional / permission-dependent:** Needs `inventory.manage`; bulk bar only while rows are selected.
- **States that exist:** E L P F G X A D K. Empty vs filtered-empty (with Clear), error with Retry, loading.
- **Source files:** `pages/inventory/InventoryList/InventoryList.tsx`, `components/inventory/StockAdjustmentPanel`
- **Slices:** [S62](slices-6.md#s62)

**53. Product form (create and edit)** (`inventory.form`)
- **Route(s):** `/:tenantSlug/inventory/new`, `/:tenantSlug/inventory/:productId/edit`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Create or edit a product: information, pricing and stock, details, images; delete from the danger zone.
- **Interactive controls:** Back; section cards (information, pricing and stock, details, danger zone); name, price inputs; category select; `WarehouseStockAllocation` (stock per warehouse); image manager; Discard; Save; delete ConfirmDialog.
- **Conditional / permission-dependent:** Edit-only danger zone; needs `inventory.manage`.
- **States that exist:** L A D V K. Field errors, saving, unsaved-changes confirm.
- **Source files:** `pages/inventory/ProductForm/ProductForm.tsx`, `components/inventory/ProductImageManager`
- **Slices:** [S63](slices-6.md#s63)

**54. Dashboard: Sales User** (`dashboard.salesUser`)
- **Route(s):** `/:tenantSlug/dashboard (role = SALES_USER)`
- **Evidence:** Read in context
- **Main workflows:** Read my leads, deals, follow-ups, offers and sales; change period and place; open the list behind a figure.
- **Interactive controls:** Period select + custom dates; Area, City selects; "Calculated at" + Refresh; KPI tiles (links); pipeline chart with chart / table toggle.
- **Conditional / permission-dependent:** Figures the user may not see are simply absent (server-side); this is the **shared frame** of the four role dashboards.
- **States that exist:** E L P F X A. Empty state, `role="alert"` failure, `aria-busy` tiles.
- **Source files:** `pages/dashboard/SalesUserDashboard.tsx`, `pages/dashboard/RoleDashboardFrame.tsx`, `pages/dashboard/PeriodSelector.tsx`, `pages/dashboard/RefreshBar.tsx`, `pages/dashboard/KpiTile.tsx`, `pages/dashboard/ChartWithTable.tsx`, `pages/dashboard/EmptyState.tsx`
- **Slices:** [S54](slices-5.md#s54)

**55. Dashboard: Sales Manager** (`dashboard.salesManager`)
- **Route(s):** `/:tenantSlug/dashboard (role = SALES_MANAGER)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Team figures and per-salesperson comparison.
- **Interactive controls:** Shared frame plus a salesperson select and a per-salesperson table (value and overdue columns appear only when the server returns them), with a reasons breakdown (confirm at slice start).
- **Conditional / permission-dependent:** Value / follow-up columns exist only if the server returns them.
- **States that exist:** E P F A. Empty table.
- **Source files:** `pages/dashboard/SalesManagerDashboard.tsx`
- **Slices:** [S55](slices-6.md#s55)

**56. Dashboard: Administrator** (`dashboard.administrator`)
- **Route(s):** `/:tenantSlug/dashboard (role = ADMINISTRATOR)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Workspace state now: pricing, users per role, items needing attention, recent changes.
- **Interactive controls:** Four labelled panels (no period selector by design); tables inside.
- **Conditional / permission-dependent:** Recent changes panel conditional.
- **States that exist:** E P A. Empty panels.
- **Source files:** `pages/dashboard/AdministratorDashboard.tsx`
- **Slices:** [S56](slices-6.md#s56)

**57. Dashboard: CEO** (`dashboard.ceo`)
- **Route(s):** `/:tenantSlug/dashboard (role = CEO)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Company-wide view: team, contracts, payments, and the Wellness+ block.
- **Interactive controls:** Shared frame; panels for team, contracts, payments, Wellness+ (`data-block="wellnessPlus"`) and Wellness+ renewals; tables inside.
- **Conditional / permission-dependent:** Wellness+ block only in the SALES_PROCESS workflow.
- **States that exist:** E P A. Empty panels.
- **Source files:** `pages/dashboard/CeoDashboard.tsx`
- **Slices:** [S57](slices-6.md#s57)

**58. Dashboard: Business owner (fallback)** (`dashboard.legacyOwner`)
- **Route(s):** `/:tenantSlug/dashboard (fallback, scope ALL)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Whole-tenant overview when the server cannot name a role dashboard; open appointments, plan, view all activity.
- **Interactive controls:** View appointments; Plan; stat cards; recent-activity list with "view all".
- **Conditional / permission-dependent:** Shown only as the fallback in `DashboardLanding`.
- **States that exist:** E L P X. Several loading / empty / error branches.
- **Source files:** `pages/dashboard/BusinessOwnerDashboard.tsx`, `pages/shell/BusinessOwnerShell.tsx`
- **Slices:** [S58](slices-6.md#s58)

**59. Dashboard: Staff (fallback)** (`dashboard.legacyStaff`)
- **Route(s):** `/:tenantSlug/dashboard (fallback, scope OWN / TEAM)`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Staff overview: today's schedule, activity, quick actions.
- **Interactive controls:** Two filter-like buttons, Export, "view calendar", `StaffScheduleTable` rows, "view all activity". **`StaffScheduleTable` has several `disabled` "coming soon" controls (view calendar, per-row more, call, directions, mark complete) and one header button is `disabled` and unwired.**
- **Conditional / permission-dependent:** Fallback only.
- **States that exist:** E L P X. Many loading / empty branches.
- **Source files:** `pages/dashboard/StaffDashboard.tsx`, `pages/shell/StaffShell.tsx`
- **Slices:** [S59](slices-6.md#s59)

#### Platform administration (Super Admin)

**60. Platform dashboard (Super Admin)** (`admin.dashboard`)
- **Route(s):** `/admin`, `/admin/dashboard`
- **Evidence:** Profiled (sizes and counts only)
- **Main workflows:** Platform overview; jump to create a tenant.
- **Interactive controls:** New tenant button; summary cards and a recent list (contents read at slice start).
- **Conditional / permission-dependent:** Role `SUPER_ADMIN` (outside the permission system).
- **States that exist:** E L P X. Loading / empty branches.
- **Source files:** `pages/dashboard/SuperAdminDashboard.tsx`, `pages/shell/SuperAdminShell.tsx`
- **Slices:** [S68](slices-6.md#s68)

**61. Platform: Tenants** (`admin.tenants`)
- **Route(s):** `/admin/tenants`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** List workspaces, create one, suspend / reactivate, delete (type the slug to confirm).
- **Interactive controls:** New tenant; `TenantManagementTable` rows with actions (exact set read at slice start); CreateTenantModal; suspend / reactivate ConfirmDialog; delete ConfirmDialog with a typed-slug input.
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`; suspend vs reactivate by state.
- **States that exist:** E L P X D V K. Empty, `role="alert"` errors.
- **Source files:** `pages/admin/TenantsPage.tsx`, `components/widgets/TenantManagementTable`, `pages/admin/CreateTenantModal.tsx`
- **Slices:** [S64](slices-6.md#s64)

**62. Platform: People** (`admin.people`)
- **Route(s):** `/admin/people`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Search platform users, filter, invite, change role, deactivate / reactivate, delete.
- **Interactive controls:** Search; two selects; Invite; DataTable with a per-user actions menu; several ConfirmDialogs (one has radio inputs); the invite modal. Exact list read at slice start.
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`.
- **States that exist:** E L P F X D V K. Empty, loading, errors.
- **Source files:** `pages/admin/PeoplePage.tsx`, `pages/admin/InviteUserModal.tsx`
- **Slices:** [S65](slices-6.md#s65)

**63. Platform: Settings** (`admin.settings`)
- **Route(s):** `/admin/setting`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Set platform defaults and apply them in bulk to all or selected tenants.
- **Interactive controls:** Scope radios (all / selected); "choose tenants" button + picker Modal; native selects for defaults; checkbox; scope summary; Apply (ConfirmDialog).
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`.
- **States that exist:** L X D V K. Loading, summary, confirm.
- **Source files:** `pages/admin/PlatformSettingsPage.tsx`, `pages/admin/TenantPickerModal.tsx`
- **Slices:** [S66](slices-6.md#s66)

**64. Platform: My profile** (`admin.profile`)
- **Route(s):** `/admin/profile`
- **Evidence:** Extracted (control lines, labels and permission checks read; conditions to be verified)
- **Main workflows:** Edit my details and password.
- **Interactive controls:** Profile inputs + Save; password inputs + Change; one further action button guarded by a ConfirmDialog that contains an input (exact action read at slice start).
- **Conditional / permission-dependent:** Role `SUPER_ADMIN`.
- **States that exist:** L X D V K. Saving, errors.
- **Source files:** `pages/admin/AdminProfilePage.tsx`
- **Slices:** [S67](slices-6.md#s67)

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
| AppLayout header and Sidebar | every authenticated page except the form builder | P09, P12 |
| DataTable (rows, empty, loading, sort, cards) | Clients list, Offers, Pipeline list, Approvals, Audit log, People, Inventory list (`InventoryTable`) | P10 |
| Pagination | Approvals, Offers, Pipeline list, Payments, Renewals, Performance records, Members lists, VIP requests, Audit log, Inventory list | P10, P11 |
| DropdownMenu (row and header menus) | Clients, Client detail, Deal detail, Pipeline board, Contracts, Invoices, Quotations, People | P10, P13 |
| ConfirmDialog | Clients list, Deal detail, Contract detail, Team, Roles, Sales script, Inventory, Admin pages, Client management | P10, P13 |
| Modal / SlideOver | most detail, settings and admin pages | P10, P13 |
| Tabs | Client detail, Member detail, Renewals, Follow-ups, Lists, Pricing settings, Wellness+ settings, Client management | P10, P13 |
| ActivityDialog | Client detail, Deal detail | S09, S14 |
| FollowUpsPanel, FollowUpList, FollowUpQuickButtons, follow-up action modals | Follow-ups page, Client detail, Deal detail | S09, S07 |
| PlanActivityDialog, AppointmentDetailPanel | Calendar, Client detail, Follow-ups panel | S08 |
| ContractPaymentsCard | Contract detail | S24 |
| ValidityBadge, RiskBadge | Clients list, Client detail, Contracts | status-badge shared guidance (P11) |
| MemberBadges | Client detail (Wellness+ tab), Members list, Member detail, Payments | S09, then the members slices |
| RoleDashboardFrame / KpiTile / ChartWithTable | four role dashboards | dashboard slices |
| LookupListEditor | Settings: Lists (seven tabs) | S40 |
| NotificationBell panel | every page (header) | P12 |
| SalesScriptPanel (right-hand panel) | every tenant page | P12 (shell) |

---

## 4. Proposed architecture and design

Everything in this section is a **proposal** grounded in the findings of section 2. Where the repository cannot settle a choice, a decision rule is given instead of a guess (4.14).

### 4.1 Principles

1. **The real interface is the target.** The tour highlights elements that are on the page now. It never shows screenshots, copies of controls or a parallel tutorial UI.
2. **Look up, never hold.** The engine stores *target ids*, not elements, and resolves them in the live DOM when they are needed and again after every settled change. A stale element reference cannot exist.
3. **Describe kinds, not records.** Guidance attaches to repeated structures (a row, a card, a menu item) through one shared id. Twenty products and two hundred products yield identical steps.
4. **Read-only by construction.** The tour never activates an application control. This is enforced at runtime (P14), in definitions (lint, P11) and in end-to-end tests, not by convention.
5. **Pure core, thin shell.** The state machine, eligibility rules and resolver status logic are plain TypeScript modules, tested without React.
6. **No cost until used.** The launcher is small; the host, guides and copy are lazy chunks.
7. **Follow the app, don't fork it.** Eligibility mirrors `usePermission`, `usePermissionScope`, `tenantSalesWorkflow` and the nav filter so Support can never disagree with the menu.

### 4.2 Module map

```
frontend/src/
  store/useSupportStore.ts                 panel open, mode, session, page context             (P03)
  lib/support/
    types.ts                               PageGuide, GuideStep, TargetSpec, Requirement        (P01)
    tourMachine.ts                         pure reducer: start/next/back/skip/exit/wait/lost   (P01)
    targetResolver.ts  domObserverHub.ts   find + status + one shared MutationObserver          (P02)
    useTargetElement.ts                    hook: element, status, rect                          (P02)
    routeMap.ts  pageRegistry.ts           URL -> page id; lazy guide loaders                   (P03)
    useSupportPage.ts                      current page, tab, variant                           (P03)
    stepEligibility.ts progressStorage.ts  permissions/workflow/viewport; localStorage          (P04)
    supportCopy.ts                         lazy-load support copy per language                  (P04)
    tourProps.ts                           typed data-tour attribute helper                     (P10)
    sharedGuidance.ts defineGuide.ts       reusable control kinds; guide builder                (P11)
    guideLint.ts stepFactories.ts          definition rules; list/form/detail step families     (P11)
    layoutAdapters.ts                      open/close sidebar, mobile search (view state only)  (P12)
    layerStack.ts useLayerWatcher.ts       dialogs, drawers, menus as scopes and hand-offs      (P13)
    interactionGuard.ts                    capture-phase read-only enforcement                  (P14)
    useExplainableControls.ts usePickMode.ts   "Explain a control"                              (P15, P16)
    guides/*.ts                            one file per page (lazy)                             (S05 onward)
  components/support/
    SupportLauncher  SupportPanel  ControlList  PickBanner                                       (P09, P15, P16)
    SupportHost  SpotlightMask  TourPopover  LiveAnnouncer                                       (P05 to P08)
  locales/{en,sq}/support*.json            support, supportSales, supportMembers,
                                           supportSettings, supportOps, supportAdmin            (P09 onward)
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
| D. Third-party tour library (driver.js, react-joyride, Shepherd) | Fast start | New dependency; `Modal`/`SlideOver`/`DropdownMenu` interplay (inline vs portal, document Esc listeners, no focus trap) must be hand-solved anyway; limited control over the read-only guarantee and i18n loading | Rejected; revisit only if P08 shows the hand-written overlay cannot meet P05 and P07 acceptance (decision rule 4.14-1) |

**Id grammar.** `<pageId>.<control>` for page controls (`clients.list.add`), `shell.<control>` for the shared chrome, `activity.*` and similar for components shared by several pages. `tourProps(id, { repeat })` (P10) validates the format in development. An element may carry several ids as a space-separated token list.

**Annotation rule.** Edit the existing element; never add a wrapper. For shared components add the optional `tourId` prop (P10). Highlight the field container, not just the `<input>`, so the label is inside the ring.

### 4.6 Repeated, data-driven structures

- Rows, cards, chips, menu items and list entries carry **one shared id** and are flagged `repeat` in the guide. `DataTable` applies `rowTourId` to every row in both its table and card layouts (P10).
- A repeat step highlights the **first visible instance** (the exemplar) and its copy says it applies to every row. A control inside a row uses `within` to resolve inside that exemplar.
- When the exemplar disappears (filtered out, deleted, paged away) the resolver picks the next instance on the next frame; with none left the step is `missing` and is skipped.
- "Explain a control" and pick mode look an element up by id, so any instance can be asked about and the answer is the same.
- Counting rows is never needed. There is deliberately no step whose existence depends on the number of records, except the *empty state*, which is a different element.

### 4.7 Reacting to changing data and layout

One shared `MutationObserver` on `document.body` (child list, subtree, and a short attribute list) feeds the resolver; callbacks are batched to one per animation frame. One `ResizeObserver` watches the active target. The spotlight additionally follows ancestor scrolls (captured, as `DropdownMenu` already does) and window resizes.

| Situation | Behaviour | Slice |
|---|---|---|
| Target not present when the step is entered, and a region is busy (`aria-busy="true"` or `data-tour-busy`, which `DataTable` loading sets) | Popover shows "Loading this part of the page…" for at most 4 s, then treats the target as missing | P02, P08 |
| Target absent, nothing busy | Step skipped, polite announcement "Skipped: <title> is not available right now", progress denominator shrinks by one | P08 |
| Target disappears while it is the current step | Popover switches in place to "This item changed or is no longer on the page" with Next, Back, Exit; if the same id reappears the step is restored | P01, P08 |
| Target replaced by a new node with the same id (re-render, list refresh) | Detected by identity; spotlight re-binds; step does not restart | P02 |
| Target becomes disabled | Still highlighted; popover appends the step's `disabled` hint ("Save becomes available once you change something") | P06, P08 |
| Target moves (layout shift, sidebar opens, rows reflow) | Spotlight follows within one frame | P05 |
| Target is outside the viewport | `scrollIntoView` (instant under reduced motion) with room for the sticky header and the mobile sheet | P08 |
| Repeated target removed, filtered or paged away | Exemplar re-picked, or step skipped when none remain | P02 |
| Data added (new row, new record) | Same id, automatic coverage; nothing to do | P02, P10 |
| Filter, search or page change while a tour runs | The tour does not react to the data itself; steps whose targets vanish are skipped, steps whose targets appear (for example **Clear filters**) become eligible on the next navigation | P08 |
| Permission or workflow changes (`permissionsVersion` changes) | Eligibility recomputed; the machine receives `STEPS_CHANGED`; the current step is re-anchored if it was dropped | P04, P01 |
| Route changes | The tour ends (outcome `exited`, resume point saved) and says so | P08 |
| Language changes | Copy re-renders from keys; no restart | P04 |
| Viewport crosses 768 px | Placement and sheet mode re-evaluated; steps tagged `viewport` re-filtered; `needs: 'sidebar'` re-applied | P06, P12 |
| Duplicate registration of a non-repeat id | One `console.warn` in development; first visible instance used in production | P02 |

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
| I1 | The tour never calls `.click()`, `.submit()`, `dispatchEvent` or an application callback | Source-grep test under `lib/support`; code review rule | P14 |
| I2 | While a tour step is `explain-only`, the explained control cannot be activated by pointer or keyboard | Capture-phase guard cancels `click`, `pointerdown`, `mousedown`, `touchstart`, and Enter or Space on the target | P14 |
| I3 | Destructive or irreversible controls are always `explain-only` | `warning: true` implies explain-only; lint rejects the combination; runtime throws in development | P11, P14 |
| I4 | Forms cannot be submitted while a tour runs, even from a field the user may type in | Capture-phase `submit` cancel, with a one-time hint | P14 |
| I5 | The tour changes no application state except two view-state adapters (open sidebar, open mobile search), restored when the step changes or the tour ends | `layoutAdapters.ts` snapshot and restore | P12 |
| I6 | No `POST`, `PUT`, `PATCH` or `DELETE` is sent during a tour | `expectNoMutations` in every page's end-to-end case, with an explicit allow-list for the few read-only POST endpoints (pricing calculator, upload preview), risk R14 | P14, all page slices |
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

Guides are TypeScript modules loaded by dynamic `import()` the first time the panel opens on a page. Copy lives in six lazily loaded namespaces (`support`, `supportSales`, `supportMembers`, `supportSettings`, `supportOps`, `supportAdmin`) loaded with `import.meta.glob` and added to i18next on demand; they are deliberately **not** added to the static import list in `i18n/index.ts`. `check-translations.mjs` already scans every `locales/<lang>/*.json`, so completeness (`sq`) and orphan checks apply without a script change. A unit test (P11) additionally proves that every key a guide derives exists in `en` and `sq`, which the script cannot know.

### 4.14 Decisions the repository cannot settle, and the rule used instead

| # | Uncertainty | Decision rule |
|---|---|---|
| 1 | Is a hand-written overlay good enough, or is a library needed? | Build it. If P08's acceptance (focus, Esc arbitration, mobile sheet, no stranded states) cannot be met without more than about 150 extra production lines, stop and bring a library proposal to review before P09. |
| 2 | Do the ~30 profiled pages have more or fewer controls than listed? | Re-inventory in task 2 of the first slice of each page. If the step list grows so the estimate exceeds 300, split at a state boundary and renumber (for example `a`/`b`) rather than exceed the band; if it shrinks below 150, keep the slice and record the exception. |
| 3 | Escape inside nested layers | Esc belongs to the layer the user opened; the tour yields while `waiting` or inside a group. Revisit only if user testing shows accidental exits. |
| 4 | Whether a "try-it" is safe | A step may be `try-it` only if it changes view state or a local draft (open, tab, filter, typing in an input, expanding), never data. If in doubt, `explain-only`. Lint enforces the kinds; review enforces the judgement. |
| 5 | Read-only POST endpoints | List them in the PR that adds the page and in the allow-list of `expectNoMutations`; any other mutating request fails the test. |
| 6 | Dead or placeholder controls found later | Do not annotate. Record in the exclusions table. If the team wires one later, add a step in a follow-up slice. |
| 7 | Auto-offering a tour on first visit | Not built (A5). If requested, it is one panel-level change in P09's code using `progressStorage`, plus a decision about interruption. |

### 4.15 Trade-offs, plainly

- **Attributes over wrappers** costs a one-line edit per control in ~70 files, and in exchange gives stable, translation-proof, testable targets. The risk (a developer deletes an attribute) is turned into a failing test by the per-guide fixture check (section 8).
- **Hand-written engine over a library** costs roughly 3,900 production lines of infrastructure, and in exchange gives the exact read-only guarantee, the exact nested-layer behaviour and no new dependency.
- **Lazy copy and guides** add a loader and a loading moment on first open, and in exchange keep every existing user's bundle unchanged (F10).
- **Exemplar for repeats** means the tour cannot say "this row" about a specific record, and in exchange it never goes stale.
- **No auto-start** means discovery depends on the Support button, and in exchange nobody is interrupted.

---

## 5. Phase-level dependency overview

### 5.1 Shape of the phase

The slice target is about 1,000 lines of production code. The foundation is built as 16 **parts** (P01 to P16, each a small, separately testable module) that are delivered in four **foundation slices**. Every page tour is one slice.

```
FOUNDATION (infrastructure only, S01 to S04, 16 parts)
  S01  P01 engine, P02 resolver, P03 registry, P04 eligibility/storage/copy loader
     |
  S02  P05 spotlight, P06 popover, P07 focus/keyboard, P08 host     (needs P02, P03, P04 from S01)
     |
  S03  P09 launcher + panel, P10 shared-UI pass-through, P11 shared guidance + lint, P12 shell chrome
     |
  S04  P13 nested layers, P14 read-only guard, P15 explain-a-control list, P16 pick mode
     |
PILOT GATE  S05  Clients list (first real guide; validates the foundation on live data)
     |
PAGE TOURS  one slice per page, each depends on S04 and on the pilot, plus the explicit edges in 5.3
```

### 5.2 Rules of the sequence

1. **Foundation before pages.** No page slice starts until S04 is merged.
2. **Pilot gate.** S05 proves the mechanism on one real page. Every other page slice depends on it, so a design flaw found there is fixed once, in the foundation, before dozens of guides depend on it.
3. **One slice per page.** Apart from the explicit edges in 5.3, a slice needs no other page.
4. **Cross-page edges are only where a component or pattern is genuinely shared**, and are listed in 5.3 (for example the activity dialog, the follow-ups panel, the plan and appointment dialogs, the member badges and VIP decision dialog, the remove-from-company dialog, the deal closing dialogs, the lookup editor, the language picker, the form renderer, the tenant table and the role-dashboard frame).
5. **Areas are largely independent** after the pilot: a team can run Sales, Members, Settings, Operations and Admin in parallel, respecting the cross-area edges in 5.3. The order in this document is the single-developer order.
6. **Each page slice also depends, implicitly, on the page's source files being unchanged since planning.** The first task (re-inventory) catches drift.

### 5.3 Explicit cross-page edges

| Slice | Needs (besides foundation and pilot) | Why |
|---|---|---|
| S09 (Client detail: complete tour) | S07 (Follow-ups: complete tour) | reuses the follow-up action modals annotated with the follow-ups page (`followUps.modal.*`); this slice annotates the shared `FollowUpsPanel`, `FollowUpQuickButtons` and `FollowUpList` for the follow-ups page and the deal page |
| S09 (Client detail: complete tour) | S08 (Calendar (appointments, follow-ups, contract dates): complete tour) | the Schedule button opens the shared `PlanActivityDialog` and a clicked appointment opens the shared `AppointmentDetailPanel`, both annotated with the calendar (`plan.*`, `apptDetail.*`) |
| S14 (Deal detail: complete tour) | S09 (Client detail: complete tour) | reuses the `activity.*` ids of the shared `ActivityDialog` and the `followUps.*` ids of the shared follow-ups panel, annotated and given copy in the client detail slices |
| S55 (Dashboard: Sales Manager: complete tour) | S54 (Dashboard: Sales User: complete tour) | reuses the shared role-dashboard frame guidance (`includeFrame()`) written there |
| S56 (Dashboard: Administrator: complete tour) | S54 (Dashboard: Sales User: complete tour) | same shared frame guidance |
| S57 (Dashboard: CEO: complete tour) | S54 (Dashboard: Sales User: complete tour) | same shared frame guidance |
| S42 (Settings: Pricing: complete tour) | S40 (Settings: Lists: complete tour) | the packages panel uses the shared `LookupListEditor`, annotated with the lists page (`lookupList.*`) |
| S37 (Settings: My profile: complete tour) | S36 (Settings: Company: complete tour) | reuses the `LanguagePicker` annotated there (`language.*`) |
| S66 (Platform: Settings: complete tour) | S36 (Settings: Company: complete tour) | reuses the `LanguagePicker` annotated with the company settings (`language.*`) |
| S52 (Form submissions: complete tour) | S06 (Client form (create and edit): complete tour) | the submission overlay renders the shared `FormRenderer`, annotated with the client form |
| S53 (Form builder: complete tour) | S06 (Client form (create and edit): complete tour) | the builder canvas renders the shared `FormRenderer`, annotated with the client form |
| S68 (Platform dashboard (Super Admin): complete tour) | S64 (Platform: Tenants: complete tour) | reuses the `TenantManagementTable` annotated with the tenants page (`tenantTable.*`) |
| S28 (Members list: complete tour) | S09 (Client detail: complete tour) | reuses the `MemberBadges` (tier, status, expiring) annotated with the Wellness+ tab of the client page |
| S30 (Member detail: complete tour) | S09 (Client detail: complete tour) | the remove-from-company dialog is shared with the Wellness+ tab; its `removeFromCompany.*` ids are annotated there |
| S15 (Pipeline board: complete tour) | S14 (Deal detail: complete tour) | the move menu opens the shared Win and Lose dialogs, annotated with the deal page (`dealClosing.*`) |
| S35 (VIP requests: complete tour) | S30 (Member detail: complete tour) | reuses the `VipDecisionDialog` annotations made with the VIP tab |

### 5.4 Foundation parts and which slice delivers them

| Part | Title | Slice |
|---|---|---|
| P01 | Tour engine model and state machine (pure) | [S01](slices-1.md#s01) |
| P02 | Target resolver and live DOM synchronisation | [S01](slices-1.md#s01) |
| P03 | Support store, page-context registry and route-coverage guard | [S01](slices-1.md#s01) |
| P04 | Step eligibility, progress persistence and lazy copy loader | [S01](slices-1.md#s01) |
| P05 | Spotlight overlay layer | [S02](slices-1.md#s02) |
| P06 | Tour popover: content, progress and navigation controls | [S02](slices-1.md#s02) |
| P07 | Focus management, keyboard and screen-reader announcements | [S02](slices-1.md#s02) |
| P08 | Support host: session orchestration and mounting | [S02](slices-1.md#s02) |
| P09 | Support launcher and contextual help panel | [S03](slices-1.md#s03) |
| P10 | Annotation pass-through on shared UI components | [S03](slices-1.md#s03) |
| P11 | Shared guidance library and guide-authoring helpers | [S03](slices-1.md#s03) |
| P12 | Application shell chrome: annotations, layout adapters and shell guide | [S03](slices-1.md#s03) |
| P13 | Nested layers: dialogs, drawers, menus and tabs | [S04](slices-1.md#s04) |
| P14 | Explain-only enforcement and safety watchdog | [S04](slices-1.md#s04) |
| P15 | Explain a control: control list | [S04](slices-1.md#s04) |
| P16 | Explain a control: pick mode | [S04](slices-1.md#s04) |

### 5.5 Which tours depend on which foundation slice

| Foundation slice | Needed by | Reason |
|---|---|---|
| S01 | all | engine, targets, page context, eligibility, persistence, copy loading |
| S02 | all | what the user sees, how they move, the running tour |
| S03 | all | the only way to start a tour; annotations on shared components; shared guidance; the shell |
| S04 | all | nested dialogs and menus, the read-only guarantee, Explain a control |

### 5.6 Dependency table

| Slice | Title | Kind | Depends on |
|---|---|---|---|
| S01 | Foundation 1: engine, live target resolution, page registry, eligibility and copy loading | infrastructure | - |
| S02 | Foundation 2: spotlight, popover, focus and keyboard, and the running host | infrastructure | S01 |
| S03 | Foundation 3: launcher and panel, shared-component annotations, shared guidance and the shell guide | infrastructure | S02, S01 |
| S04 | Foundation 4: nested layers, read-only enforcement and Explain a control | infrastructure | S02, S03 |
| S05 | Clients list: complete tour | Clients list | S04 (foundation) |
| S06 | Client form (create and edit): complete tour | Client form (create and edit) | S04 (foundation), S05 |
| S07 | Follow-ups: complete tour | Follow-ups | S04 (foundation), S05 |
| S08 | Calendar (appointments, follow-ups, contract dates): complete tour | Calendar (appointments, follow-ups, contract dates) | S04 (foundation), S05 |
| S09 | Client detail: complete tour | Client detail | S04 (foundation), S05, S07, S08 |
| S10 | Pricing screen (offer builder): complete tour | Pricing screen (offer builder) | S04 (foundation), S05 |
| S11 | Discount approvals: complete tour | Discount approvals | S04 (foundation), S05 |
| S12 | Offers list: complete tour | Offers list | S04 (foundation), S05 |
| S13 | Deal form (create and edit): complete tour | Deal form (create and edit) | S04 (foundation), S05 |
| S14 | Deal detail: complete tour | Deal detail | S04 (foundation), S05, S09 |
| S15 | Pipeline board: complete tour | Pipeline board | S04 (foundation), S05, S14 |
| S16 | Pipeline list: complete tour | Pipeline list | S04 (foundation), S05 |
| S17 | Quotations list (legacy workflow): complete tour | Quotations list (legacy workflow) | S04 (foundation), S05 |
| S18 | Quotation form (create and edit): complete tour | Quotation form (create and edit) | S04 (foundation), S05 |
| S19 | Quotation detail: complete tour | Quotation detail | S04 (foundation), S05 |
| S20 | Invoices list: complete tour | Invoices list | S04 (foundation), S05 |
| S21 | Invoice detail: complete tour | Invoice detail | S04 (foundation), S05 |
| S22 | Contracts list: complete tour | Contracts list | S04 (foundation), S05 |
| S23 | Contract form (create and edit): complete tour | Contract form (create and edit) | S04 (foundation), S05 |
| S24 | Contract detail: complete tour | Contract detail | S04 (foundation), S05 |
| S25 | Payments overview: complete tour | Payments overview | S04 (foundation), S05 |
| S26 | Renewals: complete tour | Renewals | S04 (foundation), S05 |
| S27 | Performance: complete tour | Performance | S04 (foundation), S05 |
| S28 | Members list: complete tour | Members list | S04 (foundation), S05, S09 |
| S29 | Member form (register and edit): complete tour | Member form (register and edit) | S04 (foundation), S05 |
| S30 | Member detail: complete tour | Member detail | S04 (foundation), S05, S09 |
| S31 | Membership payments: complete tour | Membership payments | S04 (foundation), S05 |
| S32 | Membership reports: complete tour | Membership reports | S04 (foundation), S05 |
| S33 | Verify member (Reception): complete tour | Verify member (Reception) | S04 (foundation), S05 |
| S34 | Employee upload: complete tour | Employee upload | S04 (foundation), S05 |
| S35 | VIP requests: complete tour | VIP requests | S04 (foundation), S05, S30 |
| S36 | Settings: Company: complete tour | Settings: Company | S04 (foundation), S05 |
| S37 | Settings: My profile: complete tour | Settings: My profile | S04 (foundation), S05, S36 |
| S38 | Settings: Team: complete tour | Settings: Team | S04 (foundation), S05 |
| S39 | Settings: Roles and permissions: complete tour | Settings: Roles and permissions | S04 (foundation), S05 |
| S40 | Settings: Lists: complete tour | Settings: Lists | S04 (foundation), S05 |
| S41 | Settings: Sales script: complete tour | Settings: Sales script | S04 (foundation), S05 |
| S42 | Settings: Pricing: complete tour | Settings: Pricing | S04 (foundation), S05, S40 |
| S43 | Settings: Statuses: complete tour | Settings: Statuses | S04 (foundation), S05 |
| S44 | Settings: Wellness+: complete tour | Settings: Wellness+ | S04 (foundation), S05 |
| S45 | Settings: Contracts and payments: complete tour | Settings: Contracts and payments | S04 (foundation), S05 |
| S46 | Settings: Audit log: complete tour | Settings: Audit log | S04 (foundation), S05 |
| S47 | Settings: Integrations: complete tour | Settings: Integrations | S04 (foundation), S05 |
| S48 | Settings: Client management: complete tour | Settings: Client management | S04 (foundation), S05 |
| S49 | Settings: Notifications: complete tour | Settings: Notifications | S04 (foundation), S05 |
| S50 | Settings: Warehouses: complete tour | Settings: Warehouses | S04 (foundation), S05 |
| S51 | Settings: Categories: complete tour | Settings: Categories | S04 (foundation), S05 |
| S52 | Form submissions: complete tour | Form submissions | S04 (foundation), S05, S06 |
| S53 | Form builder: complete tour | Form builder | S04 (foundation), S05, S06 |
| S54 | Dashboard: Sales User: complete tour | Dashboard: Sales User | S04 (foundation), S05 |
| S55 | Dashboard: Sales Manager: complete tour | Dashboard: Sales Manager | S04 (foundation), S05, S54 |
| S56 | Dashboard: Administrator: complete tour | Dashboard: Administrator | S04 (foundation), S05, S54 |
| S57 | Dashboard: CEO: complete tour | Dashboard: CEO | S04 (foundation), S05, S54 |
| S58 | Dashboard: Business owner (fallback): complete tour | Dashboard: Business owner (fallback) | S04 (foundation), S05 |
| S59 | Dashboard: Staff (fallback): complete tour | Dashboard: Staff (fallback) | S04 (foundation), S05 |
| S60 | Notifications: complete tour | Notifications | S04 (foundation), S05 |
| S61 | Reports: complete tour | Reports | S04 (foundation), S05 |
| S62 | Inventory list: complete tour | Inventory list | S04 (foundation), S05 |
| S63 | Product form (create and edit): complete tour | Product form (create and edit) | S04 (foundation), S05 |
| S64 | Platform: Tenants: complete tour | Platform: Tenants | S04 (foundation), S05 |
| S65 | Platform: People: complete tour | Platform: People | S04 (foundation), S05 |
| S66 | Platform: Settings: complete tour | Platform: Settings | S04 (foundation), S05, S36 |
| S67 | Platform: My profile: complete tour | Platform: My profile | S04 (foundation), S05 |
| S68 | Platform dashboard (Super Admin): complete tour | Platform dashboard (Super Admin) | S04 (foundation), S05, S64 |

---

## 6. Detailed slice specifications

The full specification of every slice lives in six documents of roughly equal size, in dependency order. Every slice has the fifteen fields the task requires, numbered 1 to 15, plus a sixteenth, the list of what is intentionally excluded. Item 7 is the File-Level Change Plan: for every affected file it gives the action, exact path, change instructions, implementation details, integration, removal instructions and verification.

### 6.0b Slice documents

| Document | Slices | Size |
|---|---|---|
| [slices-1.md](slices-1.md) | S01 to S07 (7 slices) | about 175 KB |
| [slices-2.md](slices-2.md) | S08 to S17 (10 slices) | about 195 KB |
| [slices-3.md](slices-3.md) | S18 to S30 (13 slices) | about 206 KB |
| [slices-4.md](slices-4.md) | S31 to S42 (12 slices) | about 202 KB |
| [slices-5.md](slices-5.md) | S43 to S54 (12 slices) | about 207 KB |
| [slices-6.md](slices-6.md) | S55 to S68 (14 slices) | about 196 KB |

| Slice | Title | Document |
|---|---|---|
| S01 | Foundation 1: engine, live target resolution, page registry, eligibility and copy loading | [slices-1.md](slices-1.md#s01) |
| S02 | Foundation 2: spotlight, popover, focus and keyboard, and the running host | [slices-1.md](slices-1.md#s02) |
| S03 | Foundation 3: launcher and panel, shared-component annotations, shared guidance and the shell guide | [slices-1.md](slices-1.md#s03) |
| S04 | Foundation 4: nested layers, read-only enforcement and Explain a control | [slices-1.md](slices-1.md#s04) |
| S05 | Clients list: complete tour | [slices-1.md](slices-1.md#s05) |
| S06 | Client form (create and edit): complete tour | [slices-1.md](slices-1.md#s06) |
| S07 | Follow-ups: complete tour | [slices-1.md](slices-1.md#s07) |
| S08 | Calendar (appointments, follow-ups, contract dates): complete tour | [slices-2.md](slices-2.md#s08) |
| S09 | Client detail: complete tour | [slices-2.md](slices-2.md#s09) |
| S10 | Pricing screen (offer builder): complete tour | [slices-2.md](slices-2.md#s10) |
| S11 | Discount approvals: complete tour | [slices-2.md](slices-2.md#s11) |
| S12 | Offers list: complete tour | [slices-2.md](slices-2.md#s12) |
| S13 | Deal form (create and edit): complete tour | [slices-2.md](slices-2.md#s13) |
| S14 | Deal detail: complete tour | [slices-2.md](slices-2.md#s14) |
| S15 | Pipeline board: complete tour | [slices-2.md](slices-2.md#s15) |
| S16 | Pipeline list: complete tour | [slices-2.md](slices-2.md#s16) |
| S17 | Quotations list (legacy workflow): complete tour | [slices-2.md](slices-2.md#s17) |
| S18 | Quotation form (create and edit): complete tour | [slices-3.md](slices-3.md#s18) |
| S19 | Quotation detail: complete tour | [slices-3.md](slices-3.md#s19) |
| S20 | Invoices list: complete tour | [slices-3.md](slices-3.md#s20) |
| S21 | Invoice detail: complete tour | [slices-3.md](slices-3.md#s21) |
| S22 | Contracts list: complete tour | [slices-3.md](slices-3.md#s22) |
| S23 | Contract form (create and edit): complete tour | [slices-3.md](slices-3.md#s23) |
| S24 | Contract detail: complete tour | [slices-3.md](slices-3.md#s24) |
| S25 | Payments overview: complete tour | [slices-3.md](slices-3.md#s25) |
| S26 | Renewals: complete tour | [slices-3.md](slices-3.md#s26) |
| S27 | Performance: complete tour | [slices-3.md](slices-3.md#s27) |
| S28 | Members list: complete tour | [slices-3.md](slices-3.md#s28) |
| S29 | Member form (register and edit): complete tour | [slices-3.md](slices-3.md#s29) |
| S30 | Member detail: complete tour | [slices-3.md](slices-3.md#s30) |
| S31 | Membership payments: complete tour | [slices-4.md](slices-4.md#s31) |
| S32 | Membership reports: complete tour | [slices-4.md](slices-4.md#s32) |
| S33 | Verify member (Reception): complete tour | [slices-4.md](slices-4.md#s33) |
| S34 | Employee upload: complete tour | [slices-4.md](slices-4.md#s34) |
| S35 | VIP requests: complete tour | [slices-4.md](slices-4.md#s35) |
| S36 | Settings: Company: complete tour | [slices-4.md](slices-4.md#s36) |
| S37 | Settings: My profile: complete tour | [slices-4.md](slices-4.md#s37) |
| S38 | Settings: Team: complete tour | [slices-4.md](slices-4.md#s38) |
| S39 | Settings: Roles and permissions: complete tour | [slices-4.md](slices-4.md#s39) |
| S40 | Settings: Lists: complete tour | [slices-4.md](slices-4.md#s40) |
| S41 | Settings: Sales script: complete tour | [slices-4.md](slices-4.md#s41) |
| S42 | Settings: Pricing: complete tour | [slices-4.md](slices-4.md#s42) |
| S43 | Settings: Statuses: complete tour | [slices-5.md](slices-5.md#s43) |
| S44 | Settings: Wellness+: complete tour | [slices-5.md](slices-5.md#s44) |
| S45 | Settings: Contracts and payments: complete tour | [slices-5.md](slices-5.md#s45) |
| S46 | Settings: Audit log: complete tour | [slices-5.md](slices-5.md#s46) |
| S47 | Settings: Integrations: complete tour | [slices-5.md](slices-5.md#s47) |
| S48 | Settings: Client management: complete tour | [slices-5.md](slices-5.md#s48) |
| S49 | Settings: Notifications: complete tour | [slices-5.md](slices-5.md#s49) |
| S50 | Settings: Warehouses: complete tour | [slices-5.md](slices-5.md#s50) |
| S51 | Settings: Categories: complete tour | [slices-5.md](slices-5.md#s51) |
| S52 | Form submissions: complete tour | [slices-5.md](slices-5.md#s52) |
| S53 | Form builder: complete tour | [slices-5.md](slices-5.md#s53) |
| S54 | Dashboard: Sales User: complete tour | [slices-5.md](slices-5.md#s54) |
| S55 | Dashboard: Sales Manager: complete tour | [slices-6.md](slices-6.md#s55) |
| S56 | Dashboard: Administrator: complete tour | [slices-6.md](slices-6.md#s56) |
| S57 | Dashboard: CEO: complete tour | [slices-6.md](slices-6.md#s57) |
| S58 | Dashboard: Business owner (fallback): complete tour | [slices-6.md](slices-6.md#s58) |
| S59 | Dashboard: Staff (fallback): complete tour | [slices-6.md](slices-6.md#s59) |
| S60 | Notifications: complete tour | [slices-6.md](slices-6.md#s60) |
| S61 | Reports: complete tour | [slices-6.md](slices-6.md#s61) |
| S62 | Inventory list: complete tour | [slices-6.md](slices-6.md#s62) |
| S63 | Product form (create and edit): complete tour | [slices-6.md](slices-6.md#s63) |
| S64 | Platform: Tenants: complete tour | [slices-6.md](slices-6.md#s64) |
| S65 | Platform: People: complete tour | [slices-6.md](slices-6.md#s65) |
| S66 | Platform: Settings: complete tour | [slices-6.md](slices-6.md#s66) |
| S67 | Platform: My profile: complete tour | [slices-6.md](slices-6.md#s67) |
| S68 | Platform dashboard (Super Admin): complete tour | [slices-6.md](slices-6.md#s68) |

### 6.0 Slice index, sizes and exceptions

The slice target is about **1,000 lines of production code**. Production LOC are estimates (assumptions A1 and A3), not measurements. Bands: **in** 800 to 1,200; **near** 600 to 799; **short** under 600 (documented exception). No slice exceeds 1,200.

| Slice | Title | Kind | Est. LOC | Band | Steps |
|---|---|---|---|---|---|
| [S01](slices-1.md#s01) | Foundation 1: engine, live target resolution, page registry, eligibility and copy loading | infra | 1010 | in | - |
| [S02](slices-1.md#s02) | Foundation 2: spotlight, popover, focus and keyboard, and the running host | infra | 1010 | in | - |
| [S03](slices-1.md#s03) | Foundation 3: launcher and panel, shared-component annotations, shared guidance and the shell guide | infra | 955 | in | - |
| [S04](slices-1.md#s04) | Foundation 4: nested layers, read-only enforcement and Explain a control | infra | 890 | in | - |
| [S05](slices-1.md#s05) | Clients list: complete tour | Clients list | 416 | short | 38 |
| [S06](slices-1.md#s06) | Client form (create and edit): complete tour | Client form (create and edit) | 212 | short | 18 |
| [S07](slices-1.md#s07) | Follow-ups: complete tour | Follow-ups | 202 | short | 18 |
| [S08](slices-2.md#s08) | Calendar (appointments, follow-ups, contract dates): complete tour | Calendar (appointments, follow-ups, contract dates) | 522 | short | 48 |
| [S09](slices-2.md#s09) | Client detail: complete tour | Client detail | 630 | near | 56 |
| [S10](slices-2.md#s10) | Pricing screen (offer builder): complete tour | Pricing screen (offer builder) | 214 | short | 19 |
| [S11](slices-2.md#s11) | Discount approvals: complete tour | Discount approvals | 140 | short | 12 |
| [S12](slices-2.md#s12) | Offers list: complete tour | Offers list | 172 | short | 16 |
| [S13](slices-2.md#s13) | Deal form (create and edit): complete tour | Deal form (create and edit) | 154 | short | 14 |
| [S14](slices-2.md#s14) | Deal detail: complete tour | Deal detail | 658 | near | 63 |
| [S15](slices-2.md#s15) | Pipeline board: complete tour | Pipeline board | 198 | short | 18 |
| [S16](slices-2.md#s16) | Pipeline list: complete tour | Pipeline list | 232 | short | 22 |
| [S17](slices-2.md#s17) | Quotations list (legacy workflow): complete tour | Quotations list (legacy workflow) | 144 | short | 13 |
| [S18](slices-3.md#s18) | Quotation form (create and edit): complete tour | Quotation form (create and edit) | 154 | short | 14 |
| [S19](slices-3.md#s19) | Quotation detail: complete tour | Quotation detail | 164 | short | 15 |
| [S20](slices-3.md#s20) | Invoices list: complete tour | Invoices list | 134 | short | 12 |
| [S21](slices-3.md#s21) | Invoice detail: complete tour | Invoice detail | 104 | short | 9 |
| [S22](slices-3.md#s22) | Contracts list: complete tour | Contracts list | 172 | short | 16 |
| [S23](slices-3.md#s23) | Contract form (create and edit): complete tour | Contract form (create and edit) | 134 | short | 12 |
| [S24](slices-3.md#s24) | Contract detail: complete tour | Contract detail | 568 | short | 53 |
| [S25](slices-3.md#s25) | Payments overview: complete tour | Payments overview | 198 | short | 18 |
| [S26](slices-3.md#s26) | Renewals: complete tour | Renewals | 212 | short | 20 |
| [S27](slices-3.md#s27) | Performance: complete tour | Performance | 290 | short | 28 |
| [S28](slices-3.md#s28) | Members list: complete tour | Members list | 232 | short | 22 |
| [S29](slices-3.md#s29) | Member form (register and edit): complete tour | Member form (register and edit) | 192 | short | 18 |
| [S30](slices-3.md#s30) | Member detail: complete tour | Member detail | 1000 | in | 97 |
| [S31](slices-4.md#s31) | Membership payments: complete tour | Membership payments | 182 | short | 17 |
| [S32](slices-4.md#s32) | Membership reports: complete tour | Membership reports | 190 | short | 17 |
| [S33](slices-4.md#s33) | Verify member (Reception): complete tour | Verify member (Reception) | 144 | short | 13 |
| [S34](slices-4.md#s34) | Employee upload: complete tour | Employee upload | 230 | short | 21 |
| [S35](slices-4.md#s35) | VIP requests: complete tour | VIP requests | 164 | short | 15 |
| [S36](slices-4.md#s36) | Settings: Company: complete tour | Settings: Company | 186 | short | 16 |
| [S37](slices-4.md#s37) | Settings: My profile: complete tour | Settings: My profile | 164 | short | 15 |
| [S38](slices-4.md#s38) | Settings: Team: complete tour | Settings: Team | 220 | short | 20 |
| [S39](slices-4.md#s39) | Settings: Roles and permissions: complete tour | Settings: Roles and permissions | 222 | short | 20 |
| [S40](slices-4.md#s40) | Settings: Lists: complete tour | Settings: Lists | 294 | short | 26 |
| [S41](slices-4.md#s41) | Settings: Sales script: complete tour | Settings: Sales script | 182 | short | 17 |
| [S42](slices-4.md#s42) | Settings: Pricing: complete tour | Settings: Pricing | 512 | short | 50 |
| [S43](slices-5.md#s43) | Settings: Statuses: complete tour | Settings: Statuses | 154 | short | 14 |
| [S44](slices-5.md#s44) | Settings: Wellness+: complete tour | Settings: Wellness+ | 242 | short | 23 |
| [S45](slices-5.md#s45) | Settings: Contracts and payments: complete tour | Settings: Contracts and payments | 84 | short | 7 |
| [S46](slices-5.md#s46) | Settings: Audit log: complete tour | Settings: Audit log | 182 | short | 17 |
| [S47](slices-5.md#s47) | Settings: Integrations: complete tour | Settings: Integrations | 114 | short | 10 |
| [S48](slices-5.md#s48) | Settings: Client management: complete tour | Settings: Client management | 426 | short | 41 |
| [S49](slices-5.md#s49) | Settings: Notifications: complete tour | Settings: Notifications | 144 | short | 13 |
| [S50](slices-5.md#s50) | Settings: Warehouses: complete tour | Settings: Warehouses | 134 | short | 12 |
| [S51](slices-5.md#s51) | Settings: Categories: complete tour | Settings: Categories | 154 | short | 14 |
| [S52](slices-5.md#s52) | Form submissions: complete tour | Form submissions | 124 | short | 11 |
| [S53](slices-5.md#s53) | Form builder: complete tour | Form builder | 783 | near | 71 |
| [S54](slices-5.md#s54) | Dashboard: Sales User: complete tour | Dashboard: Sales User | 190 | short | 16 |
| [S55](slices-6.md#s55) | Dashboard: Sales Manager: complete tour | Dashboard: Sales Manager | 118 | short | 9 |
| [S56](slices-6.md#s56) | Dashboard: Administrator: complete tour | Dashboard: Administrator | 104 | short | 9 |
| [S57](slices-6.md#s57) | Dashboard: CEO: complete tour | Dashboard: CEO | 124 | short | 11 |
| [S58](slices-6.md#s58) | Dashboard: Business owner (fallback): complete tour | Dashboard: Business owner (fallback) | 114 | short | 10 |
| [S59](slices-6.md#s59) | Dashboard: Staff (fallback): complete tour | Dashboard: Staff (fallback) | 134 | short | 12 |
| [S60](slices-6.md#s60) | Notifications: complete tour | Notifications | 94 | short | 8 |
| [S61](slices-6.md#s61) | Reports: complete tour | Reports | 172 | short | 16 |
| [S62](slices-6.md#s62) | Inventory list: complete tour | Inventory list | 378 | short | 36 |
| [S63](slices-6.md#s63) | Product form (create and edit): complete tour | Product form (create and edit) | 298 | short | 28 |
| [S64](slices-6.md#s64) | Platform: Tenants: complete tour | Platform: Tenants | 202 | short | 18 |
| [S65](slices-6.md#s65) | Platform: People: complete tour | Platform: People | 292 | short | 27 |
| [S66](slices-6.md#s66) | Platform: Settings: complete tour | Platform: Settings | 192 | short | 18 |
| [S67](slices-6.md#s67) | Platform: My profile: complete tour | Platform: My profile | 144 | short | 13 |
| [S68](slices-6.md#s68) | Platform dashboard (Super Admin): complete tour | Platform dashboard (Super Admin) | 110 | short | 9 |

**Distribution.** Infrastructure (4 slices, 16 parts): 4 in band, 0 near, 0 short. Page-tour slices (64, one per page): 1 in band, 3 near, 60 short. Total estimated production code: about 19,210 lines.

**Exception E1: short page slices.** A single page needs between about 100 and 1,000 lines of tour code (8 per step plus annotations), and the rules forbid combining two pages in one slice and forbid padding. Pages with few controls therefore fall below the band even though each already holds *all* of its page's work in one slice. The largest pages reach it (see the index).

| Slice | Page | Est. LOC | Steps |
|---|---|---|---|
| [S05](slices-1.md#s05) | Clients list | 416 | 38 |
| [S06](slices-1.md#s06) | Client form (create and edit) | 212 | 18 |
| [S07](slices-1.md#s07) | Follow-ups | 202 | 18 |
| [S08](slices-2.md#s08) | Calendar (appointments, follow-ups, contract dates) | 522 | 48 |
| [S10](slices-2.md#s10) | Pricing screen (offer builder) | 214 | 19 |
| [S11](slices-2.md#s11) | Discount approvals | 140 | 12 |
| [S12](slices-2.md#s12) | Offers list | 172 | 16 |
| [S13](slices-2.md#s13) | Deal form (create and edit) | 154 | 14 |
| [S15](slices-2.md#s15) | Pipeline board | 198 | 18 |
| [S16](slices-2.md#s16) | Pipeline list | 232 | 22 |
| [S17](slices-2.md#s17) | Quotations list (legacy workflow) | 144 | 13 |
| [S18](slices-3.md#s18) | Quotation form (create and edit) | 154 | 14 |
| [S19](slices-3.md#s19) | Quotation detail | 164 | 15 |
| [S20](slices-3.md#s20) | Invoices list | 134 | 12 |
| [S21](slices-3.md#s21) | Invoice detail | 104 | 9 |
| [S22](slices-3.md#s22) | Contracts list | 172 | 16 |
| [S23](slices-3.md#s23) | Contract form (create and edit) | 134 | 12 |
| [S24](slices-3.md#s24) | Contract detail | 568 | 53 |
| [S25](slices-3.md#s25) | Payments overview | 198 | 18 |
| [S26](slices-3.md#s26) | Renewals | 212 | 20 |
| [S27](slices-3.md#s27) | Performance | 290 | 28 |
| [S28](slices-3.md#s28) | Members list | 232 | 22 |
| [S29](slices-3.md#s29) | Member form (register and edit) | 192 | 18 |
| [S31](slices-4.md#s31) | Membership payments | 182 | 17 |
| [S32](slices-4.md#s32) | Membership reports | 190 | 17 |
| [S33](slices-4.md#s33) | Verify member (Reception) | 144 | 13 |
| [S34](slices-4.md#s34) | Employee upload | 230 | 21 |
| [S35](slices-4.md#s35) | VIP requests | 164 | 15 |
| [S36](slices-4.md#s36) | Settings: Company | 186 | 16 |
| [S37](slices-4.md#s37) | Settings: My profile | 164 | 15 |
| [S38](slices-4.md#s38) | Settings: Team | 220 | 20 |
| [S39](slices-4.md#s39) | Settings: Roles and permissions | 222 | 20 |
| [S40](slices-4.md#s40) | Settings: Lists | 294 | 26 |
| [S41](slices-4.md#s41) | Settings: Sales script | 182 | 17 |
| [S42](slices-4.md#s42) | Settings: Pricing | 512 | 50 |
| [S43](slices-5.md#s43) | Settings: Statuses | 154 | 14 |
| [S44](slices-5.md#s44) | Settings: Wellness+ | 242 | 23 |
| [S45](slices-5.md#s45) | Settings: Contracts and payments | 84 | 7 |
| [S46](slices-5.md#s46) | Settings: Audit log | 182 | 17 |
| [S47](slices-5.md#s47) | Settings: Integrations | 114 | 10 |
| [S48](slices-5.md#s48) | Settings: Client management | 426 | 41 |
| [S49](slices-5.md#s49) | Settings: Notifications | 144 | 13 |
| [S50](slices-5.md#s50) | Settings: Warehouses | 134 | 12 |
| [S51](slices-5.md#s51) | Settings: Categories | 154 | 14 |
| [S52](slices-5.md#s52) | Form submissions | 124 | 11 |
| [S54](slices-5.md#s54) | Dashboard: Sales User | 190 | 16 |
| [S55](slices-6.md#s55) | Dashboard: Sales Manager | 118 | 9 |
| [S56](slices-6.md#s56) | Dashboard: Administrator | 104 | 9 |
| [S57](slices-6.md#s57) | Dashboard: CEO | 124 | 11 |
| [S58](slices-6.md#s58) | Dashboard: Business owner (fallback) | 114 | 10 |
| [S59](slices-6.md#s59) | Dashboard: Staff (fallback) | 134 | 12 |
| [S60](slices-6.md#s60) | Notifications | 94 | 8 |
| [S61](slices-6.md#s61) | Reports | 172 | 16 |
| [S62](slices-6.md#s62) | Inventory list | 378 | 36 |
| [S63](slices-6.md#s63) | Product form (create and edit) | 298 | 28 |
| [S64](slices-6.md#s64) | Platform: Tenants | 202 | 18 |
| [S65](slices-6.md#s65) | Platform: People | 292 | 27 |
| [S66](slices-6.md#s66) | Platform: Settings | 192 | 18 |
| [S67](slices-6.md#s67) | Platform: My profile | 144 | 13 |
| [S68](slices-6.md#s68) | Platform dashboard (Super Admin) | 110 | 9 |

### 6.0a Build sheet: what each slice does and which files it touches

Imperative summary per slice. **Create** = new files, **Modify** = existing files edited, **Read** = existing files only read, **Also** = copy, tests and wiring. Paths are relative to `frontend/`. Test files are listed under Create because they are written first.

**S01. Build the pure tour state machine, the live target resolver, the page registry with its route-coverage test, and the eligibility, progress-storage and lazy-copy modules.**
- Create: `src/lib/support/types.ts`, `src/lib/support/tourMachine.ts`, `src/lib/support/tourMachine.test.ts`, `src/lib/support/targetResolver.ts`, `src/lib/support/domObserverHub.ts`, `src/lib/support/useTargetElement.ts`, `src/lib/support/targetResolver.test.tsx`, `src/lib/support/useTargetElement.test.tsx`, `src/store/useSupportStore.ts`, `src/lib/support/routeMap.ts`, `src/lib/support/pageRegistry.ts`, `src/lib/support/useSupportPage.ts`, `src/lib/support/routeMap.test.ts`, `src/store/useSupportStore.test.ts`, `src/lib/support/stepEligibility.ts`, `src/lib/support/progressStorage.ts`, `src/lib/support/supportCopy.ts`, `src/lib/support/stepEligibility.test.ts`, `src/lib/support/progressStorage.test.ts`, `src/lib/support/supportCopy.test.ts`
- Modify: `src/i18n/config.ts` (NAMESPACES list)
- Read: `src/setupTests.ts`, `src/routes/index.tsx`, `src/store/useAuthStore.ts`, `scripts/check-translations.mjs`
- Also: Write the failing tests first, run them, then implement (full task order in item 8 of the slice).
- Details: [S01](slices-1.md#s01)

**S02. Build the spotlight overlay, the explanation card, focus and keyboard handling, and the host that runs a tour and mounts in the tenant and Super Admin shells.**
- Create: `src/components/support/SpotlightMask.tsx`, `src/components/support/SpotlightMask.module.css`, `src/lib/support/useTargetRect.ts`, `src/components/support/SpotlightMask.test.tsx`, `src/components/support/SpotlightMask.stories.tsx`, `src/components/support/TourPopover.tsx`, `src/components/support/TourPopover.module.css`, `src/lib/support/popoverPlacement.ts`, `src/components/support/TourPopover.test.tsx`, `src/lib/support/popoverPlacement.test.ts`, `src/components/support/TourPopover.stories.tsx`, `src/lib/support/useTourFocus.ts`, `src/lib/support/useTourKeyboard.ts`, `src/components/support/LiveAnnouncer.tsx`, `src/lib/support/describeTarget.ts`, `src/lib/support/useTourFocus.test.tsx`, `src/lib/support/useTourKeyboard.test.tsx`, `src/lib/support/describeTarget.test.ts`, `src/components/support/SupportHost.tsx`, `src/lib/support/useTourSession.ts`, `src/lib/support/scrollTargetIntoView.ts`, `src/components/support/SupportHost.test.tsx`, `src/lib/support/useTourSession.test.tsx`
- Modify: `src/styles/tokens.css` (add `--z-tour`; `--z-tooltip` is 100 and the impersonation banner is a literal 1000, so the token must exceed 1000), `src/components/ui/Button/Button.tsx` (reuse as-is), `src/routes/TenantGuard.tsx`, `src/pages/shell/SuperAdminShell.tsx`, `src/components/panels/SalesScriptPanel/SalesScriptPanel.tsx` (pattern reference)
- Read: `src/components/ui/DropdownMenu/DropdownMenu.tsx`, `src/components/ui/Modal/Modal.tsx`, `src/components/ui/SlideOver/SlideOver.tsx`
- Also: Write the failing tests first, run them, then implement (full task order in item 8 of the slice).
- Details: [S02](slices-1.md#s02)

**S03. Replace the dead Support entry points with a working launcher and panel, add `tourId` props to shared components, write the shared guidance library, and annotate and guide the app shell.**
- Create: `src/components/support/SupportLauncher.tsx`, `src/components/support/SupportPanel.tsx`, `src/components/support/SupportPanel.module.css`, `src/locales/en/support.json`, `src/locales/sq/support.json`, `tests/e2e/support.spec.ts`, `src/components/support/SupportPanel.test.tsx`, `src/lib/support/tourProps.ts`, `src/lib/support/tourProps.test.ts`, `src/lib/support/sharedGuidance.ts`, `src/lib/support/defineGuide.ts`, `src/lib/support/guideLint.ts`, `src/lib/support/stepFactories.ts`, `src/lib/support/sharedGuidance.test.ts`, `src/lib/support/guideLint.test.ts`, `src/lib/support/layoutAdapters.ts`, `src/lib/support/guides/shell.ts`, `src/lib/support/guides/shell.test.tsx`
- Modify: `src/components/layout/AppLayout/AppLayout.tsx` (header help button), `src/components/layout/Sidebar/Sidebar.tsx` (bottom "Support" link), `src/locales/en/common.json` (`header.help`, `actions.support` already exist), `src/i18n/config.ts` (add `support` namespace name), `playwright.config.ts`, `tests/e2e/mobile360.spec.ts`, `src/components/ui/DataTable/DataTable.tsx`, `src/components/ui/Tabs/Tabs.tsx`, `src/components/ui/Pagination/*`, `src/components/ui/DropdownMenu/DropdownMenu.tsx`, `src/components/ui/Modal/Modal.tsx`, `src/components/ui/SlideOver/SlideOver.tsx`, `src/components/ui/ConfirmDialog/ConfirmDialog.tsx`, `src/components/ui/Card/*`, `src/components/ui/KPICard/*`, `src/components/ui/TextInput/TextInput.tsx`, `src/components/ui/SelectInput/SelectInput.tsx`, `src/locales/en/support.json` and sq/support.json (shared keys), `src/components/layout/AppLayout/AppLayout.tsx`, `src/components/layout/Sidebar/Sidebar.tsx`, `src/components/notifications/NotificationBell.tsx`, `src/components/salesScript/SalesScriptButton.tsx`, `src/components/ui/ThemeToggle`
- Read: `src/hooks/useNavigation.ts`
- Also: Write the failing tests first, run them, then implement (full task order in item 8 of the slice).
- Details: [S03](slices-1.md#s03)

**S04. Add nested-layer guidance, block clicks and submits on explained controls, and add Explain a control with a list and a point-and-ask mode.**
- Create: `src/lib/support/layerStack.ts`, `src/lib/support/useLayerWatcher.ts`, `src/lib/support/layerStack.test.ts`, `src/lib/support/nestedGuide.test.tsx`, `src/lib/support/interactionGuard.ts`, `src/lib/support/interactionGuard.test.tsx`, `tests/e2e/support/noMutations.ts`, `src/lib/support/useExplainableControls.ts`, `src/components/support/ControlList.tsx`, `src/components/support/ControlList.module.css`, `src/components/support/ControlList.test.tsx`, `src/lib/support/useExplainableControls.test.tsx`, `src/lib/support/usePickMode.ts`, `src/components/support/PickBanner.tsx`, `src/lib/support/usePickMode.test.tsx`, `src/components/support/PickBanner.test.tsx`
- Modify: `src/lib/support/useTourSession.ts` (extends), `src/components/ui/DropdownMenu/DropdownMenu.tsx` (menu is portalled to `body`; closes on outside click), `src/components/ui/Modal/Modal.tsx, SlideOver.tsx, ConfirmDialog.tsx`, `src/lib/support/useTourSession.ts` (installs the guard), `src/components/support/SupportPanel.tsx`, `src/lib/support/tourMachine.ts` (add the single-step mode)
- Also: Write the failing tests first, run them, then implement (full task order in item 8 of the slice).
- Details: [S04](slices-1.md#s04)

**S05. Tour the Clients list header, search and filters (pilot). Tour the Clients list loading, error and empty states, repeated rows, row menu, and the archive and restore flow.**
- Create: `src/lib/support/guides/clientsList.ts`, `src/lib/support/guides/clientsList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/clients/ClientListContent.tsx`, `src/components/clients/ExcelImportButton`, `src/pages/clients/ClientListContent.tsx` (row, menu, empty branches, dialog), `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (38 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Read: `src/hooks/useClients.ts`, `src/locales/en/clients.json`
- Also: Remove `'clients.list'` from `PLANNED_PAGES`. Annotate about 34 elements with `tourProps('clients.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S05](slices-1.md#s05)

**S06. Tour the client create and edit form, including the tenant-built form, contacts, first-deal option, notes and save bar.**
- Create: `src/lib/support/guides/clientsForm.ts`, `src/lib/support/guides/clientsForm.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/clients/ClientFormContent.tsx`, `src/pages/clients/ContactPersonsEditor.tsx`, `src/components/forms/FormRenderer`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'clients.form'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('clients.form.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S06](slices-1.md#s06)

**S07. Tour the Follow-ups tabs, filters, list, and complete, reschedule, cancel and reassign actions.**
- Create: `src/lib/support/guides/followUps.ts`, `src/lib/support/guides/followUps.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/followUps/FollowUpsContent.tsx`, `src/components/followUps/FollowUpList.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpActionModals.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'followUps'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('followUps.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S07](slices-1.md#s07)

**S08. Tour the Calendar toolbar, views, team filter, overdue section and its empty and error states. Tour calendar items, the detail panel, the Plan activity dialog and rescheduling.**
- Create: `src/lib/support/guides/appointments.ts`, `src/lib/support/guides/appointments.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/appointments/CalendarContent.tsx`, `src/components/calendar/CalendarToolbar.tsx`, `src/components/calendar/CalendarMonthView.tsx`, `src/components/calendar/CalendarTimeGrid.tsx`, `src/components/calendar/CalendarAgenda.tsx`, `src/components/calendar/CalendarChip.tsx`, `src/components/calendar/ContractDateChip.tsx`, `src/components/calendar/TeamFilter.tsx`, `src/components/calendar/OverdueSection.tsx`, `src/components/panels/AppointmentDetailPanel/AppointmentDetailPanel.tsx`, `src/components/calendar/PlanActivityDialog.tsx`, `src/components/calendar/RescheduleItemDialog.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (48 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'appointments'` from `PLANNED_PAGES`. Annotate about 43 elements with `tourProps('appointments.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S08](slices-2.md#s08)

**S09. Tour the client detail header, action bar, summary, custom fields and follow-ups panel. Tour the client timeline, activity logging and the Appointments tab. Tour the client Deals and Wellness+ tabs.**
- Create: `src/lib/support/guides/clientsDetail.ts`, `src/lib/support/guides/clientsDetail.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/clients/ClientDetailContent.tsx`, `src/components/followUps/FollowUpsPanel.tsx`, `src/components/followUps/FollowUpQuickButtons.tsx`, `src/components/followUps/FollowUpList.tsx`, `src/components/clients/CompanyTimeline.tsx`, `src/components/activities/ActivityDialog.tsx`, `src/components/clients/ClientContractsTab.tsx`, `src/components/clients/ClientDealsTab.tsx`, `src/pages/membership/CompanyWellnessTab.tsx`, `src/pages/membership/MemberBadges.tsx`, `src/pages/membership/RemoveFromCompanyDialog.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (56 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'clients.detail'` from `PLANNED_PAGES`. Annotate about 50 elements with `tourProps('clients.detail.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S09](slices-2.md#s09)

**S10. Tour the pricing screen: inputs, price breakdown, warnings and save.**
- Create: `src/lib/support/guides/pricingOffer.ts`, `src/lib/support/guides/pricingOffer.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/pricing/PricingContent.tsx`, `src/pages/pricing/pricingScreenError.ts`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (19 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'pricing.offer'` from `PLANNED_PAGES`. Annotate about 17 elements with `tourProps('pricing.offer.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S10](slices-2.md#s10)

**S11. Tour the Discount approvals queue.**
- Create: `src/lib/support/guides/approvals.ts`, `src/lib/support/guides/approvals.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/approvals/ApprovalsContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (12 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'approvals'` from `PLANNED_PAGES`. Annotate about 11 elements with `tourProps('approvals.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S11](slices-2.md#s11)

**S12. Tour the Offers list search, status chips, filters and table.**
- Create: `src/lib/support/guides/offers.ts`, `src/lib/support/guides/offers.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/offers/OfferListContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (16 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'offers'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('offers.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S12](slices-2.md#s12)

**S13. Tour the deal create and edit form.**
- Create: `src/lib/support/guides/dealsForm.ts`, `src/lib/support/guides/dealsForm.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/deals/DealFormContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (14 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'deals.form'` from `PLANNED_PAGES`. Annotate about 13 elements with `tourProps('deals.form.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S13](slices-2.md#s13)

**S14. Tour the deal detail header, stage, history, activities and follow-ups panel. Tour the deal offers section and the per-offer action bar. Tour the win, lose, reopen, reassign and delete dialogs.**
- Create: `src/lib/support/guides/dealsDetail.ts`, `src/lib/support/guides/dealsDetail.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/deals/DealDetailContent.tsx`, `src/pages/deals/DealOffersSection.tsx`, `src/components/offers/OfferActions.tsx`, `src/pages/deals/DealActivitiesSection.tsx`, `src/components/activities/ActivityDetails.tsx`, `src/components/activities/useCanEditActivity.ts`, `src/pages/deals/DealClosingModals.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (63 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'deals.detail'` from `PLANNED_PAGES`. Annotate about 57 elements with `tourProps('deals.detail.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S14](slices-2.md#s14)

**S15. Tour the pipeline board columns, cards, move menu and load more.**
- Create: `src/lib/support/guides/pipelineBoard.ts`, `src/lib/support/guides/pipelineBoard.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/deals/PipelineBoardContent.tsx`, `src/pages/deals/PipelineViewSwitch.tsx`, `src/pages/deals/DealMarkers.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'pipeline.board'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('pipeline.board.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S15](slices-2.md#s15)

**S16. Tour the pipeline list filters, table and pagination.**
- Create: `src/lib/support/guides/pipelineList.ts`, `src/lib/support/guides/pipelineList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/deals/DealListContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (22 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'pipeline.list'` from `PLANNED_PAGES`. Annotate about 20 elements with `tourProps('pipeline.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S16](slices-2.md#s16)

**S17. Tour the legacy Quotations list.**
- Create: `src/lib/support/guides/quotationsList.ts`, `src/lib/support/guides/quotationsList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/quotations/QuotationListContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (13 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'quotations.list'` from `PLANNED_PAGES`. Annotate about 12 elements with `tourProps('quotations.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S17](slices-2.md#s17)

**S18. Tour the quotation form and its line items.**
- Create: `src/lib/support/guides/quotationsForm.ts`, `src/lib/support/guides/quotationsForm.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/quotations/QuotationFormContent.tsx`, `src/pages/quotations/CreateQuotation.tsx`, `src/pages/quotations/EditQuotation.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (14 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'quotations.form'` from `PLANNED_PAGES`. Annotate about 13 elements with `tourProps('quotations.form.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S18](slices-3.md#s18)

**S19. Tour the quotation detail and its status buttons.**
- Create: `src/lib/support/guides/quotationsDetail.ts`, `src/lib/support/guides/quotationsDetail.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/quotations/QuotationDetailContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (15 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'quotations.detail'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('quotations.detail.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S19](slices-3.md#s19)

**S20. Tour the Invoices list.**
- Create: `src/lib/support/guides/invoicesList.ts`, `src/lib/support/guides/invoicesList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/invoices/InvoiceListContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (12 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'invoices.list'` from `PLANNED_PAGES`. Annotate about 11 elements with `tourProps('invoices.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S20](slices-3.md#s20)

**S21. Tour the invoice detail actions.**
- Create: `src/lib/support/guides/invoicesDetail.ts`, `src/lib/support/guides/invoicesDetail.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/invoices/InvoiceDetailContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (9 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'invoices.detail'` from `PLANNED_PAGES`. Annotate about 8 elements with `tourProps('invoices.detail.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S21](slices-3.md#s21)

**S22. Tour the Contracts list filters and row menu.**
- Create: `src/lib/support/guides/contractsList.ts`, `src/lib/support/guides/contractsList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/contracts/ContractListContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (16 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'contracts.list'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('contracts.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S22](slices-3.md#s22)

**S23. Tour the contract form.**
- Create: `src/lib/support/guides/contractsForm.ts`, `src/lib/support/guides/contractsForm.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/contracts/ContractFormContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (12 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'contracts.form'` from `PLANNED_PAGES`. Annotate about 11 elements with `tourProps('contracts.form.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S23](slices-3.md#s23)

**S24. Tour contract lifecycle actions, terms, documents, notes, history and the reason dialogs. Tour the contract instalment schedule, its drawer actions and the add-instalment dialog.**
- Create: `src/lib/support/guides/contractsDetail.ts`, `src/lib/support/guides/contractsDetail.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/contracts/ContractDetailContent.tsx`, `src/components/contracts/ContractPaymentsCard.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (53 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'contracts.detail'` from `PLANNED_PAGES`. Annotate about 48 elements with `tourProps('contracts.detail.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S24](slices-3.md#s24)

**S25. Tour the Payments overview filters, totals and export.**
- Create: `src/lib/support/guides/payments.ts`, `src/lib/support/guides/payments.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/payments/PaymentsOverviewContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'payments'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('payments.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S25](slices-3.md#s25)

**S26. Tour Renewals windows, filters, row actions and the not-renewing dialog.**
- Create: `src/lib/support/guides/renewals.ts`, `src/lib/support/guides/renewals.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/renewals/RenewalsContent.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (20 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'renewals'` from `PLANNED_PAGES`. Annotate about 18 elements with `tourProps('renewals.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S26](slices-3.md#s26)

**S27. Tour Performance comparison, filters, export, person detail and records dialog.**
- Create: `src/lib/support/guides/performance.ts`, `src/lib/support/guides/performance.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/performance/PerformanceContent.tsx`, `src/pages/performance/PerformanceDetail.tsx`, `src/pages/performance/PerformanceRecordsDialog.tsx`, `src/locales/en/supportSales.json` and src/locales/sq/supportSales.json (28 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'performance'` from `PLANNED_PAGES`. Annotate about 25 elements with `tourProps('performance.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S27](slices-3.md#s27)

**S28. Tour the Members list.**
- Create: `src/lib/support/guides/membersList.ts`, `src/lib/support/guides/membersList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/MembersContent.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (22 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Read: `src/pages/membership/MemberBadges.tsx`
- Also: Remove `'members.list'` from `PLANNED_PAGES`. Annotate about 20 elements with `tourProps('members.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S28](slices-3.md#s28)

**S29. Tour the member form and its duplicate dialog.**
- Create: `src/lib/support/guides/membersForm.ts`, `src/lib/support/guides/membersForm.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/MemberFormContent.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.form'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('members.form.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S29](slices-3.md#s29)

**S30. Tour the member detail header and the overview, terms, history and note tabs. Tour the member Payments and VIP tabs, receipts, void and the VIP decision. Tour the member Family tab. Tour the record payment, correct tier, remove from company, card and status dialogs.**
- Create: `src/lib/support/guides/membersDetail.ts`, `src/lib/support/guides/membersDetail.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/MemberDetailContent.tsx`, `src/pages/membership/FamilyTab.tsx`, `src/pages/membership/VipTab.tsx`, `src/pages/membership/VipDecisionDialog.tsx`, `src/pages/membership/RecordPaymentModal.tsx`, `src/pages/membership/CorrectTierDialog.tsx`, `src/pages/membership/RemoveFromCompanyDialog.tsx`, `src/pages/membership/MemberCardDialog.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (97 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.detail'` from `PLANNED_PAGES`. Annotate about 87 elements with `tourProps('members.detail.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S30](slices-3.md#s30)

**S31. Tour Membership payments.**
- Create: `src/lib/support/guides/membersPayments.ts`, `src/lib/support/guides/membersPayments.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/MemberPaymentsContent.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (17 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.payments'` from `PLANNED_PAGES`. Annotate about 15 elements with `tourProps('members.payments.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S31](slices-4.md#s31)

**S32. Tour Membership reports.**
- Create: `src/lib/support/guides/membersReports.ts`, `src/lib/support/guides/membersReports.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/reports/MembershipReportsContent.tsx`, `src/pages/membership/reports/reportSections.ts`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (17 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.reports'` from `PLANNED_PAGES`. Annotate about 15 elements with `tourProps('members.reports.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S32](slices-4.md#s32)

**S33. Tour Verify member, the Reception scan and search screen.**
- Create: `src/lib/support/guides/membersVerify.ts`, `src/lib/support/guides/membersVerify.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/verify/VerifyMemberContent.tsx`, `src/pages/membership/verify/QrScanner.tsx`, `src/pages/membership/verify/ReceptionResult.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (13 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.verify'` from `PLANNED_PAGES`. Annotate about 12 elements with `tourProps('members.verify.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S33](slices-4.md#s33)

**S34. Tour Employee upload from file pick through preview to outcome.**
- Create: `src/lib/support/guides/membersEmployeeUpload.ts`, `src/lib/support/guides/membersEmployeeUpload.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/EmployeeUploadContent.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (21 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.employeeUpload'` from `PLANNED_PAGES`. Annotate about 19 elements with `tourProps('members.employeeUpload.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S34](slices-4.md#s34)

**S35. Tour VIP requests.**
- Create: `src/lib/support/guides/membersVipRequests.ts`, `src/lib/support/guides/membersVipRequests.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/membership/VipRequestsContent.tsx`, `src/pages/membership/VipDecisionDialog.tsx`, `src/locales/en/supportMembers.json` and src/locales/sq/supportMembers.json (15 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'members.vipRequests'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('members.vipRequests.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S35](slices-4.md#s35)

**S36. Tour Company settings and the settings side menu.**
- Create: `src/lib/support/guides/settingsCompany.ts`, `src/lib/support/guides/settingsCompany.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/AccountSettingsPage.tsx`, `src/components/settings/LanguagePicker.tsx`, `src/components/layout/SettingsLayout/SettingsLayout.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (16 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.company'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('settings.company.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S36](slices-4.md#s36)

**S37. Tour My profile.**
- Create: `src/lib/support/guides/settingsProfile.ts`, `src/lib/support/guides/settingsProfile.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/profile/ProfilePage.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (15 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.profile'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('settings.profile.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S37](slices-4.md#s37)

**S38. Tour Team settings: invite, edit, deactivate.**
- Create: `src/lib/support/guides/settingsTeam.ts`, `src/lib/support/guides/settingsTeam.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/team/TeamSettingsContent.tsx`, `src/pages/settings/team/InviteMemberModal.tsx`, `src/pages/settings/team/EditMemberModal.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (20 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.team'` from `PLANNED_PAGES`. Annotate about 18 elements with `tourProps('settings.team.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S38](slices-4.md#s38)

**S39. Tour Roles and the permission matrix.**
- Create: `src/lib/support/guides/settingsRoles.ts`, `src/lib/support/guides/settingsRoles.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/roles/RolesSettingsContent.tsx`, `src/pages/settings/roles/RoleNameModal.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (20 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.roles'` from `PLANNED_PAGES`. Annotate about 18 elements with `tourProps('settings.roles.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S39](slices-4.md#s39)

**S40. Tour all seven lookup-list tabs.**
- Create: `src/lib/support/guides/settingsLists.ts`, `src/lib/support/guides/settingsLists.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/lists/ListsSettingsContent.tsx`, `src/components/settings/LookupListEditor`, `src/pages/settings/lists/RiskLevelsList.tsx`, `src/pages/settings/lists/BusinessTypesList.tsx`, `src/pages/settings/lists/AreasList.tsx`, `src/pages/settings/lists/CitiesList.tsx`, `src/pages/settings/lists/FollowUpIntervalsList.tsx`, `src/pages/settings/lists/LostReasonsList.tsx`, `src/pages/settings/lists/ActivityResultsList.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (26 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.lists'` from `PLANNED_PAGES`. Annotate about 23 elements with `tourProps('settings.lists.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S40](slices-4.md#s40)

**S41. Tour the Sales script editor, preview, publish and versions.**
- Create: `src/lib/support/guides/settingsSalesScript.ts`, `src/lib/support/guides/settingsSalesScript.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/salesScript/SalesScriptSettingsContent.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (17 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.salesScript'` from `PLANNED_PAGES`. Annotate about 15 elements with `tourProps('settings.salesScript.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S41](slices-4.md#s41)

**S42. Tour Pricing settings tabs: bands, risk, frequencies, zones and discount cap. Tour Pricing services, packages, offer wording and the test calculator.**
- Create: `src/lib/support/guides/settingsPricing.ts`, `src/lib/support/guides/settingsPricing.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/pricing/PricingSettingsContent.tsx`, `src/pages/settings/pricing/EmployeeBandsPanel.tsx`, `src/pages/settings/pricing/RiskSurchargesPanel.tsx`, `src/pages/settings/pricing/pricingTabs.ts`, `src/pages/settings/pricing/VisitFrequenciesPanel.tsx`, `src/pages/settings/pricing/PriceZonesPanel.tsx`, `src/pages/settings/pricing/DiscountCapPanel.tsx`, `src/pages/settings/pricing/ServicesPanel.tsx`, `src/pages/settings/pricing/PackagesPanel.tsx`, `src/pages/settings/pricing/descriptionColumns.tsx`, `src/pages/settings/pricing/OfferSettingsPanel.tsx`, `src/pages/settings/pricing/TestCalculatorPanel.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (50 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.pricing'` from `PLANNED_PAGES`. Annotate about 45 elements with `tourProps('settings.pricing.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S42](slices-4.md#s42)

**S43. Tour Statuses.**
- Create: `src/lib/support/guides/settingsStatuses.ts`, `src/lib/support/guides/settingsStatuses.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/statuses/StatusesSettingsContent.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (14 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.statuses'` from `PLANNED_PAGES`. Annotate about 13 elements with `tourProps('settings.statuses.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S43](slices-5.md#s43)

**S44. Tour Wellness+ settings.**
- Create: `src/lib/support/guides/settingsWellnessPlus.ts`, `src/lib/support/guides/settingsWellnessPlus.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/wellnessPlus/WellnessPlusSettingsContent.tsx`, `src/pages/settings/wellnessPlus/TiersPanel.tsx`, `src/pages/settings/wellnessPlus/RulesPanel.tsx`, `src/pages/settings/wellnessPlus/RelationshipsPanel.tsx`, `src/pages/settings/wellnessPlus/BenefitsPanel.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (23 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.wellnessPlus'` from `PLANNED_PAGES`. Annotate about 21 elements with `tourProps('settings.wellnessPlus.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S44](slices-5.md#s44)

**S45. Tour Contract and payment settings.**
- Create: `src/lib/support/guides/settingsContracts.ts`, `src/lib/support/guides/settingsContracts.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/contracts/ContractSettingsContent.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (7 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.contracts'` from `PLANNED_PAGES`. Annotate about 6 elements with `tourProps('settings.contracts.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S45](slices-5.md#s45)

**S46. Tour the Audit log.**
- Create: `src/lib/support/guides/settingsAudit.ts`, `src/lib/support/guides/settingsAudit.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/audit/AuditLogContent.tsx`, `src/pages/settings/audit/AuditEntryDetail.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (17 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.audit'` from `PLANNED_PAGES`. Annotate about 15 elements with `tourProps('settings.audit.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S46](slices-5.md#s46)

**S47. Tour Integrations.**
- Create: `src/lib/support/guides/settingsIntegrations.ts`, `src/lib/support/guides/settingsIntegrations.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/IntegrationsPage.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (10 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.integrations'` from `PLANNED_PAGES`. Annotate about 9 elements with `tourProps('settings.integrations.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S47](slices-5.md#s47)

**S48. Tour Client management custom fields. Tour Client management forms: create, template, duplicate, delete.**
- Create: `src/lib/support/guides/settingsClientManagement.ts`, `src/lib/support/guides/settingsClientManagement.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/ClientSettingsContent.tsx`, `src/pages/settings/ClientFormsTab.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (41 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.clientManagement'` from `PLANNED_PAGES`. Annotate about 37 elements with `tourProps('settings.clientManagement.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S48](slices-5.md#s48)

**S49. Tour Notification settings.**
- Create: `src/lib/support/guides/settingsNotifications.ts`, `src/lib/support/guides/settingsNotifications.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/NotificationSettingsPage.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (13 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.notifications'` from `PLANNED_PAGES`. Annotate about 12 elements with `tourProps('settings.notifications.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S49](slices-5.md#s49)

**S50. Tour Warehouses.**
- Create: `src/lib/support/guides/settingsWarehouses.ts`, `src/lib/support/guides/settingsWarehouses.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/inventory/WarehouseList/WarehouseList.tsx`, `src/components/inventory/WarehouseFormModal`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (12 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.warehouses'` from `PLANNED_PAGES`. Annotate about 11 elements with `tourProps('settings.warehouses.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S50](slices-5.md#s50)

**S51. Tour Categories.**
- Create: `src/lib/support/guides/settingsCategories.ts`, `src/lib/support/guides/settingsCategories.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/inventory/CategoryList/CategoryList.tsx`, `src/components/inventory/CategoryFormModal`, `src/components/inventory/DeleteCategoryModal`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (14 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'settings.categories'` from `PLANNED_PAGES`. Annotate about 13 elements with `tourProps('settings.categories.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S51](slices-5.md#s51)

**S52. Tour Form submissions.**
- Create: `src/lib/support/guides/formsSubmissions.ts`, `src/lib/support/guides/formsSubmissions.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/FormSubmissionsContent.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (11 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'forms.submissions'` from `PLANNED_PAGES`. Annotate about 10 elements with `tourProps('forms.submissions.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S52](slices-5.md#s52)

**S53. Add a Support entry to the form builder, then tour its title bar, status bar and the Home and Insert ribbon tabs. Tour the builder's Layout and contextual ribbon tabs and the properties panel. Tour the builder's page rail, canvas, Add menu and context menu.**
- Create: `src/lib/support/guides/formsBuilder.ts`, `src/lib/support/guides/formsBuilder.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/settings/FormBuilderPage.tsx`, `src/components/forms/canvas/ribbon/TitleBar.tsx`, `src/components/forms/canvas/ribbon/StatusBar.tsx`, `src/components/forms/canvas/ribbon/HomeTab.tsx`, `src/components/forms/canvas/ribbon/InsertTab.tsx`, `src/components/forms/canvas/ribbon/RibbonButton.tsx`, `src/components/forms/registry/FormattingToolbar`, `src/components/forms/canvas/ribbon/LayoutTab.tsx`, `src/components/forms/canvas/ribbon/ContextualTab.tsx`, `src/components/forms/canvas/PageRail.tsx`, `src/components/forms/canvas/AddMenu.tsx`, `src/components/forms/canvas/FormCanvas.tsx`, `src/components/forms/canvas/CanvasSection.tsx`, `src/components/forms/canvas/CanvasElement.tsx`, `src/components/ui/ContextMenu`, `src/components/forms/canvas/PropertiesPanel.tsx`, `src/locales/en/supportSettings.json` and src/locales/sq/supportSettings.json (71 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Read: `src/components/forms/canvas/keyboard.ts`
- Also: Remove `'forms.builder'` from `PLANNED_PAGES`. Annotate about 64 elements with `tourProps('forms.builder.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S53](slices-5.md#s53)

**S54. Tour the Sales User dashboard and the shared role-dashboard frame, and publish the dashboard variant to Support.**
- Create: `src/lib/support/guides/dashboardSalesUser.ts`, `src/lib/support/guides/dashboardSalesUser.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/SalesUserDashboard.tsx`, `src/pages/dashboard/RoleDashboardFrame.tsx`, `src/pages/dashboard/PeriodSelector.tsx`, `src/pages/dashboard/RefreshBar.tsx`, `src/pages/dashboard/KpiTile.tsx`, `src/pages/dashboard/ChartWithTable.tsx`, `src/pages/dashboard/EmptyState.tsx`, `src/pages/dashboard/DashboardLanding.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (16 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'dashboard.salesUser'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('dashboard.salesUser.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S54](slices-5.md#s54)

**S55. Tour the Sales Manager dashboard additions.**
- Create: `src/lib/support/guides/dashboardSalesManager.ts`, `src/lib/support/guides/dashboardSalesManager.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/SalesManagerDashboard.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (9 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'dashboard.salesManager'` from `PLANNED_PAGES`. Annotate about 8 elements with `tourProps('dashboard.salesManager.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S55](slices-6.md#s55)

**S56. Tour the Administrator dashboard.**
- Create: `src/lib/support/guides/dashboardAdministrator.ts`, `src/lib/support/guides/dashboardAdministrator.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/AdministratorDashboard.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (9 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'dashboard.administrator'` from `PLANNED_PAGES`. Annotate about 8 elements with `tourProps('dashboard.administrator.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S56](slices-6.md#s56)

**S57. Tour the CEO dashboard.**
- Create: `src/lib/support/guides/dashboardCeo.ts`, `src/lib/support/guides/dashboardCeo.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/CeoDashboard.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (11 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'dashboard.ceo'` from `PLANNED_PAGES`. Annotate about 10 elements with `tourProps('dashboard.ceo.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S57](slices-6.md#s57)

**S58. Tour the fallback Business owner dashboard.**
- Create: `src/lib/support/guides/dashboardLegacyOwner.ts`, `src/lib/support/guides/dashboardLegacyOwner.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/BusinessOwnerDashboard.tsx`, `src/pages/shell/BusinessOwnerShell.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (10 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'dashboard.legacyOwner'` from `PLANNED_PAGES`. Annotate about 9 elements with `tourProps('dashboard.legacyOwner.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S58](slices-6.md#s58)

**S59. Tour the fallback Staff dashboard.**
- Create: `src/lib/support/guides/dashboardLegacyStaff.ts`, `src/lib/support/guides/dashboardLegacyStaff.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/StaffDashboard.tsx`, `src/pages/shell/StaffShell.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (12 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'dashboard.legacyStaff'` from `PLANNED_PAGES`. Annotate about 11 elements with `tourProps('dashboard.legacyStaff.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S59](slices-6.md#s59)

**S60. Tour the Notifications page.**
- Create: `src/lib/support/guides/notifications.ts`, `src/lib/support/guides/notifications.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/notifications/NotificationsContent.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (8 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'notifications'` from `PLANNED_PAGES`. Annotate about 7 elements with `tourProps('notifications.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S60](slices-6.md#s60)

**S61. Tour Reports.**
- Create: `src/lib/support/guides/reports.ts`, `src/lib/support/guides/reports.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/ReportsPage.tsx`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (16 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'reports'` from `PLANNED_PAGES`. Annotate about 14 elements with `tourProps('reports.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S61](slices-6.md#s61)

**S62. Tour the Inventory list header, filters and states. Tour Inventory rows, selection, bulk actions, row menu, stock adjustment and delete.**
- Create: `src/lib/support/guides/inventoryList.ts`, `src/lib/support/guides/inventoryList.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/inventory/InventoryList/InventoryList.tsx`, `src/components/inventory/InventoryTable`, `src/components/ui/MultiLocationStockIndicator`, `src/components/inventory/StockAdjustmentPanel`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (36 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'inventory.list'` from `PLANNED_PAGES`. Annotate about 32 elements with `tourProps('inventory.list.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S62](slices-6.md#s62)

**S63. Tour the product form, including stock per warehouse and images.**
- Create: `src/lib/support/guides/inventoryForm.ts`, `src/lib/support/guides/inventoryForm.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/inventory/ProductForm/ProductForm.tsx`, `src/components/inventory/WarehouseStockAllocation`, `src/components/inventory/ProductImageManager`, `src/locales/en/supportOps.json` and src/locales/sq/supportOps.json (28 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'inventory.form'` from `PLANNED_PAGES`. Annotate about 25 elements with `tourProps('inventory.form.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S63](slices-6.md#s63)

**S64. Tour Platform Tenants.**
- Create: `src/lib/support/guides/adminTenants.ts`, `src/lib/support/guides/adminTenants.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/admin/TenantsPage.tsx`, `src/components/widgets/TenantManagementTable`, `src/pages/admin/CreateTenantModal.tsx`, `src/locales/en/supportAdmin.json` and src/locales/sq/supportAdmin.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'admin.tenants'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('admin.tenants.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S64](slices-6.md#s64)

**S65. Tour Platform People.**
- Create: `src/lib/support/guides/adminPeople.ts`, `src/lib/support/guides/adminPeople.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/admin/PeoplePage.tsx`, `src/pages/admin/InviteUserModal.tsx`, `src/locales/en/supportAdmin.json` and src/locales/sq/supportAdmin.json (27 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'admin.people'` from `PLANNED_PAGES`. Annotate about 24 elements with `tourProps('admin.people.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S65](slices-6.md#s65)

**S66. Tour Platform Settings.**
- Create: `src/lib/support/guides/adminSettings.ts`, `src/lib/support/guides/adminSettings.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/admin/PlatformSettingsPage.tsx`, `src/pages/admin/TenantPickerModal.tsx`, `src/locales/en/supportAdmin.json` and src/locales/sq/supportAdmin.json (18 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'admin.settings'` from `PLANNED_PAGES`. Annotate about 16 elements with `tourProps('admin.settings.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S66](slices-6.md#s66)

**S67. Tour the Super Admin profile.**
- Create: `src/lib/support/guides/adminProfile.ts`, `src/lib/support/guides/adminProfile.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/admin/AdminProfilePage.tsx`, `src/locales/en/supportAdmin.json` and src/locales/sq/supportAdmin.json (13 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'admin.profile'` from `PLANNED_PAGES`. Annotate about 12 elements with `tourProps('admin.profile.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S67](slices-6.md#s67)

**S68. Tour the Platform dashboard, then empty the planned-pages list so a hard test enforces full coverage.**
- Create: `src/lib/support/guides/adminDashboard.ts`, `src/lib/support/guides/adminDashboard.test.tsx`
- Modify: `src/lib/support/pageRegistry.ts` (add the loader line), `src/lib/support/routeMap.ts` (planned -> mapped), `src/pages/dashboard/SuperAdminDashboard.tsx`, `src/pages/shell/SuperAdminShell.tsx`, `src/locales/en/supportAdmin.json` and src/locales/sq/supportAdmin.json (9 steps x title, body), `tests/e2e/support.spec.ts` (page row)
- Also: Remove `'admin.dashboard'` from `PLANNED_PAGES`. Annotate about 8 elements with `tourProps('admin.dashboard.<step>')` or `tourId`. Run `npm run check:translations`.
- Details: [S68](slices-6.md#s68)

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
| `/:tenantSlug/dashboard` | Dashboard: Sales User (`dashboard.salesUser`); Dashboard: Sales Manager (`dashboard.salesManager`); Dashboard: Administrator (`dashboard.administrator`); Dashboard: CEO (`dashboard.ceo`); Dashboard: Business owner (fallback) (`dashboard.legacyOwner`); Dashboard: Staff (fallback) (`dashboard.legacyStaff`); excluded: Reception has no dashboard: `DashboardLanding` redirects to the company list. | [S54](slices-5.md#s54), [S55](slices-6.md#s55), [S56](slices-6.md#s56), [S57](slices-6.md#s57), [S58](slices-6.md#s58), [S59](slices-6.md#s59) |
| `/:tenantSlug/settings` | Settings: Company (`settings.company`) | [S36](slices-4.md#s36) |
| `/:tenantSlug/settings/team` | Settings: Team (`settings.team`) | [S38](slices-4.md#s38) |
| `/:tenantSlug/settings/roles` | Settings: Roles and permissions (`settings.roles`) | [S39](slices-4.md#s39) |
| `/:tenantSlug/settings/lists/:list?` | Settings: Lists (`settings.lists`) | [S40](slices-4.md#s40) |
| `/:tenantSlug/settings/sales-script` | Settings: Sales script (`settings.salesScript`) | [S41](slices-4.md#s41) |
| `/:tenantSlug/settings/pricing/:tab?` | Settings: Pricing (`settings.pricing`) | [S42](slices-4.md#s42) |
| `/:tenantSlug/settings/statuses` | Settings: Statuses (`settings.statuses`) | [S43](slices-5.md#s43) |
| `/:tenantSlug/settings/wellness-plus/:tab?` | Settings: Wellness+ (`settings.wellnessPlus`) | [S44](slices-5.md#s44) |
| `/:tenantSlug/settings/contracts` | Settings: Contracts and payments (`settings.contracts`) | [S45](slices-5.md#s45) |
| `/:tenantSlug/settings/audit` | Settings: Audit log (`settings.audit`) | [S46](slices-5.md#s46) |
| `/:tenantSlug/settings/integrations` | Settings: Integrations (`settings.integrations`) | [S47](slices-5.md#s47) |
| `/:tenantSlug/settings/profile` | Settings: My profile (`settings.profile`) | [S37](slices-4.md#s37) |
| `/:tenantSlug/reports` | Reports (`reports`) | [S61](slices-6.md#s61) |
| `/:tenantSlug/clients` | Clients list (`clients.list`) | [S05](slices-1.md#s05) |
| `/:tenantSlug/clients/new` | Client form (create and edit) (`clients.form`) | [S06](slices-1.md#s06) |
| `/:tenantSlug/clients/:clientId` | Client detail (`clients.detail`) | [S09](slices-2.md#s09) |
| `/:tenantSlug/clients/:clientId/edit` | Client form (create and edit) (`clients.form`) | [S06](slices-1.md#s06) |
| `/:tenantSlug/appointments` | Calendar (appointments, follow-ups, contract dates) (`appointments`) | [S08](slices-2.md#s08) |
| `/:tenantSlug/settings/client-management` | Settings: Client management (`settings.clientManagement`) | [S48](slices-5.md#s48) |
| `/:tenantSlug/settings/client-management/forms/:formId` | Form builder (`forms.builder`) | [S53](slices-5.md#s53) |
| `/:tenantSlug/settings/client-management/forms/:formId/submissions` | Form submissions (`forms.submissions`) | [S52](slices-5.md#s52) |
| `/:tenantSlug/settings/client-management/forms/:formId/print` | excluded: Print layout (30 lines): no interactive controls. | none |
| `/:tenantSlug/settings/client-management/forms/:formId/submissions/:submissionId/print` | excluded: Print layout (37 lines): no interactive controls. | none |
| `/:tenantSlug/settings/notifications` | Settings: Notifications (`settings.notifications`) | [S49](slices-5.md#s49) |
| `/:tenantSlug/inventory` | Inventory list (`inventory.list`) | [S62](slices-6.md#s62) |
| `/:tenantSlug/inventory/new` | Product form (create and edit) (`inventory.form`) | [S63](slices-6.md#s63) |
| `/:tenantSlug/inventory/:productId/edit` | Product form (create and edit) (`inventory.form`) | [S63](slices-6.md#s63) |
| `/:tenantSlug/settings/warehouses` | Settings: Warehouses (`settings.warehouses`) | [S50](slices-5.md#s50) |
| `/:tenantSlug/settings/categories` | Settings: Categories (`settings.categories`) | [S51](slices-5.md#s51) |
| `/:tenantSlug/notifications` | Notifications (`notifications`) | [S60](slices-6.md#s60) |
| `/:tenantSlug/offers` | Offers list (`offers`) | [S12](slices-2.md#s12) |
| `/:tenantSlug/follow-ups` | Follow-ups (`followUps`) | [S07](slices-1.md#s07) |
| `/:tenantSlug/approvals` | Discount approvals (`approvals`) | [S11](slices-2.md#s11) |
| `/:tenantSlug/quotations` | Quotations list (legacy workflow) (`quotations.list`) | [S17](slices-2.md#s17) |
| `/:tenantSlug/quotations/new` | Quotation form (create and edit) (`quotations.form`) | [S18](slices-3.md#s18) |
| `/:tenantSlug/quotations/:id` | Quotation detail (`quotations.detail`) | [S19](slices-3.md#s19) |
| `/:tenantSlug/invoices` | Invoices list (`invoices.list`) | [S20](slices-3.md#s20) |
| `/:tenantSlug/invoices/:id` | Invoice detail (`invoices.detail`) | [S21](slices-3.md#s21) |
| `/:tenantSlug/contracts` | Contracts list (`contracts.list`) | [S22](slices-3.md#s22) |
| `/:tenantSlug/contracts/new` | Contract form (create and edit) (`contracts.form`) | [S23](slices-3.md#s23) |
| `/:tenantSlug/members` | Members list (`members.list`) | [S28](slices-3.md#s28) |
| `/:tenantSlug/members/new` | Member form (register and edit) (`members.form`) | [S29](slices-3.md#s29) |
| `/:tenantSlug/members/payments` | Membership payments (`members.payments`) | [S31](slices-4.md#s31) |
| `/:tenantSlug/members/reports` | Membership reports (`members.reports`) | [S32](slices-4.md#s32) |
| `/:tenantSlug/members/verify` | Verify member (Reception) (`members.verify`) | [S33](slices-4.md#s33) |
| `/:tenantSlug/members/employee-upload` | Employee upload (`members.employeeUpload`) | [S34](slices-4.md#s34) |
| `/:tenantSlug/members/vip-requests` | VIP requests (`members.vipRequests`) | [S35](slices-4.md#s35) |
| `/:tenantSlug/members/:memberId` | Member detail (`members.detail`) | [S30](slices-3.md#s30) |
| `/:tenantSlug/members/:memberId/edit` | Member form (register and edit) (`members.form`) | [S29](slices-3.md#s29) |
| `/:tenantSlug/contracts/:contractId` | Contract detail (`contracts.detail`) | [S24](slices-3.md#s24) |
| `/:tenantSlug/payments` | Payments overview (`payments`) | [S25](slices-3.md#s25) |
| `/:tenantSlug/renewals` | Renewals (`renewals`) | [S26](slices-3.md#s26) |
| `/:tenantSlug/performance` | Performance (`performance`) | [S27](slices-3.md#s27) |
| `/:tenantSlug/contracts/:contractId/edit` | Contract form (create and edit) (`contracts.form`) | [S23](slices-3.md#s23) |
| `/:tenantSlug/pipeline` | Pipeline board (`pipeline.board`) | [S15](slices-2.md#s15) |
| `/:tenantSlug/pipeline/list` | Pipeline list (`pipeline.list`) | [S16](slices-2.md#s16) |
| `/:tenantSlug/deals/new` | Deal form (create and edit) (`deals.form`) | [S13](slices-2.md#s13) |
| `/:tenantSlug/deals/:dealId` | Deal detail (`deals.detail`) | [S14](slices-2.md#s14) |
| `/:tenantSlug/deals/:dealId/pricing` | Pricing screen (offer builder) (`pricing.offer`) | [S10](slices-2.md#s10) |
| `/:tenantSlug/clients/:clientId/pricing` | Pricing screen (offer builder) (`pricing.offer`) | [S10](slices-2.md#s10) |
| `/:tenantSlug/deals/:dealId/edit` | Deal form (create and edit) (`deals.form`) | [S13](slices-2.md#s13) |
| `/:tenantSlug/quotations/:id/edit` | Quotation form (create and edit) (`quotations.form`) | [S18](slices-3.md#s18) |
| `/admin` | Platform dashboard (Super Admin) (`admin.dashboard`) | [S68](slices-6.md#s68) |
| `/admin/dashboard` | Platform dashboard (Super Admin) (`admin.dashboard`) | [S68](slices-6.md#s68) |
| `/admin/tenants` | Platform: Tenants (`admin.tenants`) | [S64](slices-6.md#s64) |
| `/admin/people` | Platform: People (`admin.people`) | [S65](slices-6.md#s65) |
| `/admin/setting` | Platform: Settings (`admin.settings`) | [S66](slices-6.md#s66) |
| `/admin/profile` | Platform: My profile (`admin.profile`) | [S67](slices-6.md#s67) |
| `/admin/*` | excluded: Redirected by `SuperAdminShell`; the five real sub-pages are covered. | none |
| `/unauthorized` | excluded: 403 status page. | none |
| `*` | excluded: 404 status page. | none |

### 7.2 Page to slices

| # | Page | Id | Slices | Tour complete after |
|---|---|---|---|---|
| 1 | Clients list | `clients.list` | [S05](slices-1.md#s05) | [S05](slices-1.md#s05) |
| 2 | Client form (create and edit) | `clients.form` | [S06](slices-1.md#s06) | [S06](slices-1.md#s06) |
| 3 | Client detail | `clients.detail` | [S09](slices-2.md#s09) | [S09](slices-2.md#s09) |
| 4 | Pricing screen (offer builder) | `pricing.offer` | [S10](slices-2.md#s10) | [S10](slices-2.md#s10) |
| 5 | Calendar (appointments, follow-ups, contract dates) | `appointments` | [S08](slices-2.md#s08) | [S08](slices-2.md#s08) |
| 6 | Follow-ups | `followUps` | [S07](slices-1.md#s07) | [S07](slices-1.md#s07) |
| 7 | Discount approvals | `approvals` | [S11](slices-2.md#s11) | [S11](slices-2.md#s11) |
| 8 | Offers list | `offers` | [S12](slices-2.md#s12) | [S12](slices-2.md#s12) |
| 9 | Pipeline board | `pipeline.board` | [S15](slices-2.md#s15) | [S15](slices-2.md#s15) |
| 10 | Pipeline list | `pipeline.list` | [S16](slices-2.md#s16) | [S16](slices-2.md#s16) |
| 11 | Deal form (create and edit) | `deals.form` | [S13](slices-2.md#s13) | [S13](slices-2.md#s13) |
| 12 | Deal detail | `deals.detail` | [S14](slices-2.md#s14) | [S14](slices-2.md#s14) |
| 13 | Quotations list (legacy workflow) | `quotations.list` | [S17](slices-2.md#s17) | [S17](slices-2.md#s17) |
| 14 | Quotation form (create and edit) | `quotations.form` | [S18](slices-3.md#s18) | [S18](slices-3.md#s18) |
| 15 | Quotation detail | `quotations.detail` | [S19](slices-3.md#s19) | [S19](slices-3.md#s19) |
| 16 | Invoices list | `invoices.list` | [S20](slices-3.md#s20) | [S20](slices-3.md#s20) |
| 17 | Invoice detail | `invoices.detail` | [S21](slices-3.md#s21) | [S21](slices-3.md#s21) |
| 18 | Contracts list | `contracts.list` | [S22](slices-3.md#s22) | [S22](slices-3.md#s22) |
| 19 | Contract form (create and edit) | `contracts.form` | [S23](slices-3.md#s23) | [S23](slices-3.md#s23) |
| 20 | Contract detail | `contracts.detail` | [S24](slices-3.md#s24) | [S24](slices-3.md#s24) |
| 21 | Payments overview | `payments` | [S25](slices-3.md#s25) | [S25](slices-3.md#s25) |
| 22 | Renewals | `renewals` | [S26](slices-3.md#s26) | [S26](slices-3.md#s26) |
| 23 | Performance | `performance` | [S27](slices-3.md#s27) | [S27](slices-3.md#s27) |
| 24 | Members list | `members.list` | [S28](slices-3.md#s28) | [S28](slices-3.md#s28) |
| 25 | Member form (register and edit) | `members.form` | [S29](slices-3.md#s29) | [S29](slices-3.md#s29) |
| 26 | Member detail | `members.detail` | [S30](slices-3.md#s30) | [S30](slices-3.md#s30) |
| 27 | Membership payments | `members.payments` | [S31](slices-4.md#s31) | [S31](slices-4.md#s31) |
| 28 | Membership reports | `members.reports` | [S32](slices-4.md#s32) | [S32](slices-4.md#s32) |
| 29 | Verify member (Reception) | `members.verify` | [S33](slices-4.md#s33) | [S33](slices-4.md#s33) |
| 30 | Employee upload | `members.employeeUpload` | [S34](slices-4.md#s34) | [S34](slices-4.md#s34) |
| 31 | VIP requests | `members.vipRequests` | [S35](slices-4.md#s35) | [S35](slices-4.md#s35) |
| 32 | Settings: Company | `settings.company` | [S36](slices-4.md#s36) | [S36](slices-4.md#s36) |
| 33 | Settings: My profile | `settings.profile` | [S37](slices-4.md#s37) | [S37](slices-4.md#s37) |
| 34 | Settings: Team | `settings.team` | [S38](slices-4.md#s38) | [S38](slices-4.md#s38) |
| 35 | Settings: Roles and permissions | `settings.roles` | [S39](slices-4.md#s39) | [S39](slices-4.md#s39) |
| 36 | Settings: Lists | `settings.lists` | [S40](slices-4.md#s40) | [S40](slices-4.md#s40) |
| 37 | Settings: Sales script | `settings.salesScript` | [S41](slices-4.md#s41) | [S41](slices-4.md#s41) |
| 38 | Settings: Pricing | `settings.pricing` | [S42](slices-4.md#s42) | [S42](slices-4.md#s42) |
| 39 | Settings: Statuses | `settings.statuses` | [S43](slices-5.md#s43) | [S43](slices-5.md#s43) |
| 40 | Settings: Wellness+ | `settings.wellnessPlus` | [S44](slices-5.md#s44) | [S44](slices-5.md#s44) |
| 41 | Settings: Contracts and payments | `settings.contracts` | [S45](slices-5.md#s45) | [S45](slices-5.md#s45) |
| 42 | Settings: Audit log | `settings.audit` | [S46](slices-5.md#s46) | [S46](slices-5.md#s46) |
| 43 | Settings: Integrations | `settings.integrations` | [S47](slices-5.md#s47) | [S47](slices-5.md#s47) |
| 44 | Settings: Client management | `settings.clientManagement` | [S48](slices-5.md#s48) | [S48](slices-5.md#s48) |
| 45 | Settings: Notifications | `settings.notifications` | [S49](slices-5.md#s49) | [S49](slices-5.md#s49) |
| 46 | Settings: Warehouses | `settings.warehouses` | [S50](slices-5.md#s50) | [S50](slices-5.md#s50) |
| 47 | Settings: Categories | `settings.categories` | [S51](slices-5.md#s51) | [S51](slices-5.md#s51) |
| 48 | Form submissions | `forms.submissions` | [S52](slices-5.md#s52) | [S52](slices-5.md#s52) |
| 49 | Form builder | `forms.builder` | [S53](slices-5.md#s53) | [S53](slices-5.md#s53) |
| 50 | Notifications | `notifications` | [S60](slices-6.md#s60) | [S60](slices-6.md#s60) |
| 51 | Reports | `reports` | [S61](slices-6.md#s61) | [S61](slices-6.md#s61) |
| 52 | Inventory list | `inventory.list` | [S62](slices-6.md#s62) | [S62](slices-6.md#s62) |
| 53 | Product form (create and edit) | `inventory.form` | [S63](slices-6.md#s63) | [S63](slices-6.md#s63) |
| 54 | Dashboard: Sales User | `dashboard.salesUser` | [S54](slices-5.md#s54) | [S54](slices-5.md#s54) |
| 55 | Dashboard: Sales Manager | `dashboard.salesManager` | [S55](slices-6.md#s55) | [S55](slices-6.md#s55) |
| 56 | Dashboard: Administrator | `dashboard.administrator` | [S56](slices-6.md#s56) | [S56](slices-6.md#s56) |
| 57 | Dashboard: CEO | `dashboard.ceo` | [S57](slices-6.md#s57) | [S57](slices-6.md#s57) |
| 58 | Dashboard: Business owner (fallback) | `dashboard.legacyOwner` | [S58](slices-6.md#s58) | [S58](slices-6.md#s58) |
| 59 | Dashboard: Staff (fallback) | `dashboard.legacyStaff` | [S59](slices-6.md#s59) | [S59](slices-6.md#s59) |
| 60 | Platform dashboard (Super Admin) | `admin.dashboard` | [S68](slices-6.md#s68) | [S68](slices-6.md#s68) |
| 61 | Platform: Tenants | `admin.tenants` | [S64](slices-6.md#s64) | [S64](slices-6.md#s64) |
| 62 | Platform: People | `admin.people` | [S65](slices-6.md#s65) | [S65](slices-6.md#s65) |
| 63 | Platform: Settings | `admin.settings` | [S66](slices-6.md#s66) | [S66](slices-6.md#s66) |
| 64 | Platform: My profile | `admin.profile` | [S67](slices-6.md#s67) | [S67](slices-6.md#s67) |

### 7.3 Page by runtime state

Cell = slice numbers that cover the state; `.` = the state does not exist on that page (so an omission is visible as an empty cell where a state *does* exist, and the generator fails if there is one).

| Page | E | L | P | F | G | X | A | D | V | T | K |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Clients list | 5 | 5 | 5 | 5 | . | 5 | 5 | 5 | . | . | 5 |
| Client form (create and edit) | . | 6 | . | . | . | . | 6 | 6 | 6 | . | . |
| Client detail | 9 | 9 | 9 | . | . | 9 | 9 | 9 | . | 9 | 9 |
| Pricing screen (offer builder) | . | 10 | . | . | . | 10 | 10 | . | 10 | . | . |
| Calendar (appointments, follow-ups, contract dates) | 8 | 8 | 8 | . | . | 8 | 8 | 8 | 8 | 8 | . |
| Follow-ups | 7 | 7 | 7 | 7 | . | 7 | 7 | 7 | . | 7 | . |
| Discount approvals | 11 | 11 | 11 | . | 11 | 11 | 11 | . | . | . | . |
| Offers list | 12 | 12 | 12 | 12 | 12 | 12 | 12 | . | . | . | . |
| Pipeline board | 15 | 15 | 15 | . | . | 15 | 15 | 15 | . | . | . |
| Pipeline list | 16 | 16 | 16 | 16 | 16 | 16 | 16 | . | . | . | . |
| Deal form (create and edit) | . | 13 | . | . | . | . | 13 | . | 13 | . | . |
| Deal detail | 14 | 14 | 14 | . | . | 14 | 14 | 14 | 14 | . | 14 |
| Quotations list (legacy workflow) | 17 | 17 | 17 | 17 | . | 17 | 17 | . | . | . | . |
| Quotation form (create and edit) | . | 18 | 18 | . | . | . | 18 | . | 18 | . | . |
| Quotation detail | . | 19 | . | . | . | 19 | 19 | . | . | . | 19 |
| Invoices list | 20 | 20 | 20 | 20 | . | 20 | 20 | . | . | . | . |
| Invoice detail | . | 21 | . | . | . | 21 | 21 | . | . | . | 21 |
| Contracts list | 22 | 22 | 22 | 22 | . | 22 | 22 | . | . | . | . |
| Contract form (create and edit) | . | 23 | . | . | . | . | 23 | . | 23 | . | . |
| Contract detail | . | 24 | 24 | . | . | 24 | 24 | 24 | 24 | . | 24 |
| Payments overview | 25 | 25 | 25 | 25 | 25 | 25 | 25 | . | . | . | . |
| Renewals | 26 | 26 | 26 | 26 | 26 | 26 | 26 | 26 | 26 | 26 | . |
| Performance | 27 | 27 | 27 | 27 | 27 | 27 | 27 | 27 | . | 27 | . |
| Members list | 28 | 28 | 28 | 28 | 28 | 28 | 28 | . | . | . | . |
| Member form (register and edit) | . | 29 | . | . | . | . | 29 | 29 | 29 | . | . |
| Member detail | 30 | 30 | 30 | . | . | 30 | 30 | 30 | 30 | 30 | 30 |
| Membership payments | 31 | 31 | 31 | 31 | 31 | 31 | 31 | . | . | . | . |
| Membership reports | 32 | 32 | 32 | 32 | . | 32 | 32 | . | . | . | . |
| Verify member (Reception) | . | 33 | . | 33 | . | 33 | 33 | 33 | . | . | . |
| Employee upload | 34 | 34 | 34 | . | . | 34 | 34 | . | 34 | . | . |
| VIP requests | 35 | 35 | 35 | 35 | 35 | 35 | 35 | 35 | 35 | . | . |
| Settings: Company | . | 36 | . | . | . | 36 | 36 | . | 36 | . | . |
| Settings: My profile | . | 37 | . | . | . | 37 | . | . | 37 | . | . |
| Settings: Team | 38 | 38 | 38 | . | . | 38 | 38 | 38 | 38 | . | 38 |
| Settings: Roles and permissions | . | 39 | . | . | . | 39 | 39 | 39 | 39 | . | 39 |
| Settings: Lists | 40 | 40 | 40 | . | . | 40 | 40 | 40 | 40 | 40 | . |
| Settings: Sales script | 41 | 41 | . | . | . | 41 | 41 | 41 | 41 | 41 | 41 |
| Settings: Pricing | 42 | 42 | 42 | . | . | 42 | . | 42 | 42 | 42 | 42 |
| Settings: Statuses | . | 43 | . | . | . | 43 | . | . | 43 | . | . |
| Settings: Wellness+ | . | 44 | . | . | . | 44 | 44 | . | 44 | 44 | . |
| Settings: Contracts and payments | . | 45 | . | . | . | 45 | . | . | 45 | . | . |
| Settings: Audit log | 46 | 46 | 46 | 46 | 46 | 46 | 46 | 46 | . | . | . |
| Settings: Integrations | . | 47 | 47 | . | . | 47 | 47 | . | . | . | . |
| Settings: Client management | 48 | 48 | 48 | . | . | 48 | 48 | 48 | 48 | 48 | 48 |
| Settings: Notifications | . | 49 | . | . | . | 49 | 49 | . | 49 | . | . |
| Settings: Warehouses | 50 | 50 | 50 | . | . | 50 | 50 | 50 | 50 | . | 50 |
| Settings: Categories | 51 | 51 | 51 | 51 | . | 51 | 51 | 51 | 51 | . | 51 |
| Form submissions | 52 | 52 | 52 | . | . | 52 | 52 | 52 | . | . | . |
| Form builder | 53 | 53 | . | . | . | . | 53 | 53 | . | 53 | 53 |
| Notifications | 60 | 60 | 60 | . | . | 60 | . | . | . | . | . |
| Reports | 61 | 61 | 61 | . | . | 61 | 61 | . | . | . | . |
| Inventory list | 62 | 62 | 62 | 62 | 62 | 62 | 62 | 62 | . | . | 62 |
| Product form (create and edit) | . | 63 | . | . | . | . | 63 | 63 | 63 | . | 63 |
| Dashboard: Sales User | 54 | 54 | 54 | 54 | . | 54 | 54 | . | . | . | . |
| Dashboard: Sales Manager | 55 | . | 55 | 55 | . | . | 55 | . | . | . | . |
| Dashboard: Administrator | 56 | . | 56 | . | . | . | 56 | . | . | . | . |
| Dashboard: CEO | 57 | . | 57 | . | . | . | 57 | . | . | . | . |
| Dashboard: Business owner (fallback) | 58 | 58 | 58 | . | . | 58 | . | . | . | . | . |
| Dashboard: Staff (fallback) | 59 | 59 | 59 | . | . | 59 | . | . | . | . | . |
| Platform dashboard (Super Admin) | 68 | 68 | 68 | . | . | 68 | . | . | . | . | . |
| Platform: Tenants | 64 | 64 | 64 | . | . | 64 | . | 64 | 64 | . | 64 |
| Platform: People | 65 | 65 | 65 | 65 | . | 65 | . | 65 | 65 | . | 65 |
| Platform: Settings | . | 66 | . | . | . | 66 | . | 66 | 66 | . | 66 |
| Platform: My profile | . | 67 | . | . | . | 67 | . | 67 | 67 | . | 67 |

State legend: **E** Empty state; **L** Loading / skeleton; **P** Populated, repeated rows or cards; **F** Search / filtered results; **G** Pagination / sorting; **X** Error / retry; **A** Permission- or workflow-dependent controls; **D** Dialogs, drawers, menus, nested workflows; **V** Validation and submission; **T** Tabs / sections; **K** Destructive or irreversible actions (explain-only).

### 7.4 Control category to guidance and pages

| Category | Mechanism and shared guidance | Pages (first slice) |
|---|---|---|
| **C1** Primary / secondary buttons | P11 shared kinds, P14 explain-only | clients.list (S05), clients.form (S06), clients.detail (S09), pricing.offer (S10), appointments (S08), followUps (S07), pipeline.board (S15), pipeline.list (S16), deals.form (S13), deals.detail (S14), quotations.list (S17), quotations.form (S18), quotations.detail (S19), invoices.detail (S21), contracts.list (S22), contracts.form (S23), contracts.detail (S24), payments (S25), performance (S27), members.list (S28), members.form (S29), members.detail (S30), members.payments (S31), members.reports (S32), members.verify (S33), members.employeeUpload (S34), settings.company (S36), settings.profile (S37), settings.team (S38), settings.roles (S39), settings.lists (S40), settings.salesScript (S41), settings.pricing (S42), settings.statuses (S43), settings.wellnessPlus (S44), settings.contracts (S45), settings.audit (S46), settings.integrations (S47), settings.clientManagement (S48), settings.notifications (S49), settings.warehouses (S50), settings.categories (S51), forms.submissions (S52), forms.builder (S53), notifications (S60), reports (S61), inventory.list (S62), inventory.form (S63), dashboard.salesUser (S54), dashboard.legacyOwner (S58), dashboard.legacyStaff (S59), admin.dashboard (S68), admin.tenants (S64), admin.people (S65), admin.settings (S66), admin.profile (S67) |
| **C2** Icon-only buttons | P10 (reuse `aria-label`), P11 | clients.list (S05), clients.detail (S09), appointments (S08), pipeline.board (S15), settings.team (S38), settings.lists (S40), settings.pricing (S42), settings.statuses (S43), settings.clientManagement (S48), settings.categories (S51), forms.builder (S53) |
| **C3** Navigation items, breadcrumbs, back links | P12 shell, page slices for breadcrumbs | settings.company (S36), settings.profile (S37), settings.integrations (S47), settings.notifications (S49), settings.warehouses (S50) |
| **C4** Search fields and filters | P11 search / filter / date kinds, P10 field containers | clients.list (S05), appointments (S08), followUps (S07), offers (S12), pipeline.list (S16), quotations.list (S17), invoices.list (S20), contracts.list (S22), payments (S25), renewals (S26), performance (S27), members.list (S28), members.payments (S31), members.reports (S32), members.verify (S33), members.vipRequests (S35), settings.audit (S46), inventory.list (S62), dashboard.salesUser (S54), dashboard.salesManager (S55), admin.people (S65) |
| **C5** Tabs and segmented controls | P10 Tabs, P13 tab hand-off | clients.detail (S09), appointments (S08), followUps (S07), pipeline.board (S15), renewals (S26), performance (S27), members.detail (S30), members.reports (S32), settings.lists (S40), settings.salesScript (S41), settings.pricing (S42), settings.wellnessPlus (S44), settings.clientManagement (S48), forms.builder (S53), dashboard.salesUser (S54) |
| **C6** Dropdowns and action menus | P10 DropdownMenu items, P13 hand-off | clients.list (S05), clients.detail (S09), pipeline.board (S15), deals.detail (S14), quotations.list (S17), invoices.list (S20), contracts.list (S22), members.detail (S30), settings.roles (S39), forms.builder (S53), admin.tenants (S64), admin.people (S65) |
| **C7** Form fields, validation, submit | P10 field containers, P11 form steps, P14 submit lock | clients.form (S06), pricing.offer (S10), deals.form (S13), quotations.form (S18), contracts.form (S23), members.form (S29), members.detail (S30), members.employeeUpload (S34), settings.company (S36), settings.profile (S37), settings.roles (S39), settings.pricing (S42), settings.statuses (S43), settings.wellnessPlus (S44), settings.contracts (S45), settings.notifications (S49), forms.builder (S53), inventory.form (S63), admin.settings (S66), admin.profile (S67) |
| **C8** Tables, cards, pagination, sorting | P10 DataTable, P02 repeat, P11 pagination and sort | clients.list (S05), approvals (S11), offers (S12), pipeline.board (S15), pipeline.list (S16), quotations.list (S17), quotations.form (S18), invoices.list (S20), contracts.list (S22), payments (S25), renewals (S26), performance (S27), members.list (S28), members.payments (S31), members.reports (S32), members.employeeUpload (S34), members.vipRequests (S35), settings.audit (S46), forms.submissions (S52), reports (S61), inventory.list (S62), dashboard.salesUser (S54), dashboard.salesManager (S55), dashboard.administrator (S56), dashboard.ceo (S57), admin.people (S65) |
| **C9** Create / view / edit / duplicate / archive / delete actions | P11, P14 | clients.list (S05), clients.form (S06), clients.detail (S09), followUps (S07), approvals (S11), pipeline.board (S15), deals.form (S13), deals.detail (S14), quotations.form (S18), quotations.detail (S19), invoices.detail (S21), contracts.form (S23), contracts.detail (S24), renewals (S26), members.form (S29), members.detail (S30), members.vipRequests (S35), settings.team (S38), settings.roles (S39), settings.lists (S40), settings.salesScript (S41), settings.pricing (S42), settings.integrations (S47), settings.clientManagement (S48), settings.warehouses (S50), settings.categories (S51), forms.builder (S53), notifications (S60), inventory.list (S62), inventory.form (S63), admin.tenants (S64), admin.people (S65) |
| **C10** Dialogs, drawers, confirmation prompts | P10 dialog roots, P13 nested layers | clients.list (S05), clients.detail (S09), appointments (S08), followUps (S07), deals.detail (S14), contracts.detail (S24), renewals (S26), performance (S27), members.form (S29), members.detail (S30), members.vipRequests (S35), settings.team (S38), settings.roles (S39), settings.lists (S40), settings.salesScript (S41), settings.pricing (S42), settings.audit (S46), settings.clientManagement (S48), settings.warehouses (S50), settings.categories (S51), forms.submissions (S52), inventory.list (S62), inventory.form (S63), admin.tenants (S64), admin.people (S65), admin.settings (S66), admin.profile (S67) |
| **C11** Toolbars, bulk operations | P11 bulk and export kinds, P14 | appointments (S08), payments (S25), performance (S27), members.payments (S31), members.reports (S32), members.employeeUpload (S34), settings.audit (S46), forms.builder (S53), reports (S61), inventory.list (S62), admin.settings (S66) |
| **C12** Settings and permission-dependent controls | P04 eligibility, P12 nav | clients.list (S05), clients.form (S06), clients.detail (S09), pricing.offer (S10), appointments (S08), followUps (S07), approvals (S11), offers (S12), pipeline.board (S15), pipeline.list (S16), deals.form (S13), deals.detail (S14), quotations.list (S17), quotations.form (S18), quotations.detail (S19), invoices.list (S20), invoices.detail (S21), contracts.list (S22), contracts.detail (S24), payments (S25), renewals (S26), performance (S27), members.list (S28), members.detail (S30), members.payments (S31), members.reports (S32), members.verify (S33), members.employeeUpload (S34), members.vipRequests (S35), settings.company (S36), settings.team (S38), settings.roles (S39), settings.lists (S40), settings.salesScript (S41), settings.pricing (S42), settings.statuses (S43), settings.wellnessPlus (S44), settings.contracts (S45), settings.audit (S46), settings.integrations (S47), settings.clientManagement (S48), settings.notifications (S49), settings.warehouses (S50), settings.categories (S51), forms.submissions (S52), forms.builder (S53), reports (S61), inventory.list (S62), inventory.form (S63), dashboard.salesUser (S54), dashboard.salesManager (S55), dashboard.administrator (S56), dashboard.ceo (S57) |
| **C13** Empty-state actions | P10 DataTable empty, P11 | clients.list (S05), appointments (S08), approvals (S11), offers (S12), pipeline.list (S16), quotations.list (S17), invoices.list (S20), contracts.list (S22), payments (S25), renewals (S26), members.list (S28), members.payments (S31), forms.submissions (S52), notifications (S60), inventory.list (S62), dashboard.legacyOwner (S58), dashboard.legacyStaff (S59), admin.dashboard (S68), admin.people (S65) |

### 7.5 Requirement to slices

| Id | Delivered by (infrastructure) | Verified on pages by |
|---|---|---|
| SUP-01 | S01, S03 | every page slice (panel offers the page) |
| SUP-02 | S02, S03 | every page slice |
| SUP-03 | S01, S02, S03 | P06 to P08; every page tour runs end to end |
| SUP-04 | S04 | P15, P16; every page via its guide |
| SUP-05 | S03, S04 | every page slice (inventory 3.2) and 3.4 exclusions |
| SUP-06 | S01, S02 | every page slice (change-during-tour test) |
| SUP-07 | S01, S03, S04 | pages with P in 7.3 |
| SUP-08 | S01, S02, S04 | every page slice |
| SUP-09 | S01, S03 | pages with A in 7.3 |
| SUP-10 | S01, S02, S04 | pages with D in 7.3 |
| SUP-11 | S02, S04 | pages with E, L or X in 7.3 |
| SUP-12 | S03, S04 | every page slice (Playwright `expectNoMutations`) |
| SUP-13 | S02, S04 | P07; manual pass in S05 and the last slice |
| SUP-14 | S02, S03, S04 | P06, P07; manual pass |
| SUP-15 | S01, S02, S03 | every page slice (360 px row) |
| SUP-16 | S02 | P05; spot check |
| SUP-17 | S01, S02, S03 | P04, P08, P09 |
| SUP-18 | S01, S03 | every page slice (`check:translations`) |
| SUP-19 | S01, S02 | P03, P04, P09 build-size note |
| SUP-20 | S01 | P03 guard, S68 closure |

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
| Pure units | Vitest | Machine transitions; eligibility; persistence round trip; id grammar; guide lint; placement maths | P01, P04, P10, P11, P06 |
| DOM-level units | Vitest + jsdom + RTL | Resolver statuses; observer hub; mask follows a stubbed rect; popover variants; announcer; describedby restore; guard cancels events | P02, P05, P06, P07, P14 |
| Integration with the **real** shared UI | Vitest + RTL | Nested hand-off using the real `DropdownMenu`, `Modal`, `SlideOver`, `ConfirmDialog`; Esc arbitration against a real `Modal`; DataTable rows in both layouts | P10, P13 |
| Page guide tests | Vitest + RTL + msw | Per page: guide lint passes; every step resolves in some rendered fixture state; empty vs populated vs error; permission matrix; change-during-tour; submit lock | every page slice |
| Coverage guards | Vitest | Every router path is mapped or excluded (P03); no planned pages remain (last slice); every derived copy key exists in `en` and `sq` (P11); no inert control carries `data-tour` | P03, P11, last slice |
| End to end | Playwright (`support` project, `mobile-360`) | Real geometry, scrolling, focus, 360 px, zero mutating requests, whole tours on a seeded workspace | P09 onward, one table-driven spec |
| Accessibility | Storybook a11y addon; RTL role and label assertions; manual keyboard and screen-reader pass | Names, roles, order, announcements | P05, P06, P07, P09; manual in S05 and the last slice |
| Regression | Existing suites | Touched components behave as before | P09, P10, P12, P13 and every page slice |

### 8.3 What each required topic maps to

| Topic in the brief | Test(s) | Slice(s) |
|---|---|---|
| Shared tour-engine behaviour | Machine tables; session integration with a fixture guide | P01, P08 |
| Page-specific walkthroughs | Per-page guide test + per-page Playwright case | every page slice |
| Correct target selection | Resolver tests; per-guide "every step resolves" fixture check; scope-root tests with an open dialog | P02, P13, page slices |
| Missing and stale targets | Remove, replace, hide, disable a target during a running fixture tour; `lost` restoration | P02, P08 |
| Empty and populated states | Page tests with msw returning 0, 1, N records; same eligible step ids except empty-state steps | page slices; inventory list has the 20-product case |
| Data added after initial render | Add a row through the fixture after the tour starts; no step change | P02, P10, page slices |
| Data edited or deleted in a session | Remove the exemplar row mid-tour; spotlight moves; no console warning | P02, S05, S62 |
| Conditional and permission-dependent controls | Eligibility matrix; per-page permission variants; workflow variants | P04, page slices |
| Dynamic forms, dropdowns and dialogs | Hand-off with real components; dependent selects (city after area); disabled-until-valid buttons | P13, page slices |
| Keyboard and accessibility | Focus restore, Esc rule, arrow keys ignored in inputs, announcer, describedby | P07, P09, P15, P16 |
| Regression risk to existing pages | Existing tests for every touched file; attribute-only diffs; no new wrappers (diff review) | all |
| Safety | Guard tests; source grep; `expectNoMutations` | P14 and every page slice |
| Bundle impact | Static-import grep; `npm run build` size note in PRs | P03, P04, P09 |

### 8.4 Fixtures and utilities

- **Fixture guide and fixture page** (test code, introduced in P08): a small component with a button, a repeated list, a dependent select, a menu and a dialog, used by P08 to P16.
- **`assertGuideIntegrity(guide)`** (P11): lint plus key existence, called by every page test.
- **`renderWithSupport(ui, { user, route })`** (P08): wraps the existing providers, an auth user with a given `permissions` map and workflow, the host and a router.
- **`mockRect(element, rect)`** (P02): jsdom has no layout; rects are injected.
- **`expectNoMutations(page, { allow })`** (P14, Playwright).
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
| End to end | `npx playwright test --project=support` and `--project=mobile-360` (needs `E2E_ADMIN_PASSWORD`; `support` project added in P09) | `playwright.config.ts` |

---

## 9. Risks, assumptions and unresolved decisions

### 9.1 Risks

| # | Risk | Impact | How the sequence addresses it |
|---|---|---|---|
| R1 | **The one-page-per-slice rule and the 1,000-line target conflict for most pages.** One page needs roughly 100 to 1,000 lines of tour code; only the largest pages reach 800. Combining two pages in one slice is forbidden. | 60 page slices are estimated below 150 lines and 3 between 150 and 199 (list in 6.0). | Same-page slices were merged wherever the merged size stayed within 300; first-use shared work is bundled into the first page that needs it; the remainder are documented exceptions, not padded. Decision D1 asks the reviewer to accept a floor for single-page slices. |
| R2 | **Annotation drift.** A developer renames or deletes a `data-tour` attribute, or restructures JSX so an id lands on a different element. | A step silently skips or points at the wrong control. | Per-guide fixture test that every step resolves in at least one rendered state; the route and key guards; `tourProps` format check; the `data-tour` id is the only coupling (no CSS or text coupling). |
| R3 | **Hand-rolled tables and pagination** on many pages (F7) instead of the shared `DataTable`. | Repeat annotation is per page; inconsistent markup. | Same `repeat` rule on any element; each page slice annotates its own rows; no refactor to `DataTable` (out of scope). |
| R4 | **`Modal` and `SlideOver` have no focus trap, render inline, close on a document Escape listener and animate out with framer-motion.** | Focus handling and false "lost target" during exit animations. | 600 ms exit grace and layer scoping (P13); Esc arbitration (P07, P13); tested with the real components, not mocks. |
| R5 | **`DropdownMenu` portals to `body` and closes on outside click.** | Interacting with tour UI could close the menu being explained. | Tour UI is stopped from reaching the menu's document handler only for its own subtree; tested against the real `DropdownMenu` (P13). |
| R6 | **Placeholder controls on pages**: static `disabled` Previous / Next (Clients, Contracts, Invoices, Quotations), `disabled` "more (soon)" (Categories), unwired disabled button (Staff dashboard). | Explaining them would state something false. | Excluded and listed (3.4); tests assert they carry no `data-tour`. If the team wires one later, a follow-up slice adds its step. |
| R7 | **Escape means two things** when a nested layer is open. | Accidental tour exit, or a dialog that will not close. | Decision rule 4.14-3; tested with a real `Modal`; revisit only on evidence. |
| R8 | **jsdom has no layout; Playwright needs a seeded server.** | Geometry (spotlight position, scroll, 360 px) cannot be proven in unit tests, and CI may skip the end-to-end project. | Logic is tested with stubbed rects; Playwright adds geometry; the skip rule matches the existing mobile suite; nothing essential is proven only end to end. |
| R9 | **The form builder autosaves every document change.** | A "try-it" edit would persist data. | Every editing control in the builder is explain-only (invariant I7); the builder's end-to-end case asserts the document JSON and the network log are unchanged. |
| R10 | **Inert shell controls**: header search input (no handler) and sidebar "New entry" (never given a handler). | Explaining them as functional would be wrong; but they are on every page. | Not annotated; recorded in P12 and in 3.4; reported to the team as a finding, not fixed here. |
| R11 | **Bundle size and i18n.** All locale files are statically imported (F10); support copy for the whole app could add hundreds of kilobytes per language. | Slower first load for everyone. | Copy and guides are lazy (P03, P04); a test forbids static imports; the build size is recorded in P09's PR. |
| R12 | **Stale permissions.** `permissions` come from `/auth/me`. | A step for a control the user can no longer use. | Eligibility recomputes on `permissionsVersion`; and the control must also exist in the DOM, so a stale map cannot produce a step for something not rendered. |
| R13 | **Estimate uncertainty (about +/-30%) for the profiled pages** (`ev: P`, section 3). | A slice could exceed 300 or fall short of its estimate. | Re-inventory is task 2 of each such slice; rule 4.14-2 (split at a state boundary rather than exceed the band). |
| R14 | **Read-only POST endpoints** (pricing test calculator, upload preview) would trip a naive "no POST" check. | False failures, or pressure to loosen the check. | Explicit per-endpoint allow-list in `expectNoMutations`, named in the PR that adds the page. |
| R15 | **Translation volume.** Roughly 1409 steps, each with a required title and body in `en` and `sq`, plus optional hints. | Review and consistency burden; Albanian awaits native review (TD-019). | Shared guidance covers common controls once; copy is added slice by slice; `el` and `it` fall back to English. |
| R16 | **Mobile layering.** The bottom sheet, the impersonation banner (z-index 1000, bottom), the sales script panel (right) and the off-canvas sidebar compete for space. | A target hidden behind the sheet or banner. | `--z-tour` above 1000; the host passes the sheet height to scroll logic; Playwright 360 px case on every page. |
| R17 | **Dashboard variant arrives asynchronously.** | Support shows no guide for a moment on `/dashboard`. | The panel says the page is still loading; no wrong guide is ever offered. |
| R18 | **A lazy chunk fails to load** (offline, deploy in progress). | Support appears dead. | The panel shows an error with Retry, never a silent failure. |
| R19 | **Foundation proves wrong on real data.** | Rework across many slices. | Pilot gate (S05 and S05) before any other page; decision rule 4.14-1. |

### 9.2 Decisions to confirm (the plan assumes the answers shown)

| # | Decision | Assumed answer | Affects |
|---|---|---|---|
| D1 | Accept page slices below the 800 to 1,200 band? Pages are never bundled: a slice is exactly one page, so small pages stay small and are described in full instead. | Yes, listed in 6.0 | 60 slices |
| D2 | Offer a tour automatically on a user's first visit to a page? | No (A5) | P09 only if changed |
| D3 | Keep progress in `localStorage` or in the backend? | `localStorage`; backend untouched (A4) | P04 |
| D4 | Hand-written overlay or a tour library? | Hand-written (4.5, rule 4.14-1) | P05 to P08 |
| D5 | Treat role dashboards as separate pages? | Yes (A2); if they are one page, up to three of the six dashboard slices could be combined | dashboard slices |
| D6 | Include the sign-in family (`/login`, forgot / reset password, invitation pages)? | No; single forms outside `AppLayout`, self-explanatory | none (a later slice would need a separate launcher) |
| D7 | Fix the inert header search and "New entry" controls? | Out of scope; reported | P12 |
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
- [x] Shared infrastructure is covered by 16 parts (P01 to P16) delivered in four foundation slices of about 1,000 lines each. **Script:** no slice is above 1,200.
- [x] Every in-scope page has a planned tour (section 7.2). **Script:** every page has at least one slice, and no slice is attached to more than one page.
- [x] No slice implements tours for more than one page (the slice record carries exactly one page id or none). **Script.**
- [x] At the 1,000-line target no page needs more than one slice (the largest, the member detail, is about 1,000 lines), so there are no multi-slice pages; small pages are not padded. **Script:** the largest page slice is computed in 6.0.
- [ ] **Production LOC estimates satisfy the 1,000-line target for every slice.** *The four foundation slices do. Of 64 page slices, 60 are below 600 and 3 are between 600 and 799.* Reasons and the proposed options are in R1, D1 and 6.0. No slice exceeds 1,200. **Script:** distribution reported in the table in 6.0.
- [x] Dynamic data and conditional UI are addressed: exemplar rule, observer-based resolution, statuses, permission eligibility, workflow eligibility, hand-off for nested layers (section 4).
- [x] Acceptance criteria and tests are specified for every slice (section 6), with the layers and commands in section 8.
- [x] Dependencies are ordered correctly. **Script:** every dependency points at a lower slice id; no cycles.
- [x] Every runtime state declared applicable for a page is covered by at least one of that page's slices (section 7.3). **Script:** reports zero uncovered cells.
- [x] The plan does not require implementation changes before it is reviewed: it adds one file under `docs/` and changes nothing else.
- [ ] Reviewer confirms decisions D1 to D9 (section 9.2).
- [ ] Reviewer confirms the page definition (A2) and the dashboards-as-separate-pages choice (D5), since the one-page-per-slice rule depends on them.

---
