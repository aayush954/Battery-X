-- Run after `prisma migrate deploy` has created the base tables.

CREATE OR REPLACE VIEW battery_passport_summary AS
SELECT b.id, b."passportId", b."serialNumber", bm.name AS model_name, bm.chemistry,
       m.name AS manufacturer_name, b.status, b."manufacturingDate"
FROM "Battery" b
JOIN "BatteryModel" bm ON bm.id = b."batteryModelId"
JOIN "Manufacturer" m ON m.id = bm."manufacturerId";

CREATE OR REPLACE VIEW battery_health_summary AS
SELECT "batteryId", AVG(soh) AS avg_soh, MAX(soh) AS max_soh, MIN(soh) AS min_soh,
       MAX("cycleCount") AS latest_cycle_count, COUNT(*) AS reading_count
FROM battery_health_records
GROUP BY "batteryId";

CREATE OR REPLACE VIEW battery_lifecycle_summary AS
SELECT "batteryId", COUNT(*) AS event_count, MIN("eventTimestamp") AS first_event,
       MAX("eventTimestamp") AS latest_event
FROM "LifecycleEvent"
GROUP BY "batteryId";

CREATE OR REPLACE VIEW recycling_material_summary AS
SELECT rb."batchCode", rm."materialType", SUM(rm."quantityKg") AS total_kg, AVG(rm.purity) AS avg_purity
FROM "RecoveredMaterial" rm
JOIN "RecyclingBatch" rb ON rb.id = rm."recyclingBatchId"
GROUP BY rb."batchCode", rm."materialType";

CREATE OR REPLACE VIEW manufacturer_battery_statistics AS
SELECT m.name AS manufacturer, COUNT(b.id) AS battery_count,
       AVG(bhs.avg_soh) AS avg_fleet_soh
FROM "Manufacturer" m
JOIN "BatteryModel" bm ON bm."manufacturerId" = m.id
JOIN "Battery" b ON b."batteryModelId" = bm.id
LEFT JOIN battery_health_summary bhs ON bhs."batteryId" = b.id
GROUP BY m.name;
