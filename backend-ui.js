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
  async function logout(){try{await api({action:'logout'})}finally{save(null);profile=null;restore();location.hash='#home';window.horpiRender?.()}}
  function updateHeader(){
    const link=document.getElementById('developer');if(!link)return;link.href=profile?'#account':'#login';link.removeAttribute('target');link.textContent=profile?profile.username:'Belépés';
    const nav=document.getElementById('main-nav'),controls=document.getElementById('user-controls');
    if(nav){nav.querySelectorAll('[data-staff]').forEach(e=>e.remove());if(isStaff()){
      for(const [title,route]of [['Tesztfiókok kezelése','#testers'],...(profile.role==='owner'?[['Admin kezelés','#admins']]:[])]){const a=node('a',title);a.href=route;a.dataset.staff='true';nav.append(a)}
      if(profile.role==='owner'){const a=node('a','GitHub ↗');a.href='https://github.com/Horpilight996/ShowEngine';a.target='_blank';a.rel='noopener';a.dataset.staff='true';nav.append(a)}
    }}
    if(controls){controls.querySelector('[data-logout]')?.remove();if(profile){const b=node('button','Kilépés','button secondary');b.dataset.logout='true';b.onclick=logout;controls.insertBefore(b,link)}}
  }
  function isStaff(){return ['owner','admin'].includes(profile?.role)}
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
    block.append(node('p',profile.role==='owner'?'Tulajdonosi hozzáférés':'Adminisztrátori hozzáférés','meta'));
  }
  function choose(parent,label,options){const l=node('label',undefined,'field'),select=node('select');l.append(node('span',label),select);for(const [value,title]of options){const o=node('option',title);o.value=value;select.append(o)}parent.append(l);return select}
  function table(parent,headers){const wrap=node('div',undefined,'table-scroll'),t=node('table',undefined,'management-table'),head=node('thead'),row=node('tr'),body=node('tbody');for(const title of headers)row.append(node('th',title));head.append(row);t.append(head,body);wrap.append(t);parent.append(wrap);return body}
  function cell(row,text){const c=node('td',text);row.append(c);return c}
  async function admin(main,mode='testers'){
    if(!isStaff()||(mode==='admins'&&profile.role!=='owner')){info(main,'Ehhez nincs jogosultságod.');return}
    main.append(node('h1',mode==='admins'?'Admin kezelés':'Tesztfiókok kezelése'));const status=info(main,'Betöltés…');let state;
    try{state=await api({action:'admin'});status.textContent=''}catch(e){status.textContent=errorText(e);return}
    const run=async data=>{try{const value=await api(data);window.horpiRender();return value}catch(e){status.textContent=errorText(e);return null}};
    if(mode==='admins'){
      const body=table(main,['Név','Felhasználónév','Jogszint','Állapot','Műveletek']);
      for(const u of state.users){const row=node('tr');body.append(row);cell(row,u.display_name);cell(row,u.username);cell(row,u.role==='owner'?'Tulajdonos':u.role==='admin'?'Admin':'Adminjog nélkül');cell(row,u.disabled?'Letiltva':'Aktív');const actions=cell(row);if(u.role!=='owner'){button(actions,u.disabled?'Engedélyezés':'Letiltás',()=>run({action:'disable',user_id:u.id,disabled:!u.disabled}),true);button(actions,u.role==='admin'?'Adminjog visszavonása':'Adminjog megadása',()=>run({action:'role',user_id:u.id,role:u.role==='admin'?'tester':'admin'}),true)}}
      const invite=node('form',undefined,'block');invite.append(node('h2','Admin meghívása'));const grid=node('div',undefined,'form-grid');invite.append(grid);const name=field(grid,'Név'),email=field(grid,'Email','email'),user=field(grid,'Felhasználónév');info(invite,'Egyszer használható meghívó készül, amellyel az admin beállíthatja a saját jelszavát.');const submit=node('button','Meghívó készítése','button');submit.type='submit';invite.append(submit);main.append(invite);invite.onsubmit=async e=>{e.preventDefault();submit.disabled=true;try{const result=await api({action:'invite',name:name.value,email:email.value,username:user.value});const link=node('input');link.value=result.url;link.readOnly=true;link.setAttribute('aria-label','Admin meghívó');invite.append(link);button(invite,'Meghívó másolása',()=>navigator.clipboard.writeText(result.url),true);info(invite,'Másold ki, és küldd el a meghívót az adminnak.');}catch(error){info(invite,error.message);submit.disabled=false}};return;
    }
    const body=table(main,['Név / email','Hozzáférések','Új hozzáférés','Műveletek']);
    function grantPicker(parent,tester){const p=choose(parent,'Termék',cfg.products.map(p=>[p.id,p.name])),v=choose(parent,'Kiadás',[['*','Minden kiadás']]);const fill=()=>{v.replaceChildren();for(const [value,title]of [['*','Minden kiadás'],...state.releases.filter(r=>r.product===p.value).map(r=>[r.version,'v'+r.version])]){const o=node('option',title);o.value=value;v.append(o)}};p.onchange=fill;fill();button(parent,'Hozzáadás',()=>run({action:'tester_grant',tester_id:tester.id,product:p.value,version:v.value}));}
    for(const tester of state.testers||[]){const row=node('tr');body.append(row);const identity=cell(row);identity.append(node('strong',tester.name),node('div',tester.email,'meta'));const grants=cell(row);for(const g of state.grants.filter(g=>g.tester_id===tester.id)){const line=node('div',undefined,'grant-line');line.append(node('span',(cfg.products.find(p=>p.id===g.product)?.name||g.product)+' · '+(g.version==='*'?'Minden kiadás':'v'+g.version)));button(line,'Visszavonás',()=>run({action:'tester_revoke',tester_id:tester.id,product:g.product,version:g.version}),true);grants.append(line)}if(!grants.childNodes.length)grants.append(node('span','Nincs hozzáférés','meta'));grantPicker(cell(row),tester);const actions=cell(row);button(actions,'Hozzáférési link',async()=>{try{const data=await api({action:'tester_link',tester_id:tester.id});let input=actions.querySelector('input');if(!input){input=node('input');input.readOnly=true;input.setAttribute('aria-label','Személyes hozzáférési link');actions.append(input)}input.value=data.url;info(actions,'Ez a személyes link belépés nélkül működik. Új link készítése érvényteleníti az előzőt.');try{await navigator.clipboard.writeText(data.url)}catch{input.select()}}catch(e){status.textContent=errorText(e)}});button(actions,tester.disabled?'Engedélyezés':'Letiltás',()=>run({action:'tester_disable',tester_id:tester.id,disabled:!tester.disabled}),true)}
    if(!(state.testers||[]).length)info(main,'Még nincs felvett tesztelő.');
    const add=node('form',undefined,'block');add.append(node('h2','Tesztelő hozzáadása'));const grid=node('div',undefined,'form-grid');add.append(grid);const name=field(grid,'Név'),email=field(grid,'Email','email'),submit=node('button','Mentés','button');submit.type='submit';add.append(submit);info(add,'Nem készül belépőfiók. Mentés után több termékhez és kiadáshoz adhatsz hozzáférést.');add.onsubmit=async e=>{e.preventDefault();submit.disabled=true;await run({action:'tester_save',name:name.value,email:email.value});submit.disabled=false};main.append(add);
    main.append(node('h2','Tesztigények'));const requests=table(main,['Igénylő','Termék / kiadás','Állapot','Műveletek']);
    for(const r of state.requests){const row=node('tr');requests.append(row);cell(row,r.name+' · '+r.email);cell(row,(cfg.products.find(p=>p.id===r.product)?.name||r.product)+' · '+r.version);cell(row,({pending:'Függőben',approved:'Jóváhagyva',rejected:'Elutasítva'})[r.status]);const actions=cell(row);button(actions,'Jóváhagyás',async()=>{try{const tester=await api({action:'tester_save',name:r.name,email:r.email});const version=r.version==='current-test'?state.releases.filter(x=>x.product===r.product).sort((a,b)=>compareVersions(a.version,b.version))[0]?.version:r.version;if(!version){status.textContent='Ehhez a termékhez még nincs tesztkiadás.';return}await api({action:'tester_grant',tester_id:tester.id,product:r.product,version});await run({action:'request_status',id:r.id,status:'approved'})}catch(e){status.textContent=errorText(e)}});button(actions,'Elutasítás',()=>run({action:'request_status',id:r.id,status:'rejected'}),true)}
    if(!state.requests.length)info(main,'Még nincs tesztigény.');
  }
  function compareVersions(a,b){const x=a.split('.').map(Number),y=b.split('.').map(Number);for(let i=0;i<Math.max(x.length,y.length);i++)if((x[i]||0)!==(y[i]||0))return (y[i]||0)-(x[i]||0);return 0}
  async function testPage(token,main){main.append(node('h1','Tesztkiadások'));const status=info(main,'Betöltés…');try{const state=await send({action:'test_session',token});status.textContent='Személyes hozzáférés: '+state.name;for(const r of state.releases.sort((a,b)=>compareVersions(a.version,b.version))){const block=node('section',undefined,'block');block.append(node('h2',(cfg.products.find(p=>p.id===r.product)?.name||r.product)+' · v'+r.version));for(const a of r.assets)button(block,'↓ '+a.name,async()=>{try{const file=await send({action:'download',id:a.id,token});location.assign(file.url)}catch(e){status.textContent=errorText(e)}});main.append(block)}if(!state.releases.length)info(main,'Jelenleg nincs engedélyezett kiadás.')}catch(e){status.textContent=errorText(e)}}
  async function download(id,main){try{const file=await api({action:'download',id});location.assign(file.url)}catch(e){info(main,errorText(e))}}
  async function start(){if(!enabled)return;
    if(location.hash.startsWith('#activate/')){
      const token=location.hash.slice('#activate/'.length);history.replaceState(null,'',location.pathname+'#password');
      try{const s=await send({action:'activate',token});save({...s,expires_at:Date.now()+s.expires_in*1000});await hydrate()}catch{const main=document.getElementById('main');main.replaceChildren(node('h1','A meghívó nem érvényes'),node('p','Kérj új meghívót a tulajdonostól.'));return}
    }
    // Invite links supply a one-time Auth session. Remove tokens from the URL.
    const hash=new URLSearchParams(location.hash.slice(1));
    if(hash.get('type')==='invite'&&hash.get('access_token')){save({access_token:hash.get('access_token'),refresh_token:hash.get('refresh_token'),expires_at:Date.now()+Number(hash.get('expires_in')||3600)*1000});history.replaceState(null,'',location.pathname+'#password')}
    if(session)try{await hydrate()}catch{save(null);profile=null;restore()}
    updateHeader();if(window.horpiRender)window.horpiRender();
  }
  async function passwordPage(main){main.append(node('h1','Saját jelszó beállítása'));const form=node('form',undefined,'block auth'),password=field(form,'Új jelszó','password'),confirm=field(form,'Új jelszó még egyszer','password'),status=info(form,'');password.minLength=12;password.autocomplete=confirm.autocomplete='new-password';const submit=node('button','Mentés','button');submit.type='submit';form.append(submit);main.append(form);form.onsubmit=async e=>{e.preventDefault();if(password.value!==confirm.value){status.textContent='A két jelszó nem egyezik.';return}submit.disabled=true;try{await api({action:'password',password:password.value});password.value=confirm.value='';await hydrate();location.hash='#account'}catch(error){status.textContent=errorText(error)}finally{submit.disabled=false}}}
  return {enabled,api,start,loginPage,account,admin,download,passwordPage,testPage,errorText,updateHeader,isStaff,get profile(){return profile}};
})();
