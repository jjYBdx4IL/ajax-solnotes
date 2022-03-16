@echo off

cd /d %~dp0

e:\dev\cygwin\bin\screen.exe -dmS ajax-solnotes cmd /K nodemon -w server.js server.js -- --prod --managesolr --reporoot=%NOTESREPO% --portinc 1
