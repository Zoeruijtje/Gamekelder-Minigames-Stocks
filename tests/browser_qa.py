#!/usr/bin/env python3
"""Browser regression and complete local-session smoke test.

The runner inlines the modular application so it does not depend on a local
network listener. It validates visual containment at common phone, tablet and
desktop viewports, then completes a real trade + Reaction Test round through
the public UI and verifies that the resulting market repricing is visible.
"""
from __future__ import annotations

import argparse
import base64
import json
import re
import shutil
from pathlib import Path

from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
ARTIFACTS = ROOT / "test-artifacts"
VIEWPORTS = (
    ("phone-360", 360, 800),
    ("phone-412", 412, 915),
    ("tablet-768", 768, 1024),
    ("desktop-1440", 1440, 900),
)


def data_url(path: Path, mime: str) -> str:
    return f"data:{mime};base64," + base64.b64encode(path.read_bytes()).decode()


def module_map() -> dict[str, str]:
    modules: dict[str, str] = {}
    for path in ROOT.glob("src/**/*.js"):
        specifier = "app:/" + path.relative_to(ROOT).as_posix()
        source = path.read_text(encoding="utf-8")

        def replace_import(match: re.Match[str]) -> str:
            import_path = match.group(1)
            if not import_path.startswith("."):
                return match.group(0)
            resolved = (path.parent / import_path).resolve().relative_to(ROOT).as_posix()
            return f"from 'app:/{resolved}'"

        source = re.sub(r"from\s+['\"]([^'\"]+)['\"]", replace_import, source)
        modules[specifier] = "data:text/javascript;base64," + base64.b64encode(source.encode()).decode()
    return modules


def inline_app() -> str:
    html = (ROOT / "index.html").read_text(encoding="utf-8")
    html = re.sub(r'<link[^>]+fonts\.(?:googleapis|gstatic)[^>]*>', "", html)
    html = re.sub(r'<link[^>]+rel="(?:preload|manifest)"[^>]*>', "", html)
    html = html.replace('<script src="supabase-config.js"></script>', '')
    css = "\n".join((ROOT / name).read_text(encoding="utf-8") for name in (
        "styles.css", "styles-pages.css", "styles-interaction.css", "responsive.css", "online.css", "trading-window.css"
    ))

    replacements = {
        "assets/gamekelder-bg.avif": data_url(ROOT / "assets/gamekelder-bg.webp", "image/webp"),
        "assets/gamekelder-bg.webp": data_url(ROOT / "assets/gamekelder-bg.webp", "image/webp"),
        "assets/gamekelder-bg-original.png": data_url(ROOT / "assets/gamekelder-bg.webp", "image/webp"),
        "assets/gamekelder-bg-mobile.avif": data_url(ROOT / "assets/gamekelder-bg-mobile.webp", "image/webp"),
        "assets/gamekelder-bg-mobile.webp": data_url(ROOT / "assets/gamekelder-bg-mobile.webp", "image/webp"),
    }
    for name, value in replacements.items():
        css = css.replace(name, value)

    html = re.sub(r'<link[^>]+href="styles\.css"[^>]*>', f"<style>{css}</style>", html)
    html = re.sub(r'<link[^>]+href="(?:styles-pages|styles-interaction|responsive|background-hq|online|trading-window)\.css"[^>]*>', "", html)
    imports = json.dumps({"imports": module_map()})
    html = html.replace(
        '<script type="module" src="src/main.js"></script>',
        f'<script type="importmap">{imports}</script><script type="module">import "app:/src/main.js";</script>',
    )
    html = html.replace(
        '<script type="module" src="src/services/trading-deadline.js"></script>',
        '<script type="module">import "app:/src/services/trading-deadline.js";</script>',
    )
    return html


def assert_contained(page: Page, width: int, label: str) -> None:
    metrics = page.evaluate(
        """() => ({
          doc: document.documentElement.scrollWidth,
          body: document.body.scrollWidth,
          viewport: innerWidth,
          app: document.querySelector('.app-frame')?.getBoundingClientRect().toJSON(),
          environment: document.querySelector('.environment')?.getBoundingClientRect().toJSON(),
        })"""
    )
    assert metrics["doc"] <= width + 1, f"{label}: document overflow {metrics}"
    assert metrics["body"] <= width + 1, f"{label}: body overflow {metrics}"
    assert metrics["app"]["left"] >= -1 and metrics["app"]["right"] <= width + 1, f"{label}: app escapes {metrics}"
    assert metrics["environment"]["width"] >= width - 1, f"{label}: background misses viewport {metrics}"


def wait_app(page: Page) -> None:
    page.wait_for_selector(".landing-hero", timeout=10_000)
    page.wait_for_timeout(150)


def responsive_matrix(browser, html: str, screenshots: bool) -> None:
    for name, width, height in VIEWPORTS:
        page = browser.new_page(viewport={"width": width, "height": height})
        errors: list[str] = []
        page.on("pageerror", lambda error: errors.append(str(error)))
        page.set_content(html, wait_until="domcontentloaded", timeout=30_000)
        wait_app(page)
        assert not errors, f"{name}: JavaScript errors: {errors}"
        assert_contained(page, width, name)
        heading = page.locator(".landing-copy h1").bounding_box()
        assert heading and heading["x"] >= 0 and heading["x"] + heading["width"] <= width + 1, f"{name}: heading clipped"
        if screenshots:
            page.screenshot(path=str(ARTIFACTS / f"{name}-landing.png"), full_page=False)
        page.close()
        print(f"PASS {name}: contained landing and visible room background")


def complete_reaction_round(browser, html: str, screenshots: bool) -> None:
    page = browser.new_page(viewport={"width": 412, "height": 915})
    errors: list[str] = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.set_content(html, wait_until="domcontentloaded", timeout=30_000)
    wait_app(page)

    page.get_by_role("button", name="CREATE LOCAL ROOM").click()
    page.wait_for_selector(".lobby-page")
    for button in page.locator(".game-toggle").all():
        game_id = button.get_attribute("data-game-id")
        if game_id != "reaction" and "is-active" in (button.get_attribute("class") or ""):
            button.click()
    page.get_by_role("button", name="RING THE OPENING BELL").click()
    page.wait_for_selector(".portfolio-hero")

    page.get_by_role("button", name=re.compile("START PRE-ROUND TRADING")).click()
    page.wait_for_selector(".market-state--trading")
    assert page.get_by_text("PRE-ROUND TRADING · AUTO-LOCKS IN").is_visible(), "Trading phase is not explained"
    countdown_text = page.locator("[data-trading-countdown]").first.text_content()
    assert countdown_text and countdown_text.startswith("00:"), f"Trading countdown is not visible: {countdown_text}"
    assert page.locator("[data-trading-progress]").count() >= 1, "Trading progress indicator is missing"

    page.locator('.asset-row[data-market="friend"]').nth(1).click()
    page.wait_for_selector(".order-modal")
    assert page.get_by_text("ORDERS AUTO-LOCK IN").is_visible(), "Order sheet deadline is missing"
    page.locator('form[data-form="order"] input[name="notional"]').fill("750")
    page.get_by_role("button", name="PLACE FICTIONAL ORDER").click()
    page.wait_for_selector(".order-modal", state="detached")

    page.get_by_role("button", name=re.compile("END TRADING EARLY")).click()
    page.get_by_role("button", name="START MINIGAME").click()
    page.wait_for_selector(".game-modal")
    page.get_by_role("button", name=re.compile("START FOR")).click()
    page.wait_for_selector(".reaction-pad--waiting")
    page.evaluate(
        """() => window.__FE_STORE__.update((state) => {
          state.ui.gameRuntime = {
            ...(state.ui.gameRuntime ?? {}),
            stage: 'go',
            goAt: Date.now() - 220,
          };
          return state;
        })"""
    )
    page.wait_for_selector(".reaction-pad--go")
    page.locator(".reaction-pad").click()
    page.wait_for_selector(".results-modal--market", timeout=7_000)

    state = page.evaluate("window.__FE_STORE__.getState()")
    round_state = state["session"]["rounds"][0]
    assert round_state["results"], "Round did not settle"
    assert len(state["accounts"]["friend"][state["players"][0]["id"]]["ledger"]) == 1, "Trade was not recorded"
    assert state["session"]["phase"] == "results", state["session"]["phase"]
    assert all(move["oldPrice"] > 0 and move["newPrice"] > 0 for move in round_state["marketMoves"]), round_state["marketMoves"]
    assert page.get_by_text("THE FRIEND MARKET MOVED.").is_visible(), "Settlement headline is missing"
    assert page.locator(".market-result-row").count() == len(state["players"]), "Not every friend price is visible"
    assert page.get_by_text("BEFORE").first.is_visible() and page.get_by_text("AFTER").first.is_visible(), "Before/after prices are missing"
    assert not errors, f"Flow emitted JavaScript errors: {errors}"
    assert_contained(page, 412, "reaction-flow")
    if screenshots:
        page.screenshot(path=str(ARTIFACTS / "reaction-market-settlement.png"), full_page=False)
    page.close()
    print("PASS complete UI flow: visible trade countdown → trade → minigame → Friend Market repricing")


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--screenshots", action="store_true")
    args = parser.parse_args()
    if args.screenshots:
        ARTIFACTS.mkdir(exist_ok=True)
    html = inline_app()
    executable = shutil.which("chromium") or shutil.which("chromium-browser") or shutil.which("google-chrome")
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True, executable_path=executable, args=["--no-sandbox"])
        try:
            responsive_matrix(browser, html, args.screenshots)
            complete_reaction_round(browser, html, args.screenshots)
        finally:
            browser.close()
    print("All browser QA cases passed.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
