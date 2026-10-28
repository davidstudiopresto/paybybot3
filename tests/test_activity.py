import json
import os
import unittest
from types import SimpleNamespace
from unittest.mock import patch

from paybybot3 import web


def user(demo=False):
    return SimpleNamespace(demo=demo, username="0612345678")


class Activity(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {"PAYBYBOT_SECRET": "s" * 40})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def record(self, s=None, hosted=True):
        calls = []
        with patch.object(web, "HOSTED", hosted), \
                patch.object(web, "store", side_effect=lambda fn, **k: calls.append((fn, k))), \
                patch.object(web, "load_account", return_value={"email": "julie@gmail.com"}), \
                patch.object(web, "first_name", return_value="Julie"):
            web.record_activity("Connexion", s if s is not None else user(), ["Véhicule AB***."])
        return calls

    def test_an_action_is_recorded_encrypted_with_who_did_it(self):
        (fn, k), = self.record()
        self.assertEqual((fn, k["p_event"]), ("activity_add", "Connexion"))
        self.assertNotIn("julie", k["p_data"])  # encrypted
        with patch.object(web, "store", return_value=[{"at": "2026-10-28T09:00:00Z", "event": "Connexion",
                                                        "data": k["p_data"]}]):
            self.assertEqual(web.activity_rows(), [{"id": None, "at": "2026-10-28T09:00:00Z", "event": "Connexion",
                                                    "who": "Julie · julie@gmail.com", "detail": "Véhicule AB***.",
                                                    "visitor": None}])

    def test_no_e_mail(self):
        with patch.object(web, "send_email") as mail:
            self.record()
        mail.assert_not_called()

    def test_not_for_the_demo_nor_locally(self):
        self.assertEqual(self.record(s=user(demo=True)), [])
        self.assertEqual(self.record(hosted=False), [])

    def test_not_for_the_owners_own_accounts(self):
        with patch.object(web, "is_admin", return_value=True):
            self.assertEqual(self.record(), [])

    def test_never_raises(self):
        with patch.object(web, "HOSTED", True), patch.object(web, "store", side_effect=RuntimeError("down")):
            web.record_activity("Connexion", user())


class LinkVisitor(unittest.TestCase):
    """Each device sends a random id with the link it opens: « Activité » groups the visits of one visitor."""

    def setUp(self):
        self.env = patch.dict(os.environ, {"PAYBYBOT_SECRET": "s" * 40})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def request(self):
        return SimpleNamespace(headers={"x-vercel-ip-city": "Paris", "x-vercel-ip-country": "FR"})

    def test_the_visitor_id_is_kept_encrypted_and_read_back(self):
        calls = []
        with patch.object(web, "HOSTED", True), \
                patch.object(web, "store", side_effect=lambda fn, **k: calls.append((fn, k)) or 7):
            web.link_open(web.LinkOpen(source="Direct", device="Ordinateur", visit=3, visitor="a1b2c3d4e5f6"),
                          self.request())
            web.link_progress(web.LinkProgress(id=7, sig=web.link_sig(7), source="Direct", device="Ordinateur",
                                               visit=3, visitor="a1b2c3d4e5f6", seconds=40), self.request())
        (_, opened), (_, progressed) = calls
        for data in (opened["p_data"], progressed["p_data"]):
            self.assertNotIn("a1b2c3d4e5f6", data)
            with patch.object(web, "store", return_value=[{"id": 7, "at": "t", "event": "Lien privé ouvert",
                                                            "data": data}]):
                self.assertEqual(web.activity_rows()[0]["visitor"], "a1b2c3d4e5f6")

    def test_an_odd_visitor_id_is_refused(self):
        with self.assertRaises(Exception):
            web.LinkOpen(visitor="<script>")


if __name__ == "__main__":
    unittest.main()
