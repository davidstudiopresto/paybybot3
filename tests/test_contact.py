import os
import unittest
from unittest.mock import patch

from fastapi import HTTPException, Request
from pydantic import ValidationError

from paybybot3 import web


class Contact(unittest.TestCase):
    """The « Contact » window e-mails the message to the contact address, replies going to the visitor."""

    def setUp(self):
        self.env = patch.dict(os.environ, {"PAYBYBOT_SECRET": "test-secret"})
        self.env.start()

    def tearDown(self):
        self.env.stop()

    def post(self, **body):
        request = Request({"type": "http", "headers": [], "method": "POST", "path": "/api/contact"})
        return web.contact(web.ContactMessage(**body), request, None)

    def test_sends_to_the_contact_address_with_the_visitor_as_reply_to(self):
        with patch.object(web, "send_email", return_value=True) as send:
            r = self.post(email="ana@exemple.fr", message="Bonjour,\n\nJ'ai une question.")
        self.assertEqual(r, {"ok": True})
        args, kwargs = send.call_args
        self.assertEqual(args[0], web.MAIL_REPLY_TO)
        self.assertEqual(kwargs["reply_to"], "ana@exemple.fr")
        self.assertEqual(args[3], ["De : ana@exemple.fr", "Bonjour,", "J'ai une question."])

    def test_bots_filling_the_hidden_field_send_nothing(self):
        with patch.object(web, "send_email") as send:
            r = self.post(email="bot@exemple.fr", message="spam", website="x")
        self.assertEqual(r, {"ok": True})
        send.assert_not_called()

    def test_a_wrong_address_is_refused(self):
        with self.assertRaises(ValidationError):
            web.ContactMessage(email="pas-une-adresse", message="Bonjour")

    def test_says_so_when_the_e_mail_cannot_leave(self):
        with patch.object(web, "send_email", return_value=False), self.assertRaises(HTTPException) as e:
            self.post(email="ana@exemple.fr", message="Bonjour")
        self.assertEqual(e.exception.status_code, 503)


if __name__ == "__main__":
    unittest.main()
