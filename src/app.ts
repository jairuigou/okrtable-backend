import Sqlite = require('better-sqlite3');
import express = require('express');
import cors = require('cors');
import fs = require('fs');
import path = require('path');
import {checkRequest} from "./middleware";
import {date2str,isActivated,addJobs,sendMessage,jobsMapType} from "./utils";

interface infoType{
    id: number;
    detail: string;
    level: number;
    priority: number;
    state: string;
    ddl: string;
}

export default class App{
    public app:express.Application;
    private db: Sqlite.Database; 
    private notifyJobs:jobsMapType;
    private autoDelayJobs:jobsMapType;
    private dataBaseDirectory = "db";
    private dataBaseFileName = "okrtable.db";
    private initSqlFile = "init.sql";

    initApi: ()=>void;
    initJobs: ()=>void;
    updateNotifyJob: (info:infoType)=>void;
    updateAutoDelayJob: (info:infoType)=>void;
    notify: (id:number)=>void;
    autoDelay: (id:number)=>void;
    updateStateHandler: (info:infoType)=>void;
    

    constructor(istest = false){
        this.app = express();
        this.app.use(express.urlencoded({extended:false}));
        this.app.use(express.json());
        this.app.use(cors());
        this.notifyJobs = {};
        this.autoDelayJobs = {};

        try{
            fs.statSync(this.dataBaseDirectory);
        }
        catch(err){
            if( err.code != "ENOENT" ){
                throw err;
            }
            console.log("Creating database directory...");
            fs.mkdirSync(this.dataBaseDirectory);
        }
        
        // remove test database file
        if( istest ){
            this.dataBaseFileName = 'okrtable.test.db';
            fs.unlinkSync(path.join(this.dataBaseDirectory,this.dataBaseFileName));
        }

        const initSql = fs.readFileSync(this.initSqlFile,'utf-8');
        this.db = Sqlite(path.join(this.dataBaseDirectory,this.dataBaseFileName),{ verbose:console.log});
        this.db.exec(initSql);
        this.initJobs();
        this.initApi();
    }
}

App.prototype.initApi = function(){
    // for jest debug
    this.app.post('/test',(req:express.Request,res:express.Response)=>{
        console.log(req.body.detail);
        res.json({success:'success'});
    })
    // start : yyyy-mm-dd
    // duration : n days
    // level: 0 or 1 optional
    // priority: 0,1,2 optional
    // state: "PENDING","INPROG","DONE","BLOCKED","KILLED" optional
    // select all object whose ddl date in range.
    // range from yyyy-mm-dd 00:00:00 to n*24 hours later
    // n must >= 0 , if n == 0 , only select the object whose ddl is at yyyy-mm-dd 00:00:00
    this.app.post('/',checkRequest,(req:express.Request,res:express.Response)=>{
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
        
        const rows = this.db.prepare(queryRange).all();
        res.send(rows);
    });

    // get progress by id
    // id: yyyymmddnn
    this.app.post('/getprogress',checkRequest,(req:express.Request,res:express.Response)=>{
        if( !("id" in req.body) ){
            res.json({error:"no id parameter"});
            return;
        }
        const querySql = "select * from progress where id = " + req.body.id;
        const rows = this.db.prepare(querySql).all();
        res.send(rows);
    });

    // create new record
    // detail: String
    // level: 0 or 1
    // priority: 0,1,2 optional default 2
    // state: "PENDING","INPROG","DONE","BLOCKED","KILLED" optional default "PENDING"
    // ddl: yyyy-mm-dd hh:mm:ss
    this.app.post('/create',checkRequest,(req:express.Request,res:express.Response)=>{
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

        const row = this.db.prepare(queryCount).get();
        id = start + row.count;
        try{
            this.db.prepare("insert into info values (" + id + ",'" + detail + "'," 
                            + level + "," + priority + ",'" + state + "', datetime('" +ddl+ "') )").run();
        }
        catch(err){
            res.json({error:"/create: unknown error"});
            console.log("/create",err);
            return;
        }

        res.json({success:id});

        const info:infoType = {id:id,detail:detail,level:level,priority:priority,state:state,ddl:ddl};
        this.updateNotifyJob(info);
        this.updateAutoDelayJob(info); 
    });

    // update priority
    // id: yyyymmddnn
    // priority: 0,1,2
    this.app.post('/updateprior',checkRequest,(req:express.Request,res:express.Response)=>{
        if( !("id" in req.body) ){
            res.json({error:"no id parameter"});
            return;
        }
        if( !("priority" in req.body) ){
            res.json({error:"no priority parameter"});
            return;
        }

        const id = req.body.id;
        const row = this.db.prepare("select * from info where id = " + id).get();
        if( !row ){
            res.json({error:"invalid id " + id});
            return;
        }
        if( !isActivated(row.state) ){
            res.json({error:"target " + id + " state is " + row.state});
            return;
        }

        try{
            this.db.prepare("update info set priority = " + req.body.priority + " where id = " + id).run();
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
    this.app.post('/updatestate',checkRequest,(req:express.Request,res:express.Response)=>{
        if( !("id" in req.body) ){
            res.json({error:"no id parameter"});
            return;
        }    
        if( !("state" in req.body) ){
            res.json({error:"no state parameter"});
            return;
        }
        
        const row = this.db.prepare("select * from info where id = " + req.body.id).get();
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
            this.updateNotifyJob(row);
            this.updateAutoDelayJob(row);
            curDate = new Date(date2str(new Date(Date.now())));
            stmt = this.db.prepare("update info set state = '" + req.body.state + "', ddl='" + curDate + "' where id = " + req.body.id);
        }
        else{
            stmt = this.db.prepare("update info set state = '" + req.body.state + "' where id = " + req.body.id);
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
    this.app.post('/updateddl',checkRequest,(req:express.Request,res:express.Response)=>{
        if( !("id" in req.body) ){
            res.json({error:"no id parameter"});
            return;
        }
        if( !("ddl" in req.body) ){
            res.json({error:"no ddl parameter"});
            return;
        }
        const id = req.body.id;
        const row = this.db.prepare("select * from info where id = " + id).get();
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
            this.db.prepare("update info set ddl = '" + req.body.ddl + "' where id = " + id).run();
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
        this.updateNotifyJob(info);
        this.updateAutoDelayJob(info);
    });

    // update progress
    // id: yyyymmddnn
    // progress: String
    this.app.post('/updateprogress',checkRequest,(req:express.Request,res:express.Response)=>{
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
        
        const row = this.db.prepare("select count(*) as count from progress where id =" + id).get();
        try{
            if( row.count == 0){
                this.db.prepare("insert into progress (id,progress,createtime) values (" + id + ",'" + progress + "',datetime('now','localtime'))").run();
            }
            else{
                this.db.prepare("update progress set progress = '" + progress + "', createtime=datetime('now','localtime') where id = " + id).run();
            }
            res.json({success:"success"});
        }
        catch(err){
            res.json({error:"/updateprogress unknown error"});
            console.log("/updateprogress",err);
        }
    });
}
App.prototype.initJobs = function(){
    const rows = this.db.prepare("select * from info where state = 'PENDING' or state = 'INPROG'").all();
    for(let i=0;i<rows.length;++i){
        this.updateStateHandler(rows[i]);
        this.updateNotifyJob(rows[i]);
        this.updateAutoDelayJob(rows[i]);
    }
}
App.prototype.notify = function(id:number){
    const row = this.db.prepare("select * from info where id = " + id).get();
    if( row ){
        sendMessage(row.detail + "\n" + row.ddl);
        console.log("notification",row.detail,row.ddl);
    }
    delete this.notifyJobs[id];
}
App.prototype.autoDelay = function(id:number){
    const row = this.db.prepare("select * from info where id = "+id).get();
    console.log("autodelay:",row.id);
    this.updateStateHandler(row); 
    this.updateNotifyJob(row);
    this.updateAutoDelayJob(row);
}
App.prototype.updateNotifyJob = function(info:infoType){
    if( !isActivated(info.state) ){
        if( info.id in this.notifyJobs ){
            this.notifyJobs[info.id].cancel();
            delete this.notifyJobs[info.id];
        }
        return;
    }
    let notifyDate = new Date(info.ddl);
    notifyDate.setDate(notifyDate.getDate() - (info.level == 0 ? 7:1));
    if(notifyDate.getTime() <= Date.now()){
        notifyDate = new Date(Date.now());
        notifyDate.setSeconds(notifyDate.getSeconds() + 10); 
    } 
    console.log("add notify ", notifyDate,info.level,info.id);
    // todo notify bind need bind(this,info.id)?
    addJobs(info.id,notifyDate,this.notifyJobs,this.notify.bind(null,info.id));
}
App.prototype.updateAutoDelayJob = function(info:infoType){
    if( !isActivated(info.state) ){
        if( info.id in this.autoDelayJobs ){
            this.autoDelayJobs[info.id].cancel();
            delete this.autoDelayJobs[info.id];
        }
        return;
    }
    let autoDelayDate = new Date(info.ddl);
    if( autoDelayDate.getTime() <= Date.now()){
        autoDelayDate = new Date(Date.now());
        autoDelayDate.setSeconds(autoDelayDate.getSeconds() + 10); 
    }
    console.log("add autodelay ",autoDelayDate,info.level,info.id);
    addJobs(info.id,autoDelayDate,this.autoDelayJobs,this.autoDelay.bind(null,info.id));
}
App.prototype.updateStateHandler = function(info:infoType){
    let ddlDate = new Date(info.ddl);
    const currentDate = new Date(Date.now());
    if( ddlDate > currentDate ){
        return;
    }
    const diffDay = Math.floor((currentDate.getTime() - ddlDate.getTime()) / 86400000); // 24*3600*1000
    const step = info.level == 0 ? 30 : 7;
    const diff = Math.floor(diffDay/step) + 1;
    info.priority -= diff;
    if( info.priority < 0 ){
        info.priority = 0;
        info.state = "KILLED";
        this.db.prepare("update info set state = 'KILLED',priority=0,ddl=datetime('now','localtime') where id = " + info.id).run();
        return;
    }
    ddlDate = new Date(ddlDate.setDate(ddlDate.getDate() + (step*diff) ));
    const ddlStr = date2str(ddlDate);
    info.ddl = ddlStr;
    this.db.prepare("update info set priority = " + info.priority + ", ddl = datetime('" + ddlStr + "') where id = " + info.id).run();
}