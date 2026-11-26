@echo off
cd /d "%~dp0"
echo JAVY - spoustim spravu webu...
echo (Az budes hotov/a, zavri tohle okno.)
py -3 cover_admin.py || python cover_admin.py
pause
