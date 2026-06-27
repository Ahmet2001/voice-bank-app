from __future__ import annotations

import json
import os
import random
import re
import sqlite3
import time
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

DB_VERSION = "voice-bank-v2"


def default_db_path() -> Path:
    configured = os.environ.get("VOICE_BANK_DB_PATH")
    if configured:
        return Path(configured)
    return Path(__file__).resolve().parents[2].parent / "data" / "sandbox-bank.sqlite"


def now() -> str:
    return datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")


def normalize_text(value: str) -> str:
    lowered = value.lower()
    lowered = unicodedata.normalize("NFD", lowered)
    lowered = "".join(ch for ch in lowered if unicodedata.category(ch) != "Mn")
    table = str.maketrans({"ı": "i", "ğ": "g", "ü": "u", "ş": "s", "ö": "o", "ç": "c"})
    lowered = lowered.translate(table)
    lowered = re.sub(r"[^\w\s.-]", " ", lowered, flags=re.UNICODE)
    return re.sub(r"\s+", " ", lowered).strip()


def format_money(amount: float, currency: str) -> str:
    if currency in {"BTC", "ETH"}:
        return f"{amount:,.6f} {currency}".rstrip("0").rstrip(".")
    return f"{amount:,.2f} {currency}"


class BankSandbox:
    def __init__(self, db_path: Path | None = None):
        self.db_path = db_path or default_db_path()
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        self.conn = sqlite3.connect(self.db_path, check_same_thread=False)
        self.conn.row_factory = sqlite3.Row
        self.ensure_schema()
        self.seed_if_needed()

    def close(self) -> None:
        self.conn.close()

    def ensure_schema(self) -> None:
        self.conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS accounts (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL,
              currency TEXT NOT NULL, balance REAL NOT NULL, available REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS contacts (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, relation TEXT NOT NULL,
              account_label TEXT NOT NULL, currency TEXT NOT NULL,
              avatar TEXT NOT NULL, trust_level TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS contact_aliases (alias TEXT PRIMARY KEY, contact_id TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS transactions (
              id TEXT PRIMARY KEY, type TEXT NOT NULL, title TEXT NOT NULL,
              subtitle TEXT NOT NULL, amount REAL NOT NULL, currency TEXT NOT NULL,
              account_id TEXT NOT NULL, counterparty_id TEXT, status TEXT NOT NULL,
              category TEXT NOT NULL, created_at TEXT NOT NULL, note TEXT
            );
            CREATE TABLE IF NOT EXISTS cards (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, last4 TEXT NOT NULL,
              network TEXT NOT NULL, status TEXT NOT NULL, limit_amount REAL NOT NULL,
              spent REAL NOT NULL, currency TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS budgets (
              id TEXT PRIMARY KEY, name TEXT NOT NULL, spent REAL NOT NULL,
              limit_amount REAL NOT NULL, currency TEXT NOT NULL
            );
            CREATE TABLE IF NOT EXISTS holdings (
              symbol TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
              quantity REAL NOT NULL, price REAL NOT NULL, currency TEXT NOT NULL,
              change_percent REAL NOT NULL
            );
            CREATE TABLE IF NOT EXISTS confirmations (
              id TEXT PRIMARY KEY, payload_json TEXT NOT NULL, status TEXT NOT NULL,
              summary TEXT NOT NULL, created_at TEXT NOT NULL, resolved_at TEXT
            );
            """
        )
        self.conn.commit()

    def seed_if_needed(self) -> None:
        row = self.conn.execute("SELECT value FROM meta WHERE key = ?", ("seed_version",)).fetchone()
        if row and row["value"] == DB_VERSION:
            return

        self.conn.executescript(
            """
            DELETE FROM accounts; DELETE FROM contacts; DELETE FROM contact_aliases;
            DELETE FROM transactions; DELETE FROM cards; DELETE FROM budgets;
            DELETE FROM holdings; DELETE FROM confirmations;
            """
        )
        self.conn.executemany(
            "INSERT INTO accounts VALUES (?, ?, ?, ?, ?, ?)",
            [
                ("acc-usd", "Gunluk USD Hesabi", "checking", "USD", 8420, 8420),
                ("acc-try", "TL Vadesiz", "checking", "TRY", 184250, 184250),
                ("acc-savings", "Acil Durum Birikimi", "savings", "USD", 12600, 12600),
                ("acc-invest", "Yatirim Portfoyu", "investment", "USD", 28300, 9500),
            ],
        )
        contacts = [
            ("deniz", "Deniz Yilmaz", "Oglunuz", "Genc hesap", "USD", "/avatars/1.jpg", "family", ["oğlum", "oglum", "ogluma", "deniz", "cocugum"]),
            ("zeynep", "Zeynep Yilmaz", "Cocugunuz", "Cocuk birikim hesabi", "USD", "/avatars/2.jpg", "family", ["kızım", "kizim", "cocuk", "cocugum", "zeynep", "kizima"]),
            ("ayse", "Ayse Yilmaz", "Anneniz", "Aile transfer hesabi", "TRY", "/avatars/9.jpg", "family", ["anne", "annem", "anneme", "ayse", "anneye"]),
            ("mehmet", "Mehmet Yilmaz", "Babaniz", "Aile transfer hesabi", "TRY", "/avatars/10.jpg", "family", ["baba", "babam", "babama", "mehmet", "babaya"]),
            ("kemal", "Kemal Yilmaz", "Amcaniz", "Aile transfer hesabi", "TRY", "/avatars/11.jpg", "family", ["amca", "amcam", "amcama", "kemal", "amcaya"]),
            ("elif", "Elif Yilmaz", "Esiniz", "Ortak aile hesabi", "TRY", "/avatars/5.jpg", "family", ["eşim", "esim", "elif", "hanim"]),
            ("rent", "Murat Kaya", "Ev sahibi", "Kira IBAN", "TRY", "/avatars/8.jpg", "verified", ["kira", "ev sahibi", "murat", "kiraya"]),
            ("school", "Northstar School", "Okul", "Okul odeme hesabi", "USD", "/logos/google-com.png", "merchant", ["okul", "school", "northstar", "okula"]),
        ]
        for contact in contacts:
            self.conn.execute("INSERT INTO contacts VALUES (?, ?, ?, ?, ?, ?, ?)", contact[:7])
            self.conn.executemany(
                "INSERT OR IGNORE INTO contact_aliases VALUES (?, ?)",
                [(normalize_text(alias), contact[0]) for alias in contact[7]],
            )
        self.conn.executemany(
            "INSERT INTO transactions VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("txn-seed-1", "income", "Stripe Payout", "Musteri odemesi", 4250, "USD", "acc-usd", None, "completed", "Gelir", "2026-06-26T09:15:00.000Z", None),
                ("txn-seed-2", "card", "Apple iCloud+", "Kart harcamasi", -2.99, "USD", "acc-usd", None, "completed", "Teknoloji", "2026-06-25T13:32:00.000Z", None),
                ("txn-seed-3", "sent", "Deniz Yilmaz", "Haftalik harclik", -75, "USD", "acc-usd", "deniz", "completed", "Aile", "2026-06-24T18:10:00.000Z", "Harclik"),
            ],
        )
        self.conn.executemany(
            "INSERT INTO cards VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            [
                ("card-main", "Ana Kart", "4589", "Visa", "active", 6000, 2180, "USD"),
                ("card-family", "Aile Karti", "9012", "Mastercard", "active", 95000, 27140, "TRY"),
            ],
        )
        self.conn.executemany(
            "INSERT INTO budgets VALUES (?, ?, ?, ?, ?)",
            [
                ("budget-home", "Ev ve kira", 47200, 65000, "TRY"),
                ("budget-family", "Aile transferleri", 420, 900, "USD"),
                ("budget-invest", "Yatirim ayirma", 1300, 2000, "USD"),
            ],
        )
        self.conn.executemany(
            "INSERT INTO holdings VALUES (?, ?, ?, ?, ?, ?, ?)",
            [
                ("AAPL", "Apple", "stock", 18, 226.41, "USD", 0.62),
                ("MSFT", "Microsoft", "stock", 10, 486.18, "USD", 0.34),
                ("SPY", "S&P 500 ETF", "fund", 22, 612.20, "USD", 0.18),
                ("BTC-USD", "Bitcoin", "crypto", 0.12, 106850, "USD", -0.42),
            ],
        )
        self.conn.execute("INSERT OR REPLACE INTO meta VALUES (?, ?)", ("seed_version", DB_VERSION))
        self.conn.commit()

    def all(self, query: str, params: tuple[Any, ...] = ()) -> list[dict[str, Any]]:
        return [dict(row) for row in self.conn.execute(query, params).fetchall()]

    def one(self, query: str, params: tuple[Any, ...] = ()) -> dict[str, Any] | None:
        row = self.conn.execute(query, params).fetchone()
        return dict(row) if row else None

    def read_state(self) -> dict[str, Any]:
        pending = self.one("SELECT * FROM confirmations WHERE status = 'pending' ORDER BY created_at DESC LIMIT 1")
        if pending:
            pending = {
                "id": pending["id"],
                "payload": json.loads(pending["payload_json"]),
                "status": pending["status"],
                "summary": pending["summary"],
                "createdAt": pending["created_at"],
                "resolvedAt": pending["resolved_at"],
            }
        return {
            "accounts": self.all("SELECT * FROM accounts ORDER BY id"),
            "contacts": self.all("SELECT * FROM contacts ORDER BY trust_level, name"),
            "transactions": self.all("SELECT * FROM transactions ORDER BY created_at DESC LIMIT 20"),
            "cards": self.all("SELECT * FROM cards ORDER BY id"),
            "budgets": self.all("SELECT * FROM budgets ORDER BY id"),
            "holdings": self.all("SELECT * FROM holdings ORDER BY symbol"),
            "marketQuotes": [
                {"symbol": "AAPL", "name": "Apple", "price": 226.41, "currency": "USD", "changePercent": 0.62, "source": "seed", "updatedAt": now()},
                {"symbol": "BTC-USD", "name": "Bitcoin", "price": 106850, "currency": "USD", "changePercent": -0.42, "source": "seed", "updatedAt": now()},
            ],
            "pendingConfirmation": pending,
            "updatedAt": now(),
        }

    def parse_amount(self, text: str) -> tuple[float | None, str]:
        normalized = normalize_text(text)
        match = re.search(r"(?:usd|dolar|euro|eur|tl|try|lira|\$)?\s*(\d+(?:[.,]\d+)?)", normalized)
        currency = "USD"
        if re.search(r"\b(tl|try|lira)\b", normalized):
            currency = "TRY"
        elif re.search(r"\b(eur|euro)\b", normalized):
            currency = "EUR"
        return (float(match.group(1).replace(",", ".")) if match else None, currency)

    def resolve_contact(self, text: str) -> dict[str, Any] | None:
        normalized = normalize_text(text)
        for contact in self.all("SELECT * FROM contacts"):
            aliases = self.all("SELECT alias FROM contact_aliases WHERE contact_id = ?", (contact["id"],))
            haystack = " ".join([contact["name"], contact["relation"], *[a["alias"] for a in aliases]])
            tokens = [token for token in normalize_text(haystack).split(" ") if len(token) > 2]
            if any(token in normalized for token in tokens):
                return contact
        return None

    def account_for(self, currency: str) -> dict[str, Any] | None:
        return self.one(
            "SELECT * FROM accounts WHERE currency = ? AND type = 'checking' ORDER BY balance DESC LIMIT 1",
            (currency,),
        ) or self.one("SELECT * FROM accounts WHERE currency = 'USD' ORDER BY balance DESC LIMIT 1")

    def create_confirmation(self, payload: dict[str, Any], summary: str) -> dict[str, Any]:
        confirmation_id = f"conf-{int(time.time() * 1000)}-{random.randint(1000, 9999)}"
        self.conn.execute(
            "INSERT INTO confirmations VALUES (?, ?, 'pending', ?, ?, NULL)",
            (confirmation_id, json.dumps(payload), summary, now()),
        )
        self.conn.commit()
        return self.read_state()["pendingConfirmation"]

    def result(self, user_text: str, message: str, events: list[dict[str, str]]) -> dict[str, Any]:
        stamp = now()
        return {
            "message": message,
            "events": events,
            "state": self.read_state(),
            "transcript": [
                {"role": "user", "text": user_text, "at": stamp},
                {"role": "assistant", "text": message, "at": stamp},
            ],
        }

    def run_command(self, text: str) -> dict[str, Any]:
        normalized = normalize_text(text)
        pending = self.read_state().get("pendingConfirmation")
        if pending and re.search(r"\b(evet|onay|onayliyorum|tamam|gonder|yolla)\b", normalized):
            return self.confirm(pending["id"], True, text)
        if pending and re.search(r"\b(hayir|iptal|vazgec|dur)\b", normalized):
            return self.confirm(pending["id"], False, text)

        if re.search(r"\b(gonder|yolla|transfer|havale|eft)\b", normalized):
            contact = self.resolve_contact(text)
            amount, currency = self.parse_amount(text)
            if not contact:
                return self.result(text, "Aliciyi net bulamadim. Oglum, cocuk, anne, baba, amca, esim, kira veya okul diyebilirsiniz.", [])
            if not amount or amount <= 0:
                return self.result(text, f"{contact['name']} bulundu. Tutar soyleyin.", [])
            account = self.account_for(currency)
            if not account or account["available"] < amount:
                return self.result(text, "Bu islem icin yeterli bakiye yok.", [])
            confirmation = self.create_confirmation(
                {
                    "kind": "transfer",
                    "fromAccountId": account["id"],
                    "contactId": contact["id"],
                    "amount": amount,
                    "currency": currency,
                },
                f"{contact['name']} hesabina {format_money(amount, currency)} gonder",
            )
            return self.result(
                text,
                f"{contact['relation']} {contact['name']} hesabini buldum. {format_money(amount, currency)} gondermek icin onay bekliyorum.",
                [{"type": "bank.confirmation_required", "label": "Onay gerekiyor", "detail": confirmation["summary"]}],
            )

        if "bakiye" in normalized or re.search(r"\b(hesap|para)\b", normalized):
            accounts = self.read_state()["accounts"][:3]
            summary = ", ".join(f"{a['name']}: {format_money(a['available'], a['currency'])}" for a in accounts)
            return self.result(text, f"Guncel sandbox bakiyeleriniz: {summary}.", [{"type": "bank.tool_progress", "label": "Hesaplar okundu"}])

        return self.result(text, "Hazirim. Transfer, bakiye, kart ve piyasa komutlari verebilirsiniz.", [])

    def confirm(self, confirmation_id: str, approved: bool, user_text: str = "Onayla") -> dict[str, Any]:
        pending = self.one("SELECT * FROM confirmations WHERE id = ? AND status = 'pending'", (confirmation_id,))
        if not pending:
            return self.result(user_text, "Bu onay artik gecerli degil.", [])
        payload = json.loads(pending["payload_json"])
        if not approved:
            self.conn.execute("UPDATE confirmations SET status = 'declined', resolved_at = ? WHERE id = ?", (now(), confirmation_id))
            self.conn.commit()
            return self.result(user_text, "Islem iptal edildi. Sandbox bakiyeleri degismedi.", [])
        if payload["kind"] == "transfer":
            account = self.one("SELECT * FROM accounts WHERE id = ?", (payload["fromAccountId"],))
            contact = self.one("SELECT * FROM contacts WHERE id = ?", (payload["contactId"],))
            if not account or not contact or account["available"] < payload["amount"]:
                self.conn.execute("UPDATE confirmations SET status = 'expired', resolved_at = ? WHERE id = ?", (now(), confirmation_id))
                self.conn.commit()
                return self.result(user_text, "Islem tamamlanamadi; bakiye veya hesap uygun degil.", [])
            txn_id = f"txn-{int(time.time() * 1000)}"
            self.conn.execute(
                "UPDATE accounts SET balance = balance - ?, available = available - ? WHERE id = ?",
                (payload["amount"], payload["amount"], payload["fromAccountId"]),
            )
            self.conn.execute(
                "INSERT INTO transactions VALUES (?, 'sent', ?, ?, ?, ?, ?, ?, 'completed', 'Aile', ?, NULL)",
                (txn_id, contact["name"], contact["relation"], -payload["amount"], payload["currency"], payload["fromAccountId"], payload["contactId"], now()),
            )
            self.conn.execute("UPDATE confirmations SET status = 'approved', resolved_at = ? WHERE id = ?", (now(), confirmation_id))
            self.conn.commit()
            return self.result(user_text, f"{contact['name']} hesabina {format_money(payload['amount'], payload['currency'])} gonderildi.", [{"type": "bank.state_changed", "label": "Transfer tamamlandi", "detail": txn_id}])
        return self.result(user_text, "Bu onay turu agent-service tarafinda henuz desteklenmiyor.", [])
