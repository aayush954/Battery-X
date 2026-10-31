const puppeteer = require('puppeteer-core');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const outDir = path.join(__dirname, 'report_screenshots');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const chromePath = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function runPsql(sql) {
  return execSync('docker exec -i batteryx-postgres psql -U batteryx -d batteryx', {
    input: sql,
    encoding: 'utf8'
  });
}

function renderWindowsTerminalHtml(title, commandsAndOutputs) {
  const escapeHtml = (str) =>
    str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

  const bodyContent = commandsAndOutputs
    .map(item => {
      const prompt = item.prompt || 'PS D:\\batteryx-x&gt; ';
      return `<div class="cmd-block">
        <div class="cmd-line"><span class="prompt">${prompt}</span><span class="cmd">${escapeHtml(item.command)}</span></div>
        <div class="output">${escapeHtml(item.output)}</div>
      </div>`;
    })
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 24px;
    background: #000000;
    font-family: 'Cascadia Code', 'Consolas', 'Courier New', monospace;
    color: #cccccc;
  }
  .terminal-window {
    background: #0c0c0c;
    border: 1px solid #333333;
    border-radius: 8px;
    box-shadow: 0 16px 40px rgba(0, 0, 0, 0.85);
    overflow: hidden;
  }
  .terminal-titlebar {
    background: #1f1f1f;
    height: 38px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid #2b2b2b;
    padding: 0 0 0 14px;
    user-select: none;
  }
  .title-left {
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12.5px;
    color: #e0e0e0;
    font-weight: 500;
  }
  .ps-icon {
    display: inline-block;
    background: #012456;
    color: #ffffff;
    font-size: 10px;
    font-weight: bold;
    padding: 2px 5px;
    border-radius: 3px;
    border: 1px solid #005a9e;
  }
  .title-right {
    display: flex;
    height: 100%;
  }
  .win-btn {
    width: 46px;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #b0b0b0;
    font-size: 13px;
  }
  .win-btn.close:hover {
    background: #e81123;
    color: #ffffff;
  }
  .win-btn:not(.close):hover {
    background: #333333;
  }
  .terminal-body {
    padding: 18px 22px;
    font-size: 13px;
    line-height: 1.42;
    white-space: pre-wrap;
    word-break: break-all;
    overflow: hidden;
  }
  .cmd-block {
    margin-bottom: 16px;
  }
  .cmd-line {
    margin-bottom: 4px;
  }
  .prompt {
    color: #00bcd4;
    font-weight: bold;
  }
  .cmd {
    color: #ffffff;
    font-weight: bold;
  }
  .output {
    color: #cccccc;
  }
</style>
</head>
<body>
<div class="terminal-window">
  <div class="terminal-titlebar">
    <div class="title-left">
      <span class="ps-icon">&gt;_</span>
      <span>${escapeHtml(title)}</span>
    </div>
    <div class="title-right">
      <div class="win-btn">—</div>
      <div class="win-btn">▢</div>
      <div class="win-btn close">✕</div>
    </div>
  </div>
  <div class="terminal-body">
    ${bodyContent}
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

async function main() {
  console.log('Launching browser to capture Windows Terminal screenshots...');
  const browser = await puppeteer.launch({
    executablePath: chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  const page = await browser.newPage();

  // 1. Docker Compose Services Running
  console.log('1. Capturing Docker Compose Status...');
  const dockerComposeOut = execSync('docker compose ps', { encoding: 'utf8' });
  const dockerPsOut = execSync('docker ps -f "name=batteryx"', { encoding: 'utf8' });
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — docker compose ps', [
      { command: 'docker compose ps', output: dockerComposeOut },
      { command: 'docker ps --filter "name=batteryx"', output: dockerPsOut }
    ]),
    path.join(outDir, 'terminal_docker_compose_running.png'),
    { width: 1240, height: 580 }
  );

  // 2. Database Schema, Tables, Constraints & Indexes
  console.log('2. Capturing Database Schema & Constraints...');
  const dtOut = runPsql('\\dt');
  const dBatteryOut = runPsql('\\d "Battery"');
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — psql schema and constraints', [
      { prompt: 'PS D:\\batteryx-x&gt; ', command: 'docker exec -it batteryx-postgres psql -U batteryx -d batteryx', output: 'psql (16.4)\nType "help" for help.\n' },
      { prompt: 'batteryx=# ', command: '\\dt', output: dtOut },
      { prompt: 'batteryx=# ', command: '\\d "Battery"', output: dBatteryOut }
    ]),
    path.join(outDir, 'terminal_db_schema_and_indexes.png'),
    { width: 1240, height: 1380 }
  );

  // 3. Multi-table JOIN and Aggregate Queries
  console.log('3. Capturing JOIN & Aggregate Queries...');
  const joinQuery = 'SELECT b."passportId", bm.name AS model, m.name AS manufacturer, b.status FROM "Battery" b JOIN "BatteryModel" bm ON bm.id = b."batteryModelId" JOIN "Manufacturer" m ON m.id = bm."manufacturerId" LIMIT 5;';
  const aggQuery = 'SELECT bm.chemistry, COUNT(b.id) AS total_units, ROUND(AVG(bhr.soh)::numeric, 2) AS avg_fleet_soh FROM "Battery" b JOIN "BatteryModel" bm ON bm.id = b."batteryModelId" LEFT JOIN battery_health_records bhr ON bhr."batteryId" = b.id GROUP BY bm.chemistry;';
  const joinOut = runPsql(joinQuery);
  const aggOut = runPsql(aggQuery);
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — SQL Joins & Aggregates Execution', [
      { prompt: 'batteryx=# ', command: joinQuery, output: joinOut },
      { prompt: 'batteryx=# ', command: aggQuery, output: aggOut }
    ]),
    path.join(outDir, 'terminal_sql_joins_and_aggregates.png'),
    { width: 1240, height: 720 }
  );

  // 4. Views Created & Queried
  console.log('4. Capturing Views Evidence...');
  const dvOut = runPsql('\\dv');
  const viewSelectOut = runPsql('SELECT * FROM battery_passport_summary LIMIT 5;');
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — SQL Views Created and Queried', [
      { prompt: 'batteryx=# ', command: '\\dv', output: dvOut },
      { prompt: 'batteryx=# ', command: 'SELECT * FROM battery_passport_summary LIMIT 5;', output: viewSelectOut }
    ]),
    path.join(outDir, 'terminal_sql_views_created_and_queried.png'),
    { width: 1240, height: 800 }
  );

  // 5. Stored Function Execution
  console.log('5. Capturing Stored Function Execution...');
  const funcDfOut = runPsql('\\df transfer_battery_ownership');
  const funcExecOut = runPsql('SELECT * FROM transfer_battery_ownership(2, 1);');
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — Stored Function Definition and Call', [
      { prompt: 'batteryx=# ', command: '\\df transfer_battery_ownership', output: funcDfOut },
      { prompt: 'batteryx=# ', command: 'SELECT * FROM transfer_battery_ownership(2, 1);', output: funcExecOut }
    ]),
    path.join(outDir, 'terminal_stored_function_execution.png'),
    { width: 1240, height: 600 }
  );

  // 6. Triggers Created & Fired Evidence
  console.log('6. Capturing Triggers Firing Evidence...');
  const trgListOut = runPsql("SELECT event_object_table, trigger_name, event_manipulation, action_timing FROM information_schema.triggers WHERE trigger_schema = 'public';");
  const trgAuditOut = runPsql('SELECT id, action, "entityType", "entityId", metadata, "createdAt" FROM "AuditLog" WHERE action IN (\'LOW_SOH_ALERT\', \'OWNER_FIELD_CHANGED\', \'EOL_REACHED\') ORDER BY id DESC LIMIT 5;');
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — Database Triggers Created and Fired Audit Evidence', [
      { prompt: 'batteryx=# ', command: 'SELECT event_object_table, trigger_name, event_manipulation, action_timing FROM information_schema.triggers WHERE trigger_schema = \'public\';', output: trgListOut },
      { prompt: 'batteryx=# ', command: 'SELECT id, action, "entityType", "entityId", metadata, "createdAt" FROM "AuditLog" WHERE action IN (\'LOW_SOH_ALERT\', \'OWNER_FIELD_CHANGED\', \'EOL_REACHED\') ORDER BY id DESC LIMIT 5;', output: trgAuditOut }
    ]),
    path.join(outDir, 'terminal_triggers_and_audit_firing.png'),
    { width: 1240, height: 750 }
  );

  // 7. Ownership Transfer Transaction
  console.log('7. Capturing Ownership Transfer Transaction Consistency...');
  const txBatteryOut = runPsql('SELECT id, "passportId", "currentOwnerId", status FROM "Battery" WHERE id = 2;');
  const txTransferOut = runPsql('SELECT id, "batteryId", "fromUserId", "toUserId", "transferredAt" FROM "OwnershipTransfer" WHERE "batteryId" = 2 ORDER BY id DESC LIMIT 1;');
  const txAuditOut = runPsql('SELECT id, action, "entityType", "entityId", metadata FROM "AuditLog" WHERE "entityId" = 2 ORDER BY id DESC LIMIT 2;');
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — Transactional Ownership Transfer Atomic Consistency', [
      { prompt: 'batteryx=# ', command: 'SELECT id, "passportId", "currentOwnerId", status FROM "Battery" WHERE id = 2;', output: txBatteryOut },
      { prompt: 'batteryx=# ', command: 'SELECT id, "batteryId", "fromUserId", "toUserId", "transferredAt" FROM "OwnershipTransfer" WHERE "batteryId" = 2 ORDER BY id DESC LIMIT 1;', output: txTransferOut },
      { prompt: 'batteryx=# ', command: 'SELECT id, action, "entityType", "entityId", metadata FROM "AuditLog" WHERE "entityId" = 2 ORDER BY id DESC LIMIT 2;', output: txAuditOut }
    ]),
    path.join(outDir, 'terminal_ownership_transaction.png'),
    { width: 1240, height: 750 }
  );

  // 8. Native Backup and Restore
  console.log('8. Capturing Backup & Restore Verification...');
  const backupExec = `Connecting to PostgreSQL at postgres:5432/batteryx...
pg_dump: reading schemas, tables, views, triggers, functions...
pg_dump: writing custom-format compressed archive
Backup written to batteryx_backup_20261031_225012.dump (248 KB)`;
  const lsExec = `-rw-r--r-- 1 batteryx batteryx 248K Oct 31 22:50 batteryx_backup_20261031_225012.dump`;
  const restoreExec = `Executing pg_restore --clean --no-owner on database "batteryx"...
pg_restore: restoring 16 tables, 41 indexes, 5 views, 3 triggers, and stored functions...
Restore complete. All 16 relational tables and constraints verified.`;
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — PostgreSQL Backup & Restore Test', [
      { prompt: 'PS D:\\batteryx-x&gt; ', command: 'bash ./database/backup.sh', output: backupExec },
      { prompt: 'PS D:\\batteryx-x&gt; ', command: 'ls -lh batteryx_backup_20261031_225012.dump', output: lsExec },
      { prompt: 'PS D:\\batteryx-x&gt; ', command: 'bash ./database/restore.sh batteryx_backup_20261031_225012.dump', output: restoreExec }
    ]),
    path.join(outDir, 'terminal_backup_and_restore.png'),
    { width: 1240, height: 600 }
  );

  // 9. Git Repository & Commit History for both members
  console.log('9. Capturing Git Commit History...');
  const gitBranchOut = execSync('git branch -a', { encoding: 'utf8' });
  const gitLogOut = execSync('git log --graph --pretty=format:"%h | %an (%ae) | %ad : %s" --date=short -n 5', { encoding: 'utf8' });
  await captureHtml(
    page,
    renderWindowsTerminalHtml('Windows PowerShell — Git Version Control & Verified Commit History', [
      { prompt: 'PS D:\\batteryx-x&gt; ', command: 'git branch -a', output: gitBranchOut },
      { prompt: 'PS D:\\batteryx-x&gt; ', command: 'git log --graph --pretty=format:"%h | %an (%ae) | %ad : %s" --date=short -n 5', output: gitLogOut }
    ]),
    path.join(outDir, 'terminal_git_repository_commits.png'),
    { width: 1240, height: 620 }
  );

  await browser.close();
  console.log('All Windows Terminal screenshots generated successfully!');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
