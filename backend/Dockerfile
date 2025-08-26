FROM public.ecr.aws/amazoncorretto/amazoncorretto:21
        COPY target/application/ ./
        COPY target/snapshot-dependencies/ ./
        COPY target/spring-boot-loader/ ./
        COPY target/dependencies/ ./
        ENTRYPOINT ["java", "org.springframework.boot.loader.launch.JarLauncher"]