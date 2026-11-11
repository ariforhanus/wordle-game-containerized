package com.ariforhanus.wordle.support;

import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

@TestConfiguration(proxyBeanMethods = false)
public class TestClockConfiguration {
    @Bean
    @Primary
    public MutableClock testClock() {
        return new MutableClock(TestTimes.BEFORE_MIDNIGHT);
    }
}
