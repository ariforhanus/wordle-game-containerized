package com.ariforhanus.wordle.service.provider;

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
 * Local dosyalardan random kelime seçer
 * - words/words_en.txt (İngilizce)
 * - words/words_tr.txt (Türkçe)
 */
@Component
public class RandomWordApiProvider {

    private static final Logger log = LoggerFactory.getLogger(RandomWordApiProvider.class);

    private final Map<String, List<String>> wordsByLang = new HashMap<>();
    private final Random random = new Random();

    @PostConstruct
    public void loadWords() {
        loadWordsForLang("en", "words/words_en.txt", Pattern.compile("^[A-Z]{5}$"));
        loadWordsForLang("tr", "words/words_tr.txt", Pattern.compile("^[A-ZÇĞİÖŞÜ]{5}$"));
    }

    private void loadWordsForLang(String lang, String filePath, Pattern pattern) {
        List<String> words = new ArrayList<>();
        try {
            ClassPathResource resource = new ClassPathResource(filePath);
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

