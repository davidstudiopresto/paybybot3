import os
import threading
import time
import unittest
from unittest.mock import MagicMock, patch

import requests

from paybybot3 import web

SLOW = 0.2  # each PayByPhone or database call


def slow(value):
    def call(*a, **k):
        time.sleep(SLOW)
        return value
    return call


class ParallelOverview(unittest.TestCase):
    """The dashboard's calls (PayByPhone and the database) go out together, not one after the other."""

    def test_overview_waits_for_the_slowest_call_only(self):
        session = web.UserSession.for_bot(MagicMock(), "+33612345678")
        session.bot.get_vehicles.side_effect = slow([{"licensePlate": "AB-123-CD"}])
        session.bot.get_payment_accounts.side_effect = slow({})
        session.bot.get_parking_sessions.side_effect = slow([])
        with patch.object(web, "current", return_value=session), patch.object(web, "HOSTED", True), \
                patch.dict(os.environ, {"PAYBYBOT_SECRET": "t"}), patch.object(web, "load_account", side_effect=slow({})), \
                patch.object(web, "store", side_effect=slow([])):
            start = time.monotonic()
            data = web.overview(pbb_session="x")
            took = time.monotonic() - start
        self.assertEqual([v["plate"] for v in data["vehicles"]], ["AB-123-CD"])
        self.assertLess(took, 3 * SLOW)  # one after the other: 5 x SLOW


class OneRefreshAtATime(unittest.TestCase):
    """Calls run without waiting for each other; an expired token is renewed once, not once per call."""

    def test_expired_token_renewed_once_for_parallel_calls(self):
        response = MagicMock(status_code=401)
        expired = MagicMock(refresh_token="old")
        expired.get_vehicles.side_effect = requests.HTTPError(response=response)
        fresh = MagicMock(refresh_token="new")
        fresh.get_vehicles.return_value = ["AB-123-CD"]
        session = web.UserSession.for_bot(expired, "+33612345678")
        renewals = []

        def renew(*a):
            renewals.append(1)
            time.sleep(0.1)
            return fresh
        with patch.object(web, "bot_from_refresh", side_effect=renew):
            results = []
            threads = [threading.Thread(target=lambda: results.append(session.call("get_vehicles"))) for _ in range(3)]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        self.assertEqual(results, [["AB-123-CD"]] * 3)
        self.assertEqual(len(renewals), 1)


if __name__ == "__main__":
    unittest.main()
