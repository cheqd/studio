# Subscription Activation & Migration Guide

This guide helps you migrate and activate subscriptions by:
- Moving existing subscriptions to a new Stripe price/plan
- Activating trialing subscriptions (ending trial immediately)
- Reactivating canceled subscriptions (creating new subscriptions)

## What This Does

- **Trialing subscriptions**: Migrates to new price AND ends trial immediately, making them active
- **Canceled subscriptions**: Creates NEW subscription with new price (cannot update canceled subscriptions)

## Prerequisites

1. **Stripe CLI** installed and authenticated (`stripe login`)
2. **jq** for JSON processing (`brew install jq` or `apt-get install jq`)
3. **Database access** via `EXTERNAL_DB_CONNECTION_URL` and `EXTERNAL_DB_CERT`
4. **Target Stripe Price ID** - The price ID you want to migrate subscriptions to (e.g., `price_1234567890`)

## Quick Start

```bash
# 1. Run SQL query to find subscriptions
# Copy results from database and save to: scripts/subscriptions-to-activate.json

# 2. Get your target Stripe price ID
stripe prices list --product prod_EXPLORER_PLAN_ID

# 3. Dry run to see what would happen
./scripts/activate-subscriptions.sh price_1234567890 --dry-run

# 4. Activate all subscriptions with new price
./scripts/activate-subscriptions.sh price_1234567890

# 5. Or activate only specific status
./scripts/activate-subscriptions.sh price_1234567890 --status trialing
./scripts/activate-subscriptions.sh price_1234567890 --status canceled
```

## 2-Stage Migration to Explorer Plan

When migrating all customers to a new plan (e.g., "Explorer" plan), use this 2-stage approach:

### Why 2 Stages?

1. **Canceled subscriptions require different handling** - They need NEW subscriptions created (cannot update canceled ones)
2. **Risk mitigation** - Process canceled customers first (lower risk) before active/trialing
3. **Easier troubleshooting** - Smaller batches make it easier to identify and fix issues

### Stage 1: Migrate Canceled Subscriptions

```bash
# Step 1: Query canceled subscriptions
# Run find-subscriptions-to-activate.sql with WHERE filter:
# WHERE s."status" = 'canceled'

# Step 2: Save results manually to JSON
# Copy query results and save to: scripts/subscriptions-to-activate.json

# Step 3: Get your Explorer plan price ID
stripe prices list --product prod_EXPLORER_PLAN_ID

# Step 4: Dry run first
./scripts/activate-subscriptions.sh price_EXPLORER_PLAN_ID --status canceled --dry-run

# Step 5: Execute migration
./scripts/activate-subscriptions.sh price_EXPLORER_PLAN_ID --status canceled
```

**What happens:**
- Creates NEW subscriptions for canceled customers
- Uses Explorer plan price ID
- Old canceled subscriptions remain canceled (new subscription IDs created)

### Stage 2: Migrate Trialing/Active Subscriptions

```bash
# Step 1: Query trialing/active subscriptions
# Run find-subscriptions-to-activate.sql with WHERE filter:
# WHERE s."status" IN ('active', 'trialing')

# Step 2: Save results manually to JSON
# Copy query results and save to: scripts/subscriptions-to-activate.json

# Step 3: Dry run first
./scripts/activate-subscriptions.sh price_EXPLORER_PLAN_ID --status trialing --dry-run

# Step 4: Execute migration
./scripts/activate-subscriptions.sh price_EXPLORER_PLAN_ID --status trialing
```

**What happens:**
- Updates EXISTING subscriptions to new price
- Ends trials immediately (trialing → active)
- No prorations applied
- Same subscription IDs preserved

### Stage 3: Create Subscriptions for Customers Without Any

```bash
# Step 1: Query customers without subscriptions
# Run find-customers-without-subscriptions.sql

# Step 2: Save results manually to JSON
# Copy query results and save to: scripts/customers-without-subscriptions.json

# Step 3: Dry run first
./scripts/create-stripe-subscriptions.sh price_EXPLORER_PLAN_ID --dry-run

# Step 4: Execute creation
./scripts/create-stripe-subscriptions.sh price_EXPLORER_PLAN_ID
```

**What happens:**
- Creates brand new subscriptions for customers with no subscription history
- Uses Explorer plan price ID

## Detailed Steps

### Step 1: Export Subscriptions from Database

Run the SQL query to find subscriptions that need activation:

```bash
# Connect to your database and run:
# scripts/find-subscriptions-to-activate.sql

# The query returns subscriptions with status 'trialing' or 'canceled'
```

**Manual Export:**
1. Copy the query results from your database client
2. Convert to JSON format with required fields:
   - `subscriptionId`: Stripe subscription ID
   - `customerId`: Internal customer ID
   - `status`: Subscription status (trialing/canceled)
   - `paymentProviderId`: Stripe customer ID
   - `email`: Customer email
   - `name`: Customer name
3. Save to: `scripts/subscriptions-to-activate.json`

**JSON Format Example:**
```json
[
  {
    "subscriptionId": "sub_abc123",
    "customerId": "cust_123",
    "status": "trialing",
    "paymentProviderId": "cus_stripe123",
    "email": "user@example.com",
    "name": "John Doe"
  }
]
```

### Step 2: Get Target Price ID

Find the price ID for your target plan:

```bash
# List prices for a product
stripe prices list --product prod_EXPLORER_PLAN_ID

# Or retrieve a specific price
stripe prices retrieve price_1234567890
```

Copy the price ID (e.g., `price_1234567890`) - you'll need it for the migration script.

### Step 3: Test with Dry Run

Always test first to preview what will happen:

```bash
# Test all subscriptions
./scripts/activate-subscriptions.sh price_1234567890 --dry-run

# Test only trialing
./scripts/activate-subscriptions.sh price_1234567890 --status trialing --dry-run

# Test only canceled
./scripts/activate-subscriptions.sh price_1234567890 --status canceled --dry-run
```

Review the dry run output carefully to ensure:
- Correct subscriptions are targeted
- Actions match your expectations
- No unexpected errors

### Step 4: Execute Migration

Once you're confident with the dry run results:

```bash
# Migrate all subscriptions
./scripts/activate-subscriptions.sh price_1234567890

# Migrate only trialing
./scripts/activate-subscriptions.sh price_1234567890 --status trialing

# Migrate only canceled
./scripts/activate-subscriptions.sh price_1234567890 --status canceled
```

You'll be asked to confirm before proceeding. The script will:
- Show a summary of subscriptions to be processed
- Ask for confirmation (type "yes" to proceed)
- Process each subscription with detailed logging
- Generate a log file with all results

## What Happens to Each Status

### Trialing Subscriptions

**Before:**
- Status: `trialing`
- Customer is in trial period
- May have old/different price

**Actions Performed:**
1. Retrieve subscription to get all item IDs
2. Delete all existing subscription items
3. Add new subscription item with target price
4. End trial immediately (`trial_end=now`)
5. Set `proration_behavior=none` (no prorations)

**After:**
- Status: `active`
- Trial ended immediately
- New price applied
- Billing starts now with new price
- Same subscription ID preserved

### Canceled Subscriptions

**Before:**
- Status: `canceled`
- Subscription already canceled
- Cannot be updated (Stripe limitation)

**Actions Performed:**
1. Create NEW subscription for the customer
2. Use target price for the new subscription
3. Set `payment_behavior=default_incomplete`
4. Old canceled subscription remains canceled

**After:**
- Status: `active` (NEW subscription)
- New subscription ID created
- New price applied
- Old canceled subscription ID remains in history
- Customer now has active subscription with new price

**Important:** Canceled subscriptions get brand NEW subscription IDs because Stripe doesn't allow updating canceled subscriptions.

## Script Options

### `activate-subscriptions.sh` Usage

```bash
./activate-subscriptions.sh <price_id> [--dry-run] [--status STATUS]
```

### Arguments

| Argument | Required | Description | Example |
|----------|----------|-------------|---------|
| `price_id` | **YES** | Stripe price ID to migrate subscriptions to | `price_1234567890` |
| `--dry-run` | No | Preview changes without executing | `--dry-run` |
| `--status` | No | Filter by status (trialing\|canceled) | `--status trialing` |

### Examples

```bash
# Dry run - preview all changes
./activate-subscriptions.sh price_1234567890 --dry-run

# Migrate only trialing subscriptions
./activate-subscriptions.sh price_1234567890 --status trialing

# Migrate only canceled subscriptions
./activate-subscriptions.sh price_1234567890 --status canceled

# Dry run for canceled only
./activate-subscriptions.sh price_1234567890 --status canceled --dry-run

# Migrate all subscriptions (trialing + canceled)
./activate-subscriptions.sh price_1234567890
```

## Output Files

1. **subscriptions-to-activate.json** - Source data for the script (manually created from DB query)
2. **subscription-activation-YYYYMMDD-HHMMSS.log** - Execution log with detailed results

## Example Output

### Dry Run Output

```
Running in DRY RUN mode - no subscriptions will be updated

Verifying price exists in Stripe...
✓ Price verified

Found 156 subscriptions to migrate
Target Price ID: price_1QYqCEBuiFnKBR8qNnOoP123

Breakdown by status:
trialing: 98
canceled: 58

Processing subscriptions...

Processing: user1@example.com (Status: trialing)
  Stripe Subscription ID: sub_abc123
  Stripe Customer ID: cus_xyz789
  Current Status: trialing
  [DRY RUN] Would execute:
    1. Retrieve subscription to get all item IDs
    2. Delete all existing subscription items
    3. Add new subscription item with price: price_1QYqCEBuiFnKBR8qNnOoP123
    4. End trial: trial_end=now
    5. Set proration_behavior=none (no prorations)

Processing: user2@example.com (Status: canceled)
  Stripe Subscription ID: sub_def456
  Stripe Customer ID: cus_abc123
  Current Status: canceled
  [DRY RUN] Would execute:
    1. Create NEW subscription for customer: cus_abc123
    2. Use price: price_1QYqCEBuiFnKBR8qNnOoP123
    3. Set payment_behavior=default_incomplete
    (Note: Cannot update canceled subscriptions, must create new one)

========================================
Summary
========================================
Dry run completed - no subscriptions updated
Total subscriptions that would be processed: 156
========================================
```

### Real Execution Output

```
Verifying price exists in Stripe...
✓ Price verified

Found 156 subscriptions to migrate
Target Price ID: price_1QYqCEBuiFnKBR8qNnOoP123

Breakdown by status:
trialing: 98
canceled: 58

This will update 156 subscriptions in Stripe
Actions:
  - Migrate all subscriptions to price: price_1QYqCEBuiFnKBR8qNnOoP123
  - Trialing: End trial immediately (make active)
  - Canceled: Reactivate subscription

Are you sure you want to continue? (yes/no): yes

Logging to: scripts/subscription-activation-20250122-154530.log

Processing subscriptions...

Processing: user1@example.com (Status: trialing)
  Stripe Subscription ID: sub_abc123
  Stripe Customer ID: cus_xyz789
  Current Status: trialing
  Step 1/3: Retrieving subscription details...
  Found 1 subscription item(s)
  Step 2/3: Updating subscription to new price and ending trial...
  Step 3/3: Executing update...
  ✓ Successfully migrated subscription to price_1QYqCEBuiFnKBR8qNnOoP123

Processing: user2@example.com (Status: canceled)
  Stripe Subscription ID: sub_def456
  Stripe Customer ID: cus_abc123
  Current Status: canceled
  Step 1/2: Creating new subscription (cannot update canceled ones)...
  Step 2/2: Executing subscription creation...
  ✓ Successfully created new subscription: sub_newxyz789
  (Old canceled subscription: sub_def456)

========================================
Summary
========================================
Total subscriptions: 156
Successful: 156
Failed: 0
Skipped: 0

Log file: scripts/subscription-activation-20250122-154530.log
========================================
```

## Important Considerations

### ⚠️ Billing Impact

**Trialing → Active with New Price:**
- Customers will be charged immediately at the NEW price
- Trial ends instantly - no grace period
- Make sure payment methods are on file
- Consider notifying customers first about price change
- No prorations applied (clean switch to new price)

**Canceled → Active with New Price:**
- Creates NEW subscription with new price
- Customers will be charged at the new price
- They may have canceled intentionally - review carefully
- Old subscription ID is replaced with new one
- Consider why they canceled before reactivating

### 💡 Best Practices

1. **Always dry-run first** - Preview what will change before executing
2. **Verify price ID** - Double-check you're using the correct target price
3. **Use 2-stage approach** - Process canceled customers first, then trialing/active
4. **Test with small batch** - Start with a few subscriptions if possible
5. **Monitor Stripe dashboard** - Watch for failed payments and errors
6. **Keep all logs** - Save log files for audit trail and troubleshooting
7. **Notify customers** - Email customers about plan changes and price updates
8. **Verify in database** - Check that subscriptions were updated correctly
9. **Check webhook logs** - Ensure Studio's webhook handler processed events correctly

### 🔒 Safety Features

- Confirmation prompt before execution
- Dry-run mode for testing
- Detailed logging of all actions
- Status filtering to process in batches
- Error handling with detailed messages

## Troubleshooting

### "Subscription not found"
- The subscription may have been deleted from Stripe
- Verify: `stripe subscriptions retrieve sub_xxx`

### "Invalid status transition"
- Subscription may already be active
- Check current status in Stripe dashboard

### "No default payment method"
- Customer needs to add a payment method first
- Cannot activate without payment method

### Database Connection Issues
- Verify `EXTERNAL_DB_CONNECTION_URL` is correct
- Check `EXTERNAL_DB_CERT` if using SSL
- Ensure database is accessible

## Advanced Usage

### Process in Batches (Recommended for Large Migrations)

```bash
# Stage 1: Migrate canceled subscriptions first
./scripts/activate-subscriptions.sh price_EXPLORER_PLAN_ID --status canceled

# Wait and monitor for issues in Stripe dashboard and logs

# Stage 2: Migrate trialing subscriptions
./scripts/activate-subscriptions.sh price_EXPLORER_PLAN_ID --status trialing

# Stage 3: Handle customers without any subscriptions
./scripts/create-stripe-subscriptions.sh price_EXPLORER_PLAN_ID
```

### Verify Changes in Stripe

```bash
# Check a specific subscription
stripe subscriptions retrieve sub_xxx

# Verify the price was updated
stripe subscriptions retrieve sub_xxx | grep -A 5 "items"

# List active subscriptions
stripe subscriptions list --status active --limit 10

# Check subscription for a specific customer
stripe subscriptions list --customer cus_xxx
```

### Verify Changes in Database

```sql
-- Check updated subscriptions in Studio database
SELECT
    s."subscriptionId",
    s."status",
    s."customerId",
    c."email"
FROM "subscription" s
INNER JOIN "customer" c ON s."customerId" = c."customerId"
WHERE s."status" = 'active'
ORDER BY s."updatedAt" DESC
LIMIT 20;
```

### Rollback (if needed)

If you need to reverse changes:

```bash
# For trialing subscriptions that were activated:
# WARNING: Cannot restore exact previous state, but can set new trial
stripe subscriptions update sub_xxx -d trial_end=<future_timestamp>

# For canceled subscriptions that were reactivated:
# Cancel the NEW subscription that was created
stripe subscriptions update sub_newxyz789 -d cancel_at_period_end=true
# Or cancel immediately
stripe subscriptions cancel sub_newxyz789
```

**Note:** Full rollback is difficult because:
- Trialing subscriptions had their price changed and trial ended
- Canceled subscriptions got NEW subscription IDs
- Always test with dry-run and small batches first!

## Files in This Migration System

### SQL Queries
1. `find-subscriptions-to-activate.sql` - Finds existing subscriptions (trialing/canceled)
2. `find-customers-without-subscriptions.sql` - Finds customers needing new subscriptions

### Shell Scripts
3. `activate-subscriptions.sh` - Migrates and activates existing subscriptions
4. `create-stripe-subscriptions.sh` - Creates subscriptions for customers without any

### Data Files (Created During Migration)
5. `subscriptions-to-activate.json` - Manually created from DB query results
6. `customers-without-subscriptions.json` - Manually created from DB query results
7. `subscription-activation-*.log` - Execution logs with timestamps

### Documentation
8. `README-SUBSCRIPTION-ACTIVATION.md` - This file
9. `README-SUBSCRIPTION-MIGRATION.md` - Guide for creating new subscriptions

## Complete Migration Workflow

### For Explorer Plan Migration (Full Process)

```bash
# ============================================
# STAGE 1: Migrate Canceled Subscriptions
# ============================================

# 1. Export canceled subscriptions
# Run in DB: SELECT * FROM find-subscriptions-to-activate.sql WHERE status='canceled'
# Save to: scripts/subscriptions-to-activate.json

# 2. Get Explorer price ID
stripe prices list --product prod_EXPLORER_PLAN_ID

# 3. Dry run
./scripts/activate-subscriptions.sh price_EXPLORER_ID --status canceled --dry-run

# 4. Execute
./scripts/activate-subscriptions.sh price_EXPLORER_ID --status canceled

# 5. Monitor and verify
# - Check Stripe dashboard
# - Review log file
# - Verify in database

# ============================================
# STAGE 2: Migrate Trialing Subscriptions
# ============================================

# 1. Export trialing subscriptions
# Run in DB: SELECT * FROM find-subscriptions-to-activate.sql WHERE status='trialing'
# Save to: scripts/subscriptions-to-activate.json

# 2. Dry run
./scripts/activate-subscriptions.sh price_EXPLORER_ID --status trialing --dry-run

# 3. Execute
./scripts/activate-subscriptions.sh price_EXPLORER_ID --status trialing

# 4. Monitor and verify

# ============================================
# STAGE 3: Create Subscriptions (No History)
# ============================================

# 1. Export customers without subscriptions
# Run in DB: find-customers-without-subscriptions.sql
# Save to: scripts/customers-without-subscriptions.json

# 2. Dry run
./scripts/create-stripe-subscriptions.sh price_EXPLORER_ID --dry-run

# 3. Execute
./scripts/create-stripe-subscriptions.sh price_EXPLORER_ID

# 4. Monitor and verify

# ============================================
# VERIFICATION
# ============================================

# Check all subscriptions are active with correct price
stripe subscriptions list --status active --limit 100

# Verify in database
# SELECT count(*), status FROM subscription GROUP BY status;
```

## Related Documentation

- `README-SUBSCRIPTION-MIGRATION.md` - Creating new subscriptions for customers
- `find-subscriptions-to-activate.sql` - SQL query for existing subscriptions
- `find-customers-without-subscriptions.sql` - SQL query for customers needing subscriptions
