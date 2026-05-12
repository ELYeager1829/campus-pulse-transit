
ALTER TABLE public.routes ADD COLUMN IF NOT EXISTS times text[] NOT NULL DEFAULT '{}';

-- Reseed the 4 TUT shuttle routes (idempotent by name)
DELETE FROM public.routes WHERE name IN (
  'Soshanguve ↔ Main Campus',
  'Soshanguve ↔ Arcadia',
  'Soshanguve ↔ Harangua',
  'Soshanguve ↔ Emalahleni'
);

INSERT INTO public.routes (name, origin, destination, stops, estimated_duration_min, times) VALUES
('Soshanguve ↔ Main Campus','TUT Soshanguve South','TUT Pretoria Main','["Soshanguve South","Rosslyn","Pretoria West","TUT Main Gate"]'::jsonb,45,
  ARRAY['09:00','11:00','13:00','14:00','16:00','17:00','18:00','19:30']),
('Soshanguve ↔ Arcadia','TUT Soshanguve South','TUT Arcadia Campus','["Soshanguve South","Pretoria CBD","Arcadia Campus"]'::jsonb,55,
  ARRAY['07:00','09:00','11:00','12:00','13:00','14:00','15:00','16:00','17:00','18:00','19:30']),
('Soshanguve ↔ Harangua','TUT Soshanguve South','Harangua','["Soshanguve South","Block L","Harangua"]'::jsonb,30,
  ARRAY['09:00','11:00','13:00','14:00','16:00','17:00','18:00','19:00']),
('Soshanguve ↔ Emalahleni','TUT Soshanguve South','Emalahleni','["Soshanguve South","Bronkhorstspruit","Emalahleni"]'::jsonb,90,
  ARRAY['09:00','11:00','13:00','14:00','16:00','17:00','18:00','19:30']);
