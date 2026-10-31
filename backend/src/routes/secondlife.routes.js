const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { appendLifecycleEvent } = require("../utils/hashChain");

const router = express.Router({ mergeParams: true });
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const assessments = await prisma.secondLifeAssessment.findMany({
      where: { batteryId }, orderBy: { assessedAt: "desc" },
    });
    res.json(assessments);
  } catch (err) { next(err); }
});

const schema = z.object({
  soh: z.number().min(0).max(100),
  cycleCount: z.number().int().min(0),
  safetyStatus: z.string(),
  recommendedPathway: z.enum(["EV_REUSE", "SECOND_LIFE_STORAGE", "REFURBISHMENT", "RECYCLING", "QUARANTINED", "INSPECTION_REQUIRED"]),
  notes: z.string().optional(),
});

router.post("/", requireRole("ADMIN", "RECYCLER", "SERVICE_CENTER"), async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const data = schema.parse(req.body);

    const assessment = await prisma.$transaction(async (tx) => {
      const a = await tx.secondLifeAssessment.create({
        data: { batteryId, assessedByUserId: req.user.id, ...data },
      });
      await appendLifecycleEvent(tx, {
        batteryId, eventType: "SECOND_LIFE_ASSESSMENT", actorUserId: req.user.id,
        newState: data.recommendedPathway, metadata: { assessmentId: a.id },
      });
      await tx.auditLog.create({
        data: { userId: req.user.id, action: "SECOND_LIFE_ASSESSMENT", entityType: "BATTERY", entityId: batteryId },
      });
      return a;
    });

    res.status(201).json(assessment);
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

module.exports = router;
