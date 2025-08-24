package com.ariforhanus.wordle.sevice;


import com.ariforhanus.wordle.dto.ScoreRequest;
import com.ariforhanus.wordle.dto.ScoreResponse;
import com.ariforhanus.wordle.entity.Score;
import com.ariforhanus.wordle.repository.ScoreRepository;
import com.ariforhanus.wordle.service.ScoreService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.lang.reflect.Field;
import java.time.Instant;

import static org.assertj.core.api.AssertionsForClassTypes.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;


@ExtendWith(MockitoExtension.class)
class ScorServiceTest {

    @Mock
    private ScoreRepository repo;

    @InjectMocks
    private ScoreService service;

    @Test
    void save_shouldBuildEntity_callRepo_andReturnMappedResponse(){
        ScoreRequest req = new ScoreRequest();
        req.setUsername("test");
        req.setAttempts(3);
        req.setDurationMs(1500L);
        req.setWord("TESTS");

        when(repo.save(any(Score.class))).thenAnswer(inv ->{
            Score s = inv.getArgument(0);
            Field f = Score.class.getDeclaredField("id");
            f.setAccessible(true);
            f.set(s, 1L);
            s.setWonAt(Instant.parse("2025-08-22T08:00:00Z"));
            return s;
        });

        ScoreResponse resp = service.save(req);

        ArgumentCaptor<Score> captor = ArgumentCaptor.forClass(Score.class);
        verify(repo, times(1)).save(captor.capture());
        Score captured = captor.getValue();

        assertThat(captured.getUsername()).isEqualTo("test");
        assertThat(captured.getAttempts()).isEqualTo(3);
        assertThat(captured.getDurationMs()).isEqualTo(1500L);
        assertThat(captured.getScore()).isEqualTo(6993);
        assertThat(captured.getWord()).isEqualTo("TESTS");

        assertThat(resp.getUsername()).isEqualTo("test");
        assertThat(resp.getAttempts()).isEqualTo(3);
        assertThat(resp.getDurationMs()).isEqualTo(1500L);
        assertThat(resp.getScore()).isEqualTo(6993);
        assertThat(resp.getWord()).isEqualTo("TESTS");
        assertThat(resp.getWonAt()).isEqualTo(Instant.parse("2025-08-22T08:00:00Z"));

        verifyNoMoreInteractions(repo);



    }



}
