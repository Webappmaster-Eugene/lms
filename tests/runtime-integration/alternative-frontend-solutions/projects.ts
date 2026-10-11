/** Independent student implementations. Never derive code from catalog solutionFiles. */
const css = 'body {font-family:system-ui;margin:1rem} button,input{min-height:44px} main{max-width:800px}'
const react = (source: string, filename = 'App.tsx'): Record<string, string> => ({ [filename]: source, 'styles.css': css })

export const projects: Record<string, Record<string, string>> = {
  'react-bounded-counter': react(`import {useReducer} from 'react'
export default function App(){
 const [attempts,dispatch]=useReducer((value,action)=>action==='reset'?0:Math.max(0,Math.min(5,value+action)),0)
 return <main><h1>Счётчик попыток</h1><output id="count" aria-live="polite">{attempts}</output><section>{[['decrement','Уменьшить',-1],['increment','Увеличить',1],['reset','Сбросить','reset']].map(([id,title,action])=><button key={id} id={id} type="button" disabled={id==='decrement'?attempts===0:id==='increment'&&attempts===5} onClick={()=>dispatch(action)}>{title}</button>)}</section></main>
}`, 'App.jsx'),
  'react-course-filter': react(`import {useReducer} from 'react'
const subjects=['JavaScript','TypeScript','React','Go']
export default function App(){
 const [query,change]=useReducer((_,next)=>next,'')
 const found=subjects.reduce((out,title)=>title.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())?out.concat(title):out,[])
 return <main><h1>Курсы</h1><label htmlFor="search">Название курса</label><input id="search" type="search" value={query} onChange={e=>change(e.target.value)}/><button id="clear" type="button" onClick={()=>change('')}>Очистить</button><ul id="courses">{found.map(title=><li key={title}>{title}</li>)}</ul>{!found.length&&<p id="empty">Курсы не найдены</p>}</main>
}`, 'App.jsx'),
  'react-interview-todo-crud': react(`import {useReducer,useRef} from 'react'
const initial={records:[{id:1,title:'Повторить хуки',done:false},{id:2,title:'Открыть редактор',done:true}],filter:'all',editor:null,draft:''}
function reduce(state,event){
 switch(event.type){
 case 'add':return {...state,records:[...state.records,event.record]}
 case 'filter':return {...state,filter:event.value}
 case 'toggle':return {...state,records:state.records.map(row=>row.id===event.id?{...row,done:!row.done}:row)}
 case 'delete':return {...state,records:state.records.filter(row=>row.id!==event.id)}
 case 'edit':return {...state,editor:event.row.id,draft:event.row.title}
 case 'draft':return {...state,draft:event.value}
 case 'cancel':return {...state,editor:null}
 case 'save':return state.draft.trim()?{...state,editor:null,records:state.records.map(row=>row.id===state.editor?{...row,title:state.draft.trim()}:row)}:state
 default:return state
 }
}
export default function App(){
 const [state,send]=useReducer(reduce,initial), field=useRef(null), sequence=useRef(3)
 const rows=state.records.filter(row=>state.filter==='all'||row.done===(state.filter==='done'))
 function add(){const title=field.current.value.trim();if(!title)return;send({type:'add',record:{id:sequence.current++,title,done:false}});field.current.value=''}
 return <main><h1>План подготовки</h1><label htmlFor="new-title">Новая задача</label><input id="new-title" ref={field}/><button id="add" type="button" onClick={add}>Добавить</button><nav>{['all','active','done'].map((value,index)=><button key={value} id={'filter-'+value} type="button" aria-pressed={state.filter===value} onClick={()=>send({type:'filter',value})}>{['Все','Активные','Готовые'][index]}</button>)}</nav><output id="remaining">{state.records.reduce((sum,row)=>sum+Number(!row.done),0)}</output><ul id="todos">{rows.map(row=><li key={row.id} data-id={row.id}><span className="title">{row.title}</span><input type="checkbox" checked={row.done} onChange={()=>send({type:'toggle',id:row.id})}/><button className="edit" type="button" onClick={()=>send({type:'edit',row})}>Изменить</button><button className="delete" type="button" onClick={()=>send({type:'delete',id:row.id})}>Удалить</button></li>)}</ul>{!rows.length&&<p id="empty">Нет задач</p>}{state.editor!==null&&<fieldset><input id="edit-title" value={state.draft} onChange={e=>send({type:'draft',value:e.target.value})}/><button id="save-edit" type="button" onClick={()=>send({type:'save'})}>Сохранить</button><button id="cancel-edit" type="button" onClick={()=>send({type:'cancel'})}>Отмена</button></fieldset>}</main>
}`),
  'react-interview-accessible-tabs': react(`import {useReducer,useRef} from 'react'
const labels=['Обзор','Практика','Материалы'], content=['Основные сведения','Решаем задачи','Ссылки и записи']
function Tabs({prefix,initialIndex}){
 const [current,select]=useReducer((_,value)=>value,initialIndex), controls=useRef([])
 function keyboard(event,index){const target={ArrowLeft:(index+2)%3,ArrowRight:(index+1)%3,Home:0,End:2}[event.key];if(target===undefined)return;event.preventDefault();select(target);controls.current[target].focus()}
 return <section id={prefix}><div role="tablist">{labels.map((label,index)=><button key={label} ref={node=>{controls.current[index]=node}} id={prefix+'-tab-'+index} role="tab" type="button" aria-selected={index===current} aria-controls={prefix+'-panel-'+index} tabIndex={index===current?0:-1} onClick={()=>select(index)} onKeyDown={event=>keyboard(event,index)}>{label}</button>)}</div>{content.map((text,index)=><article key={text} id={prefix+'-panel-'+index} role="tabpanel" tabIndex={0} aria-labelledby={prefix+'-tab-'+index} hidden={current!==index}>{text}</article>)}</section>
}
export default function App(){return <main><h1>Разделы курса</h1><Tabs prefix="first" initialIndex={0}/><Tabs prefix="second" initialIndex={1}/></main>}`),
  'react-interview-directory-selection': react(`import {useReducer} from 'react'
const records=[['anna','Анна','React'],['boris','Борис','Go'],['vera','Вера','React'],['gleb','Глеб','Python']]
function reducer(state,event){if(event.type==='query')return {...state,query:event.value};if(event.type==='reverse')return {...state,reversed:!state.reversed};return {...state,chosen:{...state.chosen,[event.id]:!state.chosen[event.id]}}}
export default function App(){const [s,send]=useReducer(reducer,{query:'',reversed:false,chosen:{}});const matches=records.filter(row=>row.slice(1).some(value=>value.toLowerCase().includes(s.query.trim().toLowerCase())));const shown=s.reversed?matches.toReversed():matches;return <main><h1>Команда проекта</h1><label htmlFor="query">Имя или навык</label><input id="query" value={s.query} onChange={e=>send({type:'query',value:e.target.value})}/><button id="clear-query" type="button" onClick={()=>send({type:'query',value:''})}>Очистить поиск</button><button id="reverse" type="button" aria-pressed={s.reversed} onClick={()=>send({type:'reverse'})}>Обратный порядок</button><output id="selected-count">{Object.values(s.chosen).filter(Boolean).length}</output><ul id="people">{shown.map(([id,name,skill])=><li key={id} data-id={id}><span className="name">{name}</span><span className="skill">{skill}</span><button type="button" className="select" aria-pressed={!!s.chosen[id]} onClick={()=>send({type:'select',id})}>Выбрать</button></li>)}</ul>{!shown.length&&<p id="empty">Никого не нашли</p>}</main>}`),
  'react-interview-pagination': react(`import {useReducer} from 'react'
const people=['Анна','Борис','Вера','Глеб','Дина','Егор','Жанна'].map((name,index)=>({name,id:index+1,active:index%2===0}))
function reducer(s,event){if(event.type==='move')return {...s,page:s.page+event.delta};if(event.type==='size')return {...s,size:event.value,page:0};return {...s,active:!s.active,page:0}}
export default function App(){const [s,send]=useReducer(reducer,{page:0,size:2,active:false});const all=people.filter(row=>!s.active||row.active),pages=Math.ceil(all.length/s.size),rows=all.filter((_,index)=>Math.floor(index/s.size)===s.page);return <main><h1>Участники</h1><label><input id="active-only" type="checkbox" checked={s.active} onChange={()=>send({type:'filter'})}/>Только активные</label>{[2,4].map(size=><button key={size} id={'size-'+size} type="button" aria-pressed={s.size===size} onClick={()=>send({type:'size',value:size})}>По {size}</button>)}<table><caption>Список участников</caption><thead><tr><th scope="col">ID</th><th scope="col">Имя</th></tr></thead><tbody id="rows">{rows.map(row=><tr key={row.id} data-id={row.id}><td>{row.id}</td><td className="name">{row.name}</td></tr>)}</tbody></table><output id="page-status">{s.page+1}/{pages}</output><button id="previous" type="button" disabled={s.page===0} onClick={()=>send({type:'move',delta:-1})}>Назад</button><button id="next" type="button" disabled={s.page===pages-1} onClick={()=>send({type:'move',delta:1})}>Вперёд</button></main>}`),
  'react-interview-validated-form': react(`import {useReducer,useRef} from 'react'
export default function App(){const form=useRef(null);const [view,show]=useReducer((old,patch)=>({...old,...patch}),{errors:{},success:''});function submit(e){e.preventDefault();const data=new FormData(form.current);const name=String(data.get('name')).trim(),email=String(data.get('email')).trim(),password=String(data.get('password')),parts=email.split('@'),domain=parts[1]||'';const errors={};if(name.length<2)errors.name='Введите имя от 2 символов';if(parts.length!==2||!parts[0]||!domain||!domain.includes('.')||domain.startsWith('.')||domain.endsWith('.')||/\\s/.test(email))errors.email='Введите корректный e-mail';if(password.length<8||![...password].some(char=>/[a-z]/i.test(char))||![...password].some(char=>/[0-9]/.test(char)))errors.password='Не менее 8 символов, буква и цифра';if(!data.get('consent'))errors.consent='Нужно согласие';show({errors,success:Object.keys(errors).length?'':name+': '+email.toLowerCase()})}
return <main><h1>Заявка на участие</h1><form noValidate ref={form} onSubmit={submit} onChange={()=>show({success:''})}>{[['name','Имя','text'],['email','E-mail','email'],['password','Пароль','password']].map(([id,label,type])=><section key={id}><label htmlFor={id}>{label}</label><input id={id} name={id} type={type} aria-invalid={!!view.errors[id]} aria-describedby={id+'-error'}/><p id={id+'-error'} role="alert">{view.errors[id]||''}</p></section>)}<label><input id="consent" name="consent" type="checkbox"/>Согласен с условиями</label><p id="consent-error" role="alert">{view.errors.consent||''}</p><button id="submit" type="submit">Отправить</button><button id="reset" type="button" onClick={()=>{HTMLFormElement.prototype.reset.call(form.current);show({errors:{},success:''})}}>Очистить</button></form>{view.success&&<output id="success">{view.success}</output>}</main>}`),
  'react-interview-modal-draft': react(`import {useReducer,useRef} from 'react'
export default function App(){const dialog=useRef(null),input=useRef(null),opener=useRef(null);const [s,change]=useReducer((old,patch)=>({...old,...patch}),{saved:'Первая заметка',draft:'Первая заметка'});function close(){dialog.current.close();opener.current.focus()}function open(){change({draft:s.saved});input.current.value=s.saved;dialog.current.showModal();input.current.focus()}return <main><h1>Заметка к интервью</h1><p id="saved-note">{s.saved}</p><button id="open-modal" type="button" ref={opener} onClick={open}>Редактировать заметку</button><dialog id="note-dialog" ref={dialog} aria-labelledby="dialog-title" onCancel={e=>{e.preventDefault();close()}}><h2 id="dialog-title">Редактирование заметки</h2><label htmlFor="note">Заметка</label><input id="note" ref={input} defaultValue={s.saved} onChange={e=>change({draft:e.target.value})}/><output id="draft-preview">{s.draft}</output><button id="save-note" type="button" disabled={!s.draft.trim()} onClick={()=>{change({saved:s.draft.trim()});close()}}>Сохранить</button><button id="cancel-note" type="button" onClick={close}>Отмена</button></dialog></main>}`),
  'react-interview-accordion': react(`import {useReducer} from 'react'
const data=[['state','Состояние','Храните изменяющиеся данные в состоянии.'],['props','Пропсы','Передавайте данные от родителя к ребёнку.'],['effects','Эффекты','Синхронизируйте компонент с внешней системой.']]
function reducer(current,id){if(id===null)return new Set();const next=new Set(current);next.has(id)?next.delete(id):next.add(id);return next}
export default function App(){const [opened,toggle]=useReducer(reducer,new Set());return <main><h1>Памятка React</h1>{data.map(([id,title,description])=><article key={id}><h2><button type="button" id={'trigger-'+id} aria-expanded={opened.has(id)} aria-controls={'panel-'+id} onClick={()=>toggle(id)}>{title}</button></h2><section id={'panel-'+id} role="region" hidden={!opened.has(id)} aria-labelledby={'trigger-'+id}>{description}</section></article>)}<button id="close-all" type="button" onClick={()=>toggle(null)}>Закрыть всё</button></main>}`),
  'react-interview-cart-derived-totals': react(`import {useReducer} from 'react'
const catalog=[{id:'book',title:'Книга',price:400,stock:3},{id:'pen',title:'Ручка',price:100,stock:5}]
function reducer(quantities,event){const product=catalog.find(row=>row.id===event.id);return {...quantities,[event.id]:event.remove?0:Math.max(0,Math.min(product.stock,quantities[event.id]+event.delta))}}
export default function App(){const [amounts,send]=useReducer(reducer,{book:0,pen:0});let units=0,subtotal=0;for(const product of catalog){units+=amounts[product.id];subtotal+=amounts[product.id]*product.price}const discount=subtotal<1000?0:subtotal/10;return <main><h1>Корзина для подготовки</h1><ul id="products">{catalog.map(product=><li key={product.id} data-id={product.id}><strong>{product.title}</strong><output className="quantity">{amounts[product.id]}</output><button className="minus" type="button" disabled={!amounts[product.id]} onClick={()=>send({id:product.id,delta:-1})}>−</button><button className="plus" type="button" disabled={amounts[product.id]===product.stock} onClick={()=>send({id:product.id,delta:1})}>+</button><button className="remove" type="button" onClick={()=>send({id:product.id,remove:true})}>Убрать</button></li>)}</ul><section><output id="units">{units}</output><output id="subtotal">{subtotal}</output><output id="discount">{discount}</output><output id="total">{subtotal-discount}</output></section></main>}`),
  'html-responsive-profile': {
    'index.html': '<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="style.css"><title>Команда</title><body><main><h1>Команда</h1><article class="profile" aria-labelledby="profile-name"><header><h2 id="profile-name">Анна Смирнова</h2><p>Frontend-разработчик</p></header><ul class="skills"><li>HTML</li><li>CSS</li><li>React</li></ul><footer><a id="contact" href="mailto:anna@example.com">Написать Анне</a></footer></article></main></body></html>',
    'style.css': '*{box-sizing:border-box}body{margin:0;padding:16px;font-family:sans-serif}.profile{display:flex;gap:1rem;flex-direction:column}.profile>*{min-width:0}a{overflow-wrap:anywhere}@media(min-width:641px){.profile{flex-direction:row}}',
  },
  'next-server-catalog': {
    'app/layout.jsx': "import './globals.css';export default function Layout({children}){return <html lang='ru'><body>{children}</body></html>}",
    'app/globals.css': css,
    'lib/courses.json': JSON.stringify([{ id: 'react', title: 'React' }, { id: 'go', title: 'Go' }, { id: 'css', title: 'CSS' }]),
    'app/page.jsx': `import records from '../lib/courses.json'
import Favorite from './Favorite'
export default async function Page(props){const parameters=await props.searchParams;const needle=typeof parameters.q==='string'?parameters.q.trim().toLocaleLowerCase():'';const rows=[];for(const row of records){if(row.title.toLocaleLowerCase().indexOf(needle)!==-1)rows.push(row)}return <main><h1>Каталог курсов</h1><ul id="courses">{rows.map(({id,title})=><li key={id} data-course={id}><span>{title}</span><Favorite courseId={id}/></li>)}</ul>{rows.length===0&&<p id="empty">Курсы не найдены</p>}</main>}`,
    'app/Favorite.jsx': `'use client'
import {useState} from 'react'
export default function Favorite({courseId}){const [clicks,setClicks]=useState(0);const chosen=clicks%2===1;return <button type="button" data-course={courseId} aria-pressed={chosen} onClick={()=>setClicks(previous=>previous+1)}>{chosen?'В избранном':'В избранное'}</button>}`,
  },
}

/** Fresh identifiers and render strategies demonstrate that acceptance is behavioral. */
export function generatedCounter(identifier: string, variant: number): Record<string, string> {
  const initialization = ['0', 'Number(false)', '[0].reduce((sum, value) => sum + value, 0)', 'Math.max(-1, 0)'][variant % 4]
  const wrapper = variant % 2 === 0 ? 'section' : 'fieldset'
  return react(`import {useState} from 'react'
function ${identifier}({value,update}){return <${wrapper}><button id="increment" type="button" disabled={value>=5} onClick={()=>update(previous=>Math.min(5,previous+1))}>Увеличить</button><button id="reset" type="button" onClick={()=>update(0)}>Сбросить</button><button id="decrement" type="button" disabled={value<=0} onClick={()=>update(previous=>Math.max(0,previous-1))}>Уменьшить</button></${wrapper}>}
export default function App(){const [${identifier}State,${identifier}Update]=useState(()=>${initialization});return <main><h1>Счётчик попыток</h1><output id="count" aria-live="polite">{${identifier}State}</output><${identifier} value={${identifier}State} update={${identifier}Update}/></main>}`, 'App.jsx')
}
