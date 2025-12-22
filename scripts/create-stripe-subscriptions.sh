#!/bin/bash

###############################################################################
# Script to create Stripe subscriptions for customers without subscriptions
#
# Usage:
#   ./scripts/create-stripe-subscriptions.sh <price_id> [--dry-run]
#
# Arguments:
#   price_id: The Stripe price ID to use for subscriptions (e.g., price_xxx)
#   --dry-run: Optional flag to preview actions without creating subscriptions
#
# Requirements:
#   - Stripe CLI installed (https://stripe.com/docs/stripe-cli)
#   - Stripe CLI authenticated (run: stripe login)
#   - jq installed for JSON parsing (brew install jq / apt-get install jq)
#   - customers-without-subscriptions.json file generated
#
# Example:
#   ./scripts/create-stripe-subscriptions.sh price_1234567890 --dry-run
#   ./scripts/create-stripe-subscriptions.sh price_1234567890
###############################################################################

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check arguments
if [ -z "$1" ]; then
  echo -e "${RED}Error: Price ID is required${NC}"
  echo "Usage: $0 <price_id> [--dry-run]"
  exit 1
fi

PRICE_ID="$1"
DRY_RUN=false

if [ "$2" == "--dry-run" ]; then
  DRY_RUN=true
  echo -e "${YELLOW}Running in DRY RUN mode - no subscriptions will be created${NC}\n"
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

# Check if customers file exists
CUSTOMERS_FILE="$(dirname "$0")/customers-without-subscriptions.json"
if [ ! -f "$CUSTOMERS_FILE" ]; then
  echo -e "${RED}Error: $CUSTOMERS_FILE not found${NC}"
  echo "Run: node scripts/export-customers-without-subscriptions.js"
  exit 1
fi

# Count total customers
TOTAL_CUSTOMERS=$(jq 'length' "$CUSTOMERS_FILE")
echo -e "${BLUE}Found $TOTAL_CUSTOMERS customers without subscriptions${NC}"
echo -e "${BLUE}Price ID: $PRICE_ID${NC}\n"

# Verify the price exists
echo -e "${BLUE}Verifying price exists in Stripe...${NC}"
if ! stripe prices retrieve "$PRICE_ID" &> /dev/null; then
  echo -e "${RED}Error: Price ID $PRICE_ID not found in Stripe${NC}"
  exit 1
fi
echo -e "${GREEN}✓ Price verified${NC}\n"

# Ask for confirmation
if [ "$DRY_RUN" = false ]; then
  echo -e "${YELLOW}This will create $TOTAL_CUSTOMERS subscriptions in Stripe${NC}"
  read -p "Are you sure you want to continue? (yes/no): " -r
  echo
  if [[ ! $REPLY =~ ^[Yy][Ee][Ss]$ ]]; then
    echo "Aborted."
    exit 0
  fi
fi

# Create log file
LOG_FILE="$(dirname "$0")/subscription-creation-$(date +%Y%m%d-%H%M%S).log"
echo "Logging to: $LOG_FILE"
echo "Started at: $(date)" > "$LOG_FILE"

# Process each customer
SUCCESS_COUNT=0
ERROR_COUNT=0

echo -e "\n${BLUE}Processing customers...${NC}\n"

jq -c '.[]' "$CUSTOMERS_FILE" | while read -r customer; do
  CUSTOMER_ID=$(echo "$customer" | jq -r '.customerId')
  EMAIL=$(echo "$customer" | jq -r '.email')
  NAME=$(echo "$customer" | jq -r '.name')
  PAYMENT_PROVIDER_ID=$(echo "$customer" | jq -r '.paymentProviderId')

  echo -e "${BLUE}Processing: $EMAIL ($CUSTOMER_ID)${NC}"

  if [ "$DRY_RUN" = true ]; then
    echo -e "${YELLOW}  [DRY RUN] Would create subscription:${NC}"
    echo "    Customer: $CUSTOMER_ID"
    echo "    Email: $EMAIL"
    echo "    Price: $PRICE_ID"
    echo "    Payment Provider ID: $PAYMENT_PROVIDER_ID"
    echo ""
    continue
  fi

  # Create subscription using Stripe CLI
  if RESULT=$(stripe subscriptions create \
    -d customer="$PAYMENT_PROVIDER_ID" \
    -d "items[0][price]=$PRICE_ID" \
    -d payment_behavior=default_incomplete \
    -d "payment_settings[save_default_payment_method]=on_subscription" \
    -d "expand[]=latest_invoice.payment_intent" \
    2>&1); then

    SUBSCRIPTION_ID=$(echo "$RESULT" | grep -o '"id": "sub_[^"]*"' | head -1 | cut -d'"' -f4)
    echo -e "${GREEN}  ✓ Created subscription: $SUBSCRIPTION_ID${NC}"
    echo "SUCCESS: $EMAIL ($CUSTOMER_ID) -> $SUBSCRIPTION_ID" >> "$LOG_FILE"
    ((SUCCESS_COUNT++))
  else
    echo -e "${RED}  ✗ Failed to create subscription${NC}"
    echo "  Error: $RESULT"
    echo "ERROR: $EMAIL ($CUSTOMER_ID) - $RESULT" >> "$LOG_FILE"
    ((ERROR_COUNT++))
  fi

  echo ""

  # Optional: Add a small delay to avoid rate limits
  sleep 0.5
done

# Summary
echo -e "\n${BLUE}========================================${NC}"
echo -e "${BLUE}Summary${NC}"
echo -e "${BLUE}========================================${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${YELLOW}Dry run completed - no subscriptions created${NC}"
  echo -e "Total customers that would be processed: $TOTAL_CUSTOMERS"
else
  echo -e "Total customers: $TOTAL_CUSTOMERS"
  echo -e "${GREEN}Successful: $SUCCESS_COUNT${NC}"
  echo -e "${RED}Failed: $ERROR_COUNT${NC}"
  echo -e "\nLog file: $LOG_FILE"
fi
echo -e "${BLUE}========================================${NC}"
