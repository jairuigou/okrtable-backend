const mariadb = require('mariadb');
const express = require('express');

const app = express();
const port = 3000;

app.use(express.urlencoded({extended:false}));
app.use(express.json());

mariadb.createConnection({
    host: '0.0.0.0',
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
    app.post('/',(req,res)=>{
        if( !("level" in req.body) ){
            res.json({error:"no level parameter"});
            return;
        }
        if( req.body.level != 0 && req.body.level != 1){
            res.json({error:"level parameter can only be 0 or 1"});
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
        if( req.body.duration < 0){
            res.json({error:"duration parameter cannot smaller than 0"});
            return;
        }
        
        var startDate = new Date(req.body.start);
        if( startDate == "Invalid Date"){
            res.json({error:"incorrect start date format"});
            return;
        }
        var endDate = new Date(req.body.start);
        endDate.setDate(startDate.getDate() + req.body.duration);
        var startDateStr = startDate.getFullYear().toString().padStart(4,"0") + "-" + 
                            (startDate.getMonth()+1).toString().padStart(2,"0") + "-" +
                                startDate.getDate().toString().padStart(2,"0");
        var endDateStr = endDate.getFullYear().toString().padStart(4,"0") + "-" + 
                            (endDate.getMonth()+1).toString().padStart(2,"0") + "-" +
                                endDate.getDate().toString().padStart(2,"0");

        querysql = "select * from info where ddl >= \'" + 
                    startDateStr + "\' and ddl <= \'" + endDateStr + "\' and level = " + req.body.level;

        console.log("querysql: "+ querysql);

        conn.query(querysql)
            .then(rows=>{
                console.log(rows);
                res.send(rows);
            })
            .catch(err=>{
                console.log("Error: " + err);
            })
    });

    app.listen(port,()=>{console.log("listening at http://localhost:${port}")});
})
.catch(err=>{
    console.log("connect error");
});

