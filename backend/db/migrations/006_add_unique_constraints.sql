-- 1. Delete duplicates from phone codes safely
DELETE t1 FROM lkp_phone_codes t1
INNER JOIN lkp_phone_codes t2 
WHERE t1.id > t2.id AND t1.country_name = t2.country_name;

-- 2. Add UNIQUE constraint to phone codes
ALTER TABLE lkp_phone_codes ADD UNIQUE (country_name);

-- 3. Delete duplicates from countries safely
DELETE t1 FROM lkp_countries t1
INNER JOIN lkp_countries t2 
WHERE t1.id > t2.id AND t1.name = t2.name;

-- 4. Add UNIQUE constraint to countries
ALTER TABLE lkp_countries ADD UNIQUE (name);