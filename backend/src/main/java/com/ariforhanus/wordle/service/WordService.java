package com.ariforhanus.wordle.service;


import com.ariforhanus.wordle.dto.WordDto;
import com.ariforhanus.wordle.service.provider.DefinitionApiProvider;
import com.ariforhanus.wordle.service.provider.RandomWordApiProvider;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class WordService {

    private static final Logger log = LoggerFactory.getLogger(WordService.class);
    private static final int MAX_DEFINITION_CACHE_SIZE = 500;

    private final RandomWordApiProvider randomWord;
    private final DefinitionApiProvider definition;
    private final String timezone;

    // Thread-safe daily word cache
    private final Map<String, WordDto> dailyWordCache = new ConcurrentHashMap<>();
    private volatile LocalDate lastCacheDate = null;
    private final Object dailyCacheLock = new Object();

    // LRU cache for definitions (bounded to prevent memory leak)
    private final Map<String, String> definitionCache = new LinkedHashMap<>(64, 0.75f, true) {
        @Override
        protected boolean removeEldestEntry(Map.Entry<String, String> eldest) {
            return size() > MAX_DEFINITION_CACHE_SIZE;
        }
    };

    public WordService(
            RandomWordApiProvider randomWord,
            DefinitionApiProvider definition,
            @Value("${app.timezone:Europe/Istanbul}") String timezone) {
        this.randomWord = randomWord;
        this.definition = definition;
        this.timezone = timezone;
    }

    /**
     * Practice modu için rastgele kelime döner.
     */
    public WordDto getWord(String lang) {
        String word = randomWord.getRandomFiveLetterWord(lang);
        return buildDto(lang, word);
    }

    /**
     * Günlük kelime: Her dil için gün başına deterministik bir kelime seçer.
     * Thread-safe: synchronized block ile race condition önlenir.
     */
    public WordDto getDailyWord(String lang) {
        LocalDate today = LocalDate.now(ZoneId.of(timezone));
        String cacheKey = lang + "_" + today;

        // Fast path: cache'de varsa hemen dön (lock-free)
        WordDto cached = dailyWordCache.get(cacheKey);
        if (cached != null) {
            return cached;
        }

        // Slow path: hesapla (thread-safe)
        synchronized (dailyCacheLock) {
            // Double-check: başka thread hesaplamış olabilir
            cached = dailyWordCache.get(cacheKey);
            if (cached != null) {
                return cached;
            }

            // Cache invalidation: gün değiştiyse temizle
            if (lastCacheDate != null && !lastCacheDate.equals(today)) {
                log.info("Daily word cache invalidated: {} -> {}", lastCacheDate, today);
                dailyWordCache.clear();
            }
            lastCacheDate = today;

            List<String> all = randomWord.getAllWords(lang);
            if (all == null || all.isEmpty()) {
                throw new IllegalStateException("No words available for lang=" + lang);
            }

            // Deterministic hash: epoch day + lang hash
            long combined = today.toEpochDay() * 31L + lang.hashCode();
            int index = (int) Math.floorMod(combined, all.size());
            String word = all.get(index);

            log.info("Daily word selected for {}: index={}/{}", cacheKey, index, all.size());

            WordDto result = buildDto(lang, word);
            dailyWordCache.put(cacheKey, result);
            return result;
        }
    }

    /**
     * Ortak WordDto oluşturma mantığı.
     * Definition cache'lenir (aynı kelime için tekrar API çağrılmaz).
     */
    private WordDto buildDto(String lang, String word) {
        if (word == null || word.isBlank()) {
            throw new IllegalStateException("No words available for lang=" + lang);
        }

        String definitionText;
        if ("en".equals(lang)) {
            String defCacheKey = lang + "_" + word.toUpperCase();
            synchronized (definitionCache) {
                definitionText = definitionCache.computeIfAbsent(defCacheKey, key -> {
                    String def = definition.getDefinition(word);
                    return (def == null || def.isBlank()) ? "Definition unavailable." : def;
                });
            }
        } else {
            definitionText = "Tanım mevcut değil.";
        }
        return new WordDto(word, definitionText);
    }
}
