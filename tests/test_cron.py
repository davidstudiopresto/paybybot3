import os
import unittest
from unittest.mock import patch

from paybybot3 import web


class Cron(unittest.TestCase):
    def test_due_renewals_run_side_by_side_and_one_failing_stops_none(self):
        with patch.dict(os.environ, {"PAYBYBOT_SECRET": "t"}), patch.object(web, "HOSTED", True), \
                patch.object(web, "cron_authorized", return_value=True), \
                patch.object(web, "store", return_value=[{"id": "a"}, {"id": "b"}, {"id": "c"}]), \
                patch.object(web, "process_renewal", side_effect=lambda row: {"b": RuntimeError("x")}.get(row["id"], "paid")
                             if row["id"] != "b" else (_ for _ in ()).throw(RuntimeError("x"))), \
                patch.object(web, "run_dunning", return_value=0):
            answer = web.cron_renew(None)
        self.assertEqual((answer["processed"], sorted(answer["outcomes"])), (3, ["error", "paid", "paid"]))


if __name__ == "__main__":
    unittest.main()
