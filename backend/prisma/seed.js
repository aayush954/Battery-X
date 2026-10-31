const { PrismaClient } = require("@prisma/client");
const bcrypt = require("bcryptjs");
const prisma = new PrismaClient();

const ROLES = ["ADMIN", "MANUFACTURER", "OWNER", "SERVICE_CENTER", "RECYCLER", "AUDITOR"];
const CHEM = ["NMC", "LFP", "NCA"];

function rand(min, max) { return Math.random() * (max - min) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function main() {
  if (await prisma.battery.count()) { console.log("Database already seeded; skipping sample data."); return; }
  console.log("Seeding roles...");
  const roles = {};
  for (const name of ROLES) {
    roles[name] = await prisma.role.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log("Seeding organizations & users...");
  const org = await prisma.organization.upsert({ where: { id: 1 }, update: {}, create: { name: "VoltCore Manufacturing", type: "MANUFACTURER" } });
  const recyclerOrg = await prisma.organization.upsert({ where: { id: 2 }, update: {}, create: { name: "GreenCycle Recovery", type: "RECYCLER" } });

  const passwordHash = await bcrypt.hash("Password123!", 12);
  const userData = [
    { email: "admin@batteryx.dev", username: "admin", name: "System Admin", roleId: roles.ADMIN.id },
    { email: "owner@batteryx.dev", username: "owner", name: "Sample Owner", roleId: roles.OWNER.id },
    { email: "recycler@batteryx.dev", username: "recycler", name: "Recycler Operator", roleId: roles.RECYCLER.id, organizationId: recyclerOrg.id },
    { email: "auditor@batteryx.dev", username: "auditor", name: "Lifecycle Auditor", roleId: roles.AUDITOR.id },
    { email: "manufacturer@batteryx.dev", username: "manufacturer", name: "Manufacturing Operator", roleId: roles.MANUFACTURER.id, organizationId: org.id },
];
  const users = {};
  for (const u of userData) {
    users[u.username] = await prisma.user.upsert({ where: { email: u.email }, update: { username: u.username, name: u.name, roleId: u.roleId, organizationId: u.organizationId, active: true, emailVerified: true }, create: { ...u, passwordHash, active: true, emailVerified: true, emailVerifiedAt: new Date() } });
  }
  const admin = users.admin, owner = users.owner;

  console.log("Seeding manufacturer & battery models...");
  const manufacturer = await prisma.manufacturer.create({ data: { name: "VoltCore", organizationId: org.id } });
  const models = [];
  for (let i = 0; i < 5; i++) {
    models.push(await prisma.batteryModel.create({
      data: {
        name: `VC-${100 + i}`, manufacturerId: manufacturer.id, chemistry: pick(CHEM),
        capacityKwh: Math.round(rand(40, 90)), voltage: Math.round(rand(350, 800)),
      },
    }));
  }

  console.log("Seeding batteries + health + lifecycle events...");
  for (let i = 1; i <= 30; i++) {
    const model = pick(models);
    const passportId = `BAT-2026-${String(i).padStart(6, "0")}`;
    const soh = Math.round(rand(45, 98));
    const status = soh > 85 ? "ACTIVE_USE" : soh > 65 ? "HEALTH_DECLINE" : soh > 45 ? "SECOND_LIFE" : "RECYCLED";

    const battery = await prisma.battery.create({
      data: {
        passportId, serialNumber: `SN${100000 + i}`, batteryModelId: model.id,
        manufacturingDate: new Date(Date.now() - rand(30, 2500) * 86400000),
        weightKg: Math.round(rand(250, 500)), status, currentOwnerId: owner.id,
      },
    });

    let prevHash = "GENESIS";
    const crypto = require("crypto");
    const events = [
      ["MANUFACTURED", null, "MANUFACTURED"],
      ["INSTALLED", "MANUFACTURED", "INSTALLED"],
      ["OWNERSHIP_TRANSFER", "INSTALLED", "ACTIVE_USE"],
    ];
    for (const [eventType, prevState, newState] of events) {
      const data = { batteryId: battery.id, eventType, eventTimestamp: new Date(), previousState: prevState, newState };
      const hash = crypto.createHash("sha256").update(prevHash + JSON.stringify(data)).digest("hex");
      await prisma.lifecycleEvent.create({
        data: { ...data, actorUserId: admin.id, eventHash: hash, previousEventHash: prevHash },
      });
      prevHash = hash;
    }

    for (let h = 0; h < 5; h++) {
      await prisma.batteryHealthRecord.create({
        data: {
          batteryId: battery.id, soh: Math.min(100, soh + h * 2), soc: Math.round(rand(20, 95)),
          cycleCount: Math.round(rand(100, 1400)), measuredCapacity: Math.round(rand(30, 90)),
          temperature: Math.round(rand(15, 40)), recordedAt: new Date(Date.now() - h * 20 * 86400000),
        },
      });
    }

    await prisma.ownershipTransfer.create({
      data: { batteryId: battery.id, fromUserId: null, toUserId: owner.id },
    });

    if (status === "RECYCLED") {
      const batch = await prisma.recyclingBatch.create({
        data: { batchCode: `RB-${1000 + i}`, organizationId: recyclerOrg.id, status: "COMPLETE" },
      });
      for (const material of ["Lithium", "Nickel", "Cobalt", "Copper"]) {
        await prisma.recoveredMaterial.create({
          data: {
            recyclingBatchId: batch.id, batteryId: battery.id, materialType: material,
            quantityKg: +rand(2, 30).toFixed(1), purity: Math.round(rand(90, 99)),
            destination: pick(["Cathode refiner", "Foundry partner", "Chem recovery plant"]),
          },
        });
      }
    }
  }

  console.log("Seed complete. Login with admin@batteryx.dev / owner@batteryx.dev etc, password: Password123!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(async () => { await prisma.$disconnect(); });
