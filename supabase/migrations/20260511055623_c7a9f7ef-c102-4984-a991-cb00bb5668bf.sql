CREATE OR REPLACE FUNCTION public.handle_booking_cancel()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.status = 'booked' AND NEW.status = 'cancelled' THEN
    UPDATE public.trips
      SET occupancy = GREATEST(occupancy - 1, 0),
          status = CASE WHEN status = 'full' THEN 'active' ELSE status END
      WHERE id = NEW.trip_id;
    INSERT INTO public.notifications(user_id, title, body, kind)
    VALUES (NEW.user_id, 'Booking cancelled', 'Your seat reservation has been cancelled.', 'booking');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_booking_cancel ON public.bookings;
CREATE TRIGGER on_booking_cancel
AFTER UPDATE ON public.bookings
FOR EACH ROW EXECUTE FUNCTION public.handle_booking_cancel();