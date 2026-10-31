const express = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { z } = require("zod");
const prisma = require("../config/db");
const { authenticate } = require("../middleware/auth");

const router = express.Router();

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  roleName: z.enum(["ADMIN", "MANUFACTURER", "OWNER", "SERVICE_CENTER", "RECYCLER", "AUDITOR"]),
});

router.post("/register", async (req, res, next) => {
  try {
    const data = registerSchema.parse(req.body);
    const role = await prisma.role.findUnique({ where: { name: data.roleName } });
    if (!role) return res.status(400).json({ error: "Unknown role" });

    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: "Email already registered" });

    const passwordHash = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { email: data.email, passwordHash, name: data.name, roleId: role.id },
    });

    await prisma.auditLog.create({
      data: { userId: user.id, action: "REGISTER", entityType: "USER", entityId: user.id },
    });

    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

router.post("/login", async (req, res, next) => {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email }, include: { role: true } });
    if (!user) return res.status(401).json({ error: "Invalid credentials" });

    const valid = await bcrypt.compare(data.password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid credentials" });

    const token = jwt.sign(
      { id: user.id, email: user.email, roleName: user.role.name },
      process.env.JWT_SECRET,
      { expiresIn: process.env.JWT_EXPIRES_IN || "8h" }
    );

    await prisma.auditLog.create({
      data: { userId: user.id, action: "LOGIN", entityType: "USER", entityId: user.id },
    });

    res.json({ token, user: { id: user.id, email: user.email, name: user.name, role: user.role.name } });
  } catch (err) {
    if (err.name === "ZodError") return res.status(422).json({ error: err.errors });
    next(err);
  }
});

router.get("/me", authenticate, async (req, res, next) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id }, include: { role: true } });
    if (!user) return res.status(404).json({ error: "User not found" });
    res.json({ id: user.id, email: user.email, name: user.name, role: user.role.name });
  } catch (err) { next(err); }
});

router.post("/logout", authenticate, async (req, res, next) => {
  try {
    await prisma.auditLog.create({
      data: { userId: req.user.id, action: "LOGOUT", entityType: "USER", entityId: req.user.id },
    });
    res.json({ message: "Logged out" });
  } catch (err) { next(err); }
});

module.exports = router;
