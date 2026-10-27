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
                                                    "who": "Julie · julie@gmail.com", "detail": "Véhicule AB***."}])

    def test_no_e_mail(self):
        with patch.object(web, "send_email") as mail:
            self.record()
        mail.assert_not_called()

    def test_not_for_the_demo_nor_locally(self):
        self.assertEqual(self.record(s=user(demo=True)), [])
        self.assertEqual(self.record(hosted=False), [])

    def test_never_raises(self):
        with patch.object(web, "HOSTED", True), patch.object(web, "store", side_effect=RuntimeError("down")):
            web.record_activity("Connexion", user())


if __name__ == "__main__":
    unittest.main()
