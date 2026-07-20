#!/bin/bash
# JAVY — správa webu (klikací UI).
# DVOJKLIKNI na tenhle soubor. Otevře se prohlížeč:
#   • nahrávej fotky přetažením
#   • přetahuj složky pro pořadí
#   • přejmenuj / přidej / smaž složku
#   • vyber náhledovou fotku
# Vše se propíše na disk. Pak už jen v GitHub Desktopu: Commit + Push.

cd "$(dirname "$0")" || exit 1
echo "JAVY — spouštím správu webu…"
echo "(Až budeš hotov/á, zavři tohle okno.)"
echo
python3 cover_admin.py
