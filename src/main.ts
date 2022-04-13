import App from "./app";
import dotenv = require('dotenv');

dotenv.config();

const app = new App().server;
const port = 3000;
app.listen(port,()=>{console.log("listening at http://localhost:"+port)});