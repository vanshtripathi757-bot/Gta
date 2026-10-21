import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js';

const $ = (id) => document.getElementById(id);
const clamp = (n, min, max) => Math.max(min, Math.min(max, n));
const rand = (min, max) => min + Math.random() * (max - min);

class InputController {
  constructor(renderer, ui) {
    this.keys = new Set();
    this.move = { x: 0, y: 0 };
    this.sprint = false;
    this.lookDelta = 0;
    this.ui = ui;
    this.bindKeyboard();
    this.bindJoystick();
    this.bindLook(renderer.domElement);
    this.bindButtons();
  }
  bindKeyboard() {
    window.addEventListener('keydown', (e) => {
      this.keys.add(e.code);
      if (['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code)) e.preventDefault();
      if (e.code === 'KeyF' && !e.repeat) this.ui.onEnter();
      if (e.code === 'KeyH' && !e.repeat) this.ui.onHorn();
    }, { passive: false });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    const reset = () => { this.keys.clear(); this.move.x = 0; this.move.y = 0; this.sprint = false; };
    window.addEventListener('blur', reset);
    document.addEventListener('visibilitychange', () => { if (document.hidden) reset(); });
  }
  bindJoystick() {
    const zone = $('joystick-zone');
    const knob = $('joystick-knob');
    let pointer = null;
    const radius = 35;
    const move = (e) => {
      const r = zone.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      const d = Math.max(1, Math.hypot(dx, dy));
      const x = d > radius ? dx / d * radius : dx;
      const y = d > radius ? dy / d * radius : dy;
      knob.style.transform = 'translate(calc(-50% + ' + x + 'px),calc(-50% + ' + y + 'px))';
      this.move.x = x / radius;
      this.move.y = -y / radius;
    };
    zone.addEventListener('pointerdown', (e) => {
      e.preventDefault(); pointer = e.pointerId; zone.setPointerCapture(pointer); move(e);
    });
    zone.addEventListener('pointermove', (e) => { if (e.pointerId === pointer) move(e); });
    const end = (e) => {
      if (e.pointerId !== pointer) return;
      pointer = null; this.move.x = 0; this.move.y = 0;
      knob.style.transform = 'translate(-50%,-50%)';
    };
    zone.addEventListener('pointerup', end);
    zone.addEventListener('pointercancel', end);
  }
  bindLook(canvas) {
    let pointer = null, previousX = 0;
    canvas.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      pointer = e.pointerId; previousX = e.clientX;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (pointer !== e.pointerId) return;
      this.lookDelta += (e.clientX - previousX) * 0.006;
      previousX = e.clientX;
    });
    const end = (e) => { if (pointer === e.pointerId) pointer = null; };
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
  }
  bindButtons() {
    $('btn-enter-car').addEventListener('click', () => this.ui.onEnter());
    $('btn-horn').addEventListener('click', () => this.ui.onHorn());
    $('btn-jump').addEventListener('click', () => this.ui.onJump());
    const boost = $('btn-sprint');
    const start = (e) => { e.preventDefault(); this.sprint = true; };
    const stop = () => { this.sprint = false; };
    boost.addEventListener('pointerdown', start);
    ['pointerup','pointercancel','pointerleave'].forEach((event) => boost.addEventListener(event, stop));
    $('btn-day').addEventListener('click', () => this.ui.onLighting('day'));
    $('btn-sunset').addEventListener('click', () => this.ui.onLighting('sunset'));
    $('btn-night').addEventListener('click', () => this.ui.onLighting('night'));
    $('btn-rain').addEventListener('click', () => this.ui.onRain());
    $('btn-audio').addEventListener('click', () => this.ui.onAudio());
    $('btn-quality').addEventListener('click', () => this.ui.onQuality());
  }
  axis(positive, negative) {
    return (positive.some(k => this.keys.has(k)) ? 1 : 0) - (negative.some(k => this.keys.has(k)) ? 1 : 0);
  }
  read() {
    const keyboard = {
      x: this.axis(['KeyD','ArrowRight'], ['KeyA','ArrowLeft']),
      y: this.axis(['KeyW','ArrowUp'], ['KeyS','ArrowDown'])
    };
    return {
      x: this.move.x || keyboard.x,
      y: this.move.y || keyboard.y,
      sprint: this.sprint || this.keys.has('ShiftLeft') || this.keys.has('ShiftRight'),
      jump: this.keys.has('Space')
    };
  }
}

class AudioSystem {
  constructor() { this.context = null; this.enabled = false; this.nodes = null; }
  toggle() {
    try {
      if (!this.context) this.setup();
      if (!this.context) return false;
      if (this.context.state === 'suspended') this.context.resume();
      this.enabled = !this.enabled;
      this.nodes.ocean.gain.setTargetAtTime(this.enabled ? 0.025 : 0, this.context.currentTime, 0.2);
      return this.enabled;
    } catch (_) { return false; }
  }
  setup() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const c = new AC();
    const buffer = c.createBuffer(1, c.sampleRate * 2, c.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const source = c.createBufferSource();
    source.buffer = buffer; source.loop = true;
    const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 420;
    const ocean = c.createGain(); ocean.gain.value = 0;
    source.connect(filter); filter.connect(ocean); ocean.connect(c.destination); source.start();
    const osc = c.createOscillator(); osc.type = 'sawtooth';
    const engine = c.createGain(); engine.gain.value = 0;
    const engineFilter = c.createBiquadFilter(); engineFilter.type = 'lowpass'; engineFilter.frequency.value = 250;
    osc.connect(engineFilter); engineFilter.connect(engine); engine.connect(c.destination); osc.start();
    this.context = c; this.nodes = { ocean, engine, osc };
  }
  update(driving, speed, time) {
    if (!this.enabled || !this.context) return;
    const now = this.context.currentTime;
    this.nodes.ocean.gain.setTargetAtTime(0.02 + Math.sin(time) * 0.004, now, 0.4);
    this.nodes.engine.gain.setTargetAtTime(driving ? 0.025 : 0, now, 0.12);
    this.nodes.osc.frequency.setTargetAtTime(45 + speed * 4, now, 0.12);
  }
  horn() {
    if (!this.context) this.setup();
    if (!this.context) return;
    const c = this.context, now = c.currentTime;
    [392, 494].forEach((frequency) => {
      const osc = c.createOscillator(), gain = c.createGain();
      osc.type = 'square'; osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.035, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.28);
      osc.connect(gain); gain.connect(c.destination); osc.start(now); osc.stop(now + 0.3);
    });
  }
}

class Vehicle {
  constructor(scene, x, z, color, heading = 0, traffic = false) {
    this.x = x; this.z = z; this.heading = heading; this.speed = 0;
    this.traffic = traffic; this.steer = 0;
    this.group = new THREE.Group(); this.group.position.set(x, 0, z); this.group.rotation.y = heading;
    this.build(scene, color);
    scene.add(this.group);
  }
  build(scene, color) {
    const paint = new THREE.MeshStandardMaterial({ color, metalness: 0.72, roughness: 0.23 });
    const glass = new THREE.MeshPhysicalMaterial({ color: 0x142b3b, metalness: 0.35, roughness: 0.12, clearcoat: 1 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x11151a, roughness: 0.9 });
    const rimMat = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, metalness: 0.92, roughness: 0.22 });
    this.chassis = new THREE.Group(); this.chassis.position.y = 0.48; this.group.add(this.chassis);
    const mesh = (geometry, material, x, y, z, parent = this.chassis) => {
      const m = new THREE.Mesh(geometry, material); m.position.set(x, y, z);
      m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
    };
    mesh(new THREE.BoxGeometry(2.05, 0.46, 4.35), paint, 0, 0.18, 0);
    mesh(new THREE.BoxGeometry(1.63, 0.63, 2.0), glass, 0, 0.68, -0.15);
    mesh(new THREE.BoxGeometry(1.85, 0.08, 0.3), paint, 0, 0.63, -1.95);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xfff0bd, emissive: 0xffcf65, emissiveIntensity: 1.6 });
    const tailMat = new THREE.MeshStandardMaterial({ color: 0xff183e, emissive: 0xff001e, emissiveIntensity: 1.2 });
    [-0.67, 0.67].forEach((x) => {
      mesh(new THREE.BoxGeometry(0.42, 0.12, 0.07), lampMat, x, 0.29, 2.2);
      mesh(new THREE.BoxGeometry(0.42, 0.13, 0.07), tailMat, x, 0.29, -2.2);
    });
    this.wheels = [];
    [[-1,0.35,1],[1,0.35,1],[-1,-1.48,0],[1,-1.48,0]].forEach(([x,z,front]) => {
      const pivot = new THREE.Group(); pivot.position.set(x, 0.35, z); this.group.add(pivot);
      const tire = mesh(new THREE.CylinderGeometry(0.35,0.35,0.25,16), tireMat, 0, 0, 0, pivot);
      tire.rotation.z = Math.PI / 2;
      const rim = mesh(new THREE.CylinderGeometry(0.18,0.18,0.26,12), rimMat, 0, 0, 0, pivot);
      rim.rotation.z = Math.PI / 2;
      this.wheels.push({ pivot, tire, front: !!front });
    });
    const light = new THREE.SpotLight(0xd9f4ff, 0, 26, Math.PI / 7, 0.5, 1.4);
    light.position.set(0, 0.45, 2.05); light.target.position.set(0, 0, 13);
    this.group.add(light, light.target); this.headlight = light;
  }
  setLights(enabled) { this.headlight.intensity = enabled ? 2 : 0; }
  update(dt, throttle, steer, boost, wet) {
    const grip = wet ? 0.78 : 1;
    if (Math.abs(throttle) > 0.03) this.speed += throttle * 13 * grip * dt;
    else this.speed *= Math.pow(0.28, dt);
    this.speed = clamp(this.speed, -9, boost ? 29 : 23);
    const targetSteer = steer * 0.52;
    this.steer += (targetSteer - this.steer) * Math.min(1, dt * 7);
    if (Math.abs(this.speed) > 0.1) this.heading += this.steer * this.speed / 13 * dt * 1.7;
    this.x = clamp(this.x + Math.sin(this.heading) * this.speed * dt, -54, 42);
    this.z += Math.cos(this.heading) * this.speed * dt;
    this.group.position.set(this.x, 0, this.z);
    this.group.rotation.y = this.heading;
    this.chassis.rotation.x += (-throttle * 0.045 - this.chassis.rotation.x) * Math.min(1, dt * 6);
    this.chassis.rotation.z += (-this.steer * this.speed / 30 * 0.12 - this.chassis.rotation.z) * Math.min(1, dt * 6);
    this.wheels.forEach((wheel) => {
      wheel.tire.rotation.x += this.speed * dt * 2.5;
      if (wheel.front) wheel.pivot.rotation.y = this.steer;
    });
  }
}

class Character {
  constructor(color = 0x06b6d4) {
    this.group = new THREE.Group(); this.phase = Math.random() * 6; this.grounded = true; this.velocityY = 0;
    const mat = (c, rough = 0.75) => new THREE.MeshStandardMaterial({ color: c, roughness: rough });
    this.hips = new THREE.Group(); this.hips.position.y = 0.9; this.group.add(this.hips);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.44,0.6,0.26), mat(color));
    torso.position.y = 0.32; torso.castShadow = true; this.hips.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18,14,12), mat(0xd6a078));
    head.position.y = 0.75; head.castShadow = true; this.hips.add(head);
    const hair = new THREE.Mesh(new THREE.SphereGeometry(0.185,12,8,0,Math.PI*2,0,Math.PI*0.55), mat(0x171923));
    hair.position.copy(head.position); this.hips.add(hair);
    this.arms = []; this.legs = [];
    [-1,1].forEach((side) => {
      const arm = new THREE.Group(); arm.position.set(side*0.3,0.53,0); torso.add(arm);
      const sleeve = new THREE.Mesh(new THREE.CapsuleGeometry(0.065,0.26,3,7),mat(color));
      sleeve.position.y = -0.17; arm.add(sleeve); this.arms.push(arm);
      const leg = new THREE.Group(); leg.position.set(side*0.12,0,0); this.hips.add(leg);
      const pants = new THREE.Mesh(new THREE.BoxGeometry(0.15,0.48,0.16),mat(0x1e293b));
      pants.position.y = -0.34; leg.add(pants);
      const shoe = new THREE.Mesh(new THREE.BoxGeometry(0.16,0.09,0.24),mat(0xe2e8f0));
      shoe.position.set(0,-0.61,0.04); leg.add(shoe); this.legs.push(leg);
    });
  }
  animate(dt, speed, time) {
    this.phase += dt * (speed > 0.1 ? 9 : 2);
    const swing = speed > 0.1 ? Math.min(0.65, speed * 0.08) : 0.025;
    this.legs[0].rotation.x = Math.sin(this.phase) * swing;
    this.legs[1].rotation.x = -Math.sin(this.phase) * swing;
    this.arms[0].rotation.x = -Math.sin(this.phase) * swing * 0.75;
    this.arms[1].rotation.x = Math.sin(this.phase) * swing * 0.75;
    this.hips.position.y = 0.9 + (speed > 0.1 ? Math.abs(Math.sin(this.phase))*0.035 : Math.sin(time*2)*0.012);
  }
}

class CoastalWorld {
  constructor(game) {
    this.game = game; this.scene = game.scene; this.palms = []; this.facades = []; this.streetLights = [];
    this.buildGround(); this.buildCity(); this.buildBeach(); this.buildVegetation(); this.buildAtmosphere();
  }
  buildGround() {
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(260,430), new THREE.MeshStandardMaterial({ color:0x56686a, roughness:0.98 }));
    ground.rotation.x = -Math.PI/2; ground.position.set(-25,-0.12,0); ground.receiveShadow = true; this.scene.add(ground);
    const roadTexCanvas = document.createElement('canvas'); roadTexCanvas.width=256; roadTexCanvas.height=512;
    const ctx=roadTexCanvas.getContext('2d'); ctx.fillStyle='#303741'; ctx.fillRect(0,0,256,512);
    for(let i=0;i<3600;i++){const v=rand(30,70)|0;ctx.fillStyle='rgb('+v+','+(v+2)+','+(v+4)+')';ctx.fillRect(Math.random()*256,Math.random()*512,1.5,1.5);}
    ctx.fillStyle='#f4ca54';ctx.fillRect(124,0,3,512);ctx.fillRect(132,0,3,512);
    ctx.fillStyle='#e9edf0';for(let y=0;y<512;y+=64){ctx.fillRect(56,y+12,4,28);ctx.fillRect(200,y+12,4,28);}
    const roadTex=new THREE.CanvasTexture(roadTexCanvas); roadTex.colorSpace=THREE.SRGBColorSpace; roadTex.wrapS=roadTex.wrapT=THREE.RepeatWrapping; roadTex.repeat.set(1,10);
    const road=new THREE.Mesh(new THREE.PlaneGeometry(16,380),new THREE.MeshStandardMaterial({map:roadTex,roughness:0.8}));
    road.rotation.x=-Math.PI/2; road.receiveShadow=true; this.scene.add(road);
    const tileCanvas=document.createElement('canvas');tileCanvas.width=128;tileCanvas.height=128;
    const tc=tileCanvas.getContext('2d');tc.fillStyle='#d7cdbb';tc.fillRect(0,0,128,128);tc.strokeStyle='#a99f91';tc.lineWidth=2;
    for(let y=0;y<128;y+=32)for(let x=0;x<128;x+=32)tc.strokeRect(x,y,32,32);
    const tile=new THREE.CanvasTexture(tileCanvas);tile.colorSpace=THREE.SRGBColorSpace;tile.wrapS=tile.wrapT=THREE.RepeatWrapping;tile.repeat.set(5,32);
    for(const [x,w] of [[-13,10],[11.5,7]]) {
      const sidewalk=new THREE.Mesh(new THREE.BoxGeometry(w,0.2,380),new THREE.MeshStandardMaterial({map:tile,roughness:0.8}));
      sidewalk.position.set(x,0.05,0);sidewalk.receiveShadow=true;this.scene.add(sidewalk);
    }
  }
  buildCity() {
    const palette=[['#fff1df','#ef476f',0xf04c79],['#fff0c4','#16a6b6',0x27c9e8],['#f6d9f2','#8b5cf6',0xc084fc],['#e4f4f9','#f97316',0xfb923c]];
    for(let z=-160;z<=160;z+=28) {
      const p=palette[Math.floor(Math.abs(z+160)/28)%palette.length], h=rand(15,27);
      const canvas=document.createElement('canvas');canvas.width=256;canvas.height=512;
      const c=canvas.getContext('2d');c.fillStyle=p[0];c.fillRect(0,0,256,512);c.fillStyle=p[1];c.fillRect(0,0,12,512);c.fillRect(244,0,12,512);
      for(let y=20;y<490;y+=48)for(let x=24;x<238;x+=42){c.fillStyle='#183347';c.fillRect(x,y,27,30);c.strokeStyle=p[1];c.lineWidth=2;c.strokeRect(x,y,27,30);c.fillStyle='#ffffff30';c.fillRect(x+3,y+3,3,23);}
      const tex=new THREE.CanvasTexture(canvas);tex.colorSpace=THREE.SRGBColorSpace;
      const material=new THREE.MeshStandardMaterial({map:tex,roughness:0.68});
      const building=new THREE.Mesh(new THREE.BoxGeometry(15.5,h,20),material);building.position.set(-28,h/2,z);building.castShadow=true;building.receiveShadow=true;this.scene.add(building);
      const roof=new THREE.Mesh(new THREE.BoxGeometry(4,1.1,4),new THREE.MeshStandardMaterial({color:0x64748b,roughness:0.85}));
      roof.position.set(-28,h+0.55,z-4);this.scene.add(roof);
      this.facades.push({ material, canvas, palette:p });
    }
    this.buildShop(-23.5,-14,'FLAMINGO CAFE',0xef476f);
    this.buildShop(-23.5,20,'SUNSTATE SURF',0x06b6d4);
  }
  buildShop(x,z,name,color) {
    const g=new THREE.Group();g.position.set(x,0,z);
    const wall=new THREE.MeshStandardMaterial({color:0xfff4e6,roughness:0.58});
    const accent=new THREE.MeshStandardMaterial({color,roughness:0.32,metalness:0.15});
    const box=(geo,mat,px,py,pz)=>{const m=new THREE.Mesh(geo,mat);m.position.set(px,py,pz);m.castShadow=true;g.add(m);return m;};
    box(new THREE.BoxGeometry(11,0.25,14),new THREE.MeshStandardMaterial({color:0xb2a7a0}),0,0.12,0);
    box(new THREE.BoxGeometry(0.45,5.2,14),wall,-5.2,2.6,0);
    [-6.7,6.7].forEach(sz=>box(new THREE.BoxGeometry(11,5.2,0.45),wall,0,2.6,sz));
    box(new THREE.BoxGeometry(12,0.5,15),new THREE.MeshStandardMaterial({color:color,roughness:0.45}),0.2,5.25,0);
    box(new THREE.BoxGeometry(1.5,1.1,7),accent,-2.5,0.6,0);
    box(new THREE.BoxGeometry(0.8,0.8,13),accent,5.5,4.3,0);
    const glow=new THREE.PointLight(color,0.75,13);glow.position.set(0,3.5,0);g.add(glow);
    const sign=document.createElement('canvas');sign.width=512;sign.height=128;const c=sign.getContext('2d');
    c.fillStyle='#07111e';c.fillRect(0,0,512,128);c.strokeStyle='#ffffffaa';c.lineWidth=5;c.strokeRect(5,5,502,118);
    c.fillStyle='#ffffff';c.font='bold 40px sans-serif';c.textAlign='center';c.textBaseline='middle';c.fillText(name,256,64);
    const tex=new THREE.CanvasTexture(sign);tex.colorSpace=THREE.SRGBColorSpace;
    const signMesh=new THREE.Mesh(new THREE.PlaneGeometry(8,2),new THREE.MeshBasicMaterial({map:tex,side:THREE.DoubleSide}));
    signMesh.position.set(5.25,3.4,0);signMesh.rotation.y=-Math.PI/2;g.add(signMesh);
    this.scene.add(g);
  }
  buildBeach() {
    const sand=new THREE.Mesh(new THREE.PlaneGeometry(44,390),new THREE.MeshStandardMaterial({color:0xe9c98b,roughness:0.92}));
    sand.rotation.x=-Math.PI/2;sand.position.set(34,-0.035,0);sand.receiveShadow=true;this.scene.add(sand);
    const duneMat=new THREE.MeshStandardMaterial({color:0xd9b978,roughness:1});
    for(let i=0;i<14;i++){
      const dune=new THREE.Mesh(new THREE.SphereGeometry(1,10,8),duneMat);
      dune.scale.set(rand(2,6),rand(0.25,0.8),rand(3,9));dune.position.set(rand(20,45),-0.08,rand(-180,180));this.scene.add(dune);
    }
    const oceanGeo=new THREE.PlaneGeometry(150,430,56,100);oceanGeo.rotateX(-Math.PI/2);
    this.oceanBase=new Float32Array(oceanGeo.attributes.position.count);
    for(let i=0;i<this.oceanBase.length;i++)this.oceanBase[i]=oceanGeo.attributes.position.getY(i);
    this.oceanGeo=oceanGeo;
    this.oceanMaterial=new THREE.MeshPhysicalMaterial({color:0x087fa5,roughness:0.2,metalness:0.04,clearcoat:1,clearcoatRoughness:0.16});
    this.ocean=new THREE.Mesh(oceanGeo,this.oceanMaterial);this.ocean.position.set(105,-0.1,0);this.ocean.receiveShadow=true;this.scene.add(this.ocean);
    const foamMat=new THREE.MeshBasicMaterial({color:0xd7fbff,transparent:true,opacity:0.65});
    for(let i=0;i<9;i++){
      const foam=new THREE.Mesh(new THREE.TorusGeometry(rand(1.2,3.2),0.09,5,28),foamMat);
      foam.rotation.x=Math.PI/2;foam.position.set(rand(19,26),0.02,rand(-170,170));foam.userData.phase=rand(0,Math.PI*2);this.scene.add(foam);
      if(!this.foam)this.foam=[];this.foam.push(foam);
    }
    for(let i=0;i<8;i++){
      const umbrella=new THREE.Group();umbrella.position.set(rand(29,42),0,rand(-160,160));
      const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.04,0.04,2.4,8),new THREE.MeshStandardMaterial({color:0xf8fafc}));
      pole.position.y=1.2;umbrella.add(pole);
      const canopy=new THREE.Mesh(new THREE.ConeGeometry(1.45,0.48,10),new THREE.MeshStandardMaterial({color:[0xef476f,0x06b6d4,0xfacc15,0x8b5cf6][i%4],roughness:0.5}));
      canopy.position.y=2.35;canopy.rotation.x=Math.PI;umbrella.add(canopy);this.scene.add(umbrella);
    }
  }
  buildVegetation() {
    const trunkMat=new THREE.MeshStandardMaterial({color:0x76513a,roughness:0.9});
    const leafMat=new THREE.MeshStandardMaterial({color:0x16844b,roughness:0.65,side:THREE.DoubleSide});
    for(let z=-170;z<=170;z+=16){
      const group=new THREE.Group();group.position.set(14.5,0,z);
      const trunk=new THREE.Mesh(new THREE.CylinderGeometry(0.17,0.3,6.2,8),trunkMat);trunk.position.y=3.1;trunk.rotation.z=-0.08;trunk.castShadow=true;group.add(trunk);
      const crown=new THREE.Group();crown.position.set(0.2,6,0);
      for(let i=0;i<7;i++){
        const leaf=new THREE.Mesh(new THREE.ConeGeometry(0.46,3.2,5),leafMat);
        leaf.position.set(Math.cos(i*Math.PI*2/7)*0.72,-0.12,Math.sin(i*Math.PI*2/7)*0.72);
        leaf.rotation.z=-Math.PI/2.4;leaf.rotation.y=i*Math.PI*2/7;leaf.castShadow=true;crown.add(leaf);
      }
      group.add(crown);this.palms.push(crown);this.scene.add(group);
      if(z%32===-10){
        const pole=new THREE.Mesh(new THREE.CylinderGeometry(0.07,0.11,6,8),new THREE.MeshStandardMaterial({color:0x475569,metalness:0.6}));
        pole.position.set(-8.6,3,z);this.scene.add(pole);
        const bulb=new THREE.Mesh(new THREE.SphereGeometry(0.2,10,8),new THREE.MeshBasicMaterial({color:0xffedab}));
        bulb.position.set(-8,6,z);this.scene.add(bulb);
        const light=new THREE.PointLight(0xffc978,0,12,2);light.position.copy(bulb.position);this.scene.add(light);
        this.streetLights.push({bulb,light});
      }
    }
    for(let i=0;i<20;i++){
      const bush=new THREE.Mesh(new THREE.DodecahedronGeometry(rand(0.45,1.15),1),new THREE.MeshStandardMaterial({color:[0x28754b,0x368653,0x1f6b48][i%3],roughness:1}));
      bush.position.set(rand(-19,-15),0.35,rand(-175,175));bush.scale.y=rand(0.7,1.4);this.scene.add(bush);
    }
  }
  buildAtmosphere() {
    const skyGeo=new THREE.SphereGeometry(390,24,16);
    const skyMat=new THREE.ShaderMaterial({
      side:THREE.BackSide,depthWrite:false,
      vertexShader:'varying vec3 vWorldPosition; void main(){ vec4 worldPosition=modelMatrix*vec4(position,1.0); vWorldPosition=worldPosition.xyz; gl_Position=projectionMatrix*viewMatrix*worldPosition; }',
      fragmentShader:'varying vec3 vWorldPosition; void main(){ float h=normalize(vWorldPosition).y*0.5+0.5; vec3 horizon=vec3(0.62,0.84,0.94); vec3 zenith=vec3(0.08,0.38,0.70); gl_FragColor=vec4(mix(horizon,zenith,pow(h,0.72)),1.0); }'
    });
    this.sky=new THREE.Mesh(skyGeo,skyMat);this.scene.add(this.sky);
    const count=420, positions=new Float32Array(count*3);
    for(let i=0;i<count;i++){positions[i*3]=rand(-65,65);positions[i*3+1]=rand(0,27);positions[i*3+2]=rand(-170,170);}
    const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
    this.birds=new THREE.Points(geo,new THREE.PointsMaterial({color:0x253e49,size:0.12,transparent:true,opacity:0.65}));
    this.scene.add(this.birds);
  }
  update(time, dt, wet) {
    const p=this.oceanGeo.attributes.position;
    for(let i=0;i<p.count;i++){
      const x=p.getX(i),z=p.getZ(i);
      p.setY(i,this.oceanBase[i]+Math.sin(x*0.14+time*1.55)*0.18+Math.cos(z*0.095+time*1.25)*0.13+Math.sin((x+z)*0.06-time)*0.07);
    }
    p.needsUpdate=true;
    if(Math.floor(time*2)!==Math.floor((time-dt)*2))this.oceanGeo.computeVertexNormals();
    this.palms.forEach((p,i)=>{p.rotation.z=Math.sin(time*1.3+i*0.7)*(wet?0.12:0.035);p.rotation.x=Math.cos(time+i)*0.02;});
    (this.foam||[]).forEach((f,i)=>{f.position.x=20+Math.sin(time*0.8+i)*1.7;f.scale.setScalar(0.75+Math.abs(Math.sin(time*0.7+i))*0.6);f.material.opacity=0.3+Math.abs(Math.sin(time+i))*0.45;});
    this.sky.position.copy(this.game.camera.position);
  }
  setLighting(preset) {
    const night=preset==='night',sunset=preset==='sunset';
    this.facades.forEach((f)=> {
      const c=f.canvas.getContext('2d');
      c.fillStyle=f.palette[0];c.fillRect(0,0,256,512);c.fillStyle=f.palette[1];c.fillRect(0,0,12,512);c.fillRect(244,0,12,512);
      for(let y=20;y<490;y+=48)for(let x=24;x<238;x+=42){
        c.fillStyle=night&&Math.sin(x*2+y)>-0.1?'#ffe9a3':'#183347';c.fillRect(x,y,27,30);c.strokeStyle=f.palette[1];c.lineWidth=2;c.strokeRect(x,y,27,30);
      }
      f.material.map.needsUpdate=true;
    });
    this.streetLights.forEach(({bulb,light})=>{bulb.visible=night||sunset;light.intensity=night?1.3:(sunset?0.3:0);});
  }
}

class GameUI {
  constructor(game) { this.game=game; this.audio=new AudioSystem(); this.bindCallbacks(); }
  bindCallbacks() {
    this.onEnter=()=>this.game.toggleVehicle();
    this.onHorn=()=>{this.audio.horn();this.game.npcs.forEach(n=>{if(n.group.position.distanceTo(this.game.focus())<15)n.startle=1.6;});};
    this.onJump=()=>this.game.jump();
    this.onLighting=(p)=>this.game.setLighting(p);
    this.onRain=()=>this.game.toggleRain();
    this.onAudio=()=>{$('btn-audio').textContent=this.audio.toggle()?'SOUND ON':'SOUND OFF';};
    this.onQuality=()=>this.game.toggleQuality();
  }
  update(focus,speed,driving,fps) {
    $('speed-value').textContent=String(Math.round(speed*2.237)).padStart(2,'0');
    $('fps-badge').textContent='FPS '+Math.round(fps);
    $('mode-badge').textContent=driving?'DRIVING':'ON FOOT';
    $('location-label').textContent=focus.x>17?'Golden Beach':(focus.x<-17?'Coastline District':'Ocean Drive');
    $('status-text').textContent=driving?'CRUISING':'EXPLORE FREELY';
    $('prompt-banner').style.opacity=!driving&&this.game.nearestVehicle(6)?'1':'0';
    const canvas=$('radar-canvas'),ctx=canvas.getContext('2d');
    ctx.fillStyle='#07111e';ctx.fillRect(0,0,128,128);
    ctx.fillStyle='#58616d';ctx.fillRect(38,0,39,128);
    ctx.fillStyle='#d8c69c';ctx.fillRect(78,0,18,128);
    ctx.fillStyle='#087fa5';ctx.fillRect(97,0,31,128);
    ctx.strokeStyle='#ffffff25';ctx.lineWidth=1;
    for(let y=0;y<128;y+=16){ctx.beginPath();ctx.moveTo(0,y);ctx.lineTo(128,y);ctx.stroke();}
    this.game.vehicles.forEach(car=>{
      const x=64+(car.x-focus.x)*1.05,y=64-(car.z-focus.z)*0.55;
      if(x>-3&&x<131&&y>-3&&y<131){ctx.fillStyle=car===this.game.activeCar?'#67e8f9':'#fb7185';ctx.fillRect(x-2,y-2,4,4);}
    });
    ctx.save();ctx.translate(64,64);ctx.rotate(-((driving&&this.game.activeCar)?this.game.activeCar.heading:this.game.player.group.rotation.y));
    ctx.fillStyle='#4ade80';ctx.beginPath();ctx.moveTo(0,-7);ctx.lineTo(5,5);ctx.lineTo(-5,5);ctx.closePath();ctx.fill();ctx.restore();
  }
}

class SunstateGame {
  constructor() {
    this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x73d6fa);this.scene.fog=new THREE.FogExp2(0x9bdff2,0.0026);
    this.camera=new THREE.PerspectiveCamera(62,innerWidth/innerHeight,0.1,700);
    this.camera.position.set(-16,5,-10);
    this.renderer=new THREE.WebGLRenderer({antialias:devicePixelRatio<2,powerPreference:'high-performance',stencil:false});
    this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.45));this.renderer.setSize(innerWidth,innerHeight);
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.08;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;
    $('canvas-container').appendChild(this.renderer.domElement);
    this.hemi=new THREE.HemisphereLight(0xd9f5ff,0x8c8c69,1.05);this.scene.add(this.hemi);
    this.sun=new THREE.DirectionalLight(0xfff0cf,2.25);this.sun.position.set(-35,70,28);this.sun.castShadow=true;
    this.sun.shadow.mapSize.set(1024,1024);this.sun.shadow.camera.near=1;this.sun.shadow.camera.far=180;
    Object.assign(this.sun.shadow.camera,{left:-60,right:60,top:60,bottom:-60});this.sun.shadow.bias=-0.00015;this.sun.shadow.normalBias=0.025;this.scene.add(this.sun);
    this.world=new CoastalWorld(this);this.vehicles=[];this.npcs=[];this.time=0;this.rain=false;this.quality=true;this.preset='day';this.driving=false;this.activeCar=null;this.orbit=0;this.lastFps=60;
    this.player=new Character();this.player.group.position.set(-10.5,0.22,0);this.scene.add(this.player.group);
    [[-4.2,4.5,0xf43f5e,0,false],[-4.2,-22,0xfacc15,0,false],[3.6,-55,0x22d3ee,0,true],[3.6,45,0xa855f7,0,true],[-3.6,75,0x10b981,Math.PI,true],[-3.6,-85,0xf97316,Math.PI,true]].forEach(s=>this.vehicles.push(new Vehicle(this.scene,s[0],s[1],s[2],s[3],s[4])));
    const colors=[0xef476f,0xf59e0b,0x10b981,0x8b5cf6,0xec4899,0x3b82f6];
    for(let i=0;i<14;i++){const n=new Character(colors[i%colors.length]);n.group.position.set(i%2===0?-12.5+rand(-1,1):11+rand(-1,1),0.22,-110+i*16);n.direction=i%2===0?1:-1;n.startle=0;this.npcs.push(n);this.scene.add(n.group);}
    this.ui=new GameUI(this);this.input=new InputController(this.renderer,this.ui);this.bindResize();this.setLighting('day');
    this.clock=new THREE.Clock();this.frames=0;this.fpsElapsed=0;this.animate();
  }
  bindResize() {
    const resize=()=>{this.camera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality?1.45:0.9));};
    window.addEventListener('resize',resize);
  }
  focus(){return this.driving&&this.activeCar?this.activeCar.group.position:this.player.group.position;}
  nearestVehicle(maxDistance=Infinity) {
    let best=null,dist=maxDistance;
    for(const car of this.vehicles){const d=Math.hypot(car.x-this.player.group.position.x,car.z-this.player.group.position.z);if(d<dist){dist=d;best=car;}}
    return best;
  }
  toggleVehicle() {
    if(this.driving&&this.activeCar){
      const car=this.activeCar;this.driving=false;this.activeCar=null;this.player.group.visible=true;
      const offset=new THREE.Vector3(-2,0.22,0).applyAxisAngle(new THREE.Vector3(0,1,0),car.heading);
      this.player.group.position.set(car.x+offset.x,0.22,car.z+offset.z);return;
    }
    const car=this.nearestVehicle(5.5);
    if(!car){$('prompt-banner').textContent='Move closer to a car';$('prompt-banner').style.opacity='1';setTimeout(()=>{$('prompt-banner').style.opacity='0';},1200);return;}
    this.activeCar=car;this.driving=true;car.traffic=false;this.player.group.visible=false;
  }
  jump(){if(!this.driving&&this.player.grounded!==false){this.player.velocityY=6.5;this.player.grounded=false;}}
  setLighting(preset) {
    this.preset=preset;
    const cfg={
      day:{bg:0x73d6fa,fog:0x9bdff2,hemi:0xd9f5ff,ground:0x8c8c69,hemiI:1.05,sun:0xfff0cf,sunI:2.25,pos:[-35,70,28],exposure:1.08},
      sunset:{bg:0xf58a70,fog:0xf7a18c,hemi:0xffb2a1,ground:0x3b285d,hemiI:0.72,sun:0xffd5b0,sunI:1.4,pos:[-65,24,20],exposure:1.15},
      night:{bg:0x07111e,fog:0x0c1c32,hemi:0x48a9dc,ground:0x07111e,hemiI:0.42,sun:0x8495ff,sunI:0.55,pos:[20,60,-30],exposure:1.15}
    }[preset];
    this.scene.background.setHex(cfg.bg);this.scene.fog.color.setHex(cfg.fog);this.scene.fog.density=preset==='night'?0.004:0.0026;
    this.hemi.color.setHex(cfg.hemi);this.hemi.groundColor.setHex(cfg.ground);this.hemi.intensity=cfg.hemiI;
    this.sun.color.setHex(cfg.sun);this.sun.intensity=cfg.sunI;this.sun.position.set(...cfg.pos);this.renderer.toneMappingExposure=cfg.exposure;
    ['day','sunset','night'].forEach(p=>$('btn-'+p).classList.toggle('active',p===preset));
    this.vehicles.forEach(c=>c.setLights(preset!=='day'));this.world.setLighting(preset);
  }
  toggleRain() {
    this.rain=!this.rain;$('btn-rain').textContent=this.rain?'RAIN ON':'RAIN OFF';
    if(!this.rainSystem){
      const count=700,positions=new Float32Array(count*3);
      for(let i=0;i<count;i++){positions[i*3]=rand(-35,35);positions[i*3+1]=rand(0,28);positions[i*3+2]=rand(-35,35);}
      const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.BufferAttribute(positions,3));
      this.rainSystem=new THREE.Points(geo,new THREE.PointsMaterial({color:0xc5eaff,size:0.11,transparent:true,opacity:0.6}));this.scene.add(this.rainSystem);
    }
    this.rainSystem.visible=this.rain;
  }
  toggleQuality() {
    this.quality=!this.quality;this.renderer.setPixelRatio(Math.min(devicePixelRatio||1,this.quality?1.45:0.9));
    this.renderer.shadowMap.enabled=this.quality;this.sun.shadow.mapSize.set(this.quality?1024:512,this.quality?1024:512);this.sun.shadow.needsUpdate=true;
    $('btn-quality').textContent=this.quality?'QUALITY: HIGH':'QUALITY: LOW';
  }
  animate() {
    requestAnimationFrame(()=>this.animate());
    const dt=Math.min(0.035,this.clock.getDelta());this.time+=dt;
    this.frames++;this.fpsElapsed+=dt;if(this.fpsElapsed>=0.65){this.lastFps=this.frames/this.fpsElapsed;this.frames=0;this.fpsElapsed=0;}
    const input=this.input.read();this.orbit+=this.input.lookDelta;this.input.lookDelta=0;
    let focus=this.focus(),heading=this.driving&&this.activeCar?this.activeCar.heading:this.player.group.rotation.y,speed=0;
    if(this.driving&&this.activeCar){
      this.activeCar.update(dt,input.y,-input.x,input.sprint,this.rain);focus=this.activeCar.group.position;heading=this.activeCar.heading;speed=Math.abs(this.activeCar.speed);
      this.player.group.position.set(this.activeCar.x,0.22,this.activeCar.z);
    } else {
      const magnitude=Math.min(1,Math.hypot(input.x,input.y));speed=magnitude*(input.sprint?7.7:4.2);
      if(magnitude>0.08){
        const angle=Math.atan2(-input.x,input.y)+this.orbit;
        this.player.group.rotation.y=angle;
        this.player.group.position.x+=Math.sin(angle)*speed*dt;
        this.player.group.position.z+=Math.cos(angle)*speed*dt;
      }
      if(input.jump&&this.player.grounded!==false)this.jump();
      this.player.velocityY=(this.player.velocityY||0)-17*dt;
      this.player.group.position.y+=this.player.velocityY*dt;
      if(this.player.group.position.y<=0.22){this.player.group.position.y=0.22;this.player.velocityY=0;this.player.grounded=true;}
      this.player.group.position.x=clamp(this.player.group.position.x,-28,42);this.player.group.position.z=clamp(this.player.group.position.z,-175,175);
      this.player.animate(dt,speed,this.time);focus=this.player.group.position;
    }
    this.vehicles.forEach(car=>{
      if(!car.traffic||car===this.activeCar)return;
      const dx=focus.x-car.x,dz=focus.z-car.z;
      const blocked=Math.hypot(dx,dz)<10&&(dx*Math.sin(car.heading)+dz*Math.cos(car.heading)>0);
      car.update(dt,blocked?0:0.38,0,false,this.rain);
      if(car.z>180)car.z=-180;if(car.z< -180)car.z=180;
    });
    this.npcs.forEach(n=>{
      const d=n.group.position.distanceTo(focus),hurry=n.startle>0||(this.driving&&d<7&&speed>4),v=hurry?3.2:1.15;
      n.group.position.z+=n.direction*v*dt;n.group.rotation.y=n.direction>0?0:Math.PI;
      if(n.group.position.z>145)n.direction=-1;if(n.group.position.z< -145)n.direction=1;
      if(n.startle>0)n.startle-=dt;n.animate(dt,v,this.time);
    });
    this.world.update(this.time,dt,this.rain);
    if(this.rain&&this.rainSystem){
      const a=this.rainSystem.geometry.attributes.position;
      for(let i=0;i<a.count;i++){let y=a.getY(i)-22*dt;if(y<0)y=28;a.setY(i,y);}
      a.needsUpdate=true;this.rainSystem.position.set(focus.x,0,focus.z);
    }
    const distance=this.driving?9.2:6.4,height=this.driving?3.6:2.8,angle=(this.driving?heading:0)+this.orbit;
    const target=new THREE.Vector3(focus.x-Math.sin(angle)*distance,focus.y+height,focus.z-Math.cos(angle)*distance);
    this.camera.position.lerp(target,1-Math.exp(-dt*5.5));this.camera.lookAt(focus.x,focus.y+1.05,focus.z);
    this.ui.update(focus,speed,this.driving,this.lastFps);
    this.ui.audio.update(this.driving,speed,this.time);
    this.renderer.render(this.scene,this.camera);
  }
}

window.addEventListener('load',()=>{
  try { window.sunstateGame = new SunstateGame(); }
  catch(error) {
    console.error(error);
    const box=document.getElementById('canvas-container');
    box.innerHTML='<div class="fatal">The 3D world could not start. Check your connection and reload.</div>';
  }
});
