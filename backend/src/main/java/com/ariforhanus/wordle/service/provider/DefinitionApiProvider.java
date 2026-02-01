package com.ariforhanus.wordle.service.provider;


import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;
import org.springframework.web.util.UriUtils;

import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Component
public class DefinitionApiProvider {

    private final RestTemplate restTemplate;

    public DefinitionApiProvider(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public String getDefinition(String word) {
        try {
            if (word == null || word.isBlank()) {
                return "";
            }
            String lower = word.toLowerCase(Locale.ROOT).trim();
            String url = "https://api.dictionaryapi.dev/api/v2/entries/en/" + UriUtils.encodePath(lower, StandardCharsets.UTF_8);

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
            return "";
        }
    }
}
