package com.ariforhanus.wordle.support;

import java.time.*;
import java.util.Objects;
import java.util.concurrent.atomic.AtomicReference;

/** Test-only clock. Zone views share the same thread-safe time source. */
public final class MutableClock extends Clock {
    private final AtomicReference<Instant> current;
    private final ZoneId zone;

    public MutableClock(Instant initial) {
        this(new AtomicReference<>(Objects.requireNonNull(initial)), ZoneOffset.UTC);
    }

    private MutableClock(AtomicReference<Instant> current, ZoneId zone) {
        this.current = current;
        this.zone = Objects.requireNonNull(zone);
    }

    public void set(Instant instant) {
        current.set(Objects.requireNonNull(instant));
    }

    public void advance(Duration duration) {
        Objects.requireNonNull(duration);
        if (duration.isNegative())
            throw new IllegalArgumentException("Use set for backward time travel");
        current.updateAndGet(instant -> instant.plus(duration));
    }

    @Override
    public ZoneId getZone() {
        return zone;
    }

    @Override
    public Clock withZone(ZoneId zone) {
        return new MutableClock(current, zone);
    }

    @Override
    public Instant instant() {
        return current.get();
    }
}
