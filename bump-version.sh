#!/bin/sh
# Run before pushing an update so browsers load the new files instead of cached ones.
# Versions the page's css/js links and every relative import inside the js files.
V=$(date +%Y%m%d%H%M)
for a in crm profiles; do
  sed -i -E "s#css/styles\.css(\?v=[0-9]+)?\"#css/styles.css?v=$V\"#; s#js/app\.js(\?v=[0-9]+)?\"#js/app.js?v=$V\"#" "$a/index.html"
  for f in "$a"/js/*.js; do
    [ "$(basename "$f")" = "config.js" ] && continue
    sed -i -E "s#(from \"\./[a-z0-9-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g; s#(import\(\"\./[a-z0-9-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"
  done
done
# the CRM also reads the spec checklist from the Profiles tool; version that import too (Profiles files are left alone)
for f in crm/js/*.js; do
  sed -i -E "s#(from \"\.\./\.\./profiles/js/[a-z0-9-]+\.js)(\?v=[0-9]+)?\"#\1?v=$V\"#g" "$f"
done
echo "version $V"
