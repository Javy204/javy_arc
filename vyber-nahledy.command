#!/bin/bash
# JAVY — výběr náhledových fotek složek (klikací UI).
# DVOJKLIKNI na tenhle soubor. Otevře se prohlížeč, klikni na fotky, dej Uložit.
# Pak už jen v GitHub Desktopu: Commit + Push.

cd "$(dirname "$0")" || exit 1
echo "JAVY — spouštím výběr náhledů…"
echo "(Až budeš hotov/á, zavři tohle okno.)"
echo
python3 cover_admin.py
