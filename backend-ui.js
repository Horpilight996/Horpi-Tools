/* Horpi Tools hosted backend UI. No service keys or passwords are stored. */
'use strict';
window.HT=(()=>{
  const cfg=window.CATALOG||{}, endpoint=cfg.backend_endpoint||'';
  const enabled=!!endpoint;
  const original=JSON.parse(JSON.stringify(cfg.products||[]));
  let session=null,profile=null,privateReleases=[];
  try{session=JSON.parse(sessionStorage.getItem('horpi-session')||'null')}catch{}
  function save(value){session=value;try{if(value)sessionStorage.setItem('horpi-session',JSON.stringify(value));else sessionStorage.removeItem('horpi-session')}catch{}}
  function node(tag,text,cls){const e=document.createElement(tag);if(text!==undefined)e.textContent=text;if(cls)e.className=cls;return e}
  function field(parent,name,type='text'){const label=node('label',undefined,'field'),input=node('input');input.type=type;input.required=true;label.append(node('span',name),input);parent.append(label);return input}
  function button(parent,title,fn,secondary=false){const b=node('button',title,'button'+(secondary?' secondary':''));b.type='button';b.onclick=fn;parent.append(b);return b}
  function info(parent,text){const n=node('p',text,'form-status');parent.append(n);return n}
  function errorText(error){return ({LOGIN_FAILED:'Hibás felhasználónév vagy jelszó.',UNAUTHORIZED:'Lépj be újra.',FORBIDDEN:'Ehhez nincs jogosultságod.',RATE_LIMIT:'Túl sok próbálkozás. Várj néhány percet.',INVALID:'Ellenőrizd a megadott adatokat.'})[error.message]||'A szolgáltatás most nem érhető el. Próbáld újra.'}
  async function send(data,token){const r=await fetch(endpoint,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});let result;try{result=await r.json()}catch{throw Error('SERVICE')}if(!r.ok)throw Error(result.error||'SERVICE');return result}
  async function api(data){
    if(!enabled)throw Error('SERVICE');
    if(session&&Date.now()>session.expires_at-30000){
      try{const s=await send({action:'refresh',refresh_token:session.refresh_token});save({...s,expires_at:Date.now()+s.expires_in*1000})}
      catch(error){save(null);profile=null;restore();throw error}
    }
    return send(data,session?.access_token);
  }
  function restore(){cfg.products=JSON.parse(JSON.stringify(original));privateReleases=[];updateHeader()}
  function updateHeader(){const link=document.getElementById('developer');if(!link)return;link.href=profile?'#account':'#login';link.removeAttribute('target');link.textContent=profile?profile.username:'Belépés'}
  async function hydrate(){const state=await api({action:'session'});profile=state.profile;privateReleases=state.releases||[];restore();privateReleases=state.releases||[];for(const p of cfg.products){const own=privateReleases.filter(r=>r.product===p.id).sort((a,b)=>{const x=a.version.split('.').map(Number),y=b.version.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++){if((x[i]||0)!==(y[i]||0))return (y[i]||0)-(x[i]||0)}return 0});if(own.length){p.releases=[...own.map(r=>({...r,date:r.released_at?.slice(0,10),assets:r.assets.map(a=>({...a,url:'#download/'+a.id}))})),...p.releases.filter(r=>!own.some(x=>x.version===r.version))];p.latest_development=p.releases[0].version}}updateHeader();return state}
  async function loginPage(main){
    if(profile)return account(main);
    main.append(node('h1','Belépés'));
    const form=node('form',undefined,'block auth'),user=field(form,'Felhasználónév'),pass=field(form,'Jelszó','password');user.autocomplete='username';pass.autocomplete='current-password';
    const status=info(form,'');const submit=node('button','Belépés','button');submit.type='submit';form.append(submit);main.append(form);
    form.onsubmit=async event=>{event.preventDefault();submit.disabled=true;try{const s=await send({action:'login',username:user.value,password:pass.value});pass.value='';save({...s,expires_at:Date.now()+s.expires_in*1000});await hydrate();location.hash='#account'}catch(e){status.textContent=errorText(e)}finally{submit.disabled=false}};
  }
  async function account(main){
    if(!profile){location.hash='#login';return}
    main.append(node('h1','Saját fiók'));const block=node('section',undefined,'block');main.append(block);block.append(node('h2',profile.display_name),node('p','Felhasználónév: '+profile.username));
    if(['owner','admin'].includes(profile.role))button(block,'Felhasználókezelés',()=>location.hash='#admin');
    button(block,'Tesztkiadások',()=>location.hash='#downloads');
    if(profile.role==='owner'){const a=node('a','Privát GitHub ↗','button secondary');a.href='https://github.com/Horpilight996/ShowEngine';a.target='_blank';a.rel='noopener';block.append(a)}
    button(block,'Kilépés',async()=>{try{await api({action:'logout'})}finally{save(null);profile=null;restore();location.hash='#home'}},true);
  }
  function choose(parent,label,options){const l=node('label',undefined,'field'),select=node('select');l.append(node('span',label),select);for(const [value,title]of options){const o=node('option',title);o.value=value;select.append(o)}parent.append(l);return select}
  async function admin(main){
    main.append(node('h1','Felhasználókezelés'));const status=info(main,'Betöltés…');let state;
    try{state=await api({action:'admin'});status.textContent=''}catch(e){status.textContent=errorText(e);return}
    const run=async(data)=>{try{await api(data);window.horpiRender()}catch(e){status.textContent=errorText(e)}};
    if(profile.role==='owner'){
    const invite=node('form',undefined,'block');invite.append(node('h2','Admin meghívása'));
    const name=field(invite,'Név'),email=field(invite,'Email','email'),user=field(invite,'Felhasználónév');info(invite,'Csak admin kap belépőfiókot. A meghívott emailben állíthatja be a saját jelszavát.');const submit=node('button','Meghívó küldése','button');submit.type='submit';invite.append(submit);main.append(invite);invite.onsubmit=async e=>{e.preventDefault();submit.disabled=true;await run({action:'invite',name:name.value,email:email.value,username:user.value});submit.disabled=false};
    }
    for(const u of state.users){const card=node('section',undefined,'block');main.append(card);card.append(node('h2',u.display_name+' · '+u.username),node('p',u.role+(u.disabled?' · letiltva':''),'meta'));
      if(profile.role==='owner'&&u.role!=='owner'){const roles=choose(card,'Jogszint',[['tester','Tesztelő'],['admin','Admin']]);roles.value=u.role;button(card,'Jogszint mentése',()=>run({action:'role',user_id:u.id,role:roles.value}));button(card,u.disabled?'Fiók engedélyezése':'Fiók letiltása',()=>run({action:'disable',user_id:u.id,disabled:!u.disabled}),true)}
      if(u.role==='tester'){
        const granted=state.grants.filter(g=>g.user_id===u.id);for(const g of granted){const line=node('div');line.append(node('span',(cfg.products.find(p=>p.id===g.product)?.name||g.product)+' · '+(g.version==='*'?'Minden kiadás':g.version)));button(line,'Visszavonás',()=>run({action:'revoke',user_id:u.id,product:g.product,version:g.version}),true);card.append(line)}
        const grid=node('div',undefined,'form-grid');card.append(grid);const product=choose(grid,'Termék',cfg.products.map(p=>[p.id,p.name])),version=choose(grid,'Kiadás',[['*','Minden kiadás']]);function versions(){version.replaceChildren();for(const [v,t]of [['*','Minden kiadás'],...state.releases.filter(r=>r.product===product.value).map(r=>[r.version,r.version])]){const o=node('option',t);o.value=v;version.append(o)}}product.onchange=versions;versions();button(card,'Tesztjog hozzáadása',()=>run({action:'grant',user_id:u.id,product:product.value,version:version.value}));
      }
    }
    main.append(node('h2','Tesztigények'));for(const r of state.requests){const card=node('section',undefined,'block');main.append(card);card.append(node('h3',r.name),node('p',r.email+' · '+r.product+' · '+r.version+' · '+r.status));info(card,'A tesztjogot a fenti felhasználónál állítsd be; az igény állapota külön jelzés.');button(card,'Teljesítve',()=>run({action:'request_status',id:r.id,status:'approved'}));button(card,'Elutasítva',()=>run({action:'request_status',id:r.id,status:'rejected'}),true)}
  }
  async function download(id,main){try{const file=await api({action:'download',id});location.assign(file.url)}catch(e){info(main,errorText(e))}}
  async function start(){if(!enabled)return;
    // Invite links supply a one-time Auth session. Remove tokens from the URL.
    const hash=new URLSearchParams(location.hash.slice(1));
    if(hash.get('type')==='invite'&&hash.get('access_token')){save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()+Number(hash.get('expires_in')||3600)*1000});history.replaceState(null,'',location.pathname+'#password')}
    if(session)try{await hydrate()}catch{save(null);profile=null;restore()}
    updateHeader();if(window.horpiRender)window.horpiRender();
  }
  async function passwordPage(main){main.append(node('h1','Saját jelszó beállítása'));const form=node('form',undefined,'block auth'),password=field(form,'Új jelszó','password'),confirm=field(form,'Új jelszó még egyszer','password'),status=info(form,'');password.minLength=12;password.autocomplete=confirm.autocomplete='new-password';const submit=node('button','Mentés','button');submit.type='submit';form.append(submit);main.append(form);form.onsubmit=async e=>{e.preventDefault();if(password.value!==confirm.value){status.textContent='A két jelszó nem egyezik.';return}submit.disabled=true;try{await api({action:'password',password:password.value});password.value=confirm.value='';await hydrate();location.hash='#account'}catch(error){status.textContent=errorText(error)}finally{submit.disabled=false}}}
  return {enabled,api,start,loginPage,account,admin,download,passwordPage,errorText,get profile(){return profile}};
})();
