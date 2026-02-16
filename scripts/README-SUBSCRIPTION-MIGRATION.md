# Stripe Subscription Creation Guide

This guide helps you create default Stripe subscriptions for customers who exist in your customer database and Logto but don't have any subscription.

**Note:** This is for creating NEW subscriptions. For migrating/activating EXISTING subscriptions, see `README-SUBSCRIPTION-ACTIVATION.md`.

## Prerequisites

1. **Database Access**: Ensure you have access to your PostgreSQL database
2. **Stripe CLI**: Install from [https://stripe.com/docs/stripe-cli](https://stripe.com/docs/stripe-cli) and authenticate with `stripe login`
3. **jq**: JSON processor for bash script
   - macOS: `brew install jq`
   - Linux: `apt-get install jq`

## Step-by-Step Process

### Step 1: Authenticate with Stripe CLI

```bash
stripe login
```

Follow the prompts to authenticate.

### Step 2: Get Your Stripe Price ID

Find the price ID for the default product you want to assign:

```bash
# List all prices
stripe prices list

# Or get a specific product's prices
stripe prices list --product prod_XXXXX
```

Copy the `price_id` (e.g., `price_1234567890`).

### Step 3: Export Customers Without Subscriptions

Run the SQL query in your database:

```bash
# Connect to your database and run:
# scripts/find-customers-without-subscriptions.sql
```

The query will return customers who don't have any subscription.

**Manual Export:**

1. Copy the query results from your database client
2. Convert to JSON format with required fields:
   - `customerId`: Internal customer ID
   - `name`: Customer name
   - `email`: Customer email
   - `paymentProviderId`: Stripe customer ID
   - `logtoUserId`: Logto user ID (optional)
3. Save to: `scripts/customers-without-subscriptions.json`

**JSON Format Example:**

```json
[
  {
    "customerId": "cust_123",
    "name": "John Doe",
    "email": "john@example.com",
    "paymentProviderId": "cus_stripe123",
    "logtoUserId": "logto_xyz"
  }
]
```

### Step 4: Review the Exported Data

Verify the customers in your JSON file:

```bash
cat scripts/customers-without-subscriptions.json | jq .
```

Check:

- Number of customers
- Customer emails are correct
- Payment provider IDs (Stripe customer IDs) are valid

### Step 5: Test with Dry Run

Before creating actual subscriptions, do a dry run:

```bash
chmod +x scripts/create-stripe-subscriptions.sh
./scripts/create-stripe-subscriptions.sh price_YOUR_PRICE_ID --dry-run
```

This will show you what would happen without actually creating subscriptions.

### Step 6: Create Subscriptions

Once you're confident, run the script without the dry-run flag:

```bash
./scripts/create-stripe-subscriptions.sh price_YOUR_PRICE_ID
```

You'll be asked to confirm before proceeding.

### Step 7: Review the Results

Check the log file created in the scripts directory:

```bash
cat scripts/subscription-creation-YYYYMMDD-HHMMSS.log
```

## Files in This System

### SQL Queries

1. **find-customers-without-subscriptions.sql** - SQL query to find customers without subscriptions

### Shell Scripts

1. **create-stripe-subscriptions.sh** - Creates subscriptions via Stripe CLI

### Data Files (Created During Migration)

1. **customers-without-subscriptions.json** - Manually created from DB query results
1. **subscription-creation-*.log** - Execution logs with timestamps

### Documentation

1. **README-SUBSCRIPTION-MIGRATION.md** - This file (for creating NEW subscriptions)
1. **README-SUBSCRIPTION-ACTIVATION.md** - Guide for migrating/activating EXISTING subscriptions
1. **MIGRATION-EXPLORER-PLAN.md** - Quick reference for Explorer plan migration

## Troubleshooting

### "Price ID not found"

- Verify the price exists: `stripe prices retrieve price_YOUR_PRICE_ID`
- Ensure you're authenticated to the correct Stripe account

### "Customer not found"

- The `paymentProviderId` in your database might not match the Stripe customer ID
- Check: `stripe customers retrieve cus_XXXXX`

### "Rate limit exceeded"

- The script includes a 0.5s delay between requests
- For large batches, consider increasing the delay in the bash script

### Database Connection Issues

- Verify `DATABASE_URL` is set correctly
- Check database permissions
- Ensure the database is accessible from your machine

## Important Notes

1. **Payment Method**: The script creates subscriptions with `payment_behavior=default_incomplete`, which means customers will need to add a payment method
2. **Trial Period**: If you want to add a trial period, modify the Stripe CLI command in the bash script to add `--trial-period-days=N`
3. **Backup**: Always backup your database before running bulk operations
4. **Test Environment**: Test the process in your Stripe test environment first

## Customization

### Add Trial Period

Edit `create-stripe-subscriptions.sh` and add to the `stripe subscriptions create` command:

```bash
--trial-period-days=30 \
```

### Change Payment Behavior

Change `--payment-behavior=default_incomplete` to:

- `default_incomplete` - Requires payment method (recommended)
- `allow_incomplete` - Creates subscription even without payment
- `error_if_incomplete` - Fails if payment method missing

### Add Metadata

Add custom metadata to subscriptions:

```bash
--metadata[customerId]="$CUSTOMER_ID" \
--metadata[source]="migration" \
```

## Example: Complete Workflow

```bash
# 1. Authenticate with Stripe
stripe login

# 2. Get your Explorer plan price ID
stripe prices list --product prod_EXPLORER_PLAN_ID

# 3. Run SQL query in your database
# Run: scripts/find-customers-without-subscriptions.sql
# Copy results and save to: scripts/customers-without-subscriptions.json

# 4. Review the JSON file
cat scripts/customers-without-subscriptions.json | jq .

# 5. Test with dry run
./scripts/create-stripe-subscriptions.sh price_1234567890 --dry-run

# 6. Review dry run output carefully

# 7. Create subscriptions (if dry run looks good)
./scripts/create-stripe-subscriptions.sh price_1234567890

# 8. Review results
cat scripts/subscription-creation-*.log | grep SUCCESS
cat scripts/subscription-creation-*.log | grep ERROR

# 9. Verify in Stripe
stripe subscriptions list --status active --limit 20

# 10. Verify in database
# Run: SELECT count(*), status FROM subscription GROUP BY status;
```

## Related Guides

- **README-SUBSCRIPTION-ACTIVATION.md** - For migrating/activating EXISTING subscriptions (trialing/canceled)
- **MIGRATION-EXPLORER-PLAN.md** - Quick reference for complete Explorer plan migration (all 3 stages)

## Support

If you encounter issues:

1. Check the log files for detailed error messages
2. Verify your Stripe API keys and permissions
3. Ensure all prerequisites are installed
4. Test with a small batch first (edit JSON to include only 2-3 customers)
5. Check Stripe dashboard for subscription details
6. Verify payment provider IDs match between database and Stripe
