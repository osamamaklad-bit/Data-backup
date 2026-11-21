@echo off
REM ============================================================
REM  Sync: Apps Script editor  -->  GitHub
REM  Double-click this file, or run "sync" from this folder.
REM ============================================================
cd /d "%~dp0"

echo [1/4] Getting latest from GitHub...
git pull --quiet || goto :error

echo [2/4] Downloading code from Apps Script...
call clasp pull || goto :error

echo [3/4] Checking for changes...
git diff --quiet -- Code.gs appsscript.json
if %errorlevel%==0 (
  echo.
  echo Already in sync. Nothing to do.
  goto :end
)

git diff --stat -- Code.gs appsscript.json
echo.
set /p MSG=Describe the change (or press Enter for default): 
if "%MSG%"=="" set MSG=Sync edits from Apps Script editor

echo [4/4] Saving to GitHub...
git add Code.gs appsscript.json || goto :error
git commit --quiet -m "%MSG%" || goto :error
git push --quiet || goto :error

echo.
echo Done. Changes are on GitHub.
goto :end

:error
echo.
echo *** Something went wrong. Copy the message above and send it to Claude. ***

:end
echo.
pause
