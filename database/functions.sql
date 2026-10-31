-- Stored procedure: transfer_battery_ownership
-- Validates ownership, updates state, inserts transfer record, and returns the result.
-- The Express layer performs this same workflow via a Prisma transaction
-- (see backend/src/routes/ownership.routes.js); this SQL version demonstrates
-- the equivalent logic at the database level, as required by the course spec.

CREATE OR REPLACE FUNCTION transfer_battery_ownership(
  p_battery_id INT, p_new_owner_id INT
) RETURNS TABLE(transfer_id INT, battery_id INT, new_owner_id INT) AS $$
DECLARE
  v_old_owner INT;
  v_transfer_id INT;
BEGIN
  SELECT "currentOwnerId" INTO v_old_owner FROM "Battery" WHERE id = p_battery_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Battery % not found', p_battery_id;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM "User" WHERE id = p_new_owner_id) THEN
    RAISE EXCEPTION 'New owner % not found', p_new_owner_id;
  END IF;

  INSERT INTO "OwnershipTransfer" ("batteryId", "fromUserId", "toUserId", "transferredAt")
  VALUES (p_battery_id, v_old_owner, p_new_owner_id, now())
  RETURNING id INTO v_transfer_id;

  UPDATE "Battery" SET "currentOwnerId" = p_new_owner_id WHERE id = p_battery_id;

  RETURN QUERY SELECT v_transfer_id, p_battery_id, p_new_owner_id;
END;
$$ LANGUAGE plpgsql;
