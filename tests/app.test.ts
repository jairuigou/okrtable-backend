import * as request from 'supertest';
import app from "../src/app";


describe("nomal test",()=>{
  test("get /",(done)=>{
    request(app).get("/")
      .expect(200)
      .expect((res)=>{
        res.body.text = "hello";
      })
      .end((err,res)=>{
        if( err )
          return done(res);
        return done();
      })
  })
});