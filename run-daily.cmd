@echo off
REM ============================================================================
REM  SA Trade Network - daily social run (local scheduler)
REM
REM  Does exactly what .github/workflows/daily-social.yml does, on this machine.
REM  Use it while the GitHub token lacks the `workflow` scope - or keep it
REM  forever; the only difference is this needs the PC awake at run time.
REM
REM  Register it:    register-daily-task.cmd
REM  Run it by hand: run-daily.cmd
REM  Dry run:        run-daily.cmd --dry
REM ============================================================================

setlocal
chcp 65001 >nul
cd /d "%~dp0"

set LOG=%~dp0run-daily.log

REM -- 0. one run at a time -------------------------------------------------
REM  Rendering takes minutes, and longer when the machine is busy, so the 08:00
REM  and 17:00 runs can overlap. Two runs both commit and push: one loses to
REM  .git/index.lock and dies mid-pipeline. `mkdir` fails atomically if the
REM  directory exists, which is the whole lock. Stale locks are cleared by hand:
REM  rmdir "%~dp0.lock".
mkdir "%~dp0.lock" 2>nul
if errorlevel 1 (
  echo. >> "%LOG%"
  echo ======== %DATE% %TIME% ======== >> "%LOG%"
  echo SKIPPED - another run holds .lock. Nothing lost: the queue is dated, so >> "%LOG%"
  echo anything not sent stays pending and the next run picks it up. >> "%LOG%"
  endlocal
  exit /b 0
)
echo. >> "%LOG%"
echo ======== %DATE% %TIME% ======== >> "%LOG%"

REM -- 1. top the queue up if it is running low -------------------------------
node -e "const fs=require('fs');const f='queue.jsonl';if(!fs.existsSync(f)){process.exit(7)}const r=fs.readFileSync(f,'utf8').trim().split('\n').map(JSON.parse);const last=r.map(x=>x.date).sort().pop();const left=Math.round((new Date(last)-Date.now())/86400000);console.log('queue runs out in '+left+' days');process.exit(left<14?7:0)" >> "%LOG%" 2>&1
if errorlevel 1 (
  echo topping up queue >> "%LOG%"
  node engine.mjs --days=90 >> "%LOG%" 2>&1
)

REM -- 2. render today's cards -----------------------------------------------
node assets.mjs --posts %1 >> "%LOG%" 2>&1

REM -- 3. drop cards older than 14 days so the repo does not bloat -----------
node -e "const fs=require('fs'),p=require('path');const cut=new Date(Date.now()-14*86400000).toISOString().slice(0,10);let n=0;const out='out';if(fs.existsSync(out))for(const d of fs.readdirSync(out)){const pd=p.join(out,d,'posts');if(!fs.existsSync(pd))continue;for(const day of fs.readdirSync(pd))if(day<cut){fs.rmSync(p.join(pd,day),{recursive:true,force:true});n++}}console.log('pruned '+n+' old card folders')" >> "%LOG%" 2>&1

REM -- 4. publish the cards so raw.githubusercontent can serve them ----------
REM     (normal files push fine - only .github/workflows is scope-blocked)
git add -A out queue.jsonl >> "%LOG%" 2>&1
git diff --staged --quiet || git commit -q -m "cards: %DATE%" >> "%LOG%" 2>&1
git push -q >> "%LOG%" 2>&1

REM -- 5. post ---------------------------------------------------------------
REM     ASSET_BASE lets Instagram, Pinterest, Telegram and Facebook fetch the
REM     card image. Add channel keys here and that channel wakes up by itself.
set ASSET_BASE=https://raw.githubusercontent.com/blessingscoming/sa-trade-social/master/out
REM set FB_PAGE_ID=
REM set FB_PAGE_TOKEN=
REM set TELEGRAM_BOT_TOKEN=
REM set TELEGRAM_CHAT_ID=
REM set PINTEREST_TOKEN=
REM set PINTEREST_BOARD_ID=

node post.mjs %1 >> "%LOG%" 2>&1

REM -- 6. record what went out ----------------------------------------------
git add -A posted.jsonl out/_gbp-manual >> "%LOG%" 2>&1
git diff --staged --quiet || git commit -q -m "posted: %DATE%" >> "%LOG%" 2>&1
git push -q >> "%LOG%" 2>&1

echo ---- done ---- >> "%LOG%"
rmdir "%~dp0.lock" 2>nul
endlocal
