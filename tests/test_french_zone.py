import unittest
from types import SimpleNamespace

from paybybot3 import web


class FrenchZone(unittest.TestCase):
    def session(self, found=None, error=None):
        def call(name, *a, **k):
            if error:
                raise error
            return found
        return SimpleNamespace(call=call)

    def test_a_zone_known_in_france(self):
        self.assertTrue(web.french_zone(self.session([{"locationId": "75016", "countryCode": "FR"}]), "75016"))

    def test_a_number_used_only_abroad_or_unknown(self):
        self.assertFalse(web.french_zone(self.session([{"locationId": "9", "countryCode": "GB"}]), "1234"))
        self.assertFalse(web.french_zone(self.session([]), "1234"))

    def test_payByPhone_unreachable_does_not_block(self):
        self.assertTrue(web.french_zone(self.session(error=RuntimeError("down")), "75016"))


class RecentZones(unittest.TestCase):
    def test_distinct_most_recent_first(self):
        from datetime import datetime
        from unittest.mock import patch
        sessions = [{"locationId": "75016", "startTime": datetime(2026, 10, 1)},
                    {"locationId": "69002", "startTime": datetime(2026, 10, 20)},
                    {"locationId": "75016", "startTime": datetime(2026, 10, 10)}]
        s = SimpleNamespace(call=lambda name, *a, **k: sessions if name == "get_past_sessions" else [])
        with patch.object(web, "current", return_value=s):
            self.assertEqual(web.recent_zones("t"), ["69002", "75016"])
