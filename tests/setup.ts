// Tests use a dedicated database so they never touch development data.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgresql://reap:reap@localhost:5432/reap_test";
process.env.APP_SECRET ??= "test-secret-test-secret-test-secret-test-secret";
process.env.DISABLE_INLINE_JOBS = "true";
process.env.SMS_PROVIDER = "log";
process.env.WHATSAPP_PROVIDER = "log";
process.env.EMAIL_PROVIDER = "log";
