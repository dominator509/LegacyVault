CREATE POLICY memberships_auth_self ON memberships
  FOR SELECT
  USING (
    auth_user_id IS NOT NULL
    AND auth_user_id = nullif(current_setting('app.auth_user_id', true), '')
  );
