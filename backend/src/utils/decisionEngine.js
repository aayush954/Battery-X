// Rule-based Next-Life Decision Engine.
// Academic decision-support prototype — NOT a certified engineering,
// safety, or regulatory determination.

function computeDataConfidence({ hasHealth, hasMaintenance, hasOwnership, hasCharging, hasTemperature }) {
  const checks = [hasHealth, hasMaintenance, hasOwnership, hasCharging, hasTemperature];
  const present = checks.filter(Boolean).length;
  return Math.round((present / checks.length) * 100);
}

function clamp(v) { return Math.max(0, Math.min(100, v)); }

function scoreNextLifePathways({ soh, cycleCount, ageYears, dataConfidence }) {
  const evReuse = clamp(soh * 0.9 - ageYears * 3 - (cycleCount > 900 ? 15 : 0));
  const storage = clamp(100 - Math.abs(soh - 65) * 1.6 + (dataConfidence > 70 ? 5 : 0));
  const refurb = clamp((100 - soh) * 0.4 + (cycleCount < 600 ? 20 : 0));
  const recycling = clamp((100 - soh) * 1.1 + (ageYears > 6 ? 15 : 0));
  const inspection = dataConfidence < 55 ? 70 : 15;

  const scores = {
    EV_REUSE: Math.round(evReuse),
    SECOND_LIFE_STORAGE: Math.round(storage),
    REFURBISHMENT: Math.round(refurb),
    RECYCLING: Math.round(recycling),
    INSPECTION_REQUIRED: Math.round(inspection),
  };
  const recommended = Object.entries(scores).sort((a, b) => b[1] - a[1])[0][0];
  return { scores, recommended };
}

function simulateScenario({ startSoh, scenarioType, years = 3 }) {
  const rateMap = { CONTINUE_EV_USE: 6, SECOND_LIFE_STORAGE: 4, REFURBISHMENT: 2, RECYCLE_NOW: 0 };
  const rate = rateMap[scenarioType] ?? 5;
  let soh = startSoh;
  const projection = [];
  for (let y = 1; y <= years; y++) {
    soh = Math.max(0, soh - rate);
    projection.push({ year: y, projectedSoh: Math.round(soh) });
  }
  return { scenarioType, projection, label: "SIMULATION / ESTIMATE" };
}

module.exports = { computeDataConfidence, scoreNextLifePathways, simulateScenario };
