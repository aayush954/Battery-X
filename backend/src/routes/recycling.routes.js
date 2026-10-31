const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { appendLifecycleEvent } = require("../utils/hashChain");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const batches = await prisma.recyclingBatch.findMany({
      orderBy: { createdAt: "desc" }, include: { recoveredMaterials: true },
    });
    res.json(batches);
  } catch (err) { next(err); }
});

const schema = z.object({ batteryId: z.number().int(), organizationId: z.number().int().optional() });

// Recycling completion transaction: battery -> batch -> status update -> lifecycle event.
router.post("/", requireRole("ADMIN", "RECYCLER"), async (req, res, next) => {
  try {
    const { batteryId, organizationId } = schema.parse(req.body);

    const result = await prisma.$transaction(async (tx) => {
      const battery = await tx.battery.findUnique({ where: { id: batteryId } });
      if (!battery) { const e = new Error("Battery not found"); e.status = 404; throw e; }

      const count = await tx.recyclingBatch.count();
      const batch = await tx.recyclingBatch.create({
        data: { batchCode: `RB-${1000 + count + 1}`, organizationId, status: "OPEN" },
      });

      await tx.battery.update({ where: { id: batteryId }, data: { status: "RECYCLED" } });

      await appendLifecycleEvent(tx, {
        batteryId, eventType: "RECYCLING_BATCH_ASSIGNED", actorUserId: req.user.id,
        previousState: battery.status, newState: "RECYCLED", metadata: { batchCode: batch.batchCode },
      });

      await tx.auditLog.create({
        data: { userId: req.user.id, action: "RECYCLING", entityType: "BATTERY", entityId: batteryId },
      });

      return batch;
    });

    res.status(201).json(result);
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

module.exports = router;
