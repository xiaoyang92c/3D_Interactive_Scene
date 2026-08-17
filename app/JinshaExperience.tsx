"use client";

import { Canvas, useFrame } from "@react-three/fiber";
import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import * as THREE from "three";

type Quality = "high" | "eco";
type ArtifactKind = "tree" | "solar" | "mask" | "jade" | "bronze" | "altar" | "fragments" | "gate";

type Artifact = {
  id: string;
  name: string;
  caption: string;
  assetKey: string;
  distance: number;
  stage: number;
  kind: ArtifactKind;
  side: number;
};

type Controls = { left: boolean; right: boolean; up: boolean; down: boolean; boost: boolean };
type Telemetry = { progress: number; stage: number; artifactId: string | null; finished: boolean };

const ROUTE_LENGTH = 240;
const STAGES = [
  { index: "壹", name: "自然之源", range: [0, 76], color: "#78a596" },
  { index: "贰", name: "文明之光", range: [76, 164], color: "#d8a94a" },
  { index: "叁", name: "记忆重生", range: [164, 240], color: "#9d79cf" },
] as const;

const ATMOSPHERE_COLORS = ["#061313", "#160d06", "#0c0717"] as const;
const FOG_COLORS = ["#0a1d1c", "#241408", "#170d25"] as const;

const ARTIFACTS: Artifact[] = [
  { id: "ancient-tree", name: "中央古树", caption: "生命从湿润的土壤生长，古蜀先民在自然中辨认时间与秩序。", assetKey: "Stage01_AncientTree", distance: 30, stage: 0, kind: "tree", side: -4.2 },
  { id: "solar-clue", name: "太阳神鸟线索", caption: "四鸟绕日的结构化作第一束金光，引导曦羽进入文明深处。", assetKey: "Stage01_SolarFragment", distance: 58, stage: 0, kind: "solar", side: 3.8 },
  { id: "golden-mask", name: "黄金面具", caption: "薄金被塑成人的面孔，凝视穿越祭祀空间与今日的我们。", assetKey: "Stage02_GoldenMask", distance: 92, stage: 1, kind: "mask", side: -4.3 },
  { id: "jade-bi", name: "玉璧", caption: "温润的环形结构被放大为航道，身体从古蜀礼仪的尺度中穿过。", assetKey: "Stage02_JadeBi", distance: 116, stage: 1, kind: "jade", side: 4.1 },
  { id: "bronze-pattern", name: "青铜纹样", caption: "青铜表面的节律被转译为空间界面，旧有纹理成为新的坐标。", assetKey: "Stage02_BronzePattern", distance: 140, stage: 1, kind: "bronze", side: -4.5 },
  { id: "altar", name: "古蜀祭祀空间", caption: "层叠的平台不是神庙复原，而是对金沙祭祀关系的抽象表达。", assetKey: "Stage02_Altar", distance: 160, stage: 1, kind: "altar", side: 3.9 },
  { id: "memory-fragments", name: "文明记忆碎片", caption: "面具、玉璧与青铜纹样被拆解成光片，在飞行中重新建立联系。", assetKey: "Stage03_MemoryFragments", distance: 188, stage: 2, kind: "fragments", side: -3.4 },
  { id: "solar-rebirth", name: "太阳神鸟重组", caption: "离散的四鸟轨迹逐渐闭合，文明符号从记忆中再次显现。", assetKey: "Stage03_SolarBirdFragment", distance: 214, stage: 2, kind: "solar", side: 3.2 },
  { id: "civilization-gate", name: "文明之门", caption: "旅程在完整的太阳神鸟结构前收束，也从这里朝向新的讲述。", assetKey: "Stage03_CivilizationGate", distance: 234, stage: 2, kind: "gate", side: 0 },
];

function useAmbientSound() {
  const graph = useRef<{ context: AudioContext; gain: GainNode; oscillators: OscillatorNode[] } | null>(null);
  const [muted, setMuted] = useState(false);

  const start = useCallback(() => {
    if (graph.current || typeof window === "undefined") return;
    const AudioContextClass = window.AudioContext;
    if (!AudioContextClass) return;
    const context = new AudioContextClass();
    const gain = context.createGain();
    const filter = context.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 210;
    gain.gain.value = 0.026;
    filter.connect(gain).connect(context.destination);
    const oscillators = [55, 82.5].map((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "sine" : "triangle";
      oscillator.frequency.value = frequency;
      const voiceGain = context.createGain();
      voiceGain.gain.value = index === 0 ? 0.7 : 0.16;
      oscillator.connect(voiceGain).connect(filter);
      oscillator.start();
      return oscillator;
    });
    graph.current = { context, gain, oscillators };
  }, []);

  const toggle = useCallback(() => {
    setMuted((previous) => {
      const next = !previous;
      const audio = graph.current;
      if (audio) audio.gain.gain.setTargetAtTime(next ? 0 : 0.026, audio.context.currentTime, 0.08);
      return next;
    });
  }, []);

  useEffect(() => () => {
    const audio = graph.current;
    if (audio) {
      audio.oscillators.forEach((oscillator) => oscillator.stop());
      void audio.context.close();
    }
  }, []);

  return { muted, start, toggle };
}

function LightDust({ quality }: { quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const count = quality === "high" ? 760 : 260;
    const data = new Float32Array(count * 3);
    for (let i = 0; i < data.length; i += 3) {
      data[i] = (Math.random() - 0.5) * 27;
      data[i + 1] = (Math.random() - 0.35) * 16;
      data[i + 2] = -Math.random() * (ROUTE_LENGTH + 24);
    }
    return data;
  }, [quality]);

  useFrame(({ clock }) => {
    if (points.current) points.current.rotation.z = clock.elapsedTime * 0.004;
  });

  return (
    <points ref={points}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[positions, 3]} /></bufferGeometry>
      <pointsMaterial color="#f0be58" size={quality === "high" ? 0.075 : 0.055} transparent opacity={0.68} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function RouteFrames() {
  const frames = useMemo(() => Array.from({ length: 42 }, (_, index) => index), []);
  return (
    <group>
      {frames.map((index) => {
        const distance = index * 6 + 3;
        const stage = distance < 76 ? 0 : distance < 164 ? 1 : 2;
        const color = STAGES[stage].color;
        const rotation = Math.sin(index * 0.74) * (stage === 2 ? 0.22 : 0.07);
        const width = stage === 0 ? 20 : stage === 1 ? 23 : 26;
        const height = stage === 0 ? 12 : 14;
        return (
          <group key={index} position={[0, 0.8, -distance]} rotation={[0, 0, rotation]}>
            <mesh position={[-width / 2, 0, 0]}><boxGeometry args={[0.12, height, 0.18]} /><meshBasicMaterial color={color} transparent opacity={stage === 1 ? 0.27 : 0.18} /></mesh>
            <mesh position={[width / 2, 0, 0]}><boxGeometry args={[0.12, height, 0.18]} /><meshBasicMaterial color={color} transparent opacity={stage === 1 ? 0.27 : 0.18} /></mesh>
            <mesh position={[0, height / 2, 0]}><boxGeometry args={[width, 0.12, 0.18]} /><meshBasicMaterial color={color} transparent opacity={stage === 1 ? 0.27 : 0.18} /></mesh>
          </group>
        );
      })}
      {[82, 106, 130, 154].map((distance, index) => (
        <mesh key={distance} position={[index % 2 ? 2.2 : -2.2, -5.3 + (index % 2), -distance]} rotation={[0, index * 0.18, 0]}>
          <boxGeometry args={[17, 1.2, 17]} /><meshStandardMaterial color="#19302f" roughness={0.92} metalness={0.08} />
        </mesh>
      ))}
      {[176, 192, 208, 224].map((distance, index) => (
        <mesh key={distance} position={[0, -5.5, -distance]} rotation={[0, index * 0.32, 0]}>
          <boxGeometry args={[19 + index * 2, 0.5, 9]} /><meshStandardMaterial color="#241e35" emissive="#4b2c6c" emissiveIntensity={0.18} roughness={0.8} />
        </mesh>
      ))}
    </group>
  );
}

function LivingBackdrop({ quality }: { quality: Quality }) {
  const group = useRef<THREE.Group>(null);
  const layers = useMemo(() => Array.from({ length: quality === "high" ? 18 : 10 }, (_, index) => ({
    distance: 14 + index * (ROUTE_LENGTH / (quality === "high" ? 18 : 10)),
    x: Math.sin(index * 2.17) * (8.5 + index % 3),
    y: Math.cos(index * 1.31) * 4.8 + 1,
    scale: 4.5 + (index % 5) * 1.4,
    rotation: index * 0.37,
  })), [quality]);

  useFrame(({ clock }) => {
    if (!group.current) return;
    group.current.rotation.z = Math.sin(clock.elapsedTime * 0.08) * 0.025;
    group.current.position.y = Math.sin(clock.elapsedTime * 0.16) * 0.34;
  });

  return <group ref={group}>
    {layers.map((layer, index) => {
      const stage = layer.distance < 76 ? 0 : layer.distance < 164 ? 1 : 2;
      const color = STAGES[stage].color;
      return <group key={index} position={[layer.x, layer.y, -layer.distance]} rotation={[0.18, layer.rotation, layer.rotation * 0.32]}>
        <mesh>
          <torusGeometry args={[layer.scale, 0.035 + (index % 3) * 0.018, 5, 64, Math.PI * (1.12 + (index % 4) * 0.16)]} />
          <meshBasicMaterial color={color} transparent opacity={0.1 + (index % 3) * 0.035} depthWrite={false} blending={THREE.AdditiveBlending} />
        </mesh>
        {index % 3 === 0 && <mesh position={[0, 0, -0.4]} rotation={[0, 0, Math.PI / 4]}>
          <planeGeometry args={[layer.scale * 2.1, layer.scale * 0.7]} />
          <meshBasicMaterial color={color} transparent opacity={0.022} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>}
      </group>;
    })}
  </group>;
}

function SpeedLines({ quality, controls }: { quality: Quality; controls: RefObject<Controls> }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const intensity = useRef(0);
  const count = quality === "high" ? 72 : 34;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lines = useMemo(() => Array.from({ length: count }, (_, index) => {
    const angle = index * 2.39996;
    const radius = 2.5 + ((index * 37) % 100) / 100 * 12;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.62 + 1.2,
      z: -30 + ((index * 53) % 100) / 100 * 37,
      speed: 0.75 + (index % 7) * 0.08,
      length: 2.4 + (index % 6) * 0.72,
    };
  }), [count]);

  useFrame((_, delta) => {
    const target = controls.current.boost ? 1 : 0;
    intensity.current = THREE.MathUtils.damp(intensity.current, target, target ? 7.5 : 4.2, delta);
    if (!mesh.current || !material.current) return;
    mesh.current.visible = intensity.current > 0.012;
    material.current.opacity = intensity.current * 0.64;
    lines.forEach((line, index) => {
      line.z += delta * (12 + intensity.current * 54) * line.speed;
      if (line.z > 8) line.z = -30 - (index % 9);
      dummy.position.set(line.x, line.y, line.z);
      dummy.rotation.set(-line.y * 0.008, line.x * 0.008, 0);
      dummy.scale.set(1 + intensity.current * 0.8, 1 + intensity.current * 0.8, line.length * (0.5 + intensity.current * 1.9));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
    <boxGeometry args={[0.018, 0.018, 1]} />
    <meshBasicMaterial ref={material} color="#ffd36e" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
  </instancedMesh>;
}

function ArtifactVisual({ artifact, active }: { artifact: Artifact; active: boolean }) {
  const group = useRef<THREE.Group>(null);
  const color = artifact.stage === 0 ? "#78a596" : artifact.stage === 1 ? "#d8a94a" : "#9d79cf";
  useFrame(({ clock }, delta) => {
    if (!group.current) return;
    group.current.rotation.y += delta * (active ? 0.36 : 0.08);
    group.current.position.y = 0.5 + Math.sin(clock.elapsedTime * 0.7 + artifact.distance) * 0.22;
  });
  const material = <meshStandardMaterial color={color} emissive={color} emissiveIntensity={active ? 2.8 : 0.42} metalness={0.28} roughness={0.52} />;

  return (
    <group position={[artifact.side, 0.5, -artifact.distance]}>
      <group ref={group}>
        {artifact.kind === "tree" && <>
          <mesh position={[-2.5, 0, 0]} rotation={[0, 0, -0.12]}><boxGeometry args={[1.2, 8, 1.2]} />{material}</mesh>
          <mesh position={[2.5, 0, 0]} rotation={[0, 0, 0.14]}><boxGeometry args={[1.1, 7.2, 1.1]} />{material}</mesh>
          <mesh position={[0, 4, 0]}><boxGeometry args={[8, 1.1, 4]} />{material}</mesh>
        </>}
        {artifact.kind === "solar" && [0, 1, 2, 3].map((index) => <mesh key={index} rotation={[0, 0, index * Math.PI / 2]}><torusGeometry args={[2.2, 0.19, 8, 42, 0.95]} />{material}</mesh>)}
        {artifact.kind === "mask" && <>
          <mesh position={[0, 2, 0]}><boxGeometry args={[7.5, 1.2, 0.8]} />{material}</mesh>
          <mesh position={[-3.2, 0, 0]}><boxGeometry args={[1.2, 5, 0.8]} />{material}</mesh>
          <mesh position={[3.2, 0, 0]}><boxGeometry args={[1.2, 5, 0.8]} />{material}</mesh>
          <mesh position={[-1.4, 0.6, -0.2]} rotation={[0, 0, -0.18]}><boxGeometry args={[2.2, 0.42, 1]} />{material}</mesh>
          <mesh position={[1.4, 0.6, -0.2]} rotation={[0, 0, 0.18]}><boxGeometry args={[2.2, 0.42, 1]} />{material}</mesh>
        </>}
        {artifact.kind === "jade" && <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[3.2, 0.52, 12, 48]} />{material}</mesh>}
        {artifact.kind === "bronze" && [-2, -1, 0, 1, 2].map((index) => <mesh key={index} position={[index * 1.45, Math.abs(index) * -0.34, 0]} rotation={[0, index * 0.08, index * 0.07]}><boxGeometry args={[1, 6.5, 0.7]} />{material}</mesh>)}
        {artifact.kind === "altar" && <>
          <mesh position={[0, -1.7, 0]}><boxGeometry args={[8, 1, 8]} />{material}</mesh>
          <mesh position={[0, -0.5, 0]}><boxGeometry args={[5.8, 1.2, 5.8]} />{material}</mesh>
          <mesh position={[0, 0.8, 0]}><boxGeometry args={[3, 1.5, 3]} />{material}</mesh>
        </>}
        {artifact.kind === "fragments" && Array.from({ length: 11 }, (_, index) => <mesh key={index} position={[Math.sin(index * 2.1) * 4.2, Math.cos(index * 1.37) * 3.3, Math.sin(index) * 2]} rotation={[index * 0.33, index * 0.61, index * 0.24]}><boxGeometry args={[0.5 + index % 3, 0.22, 0.65 + index % 2]} />{material}</mesh>)}
        {artifact.kind === "gate" && <>
          <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[6, 0.58, 12, 64]} />{material}</mesh>
          <mesh rotation={[Math.PI / 2, 0, Math.PI / 4]}><torusGeometry args={[4.2, 0.14, 8, 52]} />{material}</mesh>
        </>}
      </group>
      <pointLight color={color} intensity={active ? 28 : 3} distance={active ? 18 : 8} />
    </group>
  );
}

function Xiyu({ playerRef, controls }: { playerRef: RefObject<THREE.Group | null>; controls: RefObject<Controls> }) {
  const leftWing = useRef<THREE.Mesh>(null);
  const rightWing = useRef<THREE.Mesh>(null);
  const halo = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    const boosting = controls.current.boost;
    const flap = Math.sin(clock.elapsedTime * (boosting ? 10.5 : 5.5)) * (boosting ? 0.18 : 0.12);
    if (leftWing.current) leftWing.current.rotation.z = -0.12 + flap;
    if (rightWing.current) rightWing.current.rotation.z = 0.12 - flap;
    if (halo.current) {
      halo.current.rotation.z = clock.elapsedTime * (boosting ? 0.72 : 0.28);
      halo.current.scale.setScalar(THREE.MathUtils.lerp(halo.current.scale.x, boosting ? 1.18 : 1, 0.08));
    }
  });
  return (
    <group ref={playerRef}>
      <mesh scale={[0.62, 0.34, 1.25]}><sphereGeometry args={[1, 24, 16]} /><meshStandardMaterial color="#e8b44c" emissive="#a55412" emissiveIntensity={2.2} metalness={0.22} roughness={0.38} /></mesh>
      <mesh position={[0, 0.16, -1.05]} scale={[0.38, 0.38, 0.38]}><sphereGeometry args={[1, 18, 12]} /><meshStandardMaterial color="#f1c564" emissive="#a55412" emissiveIntensity={1.4} /></mesh>
      <mesh ref={leftWing} position={[-1.22, 0.05, 0.05]} scale={[1.55, 0.07, 0.62]}><boxGeometry /><meshStandardMaterial color="#e8dfc4" emissive="#d8a94a" emissiveIntensity={1.1} /></mesh>
      <mesh ref={rightWing} position={[1.22, 0.05, 0.05]} scale={[1.55, 0.07, 0.62]}><boxGeometry /><meshStandardMaterial color="#e8dfc4" emissive="#d8a94a" emissiveIntensity={1.1} /></mesh>
      <mesh position={[-0.95, 0, 2.2]} scale={[0.07, 0.07, 2.8]}><boxGeometry /><meshBasicMaterial color="#ff8b32" transparent opacity={0.46} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <mesh position={[0.95, 0, 2.2]} scale={[0.07, 0.07, 2.8]}><boxGeometry /><meshBasicMaterial color="#ff8b32" transparent opacity={0.46} blending={THREE.AdditiveBlending} depthWrite={false} /></mesh>
      <group ref={halo}>
        {[0, 1, 2, 3].map((index) => <mesh key={index} rotation={[0, 0, index * Math.PI / 2]}><torusGeometry args={[2.2, 0.018, 6, 48, Math.PI * 0.38]} /><meshBasicMaterial color={index % 2 ? "#9bc8c4" : "#d8a94a"} transparent opacity={0.72} /></mesh>)}
      </group>
      <pointLight color="#ff7a2f" intensity={24} distance={13} />
    </group>
  );
}

function FlightScene({ started, paused, quality, controls, resetKey, onTelemetry }: { started: boolean; paused: boolean; quality: Quality; controls: RefObject<Controls>; resetKey: number; onTelemetry: (telemetry: Telemetry) => void }) {
  const world = useRef<THREE.Group>(null);
  const player = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const lateral = useRef(new THREE.Vector2(0, 0));
  const velocity = useRef(new THREE.Vector2(0, 0));
  const lastReport = useRef(0);
  const backgroundTarget = useMemo(() => new THREE.Color(ATMOSPHERE_COLORS[0]), []);
  const fogTarget = useMemo(() => new THREE.Color(FOG_COLORS[0]), []);

  useEffect(() => {
    progress.current = 0;
    lateral.current.set(0, 0);
    velocity.current.set(0, 0);
    onTelemetry({ progress: 0, stage: 0, artifactId: null, finished: false });
  }, [resetKey, onTelemetry]);

  useFrame((state, delta) => {
    const input = controls.current;
    if (started && !paused && progress.current < ROUTE_LENGTH) {
      const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      const speed = (reducedMotion ? 2.4 : 4.2) * (input.boost ? 1.82 : 1);
      progress.current = Math.min(ROUTE_LENGTH, progress.current + delta * speed);
      const xAxis = (input.right ? 1 : 0) - (input.left ? 1 : 0);
      const yAxis = (input.up ? 1 : 0) - (input.down ? 1 : 0);
      const acceleration = input.boost ? 24 : 17;
      velocity.current.x += xAxis * acceleration * delta;
      velocity.current.y += yAxis * acceleration * 0.76 * delta;
      velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, xAxis === 0 ? 3.2 : 1.05, delta);
      velocity.current.y = THREE.MathUtils.damp(velocity.current.y, 0, yAxis === 0 ? 3.4 : 1.15, delta);
      velocity.current.x = THREE.MathUtils.clamp(velocity.current.x, input.boost ? -7.2 : -5.4, input.boost ? 7.2 : 5.4);
      velocity.current.y = THREE.MathUtils.clamp(velocity.current.y, input.boost ? -5.3 : -4.1, input.boost ? 5.3 : 4.1);
      lateral.current.addScaledVector(velocity.current, delta);
      if (Math.abs(lateral.current.x) > 8.4) {
        lateral.current.x = THREE.MathUtils.clamp(lateral.current.x, -8.4, 8.4);
        velocity.current.x *= -0.18;
      }
      if (Math.abs(lateral.current.y) > 5.2) {
        lateral.current.y = THREE.MathUtils.clamp(lateral.current.y, -5.2, 5.2);
        velocity.current.y *= -0.18;
      }
    }
    if (world.current) world.current.position.z = progress.current;
    if (player.current) {
      player.current.position.x = THREE.MathUtils.damp(player.current.position.x, lateral.current.x, 9, delta);
      player.current.position.y = THREE.MathUtils.damp(player.current.position.y, lateral.current.y + Math.sin(state.clock.elapsedTime * 1.4) * 0.1, 9, delta);
      player.current.rotation.z = THREE.MathUtils.damp(player.current.rotation.z, -velocity.current.x * 0.095, 5.2, delta);
      player.current.rotation.x = THREE.MathUtils.damp(player.current.rotation.x, -velocity.current.y * 0.07 + (input.boost ? -0.12 : 0), 5.2, delta);
      player.current.rotation.y = THREE.MathUtils.damp(player.current.rotation.y, velocity.current.x * 0.024, 4.2, delta);
    }
    state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, lateral.current.x * 0.2 - velocity.current.x * 0.045, 3.2, delta);
    state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, 2.6 + lateral.current.y * 0.14 - velocity.current.y * 0.025, 3.2, delta);
    state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, input.boost ? 12.6 : 11, 3.8, delta);
    state.camera.lookAt(lateral.current.x * 0.24, lateral.current.y * 0.2, -7);

    const stageBlend = progress.current < 68 ? 0 : progress.current < 84 ? (progress.current - 68) / 16 : progress.current < 156 ? 1 : progress.current < 172 ? 1 + (progress.current - 156) / 16 : 2;
    const stageIndex = Math.min(2, Math.floor(stageBlend));
    const nextIndex = Math.min(2, stageIndex + 1);
    const mix = stageBlend - stageIndex;
    backgroundTarget.set(ATMOSPHERE_COLORS[stageIndex]).lerp(new THREE.Color(ATMOSPHERE_COLORS[nextIndex]), mix);
    fogTarget.set(FOG_COLORS[stageIndex]).lerp(new THREE.Color(FOG_COLORS[nextIndex]), mix);
    if (input.boost) backgroundTarget.offsetHSL(0, 0.04, 0.018);
    if (state.scene.background instanceof THREE.Color) state.scene.background.lerp(backgroundTarget, 1 - Math.exp(-delta * 0.65));
    if (state.scene.fog instanceof THREE.Fog) state.scene.fog.color.lerp(fogTarget, 1 - Math.exp(-delta * 0.65));

    if (state.clock.elapsedTime - lastReport.current > 0.12) {
      const current = progress.current;
      const stage = current < 76 ? 0 : current < 164 ? 1 : 2;
      let nearest: Artifact | null = null;
      let nearestDistance = Infinity;
      ARTIFACTS.forEach((artifact) => {
        const distance = Math.abs(artifact.distance - current);
        if (distance < nearestDistance) { nearest = artifact; nearestDistance = distance; }
      });
      onTelemetry({ progress: current, stage, artifactId: nearestDistance < 8 ? (nearest as Artifact | null)?.id ?? null : null, finished: current >= ROUTE_LENGTH });
      lastReport.current = state.clock.elapsedTime;
    }
  });

  const currentArtifact = ARTIFACTS.reduce((result, artifact) => Math.abs(artifact.distance - progress.current) < Math.abs(result.distance - progress.current) ? artifact : result, ARTIFACTS[0]);
  return (
    <>
      <color attach="background" args={["#050b0d"]} />
      <fog attach="fog" args={["#071215", 9, quality === "high" ? 92 : 72]} />
      <ambientLight intensity={0.55} color="#5e8580" />
      <directionalLight position={[5, 9, 6]} intensity={2.2} color="#ffd37a" />
      <group ref={world}>
        <RouteFrames />
        <LivingBackdrop quality={quality} />
        <LightDust quality={quality} />
        {ARTIFACTS.map((artifact) => <ArtifactVisual key={artifact.id} artifact={artifact} active={currentArtifact.id === artifact.id && Math.abs(artifact.distance - progress.current) < 8} />)}
      </group>
      <SpeedLines quality={quality} controls={controls} />
      <Xiyu playerRef={player} controls={controls} />
    </>
  );
}

function TouchButton({ label, direction, setControl }: { label: string; direction: keyof Controls; setControl: (direction: keyof Controls, active: boolean) => void }) {
  return <button className={`touch-key touch-key--${direction}`} aria-label={label} onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); setControl(direction, true); }} onPointerUp={() => setControl(direction, false)} onPointerCancel={() => setControl(direction, false)}>{label}</button>;
}

export function JinshaExperience() {
  const [entered, setEntered] = useState(false);
  const [paused, setPaused] = useState(false);
  const [quality, setQuality] = useState<Quality>("high");
  const [resetKey, setResetKey] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [telemetry, setTelemetry] = useState<Telemetry>({ progress: 0, stage: 0, artifactId: null, finished: false });
  const controls = useRef<Controls>({ left: false, right: false, up: false, down: false, boost: false });
  const audio = useAmbientSound();
  const activeArtifact = ARTIFACTS.find((artifact) => artifact.id === telemetry.artifactId) ?? null;
  const stage = STAGES[telemetry.stage];
  const progressPercent = Math.min(100, telemetry.progress / ROUTE_LENGTH * 100);

  useEffect(() => {
    if (typeof window !== "undefined" && (window.innerWidth < 760 || navigator.hardwareConcurrency <= 4)) setQuality("eco");
  }, []);

  useEffect(() => {
    const keyMap: Record<string, keyof Controls> = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down", ShiftLeft: "boost", ShiftRight: "boost" };
    const mapKey = (code: string): keyof Controls | null => keyMap[code] ?? null;
    const update = (event: KeyboardEvent, active: boolean) => {
      const key = mapKey(event.code);
      if (!key) return;
      if (entered) event.preventDefault();
      controls.current[key] = active;
      if (key === "boost") setBoosting(active);
    };
    const onDown = (event: KeyboardEvent) => {
      if (event.code === "Escape" && entered) { setPaused((value) => !value); return; }
      update(event, true);
    };
    const onUp = (event: KeyboardEvent) => update(event, false);
    const releaseControls = () => {
      controls.current = { left: false, right: false, up: false, down: false, boost: false };
      setBoosting(false);
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseControls);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); window.removeEventListener("blur", releaseControls); };
  }, [entered]);

  const reportTelemetry = useCallback((value: Telemetry) => setTelemetry(value), []);
  const setControl = useCallback((direction: keyof Controls, active: boolean) => {
    controls.current[direction] = active;
    if (direction === "boost") setBoosting(active);
  }, []);
  const enterExperience = () => { audio.start(); setEntered(true); setPaused(false); };
  const replay = () => { setResetKey((value) => value + 1); setPaused(false); setEntered(true); };

  return (
    <main className={`experience ${entered ? "is-running" : "is-intro"} ${boosting && entered && !paused ? "is-boosting" : ""}`}>
      <div className="scene" aria-label="羽见千年三维体验场景">
        <Canvas camera={{ position: [0, 2.6, 11], fov: 58 }} dpr={quality === "high" ? [1, 1.65] : [0.75, 1.1]} gl={{ antialias: quality === "high", powerPreference: quality === "high" ? "high-performance" : "low-power" }}>
          <FlightScene started={entered} paused={paused || telemetry.finished} quality={quality} controls={controls} resetKey={resetKey} onTelemetry={reportTelemetry} />
        </Canvas>
      </div>

      <div className="hud-frame" aria-hidden="true"><i /><i /><i /><i /></div>

      <header className="brand-rail">
        <span className="brand-mark">羽</span>
        <p><strong>金沙遗址博物馆</strong>Jinsha immersive archive</p>
      </header>

      {!entered && <section className="intro" aria-labelledby="experience-title">
        <p className="eyebrow">跨越三千年的飞行叙事</p>
        <h1 id="experience-title">羽见<br />千年</h1>
        <p className="intro-copy">跟随曦羽穿过自然、文明与记忆，在流动的光中重新看见金沙。</p>
        <button className="enter-button" onClick={enterExperience}><span>进入体验</span><span aria-hidden="true">→</span></button>
      </section>}

      {entered && <>
        <section className="stage-heading" aria-live="polite">
          <span>{stage.index}</span><div><small>CHAPTER {telemetry.stage + 1} / 3</small><h2>{stage.name}</h2><div className="stage-meter">{STAGES.map((item, index) => <i key={item.name} className={index <= telemetry.stage ? "is-active" : ""} />)}</div></div>
        </section>
        <div className="top-actions">
          <button onClick={audio.toggle} aria-label={audio.muted ? "开启环境声音" : "关闭环境声音"}>{audio.muted ? "声音 关" : "声音 开"}</button>
          <button onClick={() => setQuality((value) => value === "high" ? "eco" : "high")} aria-label="切换画质">画质 {quality === "high" ? "高" : "省电"}</button>
          <button onClick={() => setPaused((value) => !value)} aria-label={paused ? "继续飞行" : "暂停飞行"}>{paused ? "继续" : "暂停"}</button>
        </div>
        {telemetry.progress < 12 && !paused && <p className="flight-prompt">让曦羽保持前行<br /><span>A / D 横移　W / S 升降　Shift 加速</span></p>}
        <aside className={`artifact-card ${activeArtifact ? "is-visible" : ""}`} aria-live="polite">
          {activeArtifact && <><span className="artifact-number">{String(ARTIFACTS.indexOf(activeArtifact) + 1).padStart(2, "0")}</span><p>金沙文化节点 · 白模</p><h3>{activeArtifact.name}</h3><div className="artifact-rule" /><p className="artifact-copy">{activeArtifact.caption}</p><small>{activeArtifact.assetKey}</small></>}
        </aside>
        <footer className="flight-dock">
          <div className="control-legend"><span><kbd>A</kbd><kbd>D</kbd> 左右</span><span><kbd>W</kbd><kbd>S</kbd> 升降</span><span><kbd>⇧</kbd> 按住疾飞</span></div>
          <div className="journey-progress">
            <div className="progress-meta"><span>文明航迹</span><strong>{Math.round(progressPercent)}%</strong></div>
            <div className="progress-track"><i style={{ width: `${progressPercent}%` }} />{[31.7, 68.3, 100].map((position, index) => <b key={position} className={telemetry.stage >= index ? "is-passed" : ""} style={{ left: `${position}%` }} />)}</div>
            <div className="progress-labels"><span>自然</span><span>文明</span><span>重生</span></div>
          </div>
          <div className="flight-state"><i />{boosting ? "疾飞中" : "巡航中"}</div>
        </footer>
        <div className="touch-controls" aria-label="触控飞行控制">
          <div className="touch-horizontal"><TouchButton label="左" direction="left" setControl={setControl} /><TouchButton label="右" direction="right" setControl={setControl} /></div>
          <div className="touch-vertical"><TouchButton label="升" direction="up" setControl={setControl} /><TouchButton label="降" direction="down" setControl={setControl} /><TouchButton label="疾" direction="boost" setControl={setControl} /></div>
        </div>
      </>}

      {paused && entered && !telemetry.finished && <section className="pause-card"><p>旅程暂停</p><h2>光仍停留在这里</h2><button className="enter-button" onClick={() => setPaused(false)}><span>继续飞行</span><span>→</span></button></section>}
      {telemetry.finished && <section className="pause-card completion-card"><p>羽见千年 · 旅程完成</p><h2>文明从未远去</h2><span>你已穿过自然、文明与记忆。正式模型加入后，所有白模节点都将被真实金沙文物替换。</span><button className="enter-button" onClick={replay}><span>再次启程</span><span>↻</span></button></section>}
      {!entered && <nav className="chapter-index" aria-label="体验章节"><span>自然之源 <i /></span><span>文明之光 <i /></span><span>记忆重生 <i /></span></nav>}
      {!entered && <p className="start-hint">DESKTOP · A / D 横移 · W / S 升降<br />MOBILE · 触控飞行</p>}
      <noscript><div className="no-webgl">请启用 JavaScript 以进入三维体验。</div></noscript>
    </main>
  );
}
