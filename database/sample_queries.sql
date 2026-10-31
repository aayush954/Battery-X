-- 1. INNER JOIN: batteries with their model and manufacturer
SELECT b."passportId", bm.name, m.name AS manufacturer
FROM "Battery" b
INNER JOIN "BatteryModel" bm ON bm.id = b."batteryModelId"
INNER JOIN "Manufacturer" m ON m.id = bm."manufacturerId";

-- 2. LEFT JOIN: all batteries, with health record count even if zero
SELECT b."passportId", COUNT(h.id) AS health_readings
FROM "Battery" b
LEFT JOIN battery_health_records h ON h."batteryId" = b.id
GROUP BY b."passportId";

-- 3. Multi-table JOIN: battery -> owner -> lifecycle event -> actor
SELECT b."passportId", u.name AS owner, le."eventType", actor.name AS performed_by
FROM "Battery" b
JOIN "User" u ON u.id = b."currentOwnerId"
JOIN "LifecycleEvent" le ON le."batteryId" = b.id
JOIN "User" actor ON actor.id = le."actorUserId";

-- 4. GROUP BY: battery count per manufacturer
SELECT m.name, COUNT(b.id) AS battery_count
FROM "Manufacturer" m
JOIN "BatteryModel" bm ON bm."manufacturerId" = m.id
JOIN "Battery" b ON b."batteryModelId" = bm.id
GROUP BY m.name;

-- 5. HAVING: manufacturers with more than 5 batteries
SELECT m.name, COUNT(b.id) AS battery_count
FROM "Manufacturer" m
JOIN "BatteryModel" bm ON bm."manufacturerId" = m.id
JOIN "Battery" b ON b."batteryModelId" = bm.id
GROUP BY m.name
HAVING COUNT(b.id) > 5;

-- 6. Subquery: batteries with above-average SOH
SELECT "passportId" FROM "Battery" b
WHERE b.id IN (
  SELECT "batteryId" FROM battery_health_summary
  WHERE avg_soh > (SELECT AVG(soh) FROM battery_health_records)
);

-- 7. Aggregate: fleet-wide average SOH
SELECT AVG(soh) AS fleet_avg_soh FROM battery_health_records;

-- 8. Date aggregation: health readings per month
SELECT date_trunc('month', "recordedAt") AS month, COUNT(*) AS readings
FROM battery_health_records GROUP BY 1 ORDER BY 1;

-- 9. Manufacturer analysis: avg SOH by manufacturer
SELECT * FROM manufacturer_battery_statistics;

-- 10. SOH analysis: distribution buckets
SELECT
  CASE WHEN soh >= 85 THEN 'HIGH' WHEN soh >= 55 THEN 'MEDIUM' ELSE 'LOW' END AS soh_bucket,
  COUNT(*) FROM battery_health_records GROUP BY 1;

-- 11. Lifecycle analysis: most common event types
SELECT "eventType", COUNT(*) FROM "LifecycleEvent" GROUP BY "eventType" ORDER BY 2 DESC;

-- 12. Second-life analysis: pathway recommendation counts
SELECT "recommendedPathway", COUNT(*) FROM "SecondLifeAssessment" GROUP BY 1;

-- 13. Recycling analysis: material recovered per batch
SELECT * FROM recycling_material_summary;

-- 14. Material provenance: trace a battery's recovered materials to manufacturer
SELECT b."passportId", m.name AS manufacturer, rm."materialType", rm."quantityKg"
FROM "RecoveredMaterial" rm
JOIN "Battery" b ON b.id = rm."batteryId"
JOIN "BatteryModel" bm ON bm.id = b."batteryModelId"
JOIN "Manufacturer" m ON m.id = bm."manufacturerId"
WHERE b.id = $1;

-- 15. Ownership history for a battery
SELECT * FROM "OwnershipTransfer" WHERE "batteryId" = $1 ORDER BY "transferredAt";

-- 16. Audit analysis: most active users
SELECT u.name, COUNT(a.id) FROM "AuditLog" a JOIN "User" u ON u.id = a."userId"
GROUP BY u.name ORDER BY 2 DESC;

-- 17. Data confidence: batteries with fewer than 2 health readings (low confidence)
SELECT b."passportId", COUNT(h.id) AS readings
FROM "Battery" b LEFT JOIN battery_health_records h ON h."batteryId" = b.id
GROUP BY b."passportId" HAVING COUNT(h.id) < 2;

-- 18. Simulation statistics (application-layer table if persisted): N/A in MVP schema,
-- simulations are computed on demand — see backend/src/utils/decisionEngine.js

-- 19. High-risk / inspection candidates: low SOH + low data confidence proxy
SELECT b."passportId", h.soh FROM "Battery" b
JOIN battery_health_records h ON h."batteryId" = b.id
WHERE h.soh < 50 ORDER BY h.soh ASC;

-- 20. Index/performance example
EXPLAIN ANALYZE
SELECT * FROM "Battery" WHERE "passportId" = 'BAT-2026-000001';
