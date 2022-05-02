# OKR-Table-Backend

[OKR-Table](https://github.com/jairuigou/okrtable) backend using [expressjs](https://expressjs.com/)
## Getting Started
### For development
1. Clone the repo and run `npm install`
    ```
    $ git clone https://github.com/jairuigou/okrtable-backend.git
    $ cd okrtable-backend
    $ npm install 
    ```
2. Create an environment file `.env` for sending an SMTP email ( Only support 163, it doesn't matter without this file. )
    ```
    # .env
    MAIL_USER=${smtp-mail-account}
    MAIL_PASS=${smtp-mail-password}
    MAIL_FROM=${mail-from}
    MAIL_SENDTO=${mail-send-to}
    ```
3. Build and start app
    ```
    $ npm run build && npm run server
    ```
4. Build and run unit tests
    ```
    $ npm run build-test
    ```
Using sqlite3 as database, the database file `okrtable.db` will be stored in `${okrtable-backend-repo-dir}/db/`. If you run unit tests, the test database `okrtable.test.db` will be automatically created in the same folder as `okrtable.db`.
### Deploying with docker
1. Build docker image
    ```
    $ docker build -t okrtable/okrtable-backend .
    ```
    or pull release image from [GitHub Package Registry](https://github.com/jairuigou/okrtable-backend/pkgs/container/okrtable-backend)
    ```
    $ docker pull ghcr.io/jairuigou/okrtable-backend:main
    ```
2. Create an environment file `.env`. This is mainly used to set the timezone of container and [SMTP mail config](#for-development)
    ```
    # .env
    TZ=${local-timezone}
    ```
3. Create a database directory
    ```
    $ mkdir db
    ```
4. Start container.
    ```
    $ docker run --name okrtable-backend --env-file .env -p 3000:3000 -v ${PWD}/db:/usr/src/app/db -d okrtable/okrtable-backend
    ```