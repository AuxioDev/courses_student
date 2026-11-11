export const SESSION_COOKIE = "cs_session";

// A token is only accepted by the app it was issued for (JWT `aud`). The apps share one SESSION_SECRET,
// so without this a token signed by one app would be a valid login in the others.
export const SESSION_AUDIENCE = "student";

// Sessions slide: renewed on use, at most once per RENEW period.
export const SESSION_MAX_AGE_SECONDS = 2592000; // 720 hours
export const SESSION_RENEW_AFTER_SECONDS = 86400; // 24 hour(s)
