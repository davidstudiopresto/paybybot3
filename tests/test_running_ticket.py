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

    def session(self, tickets, rates=None, cards=("c",)):
        rates = [{"ratePolicyId": "101", "name": "Résident", "type": "Resident"}] if rates is None else rates
        answers = {"get_parking_sessions": tickets, "get_rate_options": rates,
                   "get_payment_accounts": {"paymentCards": [{"paymentAccountId": c} for c in cards]}}
        s = MagicMock()
        s.call.side_effect = lambda name, *a, **k: answers.get(name)
        return s

    def test_any_zone_and_plate_spelling_count(self):
        s = self.session([ticket("FT-630-FH", "75015"), ticket("ZZ999ZZ", "75005"), ticket("FT630FH", "75005", -1)])
        self.assertEqual([x["locationId"] for x in web.running_for(s, "FT630FH")], ["75015"])

    def run_renewal(self, tickets, pay_error=None, last_error=None, **account):
        row = {"id": "r1", "owner": "o", "plate": "FT630FH", "location": "75005", "rate": "101", "duration": 7,
               "unit": "Days", "payment_account_id": "c", "last_error": last_error}
        stored = []
        bot = MagicMock(refresh_token="t")
        with patch.object(web, "with_details", side_effect=lambda r: r), \
                patch.object(web, "guarded_state", return_value="ok"), \
                patch.object(web, "store", side_effect=lambda *a, **k: stored.append(k)), \
                patch.object(web, "notify") as mail, \
                patch.object(web.Bot, "from_refresh_token", return_value=bot), \
                patch.object(web.UserSession, "for_bot", return_value=self.session(tickets, **account)), \
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

    def test_bank_asking_to_confirm_is_tried_again_in_an_hour(self):
        before = datetime.now(timezone.utc)
        outcome, patch_, mail, _ = self.run_renewal([], pay_error=web.BankCheck(web.BANK_CHECK))
        self.assertEqual(outcome, "unconfirmed")
        self.assertNotIn("enabled", patch_)
        self.assertIn("3-D Secure", patch_["last_error"])
        retry = datetime.fromisoformat(patch_["next_check"]) - before
        self.assertTrue(timedelta(minutes=59) < retry < timedelta(minutes=61))
        mail.assert_called_once()
        self.assertFalse(mail.call_args.kwargs["suspended"])

    def test_bank_refusing_again_suspends_with_its_reason(self):
        outcome, patch_, mail, _ = self.run_renewal([], pay_error=web.BankCheck(web.BANK_CHECK),
                                                    last_error=web.BANK_CHECK)
        self.assertEqual(outcome, "unconfirmed")
        self.assertFalse(patch_["enabled"])
        self.assertIn("3-D Secure", patch_["last_error"])
        self.assertIn("suspendu", patch_["last_error"])
        mail.assert_called_once()  # this time to say it is suspended
        self.assertTrue(mail.call_args.kwargs["suspended"])

    def test_resident_rate_refused_is_said_before_paying(self):
        refused = [{"ratePolicyId": "101", "name": "Résident", "parkingNotAllowedReason": "PermitExpired"}]
        outcome, patch_, _, pay = self.run_renewal([], rates=refused)
        self.assertEqual(outcome, "not_payable")
        pay.assert_not_called()
        self.assertIn("PermitExpired", patch_["last_error"])

    def test_no_card_is_said_before_paying(self):
        outcome, patch_, _, pay = self.run_renewal([], cards=())
        self.assertEqual(outcome, "not_payable")
        pay.assert_not_called()
        self.assertEqual(patch_["last_error"], web.NO_CARD)

    def test_a_removed_card_falls_back_to_another(self):
        s = self.session([], cards=("other",))
        self.assertEqual(web.check_payable(s, "75005", "101", "FT630FH", "c"), "other")

    def check(self, tickets=(), pay=None, **account):
        s = self.session(list(tickets), **account)
        s.demo = False
        body = web.Parking(location="75005", rate="101", duration=7, unit="Days", plate="FT630FH", paymentAccountId="c")
        with patch.object(web, "current", return_value=s), \
                patch.object(web, "pay_and_confirm", side_effect=pay or AssertionError("must not pay")) as paid:
            try:
                return web.renewal_check(body, "token"), paid
            except web.HTTPException as e:
                return e, paid

    def test_check_before_the_offer_rejects_a_card_that_needs_3d_secure(self):
        answer, _ = self.check(pay=lambda *a, **k: ({"challenged": True}, [ticket("FT630FH", "75005")]))
        self.assertEqual(answer.status_code, 409)
        self.assertIn("banque a refusé", answer.detail)

    def test_check_before_the_offer_pays_the_first_week(self):
        answer, paid = self.check(pay=lambda *a, **k: ({"challenged": False, "cost": None}, [ticket("FT630FH", "75005")]))
        self.assertTrue(answer["paid"])

    def test_check_before_the_offer_does_not_pay_over_a_running_ticket(self):
        answer, paid = self.check(tickets=[ticket("FT-630-FH", "75015")])
        self.assertEqual(answer, {"ok": True, "paid": False})
        paid.assert_not_called()

    def test_check_before_the_offer_needs_a_card(self):
        answer, _ = self.check(cards=())
        self.assertEqual((answer.status_code, answer.detail), (400, web.NO_CARD))

    def accounts(self, *cards):
        s = MagicMock()
        rates = [{"ratePolicyId": "101", "name": "Résident", "type": "Resident"}]
        s.call.side_effect = lambda name, *a, **k: {"get_rate_options": rates,
                                                     "get_payment_accounts": {"paymentCards": list(cards)}}.get(name)
        return s

    def test_an_expired_card_is_not_used(self):
        old = {"paymentAccountId": "c", "cardType": "Visa", "maskedCardNumber": "1111", "expiryMonth": 1, "expiryYear": 2020}
        new = {"paymentAccountId": "n", "cardType": "Visa", "maskedCardNumber": "2222", "expiryMonth": 1, "expiryYear": 2099}
        self.assertEqual(web.check_payable(self.accounts(old, new), "75005", "101", "FT630FH", "c"), "n")
        with self.assertRaises(web.NotPayable) as refused:
            web.check_payable(self.accounts(old), "75005", "101", "FT630FH", "c")
        self.assertIn("exp. 01/20", str(refused.exception))

    def test_a_card_is_valid_until_the_end_of_its_month(self):
        until = web.card_valid_until({"expiryMonth": 2, "expiryYear": 28})
        self.assertEqual((until.year, until.month, until.day), (2028, 2, 29))


if __name__ == "__main__":
    unittest.main()
