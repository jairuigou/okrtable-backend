import {checkRequest} from "./middleware";
import {date2str,initJobs,isActivated,updateAutoDelayJob,updateNotifyJob,resourceType,infoType,jobsMapType} from "./utils";
import dotenv = require('dotenv');
import express = require('express');
import cors = require('cors');
import fs = require('fs');
import path = require('path');
import Sqlite = require('better-sqlite3')

const dataBaseDirectory = "db";
const dataBaseFileName = "okrtable.db";
const initSqlFile = "init.sql";

const app = express();

dotenv.config();

app.use(express.urlencoded({extended:false}));
app.use(express.json());
app.use(cors());

try{
    fs.statSync(dataBaseDirectory);
}
catch(err){
    if( err.code != "ENOENT" ){
        throw err;
    }
    console.log("Creating database directory...");
    fs.mkdirSync(dataBaseDirectory);
}
const initSql = fs.readFileSync(initSqlFile,'utf-8');
const db = Sqlite(path.join(dataBaseDirectory,dataBaseFileName),{ verbose:console.log});
db.exec(initSql);

let notifyJobs:jobsMapType;
let autoDelayJobs:jobsMapType;
const param:resourceType = { 
    db:db,
    notifyJobs:notifyJobs, 
    autoDelayJobs:autoDelayJobs,
 };

initJobs(param);

// for tests
app.get('/',(req,res)=>{
    res.send("hello");
});

// start : yyyy-mm-dd
// duration : n days
// level: 0 or 1 optional
// priority: 0,1,2 optional
// state: "PENDING","INPROG","DONE","BLOCKED","KILLED" optional
// select all object whose ddl date in range.
// range from yyyy-mm-dd 00:00:00 to n*24 hours later
// n must >= 0 , if n == 0 , only select the object whose ddl is at yyyy-mm-dd 00:00:00
app.post('/',checkRequest,(req,res)=>{
    if( !("start" in req.body) ){
        res.json({error:"no start parameter"});
        return;
    }
    if( !("duration" in req.body) ){
        res.json({error:"no duration parameter"});
        return;
    }
    const startDate = new Date(req.body.start + " 00:00:00");
    const endDate = new Date(req.body.start + " 00:00:00");
    endDate.setDate(startDate.getDate() + parseInt(req.body.duration));
    const startDateStr = date2str(startDate);  
    const endDateStr = date2str(endDate);

    let queryRange = "select * from info where ddl >= '" + 
            startDateStr + "' and ddl <= '" + endDateStr + "' ";
    if( "level" in req.body ){
        queryRange += "and level = " + req.body.level;
    }
    if( "state" in req.body ){
        queryRange += "and state = " + req.body.state;
    }
    if( "priority" in req.body ){
        queryRange += "and priority = " + req.body.priority;
    }
    
    const rows = db.prepare(queryRange).all();
    res.send(rows);
});

// get progress by id
// id: yyyymmddnn
app.post('/getprogress',checkRequest,(req,res)=>{
    if( !("id" in req.body) ){
        res.json({error:"no id parameter"});
        return;
    }
    const querySql = "select * from progress where id = " + req.body.id;
    const rows = db.prepare(querySql).all();
    res.send(rows);
});

// create new record
// detail: String
// level: 0 or 1
// priority: 0,1,2 optional default 2
// state: "PENDING","INPROG","DONE","BLOCKED","KILLED" optional default "PENDING"
// ddl: yyyy-mm-dd hh:mm:ss
app.post('/create',checkRequest,(req,res)=>{
    // todo check detail content for security
    if( !("detail" in req.body) ){
        res.json({error:"no detail parameter"});
        return;
    }
    const detail = req.body.detail;

    if( !("level" in req.body) ){
        res.json({error:"no level parameter"});
        return;
    }
    const level = req.body.level;
    let priority:number;
    if( "priority" in req.body ){
        priority = req.body.priority;
    }
    else{
        priority = 2;
    }
    let state:string;
    if( "state" in req.body ){
        state = req.body.state;
    }
    else{
        state = "PENDING";
    }

    if( !("ddl" in req.body) ){
        res.json({error:"no ddl parameter"});
        return;
    }
    const ddl = req.body.ddl;

    const today = new Date(Date.now());
    let start = today.getFullYear() * 10000 + (today.getMonth()+1)*100 + today.getDate();
    start *= 100;
    const end = start + 99;
    const queryCount = "select count(*) as count from info where id >= " + start + " and id <= " + end;
    let id = start;

    const row = db.prepare(queryCount).get();
    id = start + row.count;
    try{
        db.prepare("insert into info values (" + id + ",'" + detail + "'," 
                        + level + "," + priority + ",'" + state + "', datetime('" +ddl+ "') )").run();
    }
    catch(err){
        res.json({error:"/create: unknown error"});
        console.log("/create",err);
        return;
    }

    res.json({success:id});

    const info:infoType = {id:id,detail:detail,level:level,priority:priority,state:state,ddl:ddl};
    updateNotifyJob(info,param);
    updateAutoDelayJob(info,param); 
});

// update priority
// id: yyyymmddnn
// priority: 0,1,2
app.post('/updateprior',checkRequest,(req,res)=>{
    if( !("id" in req.body) ){
        res.json({error:"no id parameter"});
        return;
    }
    if( !("priority" in req.body) ){
        res.json({error:"no priority parameter"});
        return;
    }

    const id = req.body.id;
    const row = db.prepare("select * from info where id = " + id).get();
    if( !row ){
        res.json({error:"invalid id " + id});
        return;
    }
    if( !isActivated(row.state) ){
        res.json({error:"target " + id + " state is " + row.state});
        return;
    }

    try{
        db.prepare("update info set priority = " + req.body.priority + " where id = " + id).run();
        res.json({success:"success"})
    }
    catch(err){
        res.json({error:"/updateprior: unknown error"});
        console.log("/updateprior",err);
    }
});
    
// update state
// id: yyyymmddnn
// state: "PENDING","INPROG","DONE","BLOCKED","KILLED"
app.post('/updatestate',checkRequest,(req,res)=>{
    if( !("id" in req.body) ){
        res.json({error:"no id parameter"});
        return;
    }    
    if( !("state" in req.body) ){
        res.json({error:"no state parameter"});
        return;
    }
    
    const row = db.prepare("select * from info where id = " + req.body.id).get();
    if( !row ){
        res.json({error:"invalid id "+req.body.id});
        return;
    }
    if( !isActivated(row.state) ){
        res.json({error:"target " + req.body.id + " state is " + row.state});
        return;
    }

    const state = req.body.state;
    let stmt:Sqlite.Statement;
    let curDate:Date;
    if( state == 'KILLED' || state == 'DONE' || state == 'BLOCKED' ){
        row.state = state;
        updateNotifyJob(row,param);
        updateAutoDelayJob(row,param);
        curDate = new Date(date2str(new Date(Date.now())));
        stmt = db.prepare("update info set state = '" + req.body.state + "', ddl='" + curDate + "' where id = " + req.body.id);
    }
    else{
        stmt = db.prepare("update info set state = '" + req.body.state + "' where id = " + req.body.id);
    }

    try{
        stmt.run();
        if(curDate)
            res.json({success:"success",timestamp:curDate});
        else
            res.json({success:"success"});
    }
    catch(err){
        res.json({error:"/updatestate unknown error"});
        console.log("/updatestate",err);
    }
});

// update ddl
// id: yyyymmddnn
// ddl: 'yyyy-mm-dd hh:mm:ss'
// todo compare ddl with current time and change state
app.post('/updateddl',checkRequest,(req,res)=>{
    if( !("id" in req.body) ){
        res.json({error:"no id parameter"});
        return;
    }
    if( !("ddl" in req.body) ){
        res.json({error:"no ddl parameter"});
        return;
    }
    const id = req.body.id;
    const row = db.prepare("select * from info where id = " + id).get();
    if( !row ){
        res.json({error:"invalid id "+id});
        return;
    }
    if( !isActivated(row.state) ){
        res.json({error:"target " + id + " state is " + row.state});
        return;
    }

    const newDdl = new Date(req.body.ddl);
    if( newDdl.getTime() <= Date.now() ){
        res.json({error:"cannot set a ddl earlier than the current time " + Date.now()});
        return;
    } 
    
    try{
        db.prepare("update info set ddl = '" + req.body.ddl + "' where id = " + id).run();
        res.json({success:"success"});
    }
    catch(err){
        res.json({error:"/updateddl unknown error"});
        console.log("/updateddl",err);
    }

    const info:infoType = {
        id: id, ddl: req.body.ddl, state: "PENDING",
        detail: "",
        level: 0,
        priority: 0
    };
    updateNotifyJob(info,param);
    updateAutoDelayJob(info,param);
});

// update progress
// id: yyyymmddnn
// progress: String
app.post('/updateprogress',checkRequest,(req,res)=>{
    if( !("id" in req.body) ){
        res.json({error:"no id parameter"});
        return;
    }
    if( !("progress" in req.body) ){
        res.json({error:"no progress parameter"});
        return;
    }
    const id = req.body.id;
    const progress = req.body.progress;
    if( !progress.trim() ){
        res.json({warning:"empty progress content"});
        return;
    }
    
    const row = db.prepare("select count(*) as count from progress where id =" + id).get();
    try{
        if( row.count == 0){
            db.prepare("insert into progress (id,progress,createtime) values (" + id + ",'" + progress + "',datetime('now','localtime'))").run();
        }
        else{
            db.prepare("update progress set progress = '" + progress + "', createtime=datetime('now','localtime') where id = " + id).run();
        }
        res.json({success:"success"});
    }
    catch(err){
        res.json({error:"/updateprogress unknown error"});
        console.log("/updateprogress",err);
    }
});

export default app;