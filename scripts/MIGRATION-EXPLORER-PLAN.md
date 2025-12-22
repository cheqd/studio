# Explorer Plan Migration - Quick Reference

This guide provides step-by-step instructions for migrating all customers to the new Explorer plan.

## Overview

The migration happens in **3 stages**:

1. **Stage 1:** Migrate canceled subscriptions
2. **Stage 2:** Migrate trialing subscriptions
3. **Stage 3:** Create subscriptions for customers without any

## Prerequisites

```bash
# 1. Install required tools
brew install jq  # or: apt-get install jq
stripe login     # Authenticate Stripe CLI

# 2. Get your Explorer plan price ID
stripe prices list --product prod_EXPLORER_PLAN_ID
# Copy the price ID (e.g., price_1QYqCEBuiFnKBR8qNnOoP123)

# 3. Set up database access (if not already set)
export EXTERNAL_DB_CONNECTION_URL="postgresql://..."
export EXTERNAL_DB_CERT="..."
```

## Stage 1: Migrate Canceled Subscriptions

### Step 1.1: Export Canceled Subscriptions

Run this query in your database:

```sql
SELECT
    s."subscriptionId",
    s."customerId",
    s."status",
    s."currentPeriodStart",
    s."currentPeriodEnd",
    s."trialEnd",
    c."paymentProviderId",
    c."email",
    c."name"
FROM "subscription" s
INNER JOIN "customer" c ON s."customerId" = c."customerId"
WHERE s."status" = 'canceled'
ORDER BY c."email";
```

### Step 1.2: Save to JSON

Convert query results to JSON format and save to `scripts/subscriptions-to-activate.json`:

```json
[
  {
    "subscriptionId": "sub_abc123",
    "customerId": "cust_123",
    "status": "canceled",
    "paymentProviderId": "cus_stripe123",
    "email": "user@example.com",
    "name": "John Doe"
  }
]
```

### Step 1.3: Dry Run

```bash
cd /Users/sownakroy/project/studio
./scripts/activate-subscriptions.sh price_YOUR_EXPLORER_PRICE_ID --status canceled --dry-run
```

**Review the output carefully:**

- Check number of subscriptions
- Verify customer emails
- Confirm actions that will be performed

### Step 1.4: Execute Migration

```bash
./scripts/activate-subscriptions.sh price_YOUR_EXPLORER_PRICE_ID --status canceled
```

Type `yes` when prompted to confirm.

### Step 1.5: Verify

```bash
# Check the log file
cat scripts/subscription-activation-*.log | grep "SUCCESS"
cat scripts/subscription-activation-*.log | grep "ERROR"

# Verify in Stripe
stripe subscriptions list --status active --limit 10

# Verify in database
# Run: SELECT count(*), status FROM subscription WHERE status='active' GROUP BY status;
```

**Wait and monitor before proceeding to Stage 2.**

---

## Stage 2: Migrate Trialing Subscriptions

### Step 2.1: Export Trialing Subscriptions

Run this query in your database:

```sql
SELECT
    s."subscriptionId",
    s."customerId",
    s."status",
    s."currentPeriodStart",
    s."currentPeriodEnd",
    s."trialEnd",
    c."paymentProviderId",
    c."email",
    c."name"
FROM "subscription" s
INNER JOIN "customer" c ON s."customerId" = c."customerId"
WHERE s."status" = 'trialing'
ORDER BY c."email";
```

### Step 2.2: Save to JSON

Save results to `scripts/subscriptions-to-activate.json` (same file, overwrite).

### Step 2.3: Dry Run

```bash
./scripts/activate-subscriptions.sh price_YOUR_EXPLORER_PRICE_ID --status trialing --dry-run
```

### Step 2.4: Execute Migration

```bash
./scripts/activate-subscriptions.sh price_YOUR_EXPLORER_PRICE_ID --status trialing
```

Type `yes` when prompted.

### Step 2.5: Verify

Check logs and Stripe dashboard as in Stage 1.

**Wait and monitor before proceeding to Stage 3.**

---

## Stage 3: Create Subscriptions for New Customers

### Step 3.1: Export Customers Without Subscriptions

Run this query in your database:

```sql
SELECT
    c."customerId",
    c."name",
    c."email",
    c."paymentProviderId",
    u."logToId" as "logtoUserId"
FROM "customer" c
INNER JOIN "user" u ON c."customerId" = u."customerId"
WHERE c."customerId" NOT IN (
    SELECT DISTINCT "customerId"
    FROM "subscription"
)
ORDER BY c."email";
```

### Step 3.2: Save to JSON

Save results to `scripts/customers-without-subscriptions.json`:

```json
[
  {
    "customerId": "cust_456",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "paymentProviderId": "cus_stripe456",
    "logtoUserId": "logto_123"
  }
]
```

### Step 3.3: Dry Run

```bash
./scripts/create-stripe-subscriptions.sh price_YOUR_EXPLORER_PRICE_ID --dry-run
```

### Step 3.4: Execute Creation

```bash
./scripts/create-stripe-subscriptions.sh price_YOUR_EXPLORER_PRICE_ID
```

Type `yes` when prompted.

### Step 3.5: Verify

Check logs and verify in Stripe/database.

---

## Final Verification

### Check Subscription Counts

```sql
-- Count by status
SELECT status, COUNT(*) as count
FROM "subscription"
GROUP BY status;

-- Should show most/all as 'active'
```

### Verify in Stripe

```bash
# List all active subscriptions
stripe subscriptions list --status active --limit 100

# Check a few specific subscriptions
stripe subscriptions retrieve sub_xxx
```

### Check Webhook Logs

Monitor Studio's webhook logs to ensure all subscription events were processed correctly.

---

## Troubleshooting

### "Subscription not found"

- Subscription may have been deleted from Stripe
- Verify with: `stripe subscriptions retrieve sub_xxx`

### "No default payment method"

- Customer needs to add payment method
- Cannot activate without payment method

### "Invalid status transition"

- Subscription may already be active
- Check current status in Stripe dashboard

### Failed Payments

- Some customers may have expired cards
- Monitor Stripe dashboard for failed payment attempts
- Consider sending payment update reminders

---

## Important Notes

### What Happens During Migration

**Canceled Subscriptions:**

- NEW subscription created (new subscription ID)
- Old canceled subscription remains in history
- Customer charged at Explorer plan price

**Trialing Subscriptions:**

- SAME subscription ID (updated in place)
- Trial ends immediately
- Price changed to Explorer plan
- No prorations applied
- Customer charged immediately

**New Subscriptions:**

- Brand new subscription created
- Explorer plan price applied
- Customers charged based on billing cycle

### Communication

Consider notifying customers before migration:

- Email about plan changes
- Explain new pricing
- Provide support contact
- Give them time to update payment methods if needed

### Rollback Considerations

Full rollback is difficult because:

- Canceled subscriptions get new IDs
- Trialing subscriptions have price changed and trial ended
- Customers may have been charged

**Always use dry-run first and test with small batches!**

---

## Quick Command Reference

```bash
# Stage 1: Canceled
./scripts/activate-subscriptions.sh price_XXX --status canceled --dry-run
./scripts/activate-subscriptions.sh price_XXX --status canceled

# Stage 2: Trialing
./scripts/activate-subscriptions.sh price_XXX --status trialing --dry-run
./scripts/activate-subscriptions.sh price_XXX --status trialing

# Stage 3: New Customers
./scripts/create-stripe-subscriptions.sh price_XXX --dry-run
./scripts/create-stripe-subscriptions.sh price_XXX

# Verification
stripe subscriptions list --status active --limit 100
stripe prices retrieve price_XXX
```

---

## Related Documentation

- `README-SUBSCRIPTION-ACTIVATION.md` - Detailed guide for subscription activation
- `README-SUBSCRIPTION-MIGRATION.md` - Guide for creating new subscriptions
- `find-subscriptions-to-activate.sql` - SQL query templates
- `find-customers-without-subscriptions.sql` - SQL query templates
