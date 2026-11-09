package com.ariforhanus.wordle.config;

import org.springframework.boot.actuate.autoconfigure.security.servlet.EndpointRequest;
import org.springframework.context.annotation.*;
import org.springframework.core.annotation.Order;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.web.SecurityFilterChain;

@Configuration
public class ManagementSecurityConfig {
    @Bean
    @Order(0)
    public SecurityFilterChain management(HttpSecurity http) throws Exception {
        return http.securityMatcher(EndpointRequest.toAnyEndpoint())
                .authorizeHttpRequests(r -> r.anyRequest().permitAll())
                .build();
    }
}
