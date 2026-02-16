FROM coturn/coturn:latest

COPY turnserver.conf /etc/coturn/turnserver.conf

EXPOSE 3478/tcp
EXPOSE 3478/udp
EXPOSE 5349/tcp
EXPOSE 5349/udp

CMD ["-c", "/etc/coturn/turnserver.conf", "--log-file=stdout"]
