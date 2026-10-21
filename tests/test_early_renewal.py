import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from paybybot3 import web


class EarlyRenewal(unittest.TestCase):
    """The weekly renewal adds the next week to the running ticket a day before it ends."""

    def setUp(self):
        self.env = patch.dict(os.environ, {"PAYBYBOT_SECRET": "test-secret"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def run_renewal(self, hours_left, extend=None, zone="75005", rate="101", **row_extra):
        now = datetime.now(timezone.utc)
        ticket = {"parkingSessionId": "s1", "locationId": zone, "vehicle": {"licensePlate": "FT630FH"},
                  "rateOption": {"ratePolicyId": rate}, "expireTime": now + timedelta(hours=hours_left)}
        extended = dict(ticket, expireTime=ticket["expireTime"] + timedelta(days=7))
        state = {"extended": False}

        def call(name, *a, **k):
            if name == "get_parking_sessions":
                return [extended if state["extended"] else ticket]
            if name == "get_rate_options":
                return [{"ratePolicyId": "101", "name": "Résident", "type": "Resident"}]
            if name == "get_payment_accounts":
                return {"paymentCards": [{"paymentAccountId": "c"}]}
            if name == "extend":
                if isinstance(extend, Exception):
                    raise extend
                result = extend or {"cost": {"amount": 9.0}}
                state["extended"] = not result.get("challenged")
                return result
            raise AssertionError(name)

        session = MagicMock(demo=True, attempts=[], unconfirmed={})
        session.call.side_effect = call
        row = {"id": "r1", "owner": "o", "plate": "FT630FH", "location": "75005", "rate": "101", "duration": 7,
               "unit": "Days", "payment_account_id": "c", "last_error": None, **row_extra}
        stored = []
        with patch.object(web, "with_details", side_effect=lambda r: r), \
                patch.object(web, "guarded_state", return_value="ok"), \
                patch.object(web, "store", side_effect=lambda *a, **k: stored.append(k)), \
                patch.object(web, "notify") as mail, \
                patch.object(web.Bot, "from_refresh_token", return_value=MagicMock(refresh_token="t")), \
                patch.object(web.UserSession, "for_bot", return_value=session), \
                patch.object(web, "log_diagnosis"), \
                patch.object(web, "pay_and_confirm", side_effect=AssertionError("must not buy a new ticket")):
            outcome = web.process_renewal(row, refresh_token="t")
        p = stored[-1]["p_patch"]
        return outcome, p, mail, session, ticket, datetime.fromisoformat(p["next_check"])

    def test_extends_a_day_before_the_end(self):
        outcome, p, mail, session, ticket, next_check = self.run_renewal(hours_left=10)
        self.assertEqual(outcome, "paid")
        self.assertIn("extend", [c.args[0] for c in session.call.call_args_list])
        new_end = ticket["expireTime"] + timedelta(days=7)
        self.assertEqual(next_check, new_end - web.EARLY_RENEWAL)
        self.assertEqual(mail.call_args.args[1], "paid")

    def test_waits_until_a_day_before_the_end(self):
        outcome, p, mail, session, ticket, next_check = self.run_renewal(hours_left=72)
        self.assertEqual(outcome, "active")
        self.assertNotIn("extend", [c.args[0] for c in session.call.call_args_list])
        self.assertEqual(next_check, ticket["expireTime"] - web.EARLY_RENEWAL)

    def test_extension_refused_buys_at_the_end_as_before(self):
        refused = RuntimeError('Quote error: [{"reason": "MaxStayExceeded"}]')
        outcome, p, mail, session, ticket, next_check = self.run_renewal(hours_left=10, extend=refused)
        self.assertEqual(outcome, "active")
        self.assertEqual(next_check, ticket["expireTime"] + timedelta(seconds=30))
        mail.assert_not_called()

    def test_bank_refusal_leaves_a_day_and_tries_again_in_an_hour(self):
        challenged = {"challenged": True, "jobStages": [{"status": "authenticationChallengePending"}]}
        before = datetime.now(timezone.utc)
        outcome, p, mail, session, ticket, next_check = self.run_renewal(hours_left=20, extend=challenged)
        self.assertEqual(outcome, "unconfirmed")
        self.assertTrue(timedelta(minutes=59) < next_check - before < timedelta(minutes=61))
        self.assertEqual(mail.call_args.args[1], "problem")

    def test_no_extension_into_a_pause(self):
        pause = (datetime.now(timezone.utc) + timedelta(hours=5)).isoformat()
        outcome, p, mail, session, ticket, next_check = self.run_renewal(hours_left=10, paused_from=pause)
        self.assertEqual(outcome, "active")
        self.assertNotIn("extend", [c.args[0] for c in session.call.call_args_list])

    def test_a_ticket_in_another_zone_is_not_extended(self):
        outcome, p, mail, session, ticket, next_check = self.run_renewal(hours_left=10, zone="75015")
        self.assertEqual(outcome, "active")
        self.assertEqual(next_check, ticket["expireTime"] + timedelta(seconds=30))


if __name__ == "__main__":
    unittest.main()


class ActivationMessage(unittest.TestCase):
    """What activating says, on screen and in the e-mail, for each case."""

    row = {"location": "75005", "rate": "101"}

    def t(self, hours_left, started_hours_ago=48, zone="75005"):
        now = datetime.now(timezone.utc)
        return {"parkingSessionId": "s1", "locationId": zone, "rateOption": {"ratePolicyId": "101"},
                "startTime": now - timedelta(hours=started_hours_ago), "expireTime": now + timedelta(hours=hours_left)}

    def test_cases(self):
        running = self.t(72)
        self.assertEqual(web.activation_case("active", [running], [running], self.row)[0], "later")
        self.assertEqual(web.activation_case("paid", [], [self.t(168, 0)], self.row)[0], "first")
        just_paid = self.t(168, started_hours_ago=0.1)  # the check before the offer page paid it
        self.assertEqual(web.activation_case("active", [just_paid], [just_paid], self.row)[0], "first")
        self.assertEqual(web.activation_case("paid", [self.t(10)], [self.t(178)], self.row)[0], "extended")
        other = self.t(10, zone="75015")
        self.assertEqual(web.activation_case("active", [other], [other], self.row)[0], "atEnd")

    def test_later_says_when_the_next_week_is_paid(self):
        running = self.t(72)
        case, expire, next_payment = web.activation_case("active", [running], [running], self.row)
        title, text = web.activation_message(case, expire, next_payment)
        self.assertIn("Votre ticket court jusqu'au", title)
        self.assertIn(web.paris_text(running["expireTime"] - timedelta(hours=24)), text)

    def test_the_e_mail_says_who_pays_when_a_payment_fails(self):
        with patch.object(web, "send_email") as send:
            web.notify({"email": "a@b.fr", "plate": "FT630FH", "location": "75005"}, "activated",
                       message=("Titre.", "Texte."))
        lines = send.call_args.args[3]
        self.assertEqual(lines[1:3], ["Titre.", "Texte."])
        self.assertEqual(lines[-1], web.PAY_YOURSELF)
