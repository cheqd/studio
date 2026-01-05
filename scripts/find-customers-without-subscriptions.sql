-- Find customers without subscriptions who exist in Logto
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
  and c."paymentProviderId" is NOT NULL
  -- check if the users with NULL paymentProviderId can all be deleted
  ORDER BY c."email";

-- Alternative: If you need to match by a different field
-- Replace u."primaryEmail" with the appropriate field from the user table
