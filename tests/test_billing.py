import os
import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from fastapi import HTTPException, Request

from paybybot3 import web


class Billing(unittest.TestCase):
    def setUp(self):
        self.s = web.UserSession("demo", "", demo=True)
        self.s.demo, self.s.username = False, "+33612345678"
        self.s.account = {"email": "a@b.fr", "trial_start": datetime.now(timezone.utc).isoformat()}
        self.calls = []
        self.patches = [
            patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_x", "STRIPE_PRICE_MONTHLY": "price_m",
                                    "STRIPE_PRICE_YEARLY": "price_y", "PAYBYBOT_SECRET": "t"}),
            patch.object(web, "current", return_value=self.s),
            patch.object(web, "stripe", side_effect=self.fake_stripe),
        ]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def fake_stripe(self, method, path, **data):
        self.calls.append((method, path, data))
        if path == "checkout/sessions":
            return {"url": "https://checkout.stripe.com/x"}
        return {"client_reference_id": self.owner, "status": "complete", "metadata": {"plan": "yearly"},
                "customer": "cus_1", "subscription": "sub_1"}

    def test_checkout_waits_for_the_end_of_the_free_month(self):
        self.s.account["monthlies"] = [990]  # a car in zone 1
        with patch.object(web, "account_pricing", return_value={"monthly": 990}):
            r = web.billing_checkout(web.Checkout(plan="yearly"), None, "t")
        self.assertEqual(r["url"], "https://checkout.stripe.com/x")
        data = self.calls[0][2]
        self.assertEqual((data["line_items[0][price_data][unit_amount]"],
                          data["line_items[0][price_data][recurring][interval]"]), (9504, "year"))
        self.assertNotIn("subscription_data[trial_end]", data)  # no Stripe trial: the free month already runs
        self.assertEqual((data["adaptive_pricing[enabled]"], data["payment_method_types[0]"]), ("false", "card"))
        self.assertEqual(data["subscription_data[proration_behavior]"], "none")
        trial_end = datetime.fromtimestamp(data["subscription_data[billing_cycle_anchor]"], timezone.utc)
        self.assertAlmostEqual((trial_end - datetime.now(timezone.utc)).days, 29, delta=1)

    def test_price_by_vehicle_type_and_zone(self):
        self.assertEqual(web.monthly_cents("Car", "75006"), 990)  # zone 1: arrondissements 1 to 11
        self.assertEqual(web.monthly_cents("Car", "75011"), 990)
        self.assertEqual(web.monthly_cents("Car", "75012"), 690)  # zone 2: 12 to 20
        self.assertEqual(web.monthly_cents("Motorcycle", "75008"), 690)
        self.assertEqual(web.monthly_cents("Scooter", "75017"), 490)
        self.assertEqual(web.monthly_cents("Car", None), 990)  # unknown zone: zone 1
        self.assertEqual(web.monthly_cents("Car", "75006", suv=True), 990)  # no SUV price: a car
        self.assertEqual(web.monthly_cents("Car", "75015", suv=True), 690)
        self.assertEqual(web.monthly_cents("Scooter", "75015", suv=True), 490)  # a two-wheeler is never a SUV

    def test_yearly_is_twelve_months_with_20_percent_off(self):
        self.assertEqual(web.plan_total([990], "yearly"), 9504)  # twelve months, 20 % off

    def test_no_zone_no_checkout(self):
        with patch.object(web, "account_pricing", return_value=None), \
                patch.object(web, "resident_status", return_value={"zone": None, "resident": None}), \
                self.assertRaises(HTTPException):
            web.billing_checkout(web.Checkout(plan="monthly"), None, "t")

    def test_no_resident_status_no_checkout(self):
        with patch.object(web, "account_pricing", return_value=None), \
                patch.object(web, "resident_status", return_value={"zone": "75017", "resident": False}), \
                self.assertRaises(HTTPException) as e:
            web.billing_checkout(web.Checkout(plan="monthly"), None, "t")
        self.assertIn("statut résident", e.exception.detail)

    def test_resident_status_from_the_vehicles_arrondissements(self):
        car = {"licensePlate": "AB123CD", "type": "Car"}
        with patch.object(web, "vehicle_zones", return_value=[]), \
                patch.object(web, "find_home_zone", return_value={"zone": "75017"}):
            self.assertEqual(web.resident_status(None), {"zone": "75017", "resident": False})
        with patch.object(web, "vehicle_zones", return_value=[(car, "75011", {"ratePolicyId": "1"})]):
            self.assertEqual(web.resident_status(None), {"zone": "75011", "resident": True})

    def test_a_move_reprices_from_the_next_billing_date(self):
        account = {"stripe_subscription": "sub_1", "monthlies": [690], "billed_monthlies": [990],
                   "plan": "monthly", "email": "a@b.fr", "price_zone": "75015"}
        sub = {"status": "active", "current_period_end": 1800000000,
               "items": {"data": [{"id": "si_1", "price": {"product": "prod_1", "unit_amount": 990,
                                                           "recurring": {"interval": "month"}}}]}}
        calls = []

        def fake(method, path, **data):
            calls.append((method, path, data))
            return sub
        with patch.object(web, "stripe", side_effect=fake), patch.object(web, "save_account_by_owner") as saved, \
                patch.object(web, "send_email") as mail:
            self.assertTrue(web.reprice(account, "o"))
        mail.assert_not_called()  # no e-mail on a zone change
        update = calls[-1][2]
        self.assertEqual((update["items[0][price_data][unit_amount]"], update["proration_behavior"]), (690, "none"))
        saved.assert_called_with("o", {"billed_monthlies": [690]})

    def test_one_price_per_vehicle_and_the_subscription_for_the_renewed_ones(self):
        self.assertEqual(web.plan_total([990, 490]), 1480)
        found = [({"licensePlate": "AB-123-CD", "type": "Car"}, "75006", {}),
                 ({"licensePlate": "EF-456-GH", "type": "Scooter"}, "75015", {})]
        with patch.object(web, "vehicle_zones", return_value=found), \
                patch.object(web, "load_account", return_value={}), \
                patch.object(web, "save_account", side_effect=lambda s, p: p), patch.object(web, "reprice"):
            with patch.object(web, "renewed_plates", return_value=set()):  # none renewed yet: the first one
                p = web.account_pricing(self.s)
                self.assertEqual((p["billed"], p["monthly"]), (["AB-123-CD"], 990))
            with patch.object(web, "renewed_plates", return_value={"AB123CD", "EF456GH"}):
                p = web.account_pricing(self.s)
                self.assertEqual((p["monthly"], [v["monthly"] for v in p["vehicles"]]), (1480, [990, 490]))
        with patch.object(web, "vehicle_zones", return_value=found), \
                patch.object(web, "load_account", return_value={"suv_plates": ["AB123CD"]}), \
                patch.object(web, "save_account", side_effect=lambda s, p: p), patch.object(web, "reprice"), \
                patch.object(web, "renewed_plates", return_value={"AB123CD"}):
            self.assertEqual(web.account_pricing(self.s)["monthly"], 990)  # an old SUV tick: car price

    def test_checkout_bills_every_renewed_vehicle(self):
        self.assertEqual(web.account_monthlies({"monthlies": [990, 490]}), [990, 490])
        self.assertEqual(web.account_monthlies({"weekly_cents": 900}), [990])  # not priced with the grid yet
        self.assertEqual(web.monthlies_from({"monthlies": "490,990"}), [490, 990])
        self.assertIsNone(web.billed_monthlies({"billed_weeklies": [900]}))  # the old rule: repriced

    def test_confirm_records_the_plan(self):
        self.owner = web.owner_id(self.s.username)
        web.billing_confirm(web.CheckoutDone(session_id="cs_test_1234567890"), "t")
        self.assertEqual((self.s.account["plan"], self.s.account["stripe_customer"]), ("yearly", "cus_1"))

    def test_someone_elses_payment_is_refused(self):
        self.owner = "someone-else"
        with self.assertRaises(HTTPException):
            web.billing_confirm(web.CheckoutDone(session_id="cs_test_1234567890"), "t")
        self.assertNotIn("plan", self.s.account)


class Blocking(unittest.TestCase):
    """No payment, no renewal: the running ticket stays, the next one is not paid."""

    def setUp(self):
        self.env = patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_x", "PAYBYBOT_SECRET": "t",
                                           "PAYBYBOT_ADMINS": ""})
        self.env.start()
        self.status = "active"

    def tearDown(self):
        self.env.stop()

    def fake_stripe(self, method, path, **data):
        if path.startswith("subscriptions/"):
            return {"status": self.status, "latest_invoice": "in_1"}
        if path.startswith("invoices/"):
            return {"status": "open", "hosted_invoice_url": "https://invoice.stripe.com/i/1"}
        if path == "checkout/sessions":
            return {"url": "https://checkout.stripe.com/x"}
        return {}

    def state(self, account, owner="o"):
        with patch.object(web, "stripe", side_effect=self.fake_stripe):
            return web.billing_state(account, owner)

    def test_states(self):
        now = datetime.now(timezone.utc)
        running = {"trial_start": now.isoformat()}
        over = {"trial_start": (now - timedelta(days=31)).isoformat()}
        self.assertEqual(self.state(running), "trial")
        self.assertEqual(self.state(over), "trial_over")
        self.assertEqual(self.state({**over, "stripe_subscription": "sub_1"}), "ok")
        self.status = "past_due"
        self.assertEqual(self.state({**over, "stripe_subscription": "sub_1"}), "unpaid")
        self.status = "canceled"
        self.assertEqual(self.state({**over, "stripe_subscription": "sub_1"}), "trial_over")
        self.assertEqual(self.state({}), "ok")  # renewals stored before accounts existed

    def test_the_site_owner_is_never_blocked(self):
        over = {"trial_start": (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()}
        with patch.dict(os.environ, {"PAYBYBOT_ADMINS": "0612345678"}):
            self.assertEqual(self.state(over, web.owner_id("+33612345678")), "ok")

    def run_renewal(self, previous_error=None):
        row = {"id": "r1", "owner": "o", "plate": "AB123CD", "location": "75017", "last_error": previous_error}
        stored = []
        with patch.object(web, "with_details", side_effect=lambda r: r), \
                patch.object(web, "guarded_state", return_value="trial_over"), \
                patch.object(web, "store", side_effect=lambda *a, **k: stored.append(k)), \
                patch.object(web, "notify_blocked") as mail, \
                patch.object(web.Bot, "from_refresh_token") as login:
            outcome = web.process_renewal(row)
        login.assert_not_called()  # no PayByPhone login, nothing paid
        return outcome, stored, mail

    def test_a_blocked_renewal_is_not_paid_and_mailed_once(self):
        outcome, stored, mail = self.run_renewal()
        self.assertEqual(outcome, "blocked")
        self.assertEqual(stored[0]["p_patch"]["last_error"], web.BLOCKED)
        mail.assert_called_once()
        _, _, mail = self.run_renewal(previous_error=web.BLOCKED)
        mail.assert_not_called()

    def test_the_email_link_leads_to_stripe(self):
        over = {"trial_start": (datetime.now(timezone.utc) - timedelta(days=31)).isoformat()}
        link = web.unlock_link("o")
        token = link.split("t=", 1)[1]
        with patch.object(web, "stripe", side_effect=self.fake_stripe), \
                patch.object(web, "account_by_owner", return_value=over):
            r = web.billing_unlock(t=token)
            self.assertEqual(r.headers["location"], "https://checkout.stripe.com/x")
            self.status = "past_due"
            with patch.object(web, "account_by_owner", return_value={**over, "stripe_subscription": "sub_1"}):
                r = web.billing_unlock(t=token)
            self.assertEqual(r.headers["location"], "https://invoice.stripe.com/i/1")
            r = web.billing_unlock(t="forged")
        self.assertTrue(r.headers["location"].endswith("/#/tarifs"))


if __name__ == "__main__":
    unittest.main()


class RecoverSubscription(unittest.TestCase):
    """Paid on Stripe, but the return page never loaded: the subscription is found by its owner and kept."""

    def test_a_paid_subscription_is_found_and_unblocks(self):
        over = {"trial_start": (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()}
        saved = []
        found = {"data": [{"id": "sub_9", "status": "active", "customer": "cus_9", "metadata": {"owner": "o"},
                           "items": {"data": [{"price": {"recurring": {"interval": "year"}}}]}}]}
        with patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_x"}), \
                patch.object(web, "stripe", return_value=found) as call, \
                patch.object(web, "save_account_by_owner", side_effect=lambda o, p: saved.append((o, p))):
            self.assertEqual(web.billing_state(over, "o"), "ok")
        self.assertIn("subscriptions/search", call.call_args[0][1])
        self.assertEqual(saved, [("o", {"stripe_subscription": "sub_9", "stripe_customer": "cus_9", "plan": "yearly"})])

    def test_nothing_on_stripe_stays_blocked(self):
        over = {"trial_start": (datetime.now(timezone.utc) - timedelta(days=40)).isoformat()}
        with patch.dict(os.environ, {"STRIPE_SECRET_KEY": "sk_test_x"}), \
                patch.object(web, "stripe", return_value={"data": []}):
            self.assertEqual(web.billing_state(over, "o"), "trial_over")
