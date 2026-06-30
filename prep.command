#!/bin/bash
# JAVY — příprava fotek na web.
# DVOJKLIKNI na tenhle soubor po přidání nových fotek.
# 1) zmenší velké fotky na ~1600 px (originály zazálohuje do _masters/ — zůstávají u tebe)
# 2) vygeneruje seznam fotek (photos/manifest.json)
# Pak už jen v GitHub Desktopu: Commit + Push.

cd "$(dirname "$0")" || exit 1
echo "JAVY — připravuju fotky…"
echo

MAX=1600
MAGICK="$(command -v magick || command -v convert)"
IDENT="$(command -v identify || echo "$MAGICK identify")"

if [ -z "$MAGICK" ]; then
  echo "⚠️  ImageMagick není nainstalovaný — zmenšování přeskočím, udělám jen seznam."
else
  shopt -s nullglob nocaseglob
  for f in photos/*/*.jpg photos/*/*.jpeg photos/*/*.png photos/*/*.webp; do
    dim=$("$MAGICK" identify -format "%[fx:max(w,h)]" "$f" 2>/dev/null)
    case "$dim" in (''|*[!0-9]*) continue;; esac
    if [ "$dim" -gt "$MAX" ]; then
      rel="${f#photos/}"
      mkdir -p "_masters/$(dirname "$rel")"
      [ -e "_masters/$rel" ] || cp "$f" "_masters/$rel"   # záloha originálu (jednou)
      "$MAGICK" "$f" -auto-orient -resize "${MAX}x${MAX}>" -strip -quality 82 "$f"
      echo "  zmenšeno: $f"
    fi
  done
  shopt -u nullglob nocaseglob
fi

echo
python3 build.py
echo
echo "✅ Hotovo. Teď v GitHub Desktopu klikni: Commit → Push."
echo "(Okno můžeš zavřít.)"
