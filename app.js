const mariadb = require('mariadb');
const express = require('express');
const cors = require('cors');
const {checkRequest} = require('./middleware');

const app = express();
const port = 3000;

app.use(express.urlencoded({extended:false}));
app.use(express.json());
app.use(cors());

mariadb.createConnection({
    host: 'db',
    user: 'root',
    password: 'root',
    database: 'okrtabledb'
})
.then(conn=>{

    // post param: level,start,duration
    // level: 0 or 1
    // start : yyyy-mm-dd
    // duration : n days
    // select all object whose ddl date in range.
    // range from yyyy-mm-dd 00:00:00 to n*24 hours later
    // n must >= 0 , if n == 0 , only select the object whose ddl is at yyyy-mm-dd 00:00:00
    app.post('/',checkRequest,(req,res)=>{
        if( !("level" in req.body) ){
            res.json({error:"no level parameter"});
            return;
        }
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
                    startDateStr + "\' and ddl <= \'" + endDateStr + "\' and level = " + req.body.level;
        
        conn.query({dateStrings:true, sql:queryRange})
            .then( (rows)=>{
                res.send(rows);
            })
            .catch(err=>{
                console.log("Error: " + err);
                res.json({error:"query error"});
            })
    });

    // create new record
    // detail: String
    // level: 0 or 1
    // priority: 0,1,2
    // state: "PENDING","INPROG","DONE","BLOCKED","KILLED"
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
                var createDate = date2str(new Date(Date.now()));
                var queryInsert = "insert into ddl values (" + id + ",\'" + ddl + "\',\'" + createDate + "\')";
                console.log(queryInsert);
                return conn.query(queryInsert); 
            })
            .then(rows=>{
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
        
        var queryUpdate = "update info set priority = " + req.body.priority
                            + " where id = " + req.body.id;
        
        conn.query(queryUpdate)
            .then(rows=>{
                res.json({success:"success"});
            })
            .catch(err=>{
                console.log(err);
                res.json({error:err});
            })
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

        var queryUpdate = "update info set state = " + req.body.state
                            + " where id = " + req.body.id;
        
        conn.query(queryUpdate)
            .then(rows=>{
                res.json({success:"success"});
            })
            .catch(err=>{
                console.log(err);
                res.json({error:err});
            })
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
        var ddl = req.body.ddl;

        var queryUpdate = "update info set ddl = \'" + ddl + "\' where id = " + id;

        conn.query(queryUpdate)
        .then(rows=>{
            var createDate = date2str(new Date(Date.now())) 
            var queryInsert = "insert into ddl values (" + id + ",\'" + ddl + "\',\'" +
                                createDate + "\' )";
            return conn.query(queryInsert);
        })
        .then(rows=>{
            res.json({success:"success"});
        })
        .catch(err=>{
            res.json({error:err});
        })
        
    });

    // update progress
    app.post('/updateprogress',checkRequest,(req,res)=>{

    });

    app.listen(port,()=>{console.log("listening at http://localhost:${port}")});
})
.catch(err=>{
    console.log(err);
});

function date2str(date){
    return date.getFullYear().toString().padStart(4,"0") + "-" + 
            (date.getMonth()+1).toString().padStart(2,"0") + "-" +
              date.getDate().toString().padStart(2,"0") + " " + 
                date.getHours().toString().padStart(2,"0") + ":" +
                  date.getMinutes().toString().padStart(2,"0") + ":" +
                    date.getSeconds().toString().padStart(2,"0"); 
}