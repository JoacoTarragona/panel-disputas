#!/usr/bin/env python3
"""Abre merchants.ubereats.com, inicia sesión y guarda ~/.uber_cookie (sin imprimirla).

Requiere: pip install playwright && playwright install chromium
"""
from __future__ import annotations

import argparse
import os
import sys
import time

MERCHANTS = "https://merchants.ubereats.com/manager/"


def main() -> None:
    parser = argparse.ArgumentParser(description="Login Uber Eats Manager → uber_cookie")
    parser.add_argument("--user", default=os.environ.get("UBER_USER", ""))
    parser.add_argument("--password", default=os.environ.get("UBER_PASS", ""))
    parser.add_argument("--headful", action="store_true", help="navegador visible (depuración)")
    args = parser.parse_args()
    if not args.user or not args.password:
        print("ERROR: falta UBER_USER / UBER_PASS", file=sys.stderr)
        sys.exit(2)
    try:
        from playwright.sync_api import sync_playwright
    except ImportError:
        print(
            "ERROR: instale playwright en el servidor (pip install playwright && playwright install chromium)",
            file=sys.stderr,
        )
        sys.exit(3)

    client_dir = os.environ.get(
        "UBER_CLIENT_DIR",
        "/home/dev/app-delivery/panel-delivery-fuentes/clientes/uber",
    )
    sys.path.insert(0, client_dir)
    from api_client import save_cookie  # type: ignore

    headless = not args.headful and os.environ.get("UBER_LOGIN_HEADFUL", "") != "1"
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        context = browser.new_context(
            user_agent=(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36"
            )
        )
        page = context.new_page()
        page.goto(MERCHANTS, wait_until="domcontentloaded", timeout=120000)
        time.sleep(2)
        # Flujo Uber: email → siguiente → password (selectores pueden variar)
        for label, value, kind in (
            ('input[type="email"], input[name="email"], input[id*="email"]', args.user, "fill"),
            ('input[type="password"], input[name="password"]', args.password, "fill"),
        ):
            if kind == "fill":
                loc = page.locator(label).first
                if loc.count() and loc.is_visible(timeout=8000):
                    loc.fill(value)
                    page.keyboard.press("Enter")
                    time.sleep(2)
        # Esperar panel de tiendas
        try:
            page.wait_for_url("**/manager/**", timeout=120000)
        except Exception:
            pass
        time.sleep(3)
        if "login" in page.url.lower() or "auth" in page.url.lower():
            print("ERROR: no se completó el login (¿2FA o captcha?)", file=sys.stderr)
            browser.close()
            sys.exit(4)
        pairs = []
        for c in context.cookies():
            dom = (c.get("domain") or "")
            if "ubereats" in dom or "uber.com" in dom:
                pairs.append(f"{c['name']}={c['value']}")
        if len(pairs) < 2:
            print("ERROR: cookies insuficientes tras login", file=sys.stderr)
            browser.close()
            sys.exit(1)
        header = "; ".join(pairs)
        save_cookie(header)
        browser.close()
    print("OK", file=sys.stderr)


if __name__ == "__main__":
    main()
