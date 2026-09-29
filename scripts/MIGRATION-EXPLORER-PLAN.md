# Explorer, Basic, and Build Migration Runbook

## Policy

- Explorer-only customers move to the new Basic product.
- Customers with any legacy Basic, Custom, Build, or other non-Explorer product move to Build.
- The new Basic and Build products are treated as final states, making the script safe to rerun.
- A moved subscription gets one calendar month of trial, no proration, then uses automatic charging.
- If no default payment method exists at trial end, Stripe cancels the subscription instead of creating an unpayable invoice.
- Canceled and expired historical subscriptions are never reactivated.
- A paused subscription is preserved and replaced with a new trialing target subscription. A rerun detects that replacement and does not create another.
- Overlapping free subscriptions are reported but not canceled. Cancellation is deliberately separate because Studio role reconciliation must consider all remaining subscriptions.

## Stripe Configuration

Production must define:

```dotenv
STRIPE_SECRET_KEY=sk_live_...
STRIPE_BASIC_PLAN_ID=prod_VBtyPtZjlTFc78
STRIPE_BUILD_PLAN_ID=prod_QXNVcrO0kYUnsn
STRIPE_EXPLORER_PLAN_ID=prod_TUNNqwEMASw6Uu
STRIPE_MIGRATION_EXPECTED_ACCOUNT_ID=acct_...
```

The script validates the target products and their default prices before planning changes:

| Target | Default monthly price |
| --- | ---: |
| Basic | USD 20 |
| Build | USD 99 |

Annual prices are not used by this migration.

## Release Sequence

1. Promote and deploy `develop` to `main`.
2. Run database migrations with `npm run migrate`. The current release does not contain a new Studio migration, so a successful no-op is expected when production already has all registered migrations.
3. Confirm the production application has the Basic, Build, and Explorer product environment variables.
4. Run the Stripe dry run from a clean checkout of `main`:

   ```bash
   npm ci
   npm run migrate:stripe-plans -- --dry-run --env-file .env.production
   ```

5. Review the displayed counts and the time-ordered JSONL audit log under `scripts/output/`. Pay particular attention to `blocked`, customers without a default payment method, and overlapping subscriptions.
6. Review any subscriptions blocked by an existing discount. Approved exceptions must be processed as a separate targeted batch using `--clear-existing-discounts` and one or more explicit `--customer` IDs. The override cannot be used for an unscoped full batch.

   ```bash
   npm run migrate:stripe-plans -- --dry-run \
     --env-file .env.production \
     --customer cus_approved \
     --clear-existing-discounts
   ```

7. Run a canary for one known Stripe customer:

   ```bash
   npm run migrate:stripe-plans -- --execute \
     --env-file .env.production \
     --customer cus_... \
     --expected-account acct_... \
     --confirm APPLY_STUDIO_PLAN_MIGRATION
   ```

8. Verify the canary in Stripe: target monthly price, `trialing` status, expected trial end, and no immediate invoice or proration.
9. Rerun the full dry run. The canary should now appear under `alreadyOnTarget`.
10. Execute the complete migration:

    ```bash
    npm run migrate:stripe-plans -- --execute \
      --env-file .env.production \
      --expected-account acct_... \
      --confirm APPLY_STUDIO_PLAN_MIGRATION
    ```

11. Rerun the dry run. `affectedCustomers` should be `0`; only no-op or explicitly blocked records should remain.

## Output And Safety

Every run prints its affected-customer count before any mutation and writes `scripts/output/studio-plan-migration-<UTC timestamp>-<mode>.jsonl`. Log records are sorted by UTC timestamp and sequence and include the complete customer-level plan and mutation result.

Execution stops before mutation when:

- the connected Stripe account differs from the expected account;
- Basic is not active with a USD 20 monthly default price;
- Build is not active with a USD 99 monthly default price;
- the targets are not live-mode products and prices;
- a subscription being moved has an existing discount that requires a billing decision;
- any customer plan is blocked; or
- the explicit confirmation token is missing.

The script does not modify Studio database rows. Stripe webhooks remain responsible for subscription synchronization, so webhook delivery and failures must be monitored throughout execution.
