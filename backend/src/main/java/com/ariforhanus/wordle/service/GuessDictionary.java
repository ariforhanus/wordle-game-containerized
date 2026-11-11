package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;

import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.*;

@Component
public class GuessDictionary {
    private final Map<String, Set<String>> words = new HashMap<>();

    public GuessDictionary(RandomWordApiProvider answers) throws IOException {
        for (String lang : List.of("en", "tr")) {
            var set = new HashSet<String>(answers.getAllWords(lang));
            try (var input =
                    new ClassPathResource("words/words_" + lang + "_possible.txt")
                            .getInputStream()) {
                for (String word :
                        new String(input.readAllBytes(), StandardCharsets.UTF_8).split("\n"))
                    set.add(normalize(word.trim(), lang));
            }
            words.put(lang, Set.copyOf(set));
        }
    }

    public String normalize(String word, String lang) {
        return word.toUpperCase("tr".equals(lang) ? Locale.forLanguageTag("tr-TR") : Locale.ROOT);
    }

    public boolean contains(String word, String lang) {
        return words.getOrDefault(lang, Set.of()).contains(word);
    }
}
