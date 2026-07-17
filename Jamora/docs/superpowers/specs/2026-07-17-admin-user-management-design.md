# Admin User Management Design

## Goal

Add owner-managed staff accounts to Jamora Admin so each staff member has an
individual login and exactly one operational role. Replace role-shared sessions
with per-user sessions while preserving an environment-backed emergency owner.

## Scope

The feature covers:

- staff user persistence in Strapi/PostgreSQL;
- owner-only user listing and account management in `/admin/settings`;
- create, edit, activate, deactivate, and reset-password operations;
- individual authentication sessions;
- existing path-based role authorization;
- audit logging for staff account changes;
- backward-compatible bootstrap owner access from environment variables.

Customer accounts, invitations by email, password-recovery email, MFA, SSO,
and multi-role accounts are outside this phase.

## Roles

Each staff user has exactly one role:

| Role | Intended access |
| --- | --- |
| `owner` | Full admin, settings, audit, and staff management |
| `warehouse` | Orders, receiving, inventory, suppliers, and purchase orders |
| `content` | Products, promotions, content, and uploads |
| `support` | Orders, customers, and returns |

Existing route permissions in `admin-auth.ts` remain the authorization source,
but identity resolution changes from environment accounts to individual users.

## Data Model

### Staff User

Create a Strapi collection type with:

- `name`: required string;
- `email`: required, normalized lowercase, unique;
- `role`: required enumeration (`owner`, `warehouse`, `content`, `support`);
- `passwordHash`: required private text/string;
- `active`: required boolean, default `true`;
- `sessionVersion`: required non-negative integer, default `0`;
- standard `createdAt` and `updatedAt` timestamps.

`passwordHash` must never be returned to browser-facing callers.
`sessionVersion` invalidates all existing sessions after password reset,
deactivation, or a security-sensitive account change.

## Authentication Architecture

### Passwords

Passwords are hashed server-side with Node's built-in `scrypt`, a random salt,
and timing-safe verification. No plaintext password is persisted or logged.

Minimum password requirements for this demo are 10 characters. The UI reports
validation failures without echoing the submitted password.

### Session Cookie

Successful login creates a signed, expiring session containing:

- staff user document ID;
- normalized email;
- role;
- session version;
- issued-at and expiry timestamps.

The session is signed with `ADMIN_SESSION_TOKEN` using HMAC-SHA256 and stored in
the existing `jamora_admin_session` cookie with `HttpOnly`, `SameSite=Lax`, and
`Secure` in production. Authentication rejects malformed, expired, or modified
cookies.

Protected server pages and mutation APIs resolve the user from Strapi and verify
that the account remains active and the session version still matches. The
lightweight Next proxy may reject clearly invalid sessions early, but backend
checks remain authoritative.

### Bootstrap Owner

`ADMIN_EMAIL` and `ADMIN_PASSWORD` remain an emergency bootstrap owner login.
It is not shown as a normal editable database user. After successful bootstrap
login, it receives an owner session marked as bootstrap identity.

This avoids locking out an existing deployment before the first database owner
is created. The Settings page clearly marks bootstrap access and encourages
creating a named owner account.

## Owner User Management

Add a **Team users** section to `/admin/settings` containing:

- active and inactive user counts;
- searchable user table;
- name, email, role, status, and last-updated columns;
- **Add user** button opening a modal;
- row action for editing identity and role;
- reset-password action;
- activate/deactivate action.

The create form requires name, email, role, and initial password. The edit form
does not display or return the existing password.

Only an authenticated owner may call staff-management endpoints. The system
must reject attempts to:

- deactivate the currently signed-in database user;
- deactivate or demote the last active owner;
- create duplicate emails after normalization;
- assign an unknown role;
- submit weak or empty replacement passwords.

Deleting staff records is excluded. Deactivation preserves audit history and
allows a controlled reactivation.

## API Boundaries

Jamora Admin browser requests use owner-protected Next route handlers under
`/admin/api/users`. Those handlers forward trusted identity headers to private
Strapi operations endpoints.

Staff-user endpoints require a non-empty `JAMORA_ADMIN_API_SECRET` shared only
between the Next and Strapi containers. Strapi rejects requests when the secret
is absent or incorrect; browser-provided role headers alone never authorize
staff management. The public browser only talks to the authenticated Next route.

Required operations:

- `GET /admin/api/users`: list safe staff summaries;
- `POST /admin/api/users`: create a staff user;
- `PATCH /admin/api/users/:documentId`: update name, email, role, or status;
- `POST /admin/api/users/:documentId/reset-password`: set a new password and
  increment session version.

Login uses a private server-side lookup rather than a public Strapi staff-user
endpoint. Error responses use generic login failure messages so callers cannot
enumerate registered staff emails.

## Audit Trail

Create audit records for:

- `staff-user.create`;
- `staff-user.update`;
- `staff-user.activate`;
- `staff-user.deactivate`;
- `staff-user.password-reset`.

Audit metadata may contain changed field names and target identity, but never a
password or password hash.

## Migration and Compatibility

Existing environment role accounts other than the bootstrap owner are removed
from normal authentication after database-backed users are available. The
bootstrap owner remains available for recovery.

No existing product, order, inventory, or storefront data changes. Existing
role navigation and access rules are retained.

## Error Handling

- Strapi unavailable: login and user management return a service error without
  falling back to an unverified database identity; bootstrap owner remains
  available for login.
- Duplicate email: show a field-level conflict message.
- Last owner protection: keep the account unchanged and show the reason.
- Expired or revoked session: clear the cookie and redirect to login.
- Failed mutation: keep the modal values and show a concise error.

## Testing

Unit tests cover:

- password hashing and verification;
- signed-session creation, validation, expiry, and tamper rejection;
- one-role validation;
- last-active-owner and self-deactivation guards;
- safe user serialization without password hashes.

Integration-level route tests or focused controller tests cover:

- owner can create, edit, deactivate, reactivate, and reset a user;
- non-owner receives `403`;
- inactive user cannot log in;
- password reset invalidates an earlier session;
- bootstrap owner can still log in.

Build and lint verification must run for both `jamora-web` and `jamora-strapi`.

## Success Criteria

1. An owner can manage multiple individually identified staff accounts from
   Settings without editing `.env`.
2. Every staff account has exactly one role and sees only its allowed admin
   navigation and routes.
3. Passwords are never stored or returned in plaintext.
4. Deactivation and password reset invalidate existing access.
5. The final active owner cannot be removed or demoted.
6. Existing deployment credentials retain emergency owner access.
