import { Request, Response, NextFunction } from 'express';

export function checkRequest(req:Request,res:Response,next:NextFunction){
    if( "id" in req.body ){
        if( !(/^\d{10}$/).test(req.body.id) ){
            res.json({error:"id format error : YYYYMMDDNN"});
            return;
        }
    }
    if( "level" in req.body ){
        if( req.body.level != 0 && req.body.level != 1){
            res.json({error:"level parameter can only be 0 or 1"});
            return;
        }
    }
    if( "priority" in req.body ){
        if( req.body.priority != 0 && req.body.priority != 1 && req.body.priority != 2){
            res.json({error:"priority parameter can only be 0,1,2"});
            return;
        }
    }
    if( "state" in req.body ){
        if( req.body.state != "PENDING" && req.body.state != "INPROG" && req.body.state != "DONE"
                && req.body.state != "BLOCKED" && req.body.state != "KILLED" ){
                    res.json({error:"state parameter can only be PENDING,INPROG,DONE,BLOCKED,KILLED"});
                    return;
        }
    }
    if( "ddl" in req.body ){
        if( !(/^\d{4}-\d{2}-\d{2}\s\d{2}:\d{2}:\d{2}$/).test(req.body.ddl) ){
            res.json({error:"ddl format error : YYYY-MM-DD hh:mm:ss"});
            return;
        }
    }
    if( "duration" in req.body ){
        if( req.body.duration < 0 ){
            res.json({error:"duration parameter cannot smaller than 0"});
            return;
        }
    }
    if( "start" in req.body){
        if( !(/^\d{4}-\d{2}-\d{2}$/).test(req.body.start)){
            res.json({error:"start format error : YYYY-MM-DD"});
            return;
        }
    }
    
    next();
}