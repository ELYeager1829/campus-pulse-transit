
-- Roles
CREATE TYPE public.app_role AS ENUM ('student','admin','driver','marshal');

CREATE TABLE public.user_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id=_user_id AND role=_role);
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS app_role LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public AS $$
  SELECT role FROM public.user_roles WHERE user_id=_user_id ORDER BY 
    CASE role WHEN 'admin' THEN 1 WHEN 'driver' THEN 2 WHEN 'marshal' THEN 3 ELSE 4 END
  LIMIT 1;
$$;

CREATE POLICY "users see own roles" ON public.user_roles FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admins manage roles" ON public.user_roles FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Profiles
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  matric_no text,
  phone text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view all profiles" ON public.profiles FOR SELECT TO authenticated USING (true);
CREATE POLICY "update own profile" ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid()=id) WITH CHECK (auth.uid()=id);
CREATE POLICY "insert own profile" ON public.profiles FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=id);

-- Auto-create profile + default student role on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
  INSERT INTO public.profiles(id, full_name, matric_no)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name',''), NEW.raw_user_meta_data->>'matric_no');
  INSERT INTO public.user_roles(user_id, role)
  VALUES (NEW.id, COALESCE((NEW.raw_user_meta_data->>'role')::app_role,'student'));
  RETURN NEW;
END;$$;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Buses
CREATE TABLE public.buses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_number text NOT NULL UNIQUE,
  capacity int NOT NULL DEFAULT 40,
  status text NOT NULL DEFAULT 'idle', -- idle|active|maintenance
  driver_id uuid REFERENCES auth.users(id),
  current_lat double precision,
  current_lng double precision,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.buses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view buses" ON public.buses FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage buses" ON public.buses FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "drivers update own bus" ON public.buses FOR UPDATE TO authenticated
  USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());

-- Routes
CREATE TABLE public.routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  origin text NOT NULL,
  destination text NOT NULL,
  stops jsonb NOT NULL DEFAULT '[]'::jsonb,
  estimated_duration_min int NOT NULL DEFAULT 20,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view routes" ON public.routes FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage routes" ON public.routes FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Trips
CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  bus_id uuid NOT NULL REFERENCES public.buses(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.routes(id) ON DELETE CASCADE,
  driver_id uuid REFERENCES auth.users(id),
  marshal_id uuid REFERENCES auth.users(id),
  status text NOT NULL DEFAULT 'scheduled', -- scheduled|active|full|completed|delayed
  occupancy int NOT NULL DEFAULT 0,
  capacity int NOT NULL DEFAULT 40,
  delay_minutes int NOT NULL DEFAULT 0,
  eta_minutes int NOT NULL DEFAULT 10,
  parent_trip_id uuid REFERENCES public.trips(id),
  started_at timestamptz,
  ended_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view trips" ON public.trips FOR SELECT TO authenticated USING (true);
CREATE POLICY "admins manage trips" ON public.trips FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
CREATE POLICY "drivers update own trips" ON public.trips FOR UPDATE TO authenticated
  USING (driver_id = auth.uid()) WITH CHECK (driver_id = auth.uid());
CREATE POLICY "marshals update assigned trips" ON public.trips FOR UPDATE TO authenticated
  USING (marshal_id = auth.uid() OR public.has_role(auth.uid(),'marshal'))
  WITH CHECK (marshal_id = auth.uid() OR public.has_role(auth.uid(),'marshal'));

-- Bookings
CREATE TABLE public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  qr_code text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(12),'hex'),
  status text NOT NULL DEFAULT 'booked', -- booked|boarded|cancelled|expired
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own bookings" ON public.bookings FOR SELECT TO authenticated
  USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marshal') OR public.has_role(auth.uid(),'driver'));
CREATE POLICY "students insert own booking" ON public.bookings FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=user_id);
CREATE POLICY "users update own booking" ON public.bookings FOR UPDATE TO authenticated
  USING (auth.uid()=user_id OR public.has_role(auth.uid(),'marshal') OR public.has_role(auth.uid(),'admin'))
  WITH CHECK (true);

-- Trigger: enforce capacity, increment occupancy, mark full
CREATE OR REPLACE FUNCTION public.handle_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.trips%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.trips WHERE id = NEW.trip_id FOR UPDATE;
  IF t.occupancy >= t.capacity THEN
    RAISE EXCEPTION 'Trip is full';
  END IF;
  UPDATE public.trips SET
    occupancy = occupancy + 1,
    status = CASE WHEN occupancy + 1 >= capacity THEN 'full' ELSE status END
  WHERE id = NEW.trip_id;
  INSERT INTO public.notifications(user_id,title,body,kind)
  VALUES (NEW.user_id,'Seat booked','Your seat has been confirmed. Show your QR to board.','booking');
  RETURN NEW;
END;$$;

CREATE TRIGGER trg_booking_insert AFTER INSERT ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.handle_booking();

-- Queue
CREATE TABLE public.waiting_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  trip_id uuid NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'waiting', -- waiting|moved|cancelled
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.waiting_queue ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view queue auth" ON public.waiting_queue FOR SELECT TO authenticated
  USING (auth.uid()=user_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'marshal'));
CREATE POLICY "students insert queue" ON public.waiting_queue FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=user_id);
CREATE POLICY "admins update queue" ON public.waiting_queue FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Notifications
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text,
  kind text NOT NULL DEFAULT 'info',
  read boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users see own notif" ON public.notifications FOR SELECT TO authenticated
  USING (auth.uid()=user_id);
CREATE POLICY "users update own notif" ON public.notifications FOR UPDATE TO authenticated
  USING (auth.uid()=user_id) WITH CHECK (auth.uid()=user_id);
CREATE POLICY "system insert notif" ON public.notifications FOR INSERT TO authenticated
  WITH CHECK (true);

-- Issues
CREATE TABLE public.issues (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  bus_id uuid REFERENCES public.buses(id),
  trip_id uuid REFERENCES public.trips(id),
  kind text NOT NULL DEFAULT 'maintenance',
  description text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.issues ENABLE ROW LEVEL SECURITY;
CREATE POLICY "view issues" ON public.issues FOR SELECT TO authenticated
  USING (auth.uid()=reporter_id OR public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'driver') OR public.has_role(auth.uid(),'marshal'));
CREATE POLICY "report issue" ON public.issues FOR INSERT TO authenticated
  WITH CHECK (auth.uid()=reporter_id);
CREATE POLICY "admins update issues" ON public.issues FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));

-- Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.trips;
ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buses;
ALTER PUBLICATION supabase_realtime ADD TABLE public.waiting_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE public.issues;

ALTER TABLE public.trips REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;
ALTER TABLE public.notifications REPLICA IDENTITY FULL;
ALTER TABLE public.buses REPLICA IDENTITY FULL;
ALTER TABLE public.waiting_queue REPLICA IDENTITY FULL;
