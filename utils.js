const schedule = require('node-schedule');
const nodemailer = require('nodemailer');

function date2str(date)
{
    return date.getFullYear().toString().padStart(4,"0") + "-" + 
            (date.getMonth()+1).toString().padStart(2,"0") + "-" +
              date.getDate().toString().padStart(2,"0") + " " + 
                date.getHours().toString().padStart(2,"0") + ":" +
                  date.getMinutes().toString().padStart(2,"0") + ":" +
                    date.getSeconds().toString().padStart(2,"0"); 
}
function addJobs(id,date,jobs,callbackfun)
{
    if( id in jobs){
        jobs[id].reschedule(date);
    }
    else{
        jobs[id] = schedule.scheduleJob(date,callbackfun);
    }
}
function isActivated(state)
{
    return state == "PENDING" || state == "INPROG";
}

async function initJobs(param)
{
    try{
        var rows = await param.conn.query("select * from info where state = \'PENDING\' or state = \'INPROG\'");
    }
    catch(err){
        console.log("Init jobs error:",err);
        return;
    }

    for(var i=0;i<rows.length;++i){
        await updateStateHandler(rows[i],param.conn);
        updateNotifyJob(rows[i],param);
        updateAutoDelayJob(rows[i],param);
    }
}
function updateNotifyJob(info,param)
{
    if( !isActivated(info.state) ){
        if( info.id in param.notifyJobs ){
            param.notifyJobs[info.id].cancel();
            delete param.notifyJobs[info.id];
        }
        return;
    }
    var notifyDate = new Date(info.ddl);
    notifyDate.setDate(notifyDate.getDate() - (info.level == 0 ? 7:1));
    if(notifyDate <= Date.now()){
        notifyDate = new Date(Date.now());
        notifyDate.setSeconds(notifyDate.getSeconds() + 10); 
    } 
    console.log("add notify ", notifyDate,info.level,info.id);
    addJobs(info.id,notifyDate,param.notifyJobs,notify.bind(null,info.id,param));
}
async function notify(id,param)
{
    try{
        var rows = await param.conn.query("select * from info where id = " + id);
        sendMessage(rows[0].detail + "\n" + rows[0].ddl);
        console.log("notification",rows[0].detail,rows[0].ddl);
    }
    catch(err){
        console.log("notify:",err);
    }
    delete param.notifyJobs[id];
}
function updateAutoDelayJob(info,param)
{
    if( !isActivated(info.state) ){
        if( info.id in param.autoDelayJobs ){
            param.autoDelayJobs[info.id].cancel();
            delete param.autoDelayJobs[info.id];
        }
        return;
    }
    var autoDelayDate = new Date(info.ddl);
    if( autoDelayDate <= Date.now()){
        autoDelayDate = new Date(Date.now());
        autoDelayDate.setSeconds(notifyDate.getSeconds() + 10); 
    }
    addJobs(info.id,autoDelayDate,param.autoDelayJobs,autoDelay.bind(null,info.id,param));
}
async function autoDelay(id,param)
{
    try{
        var rows = await param.conn.query("select * from info where id = "+id);
        console.log("autodelay:",rows[0].id);
    }
    catch(err){
        console.log("autodelay:",err);
    }
    await updateStateHandler(row,param.conn); 
    updateNotifyJob(rows[0],param);
    updateAutoDelayJob(rows[0],param);
}
async function updateStateHandler(info,conn)
{
    var ddlDate = new Date(info.ddl);
    var currentDate = new Date(Date.now());
    if( ddlDate > currentDate ){
        return;
    }
    var diffDay = Math.floor((currentDate - ddlDate) / 86400000); // 24*3600*1000
    var step = info.level == 0 ? 30 : 7;
    var diff = Math.floor(diffDay/step) + 1;
    info.priority -= diff;
    if( info.priority < 0 ){
        info.priority = 0;
        info.state = "KILLED";
        var queryUpdate = "update info set state = \'KILLED\',priority=0,ddl=\'"
                            + date2str(new Date(Date.now()))+ "\'where id = " + info.id;
        try{
            await conn.query(queryUpdate);
        }
        catch(err){
            console.log("update state error",err);
        }
        return;
    }

    ddlDate = new Date(ddlDate.setDate(ddlDate.getDate() + (step*diff) ));
    var ddlStr = date2str(ddlDate);
    info.ddl = ddlStr;
    var queryUpdateInfo = "update info set priority = " + info.priority + ", ddl = \'" + ddlStr + "\' where id = " + info.id;
    var queryInsertDdl = "insert into ddl (id,ddl) values (" + info.id + ",\'" + ddlStr + "\')";
    console.log(queryUpdateInfo);
    console.log(queryInsertDdl);
    try{
        await conn.query(queryUpdateInfo);
        await conn.query(queryInsertDdl);
    }
    catch(err){
        console.log("update state error",err);
    }
}
async function sendMessage(msg)
{
  var subject = "okrtable notification";
  var text = msg;
  let transporter = nodemailer.createTransport({
    host: "smtp.163.com",
    port: 465,
    secure: true, // true for 465, false for other ports
    auth: {
      user: process.env.MAIL_USER, // generated ethereal user
      pass: process.env.MAIL_PASS, // generated ethereal password
    },
  });

  // send mail with defined transport object
  let info = await transporter.sendMail({
    from: process.env.MAIL_FROM, // sender address
    to: process.env.MAIL_SENDTO, // list of receivers
    subject: subject, // Subject line
    text: text, // plain text body
  });
  console.log("Message sent: %s", info.messageId);
}

module.exports.date2str = date2str;
module.exports.isActivated = isActivated;
module.exports.initJobs = initJobs;
module.exports.updateNotifyJob = updateNotifyJob;
module.exports.updateAutoDelayJob = updateAutoDelayJob;