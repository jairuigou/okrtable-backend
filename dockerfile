FROM mariadb:10.6.4
ENV MARIADB_ROOT_PASSWORD=root
ADD init.sql /docker-entrypoint-initdb.d
EXPOSE 3306