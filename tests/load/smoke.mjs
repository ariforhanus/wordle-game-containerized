import { performance } from 'node:perf_hooks';
const base=new URL(process.env.LOAD_TEST_BASE_URL??'http://localhost:18080');
if(!['localhost','127.0.0.1'].includes(base.hostname)&&process.env.ALLOW_STAGING_LOAD_TEST!=='true')throw new Error('Only local test targets are enabled by default');
const times=[];let failures=0;
for(let round=0;round<6;round++){
 await Promise.all(Array.from({length:5},async()=>{const started=performance.now();try{const response=await fetch(new URL('/api/v1/leaderboard/daily?lang=en',base));if(!response.ok)failures++;await response.text();}catch{failures++;}times.push(performance.now()-started);}));
 if(round<5)await new Promise(resolve=>setTimeout(resolve,1000));
}
times.sort((a,b)=>a-b);const p95=times[Math.ceil(times.length*.95)-1];
console.log(JSON.stringify({requests:times.length,failures,p95Ms:Math.round(p95),target:base.origin}));
if(failures||p95>1000)process.exitCode=1;
