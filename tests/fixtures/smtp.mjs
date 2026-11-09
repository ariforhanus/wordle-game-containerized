// Loopback-only SMTP capture fixture. Never include this in a production deployment.
import net from 'node:net';
import http from 'node:http';
const messages=[];
net.createServer(socket=>{
 socket.write('220 localhost test SMTP\r\n');let input='',data=false,lines=[],recipient='';
 socket.on('data',chunk=>{input+=chunk.toString('utf8');let end;
  while((end=input.indexOf('\r\n'))>=0){const line=input.slice(0,end);input=input.slice(end+2);
   if(data){if(line==='.') {messages.push({to:recipient,body:lines.join('\n')});data=false;lines=[];socket.write('250 captured\r\n');}else lines.push(line.replace(/^\.\./,'.'));continue;}
   const command=line.toUpperCase();
   if(command.startsWith('EHLO')||command.startsWith('HELO'))socket.write('250 localhost\r\n');
   else if(command.startsWith('RCPT TO:')){recipient=line.slice(8).trim().replace(/^<|>$/g,'');socket.write('250 OK\r\n');}
   else if(command==='DATA'){data=true;socket.write('354 End with dot\r\n');}
   else if(command==='QUIT'){socket.end('221 bye\r\n');}
   else socket.write('250 OK\r\n');
  }
 });
}).listen(2525,'127.0.0.1');
http.createServer((req,res)=>{res.writeHead(200,{'Content-Type':'application/json','Cache-Control':'no-store'});res.end(JSON.stringify(messages));}).listen(8025,'127.0.0.1');
