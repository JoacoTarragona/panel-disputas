#!/usr/bin/env python3
"""Empuja ~/.uber_cookie y ~/.pya_tokens.json al panel vía API M2M (sin imprimir secretos)."""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request

UBER_FILE = os.path.expanduser("~/.uber_cookie")
PYA_FILE = os.path.expanduser("~/.pya_tokens.json")


def env(name: str) -> str:
    return (os.environ.get(name) or "").strip()


def request(method: str, path: str, body: dict | None = None, check: bool = True) -> tuple[int, dict]:
    base = env("PANEL_URL").rstrip("/")
    token = env("CREDENTIALS_API_TOKEN")
    if not base:
        print("Falta PANEL_URL", file=sys.stderr)
        sys.exit(2)
    if not token:
        print("Falta CREDENTIALS_API_TOKEN", file=sys.stderr)
        sys.exit(2)
    url = f"{base}{path}"
    if not check and "?" not in path:
        url += "?check=false"
    data = None
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/json"}
    if body is not None:
        data = json.dumps(body).encode("utf-8")
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=120) as resp:
            raw = resp.read().decode("utf-8")
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as exc:
        raw = exc.read().decode("utf-8", errors="replace")
        try:
            payload = json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            payload = {"error": raw[:200] or exc.reason}
        return exc.code, payload


def read_uber_cookie(from_file: str | None) -> str:
    if from_file:
        with open(from_file, encoding="utf-8") as fh:
            return fh.read().strip()
    if os.path.isfile(UBER_FILE):
        with open(UBER_FILE, encoding="utf-8") as fh:
            return fh.read().strip()
    print("uber: falta --from-file o ~/.uber_cookie", file=sys.stderr)
    sys.exit(1)


def push_uber(check: bool, from_file: str | None = None) -> None:
    cookie = read_uber_cookie(from_file)
    code, body = request("POST", "/api/credentials/uber", {"cookie": cookie}, check=check)
    print(f"uber HTTP {code} ok={body.get('ok')} length={body.get('length')} health_ok={(body.get('health') or {}).get('ok')}")
    if code >= 400 or not body.get("ok"):
        sys.exit(1)


def push_pya(check: bool) -> None:
    if not os.path.isfile(PYA_FILE):
        print("pya: archivo local ausente", file=sys.stderr)
        sys.exit(1)
    with open(PYA_FILE, encoding="utf-8") as fh:
        data = json.load(fh)
    payload = {
        "access": data.get("access", ""),
        "refresh": data.get("refresh", ""),
    }
    if data.get("device"):
        payload["device"] = data["device"]
    code, body = request("POST", "/api/credentials/pya", payload, check=check)
    lengths = body.get("length") or {}
    print(
        f"pya HTTP {code} ok={body.get('ok')} "
        f"access_len={lengths.get('access')} refresh_len={lengths.get('refresh')} "
        f"expires_in={body.get('access_expires_in')} health_ok={(body.get('health') or {}).get('ok')}"
    )
    if code >= 400 or not body.get("ok"):
        sys.exit(1)


def status() -> None:
    code, body = request("GET", "/api/credentials/status")
    print(f"status HTTP {code}")
    for key in ("uber", "pya"):
        part = body.get(key) or {}
        print(f"  {key}: present={part.get('present')} mtime={part.get('mtime')} size={part.get('size')}")
        if key == "pya" and part.get("access_expires_in") is not None:
            print(f"  pya access_expires_in={part.get('access_expires_in')}")
    if code >= 400:
        sys.exit(1)


def main() -> None:
    parser = argparse.ArgumentParser(description="Push credenciales al panel (M2M)")
    parser.add_argument("--uber", action="store_true")
    parser.add_argument("--pya", action="store_true")
    parser.add_argument("--status", action="store_true")
    parser.add_argument(
        "--from-file",
        metavar="PATH",
        help="Uber: archivo con header Cookie (export navegador / Grok)",
    )
    parser.add_argument("--no-check", action="store_true", help="Omite health remoto al guardar")
    args = parser.parse_args()
    check = not args.no_check
    if args.status:
        status()
    if args.uber:
        push_uber(check, args.from_file)
    if args.pya:
        push_pya(check)
    if not (args.status or args.uber or args.pya):
        parser.print_help()
        sys.exit(2)


if __name__ == "__main__":
    main()
