@echo off
REM Registers two Windows scheduled tasks: 08:00 and 17:00 local time.
REM No admin rights needed - these run as the current user.
REM
REM   register-daily-task.cmd            create / replace both tasks
REM   schtasks /query /tn "SA Social AM" show one
REM   schtasks /delete /tn "SA Social AM" /f    remove

setlocal
set SCRIPT=%~dp0run-daily.cmd

schtasks /create /tn "SA Social AM" /tr "\"%SCRIPT%\"" /sc daily /st 08:00 /f
schtasks /create /tn "SA Social PM" /tr "\"%SCRIPT%\"" /sc daily /st 17:00 /f

echo.
echo Registered. Check with:  schtasks /query /tn "SA Social AM"
echo Run one now with:        schtasks /run /tn "SA Social AM"
endlocal
