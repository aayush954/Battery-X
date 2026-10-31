const express = require("express");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();
router.use(authenticate);

// All dashboard numbers are computed live from PostgreSQL — never hardcoded.
router.get("/", async (req, res, next) => {
  try {
    const [total, active, secondLife, recycled, healthAgg] = await Promise.all([
      prisma.battery.count(),
      prisma.battery.count({ where: { status: "ACTIVE_USE" } }),
      prisma.battery.count({ where: { status: "SECOND_LIFE" } }),
      prisma.battery.count({ where: { status: "RECYCLED" } }),
      prisma.batteryHealthRecord.groupBy({ by: ["batteryId"], _avg: { soh: true } }),
    ]);
    const avgSoh = healthAgg.length
      ? Math.round(healthAgg.reduce((a, r) => a + (r._avg.soh || 0), 0) / healthAgg.length)
      : null;
    const nearEol = healthAgg.filter(r => (r._avg.soh || 100) < 55).length;

    const stageDistribution = await prisma.battery.groupBy({ by: ["status"], _count: true });
    const chemistryDistribution = await prisma.batteryModel.groupBy({ by: ["chemistry"], _count: true });

    res.json({ total, active, secondLife, recycled, avgSoh, nearEol, stageDistribution, chemistryDistribution });
  } catch (err) { next(err); }
});

module.exports = router;
