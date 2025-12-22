# Stripe Subscription Migration Scripts

This folder contains scripts and documentation for managing Stripe subscription migrations, specifically designed for moving customers to new plans.

## Quick Navigation

### 📚 Documentation

| File | Purpose | When to Use |
|------|---------|-------------|
| **MIGRATION-EXPLORER-PLAN.md** | Quick reference for Explorer plan migration | Start here for complete migration walkthrough |
| **README-SUBSCRIPTION-ACTIVATION.md** | Detailed guide for migrating/activating existing subscriptions | When you have trialing or canceled subscriptions to migrate |
| **README-SUBSCRIPTION-MIGRATION.md** | Guide for creating new subscriptions | When customers have NO subscription at all |
| **README.md** | This file - overview of all scripts | Navigation and understanding the system |

### 🗄️ SQL Queries

| File | Returns | Purpose |
|------|---------|---------|
| **find-subscriptions-to-activate.sql** | Existing subscriptions (trialing/canceled) | Find subscriptions that need migration to new plan |
| **find-customers-without-subscriptions.sql** | Customers with no subscription | Find customers who need brand new subscriptions |

### 🔧 Shell Scripts

| Script | Input | Output | Purpose |
|--------|-------|--------|---------|
| **activate-subscriptions.sh** | `price_id`, JSON file | Log file | Migrate and activate existing subscriptions |
| **create-stripe-subscriptions.sh** | `price_id`, JSON file | Log file | Create new subscriptions for customers |

---

## Understanding the Migration Types

### Type 1: Activate/Migrate Existing Subscriptions

**Script:** `activate-subscriptions.sh`
**Documentation:** `README-SUBSCRIPTION-ACTIVATION.md`

**Use when:**

- Customers have existing subscriptions (trialing or canceled)
- You want to migrate them to a new price/plan
- You need to activate trialing subscriptions (end trial)
- You need to reactivate canceled subscriptions

**What it does:**

- **Trialing subscriptions:** Updates to new price, ends trial immediately, keeps same subscription ID
- **Canceled subscriptions:** Creates NEW subscription with new price (new subscription ID)

**Example:**

```bash
./scripts/activate-subscriptions.sh price_1QYqCEBuiFnKBR8qNnOoP123 --status trialing --dry-run
```

---

### Type 2: Create New Subscriptions

**Script:** `create-stripe-subscriptions.sh`
**Documentation:** `README-SUBSCRIPTION-MIGRATION.md`

**Use when:**

- Customers exist in your system but have NO subscription at all
- New customers who never had a subscription
- Customers whose subscriptions were deleted

**What it does:**

- Creates brand new subscriptions
- Assigns the specified price/plan
- Sets up payment settings

**Example:**

```bash
./scripts/create-stripe-subscriptions.sh price_1QYqCEBuiFnKBR8qNnOoP123 --dry-run
```

---

## Complete Explorer Plan Migration

For a complete migration to the Explorer plan, follow this 3-stage process:

### Stage 1: Migrate Canceled Subscriptions

1. Run `find-subscriptions-to-activate.sql` with `WHERE status='canceled'`
2. Save results to `scripts/subscriptions-to-activate.json`
3. Run: `./scripts/activate-subscriptions.sh price_EXPLORER --status canceled`

### Stage 2: Migrate Trialing Subscriptions

1. Run `find-subscriptions-to-activate.sql` with `WHERE status='trialing'`
2. Save results to `scripts/subscriptions-to-activate.json`
3. Run: `./scripts/activate-subscriptions.sh price_EXPLORER --status trialing`

### Stage 3: Create Subscriptions for New Customers

1. Run `find-customers-without-subscriptions.sql`
2. Save results to `scripts/customers-without-subscriptions.json`
3. Run: `./scripts/create-stripe-subscriptions.sh price_EXPLORER`

**See MIGRATION-EXPLORER-PLAN.md for detailed step-by-step instructions.**

---

## Script Usage Reference

### activate-subscriptions.sh

```bash
./scripts/activate-subscriptions.sh <price_id> [--dry-run] [--status STATUS]
```

**Arguments:**

- `price_id` (required): Target Stripe price ID
- `--dry-run` (optional): Preview changes without executing
- `--status` (optional): Filter by status (`trialing` or `canceled`)

**Examples:**

```bash
# Dry run for all subscriptions
./scripts/activate-subscriptions.sh price_123 --dry-run

# Migrate only canceled
./scripts/activate-subscriptions.sh price_123 --status canceled

# Migrate only trialing
./scripts/activate-subscriptions.sh price_123 --status trialing
```

**Input file:** `subscriptions-to-activate.json`
**Output file:** `subscription-activation-YYYYMMDD-HHMMSS.log`

---

### create-stripe-subscriptions.sh

```bash
./scripts/create-stripe-subscriptions.sh <price_id> [--dry-run]
```

**Arguments:**

- `price_id` (required): Target Stripe price ID
- `--dry-run` (optional): Preview changes without executing

**Examples:**

```bash
# Dry run
./scripts/create-stripe-subscriptions.sh price_123 --dry-run

# Create subscriptions
./scripts/create-stripe-subscriptions.sh price_123
```

**Input file:** `customers-without-subscriptions.json`
**Output file:** `subscription-creation-YYYYMMDD-HHMMSS.log`

---

## JSON File Formats

### subscriptions-to-activate.json

Used by `activate-subscriptions.sh`:

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

**Required fields:**

- `subscriptionId`: Stripe subscription ID
- `customerId`: Internal customer ID
- `status`: Subscription status (trialing/canceled)
- `paymentProviderId`: Stripe customer ID
- `email`: Customer email
- `name`: Customer name

---

### customers-without-subscriptions.json

Used by `create-stripe-subscriptions.sh`:

```json
[
  {
    "customerId": "cust_456",
    "name": "Jane Doe",
    "email": "jane@example.com",
    "paymentProviderId": "cus_stripe456"
  }
]
```

**Required fields:**

- `customerId`: Internal customer ID
- `name`: Customer name
- `email`: Customer email
- `paymentProviderId`: Stripe customer ID

---

## Prerequisites

Before running any migration:

1. **Stripe CLI** - Install and authenticate
   ```bash
   # Install: https://stripe.com/docs/stripe-cli
   stripe login
   ```

2. **jq** - JSON processor
   ```bash
   # macOS
   brew install jq

   # Linux
   apt-get install jq
   ```

3. **Database Access** - For running SQL queries
   ```bash
   export EXTERNAL_DB_CONNECTION_URL="postgresql://..."
   export EXTERNAL_DB_CERT="..."
   ```

4. **Price ID** - Get your target plan's price ID
   ```bash
   stripe prices list --product prod_EXPLORER_PLAN_ID
   ```

---

## Best Practices

1. **Always dry-run first** - Test with `--dry-run` before executing
2. **Start with small batches** - Test with 2-3 customers first
3. **Use 3-stage approach** - Canceled → Trialing → New customers
4. **Monitor between stages** - Check Stripe dashboard and logs
5. **Keep all logs** - Save for audit trail
6. **Verify in database** - Confirm subscriptions were updated
7. **Notify customers** - Email them about plan changes

---

## Troubleshooting

### Common Issues

**"Price ID not found"**

```bash
# Verify price exists
stripe prices retrieve price_123
```

**"Subscription not found"**

```bash
# Check if subscription exists in Stripe
stripe subscriptions retrieve sub_123
```

**"No default payment method"**

- Customer needs to add payment method
- Cannot activate subscription without payment method

**"jq not found"**

```bash
# Install jq
brew install jq  # macOS
apt-get install jq  # Linux
```

### Verification Commands

```bash
# Check subscription
stripe subscriptions retrieve sub_123

# List active subscriptions
stripe subscriptions list --status active --limit 20

# Verify customer
stripe customers retrieve cus_123

# Check logs
cat scripts/subscription-activation-*.log | grep ERROR
cat scripts/subscription-creation-*.log | grep SUCCESS
```

---

## Migration Workflow Summary

```
┌─────────────────────────────────────────────────────┐
│                  Customer Status                     │
└─────────────────────────────────────────────────────┘
                          │
                          ▼
              ┌───────────────────────┐
              │ Has subscription?     │
              └───────────────────────┘
                │                  │
           Yes  │                  │  No
                ▼                  ▼
    ┌──────────────────┐   ┌──────────────────┐
    │ What status?     │   │ Create new       │
    └──────────────────┘   │ subscription     │
        │         │         └──────────────────┘
        │         │                  │
    Trialing  Canceled              │
        │         │                  │
        ▼         ▼                  ▼
    ┌────────┐ ┌────────┐    ┌─────────────┐
    │ Update │ │ Create │    │   Script:   │
    │ & End  │ │  NEW   │    │  create-    │
    │ Trial  │ │  Sub   │    │  stripe-    │
    └────────┘ └────────┘    │  subs.sh    │
         │         │          └─────────────┘
         └─────────┘
               │
               ▼
       ┌──────────────────┐
       │     Script:      │
       │   activate-      │
       │   subs.sh        │
       └──────────────────┘
```

---

## File Outputs

All scripts generate timestamped log files:

- `subscription-activation-YYYYMMDD-HHMMSS.log` - From activate-subscriptions.sh
- `subscription-creation-YYYYMMDD-HHMMSS.log` - From create-stripe-subscriptions.sh

These logs contain:
- Timestamp of execution
- Success/failure for each customer
- Detailed error messages
- Summary statistics

**Keep these logs for audit and troubleshooting purposes.**

---

## Quick Start Commands

```bash
# Get Explorer plan price ID
stripe prices list --product prod_EXPLORER_PLAN_ID

# Stage 1: Migrate canceled subscriptions
./scripts/activate-subscriptions.sh price_XXX --status canceled --dry-run
./scripts/activate-subscriptions.sh price_XXX --status canceled

# Stage 2: Migrate trialing subscriptions
./scripts/activate-subscriptions.sh price_XXX --status trialing --dry-run
./scripts/activate-subscriptions.sh price_XXX --status trialing

# Stage 3: Create new subscriptions
./scripts/create-stripe-subscriptions.sh price_XXX --dry-run
./scripts/create-stripe-subscriptions.sh price_XXX
```

---

**For detailed instructions, see:**

- **MIGRATION-EXPLORER-PLAN.md** - Complete walkthrough
- **README-SUBSCRIPTION-ACTIVATION.md** - Detailed activation guide
- **README-SUBSCRIPTION-MIGRATION.md** - Detailed creation guide
