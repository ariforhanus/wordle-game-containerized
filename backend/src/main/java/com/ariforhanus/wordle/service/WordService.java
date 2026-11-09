package com.ariforhanus.wordle.service;

import com.ariforhanus.wordle.dto.WordDto;
import com.ariforhanus.wordle.service.provider.DefinitionApiProvider;
import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

@Service
public class WordService {

    private static final Logger log = LoggerFactory.getLogger(WordService.class);
    private static final int MAX_DEFINITION_CACHE_SIZE = 500;

    private final DailyPuzzleService puzzles;
    private final RandomWordApiProvider randomWord;
    private final DefinitionApiProvider definition;
    private final String timezone;
    private final Clock clock;

    // LRU cache for definitions (bounded to prevent memory leak)
    private final Map<String, String> definitionCache =
            new LinkedHashMap<>(64, 0.75f, true) {
                @Override
                protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
                    return size() > MAX_DEFINITION_CACHE_SIZE;
                }
            };

    public WordService(
            DailyPuzzleService puzzles,
            RandomWordApiProvider randomWord,
            DefinitionApiProvider definition,
            @Value("${app.timezone:Europe/Istanbul}") String timezone,
            Clock clock) {
        this.puzzles = puzzles;
        this.randomWord = randomWord;
        this.definition = definition;
        this.timezone = timezone;
        this.clock = clock;
    }

    /** Practice modu için rastgele kelime döner. */
    public WordDto getWord(String lang) {
        String word = randomWord.getRandomFiveLetterWord(lang);
        return buildDto(lang, word);
    }

    /**
     * Daily word uses the shared application clock and the persisted unique puzzle per
     * day/language.
     */
    public WordDto getDailyWord(String lang) {
        var puzzle = puzzles.getOrCreate(LocalDate.now(clock.withZone(ZoneId.of(timezone))), lang);
        return buildDto(lang, puzzle.answer());
    }

    /**
     * Ortak WordDto oluşturma mantığı. Definition cache'lenir (aynı kelime için tekrar API
     * çağrılmaz).
     */
    private WordDto buildDto(String lang, String word) {
        if (word == null || word.isBlank()) {
            throw new IllegalStateException("No words available for lang=" + lang);
        }

        String definitionText;
        if ("en".equals(lang)) {
            String defCacheKey = lang + "_" + word.toUpperCase();
            synchronized (definitionCache) {
                definitionText = definitionCache.get(defCacheKey);
            }
            if (definitionText == null) {
                String def = definition.getDefinition(word);
                definitionText = (def == null || def.isBlank()) ? "no_definition" : def;
                synchronized (definitionCache) {
                    definitionCache.put(defCacheKey, definitionText);
                }
            }

        } else {
            definitionText = "no_definition";
        }
        return new WordDto(word, definitionText);
    }
}
