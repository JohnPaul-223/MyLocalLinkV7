-- =========================================================
-- LOCALINK — COMPLETE SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- =========================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT,
  login_id   TEXT UNIQUE,
  password   TEXT,
  contact    TEXT,
  role       TEXT DEFAULT 'standard' CHECK (role IN ('admin','standard')),
  status     TEXT DEFAULT 'offline'  CHECK (status IN ('online','offline')),
  avatar_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. LOCATIONS
CREATE TABLE IF NOT EXISTS public.locations (
  id        UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id   UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  lat       DOUBLE PRECISION NOT NULL,
  lng       DOUBLE PRECISION NOT NULL,
  accuracy  DOUBLE PRECISION,
  timestamp TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX ON public.locations(user_id, timestamp DESC);

-- 3. GROUPS
CREATE TABLE IF NOT EXISTS public.groups (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. GROUP MEMBERS
CREATE TABLE IF NOT EXISTS public.group_members (
  id       UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  group_id UUID REFERENCES public.groups(id)   ON DELETE CASCADE,
  user_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  UNIQUE(group_id, user_id)
);

-- 5. MESSAGES
CREATE TABLE IF NOT EXISTS public.messages (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  sender_id   UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  receiver_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  content     TEXT NOT NULL,
  is_read     BOOLEAN DEFAULT FALSE,
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- 6. GEOFENCES
CREATE TABLE IF NOT EXISTS public.geofences (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name       TEXT NOT NULL,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  radius     DOUBLE PRECISION NOT NULL,
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 7. GEOFENCE LOGS
CREATE TABLE IF NOT EXISTS public.geofence_logs (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES public.profiles(id)  ON DELETE CASCADE,
  geofence_id UUID REFERENCES public.geofences(id) ON DELETE CASCADE,
  event       TEXT CHECK (event IN ('enter','exit')),
  timestamp   TIMESTAMPTZ DEFAULT NOW()
);

-- 8. CALL SIGNALS (WebRTC Signaling)
CREATE TABLE IF NOT EXISTS public.call_signals (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  caller_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  callee_id  UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       TEXT NOT NULL,  -- 'offer' | 'answer' | 'ice' | 'end'
  data       JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 9. PUSH SUBSCRIPTIONS (for browser notifications)
CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,
  p256dh     TEXT NOT NULL,
  auth       TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =========================================================
-- ROW LEVEL SECURITY
-- =========================================================
ALTER TABLE public.profiles     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.locations    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.groups       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.group_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofences    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.geofence_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.call_signals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- PROFILES
CREATE POLICY "Profiles readable by all" ON public.profiles FOR SELECT TO public USING (true);
CREATE POLICY "Profiles insert for signup" ON public.profiles FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Profiles update by all" ON public.profiles FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Profiles delete by all" ON public.profiles FOR DELETE TO public USING (true);

-- LOCATIONS
CREATE POLICY "Locations readable by all" ON public.locations FOR SELECT TO public USING (true);
CREATE POLICY "Locations insert by all" ON public.locations FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Locations update by all" ON public.locations FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Locations delete by all" ON public.locations FOR DELETE TO public USING (true);

-- MESSAGES
CREATE POLICY "Messages readable by all" ON public.messages FOR SELECT TO public USING (true);
CREATE POLICY "Messages insert by all" ON public.messages FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Messages update by all" ON public.messages FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Messages delete by all" ON public.messages FOR DELETE TO public USING (true);

-- GEOFENCES
CREATE POLICY "Geofences readable by all" ON public.geofences FOR SELECT TO public USING (true);
CREATE POLICY "Geofences insert by all" ON public.geofences FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Geofences update by all" ON public.geofences FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Geofences delete by all" ON public.geofences FOR DELETE TO public USING (true);

-- GEOFENCE LOGS
CREATE POLICY "Geofence logs readable by all" ON public.geofence_logs FOR SELECT TO public USING (true);
CREATE POLICY "Geofence logs insert by all" ON public.geofence_logs FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Geofence logs update by all" ON public.geofence_logs FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Geofence logs delete by all" ON public.geofence_logs FOR DELETE TO public USING (true);

-- CALL SIGNALS
CREATE POLICY "Call signals readable by all" ON public.call_signals FOR SELECT TO public USING (true);
CREATE POLICY "Call signals insert by all" ON public.call_signals FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Call signals update by all" ON public.call_signals FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Call signals delete by all" ON public.call_signals FOR DELETE TO public USING (true);

-- GROUPS
CREATE POLICY "Groups readable by all" ON public.groups FOR SELECT TO public USING (true);
CREATE POLICY "Groups insert by all" ON public.groups FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Groups update by all" ON public.groups FOR UPDATE TO public USING (true) WITH CHECK (true);
CREATE POLICY "Groups delete by all" ON public.groups FOR DELETE TO public USING (true);

-- PUSH SUBSCRIPTIONS
CREATE POLICY "Push subscriptions readable by all" ON public.push_subscriptions FOR SELECT TO public USING (true);
CREATE POLICY "Push subscriptions insert by all" ON public.push_subscriptions FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Push subscriptions delete by all" ON public.push_subscriptions FOR DELETE TO public USING (true);

-- =========================================================
-- REALTIME — enable for live sync
-- =========================================================
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE 
  public.locations,
  public.messages,
  public.profiles,
  public.call_signals;
