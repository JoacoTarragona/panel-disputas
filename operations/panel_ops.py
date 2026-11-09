#!/usr/bin/env python3
"""Muestreo de estado vía CLI (uber.py / pya.py) y métricas básicas de operaciones."""
from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import subprocess
import sys
from contextlib import closing
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

TZ = ZoneInfo("America/Santiago")
SCHEDULE_RE = re.compile(
    r"(opens\b|off[-\s]?hours|outside[_\s-]?schedule|fuera de horario|"
    r"outside schedule|closed until|horario)",
    re.I,
)

DEFAULT_DB = Path(__file__).resolve().parent.parent / "iterations" / "v1" / "data" / "ops.sqlite"


def db_path() -> Path:
    raw = os.environ.get("OPS_DB", "")
    return Path(raw) if raw else DEFAULT_DB


def connect() -> sqlite3.Connection:
    path = db_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(path, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    schema = (Path(__file__).parent / "schema.sql").read_text(encoding="utf-8")
    con.executescript(schema)
    return con


def init_db() -> None:
    with closing(connect()):
        pass


def classify_pya(row: dict) -> str:
    st = str(row.get("state") or "").upper()
    if st in ("OPEN", "HIGH_DEMAND_MODE", "CHECKOUT"):
        return "open"
    if st in ("OUTSIDE_SCHEDULE", "INACTIVE", "NOT_FOUND"):
        return "offhours"
    if st == "CLOSED":
        return "paused" if (row.get("reason") or row.get("author")) else "closed"
    if st == "CHECKIN":
        return "offhours"
    return "closed"


def classify_uber(row: dict) -> str:
    st = str(row.get("state") or "").strip().lower()
    reason = str(row.get("reason") or "")
    if st == "open":
        return "open"
    if st == "paused":
        return "paused"
    if st == "not_visible":
        return "offhours"
    if st == "closed":
        if SCHEDULE_RE.search(reason):
            return "offhours"
        next_open = str(row.get("next_open") or "").strip()
        paused_until = str(row.get("paused_until") or "").strip()
        if next_open and not paused_until and not reason.strip():
            return "offhours"
        return "closed" if reason else "offhours"
    return "closed"


def run_cli(agregador: str, uber_cli: str, pya_cli: str, home: str) -> tuple[list[dict], str | None]:
    if agregador == "rappi":
        return [], "sin conexion"
    script = uber_cli if agregador == "uber" else pya_cli
    if not os.path.isfile(script):
        return [], "API caida"
    env = {**os.environ, "HOME": home}
    try:
        proc = subprocess.run(
            [sys.executable, script, "monitor", "--json"],
            capture_output=True,
            text=True,
            timeout=120,
            env=env,
            cwd=os.path.dirname(script),
        )
    except subprocess.TimeoutExpired:
        return [], "API caida"
    err = (proc.stderr or "").lower()
    if proc.returncode != 0:
        if "403" in err or "perimeterx" in err:
            return [], "bloqueo anti-bot"
        if "401" in err or "otp" in err or "cookie" in err or "token" in err:
            return [], "sin credencial"
        return [], "API caida"
    try:
        rows = json.loads(proc.stdout)
    except json.JSONDecodeError:
        return [], "API caida"
    if not isinstance(rows, list):
        return [], "API caida"
    return rows, None


def normalize_rows(agregador: str, rows: list[dict]) -> list[dict]:
    out = []
    classify = classify_uber if agregador == "uber" else classify_pya
    for row in rows:
        if agregador == "uber":
            store_id = str(row.get("id") or "")
            name = str(row.get("store") or "")
            raw = str(row.get("state") or "")
            reason = str(row.get("reason") or "")
            author = ""
        else:
            store_id = str(row.get("vendor_id") or "")
            name = str(row.get("name") or "")
            raw = str(row.get("state") or "")
            reason = str(row.get("reason") or "")
            author = str(row.get("author") or "")
        if not store_id:
            continue
        kind = classify(row)
        out.append({
            "store_id": store_id,
            "name": name,
            "kind": kind,
            "raw_state": raw,
            "reason": reason,
            "author": author,
        })
    return out


def record_sample(agregador: str, locales: list[dict], ok: bool, error: str | None) -> int | None:
    at = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    with closing(connect()) as con, con:
        cid = con.execute(
            "INSERT INTO status_checks (at, ok, agregador, error) VALUES (?, ?, ?, ?)",
            (at, 1 if ok else 0, agregador, error),
        ).lastrowid
        if ok and locales:
            con.executemany(
                "INSERT INTO status_samples "
                "(check_id, agregador, store_id, name, kind, raw_state, reason, author) "
                "VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (
                        cid,
                        agregador,
                        loc["store_id"],
                        loc["name"],
                        loc["kind"],
                        loc["raw_state"],
                        loc.get("reason") or "",
                        loc.get("author") or "",
                    )
                    for loc in locales
                ],
            )
        cutoff = (datetime.now(timezone.utc) - timedelta(days=180)).strftime("%Y-%m-%dT%H:%M:%SZ")
        con.execute("DELETE FROM status_checks WHERE at < ?", (cutoff,))
        return cid


def snapshot_avail(locales: list[dict]) -> float | None:
    sched = [loc for loc in locales if loc["kind"] in ("open", "paused", "closed")]
    if not sched:
        return None
    open_n = sum(1 for loc in sched if loc["kind"] == "open")
    return round(100 * open_n / len(sched), 1)


def avail_from_totals(totals: dict[str, float]) -> float | None:
    sched = totals.get("open", 0) + totals.get("paused", 0) + totals.get("closed", 0)
    if sched <= 0:
        return None
    return round(100 * totals["open"] / sched, 1)


def day_bounds() -> tuple[str, str]:
    now = datetime.now(TZ)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).astimezone(timezone.utc)
    end = start + timedelta(days=1)
    return (
        start.strftime("%Y-%m-%dT%H:%M:%SZ"),
        end.strftime("%Y-%m-%dT%H:%M:%SZ"),
    )


def parse_iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))


def parse_range(desde: str, hasta: str, default_days: int = 6) -> tuple[datetime, datetime]:
    now = datetime.now(TZ)
    end = now.astimezone(timezone.utc)
    if hasta.strip():
        end = parse_iso(hasta.strip()).astimezone(timezone.utc)
    if desde.strip():
        start = parse_iso(desde.strip()).astimezone(timezone.utc)
    else:
        start = (now - timedelta(days=default_days)).replace(hour=0, minute=0, second=0, microsecond=0).astimezone(
            timezone.utc
        )
    if start >= end:
        start = end - timedelta(hours=1)
    return start, end


def default_grouping(start: datetime, end: datetime) -> str:
    span = (end.astimezone(TZ).date() - start.astimezone(TZ).date()).days + 1
    if span <= 1:
        return "hora"
    if span <= 62:
        return "dia"
    return "mes"


def bucket_key(moment: datetime, agrupar: str) -> str:
    local = moment.astimezone(TZ)
    if agrupar == "hora":
        return local.strftime("%Y-%m-%d %H:00")
    if agrupar == "mes":
        return local.strftime("%Y-%m")
    return local.strftime("%Y-%m-%d")


def bucket_keys(start: datetime, end: datetime, agrupar: str) -> list[str]:
    keys: list[str] = []
    cursor = start.astimezone(TZ)
    limit = end.astimezone(TZ)
    while cursor <= limit:
        key = bucket_key(cursor, agrupar)
        if not keys or keys[-1] != key:
            keys.append(key)
        if agrupar == "hora":
            cursor += timedelta(hours=1)
        elif agrupar == "mes":
            cursor = (cursor.replace(day=1) + timedelta(days=32)).replace(day=1)
        else:
            cursor += timedelta(days=1)
    return keys


def clean_reason(text: str) -> str:
    value = (text or "").strip()
    if not value:
        return "(sin motivo)"
    return value.replace("ORDER_ISSUE_", "").replace("ORDER_TAG_", "").replace("_", " ").lower()[:120]


def period_analytics(agregador: str, desde: str = "", hasta: str = "", agrupar: str = "") -> dict:
    kinds = ("open", "paused", "closed", "offhours")
    start, end = parse_range(desde, hasta)
    agrupar = agrupar if agrupar in ("hora", "dia", "mes") else default_grouping(start, end)
    keys = bucket_keys(start, end, agrupar)
    with closing(connect()) as con:
        rows = con.execute(
            """
            SELECT c.at, ss.store_id, ss.kind, ss.reason, ss.author
            FROM status_samples ss
            JOIN status_checks c ON c.id = ss.check_id
            WHERE ss.agregador = ? AND c.ok = 1 AND c.at >= ? AND c.at < ?
            ORDER BY ss.store_id, c.at
            """,
            (agregador, start.strftime("%Y-%m-%dT%H:%M:%SZ"), end.strftime("%Y-%m-%dT%H:%M:%SZ")),
        ).fetchall()
    by_store: dict[str, list] = defaultdict(list)
    for row in rows:
        by_store[str(row["store_id"])].append(row)

    max_gap = timedelta(minutes=15)
    limit = min(end, datetime.now(timezone.utc))
    totals = dict.fromkeys(kinds, 0.0)
    buckets = {key: dict.fromkeys(kinds, 0.0) for key in keys}
    motivos_min: dict[str, float] = defaultdict(float)
    motivos_n: dict[str, int] = defaultdict(int)
    muestras = 0

    for store_rows in by_store.values():
        if len(store_rows) < 1:
            continue
        muestras += len(store_rows)
        for i, row in enumerate(store_rows):
            t0 = parse_iso(str(row["at"]))
            t1 = parse_iso(str(store_rows[i + 1]["at"])) if i + 1 < len(store_rows) else limit
            gap_end = min(t1, t0 + max_gap, limit, end)
            a = max(t0, start)
            b = min(gap_end, end)
            if b <= a:
                continue
            mins = (b - a).total_seconds() / 60
            kind = str(row["kind"])
            totals[kind] = totals.get(kind, 0) + mins
            bk = bucket_key(a, agrupar)
            if bk in buckets:
                buckets[bk][kind] = buckets[bk].get(kind, 0) + mins
            if kind in ("paused", "closed"):
                label = clean_reason(str(row["reason"] or ""))
                motivos_min[label] += mins
                motivos_n[label] += 1

    # instantánea por corrida: % locales abiertos en cada timestamp
    por_corrida: dict[str, list[float]] = defaultdict(list)
    check_groups: dict[str, list] = defaultdict(list)
    for row in rows:
        check_groups[str(row["at"])].append(row)
    for at, group in check_groups.items():
        sched = [g for g in group if g["kind"] in ("open", "paused", "closed")]
        if not sched:
            continue
        open_n = sum(1 for g in sched if g["kind"] == "open")
        por_corrida[bucket_key(parse_iso(at), agrupar)].append(100 * open_n / len(sched))

    serie = []
    for key in keys:
        part = buckets[key]
        sched = part["open"] + part["paused"] + part["closed"]
        disp = round(100 * part["open"] / sched, 1) if sched > 0 else None
        if key in por_corrida and por_corrida[key]:
            disp_snap = round(sum(por_corrida[key]) / len(por_corrida[key]), 1)
        else:
            disp_snap = disp
        serie.append({
            "periodo": key,
            "disponibilidad": disp,
            "disponibilidad_corrida": disp_snap,
            "minutos": {k: round(part[k], 1) for k in kinds},
        })

    motivos = sorted(
        [
            {"motivo": name, "veces": motivos_n[name], "minutos": round(motivos_min[name], 1)}
            for name in motivos_min
        ],
        key=lambda item: (-item["minutos"], -item["veces"]),
    )[:20]

    return {
        "agregador": agregador,
        "desde": start.astimezone(TZ).isoformat(timespec="seconds"),
        "hasta": end.astimezone(TZ).isoformat(timespec="seconds"),
        "agrupar": agrupar,
        "muestras": muestras,
        "disponibilidad": avail_from_totals(totals),
        "totales_min": {k: round(totals[k], 1) for k in kinds},
        "serie": serie,
        "motivos": motivos,
    }


def resumen_dia(agregador: str) -> dict:
    start, end = day_bounds()
    part = period_analytics(
        agregador,
        start.replace("Z", "+00:00"),
        end.replace("Z", "+00:00"),
        "hora",
    )
    return {
        "muestras": part["muestras"],
        "disponibilidad": part["disponibilidad"],
        "totales_min": part["totales_min"],
    }


def cmd_sample(args: argparse.Namespace) -> int:
    rows, err = run_cli(args.agregador, args.uber_cli, args.pya_cli, args.home)
    if err:
        record_sample(args.agregador, [], False, err)
        print(json.dumps({"ok": False, "error": err, "locales": []}, ensure_ascii=False))
        return 0
    locales = normalize_rows(args.agregador, rows)
    record_sample(args.agregador, locales, True, None)
    dia = resumen_dia(args.agregador)
    dia["disponibilidad_instantanea"] = snapshot_avail(locales)
    print(
        json.dumps(
            {
                "ok": True,
                "agregador": args.agregador,
                "locales": locales,
                "actualizado_en": datetime.now(TZ).isoformat(timespec="seconds"),
                "dia": dia,
            },
            ensure_ascii=False,
        )
    )
    return 0


def cmd_resumen(args: argparse.Namespace) -> int:
    body = period_analytics(args.agregador, args.desde, args.hasta, args.agrupar)
    if not args.desde and not args.hasta and args.agrupar in ("", "hora"):
        body["dia"] = resumen_dia(args.agregador)
    print(json.dumps(body, ensure_ascii=False))
    return 0


def cmd_live(args: argparse.Namespace) -> int:
    rows, err = run_cli(args.agregador, args.uber_cli, args.pya_cli, args.home)
    if err:
        print(json.dumps({"ok": False, "error": err, "locales": []}, ensure_ascii=False))
        return 0
    locales = normalize_rows(args.agregador, rows)
    print(
        json.dumps(
            {
                "ok": True,
                "agregador": args.agregador,
                "locales": locales,
                "actualizado_en": datetime.now(TZ).isoformat(timespec="seconds"),
            },
            ensure_ascii=False,
        )
    )
    return 0


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("command", choices=["init", "sample", "resumen", "live"])
    parser.add_argument("--agregador", choices=["uber", "pedidosya", "rappi"], default="uber")
    parser.add_argument("--desde", default="")
    parser.add_argument("--hasta", default="")
    parser.add_argument("--agrupar", default="", choices=["", "hora", "dia", "mes"])
    parser.add_argument("--uber-cli", default=os.environ.get("UBER_CLI", ""))
    parser.add_argument("--pya-cli", default=os.environ.get("PYA_CLI", ""))
    parser.add_argument("--home", default=os.environ.get("OPS_CLI_HOME", ""))
    args = parser.parse_args()
    if not args.uber_cli:
        args.uber_cli = "/home/dev/app-delivery/panel-delivery-fuentes/delivery-monitor-servidor/clients/uber/uber.py"
    if not args.pya_cli:
        args.pya_cli = "/home/dev/app-delivery/panel-delivery-fuentes/delivery-monitor-servidor/clients/pya/pya.py"
    if not args.home:
        args.home = str(Path(__file__).resolve().parent.parent / "iterations" / "v1" / "sessions" / "home")
    if args.command == "init":
        init_db()
        print(json.dumps({"ok": True, "db": str(db_path())}))
        return 0
    if args.command == "sample":
        return cmd_sample(args)
    if args.command == "resumen":
        return cmd_resumen(args)
    return cmd_live(args)


if __name__ == "__main__":
    raise SystemExit(main())
