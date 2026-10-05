#!/usr/bin/env python3
"""Verify the branded image and its changed immutable asset references over HTTP."""
import html, re, sys, time, urllib.request

base = sys.argv[1].rstrip('/')
for attempt in range(30):
    try:
        body = urllib.request.urlopen(base+'/account/login', timeout=10).read().decode()
        break
    except (OSError, TimeoutError):
        if attempt == 29:
            raise
        time.sleep(1)
assert 'Chronio' in body and 'Open Chronio account dashboard' in body
assert '/assets/chronio-wordmark.png' in body and '/assets/chronio-mark.png' in body
assert 'Open Nuvio account dashboard' not in body
assert '| Nuvio' not in body
assets = set(html.unescape(value) for value in re.findall(r'(?:src|href)="([^"<>]+)"',body) if value.startswith(('/_next/', '/assets/chronio-')))
assert assets
for asset in assets:
    assert urllib.request.urlopen(base+asset,timeout=10).status == 200, asset
print('PASS Chronio title, header, favicon and versioned browser assets')
