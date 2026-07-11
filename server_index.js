import {config} from './config.js';import {createServer} from './httpApp.js';
if(process.env.NODE_ENV!=='test')createServer().listen(config.port,config.host,()=>console.log(`Metadata Lab listening on http://${config.host}:${config.port}`));
