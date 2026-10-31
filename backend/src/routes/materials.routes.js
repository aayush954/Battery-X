const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();
router.use(authenticate);

router.get("/", async (req, res, next) => {
  try {
    const { batteryId } = req.query;
    const materials = await prisma.recoveredMaterial.findMany({
      where: batteryId ? { batteryId: parseInt(batteryId, 10) } : {},
      include: { recyclingBatch: true, battery: { select: { passportId: true } } },
      orderBy: { recoveredAt: "desc" },
    });
    res.json(materials);
  } catch (err) { next(err); }
});

const schema = z.object({
  recyclingBatchId: z.number().int(),
  batteryId: z.number().int(),
  materialType: z.string(),
  quantityKg: z.number().positive(),
  purity: z.number().min(0).max(100).optional(),
  destination: z.string().optional(),
});

router.post("/", requireRole("ADMIN", "RECYCLER"), async (req, res, next) => {
  try {
    const data = schema.parse(req.body);
    const material = await prisma.recoveredMaterial.create({ data });
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: "MATERIAL_RECOVERY", entityType: "BATTERY", entityId: data.batteryId },
    });
    res.status(201).json(material);
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

// GET /api/materials/provenance/:batteryId — battery -> batch -> manufacturer trace
router.get("/provenance/:batteryId", async (req, res, next) => {
  try {
    const batteryId = parseInt(req.params.batteryId, 10);
    const materials = await prisma.recoveredMaterial.findMany({
      where: { batteryId },
      include: {
        recyclingBatch: { include: { organization: true } },
        battery: { include: { batteryModel: { include: { manufacturer: true } } } },
      },
    });
    res.json(materials);
  } catch (err) { next(err); }
});

module.exports = router;
