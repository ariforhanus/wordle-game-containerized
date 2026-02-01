package com.ariforhanus.wordle.service.provider;

import org.springframework.stereotype.Component;
import org.springframework.web.client.RestTemplate;

import java.util.Locale;
import java.util.regex.Pattern;

//TODO: retry/fallback eklenecek

@Component
public class RandomWordApiProvider{
    private static final String RANDOM_WORD_API = "https://random-word-api.herokuapp.com/word?number=1&length=5";

    private static final Pattern FIVE_UPPER_ALPHA = Pattern.compile("^[A-Z]{5}$");

    private final RestTemplate restTemplate;

    public RandomWordApiProvider(RestTemplate restTemplate) {
        this.restTemplate = restTemplate;
    }

    public String getRandomFiveLetterWord(){
        try {
            String[] payload = restTemplate.getForObject(RANDOM_WORD_API, String[].class);
            String raw = (payload != null && payload.length > 0) ? payload[0] : null;
            if (raw == null) {
                return null;
            }
            String normalized = raw.trim().toUpperCase(Locale.ROOT);
            if (!FIVE_UPPER_ALPHA.matcher(normalized).matches()) {
                return null;
            }
            return normalized; // ingilizce harf dönüşümü i -> I ileride türkçe için new Locale("tr")
        } catch (Exception e) {
            return null;
        }
    }

}

