const express = require("express");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");
const { appendLifecycleEvent } = require("../utils/hashChain");
const { computeDataConfidence, scoreNextLifePathways } = require("../utils/decisionEngine");

const router = express.Router();
router.use(authenticate);

// GET /api/batteries?search=&chemistry=&status=&page=&pageSize=
router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || "25", 10), 50);
    const { search, chemistry, status } = req.query;

    const where = {
      AND: [
        search ? { OR: [
          { passportId: { contains: search, mode: "insensitive" } },
          { serialNumber: { contains: search, mode: "insensitive" } },
        ] } : {},
        status ? { status } : {},
        chemistry ? { batteryModel: { chemistry } } : {},
      ],
    };

    const [total, batteries] = await Promise.all([
      prisma.battery.count({ where }),
      prisma.battery.findMany({
        where, skip: (page - 1) * pageSize, take: pageSize,
        include: { batteryModel: { include: { manufacturer: true } } },
        orderBy: { id: "asc" },
      }),
    ]);

    res.json({ total, page, pageSize, totalPages: Math.ceil(total / pageSize), data: batteries });
  } catch (err) { next(err); }
});

const createSchema = z.object({
  serialNumber: z.string().min(3),
  batteryModelId: z.number().int(),
  manufacturingDate: z.string(),
  weightKg: z.number().optional(),
});

router.post("/", requireRole("ADMIN", "MANUFACTURER"), async (req, res, next) => {
  try {
    const data = createSchema.parse(req.body);
    const count = await prisma.battery.count();
    const passportId = `BAT-${new Date().getFullYear()}-${String(count + 1).padStart(6, "0")}`;

    const battery = await prisma.$transaction(async (tx) => {
      const b = await tx.battery.create({
        data: {
          passportId, serialNumber: data.serialNumber, batteryModelId: data.batteryModelId,
          manufacturingDate: new Date(data.manufacturingDate), weightKg: data.weightKg,
          status: "MANUFACTURED",
        },
      });
      await appendLifecycleEvent(tx, {
        batteryId: b.id, eventType: "MANUFACTURED", actorUserId: req.user.id,
        previousState: null, newState: "MANUFACTURED", metadata: { passportId },
      });
      await tx.auditLog.create({
        data: { userId: req.user.id, action: "CREATE_BATTERY", entityType: "BATTERY", entityId: b.id },
      });
      return b;
    });

    res.status(201).json(battery);
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    if (err.code === "P2002") return res.status(409).json({ error: "Duplicate serial number or passport ID" });
    next(err);
  }
});

router.get("/:id", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const battery = await prisma.battery.findUnique({
      where: { id },
      include: { batteryModel: { include: { manufacturer: true } }, currentOwner: true },
    });
    if (!battery) return res.status(404).json({ error: "Battery not found" });

    const [healthCount, maintenanceCount, ownershipCount] = await Promise.all([
      prisma.batteryHealthRecord.count({ where: { batteryId: id } }),
      prisma.maintenanceRecord.count({ where: { batteryId: id } }),
      prisma.ownershipTransfer.count({ where: { batteryId: id } }),
    ]);
    const dataConfidence = computeDataConfidence({
      hasHealth: healthCount > 0, hasMaintenance: maintenanceCount > 0,
      hasOwnership: ownershipCount > 0, hasCharging: false, hasTemperature: healthCount > 0,
    });

    res.json({ ...battery, dataConfidence });
  } catch (err) { next(err); }
});

router.put("/:id", requireRole("ADMIN", "MANUFACTURER"), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { status, weightKg } = req.body;
    const battery = await prisma.battery.update({ where: { id }, data: { status, weightKg } });
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: "UPDATE_BATTERY", entityType: "BATTERY", entityId: id },
    });
    res.json(battery);
  } catch (err) { next(err); }
});

router.delete("/:id", requireRole("ADMIN"), async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    await prisma.battery.delete({ where: { id } });
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: "DELETE_BATTERY", entityType: "BATTERY", entityId: id },
    });
    res.status(204).send();
  } catch (err) { next(err); }
});

// GET /api/batteries/:id/decision — Next-Life Decision Engine
router.get("/:id/decision", async (req, res, next) => {
  try {
    const id = parseInt(req.params.id, 10);
    const battery = await prisma.battery.findUnique({ where: { id } });
    if (!battery) return res.status(404).json({ error: "Battery not found" });

    const latestHealth = await prisma.batteryHealthRecord.findFirst({
      where: { batteryId: id }, orderBy: { recordedAt: "desc" },
    });
    if (!latestHealth) return res.status(422).json({ error: "No health record available for decision scoring" });

    const ageYears = (Date.now() - new Date(battery.manufacturingDate).getTime()) / (1000 * 60 * 60 * 24 * 365);
    const [healthCount, maintenanceCount, ownershipCount] = await Promise.all([
      prisma.batteryHealthRecord.count({ where: { batteryId: id } }),
      prisma.maintenanceRecord.count({ where: { batteryId: id } }),
      prisma.ownershipTransfer.count({ where: { batteryId: id } }),
    ]);
    const dataConfidence = computeDataConfidence({
      hasHealth: healthCount > 0, hasMaintenance: maintenanceCount > 0,
      hasOwnership: ownershipCount > 0, hasCharging: false, hasTemperature: true,
    });

    const result = scoreNextLifePathways({
      soh: latestHealth.soh, cycleCount: latestHealth.cycleCount, ageYears, dataConfidence,
    });

    res.json({ ...result, dataConfidence, disclaimer: "Academic decision-support prototype output — not a certified engineering or safety determination." });
  } catch (err) { next(err); }
});

module.exports = router;
