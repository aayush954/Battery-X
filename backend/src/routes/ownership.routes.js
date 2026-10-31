const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { appendLifecycleEvent } = require("../utils/hashChain");

const router = express.Router({ mergeParams: true });
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const transfers = await prisma.ownershipTransfer.findMany({
      where: { batteryId }, orderBy: { transferredAt: "desc" },
      include: { fromUser: { select: { name: true } }, toUser: { select: { name: true } } },
    });
    res.json(transfers);
  } catch (err) { next(err); }
});

const transferSchema = z.object({ toUserId: z.number().int() });

// Ownership transfer as a single database transaction:
// verify battery -> verify new owner -> create transfer -> update battery
// -> lifecycle event -> audit log -> commit (or rollback on any failure).
router.post("/transfer", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const { toUserId } = transferSchema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const battery = await tx.battery.findUnique({ where: { id: batteryId } });
      if (!battery) { const e = new Error("Battery not found"); e.status = 404; throw e; }

      const newOwner = await tx.user.findUnique({ where: { id: toUserId } });
      if (!newOwner) { const e = new Error("New owner not found"); e.status = 404; throw e; }

      const transfer = await tx.ownershipTransfer.create({
        data: { batteryId, fromUserId: battery.currentOwnerId, toUserId },
      });

      await tx.battery.update({ where: { id: batteryId }, data: { currentOwnerId: toUserId } });

      await appendLifecycleEvent(tx, {
        batteryId, eventType: "OWNERSHIP_TRANSFER", actorUserId: req.user.id,
        previousState: battery.currentOwnerId ? String(battery.currentOwnerId) : null,
        newState: String(toUserId), metadata: { transferId: transfer.id },
      });

      await tx.auditLog.create({
        data: { userId: req.user.id, action: "OWNERSHIP_TRANSFER", entityType: "BATTERY", entityId: batteryId },
      });

      return transfer;
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

module.exports = router;
