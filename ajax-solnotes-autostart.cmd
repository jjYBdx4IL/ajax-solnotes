@echo off

set PATH=%USERPROFILE%\AppData\Roaming\npm;%PATH%

cd /d %~dp0
c:\cygwin64\bin\screen.exe -dmS ajax-solnotes cmd /K nodemon -w server.js server.js -- --prod --managesolr --reporoot=%NOTESREPO% --portinc 1
