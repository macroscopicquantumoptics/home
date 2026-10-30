#!/usr/bin/env python3
"""Turn one LinkedIn post into a news item, so a post is written once and not again for the website.

    python3 tools/linkedin_news.py https://www.linkedin.com/posts/... --category Event

It reads the public post (text, first picture, date), adds an <li class="news"> to the top of
news/index.html, saves the picture in assets/news/, and refreshes the three items on the home page.
Nothing is published by itself: review the change (or the pull request the "News from LinkedIn"
GitHub Action opens), shorten the text, write the picture's alt text, then merge.

Standard library only. If LinkedIn refuses the request, save the post page from a browser and pass
it with --html saved.html.
"""
import argparse, datetime, html, json, re, sys, urllib.request
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
MONTHS = "January February March April May June July August September October November December".split()


class Meta(HTMLParser):
    """Collects <meta property/name=... content=...> and JSON-LD blocks."""
    def __init__(self):
        super().__init__()
        self.meta, self.ld, self._in_ld = {}, [], False

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        if tag == "meta":
            key = a.get("property") or a.get("name")
            if key and "content" in a and key not in self.meta:
                self.meta[key] = a["content"]
        elif tag == "script" and a.get("type") == "application/ld+json":
            self._in_ld = True
            self.ld.append("")

    def handle_endtag(self, tag):
        if tag == "script":
            self._in_ld = False

    def handle_data(self, data):
        if self._in_ld:
            self.ld[-1] += data


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en"})
    with urllib.request.urlopen(req, timeout=30) as r:
        return r.read()


def read_post(page):
    p = Meta()
    p.feed(page)
    text = date = image = None
    for block in p.ld:
        try:
            data = json.loads(block)
        except ValueError:
            continue
        for d in data if isinstance(data, list) else [data]:
            if not isinstance(d, dict):
                continue
            text = text or d.get("articleBody") or d.get("text")
            date = date or d.get("datePublished")
            img = d.get("image")
            if isinstance(img, dict):
                img = img.get("url")
            if isinstance(img, list):
                img = img[0] if img and isinstance(img[0], str) else None
            image = image or img
    text = text or p.meta.get("og:description") or p.meta.get("description") or ""
    image = image or p.meta.get("og:image")
    date = date or p.meta.get("article:published_time")
    return html.unescape(text).strip(), date, image, p.meta.get("og:image:alt")


def split_post(text):
    """First sentence (or line) is the headline, the rest are paragraphs. Trailing hashtags are dropped."""
    text = re.sub(r"(\s*#\w+)+\s*$", "", text.strip())
    paras = [re.sub(r"\s+", " ", q).strip() for q in re.split(r"\n\s*\n|\n", text)]
    paras = [q for q in paras if q]
    if not paras:
        sys.exit("The post has no text.")
    first = paras[0]
    m = re.match(r"(.{20,90}?[.!?])\s+(.*)", first)
    if m:
        title, rest = m.group(1), [m.group(2)] + paras[1:]
    elif len(first) <= 90:
        title, rest = first, paras[1:]
    else:
        cut = first[:80].rsplit(" ", 1)[0]
        title, rest = cut, [first] + paras[1:]
    return title.rstrip(".:"), rest


def slugify(s):
    return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")[:48].rstrip("-") or "post"


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("url", help="link to the LinkedIn post")
    ap.add_argument("--category", default="News", help="Event, Paper, People, Talk, News ... (shown after the date)")
    ap.add_argument("--title", help="headline to use instead of the post's first sentence")
    ap.add_argument("--date", help="YYYY-MM-DD, if the post's date cannot be read")
    ap.add_argument("--html", help="a saved copy of the post page, if LinkedIn refuses the request")
    args = ap.parse_args()

    news_file = ROOT / "news/index.html"
    news = news_file.read_text()
    if args.url in news:
        sys.exit("This post is already on the news page.")

    page = Path(args.html).read_text() if args.html else fetch(args.url).decode("utf-8", "replace")
    text, date, image, alt = read_post(page)
    if not text:
        sys.exit("Could not read the post. Is it public? Try --html with a saved copy.")
    title, paras = split_post(text)
    title = args.title or title

    when = args.date or (date or "")[:10]
    try:
        d = datetime.date.fromisoformat(when)
    except ValueError:
        d = datetime.date.today()
        print("Post date not found: using today's date, check it.", file=sys.stderr)
    slug = slugify(title)
    while f'id="{slug}"' in news:
        slug += "-2"

    figure = ""
    if image:
        try:
            data = fetch(image)
            ext = ".png" if data[:4] == b"\x89PNG" else ".jpg"
            name = f"{slug}{ext}"
            (ROOT / "assets/news" / name).write_bytes(data)
            alt = alt or "TODO: describe the picture"
            figure = (f'\n        <figure><img src="../assets/news/{name}" alt="{html.escape(alt)}" '
                      f'loading="lazy"></figure>')
        except Exception as e:  # the item is still useful without the picture
            print(f"Picture not saved ({e}).", file=sys.stderr)

    body = "\n".join(f"          <p>{html.escape(q, quote=False)}</p>" for q in paras)
    item = f'''      <li class="news" id="{slug}">
        <div>
          <p class="meta">{d.day} {MONTHS[d.month - 1]} {d.year} · {html.escape(args.category)}</p>
          <h3>{html.escape(title, quote=False)}</h3>
{body}
          <p class="link"><a href="{html.escape(args.url)}">On LinkedIn</a></p>
        </div>{figure}
      </li>
'''
    marker = '<ul class="block rows">\n'
    i = news.index(marker) + len(marker)
    news_file.write_text(news[:i] + item + news[i:])
    sync_home()
    print(f"Added '{title}' ({d}). Check news/index.html and index.html before merging.")


def sync_home():
    """Copy the newest three news items to the home page, between the news:start and news:end comments."""
    news = (ROOT / "news/index.html").read_text()
    items = re.findall(r'^ *<li class="news".*?^ *</li>\n', news, re.S | re.M)[:3]
    out = []
    for it in items:
        it = re.sub(r'(src|href)="\.\./', r'\1="', it)
        out.append(re.sub(r"^", "      ", it, flags=re.M).rstrip(" ").replace(' id="', ' data-id="'))
    home_file = ROOT / "index.html"
    home = home_file.read_text()
    a, b = home.index("<!-- news:start"), home.index("<!-- news:end -->")
    a = home.index("\n", a) + 1
    b = home.rindex("\n", 0, b) + 1
    home_file.write_text(home[:a] + "".join(out) + home[b:])


if __name__ == "__main__":
    main()
