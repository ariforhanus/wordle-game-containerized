package com.ariforhanus.wordle.repository;

import com.ariforhanus.wordle.entity.Score;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.List;

@Repository
public interface ScoreRepository extends JpaRepository<Score, Long> {
    List<Score> findTop10ByOrderByScoreDesc();
    List<Score> findTop100ByOrderByScoreDesc();

    @Query("select s from Score s where s.wonAt between :start and :end order by s.score desc")
    List<Score> findTopDaily(Instant start, Instant end);

}
