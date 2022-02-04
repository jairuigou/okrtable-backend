require('dotenv').config()
const mariadb = require('mariadb');
const express = require('express');
const cors = require('cors');
const {checkRequest} = require('./middleware');
const {date2str,initJobs,isActivated,updateAutoDelayJob, updateNotifyJob} = require('./utils');

const app = express();
const port = 3000;

app.use(express.urlencoded({extended:false}));
app.use(express.json());
app.use(cors());

(async ()=>{
    try{
        var conn = await mariadb.createConnection({
            host: process.env.DB_HOST,
            user: process.env.DB_USER,
            password: process.env.DB_PASS,
            database: 'okrtabledb'});
    }
    catch(err){
        console.log("connect to db error",err);
    }

    var notifyJobs = {};
    var autoDelayJobs = {};
    var param = { conn:conn,notifyJobs:notifyJobs,autoDelayJobs:autoDelayJobs };

    await initJobs(param);
    
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
        var startDate = new Date(req.body.start + " 00:00:00");
        var endDate = new Date(req.body.start + " 00:00:00");
        endDate.setDate(startDate.getDate() + parseInt(req.body.duration));
        var startDateStr = date2str(startDate);  
        var endDateStr = date2str(endDate);

        var queryRange = "select * from info where ddl >= \'" + 
                startDateStr + "\' and ddl <= \'" + endDateStr + "\' ";
        if( "level" in req.body ){
            queryRange += "and level = " + req.body.level;
        }
        if( "state" in req.body ){
            queryRange += "and state = " + req.body.state;
        }
        if( "priority" in req.body ){
            queryRange += "and priority = " + req.body.priority;
        }
        
        conn.query({dateStrings:true, sql:queryRange})
        .then((rows)=>{
            res.send(rows);
        })
        .catch((err)=>{
            console.log(err);
            res.json({error:"error"});
        })

    });
    
    // get progress by id
    // id: yyyymmddnn
    app.post('/getprogress',checkRequest,(req,res)=>{
        if( !("id" in req.body) ){
            res.json({error:"no id parameter"});
            return;
        }
        var querySql = "select * from progress where id = " + req.body.id;
        conn.query(querySql)
        .then((rows)=>{
            res.send(rows);
        })
        .catch(err=>{
            res.json({error:err});
        })
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
        var detail = req.body.detail;

        if( !("level" in req.body) ){
            res.json({error:"no level parameter"});
            return;
        }
        var level = req.body.level;

        if( "priority" in req.body ){
            var priority = req.body.priority;
        }
        else{
            var priority = 2;
        }

        if( "state" in req.body ){
            var state = req.body.state;
        }
        else{
            var state = "PENDING";
        }

        if( !("ddl" in req.body) ){
            res.json({error:"no ddl parameter"});
            return;
        }
        var ddl = req.body.ddl;

        var today = new Date(Date.now());
        var start = today.getFullYear() * 10000 + (today.getMonth()+1)*100 + today.getDate();
        start *= 100;
        var end = start + 99;
        var queryCount = "select count(*) as count from info where id >= " + start + " and id <= " + end;
        var id = start;

        conn.query(queryCount)
            .then(rows=>{
                id = start + rows[0].count;
                var queryInsert = "insert into info values (" + id + ",\'" + detail + "\'," + level
                                    + "," + priority + ",\'" + state + "\',\'" + ddl + "\')";
                return conn.query(queryInsert);    
            })
            .then(rows=>{
                var queryInsert = "insert into ddl (id,ddl) values (" + id + ",\'" + ddl + "\')";
                return conn.query(queryInsert); 
            })
            .then(rows=>{
                var info = {id:id,detail:detail,level:level,priority:priority,state:state,ddl:ddl};
                updateNotifyJob(info,param);
                updateAutoDelayJob(info,param); 
                res.json({success:id});
            })
            .catch(err=>{
                console.log("Error: " + err);
                res.json({error: err});
            })
    });

    // update priority
    // id: yyyymmddnn
    // priority: 0,1,2
    // todo check query result
    app.post('/updateprior',checkRequest,(req,res)=>{
        if( !("id" in req.body) ){
            res.json({error:"no id parameter"});
            return;
        }
        if( !("priority" in req.body) ){
            res.json({error:"no priority parameter"});
            return;
        }
        var id = req.body.id;
        var sql = "select * from info where id = " + id;
        conn.query(sql)
        .then(rows=>{
            if( rows.length < 1 ){
                return {error:"invalid id " + id};
            }
            if( !isActivated(rows[0].state) ){
                return {error:"target " + id + " state is " + rows[0].state};
            }

            sql = "update info set priority = " + req.body.priority
                            + " where id = " + req.body.id;
            return conn.query(sql);
        })
        .then(rows=>{
            if( 'error' in rows){
                res.json(rows);
            }
            else{
                res.json({success:"success"});
            }
        })          
        .catch(err=>{
            console.log("updateprior:",err);
            res.json({error:"unknown error"});
        });
    });
        
    // todo use middleware to check date format
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

        var sql = "select * from info where id = " + req.body.id;
        conn.query(sql)
        .then(rows=>{
            if( rows.length < 1 ){
                res.json({error:"invalid id "+id});
                return;
            }
            if( !isActivated(rows[0].state) ){
                res.json({error:"target " + id + " state is " + rows[0].state});
                return;
            }
            var state = req.body.state;
            if( state == 'KILLED' || state == 'DONE' || state == 'BLOCKED' ){
                rows[0].state = state;
                updateNotifyJob(rows[0],param);
                updateAutoDelayJob(rows[0],param);
                sql = "update info set state = \'" + req.body.state + "\', ddl=\'" + date2str(new Date(Date.now()))
                            + "\' where id = " + req.body.id;
            }
            else{
                sql = "update info set state = \'" + req.body.state
                            + "\' where id = " + req.body.id;
            }
            return conn.query(sql);
        })
        .then(rows=>{
            res.json({success:"success"});
        })          
        .catch(err=>{
            console.log("updatestate:",err);
            res.json({error:"unknown error"});
        });
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
        var id = req.body.id;
        var sql = "select * from info where id = " + id;
        conn.query(sql)
        .then(rows=>{
            if( rows.length < 1 ){
                res.json({error:"invalid id "+id});
                return;
            }
            if( !isActivated(rows[0].state) ){
                res.json({error:"target " + id + " state is " + rows[0].state});
                return;
            }
            var newDdl = new Date(req.body.ddl);
            if( newDdl <= Date.now() ){
                res.json({error:"cannot set a ddl earlier than the current time " + Date.now()});
                return;
            } 
            
            sql = "update info set ddl = \'" + req.body.ddl + "\' where id = " + id;
            return conn.query(sql);
        })
        .then(rows=>{
            sql = "insert into ddl (id,ddl) values (" + id + ",\'" + req.body.ddl + "\')";
            return conn.query(sql);
        })          
        .then(rows=>{
            var info = {id:id,ddl:req.body.ddl,state:"PENDING"};
            updateNotifyJob(info,param);
            updateAutoDelayJob(info,param);
        })
        .catch(err=>{
            console.log("updateddl:",err);
            res.json({error:"unknown error"});
        });

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
        var id = req.body.id;
        var progress = req.body.progress;
        
        var sql = "select count(*) as count from progress where id =" + id;
        conn.query(sql)
        .then(rows=>{
            if( rows[0].count == 0){
                sql = "insert into progress (id,progress) values (" + id + ",\'" + progress + "\')";
            }
            else{
                sql = "update progress set progress = \'" + progress + "\' where id = " + id;
            }
            return conn.query(sql)
        })
        .then(rows=>{
            res.json({success:"success"});
        })
        .catch(err=>{
            console.log("update progress error:",err);
            res.json({error:err});
        });
    });
    
    app.listen(port,()=>{console.log("listening at http://localhost:${port}")});
    
})();