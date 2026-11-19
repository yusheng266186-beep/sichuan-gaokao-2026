# Luodian · Sichuan 2026 Admissions Explorer

[中文说明](README.md) · [V3 major-group explorer](https://yusheng266186-beep.github.io/sichuan-gaokao-2026/v3/) · [V2 classroom view](https://yusheng266186-beep.github.io/sichuan-gaokao-2026/v2/?stage=1)

A static Chinese-language research tool for Sichuan's 2026 university applications. It organizes historical information by university and major group, with score and rank lookup, subject constraints, and side-by-side comparisons.

| Edition | Use |
| --- | --- |
| V3 | Browse major groups, inspect university and major details, compare up to three groups, reorder a shortlist, add notes, and export a backup. |
| V2 | Explore score distributions and filters. The classroom view provides higher-visibility type and controls. |
| V1 | Historical first interface at the site root. |

Start by selecting your subject track and entering a score or rank. Read the year and scope of any historical cutoff before comparing groups. Confirm subject requirements, rules, and the current plan with the official source for the applicable year. Missing source fields remain unknown. The shortlist is a research aid.

## Data maintenance

Raw data lives in <code>data/</code>. V3 builds a catalog and on-demand packs. V2 uses its own catalog. The [V3 guide](v3/README.md) describes the field-level migration and build checks.

~~~bash
python3 tools/build-v3.py --check
npm run verify:data
python3 -m http.server 8000
~~~

Open <http://localhost:8000/v3/> for V3 or <http://localhost:8000/v2/> for V2. When refreshing a dataset, record the official source year and its scope, then rebuild the relevant release artifacts. Saved choices and notes are browser-local. Use the relevant edition's export when transferring them.
