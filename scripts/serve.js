const http=require('http'),fs=require('fs'),path=require('path');
const root=path.resolve(__dirname,'..');
const mime={'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8'};
http.createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');const requested=decodeURIComponent(url.pathname);
  const file=path.resolve(root,'.'+(requested.endsWith('/')?requested+'index.html':requested));
  if(!file.startsWith(root+path.sep)){res.writeHead(403);res.end();return}
  fs.readFile(file,(error,body)=>{if(error){res.writeHead(404);res.end('Not found');return}res.writeHead(200,{'Content-Type':mime[path.extname(file)]||'application/octet-stream'});res.end(body)});
}).listen(8000,()=>console.log('http://localhost:8000'));
