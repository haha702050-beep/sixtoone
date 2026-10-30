const json=(data,status=200)=>new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}});
export default async function handler(request){
 if(!['GET','POST'].includes(request.method))return json({error:'Method not allowed'},405);
 const base=(process.env.SUPABASE_URL||'').replace(/\/$/,'');const key=process.env.SUPABASE_PUBLISHABLE_KEY||'';
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(base)||!(key.startsWith('sb_publishable_')||key.startsWith('eyJ')))return json({error:'请检查 Supabase 环境配置'},503);
 const headers={apikey:key,'Content-Type':'application/json'};
 async function upstream(path,body){const r=await fetch(base+'/rest/v1/'+path,{method:body?'POST':'GET',headers,body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(12000)});const raw=await r.text();let data;try{data=raw?JSON.parse(raw):null}catch{throw Error('数据库响应异常')}if(!r.ok)throw Error(data?.message||'请先执行月历数据库迁移');return data;}
 try{
 if(request.method==='GET'){
 const month=new URL(request.url).searchParams.get('month');if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month||''))return json({error:'月份无效'},400);
 const [y,m]=month.split('-').map(Number),end=new Date(Date.UTC(y,m,0)).getUTCDate();
 const [meals,audit]=await Promise.all([upstream('meal_calendar_v22?select=*&meal_date=gte.'+month+'-01&meal_date=lte.'+month+'-'+end+'&order=meal_date.asc'),upstream('meal_calendar_audit_v22?select=*&order=id.desc&limit=50')]);return json({meals,audit});
 }
 let p;try{p=await request.json()}catch{return json({error:'请求格式错误'},400)}
 if(!/^\d{4}-\d{2}-\d{2}$/.test(p.date||'')||!['lunch','dinner'].includes(p.slot)||typeof p.actor!=='string'||!p.actor.trim()||p.actor.trim().length>20||!Number.isSafeInteger(p.version)||p.version<0||typeof p.remove!=='boolean'||(!p.remove&&(typeof p.food!=='string'||!p.food.trim()||p.food.trim().length>80)))return json({error:'请检查日期、菜名和昵称'},400);
 await upstream('rpc/edit_meal_calendar_v22',{p_date:p.date,p_slot:p.slot,p_food:p.food||'',p_actor:p.actor.trim(),p_version:p.version,p_delete:p.remove});return json({ok:true});
 }catch(e){return json({error:e.message},400)}
}
