create database if not exists okrtabledb ;
use okrtabledb;

create table if not exists info (
    id int not null,
    detail varchar(100),
    level int,
    priority int,
    state varchar(10),
    ddl timestamp,
    primary key (id)
);

create table if not exists ddl (
    id int,
    ddl timestamp,
    createtime timestamp,
    foreign key (id) references info (id)
);

create table if not exists progress (
    id int,
    progress varchar(1000),
    createtime timestamp,
    foreign key (id) references info (id)
);