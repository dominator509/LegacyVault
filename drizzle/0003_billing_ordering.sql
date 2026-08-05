ALTER TABLE subscriptions
  ADD COLUMN provider_updated_at timestamptz;

CREATE UNIQUE INDEX subscriptions_household_unique
  ON subscriptions (organization_id, household_id);

CREATE UNIQUE INDEX subscriptions_provider_customer_unique
  ON subscriptions (provider_customer_id)
  WHERE provider_customer_id IS NOT NULL;

CREATE UNIQUE INDEX subscriptions_provider_subscription_unique
  ON subscriptions (provider_subscription_id)
  WHERE provider_subscription_id IS NOT NULL;
