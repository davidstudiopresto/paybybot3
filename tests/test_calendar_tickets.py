"""Tickets chosen on the calendar: one day, or every day of a period, at the time chosen (Sundays free in Paris)."""
import unittest
from datetime import date, datetime, timedelta
from unittest.mock import patch

from fastapi import HTTPException

from paybybot3 import schedule, web
from paybybot3.schedule import PARIS

EVERY_DAY = list(range(7))


def rule(first, last, **extra):
    return {"days": EVERY_DAY, "start": "09:00", "unit": "Hours", "duration": 2, "location": "75017",
            "date_from": first, "date_to": last, **extra}


class Calendar(unittest.TestCase):
    def test_only_the_days_of_the_period(self):
        r = rule("2026-10-27", "2026-10-31")  # Tuesday to Saturday
        self.assertIsNone(schedule.slot_on(date(2026, 10, 26), r))
        self.assertIsNotNone(schedule.slot_on(date(2026, 10, 27), r))
        self.assertIsNotNone(schedule.slot_on(date(2026, 10, 31), r))
        self.assertIsNone(schedule.slot_on(date(2026, 11, 2), r))
        # after the last day, never again
        self.assertIsNone(schedule.next_slot(r, datetime(2026, 10, 31, 12, tzinfo=PARIS)))

    def test_sundays_and_holidays_stay_free_in_paris(self):
        r = rule("2026-10-31", "2026-11-02")  # Sat 31, Sun 1 (and All Saints' Day), Mon 2
        self.assertIsNone(schedule.slot_on(date(2026, 11, 1), r))
        nxt = schedule.next_slot(r, datetime(2026, 10, 31, 12, tzinfo=PARIS))
        self.assertEqual(nxt.astimezone(PARIS).date(), date(2026, 11, 2))

    def test_one_day_pays_once_then_stops(self):
        r = rule("2026-10-27", "2026-10-27")
        pay, _ = schedule.decide(r, datetime(2026, 10, 27, 9, 5, tzinfo=PARIS))
        self.assertTrue(pay)
        pay, nxt = schedule.decide(r, datetime(2026, 10, 27, 9, 6, tzinfo=PARIS),
                                   last_payment=datetime(2026, 10, 27, 9, 5, tzinfo=PARIS))
        self.assertFalse(pay)
        self.assertIsNone(nxt)

    def test_text_of_the_e_mail(self):
        self.assertEqual(web.rule_text(rule("2026-10-27", "2026-10-27")),
                         "le mardi 27 octobre, ticket de 2 heures pris à 9h")
        self.assertEqual(web.rule_text(rule("2026-10-26", "2026-10-31")),
                         "du lundi 26 octobre au samedi 31 octobre, ticket de 2 heures pris à 9h")

    def test_rule_of_reads_both_spellings(self):
        stored = web.rule_of({"days": EVERY_DAY, "date_from": "2026-10-27", "date_to": "2026-10-28"})
        demo = web.rule_of({"days": EVERY_DAY, "dateFrom": "2026-10-27", "dateTo": "2026-10-28"})
        self.assertEqual((stored["date_from"], stored["date_to"]), ("2026-10-27", "2026-10-28"))
        self.assertEqual((demo["date_from"], demo["date_to"]), ("2026-10-27", "2026-10-28"))

    def test_a_period_in_the_past_is_refused(self):
        s = web.UserSession("demo", "", demo=True)
        past = (datetime.now(PARIS).date() - timedelta(days=3)).isoformat()
        body = web.Autopilot(plate="AB123CD", location="75017", rate="102", duration=2, unit="Hours",
                             paymentAccountId="demo-card", label="Jours précis", days=EVERY_DAY,
                             dateFrom=past, dateTo=past, start="09:00")
        with patch.object(web, "current", return_value=s):
            with self.assertRaises(HTTPException) as e:
                web.add_autopilot(body, "t")
        self.assertEqual(e.exception.status_code, 400)

    def test_a_coming_day_is_kept_on_the_rule(self):
        s = web.UserSession("demo", "", demo=True)
        day = (datetime.now(PARIS).date() + timedelta(days=2)).isoformat()
        body = web.Autopilot(plate="AB123CD", location="75017", rate="102", duration=2, unit="Hours",
                             paymentAccountId="demo-card", label="Jours précis", days=EVERY_DAY,
                             dateFrom=day, start="09:00")
        with patch.object(web, "current", return_value=s), patch.object(web, "run_autopilot"), \
                patch.object(web.threading, "Thread"):
            ap = web.add_autopilot(body, "t")
        self.assertEqual((ap["dateFrom"], ap["dateTo"]), (day, day))
        self.assertIsNotNone(web.with_next_ticket(ap)["nextTicket"])


if __name__ == "__main__":
    unittest.main()
