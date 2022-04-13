import * as request from 'supertest';
import { date2str } from '../src/utils';
import App from '../src/app';
import fs = require('fs');
import path = require('path');

const testdbFileName = 'okrtable.test.db';
fs.unlinkSync(path.join('db',testdbFileName));
const app = new App({dbFileName:testdbFileName});

describe('normal test',()=>{
  const testagent = request(app.server);
  const ddlDate = new Date(Date.now());
  const deduceId = (ddlDate.getFullYear() * 10000 + (ddlDate.getMonth()+1)*100 + ddlDate.getDate())*100;
  const curDateStr = date2str(ddlDate);
  ddlDate.setDate(ddlDate.getDate() + 3);
  const ddlDateStr = date2str(ddlDate);
  const testItem = {
    id: deduceId,
    detail: 'normal test: create',
    level: 0,
    priority: 2,
    state: 'PENDING',
    ddl: ddlDateStr 
  };
  const progress = 'progress line 1\n';

  it('create',async ()=>{
    const res = await testagent
      .post('/create')
      .send({detail:testItem.detail,level:testItem.level,ddl:testItem.ddl});
    expect(res.status).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toEqual(testItem.id);
  });

  it('change priority',async ()=>{
    testItem.priority = 1;
    const res = await testagent
      .post('/updateprior')
      .send({id:testItem.id,priority:testItem.priority})
    expect(res.status).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toEqual('success');
  });
  
  it('change state', async ()=>{
    testItem.state = 'INPROG';
    const res = await testagent
      .post('/updatestate')
      .send({id:testItem.id,state:testItem.state});
    expect(res.status).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toEqual('success'); 
  });

  it('change ddl',async ()=>{
    ddlDate.setDate(ddlDate.getDate() + 1);
    testItem.ddl = date2str(ddlDate);
    const res = await testagent
      .post('/updateddl')
      .send({id:testItem.id,ddl:testItem.ddl});
    expect(res.status).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toEqual('success'); 
  });

  it('update progress',async ()=>{
    const res = await testagent
      .post('/updateprogress')
      .send({id:testItem.id,progress:progress});
    expect(res.status).toEqual(200);
    expect(res.headers['content-type']).toMatch(/json/);
    expect(res.body.success).toEqual('success');    
  });

  it('get info',async ()=>{
    const res = await testagent
      .post('/')
      .send({start:curDateStr.substring(0,10),duration:7});
    expect(res.status).toEqual(200);
    expect(res.body[0].id).toEqual(testItem.id);
    expect(res.body[0].detail).toEqual(testItem.detail);
    expect(res.body[0].level).toEqual(testItem.level);
    expect(res.body[0].priority).toEqual(testItem.priority);
    expect(res.body[0].state).toEqual(testItem.state);
    expect(res.body[0].ddl).toEqual(testItem.ddl);
  });

  it('get progress',async ()=>{
    const res = await testagent
      .post('/getprogress')
      .send({id:testItem.id});
    expect(res.status).toEqual(200);
    expect(res.body[0].id).toEqual(testItem.id);
    expect(res.body[0].progress).toEqual(progress);
  })

  afterAll(()=>{
    app.clearJobs();
  });
 
});