@echo off

cd /d %LOCALAPPDATA%\solr\bin
c:\cygwin64\bin\screen.exe -dmS solr cmd /K solr.cmd start
