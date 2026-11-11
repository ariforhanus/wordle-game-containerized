package com.ariforhanus.wordle.support;

import static org.junit.jupiter.api.Assertions.*;

import org.junit.jupiter.api.Test;

import java.time.*;

class MutableClockTest {
    @Test
    void zoneViewsRemainLiveWhenTimeIsSetOrAdvanced() {
        var clock = new MutableClock(TestTimes.DAYTIME);
        var zoned = clock.withZone(TestTimes.APP_ZONE);
        clock.advance(Duration.ofMinutes(2));
        assertEquals(clock.instant(), zoned.instant());
        clock.set(TestTimes.BEFORE_MIDNIGHT);
        assertEquals(clock.instant(), zoned.instant());
        assertEquals(TestTimes.APP_ZONE, zoned.getZone());
        assertEquals(ZoneOffset.UTC, clock.getZone());
    }

    @Test
    void aLiveZoneViewAppliesDaylightSavingRules() {
        var zone = ZoneId.of("America/New_York");
        // Known spring-forward transition; an explicit boundary fixture is intentional.
        var before = LocalDate.of(2024, 3, 10).atTime(1, 59).atZone(zone).toInstant();
        var clock = new MutableClock(before);
        var view = clock.withZone(zone);
        assertEquals(1, ZonedDateTime.now(view).getHour());
        clock.advance(Duration.ofMinutes(2));
        assertEquals(3, ZonedDateTime.now(view).getHour());
        assertEquals(1, ZonedDateTime.now(view).getMinute());
    }

    @Test
    void concurrentAdvancesDoNotLoseUpdates() {
        var clock = new MutableClock(TestTimes.DAYTIME);
        java.util.stream.IntStream.range(0, 1000)
                .parallel()
                .forEach(ignored -> clock.advance(Duration.ofMillis(1)));
        assertEquals(TestTimes.DAYTIME.plusSeconds(1), clock.instant());
    }

    @Test
    void rejectsInvalidTimeSourcesAndAccidentalNegativeAdvance() {
        var clock = new MutableClock(TestTimes.DAYTIME);
        assertThrows(NullPointerException.class, () -> clock.set(null));
        assertThrows(NullPointerException.class, () -> clock.withZone(null));
        assertThrows(IllegalArgumentException.class, () -> clock.advance(Duration.ofSeconds(-1)));
        assertEquals(TestTimes.DAYTIME, clock.instant());
    }
}
