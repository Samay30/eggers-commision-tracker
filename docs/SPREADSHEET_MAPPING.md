# Spreadsheet mapping

The workbook supplied with the build request has two sheets: a senior recruiter example and a junior recruiter example. Each sheet follows the same conceptual pattern even when the example values differ.

## Workbook concepts

| Spreadsheet concept | App entity / field | Notes |
|---|---|---|
| Employee | `User` + `Recruiter` | A user login may have a linked recruiter profile. Admin/owner accounts do not need a recruiter profile. |
| Commission Rate | `CommissionPlan.commissionRate` | Stored as a decimal, e.g. `0.10` for 10%. |
| Annual Goal | `CommissionPlan.annualGoal` | Used for annual goal progress and remaining goal. |
| Salary Per Pay Period | `CommissionPlan.salaryPerPayPeriod` | Treated as a recoverable draw. |
| Prior year / prior quarter balance | `CommissionPlan.openingBalance` | Carry negative draw balances or positive balances into the year. |
| Pay-period rows | Generated ledger `DRAW` rows | Semi-monthly by default, with configurable pay frequency. |
| Monthly Sales | Paid `Placement.billAmount` grouped by `paymentDate` month | Pending placements are visible but excluded from commission earned. |
| Monthly Commission | `billAmount * commissionRate`, unless `payoutOverride` exists | Overrides handle special splits such as “split with Aaron.” |
| Monthly 90% logic | `CommissionPlan.monthlyPayoutRate` | Defaults to `0.90`, configurable per recruiter/year. |
| Quarterly commission / true-up | `CommissionPlan.quarterlyTrueUp` | If enabled, positive held-back balance is paid at quarter end. |
| Paid column | Ledger payout rows | The app separates draw paid and commission payout paid. |
| Annual check | Ledger summary | Sales to date, remaining goal, commission earned, draw paid, paid out, ending balance. |

## Balance sign convention

- Positive balance means earned commission remains available to pay.
- Negative balance means draw has been paid ahead of earned commission and must be recovered.

## Sensitive data handling

The app intentionally does **not** store or ship the spreadsheet file. Data should enter through admin forms or the signed Loxo webhook. Private notes are encrypted before database storage.

## Engine behavior (matches the spreadsheet)

The engine reproduces the spreadsheet's draw-against-commission logic. In particular:

1. Monthly payout = `monthlyPayoutRate` (default 90%) of that month's commission, after
   recovering the month's draw, and it only fires in a month where commission exceeds the
   draw. In a dry month no monthly payout is released.
2. The held-back remainder (the `1 - monthlyPayoutRate` slice) stays in the balance and is
   released by the quarterly true-up, which pays out the full positive balance at quarter end.
3. Split payouts are entered as a placement with a payout override (the override becomes the
   commission for that placement).
4. The annual goal drives reporting/progress only; it does not gate payout.
5. A negative balance (unrecovered draw) carries forward across months and quarters, exactly
   like the spreadsheet's "Prior Quarter" carry. Positive held-back commission is never
   released early.

These behaviors are pinned by tests in `src/lib/commission-engine.test.ts`.

## Before payroll use

Still reconcile once against reality: take a couple of real historical months, enter the same
plan and placements, and confirm the app's ledger matches the spreadsheet's output before the
app drives an actual payout decision. Confirm the intended `monthlyPayoutRate` and pay
frequency per recruiter with Adrian.
