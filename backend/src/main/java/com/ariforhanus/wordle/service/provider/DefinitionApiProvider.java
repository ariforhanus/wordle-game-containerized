package com.ariforhanus.wordle.service.provider;


import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class DefinitionApiProvider {

    private static final Logger log = LoggerFactory.getLogger(DefinitionApiProvider.class);

    private final RestTemplate restTemplate;
    private final String apiUrl;

    public DefinitionApiProvider(
            RestTemplate restTemplate,
            @Value("${app.definition.api-url:https://api.dictionaryapi.dev/api/v2/entries/en/}") String apiUrl) {
        this.restTemplate = restTemplate;
        this.apiUrl = apiUrl;
    }

    public String getDefinition(String word) {
        try {
            if (word == null || word.isBlank()) {
                return "";
            }
            String lower = word.toLowerCase(Locale.ROOT).trim();
            String url = apiUrl + UriUtils.encodePath(lower, StandardCharsets.UTF_8);

            Object[] body = restTemplate.getForObject(url, Object[].class);
            if (body == null || body.length == 0) {
                return "";
            }

            Map<?, ?> entry0 = (Map<?, ?>) body[0];
            List<?> meanings = (List<?>) entry0.get("meanings");
            if (meanings == null || meanings.isEmpty()) {
                return "";
            }
            Map<?, ?> meaning0 = (Map<?, ?>) meanings.get(0);
            List<?> definitions = (List<?>) meaning0.get("definitions");
            if (definitions == null || definitions.isEmpty()) {
                return "";
            }
            Map<?, ?> definition0 = (Map<?, ?>) definitions.get(0);
            Object defText = definition0.get("definition");
            return defText == null ? "" : defText.toString();
        } catch (Exception e) {
            log.warn("Failed to fetch definition for '{}': {}", word, e.getMessage());
            return "";
        }
    }
}
