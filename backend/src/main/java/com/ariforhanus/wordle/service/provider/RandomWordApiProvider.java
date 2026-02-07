package com.ariforhanus.wordle.service.provider;

import com.ariforhanus.wordle.config.SupportedLanguage;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;
import java.util.regex.Pattern;

/**
 * Local dosyalardan random kelime seçer.
 * Desteklenen diller SupportedLanguage enum'undan otomatik yüklenir.
 */
@Component
public class RandomWordApiProvider {

    private static final Logger log = LoggerFactory.getLogger(RandomWordApiProvider.class);

    /** Per-language regex patterns for valid 5-letter words */
    private static final Map<String, Pattern> WORD_PATTERNS = Map.of(
            "en", Pattern.compile("^[A-Z]{5}$"),
            "tr", Pattern.compile("^[A-ZÇĞİÖŞÜ]{5}$")
    );

    /** Default pattern for new languages (basic Latin, 5 chars) */
    private static final Pattern DEFAULT_PATTERN = Pattern.compile("^\\p{L}{5}$");

    private final Map<String, List<String>> wordsByLang = new HashMap<>();
    private final Random random = new Random();

    @PostConstruct
    public void loadWords() {
        for (SupportedLanguage lang : SupportedLanguage.values()) {
            String code = lang.getCode();
            String filePath = "words/words_" + code + ".txt";
            Pattern pattern = WORD_PATTERNS.getOrDefault(code, DEFAULT_PATTERN);
            try {
                loadWordsForLang(code, filePath, pattern);
            } catch (IllegalStateException e) {
                log.warn("Skipping language {}: {}", code, e.getMessage());
            }
        }
    }

    private void loadWordsForLang(String lang, String filePath, Pattern pattern) {
        List<String> words = new ArrayList<>();
        try {
            ClassPathResource resource = new ClassPathResource(filePath);
            if (!resource.exists()) {
                log.warn("Word file not found for lang={}: {}", lang, filePath);
                return;
            }
            Locale locale = lang.equals("tr") ? new Locale("tr", "TR") : Locale.ROOT;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String word = line.trim().toUpperCase(locale);
                    if (word.length() == 5 && pattern.matcher(word).matches()) {
                        words.add(word);
                    }
                }
            }
            Collections.sort(words);
            wordsByLang.put(lang, Collections.unmodifiableList(words));
            log.info("Loaded {} words for lang={} from {}", words.size(), lang, filePath);
        } catch (IOException e) {
            log.error("Failed to load words file for {}: {}", lang, e.getMessage());
            throw new IllegalStateException("Cannot start without word list for lang=" + lang, e);
        }
    }

    public String getRandomFiveLetterWord(String lang) {
        List<String> words = wordsByLang.getOrDefault(lang, Collections.emptyList());
        if (words.isEmpty()) {
            return null;
        }
        return words.get(random.nextInt(words.size()));
    }

    /**
     * Belirli bir dil için yüklenmiş tüm kelimeleri döner.
     * Dönen liste immutable'dır (Collections.unmodifiableList).
     */
    public List<String> getAllWords(String lang) {
        return wordsByLang.getOrDefault(lang, Collections.emptyList());
    }
}
