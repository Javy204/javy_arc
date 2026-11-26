@echo off
cd /d "%~dp0"
echo JAVY - spoustim spravu webu...
echo (Vypnes ji tlacitkem Vypnout spravu v prohlizeci. Zavres-li stranku, vypne se sama.)
py -3 cover_admin.py || python cover_admin.py
pause
