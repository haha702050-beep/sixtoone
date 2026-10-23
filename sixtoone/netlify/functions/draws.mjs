// Netlify Functions: all browser requests stay on the Netlify origin.
// SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY are set in Netlify UI (Functions scope).
const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
export default async function handler(request){
  if(!['GET','POST'].includes(request.method)) return json({error:'Method not allowed'},405);
  const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');
  const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
  if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!key.startsWith('sb_publishable_')&&!key.startsWith('eyJ')) return json({error:'Netlify 环境变量未正确设置：SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY'},503);
  const headers={'apikey':key,'Content-Type':'application/json'};
  let path,method=request.method,body;
  if(method==='GET'){
    const url=new URL(request.url);const offset=Number(url.searchParams.get('offset')||0),limit=Number(url.searchParams.get('limit')||1000);
    if(!Number.isInteger(offset)||offset<0||offset>10000||!Number.isInteger(limit)||limit<1||limit>1000)return json({error:'无效的查询范围'},400);
    const query=new URLSearchParams({select:'id,nickname,food,created_at',order:'id.desc',offset:String(offset),limit:String(limit)});
    path='/rest/v1/food_draws?'+query;
  }else{
    let payload;try{payload=await request.json()}catch{return json({error:'JSON 格式错误'},400)}
    const nickname=typeof payload.nickname==='string'?payload.nickname.trim():'';
    const clientId=payload.clientId;
    if(!nickname||[...nickname].length>20||typeof clientId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId))return json({error:'昵称或设备标识无效'},400);
    path='/rest/v1/rpc/make_food_draw';body=JSON.stringify({p_nickname:nickname,p_client_id:clientId});
  }
  let res;
  try{res=await fetch(base+path,{method,headers,body,signal:AbortSignal.timeout(12000)})}
  catch(e){return json({error:'Netlify 服务端访问 Supabase 失败：'+(e?.name==='TimeoutError'?'请求超时':e.message)},502)}
  let data;try{data=await res.json()}catch{return json({error:'Supabase 返回了无法解析的响应（HTTP '+res.status+'）'},502)}
  if(!res.ok)return json({error:data.message||data.error||data.hint||('Supabase HTTP '+res.status)},res.status===401||res.status===403?502:400);
  return method==='GET'?json({records:data}):json({record:Array.isArray(data)?data[0]:data});
}
