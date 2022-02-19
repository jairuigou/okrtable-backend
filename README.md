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
3. Start app
    ```
    $ node app.js
    ```
use sqlite3 as database, the database file `okrtable.db` will store in `okrtable-backend/db/okrtable.db`
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