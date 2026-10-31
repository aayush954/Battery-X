const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { simulateScenario } = require("../utils/decisionEngine");

const router = express.Router();
router.use(authenticate);

const schema = z.object({
  batteryId: z.number().int(),
  scenarioType: z.enum(["CONTINUE_EV_USE", "SECOND_LIFE_STORAGE", "REFURBISHMENT", "RECYCLE_NOW"]),
  years: z.number().int().min(1).max(10).optional(),
});

router.post("/", async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const latestHealth = await prisma.batteryHealthRecord.findFirst({
      where: { batteryId: data.batteryId }, orderBy: { recordedAt: "desc" },
    });
    if (!latestHealth) return res.status(422).json({ error: "No health record available to simulate from" });

    const result = simulateScenario({
      startSoh: latestHealth.soh, scenarioType: data.scenarioType, years: data.years || 3,
    });
    res.json({ batteryId: data.batteryId, startSoh: latestHealth.soh, ...result });
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

module.exports = router;
