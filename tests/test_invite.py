import unittest
from unittest.mock import patch

from fastapi import HTTPException

from paybybot3 import web


class Invite(unittest.TestCase):
    def test_a_users_code_is_valid_and_a_made_up_one_is_not(self):
        code = web.invite_code(web.owner_id("0611223344"))
        self.assertEqual(len(code), 14)
        self.assertTrue(web.valid_invite(code))
        self.assertTrue(web.valid_invite(code.upper()))
        self.assertFalse(web.valid_invite(code[:8] + "000000"))
        self.assertFalse(web.valid_invite(""))
        self.assertFalse(web.valid_invite("not a code"))

    def test_invite_only_sign_up_needs_a_valid_code(self):
        body = web.Login(username="0611223344", password="x", signup=True, email="a@b.fr", accepted=True)
        with patch.object(web, "INVITE_ONLY", True), patch.object(web, "HOSTED", False), \
                self.assertRaises(HTTPException) as refused:
            web.login(body, None, None)
        self.assertEqual(refused.exception.status_code, 403)

    def test_one_shared_link_when_set(self):
        with patch.object(web, "SHARED_INVITE", "paris2026"):
            self.assertTrue(web.valid_invite("paris2026"))
            self.assertFalse(web.valid_invite("paris2027"))
            self.assertFalse(web.valid_invite(web.invite_code(web.owner_id("0611223344"))))  # no personal codes then

    def test_link_open_records_where_from_without_ip(self):
        class Req:
            headers = {"x-vercel-ip-city": "Paris%2015e", "x-vercel-ip-country": "FR", "x-real-ip": "203.0.113.7"}
        with patch.object(web, "record_activity") as recorded:
            web.link_open(web.LinkOpen(source="WhatsApp", device="iPhone"), Req())
        event, detail = recorded.call_args.args[0], recorded.call_args.kwargs["lines"][0]
        self.assertEqual(event, "Lien privé ouvert")
        self.assertEqual(detail, "WhatsApp · iPhone · Paris 15e, FR")
        self.assertNotIn("203.0.113.7", detail)
