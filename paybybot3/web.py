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
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from fastapi import Cookie, FastAPI, HTTPException, Request, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bot import Bot

log = logging.getLogger("paybybot3.web")

STATIC_DIR = Path(__file__).parent / "static"
COOKIE = "pbb_session"
HOSTED = os.environ.get("PAYBYBOT_HOSTED") == "1"
RELOGIN = ("Votre connexion PayByPhone a expiré : reconnectez-vous sur paybybot pour relancer "
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

    def _get_parking_sessions(self):
        return self.get_parking_sessions()

    def get_rate_options(self, locationId, licensePlate):
        if not str(locationId).isdigit():
            return []
        return [
            {"name": "Résident", "type": "Resident", "ratePolicyId": "101", "maxStayStatus": None,
             "acceptedTimeUnits": ["Days"], "parkingNotAllowedReason": None},
            {"name": "Visiteur", "type": "Visitor", "ratePolicyId": "102", "maxStayStatus": None,
             "acceptedTimeUnits": ["Minutes", "Hours"], "parkingNotAllowedReason": None},
        ]

    def _price(self, ratePolicyId, quantity, unit):
        quantity = float(quantity)
        if str(ratePolicyId) == "101":
            return round(1.5 * quantity, 2)
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
        self.history = []  # most recent first
        self.attempts = []  # every real payment request, for diagnosis
        self.unconfirmed = {}  # (plate, location) -> time of an unconfirmed payment

    def to_state(self):
        """What the hosted mode keeps in the encrypted cookie: never the password."""
        state = {"u": self.username, "d": self.demo,
                 "uc": [[plate, location, at] for (plate, location), at in self.unconfirmed.items()]}
        if self.demo:
            state["s"] = [{**x, "startTime": x["startTime"].isoformat(), "expireTime": x["expireTime"].isoformat()}
                          for x in self.bot.sessions]
            state["ap"] = list(self.autopilots.values())
        else:
            state["t"] = self.bot.authorization
            state["r"] = getattr(self.bot, "refresh_token", None)
        return state

    @classmethod
    def from_state(cls, state):
        self = cls.__new__(cls)
        self.username, self._password, self.demo = state["u"], None, state["d"]
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
        return self

    def call(self, method, *args, **kwargs):
        """Call a bot method, logging in again once if the token expired."""
        with self.lock:
            try:
                return getattr(self.bot, method)(*args, **kwargs)
            except requests.HTTPError as e:
                if e.response is None or e.response.status_code != 401 or self.demo:
                    raise
                if self._password is None:  # hosted mode: the password is not kept
                    raise HTTPException(401, "Votre session PayByPhone a expiré, reconnectez-vous.")
                self.bot = Bot(self.username, self._password)
                return getattr(self.bot, method)(*args, **kwargs)

    def log(self, kind, message):
        self.history.insert(0, {"at": datetime.now(timezone.utc).isoformat(), "kind": kind, "message": message})
        del self.history[50:]


SESSIONS = {}


# In hosted mode, the sessions loaded during a request, so the middleware can write them back.
_loaded = contextvars.ContextVar("pbb_loaded", default=None)


def _fernet():
    from cryptography.fernet import Fernet

    secret = os.environ.get("PAYBYBOT_SECRET")
    if not secret:
        raise RuntimeError("PAYBYBOT_SECRET is not set")
    return Fernet(base64.urlsafe_b64encode(hashlib.sha256(secret.encode()).digest()))


def seal(session):
    return _fernet().encrypt(json.dumps(session.to_state()).encode()).decode()


def current(token):
    if HOSTED:
        try:
            session = UserSession.from_state(json.loads(_fernet().decrypt((token or "").encode())))
        except Exception:
            raise HTTPException(401, "Session expirée, reconnectez-vous.")
        holder = _loaded.get()
        if holder is not None:
            holder.append(session)
        return session
    session = SESSIONS.get(token or "")
    if session is None:
        raise HTTPException(401, "Session expirée, reconnectez-vous.")
    return session


def set_session_cookie(response, value):
    response.set_cookie(COOKIE, value, httponly=True, samesite="strict", secure=HOSTED, path="/")


@app.middleware("http")
async def persist_session(request: Request, call_next):
    """Hosted mode: write back what a request changed (demo tickets, payment locks)."""
    holder = []
    _loaded.set(holder)
    response = await call_next(request)
    if HOSTED and holder and response.status_code != 401:
        set_session_cookie(response, seal(holder[-1]))
    return response


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
        return "PayByPhone refuse ce stationnement (zone, tarif ou durée non autorisés)."
    if "Payment job failed" in text:
        return "Le paiement a été refusé. Vérifiez votre moyen de paiement dans l'application PayByPhone."
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


def run_autopilot(session, ap):
    """Pay for the configured parking if no session is active right now."""
    active = session.call("get_parking_sessions", licensePlate=ap["plate"], locationId=ap["location"])
    ap["lastCheck"] = datetime.now(timezone.utc).isoformat()
    if active:
        return
    try:
        pay_and_confirm(session, ap["location"], ap["rate"], ap["duration"], ap["unit"], ap["plate"],
                        ap["paymentAccountId"])
        ap["lastPayment"] = datetime.now(timezone.utc).isoformat()
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
    key = os.environ.get("PAYBYBOT_SECRET", "").encode()
    return hmac.new(key, ("owner:" + username).encode(), hashlib.sha256).hexdigest()


def encrypt_credential(refresh_token):
    return _fernet().encrypt(refresh_token.encode()).decode()


def decrypt_credential(value):
    return _fernet().decrypt(value.encode()).decode()


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
    return {
        "id": row["id"], "label": row.get("label") or "", "plate": row["plate"], "location": row["location"],
        "rate": row["rate"], "duration": fmt_qty(row["duration"]), "unit": row["unit"],
        "paymentAccountId": row["payment_account_id"], "enabled": row["enabled"],
        "lastCheck": row.get("last_check"), "lastPayment": row.get("last_payment"), "lastError": row.get("last_error"),
    }


def utc_iso(dt):
    return (dt if dt.tzinfo else dt.replace(tzinfo=timezone.utc)).isoformat()


def process_renewal(row, refresh_token=None):
    """Check one stored renewal and pay for it if no session is active. Never raises."""
    now = datetime.now(timezone.utc)
    patch = {}
    try:
        refresh = refresh_token or decrypt_credential(row["credential"])
        bot = Bot.from_refresh_token(refresh)
    except Exception as e:
        log.warning("renewal %s: login with refresh token failed: %s", row["id"], str(e)[:200])
        store("renewal_update", p_id=row["id"],
              p_patch={"last_error": RELOGIN, "next_check": utc_iso(now + timedelta(hours=6))})
        return "relogin"
    if bot.refresh_token and bot.refresh_token != refresh:
        patch["credential"] = encrypt_credential(bot.refresh_token)
    session = UserSession.for_bot(bot)
    outcome = "error"
    try:
        active = session.call("get_parking_sessions", licensePlate=row["plate"], locationId=row["location"])
        if active:
            expire = max(x["expireTime"] for x in active)
            patch.update(next_check=utc_iso(expire + timedelta(seconds=30)), last_error=None)
            outcome = "active"
        else:
            _, found = pay_and_confirm(session, row["location"], row["rate"], fmt_qty(row["duration"]), row["unit"],
                                       row["plate"], row["payment_account_id"])
            expire = max(x["expireTime"] for x in found)
            patch.update(last_payment=utc_iso(now), next_check=utc_iso(expire + timedelta(seconds=30)),
                         last_error=None)
            outcome = "paid"
    except Unconfirmed:
        # Never retry blindly: the payment may have gone through, retrying could pay twice.
        patch.update(enabled=False, last_error=UNCONFIRMED + " Renouvellement suspendu.")
        outcome = "unconfirmed"
    except Exception as e:
        patch.update(last_error=friendly_error(e), next_check=utc_iso(now + timedelta(minutes=30)))
    log.info("renewal %s zone=%s plate=%s: %s", row["id"], row["location"], row["plate"][:2] + "***", outcome)
    store("renewal_update", p_id=row["id"], p_patch=patch)
    return outcome


@app.api_route("/api/cron/renew", methods=["GET", "POST"])
def cron_renew():
    """Called every few minutes by the scheduler. Only acts on renewals that are due, so extra calls are harmless."""
    if not HOSTED:
        raise HTTPException(404)
    results = [process_renewal(row) for row in store("renewal_claim_due", p_limit=2)]
    return {"processed": len(results), "outcomes": results}


# --------------------------------------------------------------------------
# API
# --------------------------------------------------------------------------


class Login(BaseModel):
    username: str
    password: str


class Parking(BaseModel):
    location: str
    rate: str
    duration: float
    unit: str
    plate: str
    paymentAccountId: str


class Extension(Parking):
    sessionId: str


class Autopilot(Parking):
    label: str = ""


@app.post("/api/login")
def login(body: Login, response: Response):
    demo = body.username.strip().lower() == "demo"
    masked = body.username.strip()[:4] + "***"
    try:
        session = UserSession(body.username.strip(), body.password, demo=demo)
    except Exception as e:
        log.warning("login failed for %s: %s", masked, e)
        raise HTTPException(400, friendly_error(e))
    log.info("login ok for %s (%s)", masked, "demo" if demo else "PayByPhone account %s***" % session.username[:5])
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
        token = secrets.token_urlsafe(32)
        SESSIONS[token] = session
    set_session_cookie(response, token)
    return {"username": session.username, "demo": demo, "hosted": HOSTED}


@app.post("/api/logout")
def logout(response: Response, pbb_session: str = Cookie(None)):
    SESSIONS.pop(pbb_session or "", None)
    response.delete_cookie(COOKIE, path="/")
    return {"ok": True}


@app.get("/api/config")
def config():
    """Public: lets the login page describe where credentials go."""
    return {"hosted": HOSTED}


@app.get("/api/me")
def me(pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    return {"username": s.username, "demo": s.demo, "hosted": HOSTED}


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
                           if HOSTED and not s.demo else list(s.autopilots.values())),
            "history": s.history[:10],
        }

    return guarded(load)


@app.get("/api/rates")
def rates(location: str, plate: str, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    return guarded(lambda: s.call("get_rate_options", locationId=location.strip(), licensePlate=plate))


class QuoteRequest(Parking):
    sessionId: str = ""  # set to price an extension of this session


@app.post("/api/quote")
def quote(body: QuoteRequest, pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def run():
        q = s.call("_create_quote", locationId=body.location, ratePolicyId=body.rate,
                   durationQuantity=fmt_qty(body.duration), durationTimeUnit=body.unit,
                   licensePlate=body.plate, paymentAccountId=body.paymentAccountId,
                   operation="Extend" if body.sessionId else "Start", parkingSessionId=body.sessionId)
        details = q.get("details") or {}
        return {"cost": q.get("cost"), "start": iso(details.get("parkingStartTime")),
                "expire": iso(details.get("parkingExpiryTime"))}

    return guarded(run)


def fmt_qty(value):
    return int(value) if float(value).is_integer() else value


@app.post("/api/pay")
def pay(body: Parking, pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def run():
        pending = s.unconfirmed.get((body.plate, body.location))
        if pending and time.time() - pending < 30 * 60:
            raise HTTPException(423, "Un paiement précédent pour cette voiture dans cette zone n'a pas été confirmé. "
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
            raise HTTPException(423, "Un paiement précédent pour cette voiture dans cette zone n'a pas été confirmé. "
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
    s = current(pbb_session)
    report = guarded(lambda: diagnosis(s))
    log.warning("diagnosis (on demand): %s", json.dumps(report, default=str))
    return report


@app.post("/api/autopilots")
def add_autopilot(body: Autopilot, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    if HOSTED and not s.demo:
        refresh = getattr(s.bot, "refresh_token", None)
        if not refresh:
            raise HTTPException(401, "Reconnectez-vous pour activer le renouvellement automatique.")

        def save():
            row = store("renewal_save", p_row={
                "owner": owner_id(s.username), "label": body.label, "plate": body.plate, "location": body.location,
                "rate": body.rate, "duration": fmt_qty(body.duration), "unit": body.unit,
                "payment_account_id": body.paymentAccountId, "credential": encrypt_credential(refresh)})
            process_renewal(row, refresh_token=refresh)  # pay the first week now if nothing is active
            stored = next((r for r in store("renewal_list", p_owner=owner_id(s.username)) if r["id"] == row["id"]), row)
            return stored_to_autopilot(stored)

        return guarded(save)
    ap = {**body.model_dump(), "duration": fmt_qty(body.duration), "id": uuid.uuid4().hex[:8], "enabled": True,
          "lastCheck": None, "lastPayment": None, "lastError": None}
    s.autopilots[ap["id"]] = ap
    if HOSTED:  # demo on a serverless host: no background thread, run it now
        run_autopilot(s, ap)
    else:
        threading.Thread(target=lambda: guarded(lambda: run_autopilot(s, ap)), daemon=True).start()
    return ap


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

if (STATIC_DIR / "assets").exists():
    app.mount("/assets", StaticFiles(directory=STATIC_DIR / "assets"), name="assets")


@app.get("/{path:path}", include_in_schema=False)
def spa(path: str):
    target = (STATIC_DIR / path).resolve()
    if path and target.is_file() and STATIC_DIR.resolve() in target.parents:
        return FileResponse(target)
    index = STATIC_DIR / "index.html"
    if not index.exists():
        raise HTTPException(404, "Interface non compilée : lancez `npm run build` dans web/.")
    # Always revalidate the page: a cached copy would point to the assets of a previous deployment.
    return FileResponse(index, headers={"Cache-Control": "no-cache"})


def serve(host="127.0.0.1", port=8765, open_browser=True):
    import uvicorn
    import webbrowser

    if open_browser:
        threading.Timer(1.5, lambda: webbrowser.open("http://%s:%s" % (host, port))).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")
