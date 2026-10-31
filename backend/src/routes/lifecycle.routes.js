const express = require("express");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { verifyLifecycleIntegrity } = require("../utils/hashChain");

const router = express.Router({ mergeParams: true });
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const events = await prisma.lifecycleEvent.findMany({
      where: { batteryId }, orderBy: { eventTimestamp: "asc" },
      include: { actor: { select: { name: true, email: true } } },
    });
    res.json(events);
  } catch (err) { next(err); }
});

router.get("/verify", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.id, 10);
    const result = await verifyLifecycleIntegrity(prisma, batteryId);
    res.json(result);
  } catch (err) { next(err); }
});

module.exports = router;
