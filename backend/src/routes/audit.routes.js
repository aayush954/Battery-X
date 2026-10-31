const express = require("express");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");
const { requireRole } = require("../middleware/rbac");

const router = express.Router();
router.use(authenticate, requireRole("ADMIN", "AUDITOR"));

router.get("/", async (req, res, next) => {
  try {
    const page = parseInt(req.query.page || "1", 10);
    const pageSize = Math.min(parseInt(req.query.pageSize || "25", 10), 50);
    const [total, logs] = await Promise.all([
      prisma.auditLog.count(),
      prisma.auditLog.findMany({
        skip: (page - 1) * pageSize, take: pageSize, orderBy: { createdAt: "desc" },
        include: { user: { select: { name: true, email: true } } },
      }),
    ]);
    res.json({ total, page, pageSize, totalPages: Math.ceil(total / pageSize), data: logs });
  } catch (err) { next(err); }
});

module.exports = router;
