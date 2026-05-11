
UPDATE public.routes SET name = 'Soshanguve South → Pretoria Main', origin = 'TUT Soshanguve South Campus', destination = 'TUT Pretoria Main Campus', stops = '["Soshanguve South", "Soshanguve Plaza", "Rosslyn", "Pretoria West", "TUT Main Gate"]'::jsonb WHERE id = '07cbe8c0-e09e-4eb4-90e6-2f10e1564437';

UPDATE public.routes SET name = 'Soshanguve North → Soshanguve South', origin = 'TUT Soshanguve North Campus', destination = 'TUT Soshanguve South Campus', stops = '["Soshanguve North Gate", "Block L", "Soshanguve Crossing", "Soshanguve South Gate"]'::jsonb WHERE id = 'f88364cd-4310-4a89-b3df-4aafe5c61843';

UPDATE public.routes SET name = 'Pretoria Main → Arcadia Campus', origin = 'TUT Pretoria Main Campus', destination = 'TUT Arcadia Campus', stops = '["TUT Main Gate", "Pretoria CBD", "Arts Campus", "Arcadia Campus"]'::jsonb WHERE id = 'eff2265d-e598-47d9-bd86-792633044418';

-- Reposition demo buses around Tshwane / Pretoria
UPDATE public.buses SET current_lat = -25.7327, current_lng = 28.1631 WHERE bus_number = 'BUS-14';
UPDATE public.buses SET current_lat = -25.5350, current_lng = 28.1018 WHERE bus_number = 'BUS-22';
UPDATE public.buses SET current_lat = -25.7449, current_lng = 28.2009 WHERE bus_number = 'BUS-31';
