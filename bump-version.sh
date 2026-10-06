#!/bin/sh
# Run before pushing an update so browsers load the new files instead of cached ones.
V=$(date +%Y%m%d%H%M)
for a in crm profiles; do
  sed -i -E "s#css/styles\.css(\?v=[0-9]+)?\"#css/styles.css?v=$V\"#; s#js/app\.js(\?v=[0-9]+)?\"#js/app.js?v=$V\"#" "$a/index.html"
done
echo "version $V"
