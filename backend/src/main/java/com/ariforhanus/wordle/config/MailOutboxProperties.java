package com.ariforhanus.wordle.config;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.ConfigurationPropertiesScan;
import org.springframework.boot.context.properties.bind.DefaultValue;
import org.springframework.context.annotation.Configuration;

@ConfigurationProperties("app.mail-outbox")
public record MailOutboxProperties(
        @DefaultValue("false") boolean enabled,
        @DefaultValue("true") boolean workerEnabled,
        @DefaultValue("") String activeKeyId,
        @DefaultValue("") String keys,
        @DefaultValue("10000") int maxPending,
        @DefaultValue("6") int maxAttempts,
        @DefaultValue("120") int leaseSeconds,
        @DefaultValue("10") int batchSize,
        @DefaultValue("5000") int pollMillis) {
    public MailOutboxProperties {
        if (maxPending < 1
                || maxPending > 100000
                || maxAttempts < 1
                || maxAttempts > 10
                || leaseSeconds < 30
                || leaseSeconds > 600
                || batchSize < 1
                || batchSize > 100
                || pollMillis < 1000
                || pollMillis > 60000)
            throw new IllegalArgumentException("Invalid mail outbox limits");
    }

    @Override
    public String toString() {
        return "MailOutboxProperties[enabled=" + enabled + ", keys=REDACTED]";
    }

    @Configuration
    @ConfigurationPropertiesScan(basePackageClasses = MailOutboxProperties.class)
    public static class Registration {}
}
