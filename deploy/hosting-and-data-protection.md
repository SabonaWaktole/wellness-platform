# Hosting and personal-data processing (NFR-SEC-03)

Where the Wellness Albania platform runs, what personal data it holds, and how
that data is protected, kept and removed. This is the record the SRS asks for
under NFR-SEC-03. It describes the system as built at the end of Milestone 1;
update it whenever hosting, a sub-processor or a stored category of personal
data changes.

Fields marked **TO CONFIRM** need an answer from whoever holds the Hostinger
account before sign-off.

---

## 1. Where the system is hosted

| Component | Provider | Location |
|---|---|---|
| Frontend (static SPA, `frontend/dist`) | Hostinger web hosting | EU. Datacentre: **TO CONFIRM** (hPanel → Hosting → Plan details → Server location) |
| API (Node.js, `backend/dist`) | Hostinger (same account) | EU, same datacentre as above: **TO CONFIRM** |
| Database (MySQL 8) | Hostinger managed MySQL | EU, same datacentre: **TO CONFIRM** |
| Uploaded images (`backend/uploads/`) | The API server's disk | Same as the API |
| Backups | See §5 | EU: **TO CONFIRM** |

Staging and production are separate Hostinger sites with separate databases,
both in the EU. No component runs outside the EU, so personal data does not
leave the EU/EEA through hosting.

Everything is served over HTTPS only: Hostinger's *Force HTTPS*, the redirect in
`frontend/public/.htaccess`, and `Strict-Transport-Security` from both the
frontend and the API (helmet). See `deploy/DEPLOY.md` §4 for the checks.

## 2. Sub-processors

| Sub-processor | What it receives | Why |
|---|---|---|
| Hostinger | Everything in §3, stored at rest | Hosting, database, backups |
| The SMTP provider configured in `SMTP_HOST` (Hostinger Mail unless changed: **TO CONFIRM**) | A user's email address and name, and a one-time link | Invitation and password-reset emails only |

The platform sends nothing else to a third party: no analytics, no tracking
pixels, no external fonts or scripts loaded at runtime with personal data.

## 3. Personal data held

**Data subjects:** Wellness Albania's staff (the platform's users), and the
contact people at the companies they sell to. Companies themselves are legal
persons, but a sole trader's company record can identify a person, so company
contact fields are treated as personal data too.

| Category | Where (table.columns) | Who can see it |
|---|---|---|
| Staff identity | `User.email, firstName, lastName, phone, avatarUrl, language` | Administrators (`users.manage`); name and email are shown to colleagues as assignees |
| Staff credentials | `User.hashedPassword` (bcrypt, cost 10), `PasswordResetToken`, `Invitation` tokens | Nobody: never returned by any endpoint |
| Company contact details | `Client.name, email, phone, streetAddress, taxId, website, customFieldValues` | Per role and scope (§4) |
| Contact persons | `ContactPerson.name, position, phone, email` | Per role and scope (§4) |
| Activity and notes | `Interaction.content`, `Appointment.notes`, `Client.notes` | Per role and scope (§4) |
| Form responses | `FormSubmission.data`, `ipHash` (hashed, never the raw IP), `userAgent` | `forms.manage` (Administrator) |
| Audit trail | `AuditEntry.userId, userRole, entityLabel, changes` (old and new values) | `audit.view` (Administrator, CEO) |

No special-category data (health, religion, and so on) is collected. Nothing
in the schema asks for it, and free-text fields (notes) should not be used for
it. Say this in user training.

## 4. Who can access what

Access is decided by the role and permission matrix (SRS §4.2; in code,
`backend/src/access/domain/DefaultRoleMatrix.ts`), enforced on the server for
every request:

- Every endpoint declares its permission. `routeCoverage.test.ts` and
  `permissionMatrix.test.ts` check every route for every role in CI
  (NFR-SEC-01).
- Data scope: a Sales User sees only their own companies, a Sales Manager sees
  the team's and unassigned ones, and the Administrator and CEO see all.
  Records outside a user's scope return 404.
- Field redaction: users without `commercial.view` / `payments.view` never
  receive amounts, prices or payment rows. Reception sees contract validity
  only.
- Deactivating a user blocks their existing session on the next request.
- Every sensitive change is recorded in the append-only audit trail, with old
  and new values. Passwords and tokens are recorded only as "changed".

## 5. Retention and backups

| Data | Retention |
|---|---|
| Companies | Archiving is a soft delete (`Client.deletedAt`). Archived companies are kept and can be restored by a user with `companies.delete`. |
| Contact persons | Removing a contact is a soft delete (`ContactPerson.deletedAt`). It disappears from every read but stays in the database. |
| Users | Deactivated or soft-deleted (`User.deletedAt`), not removed, so the audit trail keeps a valid author. |
| The whole workspace | Deleting the workspace from the platform console permanently deletes all of its data (the tenant deletion transaction). Only the platform operator can do this. |
| Audit trail | Kept indefinitely. Append-only by design: there is no update or delete path (FR-AUD-05). |
| Form responses | Kept until the form is deleted. |
| Backups | `mysqldump` before every schema upgrade and data migration (`DEPLOY.md` §1, `legacy-client-migration.md` §2), plus Hostinger's automatic daily backups. Where the dumps are kept and for how long: **TO CONFIRM**. |

Wellness Albania decides the retention periods. The platform keeps data until a
person removes it (§6).

## 6. Requests from data subjects

The platform has no self-service GDPR tooling in Milestone 1. Requests are
handled by the Administrator, with the developer's help for erasure:

- **Access (Art. 15):** the Administrator finds the person (a company contact
  via the company search, which matches contact name, phone and email; a staff
  member via Settings → Team) and exports what is shown. The audit log viewer
  exports the history of changes as CSV.
- **Rectification (Art. 16):** edit the record in the app. The change is
  audited.
- **Erasure (Art. 17):** soft deletion in the app is not erasure. For a
  confirmed erasure request, the developer runs a reviewed SQL script
  that permanently deletes the `ContactPerson` row (or blanks the company's
  contact fields) after a backup. `AuditEntry.changes` may still hold earlier
  values of those fields. Wellness Albania decides whether the audit trail is
  kept under its legal-obligation or legitimate-interest basis, or redacted
  too. **TO CONFIRM with Wellness Albania** before go-live.
- **Objection or restriction:** archive the company, which removes it from every
  list and search.

## 7. Security measures (summary)

- **Passwords:** bcrypt with cost 10. The strength rule is at least 8
  characters with upper and lower case letters and a digit.
- **Sessions:** a JWT in an `HttpOnly; Secure; SameSite=None` cookie, never in
  a response body or in `localStorage`. It expires after 24 h.
- **Rate limiting:** 10 attempts per 15 minutes per IP on every
  credential-accepting endpoint.
- **CORS:** only the configured frontend origin.
- **Tenant isolation:** every query is scoped by tenant, and a query without a
  tenant cannot be written.
- **Security review:** see `deploy/security-review-m1.md` for the findings and
  known risks.
