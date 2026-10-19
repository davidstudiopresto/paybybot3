import json
import uuid
from datetime import datetime
from time import sleep

import requests


def _parse_dt(value):
    if value is None:
        return None
    text = value.replace("Z", "")
    for fmt in ("%Y-%m-%dT%H:%M:%S.%f", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(text, fmt)
        except ValueError:
            continue
    return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)


class Bot:
    TOKEN_URL = "https://auth.paybyphoneapis.com/consumer/token"
    GRAPHQL_URL = "https://consumer.paybyphoneapis.com/uapi/graphql"

    base_headers = {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "Accept": "*/*",
        "Accept-Language": "en",
        "Origin": "https://m.paybyphone.com",
        "Referer": "https://m.paybyphone.com/",
        "X-Pbp-ClientType": "WebApp",
    }

    def __init__(self, username, password):
        self._authenticate(
            {
                "grant_type": "password",
                "username": username,
                "password": password,
                "client_id": "paybyphone_web",
            }
        )

    @classmethod
    def from_refresh_token(cls, refresh_token):
        """Log in again without the password, as the official app does."""
        bot = cls.__new__(cls)
        bot._authenticate(
            {
                "grant_type": "refresh_token",
                "refresh_token": refresh_token,
                "client_id": "paybyphone_web",
            }
        )
        return bot

    def _authenticate(self, data):
        r = requests.post(
            self.TOKEN_URL,
            headers={
                **self.base_headers,
                "Content-Type": "application/x-www-form-urlencoded",
            },
            data=data,
        )
        r.raise_for_status()
        j = r.json()
        self.authorization = j["token_type"] + " " + j["access_token"]
        # May be rotated on each refresh: callers keeping it must store the new one.
        self.refresh_token = j.get("refresh_token")
        self.expires_in = j.get("expires_in")

    def _graphql(self, query, variables=None):
        r = requests.post(
            self.GRAPHQL_URL,
            headers={
                **self.base_headers,
                "Accept": "application/json, text/plain, */*",
                "Content-Type": "application/json",
                # The web app signs requests (x-signature), but the API still accepts a plain Bearer token.
                "Authorization": self.authorization,
            },
            json={"operationName": None, "variables": variables or {}, "query": query},
        )
        r.raise_for_status()
        j = r.json()
        if j.get("errors"):
            raise RuntimeError("GraphQL error: %s" % json.dumps(j["errors"]))
        return j["data"]

    def get_vehicles(self):
        query = """query GetVehiclesV3($input: GetVehiclesInput!) {
  getVehiclesV3(input: $input) {
    vehicleId
    legacyVehicleId
    licensePlate
    country
    jurisdiction
    type
    archived
  }
}"""
        return self._graphql(query, {"input": {"profileName": "PayByPhone"}})[
            "getVehiclesV3"
        ]

    def _get_parking_sessions(self, periodType="CURRENT", limit=50):
        query = """query GetParkingSessionsV1($input: GetParkingSessionsInput!) {
  getParkingSessionsV1(input: $input) {
    parkingSessionId
    status
    type
    locationId
    startTime
    expireTime
    stall
    isRenewable
    vehicle {
      legacyVehicleId
      licensePlate
      countryCode
      type
    }
    ratePolicy {
      ratePolicyId
      type
    }
    totalCost {
      amount
      currency
    }
  }
}"""
        sessions = self._graphql(
            query, {"input": {"periodType": periodType, "offset": 0, "limit": limit}}
        )["getParkingSessionsV1"]
        for s in sessions:
            s["startTime"] = _parse_dt(s.get("startTime"))
            s["expireTime"] = _parse_dt(s.get("expireTime"))
        return sessions

    def get_parking_sessions(self, licensePlate=None, locationId=None):
        def pred(p):
            if licensePlate is not None:
                if p["vehicle"]["licensePlate"] != licensePlate:
                    return False
            if locationId is not None:
                if p["locationId"] != locationId:
                    return False
            return True

        return list(filter(pred, self._get_parking_sessions()))

    def get_past_sessions(self, limit=20):
        """Finished sessions, most recent first (PayByPhone's history)."""
        sessions = self._get_parking_sessions(periodType="HISTORIC", limit=limit)
        return sorted(sessions, key=lambda x: x.get("startTime") or datetime.min, reverse=True)

    def last_expiry(self, licensePlate, locationId):
        return max(
            (
                session["expireTime"]
                for session in self.get_parking_sessions(licensePlate, locationId)
            ),
            default=None,
        )

    def get_payment_accounts(self):
        query = """query GetPaymentAccountsV1($input: GetPaymentAccountsInput!) {
  getPaymentAccountsV1(input: $input) {
    paymentCards {
      cardType
      maskedCardNumber
      accountType
      paymentAccountId
      paymentScope
      expiryMonth
      expiryYear
    }
    mno {
      status
      operator
      phoneNumber
      paymentAccountId
      paymentScope
    }
    paypalAccounts {
      accountType
      paymentAccountId
      paymentScope
    }
  }
}"""
        return self._graphql(query, {"input": {"mandateCountryCode": "FR"}})[
            "getPaymentAccountsV1"
        ]

    def _resolve_payment(self, paymentAccountId):
        if not paymentAccountId:
            return "", ""
        accounts = self.get_payment_accounts()
        for card in accounts.get("paymentCards") or []:
            if card.get("paymentAccountId") == paymentAccountId:
                return card.get("cardType") or "", card.get("paymentScope") or ""
        for key in ("mno", "paypalAccounts", "twintAccounts"):
            for acc in accounts.get(key) or []:
                if acc.get("paymentAccountId") == paymentAccountId:
                    return "", acc.get("paymentScope") or ""
        return "", ""

    def get_rate_options(self, locationId, licensePlate):
        query = """query GetRateOptionsV1($input: GetRateOptionsInput!) {
  getRateOptionsV1(input: $input) {
    name
    type
    ratePolicyId
    maxStayStatus
    acceptedTimeUnits
    parkingNotAllowedReason
  }
}"""
        return self._graphql(
            query, {"input": {"locationId": str(locationId), "licensePlate": licensePlate}}
        )["getRateOptionsV1"]

    def _get_vendor_id(self, locationId):
        query = """query GetLocationsV1($input: GetLocationInput!) {
  getLocationsV1(input: $input) {
    locationId
    legacyVendorId
    countryCode
    isStallBased
  }
}"""
        locations = self._graphql(
            query, {"input": {"advertisedLocationNumber": str(locationId)}}
        )["getLocationsV1"]
        # Several locations can share an advertised number (e.g. a stall-based
        # location elsewhere); prefer the one whose id matches the number.
        for loc in locations:
            if loc.get("locationId") == str(locationId):
                return loc.get("legacyVendorId")
        return locations[0].get("legacyVendorId") if locations else None

    def _create_quote(
        self,
        locationId,
        ratePolicyId,
        durationQuantity,
        durationTimeUnit,
        licensePlate,
        paymentAccountId="",
        operation="Start",
        parkingSessionId="",
    ):
        """operation is "Start" for a new session, "Extend" to add time to parkingSessionId."""
        cardType, paymentScope = self._resolve_payment(paymentAccountId)
        query = """mutation CreateQuotesV1($requests: [QuoteRequestInput!]!) {
  createQuotesV1(input: {requests: $requests}) {
    createQuotesResponse {
      totalCost {
        amount
        currency
      }
      quotes {
        quoteId
        cost {
          amount
          currency
        }
        details {
          quoteId
          locationId
          parkingStartTime
          parkingExpiryTime
          licensePlate
        }
      }
      quoteErrors {
        quoteRequestId
        product
        status
        reason
      }
    }
  }
}"""
        variables = {
            "requests": [
                {
                    "quoteRequestId": str(uuid.uuid4()),
                    "product": "PARKING",
                    "details": {
                        "locationId": str(locationId),
                        "advertisedLocationId": str(locationId),
                        "ratePolicyId": str(ratePolicyId),
                        "parkingQuoteOperation": operation,
                        "durationTimeUnit": durationTimeUnit,
                        "durationQuantity": str(durationQuantity),
                        "licensePlate": licensePlate,
                        "stall": "",
                        "parkingSessionId": parkingSessionId or "",
                        "paymentAccountId": paymentAccountId or "",
                        "paymentCardType": cardType,
                        "paymentScope": paymentScope,
                    },
                }
            ]
        }
        resp = self._graphql(query, variables)["createQuotesV1"]["createQuotesResponse"]
        errors = resp.get("quoteErrors") or []
        if errors:
            raise RuntimeError("Quote error: %s" % json.dumps(errors))
        quotes = resp.get("quotes") or []
        if not quotes:
            raise RuntimeError("No quote returned: %s" % json.dumps(resp))
        return quotes[0]

    def _start_session(self, quoteId):
        query = """mutation StartParkingSessionV1($input: StartParkingSessionV1Input!) {
  startParkingSessionV1(input: $input) {
    parkingSessionResponse {
      parkingSessionId
      expireTime
      isEarlyCapture
      segmentTotalCost {
        amount
        currency
      }
      metadata
    }
  }
}"""
        return self._graphql(query, {"input": {"request": {"quoteId": quoteId}}})[
            "startParkingSessionV1"
        ]["parkingSessionResponse"]

    def _extend_session(self, parkingSessionId, quoteId):
        query = """mutation ExtendParkingSessionV1($input: ExtendParkingSessionV1Input!) {
  extendParkingSessionV1(input: $input) {
    parkingSessionResponse {
      parkingSessionId
      expireTime
      isEarlyCapture
      segmentTotalCost {
        amount
        currency
      }
      metadata
    }
  }
}"""
        variables = {
            "input": {"request": {"parkingSessionId": parkingSessionId, "quoteId": quoteId}}
        }
        return self._graphql(query, variables)["extendParkingSessionV1"][
            "parkingSessionResponse"
        ]

    def _create_job(
        self,
        parkingSessionId,
        vendorId,
        endingTime,
        isEarlyCapture,
        metadata,
        amount=None,
        paymentAccountId="",
    ):
        query = """mutation CreateJobV1($input: CreateJobV1Input!) {
  createJobV1(input: $input) {
    createJobResponse {
      jobId
    }
  }
}"""
        if isinstance(metadata, (dict, list)):
            metadata = json.dumps(metadata)
        line_item = {
            "productType": "parking",
            "productReferenceId": parkingSessionId,
            "vendorId": str(vendorId),
            "endingTime": endingTime,
            "isEarlyCapture": bool(isEarlyCapture),
            "required": True,
            "metadata": metadata or "{}",
        }
        # Like the official web app: without the amount the job fails with
        # InvalidFulfillmentAmount and the payment is voided.
        if amount and amount.get("amount"):
            line_item["amount"] = {
                "value": amount["amount"],
                "isoCurrencyCode": amount.get("currency") or "EUR",
            }
        request = {"lineItems": [line_item]}
        if paymentAccountId:
            request["paymentMethod"] = {
                "paymentMethodType": "PaymentAccount",
                "paymentDetails": {
                    "$type": "paymentAccount",
                    "paymentAccountId": paymentAccountId,
                },
            }
        variables = {"input": {"request": request}}
        return self._graphql(query, variables)["createJobV1"]["createJobResponse"][
            "jobId"
        ]

    def _get_job(self, jobId):
        query = """query GetJobV1($jobId: UUID!) {
  getJobV1(jobId: $jobId) {
    jobId
    status
    captureGroups {
      stage
      status
      lineItems {
        status
        executionDetails {
          isFailure
          code
          message
        }
      }
      executionDetails {
        isFailure
        code
        message
      }
    }
    executionDetails {
      isFailure
      code
      message
    }
  }
}"""
        return self._graphql(query, {"jobId": jobId})["getJobV1"]

    _TERMINAL_CAPTURE_STATUSES = {
        "captureNotRequired",
        "captured",
        "settled",
        "closed",
        "completed",
    }

    @staticmethod
    def _job_failures(job):
        def failures(details):
            return [d for d in (details or []) if d.get("isFailure")]

        found = failures(job.get("executionDetails"))
        for cg in job.get("captureGroups") or []:
            found += failures(cg.get("executionDetails"))
            if cg.get("stage") == "void":
                found.append({"isFailure": True, "code": "Voided", "message": "Payment voided"})
            for li in cg.get("lineItems") or []:
                found += failures(li.get("executionDetails"))
                if li.get("status") == "fulfillmentFailed":
                    found.append({"isFailure": True, "code": "FulfillmentFailed", "message": "Fulfillment failed"})
        return found

    _TERMINAL_LINE_ITEM_STATUSES = {
        "fulfilled",
        "fulfillmentFailed",
        "cancelled",
        "canceled",
        "voided",
        "refunded",
    }

    def _job_is_terminal(self, job):
        if job.get("status") in ("closed", "completed", "settled"):
            return True
        groups = job.get("captureGroups") or []
        # A capture group can be "captureNotRequired" before its line items are
        # fulfilled (or fail), so wait for the line items too.
        line_items = [li for cg in groups for li in cg.get("lineItems") or []]
        return (
            bool(groups)
            and all(cg.get("status") in self._TERMINAL_CAPTURE_STATUSES for cg in groups)
            and all(li.get("status") in self._TERMINAL_LINE_ITEM_STATUSES for li in line_items)
        )

    def pay(
        self,
        durationQuantity,
        durationTimeUnit,
        licensePlate,
        locationId,
        ratePolicyId,
        paymentAccountId,
    ):
        quote = self._create_quote(
            locationId=locationId,
            ratePolicyId=ratePolicyId,
            durationQuantity=durationQuantity,
            durationTimeUnit=durationTimeUnit,
            licensePlate=licensePlate,
            paymentAccountId=paymentAccountId,
        )
        session = self._start_session(quote["quoteId"])
        return self._charge(quote, session, locationId, paymentAccountId)

    def extend(
        self,
        parkingSessionId,
        durationQuantity,
        durationTimeUnit,
        licensePlate,
        locationId,
        ratePolicyId,
        paymentAccountId,
    ):
        """Add time to an ongoing session, the way the official app does."""
        quote = self._create_quote(
            locationId=locationId,
            ratePolicyId=ratePolicyId,
            durationQuantity=durationQuantity,
            durationTimeUnit=durationTimeUnit,
            licensePlate=licensePlate,
            paymentAccountId=paymentAccountId,
            operation="Extend",
            parkingSessionId=parkingSessionId,
        )
        session = self._extend_session(parkingSessionId, quote["quoteId"])
        return self._charge(quote, session, locationId, paymentAccountId)

    def _charge(self, quote, session, locationId, paymentAccountId):
        """Create the payment job for a started or extended session and wait for it."""
        parkingSessionId = session["parkingSessionId"]
        vendorId = self._get_vendor_id(locationId)
        jobId = self._create_job(
            parkingSessionId=parkingSessionId,
            vendorId=vendorId,
            endingTime=session["expireTime"],
            isEarlyCapture=session.get("isEarlyCapture", False),
            metadata=session.get("metadata"),
            amount=session.get("segmentTotalCost") or quote.get("cost"),
            paymentAccountId=paymentAccountId,
        )

        job = None
        for _ in range(15):
            job = self._get_job(jobId)
            failures = self._job_failures(job)
            if failures:
                raise RuntimeError("Payment job failed: %s" % json.dumps(failures))
            if self._job_is_terminal(job):
                break
            sleep(2)

        return {
            "quoteId": quote["quoteId"],
            "cost": quote.get("cost"),
            "parkingSessionId": parkingSessionId,
            "expireTime": session.get("expireTime"),
            "jobId": jobId,
            "jobStatus": job.get("status") if job else None,
        }
