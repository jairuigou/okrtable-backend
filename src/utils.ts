import schedule = require('node-schedule');
import nodemailer = require('nodemailer');

export type jobsMapType = Record<number,schedule.Job>;
export function date2str(date:Date)
{
    return date.getFullYear().toString().padStart(4,"0") + "-" + 
            (date.getMonth()+1).toString().padStart(2,"0") + "-" +
              date.getDate().toString().padStart(2,"0") + " " + 
                date.getHours().toString().padStart(2,"0") + ":" +
                  date.getMinutes().toString().padStart(2,"0") + ":" +
                    date.getSeconds().toString().padStart(2,"0"); 
}
export function addJobs(id:number,date:Date,jobs:jobsMapType,callbackfun:()=>void)
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
export async function sendMessage(msg:string)
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