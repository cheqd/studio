# Subscription Activation (Retired Workflow)

Do not reactivate subscriptions from exported Studio database rows. Canceled subscriptions represent an opt-out and the Studio subscription table is not a complete source of production Stripe state.

Use the Stripe-driven dry run and migration documented in [MIGRATION-EXPLORER-PLAN.md](./MIGRATION-EXPLORER-PLAN.md).
