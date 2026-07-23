-- ============================================================
-- Admin notification centre: let admins read every notification in their org
-- (the base policy only lets a user read notifications addressed to them).
-- ============================================================
create policy notif_admin_read on notifications for select
using (auth_role() = 'admin' and org_id = auth_org());
