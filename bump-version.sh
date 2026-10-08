#!/bin/sh
# Run before pushing an update so browsers load the new files instead of cached ones.
# Versions the page's css/js links and every relative import inside the js files.
V=$(date +%Y%m%d%H%M)
for a in crm profiles; do
  sed -i -E "s#css/styles\.css(\?v=[0-9]+)?\"#css/styles.css?v=$V\"#; s#js/app\.js(\?v=[0-9]+)?\"#js/app.js?v=$V\"#" "$a/index.html"
  for f in "$a"/js/*.js; do
    [ "$(basename "$f")" = "config.js" ] && continue
    sed -i -E "s#(from \"\./[a-z-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g; s#(import\(\"\./[a-z-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"
  done
done
echo "version $V"
