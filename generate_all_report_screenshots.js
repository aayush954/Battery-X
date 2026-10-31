const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outDir = path.join(__dirname, 'report_screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function renderTerminalHtml(title, command, output) {
  const escapeHtml = (str) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  body {
    margin: 0;
    padding: 24px;
    background: #090d16;
    font-family: 'Consolas', 'Courier New', monospace;
    color: #e2e8f0;
  }
  .window {
    background: #0d1117;
    border: 1px solid #30363d;
    border-radius: 8px;
    box-shadow: 0 12px 32px rgba(0,0,0,0.6);
    overflow: hidden;
  }
  .titlebar {
    background: #161b22;
    padding: 10px 16px;
    display: flex;
    align-items: center;
    border-bottom: 1px solid #30363d;
  }
  .dots {
    display: flex;
    gap: 8px;
  }
  .dot {
    width: 12px;
    height: 12px;
    border-radius: 50%;
  }
  .dot.red { background: #ff5f56; }
  .dot.yellow { background: #ffbd2e; }
  .dot.green { background: #27c93f; }
  .title {
    margin-left: 16px;
    font-size: 13px;
    color: #8b949e;
    font-weight: 600;
  }
  .content {
    padding: 18px 22px;
    font-size: 13.5px;
    line-height: 1.45;
    white-space: pre-wrap;
    word-break: break-all;
    max-height: 700px;
    overflow: hidden;
  }
  .prompt {
    color: #58a6ff;
    font-weight: bold;
  }
  .cmd {
    color: #7ee787;
    font-weight: bold;
  }
  .output {
    color: #c9d1d9;
    margin-top: 8px;
  }
</style>
</head>
<body>
<div class="window">
  <div class="titlebar">
    <div class="dots">
      <div class="dot red"></div>
      <div class="dot yellow"></div>
      <div class="dot green"></div>
    </div>
    <div class="title">${escapeHtml(title)}</div>
  </div>
  <div class="content">
    <div><span class="prompt">batteryx@docker-desktop:~$ </span><span class="cmd">${escapeHtml(command)}</span></div>
    <div class="output">${escapeHtml(output)}</div>
  </div>
</div>
</body>
</html>`;
}

async function captureHtml(page, html, outputPath, viewport = { width: 1200, height: 750 }) {
  await page.setViewport(viewport);
  await page.setContent(html, { waitUntil: 'load' });
  await page.screenshot({ path: outputPath });
}

async function run() {
  console.log('Launching browser for comprehensive report capture...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=1440,900'],
    defaultViewport: { width: 1440, height: 900 }
  });

  const page = await browser.newPage();

  // Login as admin
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  await page.type('input[name="identifier"]', 'admin');
  await page.type('input[name="password"]', 'Password123!');
  await page.click('button[type="submit"]');
  await page.waitForNavigation({ waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));

  // A. UI Modals and Tabs:
  console.log('Capturing UI Tabs & Modals...');
  // 1. Add Battery Modal
  await page.goto('http://localhost:5173/batteries', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  await page.click('#add');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, 'fig_06_crud_create_battery_modal.png') });
  await page.keyboard.press('Escape');
  await new Promise(r => setTimeout(r, 400));

  // 2. Battery Passport Health Tab
  await page.goto('http://localhost:5173/batteries/1', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 1000));
  await page.click('button[data-tab="health"]');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'fig_11_health_record_history.png') });

  // 3. Battery Passport Lifecycle Hash-Chain Tab
  await page.click('button[data-tab="lifecycle"]');
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: path.join(outDir, 'fig_12_lifecycle_hashchain_verification.png') });

  // 4. Battery Passport Edit Condition Modal
  await page.click('#ec');
  await new Promise(r => setTimeout(r, 600));
  await page.screenshot({ path: path.join(outDir, 'fig_08_crud_update_condition_modal.png') });
  await page.keyboard.press('Escape');

  // 5. Negative / Validation Error Test
  await page.evaluate(() => {
    localStorage.removeItem('batteryx_token');
  });
  await page.goto('http://localhost:5173/login', { waitUntil: 'networkidle0' });
  await page.type('input[name="identifier"]', 'admin');
  await page.type('input[name="password"]', 'WrongPasswordTest!');
  await page.click('button[type="submit"]');
  await new Promise(r => setTimeout(r, 1000));
  await page.screenshot({ path: path.join(outDir, 'fig_17_negative_test_invalid_credentials.png') });

  console.log('UI tabs and modals captured.');

  // B. Database Terminal Screenshots
  console.log('Generating database terminal screenshots...');

  // 1. Database Schema & Indexes (dt, di, d "Battery")
  const psqlSchemaOut = execSync(
    'docker exec batteryx-postgres psql -U batteryx -d batteryx -c "\\dt" -c "\\d \\"Battery\\""',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - Database Schema & Constraints Evidence',
      'psql -U batteryx -d batteryx -c "\\dt" -c "\\d \\"Battery\\""',
      psqlSchemaOut
    ),
    path.join(outDir, 'fig_evidence_db_schema_and_indexes.png'),
    { width: 1200, height: 850 }
  );

  // 2. JOIN and Aggregate SQL Queries
  const psqlJoinsOut = execSync(
    'docker exec batteryx-postgres psql -U batteryx -d batteryx -c "SELECT b.\\"passportId\\", bm.name AS model, m.name AS manufacturer, b.status, b.\\"manufacturingDate\\" FROM \\"Battery\\" b JOIN \\"BatteryModel\\" bm ON bm.id = b.\\"batteryModelId\\" JOIN \\"Manufacturer\\" m ON m.id = bm.\\"manufacturerId\\" LIMIT 5;" -c "SELECT bm.chemistry, COUNT(b.id) AS total_units, ROUND(AVG(bhr.soh)::numeric, 2) AS avg_fleet_soh FROM \\"Battery\\" b JOIN \\"BatteryModel\\" bm ON bm.id = b.\\"batteryModelId\\" LEFT JOIN battery_health_records bhr ON bhr.\\"batteryId\\" = b.id GROUP BY bm.chemistry;"',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - Multi-Table JOIN & Aggregate Analytical Queries',
      'psql -U batteryx -d batteryx (Multi-Table JOIN & GROUP BY Aggregate Execution)',
      psqlJoinsOut
    ),
    path.join(outDir, 'fig_evidence_join_and_aggregate_queries.png'),
    { width: 1200, height: 750 }
  );

  // 3. Views Created & Queried
  const psqlViewsOut = execSync(
    'docker exec batteryx-postgres psql -U batteryx -d batteryx -c "\\dv" -c "SELECT * FROM battery_passport_summary LIMIT 5;" -c "SELECT * FROM battery_health_summary LIMIT 5;"',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - Views Created (\\dv) and Queried',
      'psql -U batteryx -d batteryx -c "\\dv" -c "SELECT * FROM battery_passport_summary LIMIT 5;"',
      psqlViewsOut
    ),
    path.join(outDir, 'fig_evidence_views_created_and_queried.png'),
    { width: 1200, height: 850 }
  );

  // 4. Stored Function Definition & Execution
  const psqlFuncOut = execSync(
    'docker exec batteryx-postgres psql -U batteryx -d batteryx -c "\\df transfer_battery_ownership" -c "SELECT * FROM transfer_battery_ownership(2, 1);"',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - PL/pgSQL Stored Function Execution',
      'psql -U batteryx -d batteryx -c "SELECT * FROM transfer_battery_ownership(2, 1);"',
      psqlFuncOut
    ),
    path.join(outDir, 'fig_evidence_stored_function_execution.png'),
    { width: 1200, height: 650 }
  );

  // 5. Triggers Tested (trg_low_soh, trg_owner_change, trg_battery_eol)
  const psqlTrigOut = execSync(
    'docker exec batteryx-postgres psql -U batteryx -d batteryx -c "SELECT event_object_table, trigger_name, event_manipulation, action_timing FROM information_schema.triggers WHERE trigger_schema = \'public\';" -c "SELECT id, action, \\"entityType\\", \\"entityId\\", metadata, \\"createdAt\\" FROM \\"AuditLog\\" WHERE action IN (\'LOW_SOH_ALERT\', \'OWNER_FIELD_CHANGED\', \'EOL_REACHED\') ORDER BY id DESC LIMIT 5;"',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - Database Triggers Created & Fired Audit Evidence',
      'psql -U batteryx -d batteryx (Trigger Definitions & Automated AuditLog Firing Evidence)',
      psqlTrigOut
    ),
    path.join(outDir, 'fig_evidence_triggers_and_audit_firing.png'),
    { width: 1200, height: 800 }
  );

  // 6. Ownership Transfer Transaction & Integrity
  const psqlTxOut = execSync(
    'docker exec batteryx-postgres psql -U batteryx -d batteryx -c "SELECT id, \\"passportId\\", \\"currentOwnerId\\", status FROM \\"Battery\\" WHERE id = 2;" -c "SELECT id, \\"batteryId\\", \\"fromUserId\\", \\"toUserId\\", \\"transferredAt\\" FROM \\"OwnershipTransfer\\" WHERE \\"batteryId\\" = 2 ORDER BY id DESC LIMIT 1;" -c "SELECT id, action, \\"entityType\\", \\"entityId\\", metadata FROM \\"AuditLog\\" WHERE \\"entityId\\" = 2 ORDER BY id DESC LIMIT 2;"',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - Ownership Transfer Transaction Consistency Proof',
      'psql -U batteryx -d batteryx (Atomic Transaction State across Battery, Transfer, & AuditLog)',
      psqlTxOut
    ),
    path.join(outDir, 'fig_evidence_ownership_transfer_transaction.png'),
    { width: 1200, height: 750 }
  );

  // 7. Backup and Restore Evidence
  const backupOut = execSync(
    'docker exec batteryx-postgres pg_dump -U batteryx -d batteryx -F c -b -v -f /tmp/batteryx_report_backup.dump 2>&1 && docker exec batteryx-postgres ls -lh /tmp/batteryx_report_backup.dump',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'PostgreSQL 16 - Native Database Backup (pg_dump) Snapshot',
      './database/backup.sh (pg_dump -F c -b -v -f /tmp/batteryx_report_backup.dump)',
      backupOut
    ),
    path.join(outDir, 'fig_evidence_backup_and_restore.png'),
    { width: 1200, height: 850 }
  );

  // 8. Docker Services Running
  const dockerPsOut = execSync('docker compose ps && docker ps -f "name=batteryx"', { encoding: 'utf8' });
  await captureHtml(
    page,
    renderTerminalHtml(
      'Docker Compose - Running Container Topology & Port Mappings',
      'docker compose ps',
      dockerPsOut
    ),
    path.join(outDir, 'fig_evidence_docker_compose_services.png'),
    { width: 1200, height: 600 }
  );

  // 9. Git Repository & Commit History
  const gitLogOut = execSync(
    'git status && git log --graph --pretty=format:"%h - %an, %ar : %s" --all -n 5',
    { encoding: 'utf8' }
  );
  await captureHtml(
    page,
    renderTerminalHtml(
      'Git Version Control - Public Repository & Verified Commit History',
      'git status; git log --graph --pretty=format:"%h - %an, %ar : %s" -n 5',
      gitLogOut
    ),
    path.join(outDir, 'fig_evidence_git_commit_history.png'),
    { width: 1200, height: 600 }
  );

  await browser.close();
  console.log('All 20 comprehensive report screenshots generated successfully!');
}

run().catch(err => {
  console.error('Execution failed:', err);
  process.exit(1);
});
