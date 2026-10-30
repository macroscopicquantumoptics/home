# MQO group website: instructions for people and AI agents

Website of the Macroscopic Quantum Optics group, Department of Applied Physics, Aalto University. It is plain HTML and one CSS file: no build step, no Node, no frameworks, no CDNs. The one library is three.js, copied into `assets/vendor/three/` for the 3D models on the home page. Edit a page in any editor, open it in a browser, push to `main`, and GitHub Pages publishes it (`.github/workflows/static.yml`).

The look follows the same Aalto brand rules as the group meeting slides, so the two stay consistent.

## Folder layout

```
index.html                 home: intro, research overview, latest three news items
research/index.html        the three research directions
people/index.html          group leader, researchers, alumni (name links to the profile page)
people/firstname-lastname/ one profile page per person: photo, role, contact, bio and profile links
publications/index.html    papers grouped by year, newest first
news/index.html            all news, newest first
resources/index.html       software and web tools we made, with screenshots
join/index.html            open positions and how to apply ("Positions" in the nav)
tools/linkedin_news.py     turns one LinkedIn post into a news item (see Common edits)
404.html                   not-found page; uses absolute paths (/assets/...) because it is served at any URL
assets/site.css            all styling; colours are variables at the top
assets/site.js             the light/dark toggle, and the home page video when WebGL is missing
assets/hero3d.js           home page 3D models (dark trap, microcavity) you can turn and zoom
assets/vendor/three/       three.js r170 and the addons hero3d.js uses, bundled (MIT licence); keep the licence file
assets/fonts/              Inter (SIL OFL), bundled; keep the licence file
assets/logos/              Aalto logo, MQO logo (light and dark), favicon
assets/people/             portraits, firstname-lastname.jpg, about 600x800
assets/news/               news pictures
assets/hero/               dark-trap loop (webm, mp4) and still: shown only where the 3D model cannot run
assets/resources/          screenshots for the resources page, about 960x600
```

## Common edits

- **Add a person:** copy an `<li>` in `people/index.html`, change the name, role, email and photo. Put the photo in `assets/people/firstname-lastname.jpg`, portrait 3:4, at most 800 px tall, under 200 KB. With no photo yet, use `<div class="no-photo" aria-hidden="true"></div>` in place of the `<img>`. Moving someone to alumni means moving their `<li>` to the Alumni list.
- **Add a paper:** copy an `<li>` in `publications/index.html` under the right year (add a new `<section class="year">` for a new year). Title is the link; authors, then journal, each on its own `<p>`.
- **Add news:** copy an `<li class="news">` to the top of the list in `news/index.html`. Drop the `<figure>` if there is no picture, and always write `alt` text for one that is there. Then update the three items on the home page (between the `news:start` and `news:end` comments) so they match the newest three.
- **Open position:** add a `<section class="block">` to `join/index.html` with the title, deadline and how to apply, in place of the "No calls are open" text, and take it down when the deadline passes.
- **Profile page:** copy a folder in `people/` (for example `people/kelvin-ho/`), rename it to the person's `firstname-lastname`, and change the name, role, contact and photo. Profile links (ORCID, Google Scholar, LinkedIn, GitHub, Aalto research portal) and a short bio go where the comments say. In `people/index.html`, keep the order: postdoctoral researchers, doctoral researchers, research assistants, students, and by surname within each role.
- **News from LinkedIn:** we post on LinkedIn first and choose which posts also go on the website. Either run the "News from LinkedIn" workflow in the GitHub Actions tab (its file is `tools/linkedin-news.yml` until it is moved to `.github/workflows/`) with the post's link (it opens a pull request to review and merge), or run `python3 tools/linkedin_news.py <post link> --category Event` locally. Both add the item to the top of `news/index.html`, save the picture and refresh the three items on the home page. Before merging, shorten the text if needed, write the picture's `alt` text and check the date.
- **Add a tool:** copy an `<li class="news">` in `resources/index.html`, with a link to the live page, a link to the code and a screenshot in `assets/resources/`.
- **Header and footer** are repeated on every page, including each profile page. If you change one, change them all (find and replace across the folder). In each page, set `aria-current="page"` on that page's own nav link.

Check your change by opening the page in a browser, in both light and dark mode (sun/moon switch in the lower right corner), and at phone width. To preview the whole site with working links, run `python3 -m http.server` in this folder and open http://localhost:8000.

## Look

These follow the Aalto brand guidelines (https://brand.aalto.fi/en/brand/visual-guidelines/type).

- **Font:** Inter, Bold for headings (tracking -25, `letter-spacing: -0.025em`) and Regular for everything else. Arial is the fallback.
- **Colours:** black on white in light mode, white on black in dark mode. School of Science yellow `#F7E159` is the only highlight: the current nav item, link hover, and `<mark>` around a key phrase. Never yellow text on white.
- **Home page picture:** the one dark area of the site, in both themes: 3D models in `assets/hero3d.js`, picked with the dots and arrows at the bottom of the picture, with a grey link to the model's paper in the lower right corner. The dark optical trap (after `dark_trap_cover.blend`, computed from the trapping light's intensity) molecules in a microcavity (after the figure in PRL 133, 186903), a polariton condensate forming on the optical table as the pump power grows, seen in k space on the camera (arXiv:2601.15080), and a cavity emitting entangled IR and visible photon pairs (after Fig. 1 of arXiv:2508.10809). Drag turns a model (the trap camera stays above the light field), pinch or Ctrl + scroll zooms, double-click resets the view; the plain scroll wheel still scrolls the page. With reduced motion nothing moves by itself. To add a model, write a function like `cavityModel` and add it to `ORDER`, a dot with its `data-scene` and a `.hero-paper` link with its `data-for`.
- **Flat:** no cards, boxes, shadows, gradients, rounded corners, chips or tags, icons or arrows on links. Separate list items with a 1px hairline (`var(--line)`) and white space.
- **Type:** three sizes only (page title, section title, body). Dates, roles and authors are body size in grey, not smaller. Sentence case, no UPPER CASE, left-aligned, ragged right. Bold a person's name on its first mention in running text.
- **Alignment:** everything sits on one left edge; bulleted lists are indented further than their heading.
- **Logos:** MQO logo top left, Aalto logo in the top right corner (linking to the group's page on aalto.fi), MQO letters the same height as the Aalto "A?". On phones both logos share the top row and the navigation drops below them. The Aalto logo is a registered trademark: never crop, recolour (beyond the built-in dark-mode inversion) or stretch it. The MQO logo has separate light and dark files.

## Writing

Plain and specific. Say what the group does and what happened, not how exciting it is. No invented results, numbers, people or dates. Avoid filler like "cutting-edge", "at the forefront", "we are passionate about", and avoid em dashes as sentence glue.
