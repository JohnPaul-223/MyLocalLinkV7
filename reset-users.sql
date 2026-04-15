-- =========================================================
-- RESET USERS — Run this in Supabase SQL Editor to clear all user data
-- =========================================================

-- Delete all data from dependent tables first
DELETE FROM public.messages;
DELETE FROM public.locations;
DELETE FROM public.geofence_logs;
DELETE FROM public.call_signals;
DELETE FROM public.push_subscriptions;
DELETE FROM public.group_members;
DELETE FROM public.groups;
DELETE FROM public.geofences;

-- Finally, delete all users
DELETE FROM public.profiles;

-- Reset sequences if any (optional, for auto-increment IDs)
-- ALTER SEQUENCE IF EXISTS public.profiles_id_seq RESTART WITH 1;

-- Confirm the reset
SELECT COUNT(*) as remaining_profiles FROM public.profiles;
