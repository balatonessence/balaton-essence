Balaton Essence sitemap fast fix

1. server.js -> project root/server.js
2. public/robots.txt -> project public/robots.txt
3. git add -A && git commit -m "Speed up Google sitemap fetch" && git push

A /sitemap.txt most nem tolti le a teljes main_db JSON-t; csak az apartman ID-kat keri le Postgresbol.
