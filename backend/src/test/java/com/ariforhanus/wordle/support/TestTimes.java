package com.ariforhanus.wordle.support;

import java.time.*;

/** Deliberate calendar fixtures, independent of the machine date and default time zone. */
public final class TestTimes {
    public static final ZoneId APP_ZONE = ZoneId.of("Europe/Istanbul");
    // A known Monday, chosen for weekday/month/year-boundary scenarios, not today's date.
    public static final LocalDate REFERENCE_DAY = LocalDate.of(2024, 1, 15);
    public static final Instant BEFORE_MIDNIGHT =
            REFERENCE_DAY.plusDays(1).atStartOfDay(APP_ZONE).minusMinutes(1).toInstant();
    public static final Instant DAYTIME = REFERENCE_DAY.atTime(13, 0).atZone(APP_ZONE).toInstant();
    public static final LocalDate PERIOD_DAY = REFERENCE_DAY.plusDays(9);
    public static final Instant PERIOD_TIME = PERIOD_DAY.atTime(12, 0).atZone(APP_ZONE).toInstant();

    private TestTimes() {}
}
