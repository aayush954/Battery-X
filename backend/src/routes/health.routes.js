const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router({ mergeParams: true });
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const records = await prisma.batteryHealthRecord.findMany({
      where: { batteryId }, orderBy: { recordedAt: "desc" }, take: 100,
    });
    res.json(records);
  } catch (err) { next(err); }
});

const healthSchema = z.object({
  soh: z.number().min(0).max(100),
  soc: z.number().min(0).max(100),
  cycleCount: z.number().int().min(0),
  measuredCapacity: z.number().positive(),
  temperature: z.number().min(-40).max(90).optional(),
  source: z.string().optional(),
});

router.post("/", requireRole("ADMIN", "SERVICE_CENTER", "MANUFACTURER"), async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const data = healthSchema.parse(req.body);
    const record = await prisma.batteryHealthRecord.create({
      data: { batteryId, ...data, source: data.source || "MANUAL" },
    });
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: "HEALTH_UPDATE", entityType: "BATTERY", entityId: batteryId },
    });
    // Trigger-equivalent: flag low SOH for inspection (see database/triggers.sql for the real Postgres trigger)
    if (data.soh < 55) {
      await prisma.auditLog.create({
        data: { userId: req.user.id, action: "LOW_SOH_ALERT", entityType: "BATTERY", entityId: batteryId, metadata: { soh: data.soh } },
      });
    }
    res.status(201).json(record);
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

module.exports = router;
