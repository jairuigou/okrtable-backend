CREATE TABLE IF NOT EXISTS info (
    id INTEGER NOT NULL PRIMARY KEY,
    detail TEXT,
    level INTEGER,
    priority INTEGER,
    state TEXT,
    ddl TEXT
);

CREATE TABLE IF NOT EXISTS progress (
    id INTEGER,
    progress TEXT,
    createtime TEXT,
    FOREIGN KEY (id) REFERENCES info (id)
);