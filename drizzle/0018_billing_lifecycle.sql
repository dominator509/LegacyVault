ALTER TABLE subscriptions
  ADD COLUMN trial_ends_at timestamptz,
  ADD COLUMN current_period_ends_at timestamptz,
  ADD COLUMN cancel_at_period_end boolean NOT NULL DEFAULT false,
  ADD COLUMN canceled_at timestamptz;

CREATE TABLE billing_refunds (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL,
  household_id uuid NOT NULL,
  provider_refund_id text NOT NULL UNIQUE,
  provider_charge_id text,
  amount bigint NOT NULL CHECK (amount > 0),
  currency text NOT NULL CHECK (currency ~ '^[a-z]{3}$'),
  reason text,
  status text NOT NULL CHECK (status IN ('pending','requires_action','succeeded','failed','canceled')),
  provider_updated_at timestamptz NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version > 0)
);

ALTER TABLE billing_refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE billing_refunds FORCE ROW LEVEL SECURITY;
CREATE POLICY billing_refunds_tenant ON billing_refunds
  USING (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  )
  WITH CHECK (
    organization_id = nullif(current_setting('app.organization_id', true), '')::uuid
    AND household_id = nullif(current_setting('app.household_id', true), '')::uuid
  );
