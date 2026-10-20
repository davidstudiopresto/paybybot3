"""Web interface for paybybot3.

Runs a small HTTP server that wraps :class:`paybybot3.bot.Bot` and serves the
single-page app built from ``web/`` (copied into ``static/``).

Two modes:
- local (``paybybot3 web``): sessions live in this process' memory, with the
  password, so the weekly renewal can run in the background;
- hosted (``PAYBYBOT_HOSTED=1``, e.g. on Vercel): no server state; the
  PayByPhone tokens are kept in an encrypted cookie (key from
  ``PAYBYBOT_SECRET``) and the password is never stored. Weekly renewals are
  kept in Supabase (``PAYBYBOT_SUPABASE_URL`` / ``_KEY`` / ``PAYBYBOT_DB_TOKEN``)
  with an encrypted refresh token, and processed by ``/api/cron/renew``,
  called every few minutes by a scheduler.
"""

import base64
import contextvars
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
import threading
import time
import uuid
from datetime import date, datetime, time as dtime, timedelta, timezone
from zoneinfo import ZoneInfo
from pathlib import Path

import requests
from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from typing import Annotated

from . import schedule
from .bot import Bot

log = logging.getLogger("paybybot3.web")

STATIC_DIR = Path(__file__).parent / "static"
COOKIE = "pbb_session"
HOSTED = os.environ.get("PAYBYBOT_HOSTED") == "1"
SESSION_IDLE = 12 * 3600  # an unused login cookie expires after 12 hours...
SESSION_MAX = 24 * 3600  # ...and any login after 24 hours
REMEMBER = 30 * 24 * 3600  # "Se souvenir de moi": 30 days
LOGIN_LIMITS = (("ip", 50), ("user", 20))  # attempts per 15 minutes, per device and per account
PARIS = ZoneInfo("Europe/Paris")
MAIL_FROM = os.environ.get("PAYBYBOT_MAIL_FROM", "PaybyBot <contact@paybybot.fr>")
MAIL_REPLY_TO = os.environ.get("PAYBYBOT_MAIL_REPLY_TO", "contact@paybybot.fr")
APP_URL = os.environ.get("PAYBYBOT_URL", "https://paybybot.vercel.app")
RELOGIN = ("Votre connexion PayByPhone a expiré : reconnectez-vous sur PaybyBot pour relancer "
           "le renouvellement automatique.")

app = FastAPI(title="paybybot3", docs_url=None, redoc_url=None)


# --------------------------------------------------------------------------
# Demo bot: lets anyone try the interface without a PayByPhone account
# --------------------------------------------------------------------------


class DemoBot:
    """Same public surface as Bot, backed by in-memory fake data."""

    def __init__(self):
        self.sessions = []

    def get_vehicles(self):
        return [
            {"vehicleId": "v1", "licensePlate": "AB123CD", "country": "FR", "type": "Car", "archived": False},
            {"vehicleId": "v2", "licensePlate": "EF456GH", "country": "FR", "type": "Car", "archived": False},
        ]

    def get_payment_accounts(self):
        return {
            "paymentCards": [
                {"cardType": "Visa", "maskedCardNumber": "************4242", "paymentAccountId": "demo-card",
                 "paymentScope": "", "expiryMonth": 4, "expiryYear": 2028},
            ],
            "mno": [],
            "paypalAccounts": [],
        }

    def get_parking_sessions(self, licensePlate=None, locationId=None):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        self.sessions = [s for s in self.sessions if s["expireTime"] > now]
        return [
            s for s in self.sessions
            if (licensePlate is None or s["vehicle"]["licensePlate"] == licensePlate)
            and (locationId is None or s["locationId"] == locationId)
        ]

    def _get_parking_sessions(self, periodType="CURRENT", limit=50):
        return self.get_parking_sessions()

    def get_past_sessions(self, limit=20):
        return sorted(self.sessions, key=lambda x: x["startTime"], reverse=True)

    def get_rate_options(self, locationId, licensePlate):
        if not str(locationId).isdigit():
            return []
        return [  # listed first, like PayByPhone does in Paris: it must not be picked for a car
            {"name": "2 roues - Résident", "type": "Resident", "ratePolicyId": "103", "maxStayStatus": None,
             "acceptedTimeUnits": ["Days"], "parkingNotAllowedReason": None},
            {"name": "Résident", "type": "Resident", "ratePolicyId": "101", "maxStayStatus": None,
             "acceptedTimeUnits": ["Days"], "parkingNotAllowedReason": None},
            {"name": "Visiteur", "type": "Visitor", "ratePolicyId": "102", "maxStayStatus": None,
             "acceptedTimeUnits": ["Minutes", "Hours"], "parkingNotAllowedReason": None},
        ]

    def _price(self, ratePolicyId, quantity, unit):
        quantity = float(quantity)
        if str(ratePolicyId) == "101":  # Paris resident rate: 1.50 € a day, 9 € a week
            return round(9 * (quantity // 7) + 1.5 * (quantity % 7), 2)
        hours = quantity / 60 if unit == "Minutes" else quantity
        return round(4.0 * hours, 2)

    @staticmethod
    def _delta(quantity, unit):
        quantity = float(quantity)
        return {"Days": timedelta(days=quantity), "Hours": timedelta(hours=quantity)}.get(
            unit, timedelta(minutes=quantity)
        )

    def _find(self, parkingSessionId):
        return next((x for x in self.sessions if x["parkingSessionId"] == parkingSessionId), None)

    def _create_quote(self, locationId, ratePolicyId, durationQuantity, durationTimeUnit, licensePlate,
                      paymentAccountId="", operation="Start", parkingSessionId=""):
        now = datetime.now(timezone.utc)
        current = self._find(parkingSessionId) if operation == "Extend" else None
        if current:
            now = current["expireTime"].replace(tzinfo=timezone.utc)
        return {
            "quoteId": str(uuid.uuid4()),
            "cost": {"amount": self._price(ratePolicyId, durationQuantity, durationTimeUnit), "currency": "EUR"},
            "details": {
                "locationId": str(locationId),
                "parkingStartTime": now.isoformat(),
                "parkingExpiryTime": (now + self._delta(durationQuantity, durationTimeUnit)).isoformat(),
                "licensePlate": licensePlate,
            },
        }

    def pay(self, durationQuantity, durationTimeUnit, licensePlate, locationId, ratePolicyId, paymentAccountId):
        time.sleep(1.2)
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        cost = self._price(ratePolicyId, durationQuantity, durationTimeUnit)
        session = {
            "parkingSessionId": str(uuid.uuid4()),
            "locationId": str(locationId),
            "startTime": now,
            "expireTime": now + self._delta(durationQuantity, durationTimeUnit),
            "vehicle": {"licensePlate": licensePlate},
            "ratePolicy": {"ratePolicyId": str(ratePolicyId)},
            "totalCost": {"amount": cost, "currency": "EUR"},
            "isRenewable": True,
        }
        self.sessions.append(session)
        return {"parkingSessionId": session["parkingSessionId"], "cost": session["totalCost"],
                "expireTime": session["expireTime"].isoformat()}

    def extend(self, parkingSessionId, durationQuantity, durationTimeUnit, licensePlate, locationId, ratePolicyId,
               paymentAccountId):
        time.sleep(1.2)
        current = self._find(parkingSessionId)
        cost = self._price(ratePolicyId, durationQuantity, durationTimeUnit)
        current["expireTime"] += self._delta(durationQuantity, durationTimeUnit)
        current["totalCost"] = {"amount": round(current["totalCost"]["amount"] + cost, 2), "currency": "EUR"}
        return {"parkingSessionId": parkingSessionId, "cost": {"amount": cost, "currency": "EUR"},
                "expireTime": current["expireTime"].isoformat()}


# --------------------------------------------------------------------------
# Sessions (one per browser) and the automatic renewal ("autopilot")
# --------------------------------------------------------------------------


def login_candidates(username):
    """PayByPhone wants phone numbers in international format; people type 06 12 34 56 78."""
    raw = username.strip()
    if "@" in raw:
        return [raw]
    digits = re.sub(r"[\s.\-()]", "", raw)
    candidates = []
    if re.fullmatch(r"0[1-9]\d{8}", digits):  # French national format
        candidates += ["+33" + digits[1:], "+33" + digits]
    elif re.fullmatch(r"(00)?33\d{9,10}", digits):
        candidates.append("+" + digits.lstrip("0"))
    candidates += [digits, raw]
    return list(dict.fromkeys(c for c in candidates if c))


def connect(username, password):
    """Log in, trying the usual phone formats; returns (bot, username that worked)."""
    error = None
    for candidate in login_candidates(username):
        try:
            return Bot(candidate, password), candidate
        except requests.HTTPError as e:
            if e.response is None or e.response.status_code != 400:
                raise
            error = e
    raise error


class UserSession:
    def __init__(self, username, password, demo=False):
        self.username = username
        self._password = password
        self.demo = demo
        self.lock = threading.Lock()
        if demo:
            self.bot = DemoBot()
        else:
            self.bot, self.username = connect(username, password)
        self.autopilots = {}  # id -> dict
        self.account = {}  # e-mail and home zone (hosted accounts live in the database instead)
        self.history = []  # most recent first
        self.attempts = []  # every real payment request, for diagnosis
        self.unconfirmed = {}  # (plate, location) -> time of an unconfirmed payment

    def to_state(self):
        """What the hosted mode keeps in the encrypted cookie: never the password."""
        state = {"u": self.username, "d": self.demo, "iat": getattr(self, "issued_at", int(time.time())),
                 "rm": getattr(self, "remember", False),
                 "uc": [[plate, location, at] for (plate, location), at in self.unconfirmed.items()]}
        if self.demo:
            state["s"] = [{**x, "startTime": x["startTime"].isoformat(), "expireTime": x["expireTime"].isoformat()}
                          for x in self.bot.sessions]
            state["ap"] = list(self.autopilots.values())
            state["acc"] = self.account
        else:
            state["t"] = self.bot.authorization
            state["r"] = getattr(self.bot, "refresh_token", None)
        return state

    @classmethod
    def from_state(cls, state):
        self = cls.__new__(cls)
        self.username, self._password, self.demo = state["u"], None, state["d"]
        self.remember = state.get("rm", False)
        self.lock = threading.Lock()
        if self.demo:
            self.bot = DemoBot()
            self.bot.sessions = [{**x, "startTime": datetime.fromisoformat(x["startTime"]),
                                  "expireTime": datetime.fromisoformat(x["expireTime"])} for x in state.get("s", [])]
        else:
            self.bot = Bot.__new__(Bot)
            self.bot.authorization = state["t"]
            self.bot.refresh_token = state.get("r")
        self.autopilots = {ap["id"]: ap for ap in state.get("ap", [])}
        self.account = state.get("acc", {})
        self.history, self.attempts = [], []
        self.unconfirmed = {(plate, location): at for plate, location, at in state.get("uc", [])}
        return self

    @classmethod
    def for_bot(cls, bot, username=""):
        """A session around an already logged-in bot (background renewals)."""
        self = cls.__new__(cls)
        self.username, self._password, self.demo = username, None, False
        self.lock = threading.Lock()
        self.bot = bot
        self.autopilots, self.history, self.attempts, self.unconfirmed = {}, [], [], {}
        self.account = {}
        return self

    def call(self, method, *args, **kwargs):
        """Call a bot method, logging in again once if the token expired."""
        with self.lock:
            try:
                return getattr(self.bot, method)(*args, **kwargs)
            except requests.HTTPError as e:
                if e.response is None or e.response.status_code != 401 or self.demo:
                    raise
                if self._password is None:  # hosted mode: the password is not kept, the refresh token is
                    refresh = getattr(self.bot, "refresh_token", None)
                    if not refresh:
                        raise HTTPException(401, "Votre session PayByPhone a expiré, reconnectez-vous.")
                    try:
                        self.bot = Bot.from_refresh_token(refresh)
                    except Exception:
                        raise HTTPException(401, "Votre session PayByPhone a expiré, reconnectez-vous.")
                    return getattr(self.bot, method)(*args, **kwargs)
                self.bot = Bot(self.username, self._password)
                return getattr(self.bot, method)(*args, **kwargs)

    def log(self, kind, message):
        self.history.insert(0, {"at": datetime.now(timezone.utc).isoformat(), "kind": kind, "message": message})
        del self.history[50:]


SESSIONS = {}


# In hosted mode, the sessions loaded during a request, so the middleware can write them back.
_loaded = contextvars.ContextVar("pbb_loaded", default=None)


def _secrets():
    """Current secret first; PAYBYBOT_SECRET_OLD lets data sealed with the previous one still be read."""
    current_secret = os.environ.get("PAYBYBOT_SECRET") or (None if HOSTED else _local_secret())
    if not current_secret:
        raise RuntimeError("PAYBYBOT_SECRET is not set")
    return [x for x in (current_secret, os.environ.get("PAYBYBOT_SECRET_OLD")) if x]


def _local_secret():
    """On a personal computer: a key made once and kept next to the config, readable by this user only.
    It seals the "Se souvenir de moi" cookie, so a restart of PaybyBot does not log out."""
    path = Path("~/.config/paybybot3-web.key").expanduser()
    if not path.exists():
        path.parent.mkdir(parents=True, exist_ok=True)
        fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        with os.fdopen(fd, "w") as f:
            f.write(secrets.token_urlsafe(32))
    return path.read_text().strip()


def _subkey(secret, purpose):
    """Separate keys per use, so one leaked key does not unlock the others."""
    return hashlib.sha256(("paybybot:%s:%s" % (purpose, secret)).encode()).digest()


def _fernet(purpose="cookie"):
    from cryptography.fernet import Fernet, MultiFernet

    return MultiFernet([Fernet(base64.urlsafe_b64encode(_subkey(x, purpose))) for x in _secrets()])


def seal(session):
    state = session.to_state()
    state.setdefault("iat", int(time.time()))
    return _fernet().encrypt(json.dumps(state).encode()).decode()


def current(token):
    if HOSTED:
        try:
            state = json.loads(_fernet().decrypt((token or "").encode(), ttl=REMEMBER))
            idle, most = (REMEMBER, REMEMBER) if state.get("rm") else (SESSION_IDLE, SESSION_MAX)
            if time.time() - _fernet().extract_timestamp((token or "").encode()) > idle:
                raise ValueError("idle too long")
            if time.time() - state.get("iat", 0) > most:
                raise ValueError("login too old")
            session = UserSession.from_state(state)
            session.issued_at = state["iat"]
        except Exception:
            raise HTTPException(401, "Session expirée, reconnectez-vous.")
        holder = _loaded.get()
        if holder is not None:
            holder.append(session)
        return session
    session = SESSIONS.get(token or "")
    if session is None and token and len(token) > 60:  # "Se souvenir de moi": sealed, survives a restart
        try:
            state = json.loads(_fernet().decrypt(token.encode(), ttl=REMEMBER))
            if not state.get("rm") or time.time() - state.get("iat", 0) > REMEMBER:
                raise ValueError("not remembered")
            session = SESSIONS[token] = UserSession.from_state(state)
            session.issued_at = state["iat"]
        except Exception:
            session = None
    if session is None:
        raise HTTPException(401, "Session expirée, reconnectez-vous.")
    return session


def set_session_cookie(response, value, remember=False):
    """A browser-session cookie, or a 30-day one with "Se souvenir de moi"."""
    response.set_cookie(COOKIE, value, httponly=True, samesite="strict", secure=HOSTED, path="/",
                        max_age=REMEMBER if remember else None)


SECURITY_HEADERS = {
    # Only our own scripts, styles, fonts and API (plus Cloudflare's human check); never shown inside another site's frame (clickjacking).
    "Content-Security-Policy": "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; "
                               "style-src 'self' 'unsafe-inline'; frame-src https://challenges.cloudflare.com; "
                               "img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; "
                               "base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
    "X-Frame-Options": "DENY",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",  # origin only: Cloudflare's human check needs our domain
    "Permissions-Policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    "Cross-Origin-Opener-Policy": "same-origin",
}


def same_origin(request):
    """State-changing calls must come from PaybyBot's own pages."""
    origin = request.headers.get("origin")
    if origin:
        return origin.split("://", 1)[-1] == request.headers.get("host")
    return request.headers.get("sec-fetch-site") in (None, "same-origin", "none")


@app.middleware("http")
async def persist_session(request: Request, call_next):
    """Origin check, security headers, and (hosted) writing back what a request changed."""
    from fastapi.responses import JSONResponse

    if (request.method not in ("GET", "HEAD", "OPTIONS") and request.url.path.startswith("/api/")
            and request.url.path != "/api/cron/renew" and not same_origin(request)):
        return JSONResponse({"detail": "Requête refusée."}, status_code=403, headers=SECURITY_HEADERS)
    holder = []
    _loaded.set(holder)
    response = await call_next(request)
    if HOSTED and holder and response.status_code != 401 and not getattr(holder[-1], "logged_out", False):
        set_session_cookie(response, seal(holder[-1]), getattr(holder[-1], "remember", False))
    for name, value in SECURITY_HEADERS.items():
        response.headers.setdefault(name, value)
    if HOSTED:
        response.headers.setdefault("Strict-Transport-Security", "max-age=63072000; includeSubDomains")
    if request.url.path.startswith("/api/"):
        response.headers.setdefault("Cache-Control", "no-store")
    return response


RESIDENT_RATE = re.compile(r"r[ée]sid|riverain", re.I)
TWO_WHEELS = re.compile(r"2\s*roues|deux[\s-]*roues|moto|scooter|two[\s-]*wheel", re.I)


def friendly_error(e):
    """Turn a technical exception into a message a non-technical user can act on."""
    text = str(e)
    if isinstance(e, requests.HTTPError) and e.response is not None:
        if e.response.status_code in (400, 401):
            return "Identifiant ou mot de passe PayByPhone incorrect."
        return "PayByPhone ne répond pas correctement (erreur %s). Réessayez dans un instant." % e.response.status_code
    if isinstance(e, requests.ConnectionError):
        return "Impossible de joindre PayByPhone. Vérifiez votre connexion internet."
    if "Quote error" in text:
        log.info("quote refused: %s", re.sub(r'"licensePlate": "[^"]*"', '"licensePlate": "…"', text)[:400])
        if "VehicleAlreadyParked" in text:
            return "Un ticket est déjà en cours pour ce véhicule : PayByPhone n'en accepte pas un second en même temps."
        if "PbpParkingNotAllowed" in text:
            return ("PayByPhone n'autorise pas ce stationnement pour ce véhicule dans cette zone. "
                    "Pour le tarif résident, vérifiez que c'est bien la zone de votre carte résident.")
        return "PayByPhone refuse ce stationnement (zone, tarif ou durée non autorisés)."
    if "Payment job failed" in text:
        return "Le paiement a été refusé. Vérifiez votre moyen de paiement dans l'application PayByPhone."
    if "GraphQL error" in text:  # never show PayByPhone's raw answer
        if "getRateOptions" in text:
            return "PayByPhone ne trouve pas de tarif pour ce véhicule dans cette zone. Vérifiez le numéro de zone."
        return "PayByPhone a renvoyé une erreur. Réessayez dans un instant."
    return "Une erreur est survenue : " + text[:200]


def iso(d):
    """PayByPhone times are UTC; make that explicit so browsers don't read them as local time."""
    if isinstance(d, str):
        try:
            d = datetime.fromisoformat(d.replace("Z", "+00:00"))
        except ValueError:
            return d
    if isinstance(d, datetime):
        return (d if d.tzinfo else d.replace(tzinfo=timezone.utc)).isoformat()
    return d


def serialize_session(s):
    return {
        "id": s.get("parkingSessionId"),
        "location": s.get("locationId"),
        "plate": (s.get("vehicle") or {}).get("licensePlate"),
        "start": iso(s.get("startTime")),
        "expire": iso(s.get("expireTime")),
        "rate": (s.get("ratePolicy") or {}).get("ratePolicyId"),
        "cost": s.get("totalCost"),
    }


def normalize_accounts(accounts):
    result = []
    for card in accounts.get("paymentCards") or []:
        masked = card.get("maskedCardNumber") or ""
        label = "%s •••• %s" % (card.get("cardType") or "Carte", masked[-4:])
        if card.get("expiryMonth") and card.get("expiryYear"):
            label += " — exp. %02d/%s" % (int(card["expiryMonth"]), str(card["expiryYear"])[-2:])
        result.append({"id": card["paymentAccountId"], "label": label, "kind": "card"})
    for acc in accounts.get("mno") or []:
        result.append({"id": acc["paymentAccountId"], "label": "Facture opérateur %s" % (acc.get("operator") or ""),
                       "kind": "phone"})
    for acc in accounts.get("paypalAccounts") or []:
        result.append({"id": acc["paymentAccountId"], "label": "PayPal", "kind": "paypal"})
    return result


class Unconfirmed(Exception):
    """PayByPhone accepted the payment request but no parking session showed up."""


UNCONFIRMED = ("PayByPhone n'a pas confirmé ce stationnement. Vérifiez dans l'application PayByPhone "
               "avant de réessayer, pour ne pas payer deux fois.")


def pay_and_confirm(session, location, rate, duration, unit, plate, paymentAccountId, attempts=10, delay=3):
    """Pay, then poll the current sessions like the CLI does: success only once PayByPhone lists it."""
    log.info("pay: zone=%s rate=%s %s %s plate=%s demo=%s", location, rate, duration, unit, plate[:2] + "***",
             session.demo)
    try:
        result = session.call("pay", durationQuantity=duration, durationTimeUnit=unit, licensePlate=plate,
                              locationId=location, ratePolicyId=rate, paymentAccountId=paymentAccountId)
    except Exception as e:
        log.warning("pay: PayByPhone refused: %s", str(e)[:1000])
        raise
    log.info("pay: PayByPhone answered quoteId=%s parkingSessionId=%s jobId=%s jobStatus=%s cost=%s",
             result.get("quoteId"), result.get("parkingSessionId"), result.get("jobId"), result.get("jobStatus"),
             result.get("cost"))
    session.attempts.append({"at": datetime.now(timezone.utc).isoformat(), "location": location, "plate": plate,
                             **{k: result.get(k) for k in ("quoteId", "parkingSessionId", "jobId", "jobStatus")}})
    for i in range(attempts):
        found = session.call("get_parking_sessions", licensePlate=plate, locationId=location)
        if found:
            log.info("pay: confirmed after %s check(s)", i + 1)
            return result, found
        if not session.demo:
            time.sleep(delay)
    log.warning("pay: no session visible for zone=%s after %ss (jobStatus=%s)", location, attempts * delay,
                result.get("jobStatus"))
    session.unconfirmed[(plate, location)] = time.time()
    log_diagnosis(session)
    raise Unconfirmed(UNCONFIRMED)


def diagnosis(session):
    """Unfiltered current sessions and the state of every payment job: no card data in there."""
    report = {"sessions": [], "jobs": []}
    for x in session.call("_get_parking_sessions"):
        report["sessions"].append({
            "id": x.get("parkingSessionId"), "status": x.get("status"), "type": x.get("type"),
            "locationId": x.get("locationId"), "plate": (x.get("vehicle") or {}).get("licensePlate"),
            "start": iso(x.get("startTime")), "expire": iso(x.get("expireTime")), "cost": x.get("totalCost"),
        })
    for a in session.attempts:
        job = None
        if a.get("jobId") and not session.demo:
            try:
                job = session.call("_get_job", a["jobId"])
            except Exception as e:
                job = {"error": str(e)[:300]}
        report["jobs"].append({**a, "job": job})
    return report


def log_diagnosis(session):
    try:
        log.warning("diagnosis: %s", json.dumps(diagnosis(session), default=str))
    except Exception as e:
        log.warning("diagnosis failed: %s", e)


def parse_dt(value):
    if not value:
        return None
    dt = value if isinstance(value, datetime) else datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    return dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)


def paused_now(paused_from, paused_until, now=None):
    """A pause runs from paused_from (included) to paused_until (excluded, None = no end yet)."""
    now = now or datetime.now(timezone.utc)
    start, end = parse_dt(paused_from), parse_dt(paused_until)
    return bool(start) and start <= now and (end is None or now < end)


def pause_bounds(first_day, last_day):
    """Dates picked in the interface are Paris days: from first_day 00:00 to the day after last_day 00:00."""
    start = datetime.combine(date.fromisoformat(first_day), dtime(0), PARIS)
    end = datetime.combine(date.fromisoformat(last_day) + timedelta(days=1), dtime(0), PARIS) if last_day else None
    if end and end <= start:
        raise HTTPException(422, "La date de fin doit être après la date de début.")
    return start.astimezone(timezone.utc).isoformat(), end.astimezone(timezone.utc).isoformat() if end else None


def paris_text(value):
    dt = parse_dt(value)
    if not dt:
        return ""
    local = dt.astimezone(PARIS)
    days = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]
    months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
              "novembre", "décembre"]
    return "%s %d %s à %s" % (days[local.weekday()], local.day, months[local.month - 1], local.strftime("%H:%M"))


def plate_text(plate):
    return "%s-%s-%s" % (plate[:2], plate[2:5], plate[5:]) if re.fullmatch(r"[A-Z]{2}\d{3}[A-Z]{2}", plate or "") else plate


def money_text(cost):
    if not cost or cost.get("amount") is None:
        return ""
    return ("%.2f €" % float(cost["amount"])).replace(".", ",")


RENEWAL_FOOTER = ("Vous recevez cet e-mail parce que vous avez activé le renouvellement automatique sur PaybyBot. Pour ne "
                  "plus en recevoir, retirez votre adresse ou arrêtez le renouvellement depuis l'application.")


SITE_URL = "https://paybybot.fr"


def email_html(title, lines, button=None, footer=RENEWAL_FOOTER, code=None):
    """The PaybyBot look for transactional e-mails: logo, white card, blue button, legal footer."""
    from html import escape

    font = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif"
    def paragraphs(xs):
        return "".join('<p style="margin:0 0 14px;font-size:16px;line-height:1.55;color:#3d4350">%s</p>' % escape(x)
                       for x in xs)

    body = paragraphs(lines)
    if code:  # the code stands out, right after the sentence that introduces it
        body = paragraphs(lines[:1]) + (
            '<p style="margin:6px 0 18px;padding:18px 0;border-radius:12px;background:#f1f4fb;text-align:center;'
            'font-size:34px;font-weight:700;letter-spacing:8px;color:#111111">%s</p>' % escape(code)) + paragraphs(lines[1:])
    cta = ('<p style="margin:22px 0 4px"><a href="%s" style="display:inline-block;background:#1d4ea3;'
           'background-image:linear-gradient(90deg,#1d4ea3,#2a66d1);color:#ffffff;padding:13px 22px;border-radius:12px;'
           'font-size:16px;font-weight:700;text-decoration:none">%s</a></p>'
           % (escape(button[1]), escape(button[0]))) if button else ""
    return (
        '<div style="margin:0;padding:32px 16px;background:#ffffff;%s">'
        '<div style="max-width:520px;margin:0 auto">'
        '<p style="margin:0 0 18px 4px"><a href="%s" style="text-decoration:none">'
        '<img src="%s/brand/paybybot-logo.png" width="120" alt="PaybyBot" style="display:block;border:0;height:auto"></a></p>'
        '<div style="background:#ffffff;border:1px solid #e6e8ee;border-radius:16px;padding:32px 28px">'
        '<h1 style="margin:0 0 16px;font-size:23px;line-height:1.25;letter-spacing:-0.3px;color:#111111">%s</h1>%s%s'
        "</div>"
        '<p style="margin:20px 4px 0;font-size:12.5px;line-height:1.55;color:#7a8091">%s</p>'
        '<p style="margin:10px 4px 0;font-size:12.5px;line-height:1.55;color:#7a8091">'
        'PaybyBot · Studio Presto · <a href="mailto:%s" style="color:#7a8091">%s</a> · '
        '<a href="%s" style="color:#7a8091">paybybot.fr</a><br>PaybyBot est un service indépendant de PayByPhone.</p>'
        "</div></div>"
        % (font, SITE_URL, SITE_URL, escape(title), body, cta, escape(footer), MAIL_REPLY_TO, MAIL_REPLY_TO, SITE_URL)
    )


def send_email(to, subject, title, lines, button=None, footer=RENEWAL_FOOTER, code=None):
    """Transactional e-mail through Resend. Silently skipped without an address or an API key."""
    key = os.environ.get("RESEND_API_KEY")
    if not to or not key:
        return False
    html = email_html(title, lines, button, footer, code)
    text = "\n\n".join([title] + list(lines[:1]) + ([code] if code else []) + list(lines[1:])
                         + ([button[0] + " : " + button[1]] if button else []))
    try:
        r = requests.post("https://api.resend.com/emails", timeout=10,
                          headers={"Authorization": "Bearer " + key, "Content-Type": "application/json"},
                          json={"from": MAIL_FROM, "to": [to], "reply_to": MAIL_REPLY_TO, "subject": subject,
                                "html": html, "text": text})
        log.info("e-mail '%s': %s", title, r.status_code)  # the title, never the address nor a code from the subject
        if not r.ok:
            log.warning("e-mail refused by Resend: %s", r.text[:200])
        return r.ok
    except Exception as e:
        log.warning("e-mail '%s' failed: %s", title, e)
        return False


def notify(details, event, **info):
    """One message per renewal event; the address lives only in the encrypted details."""
    to = (details or {}).get("email")
    if not to:
        return
    car = "%s, zone %s" % (plate_text(details.get("plate")), details.get("location"))
    open_app = ("Ouvrir PaybyBot", APP_URL)
    rule = rule_of(details)
    if event == "activated" and rule:
        lines = ["Les tickets automatiques sont activés pour %s, %s." % (car, rule_text(rule))]
        if info.get("expire"):
            lines.append("Un ticket couvre déjà votre véhicule jusqu'au %s." % paris_text(info["expire"]))
        if info.get("next"):
            lines.append("Prochain ticket : %s." % paris_text(info["next"]))
        lines.append("Rien n'est payé les dimanches et jours fériés, gratuits à Paris.")
        send_email(to, "Tickets automatiques activés · %s" % plate_text(details.get("plate")),
                   "Tickets automatiques activés", lines, open_app)
    elif event == "activated":
        lines = ["Le renouvellement automatique de votre forfait résident est activé pour %s." % car]
        if info.get("expire"):
            lines.append("Votre véhicule est couvert jusqu'au %s. Le forfait suivant sera payé automatiquement à "
                         "cette date." % paris_text(info["expire"]))
        send_email(to, "Renouvellement activé · %s" % plate_text(details.get("plate")), "Renouvellement activé",
                   lines, open_app)
    elif event == "paid":
        send_email(to, "Forfait renouvelé · %s" % plate_text(details.get("plate")), "Forfait renouvelé",
                   ["Un nouveau forfait de %s a été payé automatiquement pour %s%s." % (
                       duration_text(details.get("duration"), details.get("unit")),
                       car, (" (%s)" % money_text(info.get("cost"))) if money_text(info.get("cost")) else ""),
                    "Valable jusqu'au %s." % paris_text(info.get("expire")),
                    "Le ticket apparaît aussi dans votre application PayByPhone."]
                   + (["Prochain ticket : %s." % paris_text(info["next"])] if info.get("next") else []), open_app)
    elif event == "paused":
        until = ("jusqu'au %s inclus" % info["until_day"]) if info.get("until_day") else "sans date de fin"
        send_email(to, "Renouvellement en pause · %s" % plate_text(details.get("plate")), "Renouvellement en pause",
                   ["Aucun forfait ne sera payé pour %s à partir du %s, %s." % (car, info.get("from_day"), until),
                    "Un ticket déjà en cours reste valable jusqu'à sa fin."], open_app)
    elif event == "problem":
        send_email(to, "Action requise · renouvellement %s" % plate_text(details.get("plate")),
                   "Le renouvellement a besoin de vous",
                   ["Le renouvellement automatique pour %s n'a pas pu payer :" % car, info.get("message", ""),
                    "Ouvrez PaybyBot pour le relancer, et vérifiez votre stationnement dans l'application PayByPhone."],
                   open_app)


DAY_NAMES = ["lundi", "mardi", "mercredi", "jeudi", "vendredi", "samedi", "dimanche"]


def rule_of(details):
    """The "precise days" rule of a renewal, or None for the continuous weekly renewal."""
    days = (details or {}).get("days")
    if not days:
        return None
    return {"days": sorted({int(d) for d in days}), "start": details.get("start") or schedule.DEFAULT_START,
            "unit": details.get("unit"), "duration": details.get("duration")}


def duration_text(duration, unit):
    n = fmt_qty(float(duration or 0))
    word = {"Days": "jour", "Hours": "heure", "Minutes": "minute"}.get(unit, unit)
    return "%s %s%s" % (str(n).replace(".", ","), word, "s" if float(n) > 1 else "")


def rule_text(rule):
    """'chaque samedi', 'du mardi au vendredi'... with the time the ticket is taken."""
    days = rule["days"]
    if len(days) > 2 and days == list(range(days[0], days[-1] + 1)):
        when = "du %s au %s" % (DAY_NAMES[days[0]], DAY_NAMES[days[-1]])
    else:
        names = [DAY_NAMES[d] for d in days]
        when = "chaque " + (names[0] if len(names) == 1 else ", ".join(names[:-1]) + " et " + names[-1])
    h, m = rule["start"].split(":")
    start = "%dh%s" % (int(h), "" if m == "00" else m)
    if rule.get("unit") == "Days":
        return "%s, ticket d'une journée pris à %s" % (when, start)
    return "%s, ticket de %s pris à %s" % (when, duration_text(rule.get("duration"), rule.get("unit")), start)


def same_plate(a, b):
    return re.sub(r"[^0-9A-Z]", "", (a or "").upper()) == re.sub(r"[^0-9A-Z]", "", (b or "").upper())


def running_for(session, plate):
    """Tickets running now for this car, in any zone: PayByPhone refuses a second one at the same time
    (VehicleAlreadyParked), so a renewal waits for the end of whichever is running."""
    now = datetime.now(timezone.utc)
    return [x for x in session.call("get_parking_sessions")
            if same_plate((x.get("vehicle") or {}).get("licensePlate"), plate)
            and (parse_dt(x.get("expireTime")) or now) > now]


def covered_until(active):
    return max((x["expireTime"] for x in active), default=None)


def run_autopilot(session, ap, now=None):
    """Pay for the configured parking if no session is active right now (and, for precise days, if it is time)."""
    now = now or datetime.now(timezone.utc)
    rule = rule_of(ap)
    if rule:
        due, _ = schedule.decide(rule, now, ap.get("pausedFrom"), ap.get("pausedUntil"), ap.get("lastPayment"))
        ap["lastCheck"] = now.isoformat()
        if not due:
            return
    elif paused_now(ap.get("pausedFrom"), ap.get("pausedUntil")):
        ap["lastCheck"] = now.isoformat()
        return
    active = running_for(session, ap["plate"])
    ap["lastCheck"] = datetime.now(timezone.utc).isoformat()
    if rule and active:
        due, _ = schedule.decide(rule, now, ap.get("pausedFrom"), ap.get("pausedUntil"), ap.get("lastPayment"),
                                 covered_until(active))
        if not due:
            return
    if active:
        return
    try:
        pay_and_confirm(session, ap["location"], ap["rate"], ap["duration"], ap["unit"], ap["plate"],
                        ap["paymentAccountId"])
        ap["lastPayment"] = now.isoformat()
        ap["lastError"] = None
        session.log("success", "Renouvellement automatique : zone %s, %s" % (ap["location"], ap["plate"]))
    except Unconfirmed:
        # Never retry blindly: the payment may have gone through, retrying could pay twice.
        ap["enabled"] = False
        ap["lastError"] = UNCONFIRMED + " Renouvellement suspendu."
        session.log("error", ap["lastError"])
    except Exception as e:
        ap["lastError"] = friendly_error(e)
        session.log("error", "Renouvellement automatique échoué (zone %s) : %s" % (ap["location"], ap["lastError"]))


def autopilot_loop():
    while True:
        for session in list(SESSIONS.values()):
            for ap in list(session.autopilots.values()):
                if ap["enabled"]:
                    try:
                        run_autopilot(session, ap)
                    except Exception as e:
                        ap["lastError"] = friendly_error(e)
        time.sleep(60)


@app.on_event("startup")
def start_autopilot():
    if not HOSTED:  # a serverless deployment has no long-running process
        threading.Thread(target=autopilot_loop, daemon=True).start()


# --------------------------------------------------------------------------
# Hosted weekly renewals (Supabase + scheduler)
# --------------------------------------------------------------------------


def owner_id(username):
    """Stable id of a PayByPhone account that does not reveal the phone number."""
    return hmac.new(_subkey(_secrets()[0], "owner"), username.encode(), hashlib.sha256).hexdigest()


def encrypt_credential(refresh_token):
    return _fernet("credential").encrypt(refresh_token.encode()).decode()


def decrypt_credential(value):
    return _fernet("credential").decrypt(value.encode()).decode()


RENEWAL_FIELDS = ("label", "plate", "location", "rate", "duration", "unit", "payment_account_id", "email", "days",
                  "start")


def encrypt_details(details):
    """Plate, zone, rate... are stored encrypted too: the database alone reveals nothing usable."""
    return _fernet("renewal").encrypt(json.dumps({k: details.get(k, "") for k in RENEWAL_FIELDS}).encode()).decode()


def with_details(row):
    """Database row (encrypted data) -> row with its details in clear."""
    return {**row, **json.loads(_fernet("renewal").decrypt(row["data"].encode()))}


ACCOUNT_FIELDS = ("email", "zone", "trial_start", "plan", "stripe_customer", "stripe_subscription",
                  "weekly_cents", "price_zone", "billed_weekly_cents")
TRIAL_DAYS = 30  # one free month for every new account


def load_account(s):
    """The PaybyBot account of a session: e-mail given at sign-up and home zone added by hand."""
    if HOSTED and not s.demo:
        data = store("account_get", p_owner=owner_id(s.username))
        return json.loads(_fernet("account").decrypt(data.encode())) if data else {}
    return dict(s.account)


def has_account(s):
    """Signed up already: an account, or renewals stored before accounts existed."""
    if load_account(s):
        return True
    return bool(HOSTED and not s.demo and store("renewal_list", p_owner=owner_id(s.username)))


def account_by_owner(owner):
    """The stored account of an owner id, without a session (scheduler, e-mail links)."""
    data = store("account_get", p_owner=owner)
    return json.loads(_fernet("account").decrypt(data.encode())) if data else {}


def save_account_by_owner(owner, patch):
    account = {**account_by_owner(owner), **{k: v for k, v in patch.items() if k in ACCOUNT_FIELDS}}
    store("account_save", p_owner=owner, p_data=_fernet("account").encrypt(json.dumps(account).encode()).decode())
    return account


def save_account(s, patch):
    account = {**load_account(s), **{k: v for k, v in patch.items() if k in ACCOUNT_FIELDS}}
    if HOSTED and not s.demo:
        store("account_save", p_owner=owner_id(s.username),
              p_data=_fernet("account").encrypt(json.dumps(account).encode()).decode())
    else:
        s.account = account
    return account


def check_login_rate(request, username):
    """Hosted: refuse bursts of login attempts (password guessing through PaybyBot)."""
    ip = request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    keys = {"ip": hmac.new(_subkey(_secrets()[0], "rate"), ip.encode(), hashlib.sha256).hexdigest(),
            "user": owner_id(username.strip().lower())}
    for kind, limit in LOGIN_LIMITS:
        if not store("rate_hit", p_key=kind + ":" + keys[kind], p_window_seconds=900, p_max=limit):
            log.warning("login rate limit hit (%s)", kind)
            raise HTTPException(429, "Trop de tentatives de connexion. Réessayez dans 15 minutes.")


TURNSTILE_VERIFY = "https://challenges.cloudflare.com/turnstile/v0/siteverify"


def turnstile_site_key():
    """Hosted, with both Cloudflare Turnstile keys set: sign-up and logins need a human check. Else ""."""
    site, secret = os.environ.get("TURNSTILE_SITE_KEY", "").strip(), os.environ.get("TURNSTILE_SECRET_KEY", "").strip()
    return site if HOSTED and site and secret else ""


def check_human(request, token):
    """Refuse the request unless Cloudflare confirms the Turnstile token (single use) came from a person."""
    if not turnstile_site_key():
        return
    if not token:
        raise HTTPException(400, "Vérification anti-robot manquante. Rechargez la page et réessayez.")
    ip = request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    try:
        r = requests.post(TURNSTILE_VERIFY, timeout=10, data={
            "secret": os.environ["TURNSTILE_SECRET_KEY"].strip(), "response": token, **({"remoteip": ip} if ip else {})})
        result = r.json()
    except Exception as e:
        log.warning("human check unavailable: %s", type(e).__name__)
        raise HTTPException(503, "La vérification anti-robot ne répond pas. Réessayez dans un instant.")
    if not result.get("success"):
        log.warning("human check refused: %s", result.get("error-codes"))
        raise HTTPException(400, "La vérification anti-robot a échoué. Réessayez.")


def cron_authorized(request):
    """The scheduler sends a bearer token: Supabase's (checked by its SHA-256) or Vercel Cron's CRON_SECRET."""
    auth = request.headers.get("authorization") or ""
    token = auth[7:] if auth.lower().startswith("bearer ") else ""
    if not token:
        return False
    expected_hash = os.environ.get("PAYBYBOT_CRON_TOKEN_SHA256", "")
    if expected_hash and hmac.compare_digest(hashlib.sha256(token.encode()).hexdigest(), expected_hash):
        return True
    vercel_secret = os.environ.get("CRON_SECRET", "")
    return bool(vercel_secret) and hmac.compare_digest(token, vercel_secret)


def store(fn, **params):
    """Call one of the renewal_* database functions (see the Supabase migration)."""
    r = requests.post(
        os.environ["PAYBYBOT_SUPABASE_URL"].rstrip("/") + "/rest/v1/rpc/" + fn,
        headers={"apikey": os.environ["PAYBYBOT_SUPABASE_KEY"], "Content-Type": "application/json"},
        json={"p_token": os.environ["PAYBYBOT_DB_TOKEN"], **params},
        timeout=15,
    )
    r.raise_for_status()
    return r.json() if r.content else None


def stored_to_autopilot(row):
    """Database row -> the shape the interface already uses for renewals."""
    row = with_details(row)
    return {
        "id": row["id"], "label": row.get("label") or "", "plate": row["plate"], "location": row["location"],
        "rate": row["rate"], "duration": fmt_qty(row["duration"]), "unit": row["unit"],
        "paymentAccountId": row["payment_account_id"], "enabled": row["enabled"],
        "lastCheck": row.get("last_check"), "lastPayment": row.get("last_payment"), "lastError": row.get("last_error"),
        "email": row.get("email") or "", "pausedFrom": row.get("paused_from"), "pausedUntil": row.get("paused_until"),
        "days": row.get("days") or None, "start": row.get("start") or None,
    }


def with_next_ticket(ap):
    """Adds when the next ticket of a "precise days" renewal will be taken (for display)."""
    rule = rule_of(ap)
    nxt = rule and schedule.next_ticket(rule, datetime.now(timezone.utc), ap.get("pausedFrom"), ap.get("pausedUntil"))
    return {**ap, "nextTicket": nxt.astimezone(timezone.utc).isoformat() if nxt else None}


def utc_iso(dt):
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def process_renewal(row, refresh_token=None):
    """Check one stored renewal and pay for it if no session is active. Never raises."""
    now = datetime.now(timezone.utc)
    patch = {}
    try:
        row = with_details(row)
    except Exception as e:
        log.warning("renewal %s: unreadable details: %s", row.get("id"), e)
        store("renewal_update", p_id=row["id"], p_patch={"enabled": False, "last_error": RELOGIN})
        return "unreadable"
    previous_error = row.get("last_error")
    rule = rule_of(row)
    if rule:
        # Precise days: no PayByPhone login at all outside the ticket windows.
        due, next_check = schedule.decide(rule, now, row.get("paused_from"), row.get("paused_until"),
                                          row.get("last_payment"))
        if not due:
            store("renewal_update", p_id=row["id"],
                  p_patch={"next_check": utc_iso(next_check or now + timedelta(days=30))})
            return "paused" if paused_now(row.get("paused_from"), row.get("paused_until"), now) else "waiting"
    elif paused_now(row.get("paused_from"), row.get("paused_until"), now):
        # Check again when the pause ends, without even logging in to PayByPhone meanwhile.
        resume = parse_dt(row.get("paused_until")) or now + timedelta(hours=12)
        store("renewal_update", p_id=row["id"], p_patch={"next_check": utc_iso(resume)})
        return "paused"
    if row.get("owner") and not refresh_token:
        state = guarded_state(row["owner"])
        if state in BLOCKED_STATES:
            # Unpaid: the ticket running now stays valid, the next one is not paid. Checked again every
            # 2 hours, so the renewal resumes on its own once the subscription is paid.
            store("renewal_update", p_id=row["id"],
                  p_patch={"last_error": BLOCKED, "next_check": utc_iso(now + timedelta(hours=2))})
            if previous_error != BLOCKED:
                notify_blocked(row, state)
            return "blocked"
    try:
        refresh = refresh_token or decrypt_credential(row["credential"])
        bot = Bot.from_refresh_token(refresh)
    except Exception as e:
        log.warning("renewal %s: login with refresh token failed: %s", row["id"], str(e)[:200])
        store("renewal_update", p_id=row["id"],
              p_patch={"last_error": RELOGIN, "next_check": utc_iso(now + timedelta(hours=6))})
        if previous_error != RELOGIN:
            notify(row, "problem", message=RELOGIN)
        return "relogin"
    if bot.refresh_token and bot.refresh_token != refresh:
        patch["credential"] = encrypt_credential(bot.refresh_token)
    session = UserSession.for_bot(bot)
    outcome = "error"
    result, expire = None, None
    try:
        active = running_for(session, row["plate"])
        if active:
            expire = covered_until(active)
            next_check = expire + timedelta(seconds=30)
            if rule:  # covered already: never pay twice, look again when it ends or at the next window
                next_check = schedule.decide(rule, now, None, None, row.get("last_payment"), expire)[1]
            patch.update(next_check=utc_iso(next_check or now + timedelta(days=30)), last_error=None)
            outcome = "active"
        else:
            result, found = pay_and_confirm(session, row["location"], row["rate"], fmt_qty(row["duration"]),
                                            row["unit"], row["plate"], row["payment_account_id"])
            expire = covered_until(found)
            next_check = schedule.next_slot(rule, now) if rule else expire + timedelta(seconds=30)
            patch.update(last_payment=utc_iso(now), next_check=utc_iso(next_check or now + timedelta(days=30)),
                         last_error=None)
            outcome = "paid"
    except Unconfirmed:
        # Never retry blindly: the payment may have gone through, retrying could pay twice.
        patch.update(enabled=False, last_error=UNCONFIRMED + " Renouvellement suspendu.")
        outcome = "unconfirmed"
    except Exception as e:
        if "VehicleAlreadyParked" in str(e):  # a ticket PayByPhone knows of but did not list: wait, not an error
            patch.update(last_error=None, next_check=utc_iso(now + timedelta(minutes=30)))
            outcome = "active"
        else:
            patch.update(last_error=friendly_error(e), next_check=utc_iso(now + timedelta(minutes=30)))
    log.info("renewal %s zone=%s plate=%s: %s", row["id"], row["location"], row["plate"][:2] + "***", outcome)
    store("renewal_update", p_id=row["id"], p_patch=patch)
    if outcome == "paid":
        notify(row, "paid", cost=(result or {}).get("cost"), expire=expire,
               next=schedule.next_ticket(rule, now, row.get("paused_from"), row.get("paused_until")) if rule else None)
    elif patch.get("last_error") and patch["last_error"] != previous_error:
        notify(row, "problem", message=patch["last_error"])
    return outcome


@app.api_route("/api/cron/renew", methods=["GET", "POST"])
def cron_renew(request: Request):
    """Called every few minutes by the scheduler. Only acts on renewals that are due."""
    if not HOSTED:
        raise HTTPException(404)
    if not cron_authorized(request):
        raise HTTPException(401, "Unauthorized")
    results = [process_renewal(row) for row in store("renewal_claim_due", p_limit=2)]
    return {"processed": len(results), "outcomes": results}


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------


EMAIL_PATTERN = r"^$|^[^@\s]{1,64}@[^@\s]{1,190}\.[A-Za-z]{2,24}$"


class Login(BaseModel):
    username: str = Field(max_length=120)
    password: str = Field(max_length=200)
    accepted: bool = False  # terms of use and privacy policy
    signup: bool = False
    remember: bool = False  # "Se souvenir de moi"
    email: str = Field(default="", max_length=254, pattern=EMAIL_PATTERN)  # required at sign-up
    zone: str = Field(default="", pattern=r"^$|^\w{3,10}$")  # home zone, asked at sign-up
    turnstile: str = Field(default="", max_length=2048)  # Cloudflare's human check token (hosted)


class AccountPatch(BaseModel):
    email: str | None = Field(default=None, max_length=254, pattern=EMAIL_PATTERN)
    zone: str | None = Field(default=None, pattern=r"^$|^\w{3,10}$")


class Parking(BaseModel):
    location: str = Field(max_length=20)
    rate: str = Field(max_length=40)
    duration: float = Field(gt=0, le=10000)
    unit: str = Field(pattern="^(Days|Hours|Minutes)$")
    plate: str = Field(max_length=20)
    paymentAccountId: str = Field(max_length=80)


class Extension(Parking):
    sessionId: str = Field(max_length=80)


class Autopilot(Parking):
    label: str = Field(default="", max_length=60)
    email: str = Field(default="", max_length=254, pattern=EMAIL_PATTERN)
    # Precise days (0 = Monday ... 5 = Saturday; Sundays are free) and the Paris time the ticket is taken.
    # No days: the continuous weekly renewal.
    days: list[Annotated[int, Field(ge=0, le=5)]] | None = Field(default=None, min_length=1, max_length=6)
    start: str | None = Field(default=None, pattern=r"^([01]\d|2[0-3]):[0-5]\d$")


class Pause(BaseModel):
    start: str = Field(pattern=r"^\d{4}-\d{2}-\d{2}$")  # first paused day (Paris)
    end: str | None = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")  # last paused day; None = no end yet


class EmailChange(BaseModel):
    email: str = Field(default="", max_length=254, pattern=EMAIL_PATTERN)


@app.post("/api/login")
def login(body: Login, request: Request, response: Response):
    demo = body.username.strip().lower() == "demo"
    masked = body.username.strip()[:4] + "***"
    if body.signup and not demo and not body.email.strip():
        raise HTTPException(400, "Indiquez votre adresse e-mail.")
    if HOSTED and not demo:
        if not body.accepted:
            raise HTTPException(400, "Acceptez les conditions d'utilisation et la politique de confidentialité.")
        check_human(request, body.turnstile)
        check_login_rate(request, body.username)
    try:
        session = UserSession(body.username.strip(), body.password, demo=demo)
    except Exception as e:
        log.warning("login failed for %s: %s", masked, e)
        raise HTTPException(400, friendly_error(e))
    log.info("login ok for %s (%s)", masked, "demo" if demo else "PayByPhone account %s***" % session.username[:5])
    session.remember = body.remember
    if not demo and (body.signup or HOSTED):
        exists = guarded(lambda: has_account(session))
        if body.signup and exists:
            log.info("sign-up refused: account already exists for %s", masked)
            raise HTTPException(409, "Un compte PaybyBot existe déjà pour ce compte PayByPhone.")
        if not body.signup and not exists and not is_admin(session):  # online, logging in needs a sign-up first
            log.info("login refused: no account yet for %s", masked)
            raise HTTPException(404, "Aucun compte PaybyBot pour ce compte PayByPhone.")
    if body.signup and not demo:  # the account is created once the e-mail is confirmed with a code
        return start_verification(response, session, body.email.strip(), body.zone.strip())
    if HOSTED:
        token = seal(session)
        refresh = getattr(session.bot, "refresh_token", None)
        if not demo and refresh:
            try:  # renewals that lost their PayByPhone connection start again with this one
                store("renewal_set_credential", p_owner=owner_id(session.username),
                      p_credential=encrypt_credential(refresh))
            except Exception as e:
                log.warning("could not refresh stored renewals: %s", e)
    else:
        token = seal(session) if body.remember else secrets.token_urlsafe(32)
        SESSIONS[token] = session
    if body.email.strip() or body.zone.strip():
        try:
            save_account(session, {k: v for k, v in (("email", body.email.strip()), ("zone", body.zone.strip())) if v})
            if HOSTED and demo:
                token = seal(session)  # the demo account lives in the cookie
        except Exception as e:
            log.warning("could not save the account e-mail: %s", e)
    set_session_cookie(response, token, body.remember)
    log.info("PayByPhone token fields: %s", sorted(token_claims(session)))  # names only, never values
    return {"username": session.username, "demo": demo, "hosted": HOSTED, "firstName": first_name(session)}


class SignupCheck(BaseModel):
    username: str = Field(max_length=120)


@app.post("/api/signup/check")
def signup_check(body: SignupCheck, request: Request):
    """Tell the sign-up page, as soon as the number is typed, that this account is already signed up.
    Limited per device, since it reveals whether a number uses PaybyBot."""
    if not HOSTED:
        return {"exists": False}
    ip = request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    key = hmac.new(_subkey(_secrets()[0], "rate"), ip.encode(), hashlib.sha256).hexdigest()
    if not store("rate_hit", p_key="check:" + key, p_window_seconds=900, p_max=20):
        return {"exists": False}  # too many checks: say nothing, sign-up still refuses at the end

    def exists():
        for candidate in login_candidates(body.username)[:3]:
            owner = owner_id(candidate)
            if store("account_get", p_owner=owner) or store("renewal_list", p_owner=owner):
                return True
        return False

    return {"exists": guarded(exists)}


# --------------------------------------------------------------------------
# Sign-up: the e-mail is confirmed with a 6-digit code before the account exists
# --------------------------------------------------------------------------

PENDING_COOKIE = "pbb_pending"
CODE_TTL = 600  # seconds
CODE_TRIES = 5  # wrong codes before a new one is needed
PENDING = {}  # local app: token -> sign-up waiting for its code (hosted: sealed in the cookie)


def code_hash(code, email):
    key = _subkey(_secrets()[0], "code") if HOSTED else PENDING_KEY
    return hmac.new(key, ("%s:%s" % (code, email.lower())).encode(), hashlib.sha256).hexdigest()


PENDING_KEY = secrets.token_bytes(32)


def mask_email(email):
    name, _, domain = email.partition("@")
    return "%s•••@%s" % (name[:2], domain)


def send_code(email, code):
    sent = send_email(email, "Votre code PaybyBot : %s" % code, "Votre code de vérification",
                      ["Saisissez ce code sur PaybyBot pour finir votre inscription :",
                       "Il est valable 10 minutes. Ne le communiquez à personne."],
                      code="%s %s" % (code[:3], code[3:]),
                      footer="Vous recevez cet e-mail parce que cette adresse a été indiquée pour créer un compte "
                             "PaybyBot. Si ce n'est pas vous, ignorez-le : aucun compte ne sera créé.")
    if not sent:
        if HOSTED:
            raise HTTPException(502, "L'e-mail n'a pas pu être envoyé. Vérifiez l'adresse et réessayez.")
        log.warning("local app without e-mail sending: verification code %s", code)  # local only, never online


def start_verification(response, session, email, zone, pending=None):
    code = "%06d" % secrets.randbelow(10 ** 6)
    if pending is None:
        pending = {"email": email, "zone": zone}
        if HOSTED:
            pending["s"] = seal(session)
        else:
            pending["t"] = secrets.token_urlsafe(32)
    pending.update(h=code_hash(code, pending["email"]), exp=int(time.time()) + CODE_TTL, sent=int(time.time()))
    if HOSTED:
        value = _fernet("pending").encrypt(json.dumps(pending).encode()).decode()
    else:
        PENDING[pending["t"]] = {**pending, "session": session, "tries": 0}
        value = pending["t"]
    send_code(pending["email"], code)
    response.set_cookie(PENDING_COOKIE, value, httponly=True, samesite="strict", secure=HOSTED, path="/api/signup",
                        max_age=CODE_TTL)
    log.info("sign-up code sent")
    return {"pending": True, "email": mask_email(pending["email"])}


def read_pending(value):
    """The sign-up waiting for its code, and its PayByPhone session."""
    try:
        if HOSTED:
            pending = json.loads(_fernet("pending").decrypt((value or "").encode(), ttl=CODE_TTL + 60))
            session = UserSession.from_state(json.loads(_fernet().decrypt(pending["s"].encode())))
        else:
            pending = PENDING[value or ""]
            session = pending["session"]
    except Exception:
        raise HTTPException(410, "Ce code a expiré. Recommencez l'inscription.")
    if time.time() > pending["exp"]:
        raise HTTPException(410, "Ce code a expiré. Demandez-en un nouveau.")
    return pending, session


def count_try(pending, session, kind, limit, window):
    """At most `limit` code checks (or new codes) per window, for this PayByPhone account."""
    if HOSTED:
        if not store("rate_hit", p_key="%s:%s" % (kind, owner_id(session.username)), p_window_seconds=window,
                     p_max=limit):
            raise HTTPException(429, "Trop d'essais. Réessayez dans quelques minutes.")
    else:
        pending[kind] = pending.get(kind, 0) + 1
        if pending[kind] > limit:
            raise HTTPException(429, "Trop d'essais. Réessayez dans quelques minutes.")


class CodeCheck(BaseModel):
    code: str = Field(pattern=r"^\s*\d{3}\s?\d{3}\s*$")


@app.post("/api/signup/verify")
def verify_signup(body: CodeCheck, response: Response, pbb_pending: str = Cookie(None)):
    pending, session = read_pending(pbb_pending)
    count_try(pending, session, "code", CODE_TRIES, 900)
    code = re.sub(r"\D", "", body.code)
    if not hmac.compare_digest(code_hash(code, pending["email"]), pending["h"]):
        raise HTTPException(400, "Code incorrect. Vérifiez l'e-mail reçu.")
    # The home zone is found later from PayByPhone (or asked when the renewal is set up), not at sign-up.
    save_account(session, {"email": pending["email"], "trial_start": datetime.now(timezone.utc).isoformat(),
                           **({"zone": pending["zone"]} if pending.get("zone") else {})})
    session.remember = True  # a new user stays signed in (30 days), there is no box to tick at sign-up
    session.issued_at = int(time.time())
    if HOSTED:
        token = seal(session)
        refresh = getattr(session.bot, "refresh_token", None)
        if refresh:
            try:
                store("renewal_set_credential", p_owner=owner_id(session.username),
                      p_credential=encrypt_credential(refresh))
            except Exception as e:
                log.warning("could not refresh stored renewals: %s", e)
    else:
        try:
            token = seal(session)
        except Exception:  # nothing to seal it with: a plain token, lost on restart
            token = secrets.token_urlsafe(32)
        SESSIONS[token] = session
        PENDING.pop(pbb_pending or "", None)
    set_session_cookie(response, token, True)
    response.delete_cookie(PENDING_COOKIE, path="/api/signup")
    log.info("sign-up confirmed")
    return {"username": session.username, "demo": False, "hosted": HOSTED, "firstName": first_name(session)}


@app.post("/api/signup/resend")
def resend_signup_code(response: Response, pbb_pending: str = Cookie(None)):
    pending, session = read_pending(pbb_pending)
    if time.time() - pending.get("sent", 0) < 30:
        raise HTTPException(429, "Patientez quelques secondes avant de demander un nouveau code.")
    count_try(pending, session, "resend", 3, 3600)
    pending = {k: v for k, v in pending.items() if k in ("email", "zone", "s", "t")}
    return start_verification(response, session, pending["email"], pending["zone"], pending)


@app.post("/api/logout")
def logout(response: Response, pbb_session: str = Cookie(None)):
    SESSIONS.pop(pbb_session or "", None)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


def current_build():
    """Name of the app script in the deployed index.html: open pages compare it with theirs to reload after an update."""
    try:
        found = re.search(r"/assets/(index-[\w-]+\.js)", (STATIC_DIR / "index.html").read_text())
        return found.group(1) if found else None
    except OSError:
        return None


@app.get("/api/config")
def config():
    """Public: lets the login page describe where credentials go."""
    return {"hosted": HOSTED, "turnstileSiteKey": turnstile_site_key() or None, "build": current_build()}


@app.get("/api/me")
def me(pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    return {"username": s.username, "demo": s.demo, "hosted": HOSTED, "firstName": first_name(s)}


def token_claims(session):
    """The fields of PayByPhone's access token (a JWT), read without verifying it: only used for display."""
    if session.demo:
        return {}
    try:
        payload = (getattr(session.bot, "authorization", "") or "").split(" ")[-1].split(".")[1]
        return json.loads(base64.urlsafe_b64decode(payload + "=" * (-len(payload) % 4)))
    except Exception:
        return {}


def first_name(session):
    """The account holder's first name if PayByPhone gives it, for the greeting; None otherwise."""
    claims = token_claims(session)
    for key in ("given_name", "firstName", "first_name", "givenName"):
        if isinstance(claims.get(key), str) and claims[key].strip():
            return claims[key].strip()[:40]
    name = claims.get("name")
    if isinstance(name, str) and name.strip() and "@" not in name and not name.strip().lstrip("+").isdigit():
        return name.strip().split()[0][:40]
    return None


def guarded(fn):
    try:
        return fn()
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(502, friendly_error(e))


@app.get("/api/overview")
def overview(pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def load():
        if HOSTED and s.demo:  # no background loop on a serverless host: a demo renewal runs when the page loads
            for ap in list(s.autopilots.values()):
                if ap.get("enabled"):
                    run_autopilot(s, ap)
        vehicles = [v for v in s.call("get_vehicles") if not v.get("archived")]
        accounts = s.call("get_payment_accounts") or {}
        payments = normalize_accounts(accounts)
        if not payments and not s.demo:
            # Only types and counts, never card details: helps spot a payment type we don't handle yet.
            log.info("no usable payment method; PayByPhone returned %s",
                     {k: len(v) if isinstance(v, list) else type(v).__name__ for k, v in accounts.items()})
        return {
            "vehicles": [{"plate": v["licensePlate"], "country": v.get("country"), "type": v.get("type")}
                         for v in vehicles],
            "payments": payments,
            "sessions": [serialize_session(x) for x in s.call("get_parking_sessions")],
            "autopilots": ([stored_to_autopilot(r) for r in store("renewal_list", p_owner=owner_id(s.username))]
                           if HOSTED and not s.demo else [with_next_ticket(a) for a in s.autopilots.values()]),
            "history": s.history[:10],
        }

    return guarded(load)


@app.get("/api/rates")
def rates(location: str, plate: str, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    return guarded(lambda: s.call("get_rate_options", locationId=location.strip(), licensePlate=plate))


@app.get("/api/last-rate")
def last_rate(location: str, plate: str, pbb_session: str = Cookie(None)):
    """The rate this car used last, from PayByPhone's history: in this zone first, otherwise anywhere."""
    s = current(pbb_session)
    try:
        sessions = s.call("get_past_sessions", limit=30) + s.call("get_parking_sessions")
    except Exception as e:  # history is a convenience: never block the payment for it
        log.info("history unavailable: %s", str(e)[:200])
        return {"rate": None, "inZone": False}
    mine = [x for x in sessions if (x.get("vehicle") or {}).get("licensePlate") == plate]
    mine.sort(key=lambda x: x.get("startTime") or datetime.min, reverse=True)
    for in_zone in (True, False):
        for x in mine:
            if (x.get("locationId") == location.strip()) == in_zone or not in_zone:
                rate = (x.get("ratePolicy") or {}).get("ratePolicyId")
                if rate:
                    return {"rate": str(rate), "inZone": in_zone}
    return {"rate": None, "inZone": False}


class QuoteRequest(Parking):
    sessionId: str = Field(default="", max_length=80)  # set to price an extension of this session
    renewal: bool = False  # pricing a renewal: a ticket already running must not block it


@app.post("/api/quote")
def quote(body: QuoteRequest, pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def ask(operation, session_id):
        q = s.call("_create_quote", locationId=body.location, ratePolicyId=body.rate,
                   durationQuantity=fmt_qty(body.duration), durationTimeUnit=body.unit,
                   licensePlate=body.plate, paymentAccountId=body.paymentAccountId,
                   operation=operation, parkingSessionId=session_id)
        details = q.get("details") or {}
        return {"cost": q.get("cost"), "start": iso(details.get("parkingStartTime")),
                "expire": iso(details.get("parkingExpiryTime"))}

    def run():
        if body.sessionId:
            return ask("Extend", body.sessionId)
        try:
            return ask("Start", "")
        except Exception as e:
            if not (body.renewal and "VehicleAlreadyParked" in str(e)):
                raise
        # A ticket is running: the renewal starts when it ends. Its price is that of the same stay added to
        # the running ticket when PayByPhone quotes it, otherwise unknown until the first renewal.
        running = running_for(s, body.plate)
        until = iso(covered_until(running)) if running else None
        for x in running:
            try:
                return {**ask("Extend", x.get("parkingSessionId")), "afterCurrent": True, "currentExpire": until}
            except Exception as e:  # e.g. a visitor ticket cannot be extended at the resident rate
                log.info("renewal price as an extension refused: %s", str(e)[:200])
        cost, source = known_price(s, body)
        return {"cost": cost, "priceSource": source, "start": None, "expire": None, "afterCurrent": True,
                "currentExpire": until}

    return guarded(run)


# Paris resident rate (tarif résidentiel), used only when PayByPhone cannot quote the week right now.
PARIS_RESIDENT_WEEK = {"amount": 9.0, "currency": "EUR"}


def known_price(s, body):
    """Price of the stay when PayByPhone refuses to quote it (a ticket is running): what this car paid for the
    same stay at the same rate, from PayByPhone's history, else the Paris resident rate. (cost, source)."""
    span = WEEK if body.unit == "Days" and float(body.duration) == 7 else None
    try:
        history = s.call("get_past_sessions", limit=30) + s.call("get_parking_sessions")
    except Exception as e:
        log.info("history unavailable for the price: %s", str(e)[:200])
        history = []
    for x in history:
        start, end = parse_dt(x.get("startTime")), parse_dt(x.get("expireTime"))
        if (span and start and end and abs((end - start) - span) < timedelta(hours=2)
                and same_plate((x.get("vehicle") or {}).get("licensePlate"), body.plate)
                and str((x.get("ratePolicy") or {}).get("ratePolicyId")) == str(body.rate)
                and (x.get("totalCost") or {}).get("amount")):
            return x["totalCost"], "history"
    if span and re.fullmatch(r"75\d{3}", body.location.strip()):
        rates = s.call("get_rate_options", body.location.strip(), body.plate) or []
        if any(str(r.get("ratePolicyId")) == str(body.rate) and RESIDENT_RATE.search("%s %s" % (r.get("name"), r.get("type")))
               and not TWO_WHEELS.search("%s %s" % (r.get("name"), r.get("type"))) for r in rates):  # car rate only
            return PARIS_RESIDENT_WEEK, "paris"
    return None, None


WEEK = timedelta(days=7)

# The subscription follows what the resident pays PayByPhone: per month, twice the weekly resident ticket of the
# home zone; per year, twelve months with 20 % off. The weekly price comes from PayByPhone (quote, then history),
# else the Paris resident rate.
YEARLY_DISCOUNT = 0.20
DEFAULT_WEEKLY_CENTS = int(PARIS_RESIDENT_WEEK["amount"] * 100)


def plan_cents(weekly_cents, plan):
    monthly = 2 * int(weekly_cents)
    return monthly if plan == "monthly" else int(round(monthly * 12 * (1 - YEARLY_DISCOUNT)))


def weekly_resident_cents(s, zone):
    """What a week at the resident rate costs this account in its home zone, in cents (None if unknown).
    Cars first; an account with only two-wheelers gets the two-wheeler rate."""
    vehicles = [v for v in s.call("get_vehicles") if not v.get("archived")]
    payments = normalize_accounts(s.call("get_payment_accounts") or {})
    if not vehicles:
        return None
    two = [v for v in vehicles if TWO_WHEELS.search(str(v.get("type") or ""))]
    vehicle = next((v for v in vehicles if v not in two), vehicles[0])
    plate = vehicle["licensePlate"]
    rates = s.call("get_rate_options", zone, plate) or []
    wants_two = vehicle in two
    rate = next((r for r in rates if RESIDENT_RATE.search("%s %s" % (r.get("name"), r.get("type")))
                 and bool(TWO_WHEELS.search("%s %s" % (r.get("name"), r.get("type")))) == wants_two
                 and not r.get("parkingNotAllowedReason")), None)
    if not rate:
        return None
    if payments:
        try:
            q = s.call("_create_quote", locationId=zone, ratePolicyId=str(rate["ratePolicyId"]), durationQuantity=7,
                       durationTimeUnit="Days", licensePlate=plate, paymentAccountId=payments[0]["id"],
                       operation="Start", parkingSessionId="")
            if (q.get("cost") or {}).get("amount"):
                return int(round(float(q["cost"]["amount"]) * 100))
        except Exception as e:  # e.g. a ticket is running: fall back on the history
            log.info("weekly price quote refused: %s", str(e)[:200])
    body = Parking(location=zone, rate=str(rate["ratePolicyId"]), duration=7, unit="Days", plate=plate,
                   paymentAccountId=payments[0]["id"] if payments else "")
    cost, _ = known_price(s, body)
    return int(round(float(cost["amount"]) * 100)) if cost and cost.get("amount") else None


def account_pricing(s):
    """The account's prices from its home zone; kept on the account for the e-mail links. None without a zone."""
    zone = (find_home_zone(s) or {}).get("zone")
    if not zone:
        return None
    weekly = weekly_resident_cents(s, zone)
    if not weekly:
        return None
    account = load_account(s)
    if account.get("weekly_cents") != weekly or account.get("price_zone") != zone:
        account = save_account(s, {"weekly_cents": weekly, "price_zone": zone})
        reprice(account, owner_id(s.username) if HOSTED and not s.demo else None)
    return {"zone": zone, "weekly": weekly, "monthly": plan_cents(weekly, "monthly"),
            "yearly": plan_cents(weekly, "yearly")}


def fmt_qty(value):
    return int(value) if float(value).is_integer() else value


@app.post("/api/pay")
def pay(body: Parking, pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def run():
        pending = s.unconfirmed.get((body.plate, body.location))
        if pending and time.time() - pending < 30 * 60:
            raise HTTPException(423, "Un paiement précédent pour ce véhicule dans cette zone n'a pas été confirmé. "
                                     "Vérifiez dans l'application PayByPhone avant de payer à nouveau.")
        if s.call("get_parking_sessions", licensePlate=body.plate, locationId=body.location):
            raise HTTPException(409, "Un stationnement est déjà en cours pour %s dans cette zone." % body.plate)
        try:
            result, found = pay_and_confirm(s, body.location, body.rate, fmt_qty(body.duration), body.unit,
                                            body.plate, body.paymentAccountId)
        except Unconfirmed as e:
            raise HTTPException(504, str(e))
        s.log("success", "Stationnement payé : zone %s, %s" % (body.location, body.plate))
        expire = max(x["expireTime"] for x in found)
        return {"ok": True, "expire": iso(expire), "cost": result.get("cost")}

    try:
        return guarded(run)
    except HTTPException as e:
        if e.status_code in (502, 504):
            log.warning("pay failed: %s", e.detail)
            s.log("error", "Paiement échoué (zone %s) : %s" % (body.location, e.detail))
        raise


@app.post("/api/extend")
def extend(body: Extension, pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def run():
        pending = s.unconfirmed.get((body.plate, body.location))
        if pending and time.time() - pending < 30 * 60:
            raise HTTPException(423, "Un paiement précédent pour ce véhicule dans cette zone n'a pas été confirmé. "
                                     "Vérifiez dans l'application PayByPhone avant de payer à nouveau.")
        before = next((x for x in s.call("get_parking_sessions", licensePlate=body.plate, locationId=body.location)
                       if x.get("parkingSessionId") == body.sessionId), None)
        if before is None:
            raise HTTPException(409, "Ce ticket n'est plus en cours : il ne peut pas être prolongé.")
        before_expire = before["expireTime"]  # keep the value: the session dict may be updated in place
        log.info("extend: session=%s zone=%s %s %s plate=%s demo=%s", body.sessionId, body.location,
                 body.duration, body.unit, body.plate[:2] + "***", s.demo)
        try:
            result = s.call("extend", parkingSessionId=body.sessionId, durationQuantity=fmt_qty(body.duration),
                            durationTimeUnit=body.unit, licensePlate=body.plate, locationId=body.location,
                            ratePolicyId=body.rate, paymentAccountId=body.paymentAccountId)
        except Exception as e:
            log.warning("extend: PayByPhone refused: %s", str(e)[:1000])
            raise
        log.info("extend: PayByPhone answered jobId=%s jobStatus=%s cost=%s new expire=%s", result.get("jobId"),
                 result.get("jobStatus"), result.get("cost"), result.get("expireTime"))
        s.attempts.append({"at": datetime.now(timezone.utc).isoformat(), "location": body.location,
                           "plate": body.plate, "operation": "extend",
                           **{k: result.get(k) for k in ("quoteId", "parkingSessionId", "jobId", "jobStatus")}})
        # Confirmed only once PayByPhone lists the session with its later end time.
        for i in range(10):
            now = next((x for x in s.call("get_parking_sessions", licensePlate=body.plate, locationId=body.location)
                        if x.get("parkingSessionId") == body.sessionId), None)
            if now and now["expireTime"] > before_expire:
                log.info("extend: confirmed after %s check(s)", i + 1)
                s.log("success", "Ticket prolongé : zone %s, %s" % (body.location, body.plate))
                return {"ok": True, "expire": iso(now["expireTime"]), "cost": result.get("cost")}
            if not s.demo:
                time.sleep(3)
        s.unconfirmed[(body.plate, body.location)] = time.time()
        log.warning("extend: end time unchanged for session %s", body.sessionId)
        log_diagnosis(s)
        raise HTTPException(504, UNCONFIRMED)

    try:
        return guarded(run)
    except HTTPException as e:
        if e.status_code in (502, 504):
            log.warning("extend failed: %s", e.detail)
        raise


@app.get("/api/debug")
def debug(pbb_session: str = Cookie(None)):
    if HOSTED:  # diagnosis stays in the server logs online
        raise HTTPException(404)
    s = current(pbb_session)
    report = guarded(lambda: diagnosis(s))
    log.warning("diagnosis (on demand): %s", json.dumps(report, default=str))
    return report


@app.post("/api/autopilots")
def add_autopilot(body: Autopilot, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    if not body.email.strip():  # confirmations go to the account e-mail by default
        try:
            body.email = load_account(s).get("email") or ""
        except Exception as e:
            log.warning("account e-mail unreadable: %s", e)
    days = sorted(set(body.days)) if body.days else None
    start = (body.start or schedule.DEFAULT_START) if days else None
    if HOSTED and not s.demo:
        refresh = getattr(s.bot, "refresh_token", None)
        if not refresh:
            raise HTTPException(401, "Reconnectez-vous pour activer le renouvellement automatique.")
        if billing_state(guarded(lambda: load_account(s)), owner_id(s.username)) in BLOCKED_STATES:
            raise HTTPException(402, "Compte bloqué : débloquez-le (bandeau en haut de page) pour activer un "
                                     "renouvellement.")

        def save():
            row = store("renewal_save", p_row={
                "owner": owner_id(s.username), "credential": encrypt_credential(refresh),
                "data": encrypt_details({"label": body.label, "plate": body.plate, "location": body.location,
                                         "rate": body.rate, "duration": fmt_qty(body.duration), "unit": body.unit,
                                         "payment_account_id": body.paymentAccountId,
                                         "email": body.email.strip(), "days": days, "start": start})})
            details = {**with_details(row)}
            outcome = process_renewal(row, refresh_token=refresh)  # pay now if it is due and nothing is active
            stored = next((r for r in store("renewal_list", p_owner=owner_id(s.username)) if r["id"] == row["id"]), row)
            if outcome in ("paid", "active", "waiting"):
                active = running_for(s, body.plate)
                rule = rule_of(details)
                notify(details, "activated", expire=covered_until(active) if active else None,
                       next=schedule.next_ticket(rule, datetime.now(timezone.utc)) if rule else None)
            return with_next_ticket(stored_to_autopilot(stored))

        return guarded(save)
    ap = {**body.model_dump(), "duration": fmt_qty(body.duration), "id": uuid.uuid4().hex[:8], "enabled": True,
          "lastCheck": None, "lastPayment": None, "lastError": None, "days": days, "start": start}
    s.autopilots[ap["id"]] = ap
    if HOSTED:  # demo on a serverless host: no background thread, run it now
        run_autopilot(s, ap)
    else:
        threading.Thread(target=lambda: guarded(lambda: run_autopilot(s, ap)), daemon=True).start()
    return ap


@app.get("/api/account")
def get_account(pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def load():
        account = load_account(s)
        if (account or s.demo) and not account.get("trial_start"):
            # Accounts made before the free month existed (and the demo) start theirs now.
            account = save_account(s, {"trial_start": datetime.now(timezone.utc).isoformat()})
        return account

    account = guarded(load)
    start = parse_dt(account.get("trial_start"))
    state = billing_state(account, owner_id(s.username)) if HOSTED and not s.demo else "ok"
    return {"email": account.get("email") or "", "zone": account.get("zone") or None,
            "trialEnd": (start + timedelta(days=TRIAL_DAYS)).isoformat() if start else None,
            "plan": subscription_plan(account),
            # Renewals stop while blocked: 'unpaid' (Stripe could not charge) or 'trialOver' (no subscription).
            "blocked": {"unpaid": "unpaid", "trial_over": "trialOver"}.get(state)}


class Checkout(BaseModel):
    plan: str = Field(pattern="^(monthly|yearly)$")


class CheckoutDone(BaseModel):
    session_id: str = Field(pattern=r"^cs_[A-Za-z0-9_]{10,200}$")


ACTIVE_STATUSES = ("trialing", "active", "past_due")
PLANS = {"monthly": ("month", "PaybyBot · Mensuel"), "yearly": ("year", "PaybyBot · Annuel")}  # price: plan_cents


def stripe(method, path, **data):
    """Stripe REST API (form-encoded), with the key from STRIPE_SECRET_KEY."""
    key = os.environ.get("STRIPE_SECRET_KEY")
    if not key:
        raise HTTPException(503, "Le paiement en ligne arrive très bientôt. Profitez de votre mois offert !")
    r = requests.request(method, "https://api.stripe.com/v1/" + path, auth=(key, ""), data=data or None,
                         timeout=15)
    if not r.ok:
        log.warning("stripe %s %s: %s %s", method, path.split("/")[0], r.status_code, r.text[:200])
        raise HTTPException(502, "Le paiement est momentanément indisponible. Réessayez dans un instant.")
    return r.json()


def subscription_plan(account):
    """The live plan from Stripe ('monthly' / 'yearly'), or None when there is no running subscription."""
    sub_id = account.get("stripe_subscription")
    if not sub_id or not os.environ.get("STRIPE_SECRET_KEY"):
        return None
    try:
        sub = stripe("GET", "subscriptions/" + sub_id)
    except HTTPException:
        return account.get("plan")  # Stripe unreachable: trust the last known plan
    return account.get("plan") if sub.get("status") in ACTIVE_STATUSES else None


PAID_STATUSES = ("trialing", "active")
UNPAID_STATUSES = ("past_due", "unpaid", "incomplete")
BLOCKED_STATES = ("unpaid", "trial_over")
BLOCKED = ("Compte bloqué : l'abonnement PaybyBot n'est pas réglé. Le ticket en cours reste valable, le suivant "
           "ne sera pas payé.")
UNLOCK_TTL = 30 * 86400  # how long the "Débloquer mon compte" link of an e-mail works


def admin_owners():
    admins = [x.strip() for x in os.environ.get("PAYBYBOT_ADMINS", "").split(",") if x.strip()]
    return {owner_id(c) for a in admins for c in login_candidates(a)}


def billing_state(account, owner=None):
    """'ok' (subscribed), 'trial' (free month running), or a blocked state: 'unpaid' (Stripe could not charge)
    or 'trial_over' (free month ended without a subscription)."""
    if not account or (owner and owner in admin_owners()):
        return "ok"  # the site owner, and renewals stored before accounts existed
    sub_id = account.get("stripe_subscription")
    if sub_id and os.environ.get("STRIPE_SECRET_KEY"):
        try:
            status = stripe("GET", "subscriptions/" + sub_id).get("status")
        except HTTPException:
            status = "active" if account.get("plan") else None  # Stripe unreachable: trust the last known plan
        if status in PAID_STATUSES:
            return "ok"
        if status in UNPAID_STATUSES:
            return "unpaid"
    start = parse_dt(account.get("trial_start"))
    if not start or start + timedelta(days=TRIAL_DAYS) > datetime.now(timezone.utc):
        return "trial"  # no start yet: the free month begins when the account is first opened
    return "trial_over"


def guarded_state(owner):
    """billing_state for the scheduler: never blocks a renewal because a lookup failed."""
    try:
        return billing_state(account_by_owner(owner), owner)
    except Exception as e:
        log.warning("billing state unavailable: %s", str(e)[:200])
        return "ok"


def unlock_link(owner):
    """Signed link of the e-mail: straight to the right Stripe page, without logging in."""
    token = _fernet("unlock").encrypt(owner.encode()).decode()
    return APP_URL.rstrip("/") + "/api/billing/unlock?t=" + token


def notify_blocked(details, state):
    """One e-mail when a renewal is blocked for lack of payment, with the way out."""
    to = account_by_owner(details["owner"]).get("email") or details.get("email")
    if not to:
        return
    car = "%s, zone %s" % (plate_text(details.get("plate")), details.get("location"))
    first = ("Le dernier paiement de votre abonnement PaybyBot n'a pas abouti : votre compte est bloqué."
             if state == "unpaid" else
             "Votre mois offert est terminé et aucun abonnement n'a été souscrit : votre compte est bloqué.")
    send_email(to, "Compte PaybyBot bloqué · paiement requis",
               "Paiement refusé : compte bloqué" if state == "unpaid" else "Votre compte est bloqué",
               [first,
                "Votre ticket en cours reste valable jusqu'à sa fin, mais le renouvellement suivant pour %s "
                "n'aura pas lieu." % car,
                "Débloquez votre compte : le renouvellement reprend tout seul dès que le paiement est fait."],
               ("Débloquer mon compte", unlock_link(details["owner"])),
               footer="Vous recevez cet e-mail parce que vous avez un renouvellement automatique sur PaybyBot.")


def checkout_url(owner, account, plan, success_url):
    """A Stripe Checkout page for the plan; while the free month runs, the first charge waits for its end."""
    base = APP_URL.rstrip("/")
    interval, name = PLANS[plan]
    weekly = int(account.get("weekly_cents") or DEFAULT_WEEKLY_CENTS)
    amount = plan_cents(weekly, plan)
    data = {"mode": "subscription", "line_items[0][quantity]": 1,
            "line_items[0][price_data][currency]": "eur", "line_items[0][price_data][unit_amount]": amount,
            "line_items[0][price_data][recurring][interval]": interval,
            "line_items[0][price_data][product_data][name]": name,
            "client_reference_id": owner, "metadata[plan]": plan, "metadata[weekly_cents]": weekly,
            "success_url": success_url,
            "cancel_url": base + "/#/tarifs", "locale": "fr", "allow_promotion_codes": "true",
            # PaybyBot's own look on Stripe's page, without changing the Studio Presto account branding.
            "branding_settings[display_name]": "PaybyBot",
            "branding_settings[logo][type]": "url", "branding_settings[logo][url]": base + "/brand/paybybot-logo.png",
            "branding_settings[button_color]": "#1d4ea3", "branding_settings[font_family]": "inter",
            "branding_settings[border_style]": "rounded"}
    if account.get("stripe_customer"):
        data["customer"] = account["stripe_customer"]
    elif account.get("email"):
        data["customer_email"] = account["email"]
    start = parse_dt(account.get("trial_start"))
    trial_end = start + timedelta(days=TRIAL_DAYS) if start else None
    if trial_end and trial_end > datetime.now(timezone.utc) + timedelta(hours=1):
        # The free month is already running: no Stripe "trial" (its page would offer to start one); the first
        # charge is simply set on the day the free month ends, nothing being due before.
        data["subscription_data[billing_cycle_anchor]"] = int(trial_end.timestamp())
        data["subscription_data[proration_behavior]"] = "none"
        months = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre",
                  "novembre", "décembre"]
        day = trial_end.astimezone(PARIS)
        data["custom_text[submit][message]"] = (
            "Rien n'est prélevé avant la fin de votre mois offert, le %d %s." % (day.day, months[day.month - 1]))
    return stripe("POST", "checkout/sessions", **data)["url"]


def unlock_url(owner, account, plan="monthly"):
    """Where to pay to unblock: the open invoice when Stripe failed to charge, else a new subscription."""
    sub_id = account.get("stripe_subscription")
    if sub_id:
        sub = stripe("GET", "subscriptions/" + sub_id)
        if sub.get("status") in UNPAID_STATUSES:
            invoice = stripe("GET", "invoices/" + sub["latest_invoice"]) if sub.get("latest_invoice") else {}
            if invoice.get("status") == "open" and invoice.get("hosted_invoice_url"):
                return invoice["hosted_invoice_url"]
            return stripe("POST", "billing_portal/sessions", customer=account["stripe_customer"],
                          return_url=APP_URL.rstrip("/") + "/", configuration=portal_configuration())["url"]
    return checkout_url(owner, account, plan,
                        APP_URL.rstrip("/") + "/api/billing/unlocked?session_id={CHECKOUT_SESSION_ID}")


def resume_renewals(owner):
    """Paid again: check the owner's renewals now instead of waiting for the next look."""
    for row in store("renewal_list", p_owner=owner):
        store("renewal_update", p_id=row["id"], p_patch={"next_check": utc_iso(datetime.now(timezone.utc))})


def reprice(account, owner):
    """The home zone's resident price changed (a move, a new city rate): the running subscription follows it from
    its next billing date, without proration. No e-mail: the Stripe receipt shows the new amount."""
    sub_id, weekly = account.get("stripe_subscription"), account.get("weekly_cents")
    if not (owner and sub_id and weekly and os.environ.get("STRIPE_SECRET_KEY")):
        return False
    billed = account.get("billed_weekly_cents")
    if billed and int(billed) == int(weekly):
        return False
    try:
        sub = stripe("GET", "subscriptions/" + sub_id)
        if sub.get("status") not in PAID_STATUSES + UNPAID_STATUSES:
            return False
        item = sub["items"]["data"][0]
        plan = account.get("plan") or ("yearly" if item["price"]["recurring"]["interval"] == "year" else "monthly")
        new = plan_cents(weekly, plan)
        if billed is None and item["price"].get("unit_amount") == new:  # already right, just not recorded
            save_account_by_owner(owner, {"billed_weekly_cents": int(weekly)})
            return False
        stripe("POST", "subscriptions/" + sub_id, **{
            "items[0][id]": item["id"], "items[0][price_data][currency]": "eur",
            "items[0][price_data][product]": item["price"]["product"],
            "items[0][price_data][unit_amount]": new,
            "items[0][price_data][recurring][interval]": item["price"]["recurring"]["interval"],
            "proration_behavior": "none", "metadata[weekly_cents]": weekly})
    except (HTTPException, KeyError, IndexError) as e:
        log.warning("reprice failed: %s", str(e)[:200])
        return False
    save_account_by_owner(owner, {"billed_weekly_cents": int(weekly)})
    log.info("subscription repriced (%s)", plan)
    return True


@app.get("/api/pricing")
def pricing(pbb_session: str = Cookie(None)):
    """The account's prices: twice its weekly resident ticket per month, 20 % off per year. No zone: zone None."""
    s = current(pbb_session)
    found = guarded(lambda: account_pricing(s))
    return found or {"zone": None, "weekly": None, "monthly": None, "yearly": None}


@app.post("/api/billing/checkout")
def billing_checkout(body: Checkout, request: Request, pbb_session: str = Cookie(None)):
    """Stripe Checkout for the monthly or yearly plan; nothing is charged before the free month ends."""
    s = current(pbb_session)
    if s.demo:
        raise HTTPException(400, "Le paiement n'est pas disponible en mode démo.")
    if not os.environ.get("STRIPE_SECRET_KEY"):
        raise HTTPException(503, "Le paiement en ligne arrive très bientôt. Profitez de votre mois offert !")
    if not guarded(lambda: account_pricing(s)):
        raise HTTPException(400, "Choisissez d'abord votre arrondissement : le prix dépend de votre forfait résident.")
    account = guarded(lambda: load_account(s))
    url = checkout_url(owner_id(s.username), account, body.plan,
                       APP_URL.rstrip("/") + "/#/abonnement?session_id={CHECKOUT_SESSION_ID}")
    return {"url": url}


@app.get("/api/billing/unlock")
def billing_unlock(t: str = "", plan: str = "monthly"):
    """« Débloquer mon compte » from the e-mail: the signed link leads straight to Stripe."""
    try:
        owner = _fernet("unlock").decrypt(t.encode(), ttl=UNLOCK_TTL).decode()
    except Exception:
        return RedirectResponse(APP_URL.rstrip("/") + "/#/tarifs", 303)
    account = guarded(lambda: account_by_owner(owner))
    return RedirectResponse(unlock_url(owner, account, plan if plan in PLANS else "monthly"), 303)


@app.post("/api/billing/unlock")
def billing_unlock_signed_in(pbb_session: str = Cookie(None)):
    """The dashboard's « Débloquer mon compte » when Stripe failed to charge."""
    s = current(pbb_session)
    if s.demo:
        raise HTTPException(400, "Le paiement n'est pas disponible en mode démo.")
    owner = owner_id(s.username)
    return {"url": unlock_url(owner, guarded(lambda: load_account(s)))}


@app.get("/api/billing/unlocked")
def billing_unlocked(session_id: str = ""):
    """Back from the e-mail's Checkout (maybe signed out): record the subscription and resume at once."""
    home = APP_URL.rstrip("/")
    if not re.fullmatch(r"cs_[A-Za-z0-9_]{10,200}", session_id):
        return RedirectResponse(home + "/", 303)
    session = stripe("GET", "checkout/sessions/" + session_id)
    owner = session.get("client_reference_id")
    if session.get("status") != "complete" or not owner:
        return RedirectResponse(home + "/#/tarifs", 303)
    billed = (session.get("metadata") or {}).get("weekly_cents")
    guarded(lambda: save_account_by_owner(owner, {"plan": (session.get("metadata") or {}).get("plan"),
                                                  "stripe_customer": session.get("customer"),
                                                  "stripe_subscription": session.get("subscription"),
                                                  "billed_weekly_cents": int(billed) if billed else None}))
    guarded(lambda: resume_renewals(owner))
    log.info("account unblocked from the e-mail link")
    return RedirectResponse(home + "/#/debloque", 303)


@app.post("/api/billing/confirm")
def billing_confirm(body: CheckoutDone, pbb_session: str = Cookie(None)):
    """Back from Stripe Checkout: record the subscription on the account."""
    s = current(pbb_session)
    session = stripe("GET", "checkout/sessions/" + body.session_id)
    if session.get("client_reference_id") != owner_id(s.username) or session.get("status") != "complete":
        raise HTTPException(400, "Ce paiement n'a pas abouti.")
    plan = (session.get("metadata") or {}).get("plan")
    billed = (session.get("metadata") or {}).get("weekly_cents")
    account = guarded(lambda: save_account(s, {"plan": plan, "stripe_customer": session.get("customer"),
                                               "stripe_subscription": session.get("subscription"),
                                               "billed_weekly_cents": int(billed) if billed else None}))
    if HOSTED and not s.demo:
        guarded(lambda: resume_renewals(owner_id(s.username)))
    log.info("subscription started (%s)", plan)
    return {"plan": account.get("plan")}


def portal_configuration():
    """The customer portal settings, created once if the Stripe account has none yet."""
    found = stripe("GET", "billing_portal/configurations?is_default=true&limit=1").get("data") or []
    if found:
        return found[0]["id"]
    return stripe("POST", "billing_portal/configurations", **{
        "business_profile[headline]": "PaybyBot : gérez votre abonnement",
        "features[invoice_history][enabled]": "true",
        "features[payment_method_update][enabled]": "true",
        "features[subscription_cancel][enabled]": "true",
        "features[subscription_cancel][mode]": "at_period_end",
    })["id"]


@app.post("/api/billing/portal")
def billing_portal(pbb_session: str = Cookie(None)):
    """Stripe's customer portal: change card or plan, see invoices, cancel."""
    s = current(pbb_session)
    account = guarded(lambda: load_account(s))
    if not account.get("stripe_customer"):
        raise HTTPException(400, "Aucun abonnement à gérer.")
    portal = stripe("POST", "billing_portal/sessions", customer=account["stripe_customer"],
                    return_url=APP_URL.rstrip("/") + "/", configuration=portal_configuration())
    return {"url": portal["url"]}


@app.put("/api/account")
def update_account(body: AccountPatch, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    patch = {k: v.strip() for k, v in body.model_dump().items() if v is not None}
    account = guarded(lambda: save_account(s, patch))
    if patch.get("zone"):  # a move: the price follows the new zone's resident rate
        try:
            account_pricing(s)
        except Exception as e:
            log.info("pricing after a zone change failed: %s", str(e)[:200])
    return {"email": account.get("email") or "", "zone": account.get("zone") or None}


def is_admin(s):
    """The site owner: PayByPhone accounts listed in PAYBYBOT_ADMINS (phone numbers, comma separated)."""
    admins = [x.strip() for x in os.environ.get("PAYBYBOT_ADMINS", "").split(",") if x.strip()]
    return not s.demo and any(owner_id(c) == owner_id(s.username) for a in admins for c in login_candidates(a))


# The owner's admin page has its own login (e-mail + password), separate from PayByPhone.
# PAYBYBOT_ADMIN_EMAIL, and PAYBYBOT_ADMIN_PASSWORD_HASH made by scripts/admin_password.py (never the password).
ADMIN_COOKIE = "pbb_admin"
ADMIN_SESSION = 12 * 3600


def password_matches(password, stored):
    """stored = "pbkdf2_sha256$<iterations>$<salt hex>$<hash hex>"."""
    try:
        algo, iterations, salt, digest = stored.split("$")
        if algo != "pbkdf2_sha256":
            return False
        computed = hashlib.pbkdf2_hmac("sha256", password.encode(), bytes.fromhex(salt), int(iterations))
        return hmac.compare_digest(computed.hex(), digest)
    except Exception:
        return False


class AdminLogin(BaseModel):
    email: str = Field(max_length=254)
    password: str = Field(max_length=200)
    turnstile: str = Field(default="", max_length=2048)


@app.post("/api/admin/login")
def admin_login(body: AdminLogin, request: Request, response: Response):
    email, stored = os.environ.get("PAYBYBOT_ADMIN_EMAIL", ""), os.environ.get("PAYBYBOT_ADMIN_PASSWORD_HASH", "")
    if not HOSTED or not email or not stored:
        raise HTTPException(403, "Accès admin non configuré.")
    check_human(request, body.turnstile)
    ip = request.headers.get("x-real-ip") or (request.headers.get("x-forwarded-for") or "").split(",")[0].strip()
    key = hmac.new(_subkey(_secrets()[0], "rate"), ip.encode(), hashlib.sha256).hexdigest()
    if not store("rate_hit", p_key="admin:" + key, p_window_seconds=900, p_max=5):
        raise HTTPException(429, "Trop de tentatives. Réessayez dans 15 minutes.")
    ok_email = hmac.compare_digest(body.email.strip().lower(), email.strip().lower())
    if not (password_matches(body.password, stored) and ok_email):
        log.warning("admin login refused")
        raise HTTPException(401, "Identifiants incorrects.")
    response.set_cookie(ADMIN_COOKIE, _fernet("admin").encrypt(b"admin").decode(), httponly=True, samesite="strict",
                        secure=True, path="/api/admin", max_age=ADMIN_SESSION)
    log.info("admin login ok")
    return {"ok": True}


@app.post("/api/admin/logout")
def admin_logout(response: Response):
    response.delete_cookie(ADMIN_COOKIE, path="/api/admin")
    return {"ok": True}


def require_admin(value):
    try:
        if _fernet("admin").decrypt((value or "").encode(), ttl=ADMIN_SESSION) == b"admin":
            return
    except Exception:
        pass
    raise HTTPException(401, "Connexion admin requise.")


@app.get("/api/admin/stats")
def admin_stats(pbb_admin: str = Cookie(None)):
    if not HOSTED:
        raise HTTPException(403, "Accès réservé.")
    require_admin(pbb_admin)
    return guarded(lambda: store("admin_stats"))


@app.get("/api/resident-zone")
def resident_zone(pbb_session: str = Cookie(None)):
    """Guess the home zone from PayByPhone's history: a zone where the car is offered the resident rate.

    Long tickets (about a day or more) are tried first, then the others; each candidate is checked with
    PayByPhone, since only the home zone offers the resident rate. At most a few zones are checked.
    """
    s = current(pbb_session)
    return guarded(lambda: find_home_zone(s))


def find_home_zone(s):
    """The home zone: set by the user, else guessed from PayByPhone's history (see resident_zone)."""
    def find():
        manual = load_account(s).get("zone")
        if manual:  # added by the user in "Mon compte"
            return {"zone": manual, "manual": True}
        history = s.call("get_past_sessions", limit=30) + s.call("get_parking_sessions")

        def long_ticket(x):
            start, end = parse_dt(x.get("startTime")), parse_dt(x.get("expireTime"))
            return bool(start and end and end - start >= timedelta(hours=20))

        candidates, seen = [], set()
        for x in sorted(history, key=lambda x: not long_ticket(x)):  # stable: keeps recency within each group
            zone, plate = str(x.get("locationId") or ""), (x.get("vehicle") or {}).get("licensePlate")
            if zone and plate and zone not in seen:
                seen.add(zone)
                candidates.append((zone, plate))
        for zone, plate in candidates[:5]:
            try:
                rates = s.call("get_rate_options", zone, plate) or []
            except Exception as e:
                log.info("resident zone: zone check failed: %s", str(e)[:120])
                continue
            if any(RESIDENT_RATE.search("%s %s" % (r.get("name"), r.get("type"))) and not r.get("parkingNotAllowedReason")
                   for r in rates):
                return {"zone": zone}
        return {"zone": None}

    return find()


def update_own_renewal(s, ap_id, patch):
    """Hosted: change one of the user's stored renewals; returns it in the interface's shape."""
    try:
        return stored_to_autopilot(store("renewal_update_owned", p_owner=owner_id(s.username), p_id=ap_id,
                                         p_patch=patch))
    except requests.HTTPError:
        raise HTTPException(404, "Renouvellement introuvable.")


@app.post("/api/autopilots/{ap_id}/pause")
def pause_autopilot(ap_id: str, body: Pause, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    start, end = pause_bounds(body.start, body.end)
    info = {"from_day": date.fromisoformat(body.start).strftime("%d/%m/%Y"),
            "until_day": date.fromisoformat(body.end).strftime("%d/%m/%Y") if body.end else None}
    if HOSTED and not s.demo:
        ap = update_own_renewal(s, ap_id, {"paused_from": start, "paused_until": end})
        notify(ap, "paused", **info)
        log.info("renewal %s paused", ap_id)
        return ap
    ap = s.autopilots.get(ap_id)
    if not ap:
        raise HTTPException(404, "Renouvellement introuvable.")
    ap.update(pausedFrom=start, pausedUntil=end)
    return ap


@app.delete("/api/autopilots/{ap_id}/pause")
def resume_autopilot(ap_id: str, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    if HOSTED and not s.demo:
        # Check right away: a ticket may be needed now.
        return update_own_renewal(s, ap_id, {"paused_from": None, "paused_until": None,
                                             "next_check": utc_iso(datetime.now(timezone.utc))})
    ap = s.autopilots.get(ap_id)
    if not ap:
        raise HTTPException(404, "Renouvellement introuvable.")
    ap.update(pausedFrom=None, pausedUntil=None)
    if HOSTED:
        run_autopilot(s, ap)
    return ap


@app.put("/api/autopilots/{ap_id}/email")
def change_autopilot_email(ap_id: str, body: EmailChange, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    if HOSTED and not s.demo:
        current_row = next((r for r in store("renewal_list", p_owner=owner_id(s.username)) if r["id"] == ap_id), None)
        if not current_row:
            raise HTTPException(404, "Renouvellement introuvable.")
        details = {**with_details(current_row), "email": body.email.strip()}
        return update_own_renewal(s, ap_id, {"data": encrypt_details(details)})
    ap = s.autopilots.get(ap_id)
    if not ap:
        raise HTTPException(404, "Renouvellement introuvable.")
    ap["email"] = body.email.strip()
    return ap


@app.delete("/api/me/data")
def delete_my_data(response: Response, pbb_session: str = Cookie(None)):
    """Erase everything kept for this account (stored renewals), then log out."""
    s = current(pbb_session)
    email = None
    try:  # where to confirm the deletion: the account e-mail, else one given for a renewal
        email = load_account(s).get("email")
        if not email and HOSTED and not s.demo:
            email = next((with_details(r).get("email") for r in store("renewal_list", p_owner=owner_id(s.username))
                          if with_details(r).get("email")), None)
    except Exception as e:
        log.warning("account e-mail unreadable before deletion: %s", e)
    if HOSTED and not s.demo:
        guarded(lambda: store("renewal_delete_owner", p_owner=owner_id(s.username)))
        guarded(lambda: store("account_delete", p_owner=owner_id(s.username)))
    if email and not s.demo:
        send_email(email, "Compte PaybyBot supprimé", "Votre compte est supprimé",
                   ["Votre compte PaybyBot a été supprimé à votre demande. Les renouvellements automatiques sont "
                    "arrêtés et tout ce que PaybyBot gardait pour vous est effacé.",
                    "Les tickets déjà en cours restent valables jusqu'à leur fin. Votre compte PayByPhone n'est pas "
                    "modifié.",
                    "Vous n'avez rien demandé ? Écrivez-nous à %s ou répondez simplement à cet e-mail." % MAIL_REPLY_TO],
                   footer="Vous recevez cet e-mail parce que votre compte PaybyBot vient d'être supprimé.")
    s.account = {}
    s.autopilots.clear()
    s.logged_out = True  # the middleware must not write the cookie back
    SESSIONS.pop(pbb_session or "", None)
    response.delete_cookie(COOKIE, path="/")
    log.info("data deleted for %s***", s.username[:4])
    return {"ok": True}


@app.delete("/api/autopilots/{ap_id}")
def delete_autopilot(ap_id: str, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    if HOSTED and not s.demo:
        guarded(lambda: store("renewal_delete", p_owner=owner_id(s.username), p_id=ap_id))
    else:
        s.autopilots.pop(ap_id, None)
    return {"ok": True}


# --------------------------------------------------------------------------
# Front-end
# --------------------------------------------------------------------------

# A page loaded during a deployment switch can ask for the previous build's files, which no longer
# exist: instead of a blank page, a missing script reloads the page once to get the current build.
RELOAD_ONCE_JS = ("try{if(!sessionStorage.getItem('pbb-reloaded')){sessionStorage.setItem('pbb-reloaded','1');"
                  "location.reload()}}catch(e){}")


class Assets(StaticFiles):
    async def get_response(self, path, scope):
        try:
            return await super().get_response(path, scope)
        except HTTPException as e:
            if e.status_code != 404:
                raise
        except Exception:
            pass
        from fastapi.responses import Response as RawResponse

        if path.endswith(".js"):
            return RawResponse(RELOAD_ONCE_JS, media_type="text/javascript", headers={"Cache-Control": "no-store"})
        if path.endswith(".css"):
            return RawResponse("", media_type="text/css", headers={"Cache-Control": "no-store"})
        return RawResponse(status_code=404)


if (STATIC_DIR / "assets").exists():
    app.mount("/assets", Assets(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    target = (STATIC_DIR / path).resolve()
    if path and target.is_file() and STATIC_DIR.resolve() in target.parents:
        return FileResponse(target)
    index = STATIC_DIR / "index.html"
    if not index.exists():
        raise HTTPException(404, "Interface non compilée : lancez `npm run build` dans web/.")
    # Always revalidate the page: a cached copy would point to the assets of a previous deployment.
    # Any other path gets the page with a 404 status: the app shows "page not found", search engines skip it.
    return FileResponse(index, status_code=200 if path in ("", "index.html") else 404,
                        headers={"Cache-Control": "no-cache"})


def serve(host="127.0.0.1", port=8765, open_browser=True):
    import uvicorn
    import webbrowser

    if open_browser:
        threading.Timer(1.5, lambda: webbrowser.open("http://%s:%s" % (host, port))).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")
