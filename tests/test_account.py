import unittest
from unittest.mock import patch

from fastapi import HTTPException, Response

from paybybot3 import web


class Account(unittest.TestCase):
    def setUp(self):
        self.s = web.UserSession("demo", "", demo=True)
        self.s.demo = False  # behave like a real local account (no e-mail is sent in demo)
        self.current = patch.object(web, "current", return_value=self.s)
        self.current.start()

    def tearDown(self):
        self.current.stop()

    def test_manual_zone_comes_first(self):
        web.update_account(web.AccountPatch(zone="75017"), "t")
        self.assertEqual(web.get_account("t"), {"email": "", "zone": "75017"})
        self.assertEqual(web.resident_zone("t"), {"zone": "75017", "manual": True})

    def test_deleting_sends_a_confirmation_and_erases(self):
        web.update_account(web.AccountPatch(email="a@b.fr"), "t")
        with patch.object(web, "send_email") as send:
            web.delete_my_data(Response(), "t")
        self.assertEqual(send.call_args.args[0], "a@b.fr")
        self.assertEqual(self.s.account, {})

    def test_sign_up_needs_an_email_and_a_zone(self):
        with self.assertRaises(HTTPException):
            web.login(web.Login(username="+33612345678", password="x", signup=True, zone="75017"), None, Response())
        with self.assertRaises(HTTPException):
            web.login(web.Login(username="+33612345678", password="x", signup=True, email="a@b.fr"), None, Response())

    def test_sign_up_refused_when_the_account_exists(self):
        web.update_account(web.AccountPatch(email="a@b.fr"), "t")
        self.assertTrue(web.has_account(self.s))
        with patch.object(web, "UserSession", return_value=self.s), self.assertRaises(HTTPException) as e:
            web.login(web.Login(username="+33612345678", password="x", signup=True, email="c@d.fr", zone="75017"),
                      None, Response())
        self.assertEqual(e.exception.status_code, 409)

    def test_sign_up_saves_email_and_zone(self):
        fresh = web.UserSession("demo", "", demo=True)
        fresh.demo = False
        with patch.object(web, "UserSession", return_value=fresh):
            web.login(web.Login(username="+33612345678", password="x", signup=True, email="c@d.fr", zone="75017"),
                      None, Response())
        self.assertEqual(fresh.account, {"email": "c@d.fr", "zone": "75017"})


class HostedLogin(unittest.TestCase):
    def test_login_without_account_is_refused_online(self):
        s = web.UserSession("demo", "", demo=True)
        s.demo = False
        with patch.object(web, "HOSTED", True), patch.object(web, "UserSession", return_value=s), \
                patch.object(web, "has_account", return_value=False), patch.object(web, "check_login_rate"), \
                self.assertRaises(HTTPException) as e:
            web.login(web.Login(username="+33612345678", password="x", accepted=True), None, Response())
        self.assertEqual(e.exception.status_code, 404)


if __name__ == "__main__":
    unittest.main()
