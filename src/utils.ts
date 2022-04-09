import schedule = require('node-schedule');
import nodemailer = require('nodemailer');
import Sqlite = require('better-sqlite3');

export type jobsMapType = Record<number,schedule.Job>;
export interface resourceType{
    db: Sqlite.Database;
    notifyJobs: jobsMapType;
    autoDelayJobs: jobsMapType;
}
export interface infoType{
    id: number;
    detail: string;
    level: number;
    priority: number;
    state: string;
    ddl: string;
}


export function date2str(date:Date)
{
    return date.getFullYear().toString().padStart(4,"0") + "-" + 
            (date.getMonth()+1).toString().padStart(2,"0") + "-" +
              date.getDate().toString().padStart(2,"0") + " " + 
                date.getHours().toString().padStart(2,"0") + ":" +
                  date.getMinutes().toString().padStart(2,"0") + ":" +
                    date.getSeconds().toString().padStart(2,"0"); 
}
function addJobs(id:number,date:Date,jobs:jobsMapType,callbackfun:()=>void)
{
    if( id in jobs){
        jobs[id].reschedule(date.getTime());
    }
    else{
        jobs[id] = schedule.scheduleJob(date,callbackfun);
    }
}
export function isActivated(state:string)
{
    return state == "PENDING" || state == "INPROG";
}

export function initJobs(param:resourceType)
{
    const rows = param.db.prepare("select * from info where state = 'PENDING' or state = 'INPROG'").all();
    for(let i=0;i<rows.length;++i){
        updateStateHandler(rows[i],param.db);
        updateNotifyJob(rows[i],param);
        updateAutoDelayJob(rows[i],param);
    }
}
export function updateNotifyJob(info:infoType,param:resourceType)
{
    if( !isActivated(info.state) ){
        if( info.id in param.notifyJobs ){
            param.notifyJobs[info.id].cancel();
            delete param.notifyJobs[info.id];
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
    addJobs(info.id,notifyDate,param.notifyJobs,notify.bind(null,info.id,param));
}
function notify(id:number,param:resourceType)
{
    const row = param.db.prepare("select * from info where id = " + id).get();
    if( row ){
        sendMessage(row.detail + "\n" + row.ddl);
        console.log("notification",row.detail,row.ddl);
    }
    delete param.notifyJobs[id];
}
export function updateAutoDelayJob(info:infoType,param:resourceType)
{
    if( !isActivated(info.state) ){
        if( info.id in param.autoDelayJobs ){
            param.autoDelayJobs[info.id].cancel();
            delete param.autoDelayJobs[info.id];
        }
        return;
    }
    let autoDelayDate = new Date(info.ddl);
    if( autoDelayDate.getTime() <= Date.now()){
        autoDelayDate = new Date(Date.now());
        autoDelayDate.setSeconds(autoDelayDate.getSeconds() + 10); 
    }
    console.log("add autodelay ",autoDelayDate,info.level,info.id);
    addJobs(info.id,autoDelayDate,param.autoDelayJobs,autoDelay.bind(null,info.id,param));
}
function autoDelay(id:number,param:resourceType)
{
    const row = param.db.prepare("select * from info where id = "+id).get();
    console.log("autodelay:",row.id);
    updateStateHandler(row,param.db); 
    updateNotifyJob(row,param);
    updateAutoDelayJob(row,param);
}
function updateStateHandler(info:infoType,db:Sqlite.Database)
{
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
        db.prepare("update info set state = 'KILLED',priority=0,ddl=datetime('now','localtime') where id = " + info.id).run();
        return;
    }
    ddlDate = new Date(ddlDate.setDate(ddlDate.getDate() + (step*diff) ));
    const ddlStr = date2str(ddlDate);
    info.ddl = ddlStr;
    db.prepare("update info set priority = " + info.priority + ", ddl = datetime('" + ddlStr + "') where id = " + info.id).run();
}
async function sendMessage(msg:string)
{
  const subject = "okrtable notification";
  const text = msg;
  const transporter = nodemailer.createTransport({
    host: "smtp.163.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.MAIL_USER, // generated ethereal user
      pass: process.env.MAIL_PASS, // generated ethereal password
    },
  });

  try{
    // send mail with defined transport object
    const info = await transporter.sendMail({
        from: process.env.MAIL_FROM, // sender address
        to: process.env.MAIL_SENDTO, // list of receivers
        subject: subject, // Subject line
        text: text, // plain text body
    });
    console.log("Message sent: %s", info.messageId);
  }
  catch(err){
      console.log("Send mail failed:",err.message);
  }
}