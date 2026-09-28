# Studio Stripe Plan Migration

The authoritative migration command is:

```bash
npm run migrate:stripe-plans -- --dry-run
```

`activate-subscriptions.sh` and `create-stripe-subscriptions.sh` are compatibility wrappers for the same command. The old JSON/Stripe CLI workflows are retired because they could reactivate canceled subscriptions, select the wrong target product, and produce incomplete counts.

See [MIGRATION-EXPLORER-PLAN.md](./MIGRATION-EXPLORER-PLAN.md) for the production runbook.

The two SQL files in this directory are optional Studio database audits. The Stripe migration itself is Stripe-driven because the local subscription table is not a complete record of production Stripe customers.
