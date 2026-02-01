package com.ariforhanus.wordle.service.provider;

import jakarta.annotation.PostConstruct;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.BufferedReader;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Local dosyalardan random kelime seçer
 * - words/words_en.txt (İngilizce)
 * - words/words_tr.txt (Türkçe)
 */
@Component
public class RandomWordApiProvider {

    private final Map<String, List<String>> wordsByLang = new HashMap<>();
    private final Random random = new Random();

    @PostConstruct
    public void loadWords() {
        loadWordsForLang("en", "words/words_en.txt", "^[A-Z]{5}$");
        loadWordsForLang("tr", "words/words_tr.txt", "^[A-ZÇĞİÖŞÜ]{5}$");
    }

    private void loadWordsForLang(String lang, String filePath, String pattern) {
        List<String> words = new ArrayList<>();
        try {
            ClassPathResource resource = new ClassPathResource(filePath);
            Locale locale = lang.equals("tr") ? new Locale("tr", "TR") : Locale.ROOT;
            try (BufferedReader reader = new BufferedReader(
                    new InputStreamReader(resource.getInputStream(), StandardCharsets.UTF_8))) {
                String line;
                while ((line = reader.readLine()) != null) {
                    String word = line.trim().toUpperCase(locale);
                    if (word.length() == 5 && word.matches(pattern)) {
                        words.add(word);
                    }
                }
            }
            wordsByLang.put(lang, words);
            System.out.println("Loaded " + words.size() + " words for lang=" + lang + " from " + filePath);
        } catch (IOException e) {
            System.err.println("Failed to load words file for " + lang + ": " + e.getMessage());
            wordsByLang.put(lang, Collections.emptyList());
        }
    }

    public String getRandomFiveLetterWord(String lang) {
        List<String> words = wordsByLang.getOrDefault(lang, Collections.emptyList());
        if (words.isEmpty()) {
            return null;
        }
        return words.get(random.nextInt(words.size()));
    }

}

