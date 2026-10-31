-- Trigger 1: flag battery for inspection when SOH crosses below 55 on insert.
CREATE OR REPLACE FUNCTION fn_flag_low_soh() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.soh < 55 THEN
    INSERT INTO "AuditLog" (action, "entityType", "entityId", metadata, "createdAt")
    VALUES ('LOW_SOH_ALERT', 'BATTERY', NEW."batteryId",
      jsonb_build_object('soh', NEW.soh, 'recordedAt', NEW."recordedAt"), now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_low_soh ON battery_health_records;
CREATE TRIGGER trg_low_soh
AFTER INSERT ON battery_health_records
FOR EACH ROW EXECUTE FUNCTION fn_flag_low_soh();

-- Trigger 2: when a battery becomes END_OF_LIFE, log a recycling-workflow audit entry.
CREATE OR REPLACE FUNCTION fn_battery_eol() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'END_OF_LIFE' AND OLD.status IS DISTINCT FROM 'END_OF_LIFE' THEN
    INSERT INTO "AuditLog" (action, "entityType", "entityId", metadata, "createdAt")
    VALUES ('EOL_REACHED', 'BATTERY', NEW.id, jsonb_build_object('previousStatus', OLD.status), now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_battery_eol ON "Battery";
CREATE TRIGGER trg_battery_eol
AFTER UPDATE ON "Battery"
FOR EACH ROW EXECUTE FUNCTION fn_battery_eol();

-- Trigger 3: audit any ownership change on the Battery table itself.
CREATE OR REPLACE FUNCTION fn_audit_owner_change() RETURNS TRIGGER AS $$
BEGIN
  IF NEW."currentOwnerId" IS DISTINCT FROM OLD."currentOwnerId" THEN
    INSERT INTO "AuditLog" (action, "entityType", "entityId", metadata, "createdAt")
    VALUES ('OWNER_FIELD_CHANGED', 'BATTERY', NEW.id,
      jsonb_build_object('from', OLD."currentOwnerId", 'to', NEW."currentOwnerId"), now());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_owner_change ON "Battery";
CREATE TRIGGER trg_owner_change
AFTER UPDATE ON "Battery"
FOR EACH ROW EXECUTE FUNCTION fn_audit_owner_change();
