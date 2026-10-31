const express = require("express");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const manufacturers = await prisma.manufacturer.findMany({ include: { battery_models: true } });
    res.json(manufacturers);
  } catch (err) { next(err); }
});

router.post("/", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const { name, organizationId } = req.body;
    const m = await prisma.manufacturer.create({ data: { name, organizationId } });
    res.status(201).json(m);
  } catch (err) { next(err); }
});

router.get("/:id/models", async (req, res, next) => {
  try {
    const manufacturerId = parseInt(req.params.id, 10);
    const models = await prisma.batteryModel.findMany({ where: { manufacturerId } });
    res.json(models);
  } catch (err) { next(err); }
});

router.post("/:id/models", requireRole("ADMIN", "MANUFACTURER"), async (req, res, next) => {
  try {
    const manufacturerId = parseInt(req.params.id, 10);
    const { name, chemistry, capacityKwh, voltage } = req.body;
    const model = await prisma.batteryModel.create({
      data: { name, chemistry, capacityKwh, voltage, manufacturerId },
    });
    res.status(201).json(model);
  } catch (err) { next(err); }
});

module.exports = router;
