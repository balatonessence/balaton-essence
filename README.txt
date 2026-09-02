Bontsd ki a projekt gyökerébe és engedd felülírni a fájlokat.

A csomag:
- server.js: dinamikus /sitemap.txt, az apartman URL-eket is hozzáadja az adatbázisból
- public/sitemap.txt: statikus fallback
- public/robots.txt: a sitemap.txt-re mutat

Deploy után ezt használd:
https://balatonessence.com/sitemap.txt

Google Search Console -> Sitemaps -> sitemap.txt

A /sitemap.xml automatikusan 301-gyel a /sitemap.txt-re irányít.
