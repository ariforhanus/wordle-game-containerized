FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /app
COPY pom.xml .
COPY src ./src
# PostgreSQL integration tests run in CI before images are published.
RUN mvn -B package -DskipTests

FROM eclipse-temurin:21-jre-jammy
RUN apt-get update && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 wordle && useradd --uid 10001 --gid wordle --no-create-home wordle
WORKDIR /app
COPY --from=build --chown=wordle:wordle /app/target/wordle-0.0.1-SNAPSHOT.jar app.jar
USER 10001:10001
EXPOSE 8091
ENTRYPOINT ["java", "-XX:MaxRAMPercentage=75", "-jar", "app.jar"]
