"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronLeft, Gift, Pause, Play, RotateCcw, Trophy, X } from "lucide-react";

type Dino = { id:string; name:string; stars:number; color:string; speed:number; gravity:number; jump:number; spawnMin:number; tagline:string; ground:string };
type Quote = { text:string; author:string };
type GameState = "select" | "running" | "paused" | "reward" | "over";
type Obstacle = { id:number; x:number; size:number; kind:number };

const DINOS:Dino[] = [
  { id:"maiasaura", name:"Maiasaura", stars:1, color:"#168fc2", speed:250, gravity:1300, jump:565, spawnMin:1.45, tagline:"Sanfter Einstieg", ground:"32.5%" },
  { id:"stegosaurus", name:"Stegosaurus", stars:2, color:"#df4d82", speed:278, gravity:1380, jump:575, spawnMin:1.30, tagline:"Ruhig, aber stachelig", ground:"17.5%" },
  { id:"triceratops", name:"Triceratops", stars:3, color:"#9b6a3f", speed:305, gravity:1450, jump:585, spawnMin:1.18, tagline:"Die goldene Mitte", ground:"17.5%" },
  { id:"ankylosaurus", name:"Ankylosaurus", stars:4, color:"#ee702d", speed:332, gravity:1530, jump:590, spawnMin:1.05, tagline:"Schwer gepanzert", ground:"25%" },
  { id:"pachycephalosaurus", name:"Pachycephalosaurus", stars:5, color:"#e54c2d", speed:365, gravity:1610, jump:600, spawnMin:.92, tagline:"Nur für Urgesteine", ground:"26%" },
];
const SPECIAL_PACHY = "Dieser Pachycephalosaurus soll dir Glück und Kraft bringen";
const REWARD_SECONDS = 15;
const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

function parseQuotes(source:string):Quote[] {
  const lines=source.split(/\r?\n/); let author=""; const quotes:Quote[]=[];
  for (const raw of lines) {
    const line=raw.trim();
    if (line.startsWith("## ")) { author=line.slice(3).trim().replace(/:\s*$/,""); continue; }
    if (!line || line.startsWith("#") || !author) continue;
    const curly=line.match(/^„([^”]+)”/);
    const straight=line.match(/^"([^"]+)"/);
    const cleaned=(curly?.[1]??straight?.[1]??line).trim();
    if (cleaned && !cleaned.startsWith("Liebe Lord Maria")) quotes.push({text:cleaned,author});
  }
  return quotes;
}

export default function Home() {
  const [intro,setIntro]=useState(true);
  const [selectedId,setSelectedId]=useState("maiasaura");
  const [gameState,setGameState]=useState<GameState>("select");
  const [quotes,setQuotes]=useState<Quote[]>([]);
  const [reward,setReward]=useState<Quote|null>(null);
  const [collectionOpen,setCollectionOpen]=useState(false);
  const [unlocked,setUnlocked]=useState<Quote[]>(()=>{ try { return typeof window==="undefined"?[]:JSON.parse(localStorage.getItem("maria-dino-quotes")??"[]"); } catch { return []; } });
  const [score,setScore]=useState(0);
  const [best,setBest]=useState(()=>typeof window==="undefined"?0:Number(localStorage.getItem("maria-dino-best")??0));
  const [rewardCountdown,setRewardCountdown]=useState(REWARD_SECONDS);
  const [invincible,setInvincible]=useState(false);
  const [playerY,setPlayerY]=useState(0);
  const [obstacles,setObstacles]=useState<Obstacle[]>([]);
  const selected=useMemo(()=>DINOS.find(d=>d.id===selectedId)??DINOS[0],[selectedId]);
  const gameRef=useRef<HTMLDivElement>(null), raf=useRef<number|null>(null), lastTime=useRef(0), velocity=useRef(0), y=useRef(0);
  const obstaclesRef=useRef<Obstacle[]>([]), nextObstacle=useRef(1.6), runTime=useRef(0), lastReward=useRef(0), idCounter=useRef(0);
  const invincibleUntil=useRef(0);
  const specialsByDino=useMemo(()=>{
    const regular=quotes.filter(q=>q.text!==SPECIAL_PACHY);
    const groups:Record<string,Quote[]>={};
    DINOS.forEach((dino,index)=>{ groups[dino.id]=regular.slice(index*10,index*10+10); });
    groups.pachycephalosaurus=[{text:SPECIAL_PACHY,author:"Lord Maria von Sarris"},...(groups.pachycephalosaurus??[]).slice(0,9)];
    return groups;
  },[quotes]);
  const allSpecialTexts=useMemo(()=>new Set(Object.values(specialsByDino).flat().map(q=>q.text)),[specialsByDino]);
  const progress=quotes.length?Math.min(100,Math.round(unlocked.length/quotes.length*100)):0;

  useEffect(()=>{
    fetch(`${BASE_PATH}/data/quotes.txt`).then(r=>r.text()).then(t=>setQuotes(parseQuotes(t)));
  },[]);

  const persistUnlocked=useCallback((next:Quote[])=>{
    const unique=next.filter((q,i,a)=>a.findIndex(x=>x.text===q.text)===i);
    setUnlocked(unique); localStorage.setItem("maria-dino-quotes",JSON.stringify(unique));
  },[]);

  const unlockQuote=useCallback(()=>{
    const currentSpecialTexts=new Set((specialsByDino[selectedId]??[]).map(q=>q.text));
    const eligible=quotes.filter(q=>!allSpecialTexts.has(q.text)||currentSpecialTexts.has(q.text));
    let pool=eligible.filter(q=>!unlocked.some(u=>u.text===q.text));
    if (!pool.length) pool=eligible;
    const chosen=pool[Math.floor(Math.random()*pool.length)];
    if (!chosen) return;
    setReward(chosen); persistUnlocked([...unlocked,chosen]); setGameState("reward");
  },[allSpecialTexts,persistUnlocked,quotes,selectedId,specialsByDino,unlocked]);

  const endGame=useCallback(()=>{
    const finalScore=Math.floor(runTime.current*10); setScore(finalScore);
    setBest(old=>{ const next=Math.max(old,finalScore); localStorage.setItem("maria-dino-best",String(next)); return next; });
    setGameState("over");
  },[]);

  useEffect(()=>{
    if (gameState!=="running") return;
    lastTime.current=performance.now();
    const tick=(now:number)=>{
      const dt=Math.min((now-lastTime.current)/1000,.033); lastTime.current=now;
      const width=gameRef.current?.clientWidth??900; runTime.current+=dt;
      velocity.current-=selected.gravity*dt; y.current=Math.max(0,y.current+velocity.current*dt);
      if (y.current===0) velocity.current=Math.max(0,velocity.current);
      nextObstacle.current-=dt; const speed=selected.speed+Math.min(runTime.current*1.4,90);
      if (nextObstacle.current<=0) {
        const size=34+Math.random()*24; obstaclesRef.current.push({id:idCounter.current++,x:width+60,size,kind:Math.floor(Math.random()*3)});
        nextObstacle.current=selected.spawnMin+Math.random()*.75;
      }
      obstaclesRef.current=obstaclesRef.current.map(o=>({...o,x:o.x-speed*dt})).filter(o=>o.x>-90);
      const dinoW=Math.min(116,width*.19), dinoX=Math.min(92,width*.12);
      const hit=now>=invincibleUntil.current&&obstaclesRef.current.some(o=>o.x<dinoX+dinoW*.72&&o.x+o.size>dinoX+14&&y.current<o.size*.72);
      setPlayerY(y.current); setObstacles([...obstaclesRef.current]); setScore(Math.floor(runTime.current*10));
      setRewardCountdown(Math.max(0,REWARD_SECONDS-Math.floor(runTime.current-lastReward.current)));
      if (hit) { endGame(); return; }
      if (runTime.current-lastReward.current>=REWARD_SECONDS) { lastReward.current=runTime.current; unlockQuote(); return; }
      raf.current=requestAnimationFrame(tick);
    };
    raf.current=requestAnimationFrame(tick);
    return()=>{ if(raf.current) cancelAnimationFrame(raf.current); };
  },[endGame,gameState,selected,unlockQuote]);

  const startGame=()=>{ y.current=0; velocity.current=0; runTime.current=0; lastReward.current=0; invincibleUntil.current=0; setInvincible(false); obstaclesRef.current=[]; nextObstacle.current=1.5; setObstacles([]); setPlayerY(0); setScore(0); setRewardCountdown(REWARD_SECONDS); setGameState("running"); };
  const resumeAfterReward=()=>{ invincibleUntil.current=performance.now()+2000; setInvincible(true); window.setTimeout(()=>setInvincible(false),2000); setGameState("running"); };
  const jump=useCallback(()=>{ if(gameState==="running"&&y.current<5) velocity.current=selected.jump; },[gameState,selected.jump]);
  useEffect(()=>{ const key=(e:KeyboardEvent)=>{ if(["Space","ArrowUp"].includes(e.code)){e.preventDefault();jump();} if(e.code==="Escape"&&gameState==="running")setGameState("paused");}; window.addEventListener("keydown",key); return()=>window.removeEventListener("keydown",key); },[gameState,jump]);

  return <main className="min-h-[100svh] overflow-hidden bg-[#071f36] text-white">
    <div className="game-shell">
      <header className="topbar">
        <button className="brand" onClick={()=>setGameState("select")}><span>🦕</span> MARIA&apos;S DINO RUN</button>
        <div className="top-actions"><span className="score-chip"><Trophy size={15}/>{String(best).padStart(4,"0")}</span><Button variant="outline" size="sm" onClick={()=>setCollectionOpen(true)}><BookOpen/>{progress}%</Button></div>
      </header>
      {gameState==="select" ? <section className="select-screen">
        <div className="select-copy"><p className="eyebrow">LEVEL WÄHLEN</p><h1>Welches Urgestein bist du heute?</h1><p>Jeder Dino verändert Tempo, Sprung und Hindernisse. Alle 15 Sekunden wartet ein Zitat.</p></div>
        <div className="dino-grid">{DINOS.map(dino=><button key={dino.id} className={`dino-card ${selectedId===dino.id?"selected":""}`} style={{"--dino":dino.color} as React.CSSProperties} onClick={()=>setSelectedId(dino.id)}>
          <div className="stars">{"★".repeat(dino.stars)}<span>{"★".repeat(5-dino.stars)}</span></div>
          <div className="dino-preview"><Image src={`${BASE_PATH}/dinos/${dino.id}.png`} alt={dino.name} fill sizes="220px" priority/></div>
          <strong>{dino.name}</strong><small>{dino.tagline}</small><span className="special-count">{(specialsByDino[dino.id]??[]).filter(q=>unlocked.some(u=>u.text===q.text)).length}/10 Spezialzitate</span>
        </button>)}</div>
        <Button className="start-button" size="lg" onClick={startGame}><Play fill="currentColor"/>Mit {selected.name} starten</Button>
      </section> : <section className="play-wrap">
        <div className="hud"><span>{selected.name}</span><strong>{String(score).padStart(4,"0")}</strong><span>Nächstes Zitat: {rewardCountdown}s</span></div>
        <div ref={gameRef} className="game-stage" style={{"--ground":selected.ground} as CSSProperties} onPointerDown={e=>{if((e.target as HTMLElement).closest("button"))return;jump();}}>
          <Image className="stage-bg" src={`${BASE_PATH}/backgrounds/${selected.id}.png`} alt={`Pixelige Landschaft für ${selected.name}`} fill priority sizes="100vw"/>
          <div className="stage-shade"/><div className={`runner runner-${selected.id} ${invincible?"invincible":""}`} style={{transform:`translateY(${-playerY}px)`}}><Image src={`${BASE_PATH}/dinos/${selected.id}.png`} alt={selected.name} fill sizes="120px" priority/></div>
          {obstacles.map(o=><div key={o.id} className={`meteor meteor-${o.kind}`} style={{left:o.x,width:o.size,height:o.size}}/>)}
          <button className="pause-btn" aria-label="Pausieren" onClick={()=>setGameState("paused")}><Pause/></button><div className="tap-hint">TIPPE ZUM SPRINGEN</div>
        </div>
      </section>}
    </div>
    {intro&&<div className="overlay intro-overlay"><div className="letter pixel-panel"><Gift className="gift-icon"/><p className="eyebrow">FÜR MARIA · LEVEL 20</p><h2>Liebe Lord Maria von Sarris,</h2><p>nicht nur deine Lieblingsdinos, sondern auch du bist jetzt ein echtes Urgestein.</p><p>Daher habe ich dir dieses Spiel gebaut, um deine Reaktionszeit zu trainieren. Denn auch du sollst irgendwann durch einen <strong>Meteoriten</strong> und nicht an Altersschwäche sterben!</p><p className="signature">LG Lord von Poppl</p><Button size="lg" onClick={()=>setIntro(false)}>Geschenk öffnen <Play fill="currentColor"/></Button></div></div>}
    {gameState==="reward"&&reward&&<div className="overlay"><div className="reward-panel pixel-panel"><p className="eyebrow">ZITAT FREIGESCHALTET</p><div className="quote-mark">“</div><blockquote>{reward.text}</blockquote><cite>— {reward.author.replace(/:\s*$/,"")}</cite><p className="shield-note">Danach bist du 2 Sekunden unsterblich.</p><Button size="lg" onClick={resumeAfterReward}>Weiterlaufen <Play fill="currentColor"/></Button></div></div>}
    {gameState==="paused"&&<div className="overlay"><div className="small-panel pixel-panel"><Pause size={34}/><h2>Kurze Verschnaufpause</h2><Button onClick={()=>setGameState("running")}><Play/>Weiter</Button><Button variant="outline" onClick={()=>setGameState("select")}><ChevronLeft/>Dino wechseln</Button></div></div>}
    {gameState==="over"&&<div className="overlay"><div className="small-panel pixel-panel death-panel"><h2 className="death-title">Du bist an Altersschwäche gestorben!</h2><p>{score} Punkte · Bestwert: {best}</p><Button onClick={startGame}><RotateCcw/>Nochmal</Button><Button variant="outline" onClick={()=>setGameState("select")}><ChevronLeft/>Dino wechseln</Button></div></div>}
    {collectionOpen&&<div className="overlay collection-overlay"><div className="collection-panel pixel-panel"><div className="collection-head"><div><p className="eyebrow">MARIAS ARCHIV · {progress}%</p><h2>{unlocked.length} von {quotes.length} Zitaten</h2></div><button aria-label="Schließen" onClick={()=>setCollectionOpen(false)}><X/></button></div><div className="dino-progress">{DINOS.map(d=><span key={d.id}>{d.name} {(specialsByDino[d.id]??[]).filter(q=>unlocked.some(u=>u.text===q.text)).length}/10</span>)}</div>{unlocked.length?<div className="quote-list">{unlocked.map(q=><article key={q.text}><p>„{q.text}“</p><span>{q.author.replace(/:\s*$/,"")}</span></article>)}</div>:<div className="empty-collection">Noch ist das Archiv leer. Zeit für den ersten Lauf!</div>}</div></div>}
  </main>;
}
