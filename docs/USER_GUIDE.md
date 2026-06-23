# Commission Tracker — User Guide

This is the everyday guide to the Commission Tracker: what it is, how the numbers
work, how it helps Adrian, and how to actually use each screen. For deployment,
see `docs/DEPLOY_VERCEL.md`.

---

## 1. What it does

The Commission Tracker replaces the per-recruiter commission spreadsheet with a
secure web app. It runs the same draw-against-commission math the spreadsheet
does, but with logins, per-recruiter privacy, an audit trail, and an optional
automatic placement feed from Loxo.

For each recruiter and year it tracks:

- the annual billings goal and progress toward it,
- the salary/draw paid each pay period (treated as an advance against commission),
- commission earned from paid placements,
- the monthly payout (a configurable percentage, default 90%, of commission after
  the draw is recovered),
- the quarterly true-up that releases the held-back remainder,
- a running balance (negative means draw has been advanced ahead of earnings),
- manual adjustments and split payouts.

Everyone with a login sees the dashboard. Recruiters see **only their own**
numbers. Admin and owner accounts see everyone and can edit plans, placements,
and adjustments.

---

## 2. How the commission math works

This mirrors the source spreadsheet exactly. The balance is the heart of it.

**Draw is an advance.** Every pay period the recruiter is paid their salary (the
"draw"). Because that money is advanced against commission they have not earned
yet, each draw pushes the running balance **down**.

**Commission is earned on paid placements.** When a placement's status is `PAID`,
its commission is `bill amount × commission rate` — unless a payout override is
set (used for splits, e.g. "split with Aaron"), in which case the override is the
commission. Pending and canceled placements are visible but earn nothing.

**Monthly payout (default 90%).** In a month where commission is earned, the
recruiter is paid the monthly rate (default 90%) of that month's commission,
minus the draws already advanced that month, plus any negative balance still owed
from before. The remaining ~10% is **held back**. In a month with no commission,
no monthly payout is released — the held-back amount simply stays in the balance.

**Quarterly true-up.** At the end of each quarter, if the balance is positive
(meaning held-back commission has accumulated beyond what's been paid), the whole
positive balance is paid out. If the balance is negative, nothing is paid and the
shortfall carries into the next quarter — exactly like the spreadsheet's
"Prior Quarter" carry.

**Reading the balance.**
- Negative balance → the recruiter has been advanced more draw than they've earned;
  future commission recovers it first.
- Positive balance → earned commission is sitting and available, waiting for the
  next monthly payout or quarterly true-up.

The full row-by-row ledger on each recruiter's page shows every draw, monthly
close, and quarterly true-up with the running balance, so any figure can be traced.

> The engine is covered by unit tests in `src/lib/commission-engine.test.ts` that
> assert these behaviors (90% monthly payout, holdback preserved through dry
> months, quarterly true-up release, draw-only negative carry, split overrides).

---

## 3. How it helps Adrian

- **One source of truth.** No more separate spreadsheet tabs per recruiter that
  drift apart. Plans, placements, balances, and payouts live in one database.
- **Privacy by default.** Recruiters log in and see only their own compensation.
  Adrian and Aaron (admin/owner) see the whole team.
- **Less manual entry.** The Loxo webhook can create placements automatically when
  someone is placed, so paid placements flow into the math without re-keying.
- **An audit trail.** Every sign-in and every change to a plan, placement, or
  adjustment is logged with who did it and when — a real control layer for
  sensitive payroll data.
- **Traceable numbers.** The ledger shows each draw, payout, and true-up, so a
  recruiter's question ("why is my balance X?") has a line-by-line answer.
- **Splits and one-offs handled cleanly.** Payout overrides cover split deals;
  manual adjustments cover bonuses and corrections, each with a private reason.

---

## 4. Roles

| Role | Sees | Can edit |
|---|---|---|
| `RECRUITER` | Only their own dashboard, ledger, and placements | Nothing |
| `OWNER` | Everyone | Plans, placements, adjustments, recruiters |
| `ADMIN` | Everyone | Plans, placements, adjustments, recruiters, audit log |

Keep the number of admin/owner accounts small — only the people who legitimately
need to see every recruiter's numbers.

---

## 5. Using each screen

### Dashboard
The landing page after sign-in. Shows year-to-date totals (billings, commission,
draw paid, paid out) and a per-recruiter table with goal progress and ending
balance. Click a recruiter to open their detail page.

### Recruiters
Lists recruiters (all of them for admins; just themselves for recruiters). Admins
get an **Add recruiter/login** form here that creates a login and, for the
recruiter role, a linked recruiter profile. Use a temporary password and have the
person change it after first sign-in.

### Recruiter detail
The full picture for one recruiter and year:
- KPI cards (annual goal, sales to date, commission earned, ending balance),
- the row-by-row commission **ledger**,
- the **placements** feeding the ledger,
- and, for admins, three forms:
  - **Annual plan** — set the year, annual goal, commission rate (as a decimal,
    e.g. `0.10` for 10%), salary per pay period, pay frequency (semi-monthly,
    bi-weekly, monthly), monthly payout rate (e.g. `0.90`), opening balance, and
    whether quarterly true-up is on.
  - **Add placement** — name, client, candidate, payment date, bill amount,
    optional payout override (for splits), status, and a private note. Only `PAID`
    placements earn commission.
  - **Add manual adjustment** — a dated amount with a kind (commission, draw,
    payout, or manual correction) and a private reason.

Switch the year with `?year=2025` on the URL.

### Placements
A flat feed of recent placements (all recruiters for admins; own for recruiters)
with status badges. Only `PAID` placements flow into commission earned.

### Audit log (admin only)
Recent sign-ins and administrative changes — actor, action, entity, and metadata.

### Settings
A read-only checklist of the deployment-level environment settings (database,
session secret, encryption key, Loxo secret, base URL) so you can confirm the
environment is configured before handling real compensation data.

---

## 6. Setting up a recruiter (typical flow)

1. **Recruiters → Add recruiter/login.** Create the login (role `RECRUITER`) with a
   temporary password. This also creates their recruiter profile.
2. Open the new recruiter from the list.
3. **Annual plan** form: enter goal, commission rate, salary per pay period, pay
   frequency, monthly payout rate, and opening balance (carry any prior-year/quarter
   balance here). Save.
4. Add placements manually, or let the Loxo webhook create them.
5. The dashboard and ledger update immediately.

---

## 7. Private notes and security

- Placement notes and adjustment reasons are **encrypted** before they're stored,
  using `APP_ENCRYPTION_KEY`. They are not stored or logged in plain text.
- Logins use hashed passwords and a signed, HTTP-only session cookie.
- The Loxo webhook only accepts requests whose HMAC signature matches
  `LOXO_WEBHOOK_SECRET`.
- See `docs/SECURITY.md` for the full security notes and operational checklist.

---

## 8. Before using it for real payroll

The engine reproduces the spreadsheet's logic and is unit-tested, but before it
drives an actual payroll run, reconcile it once: pick a couple of real historical
months, enter the same plan and placements, and confirm the app's ledger matches
what the spreadsheet produced. `docs/SPREADSHEET_MAPPING.md` lists the specific
points to confirm with Adrian.
