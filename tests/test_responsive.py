#!/usr/bin/env python3
"""Responsive browser regression test for Friend Exchange.

Guards the mobile failure where a wide holdings table enlarged the complete
page and made the fixed gamekelder background appear as a separate column.
"""
from __future__ import annotations

import argparse
import base64
import json
import os
import re
import shutil
import sys
from pathlib import Path
from typing import Any

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "test-artifacts"
VIEWPORTS = (
    ("phone-320", 320, 700, True),
    ("phone-360", 360, 800, True),
    ("phone-390", 390, 844, True),
    ("phone-412", 412, 915, True),
    ("tablet-768", 768, 1024, False),
    ("laptop-1024", 1024, 768, False),
    ("desktop-1440", 1440, 900, False),
)
REQUIRED = (
    "index.html", "styles.css", "background.css", "responsive.css", "app.js",
    "assets/gamekelder-bg.webp", "assets/gamekelder-bg-mobile.webp",
)


def fail(message: str) -> None:
    raise AssertionError(message)


def check_files() -> None:
    missing = [name for name in REQUIRED if not (ROOT / name).is_file()]
    if missing:
        fail(f"Missing files: {', '.join(missing)}")
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    background = (ROOT / "background.css").read_text(encoding="utf-8")
    for name in ("styles.css", "background.css"):
        if f'href="{name}"' not in index:
            fail(f"index.html does not load {name}")
    if 'href="responsive.css"' not in index and '@import url("responsive.css")' not in background:
        fail("responsive.css is not loaded")
    if 'src="app.js"' not in index:
        fail("index.html does not load app.js")
    for name in REQUIRED[-2:]:
        raw = (ROOT / name).read_bytes()
        if len(raw) < 10_000 or not (raw[:4] == b"RIFF" and raw[8:12] == b"WEBP"):
            fail(f"Invalid WebP: {name}")


def uri(path: Path) -> str:
    return "data:image/webp;base64," + base64.b64encode(path.read_bytes()).decode()


def inline_page() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    css = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in (
        "styles.css", "background.css", "responsive.css",
    )).replace('@import url("responsive.css");', "")
    css = css.replace("assets/gamekelder-bg.webp", uri(ROOT / "assets/gamekelder-bg.webp"))
    css = css.replace("assets/gamekelder-bg-mobile.webp", uri(ROOT / "assets/gamekelder-bg-mobile.webp"))
    html = re.sub(r'<link[^>]+fonts\.(?:googleapis|gstatic)[^>]*>', "", html)
    html = re.sub(r'<link[^>]+href="styles\.css"[^>]*>', f"<style>{css}</style>", html)
    html = re.sub(r'<link[^>]+href="(?:background|responsive)\.css"[^>]*>', "", html)
    return html.replace('<script src="app.js"></script>', "")


FIXTURE = r"""() => {
  const row = `<tr><td><div class="asset-name"><span class="asset-icon">Z</span><span class="asset-title"><strong>ZOE</strong><small>Zoë</small></span></div></td><td><span class="type-chip">Friend</span></td><td>30</td><td>€142.18</td><td>€4,265.40</td><td class="positive">+8.41%</td></tr>`;
  document.querySelector('#overviewHoldings').innerHTML = row.repeat(5);
  document.querySelector('#portfolioHoldings').innerHTML = row.replace('<td>€142.18</td>', '<td>€118.20</td><td>€142.18</td>').repeat(5);
  document.querySelector('#miniRanking').innerHTML = ['Zoë','Lars','Mike','Alex'].map((n,i)=>`<div class="rank-row"><span class="rank-index">${i+1}</span><span class="rank-avatar">${n[0]}</span><strong>${n}</strong><span class="rank-time">${183+i*22} ms</span></div>`).join('');
  document.querySelector('#impactList').innerHTML = ['ZOE','MKE','LRS','ALX'].map((s,i)=>`<div class="impact-row"><strong>${s}</strong><span class="${i%2?'negative':'positive'}">${i%2?'−2.31%':'+8.41%'}</span><div class="sparkline"><svg viewBox="0 0 100 32"><polyline points="0,25 20,20 40,23 60,12 80,15 100,5" style="stroke:var(--green)"></polyline></svg></div></div>`).join('');
}"""


def system_chromium() -> str | None:
    for candidate in (os.getenv("CHROMIUM_PATH"), shutil.which("chromium"), shutil.which("chromium-browser"), shutil.which("google-chrome")):
        if candidate and Path(candidate).is_file():
            return candidate
    return None


def inside(rect: dict[str, float] | None, width: int, label: str) -> None:
    if not rect:
        fail(f"Missing {label}")
    left = rect.get("left", rect.get("x", 0))
    right = rect.get("right", left + rect.get("width", 0))
    if left < -1 or right > width + 1:
        fail(f"{label} escapes viewport: {rect}")


def metrics(page) -> dict[str, Any]:
    return page.evaluate("""() => {
      const rect = s => document.querySelector(s)?.getBoundingClientRect().toJSON() || null;
      const title = document.querySelector('.view.is-active .view-header h1');
      const wrap = document.querySelector('.holdings-table-wrap');
      return {
        doc: document.documentElement.scrollWidth, body: document.body.scrollWidth,
        env: rect('.environment'), shell: rect('.shell'), topbar: rect('.topbar'),
        nav: rect('.sidebar'), overview: rect('.overview-grid'), hero: rect('.portfolio-hero'),
        holdings: rect('.holdings-card'), wrap: rect('.holdings-table-wrap'),
        wrapClient: wrap?.clientWidth || 0, wrapScroll: wrap?.scrollWidth || 0,
        columns: getComputedStyle(document.querySelector('.overview-grid')).gridTemplateColumns,
        background: getComputedStyle(document.querySelector('.environment')).backgroundImage,
        titleWidth: title?.getBoundingClientRect().width || 0, titleScroll: title?.scrollWidth || 0,
        titleHeight: title?.getBoundingClientRect().height || 0,
        lineHeight: parseFloat(getComputedStyle(title).lineHeight) || 0
      };
    }""")


def test_viewport(page, name: str, width: int, height: int, mobile: bool) -> dict[str, Any]:
    result = metrics(page)
    if result["doc"] > width + 1 or result["body"] > width + 1:
        fail(f"{name}: horizontal overflow doc={result['doc']} body={result['body']} viewport={width}")
    for key in ("shell", "topbar", "nav", "overview", "hero", "holdings", "wrap"):
        inside(result[key], width, f"{name}/{key}")
    env = result["env"]
    if env["width"] < width - 1 or env["height"] < height - 1:
        fail(f"{name}: background does not cover viewport")
    if "data:image/webp" not in result["background"]:
        fail(f"{name}: background image not loaded")
    if mobile:
        if len(result["columns"].split()) != 1:
            fail(f"{name}: overview is not one column")
        if result["wrapScroll"] <= result["wrapClient"]:
            fail(f"{name}: table is not internally scrollable")
        if result["titleScroll"] > result["titleWidth"] + 1:
            fail(f"{name}: title is clipped")
        if result["lineHeight"] and result["titleHeight"] > result["lineHeight"] * 1.35:
            fail(f"{name}: title wraps unexpectedly")

    for view in page.eval_on_selector_all(".view", "els => els.map(e => e.dataset.view)"):
        page.evaluate("v => document.querySelectorAll('.view').forEach(e => e.classList.toggle('is-active', e.dataset.view === v))", view)
        active = page.locator(".view.is-active").bounding_box()
        inside(active, width, f"{name}/{view}")
        if page.evaluate("document.documentElement.scrollWidth") > width + 1:
            fail(f"{name}/{view}: view creates horizontal overflow")
    page.evaluate("document.querySelectorAll('.view').forEach(e => e.classList.toggle('is-active', e.dataset.view === 'overview'))")

    for dialog_id, selector in (("tradeModal", ".modal-panel"), ("gameModal", ".game-panel")):
        page.evaluate("id => document.getElementById(id).showModal()", dialog_id)
        inside(page.locator(selector).bounding_box(), width, f"{name}/{dialog_id}")
        if page.evaluate("document.documentElement.scrollWidth") > width + 1:
            fail(f"{name}/{dialog_id}: dialog creates overflow")
        page.evaluate("id => document.getElementById(id).close()", dialog_id)
    return result


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots", action="store_true")
    args = parser.parse_args()
    check_files()
    if args.screenshots:
        ARTIFACTS.mkdir(exist_ok=True)
    results = []
    with sync_playwright() as pw:
        options: dict[str, Any] = {"headless": True, "args": ["--no-sandbox"]}
        executable = system_chromium()
        if executable:
            options["executable_path"] = executable
        browser = pw.chromium.launch(**options)
        try:
            for name, width, height, mobile in VIEWPORTS:
                page = browser.new_page(viewport={"width": width, "height": height})
                errors: list[str] = []
                page.on("pageerror", lambda error: errors.append(str(error)))
                page.set_content(inline_page(), wait_until="load")
                page.evaluate(FIXTURE)
                page.wait_for_timeout(100)
                result = test_viewport(page, name, width, height, mobile)
                if errors:
                    fail(f"{name}: browser errors: {errors}")
                if args.screenshots:
                    page.screenshot(path=str(ARTIFACTS / f"{name}.png"), full_page=False)
                results.append({"name": name, "width": width, "height": height, "metrics": result})
                print(f"PASS {name}: contained layout and loaded background")
                page.close()
        finally:
            browser.close()
    ARTIFACTS.mkdir(exist_ok=True)
    (ARTIFACTS / "responsive-results.json").write_text(json.dumps(results, indent=2), encoding="utf-8")
    print(f"\nAll {len(VIEWPORTS)} responsive regression cases passed.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except AssertionError as error:
        print(f"FAIL: {error}", file=sys.stderr)
        raise SystemExit(1)
