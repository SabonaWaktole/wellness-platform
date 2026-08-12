-- Removes the SUPER_ADMIN row added via scratch/add_super_admin.sql.
-- Matches by id, so it can't accidentally catch any other account.

DELETE FROM `User` WHERE `id` = '0cf8d617-ef49-46ce-866d-93fe50369630';
