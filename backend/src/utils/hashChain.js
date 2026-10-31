const crypto = require("crypto");

// Tamper-evident hash-linked audit history (NOT a blockchain — single-database
// integrity mechanism). Each lifecycle event's hash is derived from the
// previous event's hash plus this event's own data.
function computeEventHash(previousHash, eventData) {
  const payload = previousHash + JSON.stringify(eventData);
  return crypto.createHash("sha256").update(payload).digest("hex");
}

async function appendLifecycleEvent(prisma, { batteryId, eventType, actorUserId, organizationId, previousState, newState, metadata }) {
  const lastEvent = await prisma.lifecycleEvent.findFirst({
    where: { batteryId },
    orderBy: { eventTimestamp: "desc" },
  });
  const previousEventHash = lastEvent ? lastEvent.eventHash : "GENESIS";
  const eventTimestamp = new Date();
  const eventData = { batteryId, eventType, eventTimestamp, previousState, newState, metadata };
  const eventHash = computeEventHash(previousEventHash, eventData);

  return prisma.lifecycleEvent.create({
    data: {
      batteryId, eventType, eventTimestamp, actorUserId, organizationId,
      previousState, newState, metadata: metadata || {},
      eventHash, previousEventHash,
    },
  });
}

async function verifyLifecycleIntegrity(prisma, batteryId) {
  const events = await prisma.lifecycleEvent.findMany({
    where: { batteryId },
    orderBy: { eventTimestamp: "asc" },
  });
  let expectedPrev = "GENESIS";
  for (const e of events) {
    if (e.previousEventHash !== expectedPrev) {
      return { status: "INTEGRITY_CHECK_FAILED", failedAt: e.id };
    }
    const recomputed = computeEventHash(expectedPrev, {
      batteryId: e.batteryId, eventType: e.eventType, eventTimestamp: e.eventTimestamp,
      previousState: e.previousState, newState: e.newState, metadata: e.metadata,
    });
    if (recomputed !== e.eventHash) {
      return { status: "INTEGRITY_CHECK_FAILED", failedAt: e.id };
    }
    expectedPrev = e.eventHash;
  }
  return { status: "LIFECYCLE_HISTORY_VERIFIED", eventsChecked: events.length };
}

module.exports = { computeEventHash, appendLifecycleEvent, verifyLifecycleIntegrity };
