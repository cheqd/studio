-- Audit only: local Studio subscription rows are not migration input.
-- The authoritative migration plan is built from Stripe by migrate-studio-plans.ts.
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
WHERE s."status" IN ('active', 'trialing', 'canceled')
ORDER BY s."status", c."email";

-- Summary counts by status
-- SELECT
--     s."status",
--     COUNT(*) as count
-- FROM "subscription" s
-- WHERE s."status" IN ('active', 'trialing', 'canceled')
-- GROUP BY s."status";
