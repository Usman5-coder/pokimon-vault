# Vault demo (3D, static)

Static site. No build step. Three.js is vendored in js/lib, so nothing loads from a CDN except Google Fonts.

Deploy: put index.html at the root of the project, Framework Preset "Other", no build command, output directory ".".
Local preview must use a web server (ES modules do not run from file://): `npx serve .` or `python3 -m http.server`.

A preloader covers each page until Three.js and the first 3D frames are ready. There is no 2D fallback art; if WebGL is unavailable the preloader shows a message instead.
