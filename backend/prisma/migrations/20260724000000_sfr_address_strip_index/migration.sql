-- Прозвон / СФР: store office addresses without the leading postal index.
-- Real data looks like "420127, Республика Татарстан, г. Казань, ...";
-- the 6-digit почтовый индекс at the front is dropped so the call card shows
-- a cleaner address. regexp_replace on a non-matching row is a no-op, so this
-- is safe to run over the whole table.
UPDATE "SocialFundOffice"
SET "address" = regexp_replace("address", '^\s*[0-9]{6}\s*,?\s*', '')
WHERE "address" ~ '^\s*[0-9]{6}';
