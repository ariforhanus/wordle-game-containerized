package com.ariforhanus.wordle.controller;


import com.ariforhanus.wordle.service.WordService;
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
        // TODO: api entegrasyonu

        return wordService.getWord();
    }

    public static record WordDto(String word, String definition) {}

}
