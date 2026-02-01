package com.ariforhanus.wordle.controller;


import com.ariforhanus.wordle.service.WordService;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class WordController {

    private final WordService wordService;

    public WordController(WordService wordService){
        this.wordService = wordService;
    }

    @GetMapping("/api/word")
    public WordDto getWord(){
        try {
            return wordService.getWord();
        } catch (Exception e) {
            throw new ResponseStatusException(
                HttpStatus.BAD_GATEWAY,
                "External word API unavailable: " + e.getMessage()
            );
        }
    }

    public static record WordDto(String word, String definition) {}

}
