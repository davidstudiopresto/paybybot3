"""Local web interface for paybybot3.

Runs a small HTTP server on 127.0.0.1 that wraps :class:`paybybot3.bot.Bot`
and serves the single-page app built from ``web/`` (copied into ``static/``).
PayByPhone credentials only live in this process' memory.
"""

import secrets
import threading
import time
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

import requests
from fastapi import Cookie, FastAPI, HTTPException, Response
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from .bot import Bot

STATIC_DIR = Path(__file__).parent / "static"
COOKIE = "pbb_session"

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

    def _create_quote(self, locationId, ratePolicyId, durationQuantity, durationTimeUnit, licensePlate,
                      paymentAccountId=""):
        now = datetime.now(timezone.utc)
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


# --------------------------------------------------------------------------
# Sessions (one per browser) and the automatic renewal ("autopilot")
# --------------------------------------------------------------------------


class UserSession:
    def __init__(self, username, password, demo=False):
        self.username = username
        self._password = password
        self.demo = demo
        self.lock = threading.Lock()
        self.bot = DemoBot() if demo else Bot(username, password)
        self.autopilots = {}  # id -> dict
        self.history = []  # most recent first

    def call(self, method, *args, **kwargs):
        """Call a bot method, logging in again once if the token expired."""
        with self.lock:
            try:
                return getattr(self.bot, method)(*args, **kwargs)
            except requests.HTTPError as e:
                if e.response is None or e.response.status_code != 401 or self.demo:
                    raise
                self.bot = Bot(self.username, self._password)
                return getattr(self.bot, method)(*args, **kwargs)

    def log(self, kind, message):
        self.history.insert(0, {"at": datetime.now(timezone.utc).isoformat(), "kind": kind, "message": message})
        del self.history[50:]


SESSIONS = {}


def current(token):
    session = SESSIONS.get(token or "")
    if session is None:
        raise HTTPException(401, "Session expirée, reconnectez-vous.")
    return session


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


def run_autopilot(session, ap):
    """Pay for the configured parking if no session is active right now."""
    active = session.call("get_parking_sessions", licensePlate=ap["plate"], locationId=ap["location"])
    ap["lastCheck"] = datetime.now(timezone.utc).isoformat()
    if active:
        return
    try:
        session.call("pay", durationQuantity=ap["duration"], durationTimeUnit=ap["unit"],
                     licensePlate=ap["plate"], locationId=ap["location"], ratePolicyId=ap["rate"],
                     paymentAccountId=ap["paymentAccountId"])
        ap["lastPayment"] = datetime.now(timezone.utc).isoformat()
        ap["lastError"] = None
        session.log("success", "Renouvellement automatique : zone %s, %s" % (ap["location"], ap["plate"]))
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
    threading.Thread(target=autopilot_loop, daemon=True).start()


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


class Autopilot(Parking):
    label: str = ""


@app.post("/api/login")
def login(body: Login, response: Response):
    demo = body.username.strip().lower() == "demo"
    try:
        session = UserSession(body.username.strip(), body.password, demo=demo)
    except Exception as e:
        raise HTTPException(400, friendly_error(e))
    token = secrets.token_urlsafe(32)
    SESSIONS[token] = session
    response.set_cookie(COOKIE, token, httponly=True, samesite="strict")
    return {"username": session.username, "demo": demo}


@app.post("/api/logout")
def logout(response: Response, pbb_session: str = Cookie(None)):
    SESSIONS.pop(pbb_session or "", None)
    response.delete_cookie(COOKIE)
    return {"ok": True}


@app.get("/api/me")
def me(pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    return {"username": s.username, "demo": s.demo}


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
        return {
            "vehicles": [{"plate": v["licensePlate"], "country": v.get("country"), "type": v.get("type")}
                         for v in vehicles],
            "payments": normalize_accounts(s.call("get_payment_accounts")),
            "sessions": [serialize_session(x) for x in s.call("get_parking_sessions")],
            "autopilots": list(s.autopilots.values()),
            "history": s.history[:10],
        }

    return guarded(load)


@app.get("/api/rates")
def rates(location: str, plate: str, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    return guarded(lambda: s.call("get_rate_options", locationId=location.strip(), licensePlate=plate))


@app.post("/api/quote")
def quote(body: Parking, pbb_session: str = Cookie(None)):
    s = current(pbb_session)

    def run():
        q = s.call("_create_quote", locationId=body.location, ratePolicyId=body.rate,
                   durationQuantity=fmt_qty(body.duration), durationTimeUnit=body.unit,
                   licensePlate=body.plate, paymentAccountId=body.paymentAccountId)
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
        if s.call("get_parking_sessions", licensePlate=body.plate, locationId=body.location):
            raise HTTPException(409, "Un stationnement est déjà en cours pour %s dans cette zone." % body.plate)
        result = s.call("pay", durationQuantity=fmt_qty(body.duration), durationTimeUnit=body.unit,
                        licensePlate=body.plate, locationId=body.location, ratePolicyId=body.rate,
                        paymentAccountId=body.paymentAccountId)
        s.log("success", "Stationnement payé : zone %s, %s" % (body.location, body.plate))
        return {"ok": True, "expire": iso(result.get("expireTime")), "cost": result.get("cost")}

    try:
        return guarded(run)
    except HTTPException as e:
        if e.status_code == 502:
            s.log("error", "Paiement échoué (zone %s) : %s" % (body.location, e.detail))
        raise


@app.post("/api/autopilots")
def add_autopilot(body: Autopilot, pbb_session: str = Cookie(None)):
    s = current(pbb_session)
    ap = {**body.model_dump(), "duration": fmt_qty(body.duration), "id": uuid.uuid4().hex[:8], "enabled": True,
          "lastCheck": None, "lastPayment": None, "lastError": None}
    s.autopilots[ap["id"]] = ap
    threading.Thread(target=lambda: guarded(lambda: run_autopilot(s, ap)), daemon=True).start()
    return ap


@app.delete("/api/autopilots/{ap_id}")
def delete_autopilot(ap_id: str, pbb_session: str = Cookie(None)):
    current(pbb_session).autopilots.pop(ap_id, None)
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
    return FileResponse(index)


def serve(host="127.0.0.1", port=8765, open_browser=True):
    import uvicorn
    import webbrowser

    if open_browser:
        threading.Timer(1.5, lambda: webbrowser.open("http://%s:%s" % (host, port))).start()
    uvicorn.run(app, host=host, port=port, log_level="warning")
