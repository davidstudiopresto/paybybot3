import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from paybybot3 import web


def ticket(plate, zone, hours=2):
    return {"parkingSessionId": "s1", "locationId": zone, "vehicle": {"licensePlate": plate},
            "expireTime": datetime.now(timezone.utc) + timedelta(hours=hours)}


class RunningTicket(unittest.TestCase):
    """A resident with a ticket already running can activate the renewal ahead of time."""

    def setUp(self):
        self.env = patch.dict(os.environ, {"PAYBYBOT_SECRET": "test-secret"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def session(self, tickets):
        s = MagicMock()
        s.call.side_effect = lambda name, *a, **k: tickets if name == "get_parking_sessions" else None
        return s

    def test_any_zone_and_plate_spelling_count(self):
        s = self.session([ticket("FT-630-FH", "75015"), ticket("ZZ999ZZ", "75005"), ticket("FT630FH", "75005", -1)])
        self.assertEqual([x["locationId"] for x in web.running_for(s, "FT630FH")], ["75015"])

    def run_renewal(self, tickets, pay_error=None):
        row = {"id": "r1", "owner": "o", "plate": "FT630FH", "location": "75005", "rate": "101", "duration": 7,
               "unit": "Days", "payment_account_id": "c", "last_error": None}
        stored = []
        bot = MagicMock(refresh_token="t")
        with patch.object(web, "with_details", side_effect=lambda r: r), \
                patch.object(web, "guarded_state", return_value="ok"), \
                patch.object(web, "store", side_effect=lambda *a, **k: stored.append(k)), \
                patch.object(web, "notify") as mail, \
                patch.object(web.Bot, "from_refresh_token", return_value=bot), \
                patch.object(web.UserSession, "for_bot", return_value=self.session(tickets)), \
                patch.object(web, "pay_and_confirm", side_effect=pay_error or AssertionError("must not pay")) as pay:
            outcome = web.process_renewal(row, refresh_token="t")
        return outcome, stored[-1]["p_patch"], mail, pay

    def test_waits_for_a_ticket_running_in_another_zone(self):
        outcome, patch_, mail, pay = self.run_renewal([ticket("FT-630-FH", "75015")])
        self.assertEqual(outcome, "active")
        pay.assert_not_called()
        mail.assert_not_called()
        self.assertIsNone(patch_["last_error"])

    def test_vehicle_already_parked_is_not_an_error(self):
        refused = RuntimeError('Quote error: [{"reason": "VehicleAlreadyParked"}]')
        outcome, patch_, mail, _ = self.run_renewal([], pay_error=refused)
        self.assertEqual(outcome, "active")
        self.assertIsNone(patch_["last_error"])
        mail.assert_not_called()

    def test_week_price_from_history_then_paris_rate(self):
        now = datetime.now(timezone.utc)
        week = {"vehicle": {"licensePlate": "FT-630-FH"}, "ratePolicy": {"ratePolicyId": "101"},
                "startTime": now - timedelta(days=20), "expireTime": now - timedelta(days=13),
                "totalCost": {"amount": 9.5, "currency": "EUR"}}
        resident = [{"ratePolicyId": "101", "name": "Résident", "type": "Resident"}]
        body = web.QuoteRequest(location="75005", rate="101", duration=7, unit="Days", plate="FT630FH",
                                paymentAccountId="c", renewal=True)

        def session(history):
            s = MagicMock()
            s.call.side_effect = lambda name, *a, **k: {"get_past_sessions": history, "get_parking_sessions": [],
                                                        "get_rate_options": resident}[name]
            return s

        self.assertEqual(web.known_price(session([week]), body), ({"amount": 9.5, "currency": "EUR"}, "history"))
        self.assertEqual(web.known_price(session([]), body), (web.PARIS_RESIDENT_WEEK, "paris"))
        self.assertEqual(web.known_price(session([]), body.model_copy(update={"location": "69001"})), (None, None))


if __name__ == "__main__":
    unittest.main()
