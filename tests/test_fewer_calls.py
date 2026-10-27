import unittest
from unittest.mock import patch

from paybybot3 import bot as botmod, web
from paybybot3.bot import Bot


def bare_bot():
    b = Bot.__new__(Bot)  # no login: only the methods under test run
    return b


class VendorKept(unittest.TestCase):
    def setUp(self):
        botmod._VENDORS.clear()

    def test_a_zones_vendor_is_asked_once_for_all_accounts(self):
        answer = {"getLocationsV1": [{"locationId": "75017", "legacyVendorId": 42}]}
        with patch.object(Bot, "_graphql", return_value=answer) as graphql:
            self.assertEqual(bare_bot()._get_vendor_id("75017"), 42)
            self.assertEqual(bare_bot()._get_vendor_id(75017), 42)
        self.assertEqual(graphql.call_count, 1)

    def test_an_unknown_zone_is_asked_again(self):
        with patch.object(Bot, "_graphql", return_value={"getLocationsV1": []}) as graphql:
            bare_bot()._get_vendor_id("1")
            bare_bot()._get_vendor_id("1")
        self.assertEqual(graphql.call_count, 2)


class CardsOncePerPayment(unittest.TestCase):
    def test_the_cards_are_asked_once_for_several_lookups(self):
        b = bare_bot()
        cards = {"paymentCards": [{"paymentAccountId": "c1", "cardType": "Visa", "paymentScope": "s"}]}
        with patch.object(Bot, "get_payment_accounts", return_value=cards) as accounts:
            self.assertEqual(b._resolve_payment("c1"), ("Visa", "s"))
            self.assertEqual(b._resolve_payment("c1"), ("Visa", "s"))
        self.assertEqual(accounts.call_count, 1)


class AdminKept(unittest.TestCase):
    def setUp(self):
        web._admin_parking.clear()

    def test_reopening_the_admin_does_not_log_in_again(self):
        logins = []

        class FakeBot:
            def get_vehicles(self):
                return [{"licensePlate": "AB123CD"}]

            def get_parking_sessions(self):
                return []

        def login(_, owner):
            logins.append(owner)
            return FakeBot()
        rows = [{"owner": "o1", "data": "x", "renewals_active": 1}]
        with patch.object(web, "HOSTED", True), patch.object(web, "require_admin"), \
                patch.object(web, "store", return_value=rows), patch.object(web, "bot_from_refresh", side_effect=login), \
                patch.object(web, "_fernet") as fernet:
            fernet.return_value.decrypt.return_value = b"{}"
            web.admin_clients(None)
            clients = web.admin_clients(None)
        self.assertEqual(logins, ["o1"])
        self.assertEqual(clients[0]["vehicles"], [{"plate": "AB123CD", "expire": None}])
