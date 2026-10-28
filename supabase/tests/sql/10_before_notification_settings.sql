-- Applied BEFORE 20261028120000_notification_settings.sql: accounts that
-- already exist when the migration runs.
--   existing-default  : never touched the task-name setting (stored true, the old default)
--   existing-chose-off: switched task names off
--   existing-chose-on : nudges on, task names on (indistinguishable from the default)
insert into auth.users (id, email) values
  ('00000000-0000-4000-8000-0000000000e1', 'existing-default@example.test'),
  ('00000000-0000-4000-8000-0000000000e2', 'existing-chose-off@example.test'),
  ('00000000-0000-4000-8000-0000000000e3', 'existing-chose-on@example.test');

update public.user_settings set nudge_show_task_titles = false
 where user_id = '00000000-0000-4000-8000-0000000000e2';
update public.user_settings set nudges_enabled = true, nudge_time = '08:15', timezone = 'Europe/London'
 where user_id = '00000000-0000-4000-8000-0000000000e3';
