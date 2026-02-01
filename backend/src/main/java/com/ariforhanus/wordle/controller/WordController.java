package com.ariforhanus.wordle.controller;


import com.ariforhanus.wordle.service.WordService;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WordController {

    private final WordService wordService;

    public WordController(WordService wordService){
        this.wordService = wordService;
    }

    /**
     * Practice mode: Her istekte yeni random kelime
     * @param lang "en" veya "tr"
     */
    @GetMapping("/api/word/random")
    public WordDto getRandomWord(@RequestParam(value = "lang", defaultValue = "en") String lang){
        try {
            return wordService.getWord(lang);
        } catch (Exception e) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Word unavailable: " + e.getMessage()
            );
        }
    }

    /**
     * Daily challenge: Günlük kelime
     * @param lang "en" veya "tr"
     * TODO: Replace with daily word logic
     * - Cache word per day (00:00 UTC)
     * - All users get same word
     * - Seed-based or DB table: daily_words(date, word, definition)
     */
    @GetMapping("/api/word/daily")
    public WordDto getDailyWord(@RequestParam(value = "lang", defaultValue = "en") String lang){
        try {
            // TODO: Şimdilik random, ileride günlük sabit kelime olacak
            return wordService.getWord(lang);
        } catch (Exception e) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "Word unavailable: " + e.getMessage()
            );
        }
    }

    public static record WordDto(String word, String definition) {}

}
