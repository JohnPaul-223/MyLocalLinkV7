-- =========================================================
-- LOCALINK — COMPLETE SUPABASE SCHEMA
-- Run this entire file in your Supabase SQL Editor
-- =========================================================

-- 1. PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id         UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
  name       TEXT,
  email      TEXT,
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

-- PROFILES
CREATE POLICY "Profiles readable by all authenticated" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users update own profile"               ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);
CREATE POLICY "Users insert own profile"               ON public.profiles FOR INSERT TO authenticated WITH CHECK (auth.uid() = id);

-- LOCATIONS — any authenticated user can read (you can restrict later by group)
CREATE POLICY "Locations readable by authenticated"    ON public.locations FOR SELECT TO authenticated USING (true);
CREATE POLICY "Users insert own location"              ON public.locations FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- MESSAGES
CREATE POLICY "Read own messages"   ON public.messages FOR SELECT TO authenticated USING (auth.uid() = sender_id OR auth.uid() = receiver_id OR receiver_id IS NULL);
CREATE POLICY "Send messages"       ON public.messages FOR INSERT TO authenticated WITH CHECK (auth.uid() = sender_id);

-- GEOFENCES
CREATE POLICY "Geofences public read"  ON public.geofences FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage geofences" ON public.geofences FOR ALL    TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- GEOFENCE LOGS
CREATE POLICY "Own geofence logs" ON public.geofence_logs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Insert geo logs"   ON public.geofence_logs FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

-- CALL SIGNALS
CREATE POLICY "Call signals readable by participant" ON public.call_signals FOR SELECT TO authenticated USING (auth.uid() = caller_id OR auth.uid() = callee_id);
CREATE POLICY "Insert call signals"                  ON public.call_signals FOR INSERT TO authenticated WITH CHECK (auth.uid() = caller_id);

-- GROUPS
CREATE POLICY "Groups readable"    ON public.groups FOR SELECT TO authenticated USING (true);
CREATE POLICY "Admin manage groups" ON public.groups FOR ALL   TO authenticated USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- =========================================================
-- REALTIME — enable for live sync
-- =========================================================
DROP PUBLICATION IF EXISTS supabase_realtime;
CREATE PUBLICATION supabase_realtime FOR TABLE 
  public.locations,
  public.messages,
  public.profiles,
  public.call_signals;
