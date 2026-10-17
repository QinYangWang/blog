#!/usr/bin/env python3
"""Migrate https://qinyang.wang (NotionNext) into novon content.

Re-runnable: fetches the list pages, every post page and /about, reads the
Notion recordMap embedded in __NEXT_DATA__, writes content/<slug>.mdx and
downloads every image into public/images/<slug>/ (Notion signed URLs expire,
so images are always fetched through notion.so/image at migration time).

Usage: python3 scripts/migrate.py [--refetch]
Writes migration-report.json next to this script's parent.
"""
import datetime as dt
import json
import os
import re
import sys
import urllib.parse
import urllib.request

SITE = 'https://qinyang.wang'
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RAW = os.path.join(ROOT, '.migrate-cache')
CONTENT = os.path.join(ROOT, 'content')
PUBLIC = os.path.join(ROOT, 'public')
UA = {'User-Agent': 'Mozilla/5.0 (novon migration)'}
REFETCH = '--refetch' in sys.argv
CST = dt.timezone(dt.timedelta(hours=8))

report = {'posts': [], 'warnings': []}


def fetch(url, binary=False):
    req = urllib.request.Request(url, headers=UA)
    with urllib.request.urlopen(req, timeout=60) as r:
        data = r.read()
        return (data, r.headers.get('Content-Type', '')) if binary else data.decode('utf-8')


def cached(name, url):
    os.makedirs(RAW, exist_ok=True)
    path = os.path.join(RAW, name + '.html')
    if REFETCH or not os.path.exists(path):
        open(path, 'w').write(fetch(url))
    return open(path).read()


def next_data(html):
    m = re.search(r'<script id="__NEXT_DATA__" type="application/json">(.*?)</script>', html, re.S)
    return json.loads(m.group(1))['props']['pageProps']


# ---------- discovery ----------

def discover():
    slugs = []
    sitemap = fetch(SITE + '/sitemap.xml')
    n = 1
    while True:  # follow /page/N while the previous list links to it
        html = cached(f'list-{n}', SITE + ('/' if n == 1 else f'/page/{n}'))
        for href in re.findall(r'href="/([^"/?#]+)"', html):
            href = urllib.parse.unquote(href)
            if href in ('about', 'feed', 'search', 'favicon.png', 'page') or href.startswith('_next') or href.startswith('fonts'):
                continue
            if href not in slugs:
                slugs.append(href)
        if f'href="/page/{n + 1}"' not in html:
            break
        n += 1
    for loc in re.findall(r'<loc>([^<]+)</loc>', sitemap):
        path = urllib.parse.unquote(loc.replace(SITE, '').strip('/'))
        if not path or '/' in path or path in ('feed', 'search', 'about'):
            continue
        if path not in slugs:
            slugs.append(path)
            report['warnings'].append(f'{path}: in sitemap but not on list pages')
    return slugs


# ---------- rich text ----------

ESC = re.compile(r'([\\`*_\[\]<>{}|~])')


def esc(s):
    return ESC.sub(r'\\\1', s)


PUNCT = re.compile(r'[\s\W]', re.U)


def wrap(text, md, tag):
    """Wrap text in an emphasis marker, falling back to a JSX tag when CommonMark
    flanking rules would fail (content edge is punctuation, common in CJK)."""
    lead = len(text) - len(text.lstrip())
    trail = len(text) - len(text.rstrip())
    core = text.strip()
    if not core:
        return text
    pre, post = text[:lead], text[len(text) - trail:] if trail else ''
    if PUNCT.match(core[0]) or PUNCT.match(core[-1]):
        return f'{pre}<{tag}>{core}</{tag}>{post}'
    return f'{pre}{md}{core}{md}{post}'


def rich(segs, ctx, in_table=False, heading=False):
    if not segs:
        return ''
    out = []
    for seg in segs:
        text = seg[0]
        anns = seg[1] if len(seg) > 1 else []
        kinds = {a[0]: (a[1] if len(a) > 1 else True) for a in anns}
        if 'd' in kinds:
            d = kinds['d']
            text = d.get('start_date', '') + (f" → {d['end_date']}" if d.get('end_date') else '')
            out.append(esc(text))
            continue
        if 'p' in kinds:  # page mention
            pid = kinds['p']
            b = ctx['blocks'].get(pid, {}).get('value', {})
            title = ''.join(s[0] for s in (b.get('properties') or {}).get('title', [])) or 'Notion page'
            ctx['warn'](f'page mention "{title}" rendered as text')
            out.append(esc(title))
            continue
        if 'lm' in kinds:
            lm = kinds['lm']
            href = lm.get('href', '') if isinstance(lm, dict) else ''
            title = (lm.get('title') if isinstance(lm, dict) else None) or href
            out.append(f'[{esc(title)}]({href})')
            continue
        if 'u' in kinds:
            out.append('@user')
            continue
        if 'e' in kinds:
            out.append(f'`{kinds["e"]}`')
            ctx['warn']('inline equation rendered as code')
            continue
        if 'c' in kinds:
            t = text.replace('\n', ' ')
            ticks = '``' if '`' in t else '`'
            s = f'{ticks}{t}{ticks}'
            if in_table:
                s = s.replace('|', '\\|')
        else:
            s = esc(text)
        if heading:
            kinds = {k: v for k, v in kinds.items() if k not in ('b', 'i', 's')}
        if 'b' in kinds:
            s = wrap(s, '**', 'strong')
        if 'i' in kinds:
            s = wrap(s, '*', 'em')
        if 's' in kinds:
            s = wrap(s, '~~', 'del')
        if 'a' in kinds:
            href = kinds['a']
            if href.startswith('/'):  # notion internal link
                ctx['warn'](f'internal notion link {href} kept as text')
            else:
                href = re.sub(r'^https?://(www\.)?qinyang\.wang', '', href) or '/'
                s = f'[{s}]({href.replace(" ", "%20").replace(")", "%29").replace("(", "%28")})'
        out.append(s)
    res = ''.join(out).rstrip()  # trailing Notion newlines would become stray hard breaks
    if in_table:
        res = res.replace('\n', '<br />')
    else:
        res = res.replace('\n', '\\\n')  # hard line break
    return res


def title_of(v):
    return (v.get('properties') or {}).get('title')


# ---------- images ----------

def download_image(slug, block, ctx):
    v = block['value']
    src = ((v.get('properties') or {}).get('source') or [[None]])[0][0] or (v.get('format') or {}).get('display_source')
    if not src:
        ctx['warn'](f'image {v["id"]} without source')
        return None
    if src.startswith('http') and 'amazonaws.com' not in src and 'notion' not in src and not src.startswith('attachment'):
        url = src  # external image
    else:
        url = f'https://www.notion.so/image/{urllib.parse.quote(src, safe="")}?table=block&id={v["id"]}&cache=v2'
    folder = os.path.join(PUBLIC, 'images', slug)
    os.makedirs(folder, exist_ok=True)
    existing = [f for f in os.listdir(folder) if f.startswith(v['id'])]
    if existing and not REFETCH:
        return f'/images/{slug}/{existing[0]}'
    try:
        data, ctype = fetch(url, binary=True)
    except Exception as e:  # keep going; report it
        ctx['warn'](f'image download failed {url}: {e}')
        return src
    ext = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/gif': 'gif', 'image/webp': 'webp', 'image/svg+xml': 'svg'}.get(ctype.split(';')[0], None)
    if not ext:
        ext = os.path.splitext(urllib.parse.urlparse(src).path)[1].lstrip('.').lower() or 'png'
    name = f'{v["id"]}.{ext}'
    open(os.path.join(folder, name), 'wb').write(data)
    ctx['images'] += 1
    return f'/images/{slug}/{name}'


# ---------- blocks ----------

LANG = {'plain text': 'text', 'shell': 'bash', 'javascript': 'js', 'typescript': 'ts', 'c++': 'cpp', 'c#': 'csharp', 'docker': 'dockerfile'}


def indent(text, prefix):
    return '\n'.join((prefix + line) if line.strip() else line.rstrip() for line in text.split('\n'))


def render_children(ids, ctx):
    parts = []
    i = 0
    ids = [x for x in (ids or []) if x in ctx['blocks']]
    while i < len(ids):
        b = ctx['blocks'][ids[i]]
        t = b['value']['type']
        if t in ('bulleted_list', 'numbered_list'):
            run = []
            while i < len(ids) and ctx['blocks'][ids[i]]['value']['type'] == t:
                run.append(ctx['blocks'][ids[i]])
                i += 1
            parts.append(render_list(run, ctx))
            continue
        md = render_block(b, ctx)
        if md is not None and md.strip():
            parts.append(md)
        i += 1
    return '\n\n'.join(parts)


def render_list(run, ctx):
    lines = []
    t = run[0]['value']['type']
    start = (run[0]['value'].get('format') or {}).get('list_start_index', 1) or 1
    for n, b in enumerate(run):
        v = b['value']
        marker = f'{start + n}. ' if t == 'numbered_list' else '- '
        pad = ' ' * len(marker)
        body = rich(title_of(v), ctx) or '\u200b'
        item = marker + indent(body, pad)[len(pad):] if '\n' in body else marker + body
        kids = render_children(v.get('content'), ctx)
        if kids:
            item += '\n\n' + indent(kids, pad)
        lines.append(item)
    loose = any('\n\n' in x for x in lines)
    return ('\n\n' if loose else '\n').join(lines)


def render_block(b, ctx):
    v = b['value']
    t = v['type']
    props = v.get('properties') or {}
    kids = lambda: render_children(v.get('content'), ctx)
    if t == 'text':
        body = rich(title_of(v), ctx)
        k = kids()
        return '\n\n'.join(x for x in (body, k) if x)
    if t in ('header', 'sub_header', 'sub_sub_header'):
        level = {'header': '##', 'sub_header': '###', 'sub_sub_header': '####'}[t]
        return f'{level} {rich(title_of(v), ctx, heading=True).replace(chr(92) + chr(10), " ")}'
    if t == 'code':
        code = ''.join(s[0] for s in props.get('title', []))
        lang = props.get('language', [['text']])[0][0].lower()
        lang = LANG.get(lang, lang.replace(' ', ''))
        fence = '```'
        while fence in code:
            fence += '`'
        cap = rich(props.get('caption'), ctx)
        return f'{fence}{lang}\n{code}\n{fence}' + (f'\n\n{cap}' if cap else '')
    if t == 'quote':
        body = rich(title_of(v), ctx)
        k = kids()
        return indent('\n\n'.join(x for x in (body, k) if x), '> ').replace('\n\n', '\n>\n')
    if t == 'callout':
        icon = (v.get('format') or {}).get('page_icon') or ''
        if icon.startswith('http') or icon.startswith('/'):
            icon = ''
        body = rich(title_of(v), ctx)
        k = kids()
        text = '\n\n'.join(x for x in (body, k) if x)
        if icon:
            text = f'{icon} {text}'
        return indent(text, '> ').replace('\n\n', '\n>\n')
    if t == 'image':
        path = download_image(ctx['slug'], b, ctx)
        cap = rich(props.get('caption'), ctx)
        alt = re.sub(r'[\[\]\\]', '', cap) if cap else ''
        md = f'![{alt}]({path})'
        return md + (f'\n\n*{cap}*' if cap else '')
    if t == 'divider':
        return '---'
    if t == 'table':
        fmt = v.get('format') or {}
        order = fmt.get('table_block_column_order') or []
        rows = [ctx['blocks'][r]['value'] for r in v.get('content', []) if r in ctx['blocks']]
        if not fmt.get('table_block_column_header'):
            ctx['warn']('table without header row: first row used as header')
        cells = [[rich((r.get('properties') or {}).get(c), ctx, in_table=True) or ' ' for c in order] for r in rows]
        return table(cells)
    if t == 'collection_view':
        return render_collection(b, ctx)
    if t == 'bookmark':
        link = props.get('link', [['']])[0][0]
        title = rich(props.get('title'), ctx) or link
        return f'[{title}]({link})'
    if t in ('to_do',):
        checked = props.get('checked', [['No']])[0][0] == 'Yes'
        return f'- [{"x" if checked else " "}] {rich(title_of(v), ctx)}'
    if t == 'toggle':
        ctx['warn']('toggle rendered as <details>')
        return f'<details>\n<summary>{rich(title_of(v), ctx)}</summary>\n\n{kids()}\n\n</details>'
    if t in ('column_list', 'column'):
        return kids()
    ctx['warn'](f'unsupported block type {t} ({v["id"]}) skipped')
    return None


def table(cells):
    if not cells:
        return ''
    w = max(len(r) for r in cells)
    cells = [r + [' '] * (w - len(r)) for r in cells]
    lines = ['| ' + ' | '.join(cells[0]) + ' |', '|' + '|'.join([' --- '] * w) + '|']
    lines += ['| ' + ' | '.join(r) + ' |' for r in cells[1:]]
    return '\n'.join(lines)


def render_collection(b, ctx):
    v = b['value']
    rm = ctx['recordMap']
    cid = v.get('collection_id') or (v.get('format') or {}).get('collection_pointer', {}).get('id')
    col = rm.get('collection', {}).get(cid, {}).get('value', {})
    schema = col.get('schema', {})
    view_id = (v.get('view_ids') or [None])[0]
    view = rm.get('collection_view', {}).get(view_id, {}).get('value', {})
    props = [p['property'] for p in (view.get('format') or {}).get('table_properties', []) if p.get('visible', True) and p['property'] in schema]
    q = rm.get('collection_query', {}).get(cid, {}).get(view_id, {})
    ids = (q.get('collection_group_results') or q.get('blockIds') and {'blockIds': q['blockIds']} or {}).get('blockIds', [])
    name = ''.join(s[0] for s in (col.get('name') or []))
    rows = [[schema[p]['name'] for p in props]]
    total = 0.0
    for rid in ids:
        r = ctx['blocks'].get(rid, {}).get('value')
        if not r:
            continue
        rp = r.get('properties') or {}
        row = []
        for p in props:
            val = rich(rp.get(p), ctx, in_table=True)
            if schema[p].get('type') == 'number' and val:
                if schema[p].get('number_format') == 'yuan':
                    try:
                        total += float(val)
                    except ValueError:
                        pass
                    try:
                        val = f'¥{float(val):,.2f}'
                    except ValueError:
                        val = '¥' + val
            row.append(val or ' ')
        rows.append(row)
    ctx['warn'](f'inline database "{name}" rendered as a static table ({len(rows) - 1} rows)')
    out = (f'**{esc(name)}**\n\n' if name else '') + table(rows)
    return out


# ---------- pages ----------

def cst_date(ms):
    return dt.datetime.fromtimestamp(ms / 1000, CST).strftime('%Y-%m-%d')


def yaml_str(s):
    return json.dumps(s, ensure_ascii=False)


def migrate(slug, is_post=True):
    html = cached(slug, SITE + '/' + urllib.parse.quote(slug))
    pp = next_data(html)
    post = pp['post']
    rm = pp['blockMap']
    warnings = []
    ctx = {'blocks': rm['block'], 'recordMap': rm, 'slug': slug, 'images': 0,
           'warn': lambda m: warnings.append(m) if m not in warnings else None}
    root = rm['block'][post['id']]['value']
    body = render_children(root.get('content'), ctx)
    fm = [f'title: {yaml_str(post["title"].strip())}']
    if post.get('summary'):
        fm.append(f'description: {yaml_str(post["summary"].strip())}')
    if is_post:
        fm.append(f'date: {cst_date(post["date"])}')
        if post.get('tags'):
            fm.append('tags: [' + ', '.join(yaml_str(t) for t in post['tags']) + ']')
        if post.get('category'):
            fm.append(f'category: {yaml_str(post["category"])}')
        fm.append('author: QinYang Wang')
        cover = post.get('pageCover') or post.get('pageCoverThumbnail')
        if cover:
            warnings.append('post has a cover image: not migrated automatically')
    os.makedirs(CONTENT, exist_ok=True)
    text = '---\n' + '\n'.join(fm) + '\n---\n\n' + body.strip() + '\n'
    open(os.path.join(CONTENT, f'{slug}.mdx'), 'w').write(text)
    images_total = len([1 for b in rm['block'].values() if b['value']['type'] == 'image'])
    report['posts'].append({'slug': slug, 'title': post['title'].strip(), 'date': cst_date(post['date']),
                            'tags': post.get('tags') or [], 'images': images_total, 'warnings': warnings})
    print(f'{slug}: {images_total} images, {len(warnings)} warnings')


def main():
    slugs = discover()
    print(f'{len(slugs)} posts found')
    for s in slugs:
        migrate(s)
    migrate('about', is_post=False)
    report['slugs'] = slugs
    json.dump(report, open(os.path.join(ROOT, 'migration-report.json'), 'w'), ensure_ascii=False, indent=2)


if __name__ == '__main__':
    main()
