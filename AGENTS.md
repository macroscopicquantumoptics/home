# MQO group website: instructions for people and AI agents

Website of the Macroscopic Quantum Optics group, Department of Applied Physics, Aalto University. It is plain HTML and one CSS file: no build step, no Node, no frameworks, no CDNs. Edit a page in any editor, open it in a browser, push to `main`, and GitHub Pages publishes it (`.github/workflows/pages.yml`).

The look follows the same Aalto brand rules as the group meeting slides, so the two stay consistent.

## Folder layout

```
index.html                 home: intro, research overview, latest three news items
research/index.html        the three research directions
people/index.html          group leader, researchers, alumni
publications/index.html    papers grouped by year, newest first
news/index.html            all news, newest first
join/index.html            how to apply (linked from the footer, not the main nav)
404.html                   not-found page; uses absolute paths (/assets/...) because it is served at any URL
assets/site.css            all styling; colours are variables at the top
assets/site.js             the light/dark toggle, nothing else
assets/fonts/              Inter (SIL OFL), bundled; keep the licence file
assets/logos/              Aalto logo, MQO logo (light and dark), favicon
assets/people/             portraits, firstname-lastname.jpg, about 600x800
assets/news/               news pictures
```

## Common edits

- **Add a person:** copy an `<li>` in `people/index.html`, change the name, role, email and photo. Put the photo in `assets/people/firstname-lastname.jpg`, portrait 3:4, at most 800 px tall, under 200 KB. With no photo yet, use `<div class="no-photo" aria-hidden="true"></div>` in place of the `<img>`. Moving someone to alumni means moving their `<li>` to the Alumni list.
- **Add a paper:** copy an `<li>` in `publications/index.html` under the right year (add a new `<section class="year">` for a new year). Title is the link; authors, then journal, each on its own `<p>`.
- **Add news:** copy an `<li class="news">` to the top of the list in `news/index.html`. Drop the `<figure>` if there is no picture, and always write `alt` text for one that is there. Then update the three items on the home page so they match the newest three.
- **Open position:** add a `<section class="block">` to `join/index.html` with the title, deadline and how to apply, and take it down when the deadline passes.
- **Header and footer** are repeated on every page. If you change one, change all seven files (find and replace across the folder). In each page, set `aria-current="page"` on that page's own nav link.

Check your change by opening the page in a browser, in both light and dark mode (button at the top right), and at phone width. To preview the whole site with working links, run `python3 -m http.server` in this folder and open http://localhost:8000.

## Look

These follow the Aalto brand guidelines (https://brand.aalto.fi/en/brand/visual-guidelines/type).

- **Font:** Inter, Bold for headings (tracking -25, `letter-spacing: -0.025em`) and Regular for everything else. Arial is the fallback.
- **Colours:** black on white in light mode, white on black in dark mode. School of Science yellow `#F7E159` is the only highlight: the current nav item, link hover, and `<mark>` around a key phrase. Never yellow text on white.
- **Flat:** no cards, boxes, shadows, gradients, rounded corners, chips or tags, icons or arrows on links. Separate list items with a 1px hairline (`var(--line)`) and white space.
- **Type:** three sizes only (page title, section title, body). Dates, roles and authors are body size in grey, not smaller. Sentence case, no UPPER CASE, left-aligned, ragged right. Bold a person's name on its first mention in running text.
- **Alignment:** everything sits on one left edge; bulleted lists are indented further than their heading.
- **Logos:** MQO logo top left, Aalto logo in the top right corner (linking to the group's page on aalto.fi), MQO letters the same height as the Aalto "A?". On phones both logos share the top row and the navigation drops below them. The Aalto logo is a registered trademark: never crop, recolour (beyond the built-in dark-mode inversion) or stretch it. The MQO logo has separate light and dark files.

## Writing

Plain and specific. Say what the group does and what happened, not how exciting it is. No invented results, numbers, people or dates. Avoid filler like "cutting-edge", "at the forefront", "we are passionate about", and avoid em dashes as sentence glue.
