import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from paybybot3 import web


class CheckMail(unittest.TestCase):
    """The check before activating could not pay: an e-mail with the PayByPhone button, one an hour per car."""

    def setUp(self):
        self.s = web.UserSession("demo", "", demo=True)
        self.s.demo = False
        self.s.account = {"email": "a@b.fr"}
        self.sent = []
        self.patches = [patch.object(web, "HOSTED", True),
                        patch.object(web, "load_account", side_effect=lambda s: dict(s.account)),
                        patch.object(web, "save_account", side_effect=self.save),
                        patch.object(web, "send_email", side_effect=lambda *a, **k: self.sent.append(a))]
        for p in self.patches:
            p.start()

    def tearDown(self):
        for p in self.patches:
            p.stop()

    def save(self, s, patch_):
        s.account = {**s.account, **patch_}
        return s.account

    def test_one_e_mail_an_hour_with_the_paybyphone_button(self):
        web.mail_check_failed(self.s, "FT630FH", web.CARD_NEEDS_CHECK)
        web.mail_check_failed(self.s, "FT630FH", web.CARD_NEEDS_CHECK)
        self.assertEqual(len(self.sent), 1)
        self.assertEqual(self.sent[0][4], ("Ouvrir PayByPhone", web.PAYBYPHONE_URL))
        self.s.account["check_mailed"]["FT630FH"] = (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        web.mail_check_failed(self.s, "FT630FH", web.CARD_NEEDS_CHECK)
        self.assertEqual(len(self.sent), 2)


if __name__ == "__main__":
    unittest.main()
