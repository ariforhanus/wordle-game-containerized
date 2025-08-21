package com.ariforhanus.wordle.service;


import com.ariforhanus.wordle.dto.ScoreRequest;
import com.ariforhanus.wordle.dto.ScoreResponse;
import com.ariforhanus.wordle.entity.Score;
import com.ariforhanus.wordle.repository.ScoreRepository;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.stream.Collectors;

@Service
public class ScoreService {

    private final ScoreRepository repo;

    private static final int BASE = 10_000;
    private static final int ATTEMPT_PENALTY = 1_000;
    private static final int SECOND_PENALTY = 7;

    public ScoreService(ScoreRepository repo){
        this.repo = repo;
    }

    public ScoreResponse save(ScoreRequest req) {
        return saveFor(req.getUsername(), req);
    }

    public ScoreResponse saveFor(String username, ScoreRequest req) {
        int score = calcScore(req.getAttempts(), req.getDurationMs());
        Score s = new Score(
                username,
                req.getAttempts(),
                req.getDurationMs(),
                score,
                req.getWord()
        );
        Score saved = repo.save(s);
        return toResp(saved);
    }

    public List<ScoreResponse> topGlobal(){
        List<Score> list = repo.findTop10ByOrderByScoreDesc();
        return list.stream().map(this::toResp).collect(Collectors.toList());
    }

    public List<ScoreResponse> dailyTop(int limit, ZoneId zone){
        Instant start = ZonedDateTime.now(zone).toLocalDate().atStartOfDay(zone).toInstant();
        Instant end =  ZonedDateTime.now(zone).toLocalDate().plusDays(1).atStartOfDay(zone).toInstant();

        List<Score> list = repo.findTopDaily(start, end);

        return list.stream().limit(10).map(this::toResp).collect(Collectors.toList());
    }



    private int calcScore(int attempts, long durationMs){
        long seconds = durationMs /1000L;
        long penalty = (long) attempts * ATTEMPT_PENALTY + seconds * SECOND_PENALTY;
        long result = BASE - penalty;
        if(result < 0) result = 0;
        if (result > Integer.MAX_VALUE) result = Integer.MAX_VALUE;
        return (int) result;
    }

    private ScoreResponse toResp(Score s){
        return new ScoreResponse(
                s.getScore(),
                s.getAttempts(),
                s.getUsername(),
                s.getDurationMs(),
                s.getId(),
                s.getWord(),
                s.getWonAt()
        );
    }
}
