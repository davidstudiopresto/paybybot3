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
        r = web.billing_checkout(web.Checkout(plan="yearly"), None, "t")
        self.assertEqual(r["url"], "https://checkout.stripe.com/x")
        data = self.calls[0][2]
        self.assertEqual((data["line_items[0][price_data][unit_amount]"],
                          data["line_items[0][price_data][recurring][interval]"]), (9120, "year"))
        self.assertNotIn("subscription_data[trial_end]", data)  # no Stripe trial: the free month already runs
        self.assertEqual(data["subscription_data[proration_behavior]"], "none")
        trial_end = datetime.fromtimestamp(data["subscription_data[billing_cycle_anchor]"], timezone.utc)
        self.assertAlmostEqual((trial_end - datetime.now(timezone.utc)).days, 29, delta=1)

    def test_confirm_records_the_plan(self):
        self.owner = web.owner_id(self.s.username)
        web.billing_confirm(web.CheckoutDone(session_id="cs_test_1234567890"), "t")
        self.assertEqual((self.s.account["plan"], self.s.account["stripe_customer"]), ("yearly", "cus_1"))

    def test_someone_elses_payment_is_refused(self):
        self.owner = "someone-else"
        with self.assertRaises(HTTPException):
            web.billing_confirm(web.CheckoutDone(session_id="cs_test_1234567890"), "t")
        self.assertNotIn("plan", self.s.account)


if __name__ == "__main__":
    unittest.main()
