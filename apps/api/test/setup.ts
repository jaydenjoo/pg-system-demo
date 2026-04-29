process.env["THROTTLE_LIMIT"] = "10000";
process.env["LOGIN_THROTTLE_LIMIT"] = "10000";
process.env["PAYMENT_THROTTLE_LIMIT"] = "10000";

jest.setTimeout(30_000);
