# Milestone 1 security review (NFR-SEC-01, NFR-SEC-02)

| | |
|---|---|
| Date | 30.09.2026 (Slice 15) |
| Scope | Everything Milestone 1 changed, `bd39007..m1-slice-15-hardening`, in `backend/src` and `frontend/src`: about 23k changed lines. Tests excluded. |
| Method | The `/security-review` process. Candidate vulnerabilities were traced from request to data, and only findings at ≥ 8/10 confidence were kept. The automated checks in §4 run in CI on every push. |

## 1. Findings

| # | Finding | Severity | Status |
|---|---|---|---|
| 1 | **A demoted Business Owner kept Administrator rights.** The platform's ownership handovers (suspend, reactivate, delete a Business Owner) wrote only the legacy `User.role`, but permissions come from `User.roleId` (Slice 3). "Keep current ownership" returned the original owner as STAFF with their Administrator role intact. They could then sign in and demote or deactivate the new owner. A promoted stand-in got no Administrator rights at all. | Medium | **Fixed** in `0bfbb25`. Every handover writes `roleId` with `role` and clears the access cache. A migration repairs users already left inconsistent. Test: `ownershipTransferRoles.test.ts`. |
| 2 | **Form submissions were gated on the wrong key.** The routes accepted `companies.view`, while the use case requires `forms.manage`. Not exploitable, because the use case refused the request, but the route gate and the rule disagreed. Found by the generated permission matrix. | Low | **Fixed** in `765f718`. The routes require `forms.manage`, as the frontend already did. |

## 2. Hardening done in this slice (NFR-SEC-02)

- **Session token:** the JWT is no longer echoed in the login response body, which had undone the `HttpOnly` cookie. It lives in the cookie only.
- **Rate limits:** password reset, invitation accept and change-password now share the auth rate limiter (10 attempts per 15 minutes per IP), like login and reset request already did.
- **CORS:** `http://localhost:*` is allowed only outside production.
- **HTTPS:** HTTP → HTTPS redirect and `Strict-Transport-Security` on the Hostinger frontend (`frontend/public/.htaccess`). The API already sent HSTS through helmet.
- **Verified by tests named NFR-SEC-02:**
  - bcrypt cost ≥ 10;
  - the cookie is `HttpOnly; Secure; SameSite=None` in production;
  - no token in the login body;
  - HSTS present;
  - the new limits return 429;
  - the CORS rule.

## 3. Known risks, accepted for Milestone 1

These are recorded rather than fixed. None is exploitable with the default roles, and each has a mitigation in place.

| Risk | Why it is accepted / mitigation |
|---|---|
| **No CSRF token**, although the cookie is `SameSite=None`. | The CORS origin check rejects any request whose `Origin` is not the configured frontend, and browsers send `Origin` on cross-site POST, PUT, PATCH and DELETE. So a forged cross-site write never reaches a route. Revisit if the frontend and API ever share a registrable domain (then use `SameSite=Lax`). |
| **No token revocation.** A stolen JWT is valid until it expires (24 h by default). | Deactivation and tenant suspension are checked against the database on every request, so the Administrator can cut a user off at once. Lower `JWT_EXPIRATION` if a shorter window is wanted. |
| **`/uploads` is served without authentication.** | Filenames are random UUIDs and never listed. Only avatars, branding and form images live there. This predates Milestone 1. |
| **A custom role holding `users.manage` can assign the Administrator role.** | By design, only the Administrator holds `users.manage` in the default matrix, and it already has `roles.manage`. Anyone creating a custom role with `users.manage` should treat it as Administrator-equivalent. |
| **Field redaction checks whether `commercial.view` / `payments.view` is held, not its scope.** A custom role with that permission at OWN scope sees amounts on every record it can reach. | No default role is affected. Record access is still limited by the record scope. |
| **A quotation's public share link shows prices.** A custom role with `quotations.manage` but not `commercial.view` could open it. | No default role has that combination. |
| **`CancelInvitation` deletes by id without a tenant check.** | Invitation ids are random UUIDs, and the route needs `users.manage`. This predates Milestone 1. Add the tenant filter when that module is next touched. |
| **The CORS allowlist still names the Neva CRM origins** (`neva-crm.vercel.app`, `nevacrm.eu`). | Those domains are operated by the same developer. **Remove them before go-live** so that only `FRONTEND_URL` is trusted. |

## 4. Automated checks in CI

- **`routeCoverage.test.ts`:** every tenant route declares a permission or is in a reviewed exemption list with a reason. A stale exemption fails too.
- **`permissionMatrix.test.ts`:** generated from the live router, so every gated route (144) is checked for each of the five roles against the SRS §4.2 matrix.
- **`securityMiddleware.test.ts` and `auth.integration.test.ts`:** the NFR-SEC-02 checks above.

## 5. Checked and found sound

- Permission middleware order (authenticate → resolve tenant → load access). A token whose tenant does not match the URL is refused.
- The access cache is keyed per user and cleared on role, permission and user changes. Impersonation is never cached.
- Record scope and IDOR: clients, contacts, timeline, activity feed, contracts, payments, quotations, invoices and appointments all load by tenant and apply the viewer's scope, returning 404 outside it.
- Raw SQL: every value is a bound parameter, and `Prisma.raw` is used only with constant identifiers. No `$queryRawUnsafe` is used anywhere.
- The audit trail is append-only, with no update or delete route. Secrets are recorded as "changed", and the CSV export guards against spreadsheet formula injection.
- Lookups, status labels and workspace settings writes are tenant-scoped and require `settings.manage`.
- Media: branding needs `settings.manage`, and file removal has a path-traversal guard.
- Invitation and password-reset tokens are 32 random bytes, expire and are single-use.
- The legacy migration CLI is operator-run, uses Prisma's query API only, and its CSV report is formula-guarded.
