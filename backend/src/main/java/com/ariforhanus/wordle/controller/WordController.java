package com.ariforhanus.wordle.controller;


import com.ariforhanus.wordle.config.SupportedLanguage;
import com.ariforhanus.wordle.dto.WordDto;
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
    @GetMapping("/api/v1/word/random")
    public WordDto getRandomWord(@RequestParam(value = "lang", defaultValue = "en") String lang){
        try {
            String normalized = SupportedLanguage.fromParam(lang).getCode();
            return wordService.getWord(normalized);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported language");
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Word unavailable: " + e.getMessage());
        }
    }

    /**
     * Daily challenge: Günlük kelime
     * @param lang "en" veya "tr"
     */
    @GetMapping("/api/v1/word/daily")
    public WordDto getDailyWord(@RequestParam(value = "lang", defaultValue = "en") String lang){
        try {
            String normalized = SupportedLanguage.fromParam(lang).getCode();
            return wordService.getDailyWord(normalized);
        } catch (IllegalArgumentException e) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Unsupported language");
        } catch (Exception e) {
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "Word unavailable: " + e.getMessage());
        }
    }
}
