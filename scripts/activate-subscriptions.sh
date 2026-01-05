#!/bin/bash

###############################################################################
# Script to migrate subscriptions to a default price and activate them
#
# Usage:
#   ./scripts/activate-subscriptions.sh <price_id> [--dry-run] [--status STATUS]
#
# Arguments:
#   price_id: The Stripe price ID to migrate subscriptions to (e.g., price_xxx)
#   --dry-run: Optional flag to preview actions without updating subscriptions
#   --status: Optional filter for specific status (trialing|canceled). Default: both
#
# Requirements:
#   - Stripe CLI installed (https://stripe.com/docs/stripe-cli)
#   - Stripe CLI authenticated (run: stripe login)
#   - jq installed for JSON parsing (brew install jq / apt-get install jq)
#   - subscriptions-to-activate.json file generated
#
# Examples:
#   ./scripts/activate-subscriptions.sh price_1234567890 --dry-run
#   ./scripts/activate-subscriptions.sh price_1234567890 --status trialing
#   ./scripts/activate-subscriptions.sh price_1234567890 --status canceled --dry-run
#   ./scripts/activate-subscriptions.sh price_1234567890
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check if price_id is provided
if [ -z "$1" ] || [[ "$1" == --* ]]; then
  echo -e "${RED}Error: Price ID is required${NC}"
  echo "Usage: $0 <price_id> [--dry-run] [--status STATUS]"
  exit 1
fi

PRICE_ID="$1"
shift  # Remove price_id from arguments

# Parse remaining arguments
DRY_RUN=false
STATUS_FILTER=""

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
    --status)
      STATUS_FILTER="$2"
      shift 2
      ;;
    *)
      echo -e "${RED}Unknown option: $1${NC}"
      exit 1
      ;;
  esac
done

if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Running in DRY RUN mode - no subscriptions will be updated${NC}\n"
fi

# Check if required tools are installed
if ! command -v stripe &> /dev/null; then
    echo -e "${RED}Error: Stripe CLI is not installed${NC}"
    echo "Install it from: https://stripe.com/docs/stripe-cli"
    exit 1
fi

if ! command -v jq &> /dev/null; then
    echo -e "${RED}Error: jq is not installed${NC}"
    echo "Install it: brew install jq (macOS) or apt-get install jq (Linux)"
    exit 1
fi

# Check if subscriptions file exists
SUBSCRIPTIONS_FILE="$(dirname "$0")/subscriptions-to-activate.json"
if [ ! -f "$SUBSCRIPTIONS_FILE" ]; then
  echo -e "${RED}Error: $SUBSCRIPTIONS_FILE not found${NC}"
  echo "Run: node scripts/export-subscriptions-to-activate.js"
  exit 1
fi

# Filter by status if specified
if [ -n "$STATUS_FILTER" ]; then
  FILTERED_FILE="$(dirname "$0")/subscriptions-filtered.json"
  jq "[.[] | select(.status == \"$STATUS_FILTER\")]" "$SUBSCRIPTIONS_FILE" > "$FILTERED_FILE"
  SUBSCRIPTIONS_FILE="$FILTERED_FILE"
  echo -e "${BLUE}Filtering by status: $STATUS_FILTER${NC}"
fi

# Verify the price exists
echo -e "${BLUE}Verifying price exists in Stripe...${NC}"
if ! stripe prices retrieve "$PRICE_ID" &> /dev/null; then
  echo -e "${RED}Error: Price ID $PRICE_ID not found in Stripe${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Price verified${NC}\n"

# Count total subscriptions
TOTAL_SUBS=$(jq 'length' "$SUBSCRIPTIONS_FILE")
echo -e "${BLUE}Found $TOTAL_SUBS subscriptions to migrate${NC}"
echo -e "${BLUE}Target Price ID: $PRICE_ID${NC}\n"

if [ "$TOTAL_SUBS" -eq 0 ]; then
  echo -e "${YELLOW}No subscriptions to process${NC}"
  exit 0
fi

# Count by status
echo -e "${BLUE}Breakdown by status:${NC}"
jq -r 'group_by(.status) | .[] | "\(.[0].status): \(length)"' "$SUBSCRIPTIONS_FILE"
echo ""

# Ask for confirmation
if [ "$DRY_RUN" = false ]; then
  echo -e "${YELLOW}This will update $TOTAL_SUBS subscriptions in Stripe${NC}"
  echo -e "${YELLOW}Actions:${NC}"
  echo -e "  - Migrate all subscriptions to price: $PRICE_ID"
  echo -e "  - Trialing: End trial immediately (make active)"
  echo -e "  - Canceled: Reactivate subscription"
  echo ""
  read -p "Are you sure you want to continue? (yes/no): " -r
  echo
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# Create log file
LOG_FILE="$(dirname "$0")/subscription-activation-$(date +%Y%m%d-%H%M%S).log"
echo "Logging to: $LOG_FILE"
echo "Started at: $(date)" > "$LOG_FILE"

# Process each subscription
SUCCESS_COUNT=0
ERROR_COUNT=0
SKIPPED_COUNT=0

echo -e "\n${BLUE}Processing subscriptions...${NC}\n"

while read -r subscription; do
  STRIPE_SUB_ID=$(echo "$subscription" | jq -r '.subscriptionId')
  EMAIL=$(echo "$subscription" | jq -r '.email')
  STATUS=$(echo "$subscription" | jq -r '.status')
  STRIPE_CUSTOMER_ID=$(echo "$subscription" | jq -r '.paymentProviderId')
  CUSTOMER_ID=$(echo "$subscription" | jq -r '.customerId')

  echo -e "${BLUE}Processing: $EMAIL (Status: $STATUS)${NC}"
  echo "  Stripe Subscription ID: $STRIPE_SUB_ID"
  echo "  Stripe Customer ID: $STRIPE_CUSTOMER_ID"
  echo "  Current Status: $STATUS"

  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}  [DRY RUN] Would execute:${NC}"
    if [ "$STATUS" == "trialing" ]; then
      echo "    1. Retrieve subscription to get all item IDs"
      echo "    2. Delete all existing subscription items"
      echo "    3. Add new subscription item with price: $PRICE_ID"
      echo "    4. End trial: trial_end=now"
      echo "    5. Set proration_behavior=none (no prorations)"
    elif [ "$STATUS" == "canceled" ]; then
      echo "    1. Create NEW subscription for customer: $STRIPE_CUSTOMER_ID"
      echo "    2. Use price: $PRICE_ID"
      echo "    3. Set payment_behavior=default_incomplete"
      echo "    (Note: Cannot update canceled subscriptions, must create new one)"
    fi
    echo ""
    continue
  fi

  # Handle based on subscription status
  if [ "$STATUS" == "canceled" ]; then
    # For canceled subscriptions, we must create a NEW subscription
    echo "  Step 1/2: Creating new subscription (cannot update canceled ones)..."

    STRIPE_CMD="stripe subscriptions create"
    STRIPE_CMD="$STRIPE_CMD -d customer=\"$STRIPE_CUSTOMER_ID\""
    STRIPE_CMD="$STRIPE_CMD -d \"items[0][price]=$PRICE_ID\""
    STRIPE_CMD="$STRIPE_CMD -d payment_behavior=default_incomplete"
    STRIPE_CMD="$STRIPE_CMD -d \"payment_settings[save_default_payment_method]=on_subscription\""
    STRIPE_CMD="$STRIPE_CMD -d \"expand[]=latest_invoice.payment_intent\""

    echo "  Step 2/2: Executing subscription creation..."
    if RESULT=$(eval "$STRIPE_CMD" 2>&1); then
      NEW_SUB_ID=$(echo "$RESULT" | grep -o '"id": "sub_[^"]*"' | head -1 | cut -d'"' -f4)
      echo -e "${GREEN}  ✓ Successfully created new subscription: $NEW_SUB_ID${NC}"
      echo "  (Old canceled subscription: $STRIPE_SUB_ID)"
      echo "SUCCESS: $EMAIL - Created new subscription $NEW_SUB_ID (old: $STRIPE_SUB_ID) with price $PRICE_ID" >> "$LOG_FILE"
      ((SUCCESS_COUNT++))
    else
      echo -e "${RED}  ✗ Failed to create new subscription${NC}"
      echo "  Error: $RESULT"
      echo "ERROR: $EMAIL ($STRIPE_SUB_ID) - $RESULT" >> "$LOG_FILE"
      ((ERROR_COUNT++))
    fi

  elif [ "$STATUS" == "trialing" ]; then
    # For trialing subscriptions, update and end trial
    echo "  Step 1/3: Retrieving subscription details..."
    if ! SUB_DATA=$(stripe subscriptions retrieve "$STRIPE_SUB_ID" 2>&1); then
      echo -e "${RED}  ✗ Failed to retrieve subscription${NC}"
      echo "  Error: $SUB_DATA"
      echo "ERROR: $EMAIL ($STRIPE_SUB_ID) - Failed to retrieve: $SUB_DATA" >> "$LOG_FILE"
      ((ERROR_COUNT++))
      echo ""
      continue
    fi

    # Extract all subscription item IDs
    ITEM_IDS=($(echo "$SUB_DATA" | grep -o '"id": "si_[^"]*"' | cut -d'"' -f4))

    if [ ${#ITEM_IDS[@]} -eq 0 ]; then
      echo -e "${RED}  ✗ Could not find any subscription items${NC}"
      echo "ERROR: $EMAIL ($STRIPE_SUB_ID) - No subscription items found" >> "$LOG_FILE"
      ((ERROR_COUNT++))
      echo ""
      continue
    fi

    echo "  Found ${#ITEM_IDS[@]} subscription item(s)"
    echo "  Step 2/3: Updating subscription to new price and ending trial..."

    # Build the command to update subscription
    STRIPE_CMD="stripe subscriptions update $STRIPE_SUB_ID"

    # Delete all existing items
    for i in "${!ITEM_IDS[@]}"; do
      STRIPE_CMD="$STRIPE_CMD -d \"items[$i][id]=${ITEM_IDS[$i]}\""
      STRIPE_CMD="$STRIPE_CMD -d \"items[$i][deleted]=true\""
    done

    # Add the new item with the new price
    NEXT_INDEX=${#ITEM_IDS[@]}
    STRIPE_CMD="$STRIPE_CMD -d \"items[$NEXT_INDEX][price]=$PRICE_ID\""
    STRIPE_CMD="$STRIPE_CMD -d proration_behavior=none"
    STRIPE_CMD="$STRIPE_CMD -d trial_end=now"

    echo "  Step 3/3: Executing update..."
    if RESULT=$(eval "$STRIPE_CMD" 2>&1); then
      echo -e "${GREEN}  ✓ Successfully migrated subscription to $PRICE_ID${NC}"
      echo "SUCCESS: $EMAIL ($STRIPE_SUB_ID) - Migrated from trialing to active with price $PRICE_ID" >> "$LOG_FILE"
      ((SUCCESS_COUNT++))
    else
      echo -e "${RED}  ✗ Failed to update subscription${NC}"
      echo "  Error: $RESULT"
      echo "ERROR: $EMAIL ($STRIPE_SUB_ID) - $RESULT" >> "$LOG_FILE"
      ((ERROR_COUNT++))
    fi

  else
    # Unknown status
    echo -e "${YELLOW}  ⊘ Skipped (unexpected status: $STATUS)${NC}"
    echo "SKIPPED: $EMAIL ($STRIPE_SUB_ID) - Unexpected status: $STATUS" >> "$LOG_FILE"
    ((SKIPPED_COUNT++))
  fi

  echo ""

  # Optional: Add a small delay to avoid rate limits
  sleep 0.5
done < <(jq -c '.[]' "$SUBSCRIPTIONS_FILE")

# Cleanup filtered file if created
if [ -n "$STATUS_FILTER" ] && [ -f "$(dirname "$0")/subscriptions-filtered.json" ]; then
  rm "$(dirname "$0")/subscriptions-filtered.json"
fi

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Dry run completed - no subscriptions updated${NC}"
  echo -e "Total subscriptions that would be processed: $TOTAL_SUBS"
else
  echo -e "Total subscriptions: $TOTAL_SUBS"
  echo -e "${GREEN}Successful: $SUCCESS_COUNT${NC}"
  echo -e "${RED}Failed: $ERROR_COUNT${NC}"
  echo -e "${YELLOW}Skipped: $SKIPPED_COUNT${NC}"
  echo -e "\nLog file: $LOG_FILE"
fi
echo -e "${BLUE}========================================${NC}"
