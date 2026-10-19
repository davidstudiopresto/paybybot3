import unittest
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

from paybybot3 import web


class ResidentZone(unittest.TestCase):
    def zone_with(self, sessions):
        s = web.UserSession("demo", "", demo=True)
        s.bot.get_past_sessions = lambda limit=20: sessions
        with patch.object(web, "current", return_value=s):
            return web.resident_zone("token")["zone"]

    def test_a_week_ticket_gives_the_zone(self):
        now = datetime.now(timezone.utc).replace(tzinfo=None)
        visitor = {"locationId": "75008", "startTime": now - timedelta(hours=3), "expireTime": now - timedelta(hours=1)}
        resident = {"locationId": "75017", "startTime": now - timedelta(days=9), "expireTime": now - timedelta(days=2)}
        self.assertEqual(self.zone_with([visitor, resident]), "75017")

    def test_no_resident_ticket(self):
        self.assertIsNone(self.zone_with([]))

    def test_demo_week_price(self):
        self.assertEqual(web.DemoBot()._price("101", 7, "Days"), 9)
        self.assertEqual(web.DemoBot()._price("101", 1, "Days"), 1.5)


if __name__ == "__main__":
    unittest.main()
