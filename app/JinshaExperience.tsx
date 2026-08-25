"use client";

import { Canvas, useFrame, useLoader, useThree, type ThreeEvent } from "@react-three/fiber";
import { useGSAP } from "@gsap/react";
import gsap from "gsap";
import { Component, Suspense, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from "react";
import * as THREE from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { ROUTE_LENGTH, SCENE_ASSETS, STAGES, createDefaultTransforms, type SceneAsset, type SceneTransform, type Vector3Tuple } from "./sceneAssets";

gsap.registerPlugin(useGSAP);

type Quality = "high" | "eco";
type EditorMode = "translate" | "rotate" | "scale";
type AudioMix = { master: number; background: number; effects: number };
type SceneMotion = "static" | "float" | "rotate-z-float";
type CollisionHit = { distance: number; normal: THREE.Vector3; assetId: string };
type CriticalAssetId = "renderer" | "character" | "cave";
type CriticalAssetReporter = (id: CriticalAssetId) => void;
type CriticalAssetErrorReporter = (label: string) => void;

type Controls = { left: boolean; right: boolean; up: boolean; down: boolean; boost: boolean; touchX: number; touchY: number };
type Telemetry = { progress: number; lateral: [number, number]; stage: number; artifactId: string | null; finished: boolean };

const ATMOSPHERE_COLORS = ["#061313", "#160d06", "#0c0717"] as const;
const FOG_COLORS = ["#0a1d1c", "#241408", "#170d25"] as const;

const SCENE_TRANSFORMS_KEY = "jinsha-scene-transforms-v2";
const AUDIO_MIX_KEY = "jinsha-audio-mix-v2";
const CAVE_COLLISION_EXCLUSIONS = new Set(["cave"]);
const FORWARD_COLLISION_EXCLUSIONS = new Set(["cave", "civilization-gate"]);
const CAMERA_COLLISION_EXCLUSIONS = new Set<string>();
const PLAYER_COLLISION_RADIUS = 0.82;
const CAMERA_COLLISION_RADIUS = 0.5;
const COLLISION_SKIN = 0.07;
const CAMERA_COLLISION_HOLD_SECONDS = 0.14;
const CAMERA_MAX_APPROACH_SPEED = 4.2;
const CAMERA_MAX_RELEASE_SPEED = 2.6;
const CAMERA_MAX_COMPRESSION = 1.35;
const INITIAL_ARTIFACT_REVEAL_PROGRESS = 24;
const CAVE_TRACK_OFFSET: [number, number] = [-0.65, -0.5];
const CRITICAL_SCENE_ASSET_IDS = new Set(["cave"]);
const INITIAL_PREFETCH_SCENE_ASSET_IDS = new Set(["ancient-tree", "landscape-birds", "stage-two-gate"]);
const SCENE_MOTIONS: Record<string, SceneMotion> = {
  cave: "static",
  "ancient-tree": "float",
  "landscape-birds": "static",
  "stage-two-gate": "static",
  sunbird: "rotate-z-float",
  "golden-mask": "float",
  "jade-bi": "rotate-z-float",
  "bronze-pattern": "float",
  ritual: "float",
  "stage-three-gate": "static",
  "mask-fragment": "float",
  "jade-fragment": "rotate-z-float",
  "bronze-fragment": "rotate-z-float",
  "sunbird-fragment": "rotate-z-float",
  "civilization-gate": "static",
};
const LEGACY_DEFAULT_POSITIONS: Record<string, Vector3Tuple> = {
  cave: [0, -0.4, -10],
  "ancient-tree": [-2.6, -0.5, -52],
  "landscape-birds": [3.2, 0.4, -80],
  "stage-two-gate": [0, 0, -108],
  sunbird: [-3.4, 1, -132],
  "golden-mask": [3.6, 0.5, -154],
  "jade-bi": [-3.8, 0.8, -176],
  "bronze-pattern": [3.4, 0.3, -198],
  ritual: [-2.4, -0.7, -222],
  "stage-three-gate": [0, 0, -248],
  "mask-fragment": [-3.5, 0.8, -272],
  "jade-fragment": [3.7, 1, -293],
  "bronze-fragment": [-3.1, 0.5, -314],
  "sunbird-fragment": [3.1, 0.8, -336],
  "civilization-gate": [0, 0, -362],
};
const PREVIOUS_DEFAULT_POSITIONS: Record<string, Vector3Tuple> = {
  cave: [0, -0.4, -10],
  "ancient-tree": [-1.2, -0.5, -52],
  "landscape-birds": [1.1, 0.4, -80],
  "stage-two-gate": [0, 0, -108],
  sunbird: [-1.1, 1, -132],
  "golden-mask": [1.2, 0.5, -154],
  "jade-bi": [-1.1, 0.8, -176],
  "bronze-pattern": [1.2, 0.3, -198],
  ritual: [-1, -0.7, -222],
  "stage-three-gate": [0, 0, -248],
  "mask-fragment": [-1.1, 0.8, -272],
  "jade-fragment": [1.1, 1, -293],
  "bronze-fragment": [-1, 0.5, -314],
  "sunbird-fragment": [1.1, 0.8, -336],
  "civilization-gate": [0, 0, -362],
};
const dracoLoader = new DRACOLoader().setDecoderPath("/draco/");
if (typeof WebAssembly !== "object") dracoLoader.setDecoderConfig({ type: "js" });
const ATMOSPHERE_COLOR_VALUES = ATMOSPHERE_COLORS.map((color) => new THREE.Color(color));
const FOG_COLOR_VALUES = FOG_COLORS.map((color) => new THREE.Color(color));

function getRecommendedQuality(): Quality {
  if (typeof window === "undefined") return "high";
  const navigatorWithMemory = navigator as Navigator & { deviceMemory?: number };
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  const constrainedMemory = (navigatorWithMemory.deviceMemory ?? 8) <= 4;
  const constrainedCpu = (navigator.hardwareConcurrency ?? 8) <= 4;
  const mobileViewport = window.innerWidth <= 900 || (coarsePointer && window.innerWidth <= 1180);
  return mobileViewport || constrainedMemory || constrainedCpu ? "eco" : "high";
}

function getSceneModelUrl(asset: SceneAsset, quality: Quality): string {
  const directory = quality === "eco" ? "/models/jinsha-eco/" : "/models/jinsha-optimized/";
  return asset.url.replace("/models/jinsha/", directory);
}
const SPATIAL_SOUND_SOURCES = [
  { assetId: "landscape-birds", url: "/audio/stage-water.mp3", volume: 0.7, near: 18, far: 220 },
  { assetId: "stage-three-gate", url: "/audio/stage-bell.mp3", volume: 0.76, near: 20, far: 230 },
  { assetId: "civilization-gate", url: "/audio/stage-jade-echo.mp3", volume: 0.74, near: 22, far: 240 },
] as const;

function useAmbientSound(masterVolume: number, backgroundVolume: number) {
  const player = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);
  const [muted, setMuted] = useState(false);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!player.current) {
      const track = new Audio("/audio/jinsha-stone-passage.mp3");
      track.loop = true;
      track.preload = "auto";
      track.volume = 1;
      player.current = track;
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        const audioContext = new AudioContextConstructor();
        const mediaSource = audioContext.createMediaElementSource(track);
        const volumeGain = audioContext.createGain();
        volumeGain.gain.value = muted ? 0 : THREE.MathUtils.clamp(0.78 * masterVolume * backgroundVolume, 0, 1);
        mediaSource.connect(volumeGain).connect(audioContext.destination);
        context.current = audioContext;
        source.current = mediaSource;
        gain.current = volumeGain;
      }
    }
    if (context.current?.state === "suspended") void context.current.resume();
    player.current.muted = gain.current ? false : muted;
    if (!gain.current) player.current.volume = THREE.MathUtils.clamp(0.78 * masterVolume * backgroundVolume, 0, 1);
    void player.current.play().catch(() => undefined);
  }, [backgroundVolume, masterVolume, muted]);

  useEffect(() => {
    const targetVolume = muted ? 0 : THREE.MathUtils.clamp(0.78 * masterVolume * backgroundVolume, 0, 1);
    if (gain.current && context.current) {
      const now = context.current.currentTime;
      gain.current.gain.cancelScheduledValues(now);
      gain.current.gain.setTargetAtTime(targetVolume, now, 0.035);
    } else if (player.current) {
      player.current.muted = muted;
      player.current.volume = targetVolume;
    }
  }, [backgroundVolume, masterVolume, muted]);

  const toggle = useCallback(() => {
    setMuted((previous) => !previous);
  }, []);

  useEffect(() => () => {
    if (player.current) {
      player.current.pause();
      player.current.src = "";
      player.current = null;
    }
    source.current?.disconnect();
    gain.current?.disconnect();
    source.current = null;
    gain.current = null;
    if (context.current) void context.current.close();
    context.current = null;
  }, []);

  return { muted, start, toggle };
}

function useBoostSound(active: boolean, muted: boolean, effectsVolume: number) {
  const player = useRef<HTMLAudioElement | null>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<MediaElementAudioSourceNode | null>(null);
  const gain = useRef<GainNode | null>(null);

  useEffect(() => {
    const track = new Audio("/audio/boost-wind.mp3");
    track.loop = true;
    track.preload = "none";
    track.volume = 1;
    player.current = track;
    return () => {
      track.pause();
      track.src = "";
      player.current = null;
      source.current?.disconnect();
      gain.current?.disconnect();
      source.current = null;
      gain.current = null;
      if (context.current) void context.current.close();
      context.current = null;
    };
  }, []);

  const start = useCallback(() => {
    const track = player.current;
    if (!track) return;
    if (!context.current) {
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (AudioContextConstructor) {
        const audioContext = new AudioContextConstructor();
        const mediaSource = audioContext.createMediaElementSource(track);
        const volumeGain = audioContext.createGain();
        volumeGain.gain.value = 0;
        mediaSource.connect(volumeGain).connect(audioContext.destination);
        context.current = audioContext;
        source.current = mediaSource;
        gain.current = volumeGain;
      }
    }
    if (context.current?.state === "suspended") void context.current.resume();
    track.muted = false;
    void track.play().catch(() => undefined);
  }, []);

  useEffect(() => {
    const track = player.current;
    if (!track) return;
    const audible = active && !muted;
    const targetVolume = audible ? THREE.MathUtils.clamp(0.64 * effectsVolume, 0, 1) : 0;
    if (gain.current && context.current) {
      const now = context.current.currentTime;
      gain.current.gain.cancelScheduledValues(now);
      gain.current.gain.setTargetAtTime(targetVolume, now, targetVolume > gain.current.gain.value ? 0.22 : 0.3);
    } else {
      track.muted = muted;
      track.volume = targetVolume;
    }
  }, [active, effectsVolume, muted]);

  return start;
}

function useSceneSpatialSounds({ progress, lateral, transforms, active, muted, effectsVolume }: {
  progress: number;
  lateral: [number, number];
  transforms: Record<string, SceneTransform>;
  active: boolean;
  muted: boolean;
  effectsVolume: number;
}) {
  const context = useRef<AudioContext | null>(null);
  const nodes = useRef<Record<string, { source: AudioBufferSourceNode | null; filter: BiquadFilterNode; gain: GainNode; loading: boolean }>>({});
  const abortControllers = useRef<AbortController[]>([]);

  const start = useCallback(() => {
    if (typeof window === "undefined") return;
    if (!context.current) {
      const AudioContextConstructor = window.AudioContext
        ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AudioContextConstructor) return;
      const audioContext = new AudioContextConstructor();
      context.current = audioContext;
      for (const sound of SPATIAL_SOUND_SOURCES) {
        const filter = audioContext.createBiquadFilter();
        const gain = audioContext.createGain();
        filter.type = "lowpass";
        filter.frequency.value = 720;
        filter.Q.value = 0.42;
        gain.gain.value = 0;
        filter.connect(gain).connect(audioContext.destination);
        nodes.current[sound.assetId] = { source: null, filter, gain, loading: false };
      }
    }
    const audioContext = context.current;
    if (!audioContext) return;
    void audioContext.resume();
  }, []);

  useEffect(() => {
    const audioContext = context.current;
    if (!audioContext) return;
    const now = audioContext.currentTime;
    for (const source of SPATIAL_SOUND_SOURCES) {
      const node = nodes.current[source.assetId];
      const transform = transforms[source.assetId];
      if (!node || !transform) continue;
      const distance = Math.hypot(
        transform.position[0] - lateral[0],
        transform.position[1] - lateral[1],
        -transform.position[2] - progress,
      );
      const proximity = 1 - THREE.MathUtils.smoothstep(distance, source.near, source.far);
      const presence = proximity * proximity * (3 - 2 * proximity);
      if (active && proximity > 0.015 && !node.source && !node.loading) {
        node.loading = true;
        const controller = new AbortController();
        abortControllers.current.push(controller);
        void fetch(source.url, { signal: controller.signal })
          .then((response) => {
            if (!response.ok) throw new Error(`Audio request failed: ${response.status}`);
            return response.arrayBuffer();
          })
          .then((buffer) => audioContext.decodeAudioData(buffer))
          .then((buffer) => {
            if (context.current !== audioContext) return;
            const bufferSource = audioContext.createBufferSource();
            bufferSource.buffer = buffer;
            bufferSource.loop = true;
            bufferSource.connect(node.filter);
            bufferSource.start();
            node.source = bufferSource;
          })
          .catch(() => undefined)
          .finally(() => { node.loading = false; });
      }
      const targetVolume = active && !muted ? presence * source.volume * effectsVolume : 0;
      const targetCutoff = THREE.MathUtils.lerp(720, 17800, Math.pow(proximity, 0.72));
      node.gain.gain.cancelScheduledValues(now);
      node.gain.gain.setTargetAtTime(targetVolume, now, targetVolume > node.gain.gain.value ? 0.3 : 0.62);
      node.filter.frequency.cancelScheduledValues(now);
      node.filter.frequency.setTargetAtTime(targetCutoff, now, 0.38);
    }
  }, [active, effectsVolume, lateral, muted, progress, transforms]);

  useEffect(() => () => {
    abortControllers.current.forEach((controller) => controller.abort());
    abortControllers.current = [];
    Object.values(nodes.current).forEach((node) => {
      try { node.source?.stop(); } catch { /* Source may already be stopped. */ }
      node.source?.disconnect();
      node.filter.disconnect();
      node.gain.disconnect();
    });
    nodes.current = {};
    if (context.current) void context.current.close();
    context.current = null;
  }, []);

  return { start };
}

function LightDust({ quality }: { quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const positions = useMemo(() => {
    const count = quality === "high" ? 440 : 180;
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
      <pointsMaterial color="#f0be58" size={quality === "high" ? 0.06 : 0.048} transparent opacity={0.5} sizeAttenuation depthWrite={false} blending={THREE.AdditiveBlending} />
    </points>
  );
}

function createGlowTexture(size = 32) {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const offset = (y * size + x) * 4;
      const distance = Math.hypot((x + 0.5) / size - 0.5, (y + 0.5) / size - 0.5) * 2;
      const alpha = THREE.MathUtils.clamp(1 - distance, 0, 1);
      data[offset] = 255;
      data[offset + 1] = 255;
      data[offset + 2] = 255;
      data[offset + 3] = Math.round(Math.pow(alpha, 1.7) * 255);
    }
  }
  const texture = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  texture.needsUpdate = true;
  return texture;
}

function particleUnit(index: number, salt: number) {
  const value = Math.sin(index * 73.137 + salt * 41.917) * 43758.5453;
  return value - Math.floor(value);
}

function StarField({ quality }: { quality: Quality }) {
  const farPoints = useRef<THREE.Points>(null);
  const brightPoints = useRef<THREE.Points>(null);
  const softPoints = useRef<THREE.Points>(null);
  const brightMaterial = useRef<THREE.PointsMaterial>(null);
  const softMaterial = useRef<THREE.PointsMaterial>(null);
  const glowTexture = useMemo(() => createGlowTexture(32), []);
  const layers = useMemo(() => {
    const random = (index: number, salt: number) => {
      const value = Math.sin(index * 91.733 + salt * 37.719) * 43758.5453;
      return value - Math.floor(value);
    };
    const createLayer = (count: number, width: number, height: number) => {
      const positions = new Float32Array(count * 3);
      const colors = new Float32Array(count * 3);
      for (let index = 0; index < count; index += 1) {
        const offset = index * 3;
        const distance = 14 + random(index, 3) * (ROUTE_LENGTH + 76);
        const stage = distance < STAGES[0].range[1] ? 0 : distance < STAGES[1].range[1] ? 1 : 2;
        const base = new THREE.Color(STAGES[stage].color).lerp(new THREE.Color(index % 5 === 0 ? "#f6d890" : "#d7e8df"), 0.48);
        positions[offset] = (random(index, 7) - 0.5) * width;
        positions[offset + 1] = (random(index, 11) - 0.46) * height;
        positions[offset + 2] = -distance;
        colors[offset] = base.r;
        colors[offset + 1] = base.g;
        colors[offset + 2] = base.b;
      }
      return { positions, colors };
    };
    return {
      far: createLayer(quality === "high" ? 1500 : 650, 138, 78),
      bright: createLayer(quality === "high" ? 280 : 120, 82, 46),
      soft: createLayer(quality === "high" ? 72 : 32, 106, 58),
    };
  }, [quality]);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);
  useFrame(({ clock }) => {
    if (farPoints.current) farPoints.current.rotation.z = Math.sin(clock.elapsedTime * 0.018) * 0.012;
    if (brightPoints.current) brightPoints.current.rotation.z = -Math.sin(clock.elapsedTime * 0.023) * 0.017;
    if (softPoints.current) softPoints.current.rotation.z = Math.sin(clock.elapsedTime * 0.011) * 0.022;
    if (brightMaterial.current) brightMaterial.current.opacity = 0.68 + Math.sin(clock.elapsedTime * 0.82) * 0.13;
    if (softMaterial.current) softMaterial.current.opacity = 0.15 + Math.sin(clock.elapsedTime * 0.31) * 0.045;
  });

  return <group>
    <points ref={farPoints} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[layers.far.positions, 3]} /><bufferAttribute attach="attributes-color" args={[layers.far.colors, 3]} /></bufferGeometry>
      <pointsMaterial map={glowTexture} alphaTest={0.01} vertexColors size={quality === "high" ? 0.34 : 0.28} transparent opacity={0.6} sizeAttenuation depthWrite={false} fog blending={THREE.AdditiveBlending} />
    </points>
    <points ref={brightPoints} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[layers.bright.positions, 3]} /><bufferAttribute attach="attributes-color" args={[layers.bright.colors, 3]} /></bufferGeometry>
      <pointsMaterial ref={brightMaterial} map={glowTexture} alphaTest={0.008} vertexColors size={quality === "high" ? 0.62 : 0.5} transparent opacity={0.72} sizeAttenuation depthWrite={false} fog blending={THREE.AdditiveBlending} />
    </points>
    <points ref={softPoints} frustumCulled={false}>
      <bufferGeometry><bufferAttribute attach="attributes-position" args={[layers.soft.positions, 3]} /><bufferAttribute attach="attributes-color" args={[layers.soft.colors, 3]} /></bufferGeometry>
      <pointsMaterial ref={softMaterial} map={glowTexture} alphaTest={0.002} vertexColors size={quality === "high" ? 1.7 : 1.3} transparent opacity={0.15} sizeAttenuation depthWrite={false} fog blending={THREE.AdditiveBlending} />
    </points>
  </group>;
}

function DepthCorridor({ quality }: { quality: Quality }) {
  const rings = useRef<THREE.InstancedMesh>(null);
  const count = quality === "high" ? 20 : 12;
  const dummy = useMemo(() => new THREE.Object3D(), []);

  useLayoutEffect(() => {
    if (!rings.current) return;
    const spacing = ROUTE_LENGTH / (count + 1);
    for (let index = 0; index < count; index += 1) {
      const distance = 34 + index * spacing;
      const radius = 13.8 + (index % 4) * 1.15;
      dummy.position.set(Math.sin(index * 1.73) * 1.35, Math.cos(index * 1.29) * 0.72, -distance);
      dummy.rotation.set(0, 0, index * 0.41);
      dummy.scale.setScalar(radius);
      dummy.updateMatrix();
      rings.current.setMatrixAt(index, dummy.matrix);
      const stageIndex = distance < STAGES[0].range[1] ? 0 : distance < STAGES[1].range[1] ? 1 : 2;
      rings.current.setColorAt(index, new THREE.Color(STAGES[stageIndex].color).lerp(new THREE.Color("#d8bd82"), 0.28));
    }
    rings.current.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    rings.current.instanceMatrix.needsUpdate = true;
    if (rings.current.instanceColor) rings.current.instanceColor.needsUpdate = true;
  }, [count, dummy]);

  useFrame(({ clock }) => {
    if (rings.current) rings.current.rotation.z = Math.sin(clock.elapsedTime * 0.055) * 0.014;
  });

  return <instancedMesh ref={rings} args={[undefined, undefined, count]} frustumCulled={false}>
    <torusGeometry args={[1, 0.009, 4, quality === "high" ? 64 : 36]} />
    <meshBasicMaterial vertexColors transparent opacity={quality === "high" ? 0.13 : 0.09} depthWrite={false} fog blending={THREE.AdditiveBlending} />
  </instancedMesh>;
}

function ArtifactFrame({ asset, transform, index, frameSize }: { asset: SceneAsset; transform: SceneTransform; index: number; frameSize: number }) {
  const frame = useRef<THREE.Group>(null);
  const thickness = THREE.MathUtils.clamp(frameSize * 0.002, 0.14, 0.3);
  const color = useMemo(() => new THREE.Color(STAGES[asset.stage].color).lerp(new THREE.Color("#bbb49f"), 0.1).offsetHSL(0, -0.05, -0.04), [asset.stage]);
  useFrame(({ clock }) => {
    if (!frame.current) return;
    const phaseOffset = ((index % 5) - 2) * THREE.MathUtils.degToRad(2);
    frame.current.rotation.z = clock.elapsedTime * 0.012 + phaseOffset;
  });
  return <group ref={frame} position={transform.position}>
    <mesh position={[-frameSize / 2, 0, 0]}><boxGeometry args={[thickness, frameSize, thickness]} /><meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} fog /></mesh>
    <mesh position={[frameSize / 2, 0, 0]}><boxGeometry args={[thickness, frameSize, thickness]} /><meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} fog /></mesh>
    <mesh position={[0, frameSize / 2, 0]}><boxGeometry args={[frameSize, thickness, thickness]} /><meshBasicMaterial color={color} transparent opacity={0.16} depthWrite={false} fog /></mesh>
    <mesh position={[0, -frameSize / 2, 0]}><boxGeometry args={[frameSize, thickness, thickness]} /><meshBasicMaterial color={color} transparent opacity={0.13} depthWrite={false} fog /></mesh>
  </group>;
}

function RouteFrames({ transforms }: { transforms: Record<string, SceneTransform> }) {
  const frameSize = useMemo(() => {
    const largestModel = SCENE_ASSETS.reduce((largest, asset) => {
      const transform = transforms[asset.id];
      if (!transform) return largest;
      const modelScale = Math.max(...transform.scale.map((value) => Math.abs(value)));
      return Math.max(largest, asset.targetSize * 1.28 * modelScale);
    }, 0);
    // A rotated rectangular model can need up to sqrt(2) times its largest dimension.
    return largestModel * 1.44;
  }, [transforms]);

  return <group>{SCENE_ASSETS.map((asset, index) => (
    <ArtifactFrame key={asset.id} asset={asset} transform={transforms[asset.id]} index={index} frameSize={frameSize} />
  ))}</group>;
}

function IntroSunbirds() {
  const arcLength = Math.PI * 0.29;
  const segmentLength = Math.PI / 2;
  const gapCenter = (arcLength + segmentLength) / 2;
  return <group>
    {[0, 1, 2, 3].map((index) => {
      const angle = index * segmentLength + gapCenter;
      return <group key={index} position={[Math.cos(angle) * 3.05, Math.sin(angle) * 3.05, 0]} rotation={[0, 0, angle + Math.PI / 2]} scale={0.66}>
        <mesh scale={[0.55, 0.2, 0.18]}><sphereGeometry args={[1, 10, 7]} /><meshToonMaterial color="#ddb45a" emissive="#8f5d13" emissiveIntensity={0.9} /></mesh>
        <mesh position={[-0.48, 0, 0]} rotation={[0, 0, -0.42]} scale={[0.72, 0.08, 0.22]}><boxGeometry /><meshToonMaterial color="#f0ce77" emissive="#8f5d13" emissiveIntensity={0.72} /></mesh>
        <mesh position={[0.48, 0, 0]} rotation={[0, 0, 0.42]} scale={[0.72, 0.08, 0.22]}><boxGeometry /><meshToonMaterial color="#f0ce77" emissive="#8f5d13" emissiveIntensity={0.72} /></mesh>
      </group>;
    })}
  </group>;
}

function SpeedLines({ quality, controls, cruising }: { quality: Quality; controls: RefObject<Controls>; cruising: boolean }) {
  const mesh = useRef<THREE.InstancedMesh>(null);
  const material = useRef<THREE.MeshBasicMaterial>(null);
  const intensity = useRef(0);
  const count = quality === "high" ? 28 : 14;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const lines = useMemo(() => Array.from({ length: count }, (_, index) => {
    const angle = index * 2.39996;
    const radius = 3.4 + ((index * 37) % 100) / 100 * 9.2;
    return {
      x: Math.cos(angle) * radius,
      y: Math.sin(angle) * radius * 0.62,
      z: -34 + ((index * 53) % 100) / 100 * 30,
      speed: 0.75 + (index % 7) * 0.08,
      length: 1.4 + (index % 5) * 0.52,
    };
  }), [count]);

  useFrame(({ camera }, delta) => {
    const target = controls.current.boost && cruising ? 1 : 0;
    intensity.current = THREE.MathUtils.damp(intensity.current, target, target ? 7.5 : 4.2, delta);
    if (!mesh.current || !material.current) return;
    mesh.current.position.copy(camera.position);
    mesh.current.quaternion.copy(camera.quaternion);
    mesh.current.visible = intensity.current > 0.012;
    material.current.opacity = intensity.current * 0.46;
    lines.forEach((line, index) => {
      line.z += delta * (12 + intensity.current * 54) * line.speed;
      if (line.z > -1.8) line.z = -34 - (index % 9);
      dummy.position.set(line.x, line.y, line.z);
      dummy.rotation.set(-line.y * 0.008, line.x * 0.008, 0);
      dummy.scale.set(1 + intensity.current * 0.5, 1 + intensity.current * 0.5, line.length * (0.45 + intensity.current * 1.45));
      dummy.updateMatrix();
      mesh.current!.setMatrixAt(index, dummy.matrix);
    });
    mesh.current.instanceMatrix.needsUpdate = true;
  });

  return <instancedMesh ref={mesh} args={[undefined, undefined, count]} frustumCulled={false}>
    <boxGeometry args={[0.012, 0.012, 1]} />
    <meshBasicMaterial ref={material} color="#ffd36e" transparent opacity={0} depthWrite={false} blending={THREE.AdditiveBlending} />
  </instancedMesh>;
}

function FireflyTrail({ playerRef, quality, active }: { playerRef: RefObject<THREE.Group | null>; quality: Quality; active: boolean }) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const count = quality === "high" ? 48 : 24;
  const glowTexture = useMemo(() => createGlowTexture(32), []);
  const emissionCursor = useRef(0);
  const emissionBudget = useRef(0);
  const particleData = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const lives = new Float32Array(count);
    const phases = new Float32Array(count);
    const gold = new THREE.Color("#ffd36e");
    const jade = new THREE.Color("#88d7bd");
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      positions[offset + 2] = 1000;
      lives[index] = 1;
      phases[index] = index * 1.73;
      const color = index % 4 === 0 ? jade : gold;
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    return { positions, colors, lives, phases };
  }, [count]);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);

  useFrame(({ clock }, delta) => {
    if (material.current) material.current.opacity = THREE.MathUtils.damp(material.current.opacity, active ? 0.84 : 0, active ? 5.2 : 1.35, delta);
    const player = playerRef.current;
    const geometry = points.current?.geometry;
    if (!player || !geometry) return;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      if (particleData.lives[index] < 1) {
        particleData.lives[index] += delta * 0.34;
        const phase = particleData.phases[index] + clock.elapsedTime * (0.86 + (index % 7) * 0.04);
        particleData.positions[offset] += Math.sin(phase) * delta * 0.12;
        particleData.positions[offset + 1] += Math.cos(phase * 1.3) * delta * 0.09;
        particleData.positions[offset + 2] += delta * (2.4 + (index % 9) * 0.16);
        if (particleData.lives[index] >= 1) particleData.positions[offset + 2] = 1000;
      }
    }
    if (active) {
      emissionBudget.current = Math.min(6, emissionBudget.current + delta * (quality === "high" ? 38 : 22));
      while (emissionBudget.current >= 1) {
        const index = emissionCursor.current;
        const offset = index * 3;
        const phase = particleData.phases[index] + clock.elapsedTime * 0.19;
        const radius = 0.2 + (index % 6) * 0.07;
        particleData.positions[offset] = player.position.x + Math.cos(phase) * radius;
        particleData.positions[offset + 1] = player.position.y - 0.52 + Math.sin(phase * 1.61) * radius * 0.78;
        particleData.positions[offset + 2] = player.position.z + 0.34;
        particleData.lives[index] = 0;
        emissionCursor.current = (index + 1) % count;
        emissionBudget.current -= 1;
      }
    } else {
      emissionBudget.current = 0;
    }
    geometry.attributes.position.needsUpdate = true;
  });

  return <points ref={points} frustumCulled={false}>
    <bufferGeometry>
      <bufferAttribute attach="attributes-position" args={[particleData.positions, 3]} />
      <bufferAttribute attach="attributes-color" args={[particleData.colors, 3]} />
    </bufferGeometry>
    <pointsMaterial ref={material} map={glowTexture} alphaTest={0.015} vertexColors size={quality === "high" ? 0.095 : 0.08} transparent opacity={0} sizeAttenuation depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
  </points>;
}

function getParticleExtent(asset: SceneAsset, transform: SceneTransform) {
  const averageScale = transform.scale.reduce((sum, value) => sum + Math.abs(value), 0) / 3;
  return asset.targetSize * Math.max(averageScale, 0.01);
}

function ArtifactFireflies({ asset, transform, quality }: { asset: SceneAsset; transform: SceneTransform; quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const count = asset.id === "ancient-tree"
    ? quality === "high" ? 92 : 38
    : quality === "high" ? 156 : 62;
  const extent = getParticleExtent(asset, transform);
  const glowTexture = useMemo(() => createGlowTexture(32), []);
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const origins = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const palette = asset.id === "stage-three-gate"
      ? [new THREE.Color("#f4ca73"), new THREE.Color("#79d9ef")]
      : asset.id === "ancient-tree"
        ? [new THREE.Color("#b6e391"), new THREE.Color("#e8c96f")]
        : [new THREE.Color("#ffd36e"), new THREE.Color("#8be0bb")];
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const angle = particleUnit(index, 2) * Math.PI * 2;
      const radius = 0.24 + particleUnit(index, 5) * 0.76;
      origins[offset] = Math.cos(angle) * extent * 0.36 * radius;
      origins[offset + 1] = (particleUnit(index, 8) - 0.46) * extent * 0.66;
      origins[offset + 2] = Math.sin(angle) * extent * 0.18 * radius;
      positions[offset] = origins[offset];
      positions[offset + 1] = origins[offset + 1];
      positions[offset + 2] = origins[offset + 2];
      phases[index] = particleUnit(index, 13) * Math.PI * 2;
      const color = palette[index % palette.length].clone().lerp(new THREE.Color("#fff6d7"), particleUnit(index, 17) * 0.22);
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    return { positions, origins, colors, phases };
  }, [asset.id, count, extent]);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);
  useFrame(({ clock }) => {
    const geometry = points.current?.geometry;
    if (!geometry) return;
    const time = clock.elapsedTime;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const phase = data.phases[index];
      data.positions[offset] = data.origins[offset] + Math.sin(time * 0.72 + phase) * extent * 0.026;
      data.positions[offset + 1] = data.origins[offset + 1] + Math.sin(time * 0.94 + phase * 1.37) * extent * 0.034;
      data.positions[offset + 2] = data.origins[offset + 2] + Math.cos(time * 0.63 + phase * 0.81) * extent * 0.018;
    }
    geometry.attributes.position.needsUpdate = true;
    if (material.current) material.current.opacity = 0.79 + Math.sin(time * 1.1) * 0.14;
  });

  return <group position={transform.position} rotation={transform.rotation}>
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} map={glowTexture} alphaTest={0.008} vertexColors size={Math.max(0.22, extent * (quality === "high" ? 0.0062 : 0.0052))} transparent opacity={0.82} sizeAttenuation depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
    </points>
  </group>;
}

function LandscapeWaterParticles({ asset, transform, quality }: { asset: SceneAsset; transform: SceneTransform; quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const count = quality === "high" ? 268 : 98;
  const extent = getParticleExtent(asset, transform);
  const glowTexture = useMemo(() => createGlowTexture(24), []);
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const baseX = new Float32Array(count);
    const baseZ = new Float32Array(count);
    const phases = new Float32Array(count);
    const speeds = new Float32Array(count);
    const blue = new THREE.Color("#4bbfff");
    const paleBlue = new THREE.Color("#a7ecff");
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      baseX[index] = (particleUnit(index, 3) - 0.5) * extent * 0.56;
      baseZ[index] = (particleUnit(index, 7) - 0.5) * extent * 0.2;
      phases[index] = particleUnit(index, 11);
      speeds[index] = 0.13 + particleUnit(index, 15) * 0.13;
      const color = blue.clone().lerp(paleBlue, particleUnit(index, 19));
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    return { positions, colors, baseX, baseZ, phases, speeds };
  }, [count, extent]);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);
  useFrame(({ clock }) => {
    const geometry = points.current?.geometry;
    if (!geometry) return;
    const time = clock.elapsedTime;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const fall = (data.phases[index] + time * data.speeds[index]) % 1;
      data.positions[offset] = data.baseX[index] + Math.sin(time * 0.72 + index) * extent * 0.008;
      data.positions[offset + 1] = extent * 0.31 - fall * extent * 0.68;
      data.positions[offset + 2] = data.baseZ[index];
    }
    geometry.attributes.position.needsUpdate = true;
    if (material.current) material.current.opacity = 0.8 + Math.sin(time * 0.76) * 0.1;
  });

  return <group position={transform.position} rotation={transform.rotation}>
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} map={glowTexture} alphaTest={0.006} vertexColors size={Math.max(0.2, extent * (quality === "high" ? 0.0047 : 0.004))} transparent opacity={0.84} sizeAttenuation depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
    </points>
  </group>;
}

function SacredGateParticles({ asset, transform, quality }: { asset: SceneAsset; transform: SceneTransform; quality: Quality }) {
  const points = useRef<THREE.Points>(null);
  const material = useRef<THREE.PointsMaterial>(null);
  const count = quality === "high" ? 324 : 122;
  const extent = getParticleExtent(asset, transform);
  const glowTexture = useMemo(() => createGlowTexture(32), []);
  const data = useMemo(() => {
    const positions = new Float32Array(count * 3);
    const colors = new Float32Array(count * 3);
    const phases = new Float32Array(count);
    const angles = new Float32Array(count);
    const speeds = new Float32Array(count);
    const spreads = new Float32Array(count);
    const gold = new THREE.Color("#e8b950");
    const whiteGold = new THREE.Color("#fff4cf");
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      phases[index] = particleUnit(index, 2);
      angles[index] = particleUnit(index, 6) * Math.PI * 2;
      speeds[index] = 0.055 + particleUnit(index, 10) * 0.055;
      spreads[index] = 0.72 + particleUnit(index, 14) * 0.38;
      const color = gold.clone().lerp(whiteGold, particleUnit(index, 18));
      colors[offset] = color.r;
      colors[offset + 1] = color.g;
      colors[offset + 2] = color.b;
    }
    return { positions, colors, phases, angles, speeds, spreads };
  }, [count]);

  useEffect(() => () => glowTexture.dispose(), [glowTexture]);
  useFrame(({ clock }) => {
    const geometry = points.current?.geometry;
    if (!geometry) return;
    const time = clock.elapsedTime;
    for (let index = 0; index < count; index += 1) {
      const offset = index * 3;
      const life = (data.phases[index] + time * data.speeds[index]) % 1;
      const angle = data.angles[index] + time * 0.07 * (index % 2 ? 1 : -1);
      const radius = extent * (0.055 + life * 0.34) * data.spreads[index];
      data.positions[offset] = Math.cos(angle) * radius;
      data.positions[offset + 1] = -extent * 0.35 + life * extent * 0.78 + Math.sin(angle * 2.1) * extent * 0.025;
      data.positions[offset + 2] = Math.sin(angle) * radius * 0.42;
    }
    geometry.attributes.position.needsUpdate = true;
    if (material.current) material.current.opacity = 0.86 + Math.sin(time * 0.84) * 0.11;
  });

  return <group position={transform.position} rotation={transform.rotation}>
    <sprite position={[0, 0, extent * 0.025]} scale={[extent * 0.72, extent * 0.72, 1]}>
      <spriteMaterial map={glowTexture} color="#dfad4d" transparent opacity={quality === "high" ? 0.18 : 0.13} depthWrite={false} blending={THREE.AdditiveBlending} />
    </sprite>
    <points ref={points} frustumCulled={false}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[data.positions, 3]} />
        <bufferAttribute attach="attributes-color" args={[data.colors, 3]} />
      </bufferGeometry>
      <pointsMaterial ref={material} map={glowTexture} alphaTest={0.004} vertexColors size={Math.max(0.26, extent * (quality === "high" ? 0.0056 : 0.0047))} transparent opacity={0.9} sizeAttenuation depthWrite={false} fog={false} blending={THREE.AdditiveBlending} />
    </points>
    {quality === "high" && <pointLight position={[0, 0, extent * 0.08]} color="#ffd36e" intensity={82} distance={extent * 0.9} decay={2} />}
  </group>;
}

function ArtifactParticleEffect({ asset, transform, quality }: { asset: SceneAsset; transform: SceneTransform; quality: Quality }) {
  if (asset.id === "landscape-birds") return <LandscapeWaterParticles asset={asset} transform={transform} quality={quality} />;
  if (asset.id === "civilization-gate") return <SacredGateParticles asset={asset} transform={transform} quality={quality} />;
  if (["ancient-tree", "stage-two-gate", "stage-three-gate"].includes(asset.id)) return <ArtifactFireflies asset={asset} transform={transform} quality={quality} />;
  return null;
}

function disposeModel(root: THREE.Object3D) {
  const textures = new Set<THREE.Texture>();
  root.traverse((object) => {
    if (!(object instanceof THREE.Mesh)) return;
    object.geometry?.dispose();
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      Object.values(material).forEach((value) => { if (value instanceof THREE.Texture) textures.add(value); });
      material.dispose();
    });
  });
  textures.forEach((texture) => texture.dispose());
}

function SceneModel({ asset, transform, quality, editing, selected, onSelect, register, registerCollider, onCriticalAssetReady, onCriticalAssetError }: {
  asset: SceneAsset;
  transform: SceneTransform;
  quality: Quality;
  editing: boolean;
  selected: boolean;
  onSelect: (id: string) => void;
  register: (id: string, object: THREE.Group | null) => void;
  registerCollider: (id: string, object: THREE.Group | null) => void;
  onCriticalAssetReady: CriticalAssetReporter;
  onCriticalAssetError: CriticalAssetErrorReporter;
}) {
  const group = useRef<THREE.Group>(null);
  const motionGroup = useRef<THREE.Group>(null);
  const colliderGroup = useRef<THREE.Group>(null);
  const animationMixer = useRef<THREE.AnimationMixer | null>(null);
  const [model, setModel] = useState<THREE.Group | null>(null);
  const [collider, setCollider] = useState<THREE.Group | null>(null);
  const [failed, setFailed] = useState(false);
  const motion = SCENE_MOTIONS[asset.id] ?? "static";
  const motionIndex = SCENE_ASSETS.findIndex((item) => item.id === asset.id);
  const modelUrl = getSceneModelUrl(asset, quality);

  useFrame(({ clock }, delta) => {
    const target = motionGroup.current;
    if (!target) return;

    if (!editing) animationMixer.current?.update(delta);

    if (editing || motion === "static") {
      target.position.y = 0;
      target.rotation.y = 0;
      target.rotation.z = 0;
      return;
    }

    const transformScale = Math.max(...transform.scale.map((value) => Math.abs(value)), 0.001);
    const phaseOffset = Math.max(motionIndex, 0) * 0.73;
    const floatSpeed = motion === "rotate-z-float" ? 0.7 : 0.62;
    const worldAmplitude = motion === "rotate-z-float" ? 0.38 : 0.32;
    const targetY = Math.sin(clock.elapsedTime * floatSpeed + phaseOffset) * worldAmplitude / transformScale;
    target.position.y = THREE.MathUtils.damp(target.position.y, targetY, 4.8, delta);

    if (motion === "rotate-z-float") {
      const rotationSpeed = 0.065;
      target.rotation.y = 0;
      target.rotation.z = (target.rotation.z + delta * rotationSpeed) % (Math.PI * 2);
    } else {
      target.rotation.y = 0;
      target.rotation.z = 0;
    }
  });

  useEffect(() => {
    let disposed = false;
    let loaded: THREE.Group | null = null;
    let loadedMixer: THREE.AnimationMixer | null = null;
    setFailed(false);
    setModel(null);
    const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
    loader.load(modelUrl, (gltf) => {
      loaded = gltf.scene;
      const removable: THREE.Object3D[] = [];
      loaded.traverse((object) => {
        if (object instanceof THREE.Light || object instanceof THREE.Camera) removable.push(object);
        if (!(object instanceof THREE.Mesh)) return;
        object.frustumCulled = true;
        object.castShadow = false;
        object.receiveShadow = false;
      });
      removable.forEach((object) => object.parent?.remove(object));
      if (disposed) {
        disposeModel(loaded);
        return;
      }
      if (gltf.animations.length > 0) {
        loadedMixer = new THREE.AnimationMixer(loaded);
        gltf.animations.forEach((clip) => loadedMixer?.clipAction(clip).reset().setLoop(THREE.LoopRepeat, Infinity).play());
        animationMixer.current = loadedMixer;
      }
      setModel(loaded);
    }, undefined, () => {
      if (disposed) return;
      setFailed(true);
      if (CRITICAL_SCENE_ASSET_IDS.has(asset.id)) onCriticalAssetError(asset.name);
    });
    return () => {
      disposed = true;
      loadedMixer?.stopAllAction();
      if (loaded) loadedMixer?.uncacheRoot(loaded);
      if (animationMixer.current === loadedMixer) animationMixer.current = null;
      if (loaded) disposeModel(loaded);
    };
  }, [asset.id, asset.name, modelUrl, onCriticalAssetError]);

  useEffect(() => {
    if (editing || asset.id === "cave") {
      setCollider(null);
      return;
    }
    let disposed = false;
    let loaded: THREE.Group | null = null;
    const colliderUrl = asset.url.replace("/models/jinsha/", "/models/jinsha-colliders/");
    const loader = new GLTFLoader().setDRACOLoader(dracoLoader);
    loader.load(colliderUrl, (gltf) => {
      loaded = gltf.scene;
      loaded.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        object.frustumCulled = false;
        const materials = Array.isArray(object.material) ? object.material : [object.material];
        materials.forEach((material) => {
          material.side = THREE.DoubleSide;
          material.needsUpdate = true;
        });
      });
      if (disposed) disposeModel(loaded);
      else setCollider(loaded);
    });
    return () => {
      disposed = true;
      if (loaded) disposeModel(loaded);
    };
  }, [asset.id, asset.url, editing]);

  useEffect(() => {
    model?.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) material.envMapIntensity = quality === "high" ? 0.78 : 0.52;
        Object.values(material).forEach((value) => {
          if (value instanceof THREE.Texture) value.anisotropy = quality === "high" ? 4 : 1;
        });
      });
    });
  }, [model, quality]);

  const fit = useMemo(() => {
    if (!model) return null;
    model.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(model);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    const largestDimension = Math.max(size.x, size.y, size.z, 0.001);
    return { center, scale: asset.targetSize * 1.28 / largestDimension };
  }, [asset.targetSize, model]);

  useEffect(() => {
    if (!model || !fit || !CRITICAL_SCENE_ASSET_IDS.has(asset.id)) return;
    onCriticalAssetReady(asset.id as CriticalAssetId);
  }, [asset.id, fit, model, onCriticalAssetReady]);

  useEffect(() => {
    register(asset.id, group.current);
    return () => register(asset.id, null);
  }, [asset.id, register]);

  useEffect(() => {
    registerCollider(asset.id, collider && fit ? colliderGroup.current : null);
    return () => registerCollider(asset.id, null);
  }, [asset.id, collider, fit, registerCollider]);

  const select = (event: ThreeEvent<MouseEvent>) => {
    if (!editing) return;
    event.stopPropagation();
    onSelect(asset.id);
  };

  return <group
    ref={group}
    name={`editable-${asset.id}`}
    position={transform.position}
    rotation={transform.rotation}
    scale={transform.scale}
    onClick={select}
  >
    <group ref={motionGroup}>
      {model && fit && <group scale={fit.scale}>
        <primitive object={model} position={fit.center.clone().multiplyScalar(-1)} />
      </group>}
    </group>
    {collider && fit && <group ref={colliderGroup} visible={false} scale={fit.scale}>
      <primitive object={collider} position={fit.center.clone().multiplyScalar(-1)} />
    </group>}
    {editing && !model && !failed && <mesh>
      <octahedronGeometry args={[0.45, 0]} />
      <meshBasicMaterial color={selected ? "#ffd36e" : "#78a596"} wireframe transparent opacity={0.7} />
    </mesh>}
    {editing && failed && <mesh>
      <boxGeometry args={[0.7, 0.7, 0.7]} />
      <meshBasicMaterial color="#b8583c" wireframe />
    </mesh>}
  </group>;
}

const LINE_END_PUNCTUATION = new Set(Array.from("，。；：、！？,.!?;:）】》」』"));

function getArtifactCaptionLines(caption: string): string[] {
  const characters = Array.from(caption.trim());
  if (characters.length <= 36) return [characters.join("")];

  const target = Math.ceil(characters.length / 2);
  const minimumLineLength = Math.min(18, Math.floor(characters.length * 0.38));
  let bestIndex = target;
  let bestScore = Number.POSITIVE_INFINITY;

  for (let index = minimumLineLength; index <= characters.length - minimumLineLength; index += 1) {
    if (LINE_END_PUNCTUATION.has(characters[index - 1]) || LINE_END_PUNCTUATION.has(characters[index])) continue;
    const score = Math.abs(index - target) + Math.abs(index - (characters.length - index)) * 0.08;
    if (score < bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  }

  return [characters.slice(0, bestIndex).join(""), characters.slice(bestIndex).join("")];
}

function getArtifactContextStyle(lines: string[]): CSSProperties {
  const longestLine = Math.max(...lines.map((line) => Array.from(line).length), 18);
  const targetWidth = THREE.MathUtils.clamp(longestLine * 12.7, 230, 620);
  return { "--artifact-copy-width": `${Math.round(targetWidth)}px` } as CSSProperties;
}

function TransformGizmo({ target, mode, local, uniformScale, onChange }: {
  target: THREE.Object3D | null;
  mode: EditorMode;
  local: boolean;
  uniformScale: boolean;
  onChange: (object: THREE.Object3D) => void;
}) {
  const { camera, gl, scene } = useThree();
  const controls = useMemo(() => new TransformControls(camera, gl.domElement), [camera, gl.domElement]);
  const scaleAtDragStart = useRef(new THREE.Vector3(1, 1, 1));

  useEffect(() => {
    const helper = controls.getHelper();
    scene.add(helper);
    controls.setSize(0.96);
    controls.enabled = true;
    return () => {
      controls.detach();
      controls.dispose();
      scene.remove(helper);
    };
  }, [controls, scene]);

  useEffect(() => {
    controls.setMode(mode);
    controls.setSpace(local ? "local" : "world");
  }, [controls, local, mode]);

  useLayoutEffect(() => {
    controls.detach();
    if (target?.parent) controls.attach(target);
    return () => controls.detach();
  }, [controls, target]);

  useEffect(() => {
    const handleMouseDown = () => {
      if (controls.object) scaleAtDragStart.current.copy(controls.object.scale);
    };
    const handleChange = () => {
      if (!controls.object) return;
      if (mode === "scale" && uniformScale) {
        const start = scaleAtDragStart.current;
        const axis = controls.axis ?? "XYZ";
        const axisIndex = axis.includes("X") ? 0 : axis.includes("Y") ? 1 : 2;
        const startValue = start.getComponent(axisIndex);
        const currentValue = controls.object.scale.getComponent(axisIndex);
        const ratio = THREE.MathUtils.clamp(Math.abs(startValue) > 0.0001 ? currentValue / startValue : currentValue, 0.01, 100);
        controls.object.scale.set(start.x * ratio, start.y * ratio, start.z * ratio);
      }
      onChange(controls.object);
    };
    controls.addEventListener("mouseDown", handleMouseDown);
    controls.addEventListener("objectChange", handleChange);
    return () => {
      controls.removeEventListener("mouseDown", handleMouseDown);
      controls.removeEventListener("objectChange", handleChange);
    };
  }, [controls, mode, onChange, uniformScale]);

  return null;
}

function EditorHeadlight({ enabled }: { enabled: boolean }) {
  const light = useRef<THREE.PointLight>(null);
  useFrame(({ camera }) => {
    if (light.current) light.current.position.copy(camera.position);
  });
  return enabled ? <pointLight ref={light} color="#ffe0a0" intensity={115} distance={90} decay={1.45} /> : null;
}

function SceneAssetField({ progressRef, transforms, quality, editing, selectedId, editorMode, editorLocal, editorUniformScale, initialPrefetchEnabled, onSelect, onTransformChange, onColliderRegister, onCriticalAssetReady, onCriticalAssetError }: {
  progressRef: RefObject<number>;
  transforms: Record<string, SceneTransform>;
  quality: Quality;
  editing: boolean;
  selectedId: string | null;
  editorMode: EditorMode;
  editorLocal: boolean;
  editorUniformScale: boolean;
  initialPrefetchEnabled: boolean;
  onSelect: (id: string) => void;
  onTransformChange: (id: string, transform: SceneTransform) => void;
  onColliderRegister: (id: string, object: THREE.Group | null) => void;
  onCriticalAssetReady: CriticalAssetReporter;
  onCriticalAssetError: CriticalAssetErrorReporter;
}) {
  const [streamCenter, setStreamCenter] = useState(0);
  const [assetObjects, setAssetObjects] = useState<Record<string, THREE.Group>>({});

  useFrame(() => {
    if (Math.abs(progressRef.current - streamCenter) > 10) setStreamCenter(progressRef.current);
  });

  const register = useCallback((id: string, object: THREE.Group | null) => {
    setAssetObjects((current) => {
      if (object) return current[id] === object ? current : { ...current, [id]: object };
      if (!current[id]) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);

  const loadedAssets = SCENE_ASSETS.filter((asset) => {
    const distance = -transforms[asset.id].position[2];
    const offset = distance - streamCenter;
    const editorCenter = selectedId ? -transforms[selectedId].position[2] : streamCenter;
    if (editing) return Math.abs(distance - editorCenter) <= 175;
    const trailingDistance = quality === "high" ? 105 : 70;
    const caveStreamingWindow = streamCenter < 125;
    const initialLeadingDistance = quality === "high" ? 96 : 72;
    const leadingDistance = !initialPrefetchEnabled && streamCenter < 12
      ? initialLeadingDistance
      : caveStreamingWindow
        ? quality === "high" ? 210 : 220
        : quality === "high" ? 220 : 210;
    const keepInitialPrefetch = initialPrefetchEnabled
      && INITIAL_PREFETCH_SCENE_ASSET_IDS.has(asset.id)
      && offset >= -trailingDistance;
    return (offset >= -trailingDistance && offset <= leadingDistance)
      || keepInitialPrefetch
      || (streamCenter < 12 && (distance < initialLeadingDistance || CRITICAL_SCENE_ASSET_IDS.has(asset.id)));
  });
  const target = selectedId ? assetObjects[selectedId] ?? null : null;
  const captureTransform = useCallback((id: string, object: THREE.Object3D) => {
    onTransformChange(id, {
      position: object.position.toArray() as Vector3Tuple,
      rotation: [object.rotation.x, object.rotation.y, object.rotation.z],
      scale: object.scale.toArray() as Vector3Tuple,
    });
  }, [onTransformChange]);

  return <>
    {loadedAssets.map((asset) => <SceneModel
      key={`${quality}-${asset.id}`}
      asset={asset}
      transform={transforms[asset.id]}
      quality={quality}
      editing={editing}
      selected={selectedId === asset.id}
      onSelect={onSelect}
      register={register}
      registerCollider={onColliderRegister}
      onCriticalAssetReady={onCriticalAssetReady}
      onCriticalAssetError={onCriticalAssetError}
    />)}
    {!editing && loadedAssets.map((asset) => <ArtifactParticleEffect
      key={`particles-${quality}-${asset.id}`}
      asset={asset}
      transform={transforms[asset.id]}
      quality={quality}
    />)}
    {editing && <TransformGizmo
      target={target}
      mode={editorMode}
      local={editorLocal}
      uniformScale={editorUniformScale}
      onChange={(object) => { if (selectedId) captureTransform(selectedId, object); }}
    />}
  </>;
}

function SceneEditorPanel({ selectedId, transforms, mode, local, uniformScale, onSelect, onMode, onLocal, onUniformScale, onTransform, onReset, onClose }: {
  selectedId: string;
  transforms: Record<string, SceneTransform>;
  mode: EditorMode;
  local: boolean;
  uniformScale: boolean;
  onSelect: (id: string) => void;
  onMode: (mode: EditorMode) => void;
  onLocal: (local: boolean) => void;
  onUniformScale: (uniform: boolean) => void;
  onTransform: (id: string, transform: SceneTransform) => void;
  onReset: () => void;
  onClose: () => void;
}) {
  const asset = SCENE_ASSETS.find((item) => item.id === selectedId) ?? SCENE_ASSETS[0];
  const transform = transforms[asset.id];
  const values = mode === "translate" ? transform.position : mode === "rotate" ? transform.rotation.map(THREE.MathUtils.radToDeg) as Vector3Tuple : transform.scale;
  const precision = mode === "rotate" ? 1 : 3;
  const [draftValues, setDraftValues] = useState<[string, string, string]>(() => values.map((value) => String(Number(value.toFixed(precision)))) as [string, string, string]);

  useEffect(() => {
    setDraftValues(values.map((value) => String(Number(value.toFixed(precision)))) as [string, string, string]);
  }, [asset.id, mode, precision, values[0], values[1], values[2]]);

  const updateAxis = (axis: number, rawValue: string) => {
    if (rawValue.trim() === "") return;
    const value = Number(rawValue);
    if (!Number.isFinite(value)) return;
    const next: SceneTransform = {
      position: [...transform.position] as Vector3Tuple,
      rotation: [...transform.rotation] as Vector3Tuple,
      scale: [...transform.scale] as Vector3Tuple,
    };
    const key = mode === "translate" ? "position" : mode === "rotate" ? "rotation" : "scale";
    if (mode === "scale" && uniformScale) {
      const sourceValue = transform.scale[axis];
      const ratio = Math.abs(sourceValue) > 0.0001 ? value / sourceValue : value;
      next.scale = transform.scale.map((item) => Math.max(0.01, item * ratio)) as Vector3Tuple;
    } else {
      next[key][axis] = mode === "rotate" ? THREE.MathUtils.degToRad(value) : value;
    }
    onTransform(asset.id, next);
  };

  return <aside className="scene-editor" aria-label="场景整改面板">
    <header className="scene-editor__header">
      <div><small>SCENE REVISION</small><strong>场景整改</strong></div>
      <span>自动保存</span>
      <button type="button" onClick={onClose} aria-label="关闭场景整改">×</button>
    </header>
    <label className="scene-editor__select">
      <span>当前模型</span>
      <select value={asset.id} onChange={(event) => onSelect(event.target.value)}>
        {SCENE_ASSETS.map((item, index) => <option key={item.id} value={item.id}>{String(index + 1).padStart(2, "0")} · {item.name}</option>)}
      </select>
    </label>
    <div className="scene-editor__modes" role="group" aria-label="变换方式">
      {(["translate", "rotate", "scale"] as EditorMode[]).map((item) => <button type="button" key={item} className={mode === item ? "is-active" : ""} onClick={() => onMode(item)}>{item === "translate" ? "位移" : item === "rotate" ? "旋转" : "缩放"}</button>)}
    </div>
    {mode === "scale" && <div className="scene-editor__scale-options">
      <span>缩放联动</span>
      <button type="button" className={uniformScale ? "is-active" : ""} aria-pressed={uniformScale} onClick={() => onUniformScale(!uniformScale)}>
        <i aria-hidden="true" />等比缩放
      </button>
    </div>}
    <div className="scene-editor__coords">
      {(["X", "Y", "Z"] as const).map((axis, index) => <label key={axis} data-axis={axis.toLowerCase()}>
        <span>{axis}</span>
        <input
          type="number"
          min={mode === "scale" ? 0.01 : undefined}
          value={draftValues[index]}
          step={mode === "rotate" ? 1 : mode === "scale" ? 0.05 : 0.1}
          onChange={(event) => setDraftValues((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item) as [string, string, string])}
          onBlur={(event) => updateAxis(index, event.target.value)}
          onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }}
        />
      </label>)}
    </div>
    <footer className="scene-editor__footer">
      <button type="button" className={local ? "is-active" : ""} onClick={() => onLocal(!local)}>{local ? "局部坐标" : "世界坐标"}</button>
      <button type="button" onClick={onReset}>重置当前</button>
    </footer>
  </aside>;
}

function Xiyu({ playerRef, controls, started, entering, cruising, quality, onCriticalAssetReady }: { playerRef: RefObject<THREE.Group | null>; controls: RefObject<Controls>; started: boolean; entering: boolean; cruising: boolean; quality: Quality; onCriticalAssetReady: CriticalAssetReporter }) {
  const halo = useRef<THREE.Group>(null);
  const characterScale = useRef<THREE.Group>(null);
  const modelMotion = useRef<THREE.Group>(null);
  const motionPhase = useRef(0);
  const idlePhase = useRef(0);
  const cruiseBlend = useRef(1);
  const boostBlend = useRef(0);
  const gltf = useLoader(GLTFLoader, quality === "eco" ? "/models/xiyu-eco.glb" : "/models/xiyu-optimized.glb", (loader) => loader.setDRACOLoader(dracoLoader));
  const mixer = useMemo(() => new THREE.AnimationMixer(gltf.scene), [gltf.scene]);
  const animationClip = useMemo(() => {
    const source = gltf.animations[0];
    if (!source) return null;
    const clip = source.clone();
    const proceduralBones = ["Bone_004", "Bone_008", "Bone_015", "Bone_016"];
    clip.tracks = clip.tracks.filter((track) => !proceduralBones.some((name) => track.name.includes(name) && track.name.endsWith(".quaternion")));
    clip.resetDuration();
    return clip;
  }, [gltf.animations]);
  const rig = useMemo(() => {
    const findBone = (name: string) => {
      const object = gltf.scene.getObjectByName(name);
      return object instanceof THREE.Bone ? { bone: object, bindRotation: object.quaternion.clone() } : null;
    };
    return {
      leftLeg: findBone("Bone_004"),
      leftAnkle: findBone("Bone_003"),
      leftFoot: findBone("Bone_002"),
      rightLeg: findBone("Bone_008"),
      rightAnkle: findBone("Bone_007"),
      rightFoot: findBone("Bone_006"),
      capeLeft: findBone("Bone_015"),
      capeRight: findBone("Bone_016"),
    };
  }, [gltf.scene]);
  const proceduralRotation = useMemo(() => ({ euler: new THREE.Euler(), quaternion: new THREE.Quaternion() }), []);
  const modelFit = useMemo(() => {
    const bounds = new THREE.Box3().setFromObject(gltf.scene);
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    return { center, scale: 3.65 / Math.max(size.x, size.y, size.z) };
  }, [gltf.scene]);

  useEffect(() => {
    if (!animationClip) return;
    const action = mixer.clipAction(animationClip);
    action.zeroSlopeAtStart = true;
    action.zeroSlopeAtEnd = true;
    action.reset().setLoop(THREE.LoopRepeat, Infinity).fadeIn(0.35).play();
    return () => {
      action.fadeOut(0.2);
      mixer.stopAllAction();
    };
  }, [animationClip, mixer]);

  useEffect(() => {
    gltf.scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.frustumCulled = false;
      const materials = Array.isArray(object.material) ? object.material : [object.material];
      materials.forEach((material) => {
        if (material instanceof THREE.MeshStandardMaterial) {
          material.envMapIntensity = 0.72;
          material.needsUpdate = true;
        }
      });
    });
    onCriticalAssetReady("character");
  }, [gltf.scene, onCriticalAssetReady]);

  useFrame(({ size }, delta) => {
    const cruiseTarget = started && cruising ? 1 : 0;
    const boostTarget = controls.current.boost && cruising ? 1 : 0;
    cruiseBlend.current = THREE.MathUtils.damp(cruiseBlend.current, cruiseTarget, cruiseTarget ? 2.25 : 1.35, delta);
    boostBlend.current = THREE.MathUtils.damp(boostBlend.current, boostTarget, boostTarget ? 3.8 : 2.4, delta);
    const flightWeight = cruiseBlend.current;
    const boostWeight = boostBlend.current;
    mixer.update(delta * (0.38 + flightWeight * 0.62 + boostWeight * 0.55));
    const phaseSpeed = 1.2 + flightWeight * 2.9 + boostWeight * 2.1;
    motionPhase.current += delta * phaseSpeed;
    idlePhase.current += delta * 1.05;
    const phase = motionPhase.current;
    const idle = idlePhase.current;
    const idleWeight = 1 - flightWeight;
    const motionStrength = 0.22 + flightWeight * 0.78 + boostWeight * 0.35;
    const normalFlightWeight = flightWeight * (1 - boostWeight * 0.84);
    const legAmplitude = 0.15 * normalFlightWeight + 0.012 * idleWeight;
    const idleLegShift = Math.sin(idle * 1.34) * 0.018 * idleWeight;
    const boostLegPulse = Math.sin(phase * 1.72) * 0.018 * boostWeight;
    const boostLegTuck = -0.17 * boostWeight;
    const leftSwing = (Math.sin(phase) + Math.sin(phase * 2 + 0.45) * 0.13) * legAmplitude + idleLegShift + boostLegTuck + boostLegPulse;
    const rightSwing = (Math.sin(phase + Math.PI) + Math.sin(phase * 2 + 1.15) * 0.13) * legAmplitude - idleLegShift * 0.72 + boostLegTuck - boostLegPulse * 0.68;
    const stepStrength = motionStrength * (1 - boostWeight * 0.82);
    const leftStep = (0.5 + Math.sin(phase - 0.55) * 0.5) * 0.085 * stepStrength + boostWeight * 0.052;
    const rightStep = (0.5 + Math.sin(phase + Math.PI - 0.55) * 0.5) * 0.085 * stepStrength + boostWeight * 0.052;
    const capeLift = 0.018 + flightWeight * 0.067 + boostWeight * 0.045;
    const boostCapeFlutter = Math.sin(phase * 3.42 + 0.35) * 0.034 * boostWeight;
    const capeWave = Math.sin(phase * 1.32) * 0.075 * motionStrength + Math.sin(idle * 1.08) * 0.024 * idleWeight + boostCapeFlutter;
    const capeRipple = Math.sin(phase * 2.37 + 0.8) * 0.035 * motionStrength + Math.sin(idle * 1.73 + 0.4) * 0.014 * idleWeight + Math.sin(phase * 4.1) * 0.018 * boostWeight;
    const applyRotation = (joint: { bone: THREE.Bone; bindRotation: THREE.Quaternion } | null, x: number, y: number, z: number) => {
      if (!joint) return;
      proceduralRotation.euler.set(x, y, z, "XYZ");
      proceduralRotation.quaternion.setFromEuler(proceduralRotation.euler);
      joint.bone.quaternion.copy(joint.bindRotation).multiply(proceduralRotation.quaternion);
    };
    applyRotation(rig.leftLeg, leftSwing, 0, leftSwing * 0.08);
    applyRotation(rig.rightLeg, rightSwing, 0, -rightSwing * 0.08);
    applyRotation(rig.leftAnkle, -leftSwing * 0.38 + leftStep, 0, 0);
    applyRotation(rig.rightAnkle, -rightSwing * 0.38 + rightStep, 0, 0);
    applyRotation(rig.leftFoot, -leftStep * 0.72, 0, 0);
    applyRotation(rig.rightFoot, -rightStep * 0.72, 0, 0);
    applyRotation(rig.capeLeft, -capeLift + capeRipple, capeWave * 0.18, capeWave);
    applyRotation(rig.capeRight, -capeLift - capeRipple, -capeWave * 0.18, -capeWave * 0.88);
    if (modelMotion.current) {
      const idleBob = (Math.sin(idle) + Math.sin(idle * 0.47 + 0.8) * 0.34) * 0.045 * idleWeight;
      const idleBreath = 1 + Math.sin(idle * 0.86) * 0.006 * idleWeight;
      modelMotion.current.position.y = THREE.MathUtils.damp(modelMotion.current.position.y, idleBob, 3.1, delta);
      modelMotion.current.rotation.x = THREE.MathUtils.damp(modelMotion.current.rotation.x, Math.sin(idle * 0.72) * 0.018 * idleWeight - boostWeight * 0.105, 3.6, delta);
      modelMotion.current.rotation.y = THREE.MathUtils.damp(modelMotion.current.rotation.y, Math.PI + Math.sin(idle * 0.53) * 0.025 * idleWeight, 3, delta);
      modelMotion.current.rotation.z = THREE.MathUtils.damp(modelMotion.current.rotation.z, Math.sin(idle * 0.64 + 0.9) * 0.025 * idleWeight + Math.sin(phase * 1.4) * 0.012 * boostWeight, 3.4, delta);
      const modelScale = modelFit.scale * idleBreath * (1 - boostWeight * 0.025);
      modelMotion.current.scale.setScalar(THREE.MathUtils.damp(modelMotion.current.scale.x, modelScale, 3.2, delta));
    }
    if (halo.current) {
      halo.current.rotation.z = (halo.current.rotation.z + delta * (0.1 + flightWeight * 0.18 + boostWeight * 0.44)) % (Math.PI * 2);
      const haloScale = size.width <= 720 ? 0.9 : 1.18;
      halo.current.scale.setScalar(THREE.MathUtils.damp(halo.current.scale.x, haloScale * (1 + boostWeight * 0.12), 3.6, delta));
    }
    if (characterScale.current) {
      const viewportScale = size.width <= 720 ? 0.72 : 0.88;
      const targetScale = started ? viewportScale : entering ? viewportScale * 0.82 : viewportScale * 0.74;
      characterScale.current.scale.setScalar(THREE.MathUtils.damp(characterScale.current.scale.x, targetScale, entering ? 2.8 : 3.4, delta));
    }
    if (playerRef.current) {
      playerRef.current.position.z = THREE.MathUtils.damp(playerRef.current.position.z, started ? 0 : entering ? -2 : -2.6, entering ? 2.8 : 3.4, delta);
    }
  });
  return (
    <group ref={playerRef}>
      <group ref={characterScale} scale={0.74}>
        <group ref={modelMotion} scale={modelFit.scale} rotation={[0, Math.PI, 0]}>
          <primitive object={gltf.scene} position={modelFit.center.clone().multiplyScalar(-1)} />
        </group>
      </group>
      <group ref={halo}>
        {!started && <>
          {[0, 1, 2, 3].map((index) => <mesh key={index} rotation={[0, 0, index * Math.PI / 2]}><torusGeometry args={[3.05, 0.018, 6, 48, Math.PI * 0.29]} /><meshBasicMaterial color={index % 2 ? "#9bc8c4" : "#d8a94a"} transparent opacity={0.72} /></mesh>)}
          <IntroSunbirds />
        </>}
      </group>
      {quality === "high" && <pointLight position={[0, 0.35, 1.6]} color="#f3c666" intensity={18} distance={11} />}
    </group>
  );
}

function FlightScene({ started, entering, paused, cruising, quality, controls, resetKey, transforms, editing, selectedId, editorMode, editorLocal, editorUniformScale, initialPrefetchEnabled, onSelect, onTransformChange, onTelemetry, onCriticalAssetReady, onCriticalAssetError }: {
  started: boolean;
  entering: boolean;
  paused: boolean;
  cruising: boolean;
  quality: Quality;
  controls: RefObject<Controls>;
  resetKey: number;
  transforms: Record<string, SceneTransform>;
  editing: boolean;
  selectedId: string | null;
  editorMode: EditorMode;
  editorLocal: boolean;
  editorUniformScale: boolean;
  initialPrefetchEnabled: boolean;
  onSelect: (id: string) => void;
  onTransformChange: (id: string, transform: SceneTransform) => void;
  onTelemetry: (telemetry: Telemetry) => void;
  onCriticalAssetReady: CriticalAssetReporter;
  onCriticalAssetError: CriticalAssetErrorReporter;
}) {
  const { gl } = useThree();
  const world = useRef<THREE.Group>(null);
  const player = useRef<THREE.Group>(null);
  const progress = useRef(0);
  const lateral = useRef(new THREE.Vector2(0, 0));
  const velocity = useRef(new THREE.Vector2(0, 0));
  const colliderObjects = useRef<Record<string, { object: THREE.Group; bounds: THREE.Box3 }>>({});
  const cameraCollisionDistance = useRef(12);
  const cameraCollisionTargetDistance = useRef(12);
  const cameraCollisionHold = useRef(0);
  const forwardMotion = useRef(1);
  const forwardBoost = useRef(0);
  const wasStarted = useRef(started);
  const lastReport = useRef(0);
  const backgroundTarget = useMemo(() => new THREE.Color(ATMOSPHERE_COLORS[0]), []);
  const fogTarget = useMemo(() => new THREE.Color(FOG_COLORS[0]), []);
  const editorFocus = useMemo(() => ({ target: new THREE.Vector3(), camera: new THREE.Vector3(), lookAt: new THREE.Vector3() }), []);
  const editorOrbitOffset = useMemo(() => new THREE.Vector3(), []);
  const editorOrbitRight = useMemo(() => new THREE.Vector3(), []);
  const flightLookTarget = useMemo(() => new THREE.Vector3(), []);
  const collisionRaycaster = useMemo(() => new THREE.Raycaster(), []);
  const collisionOrigin = useMemo(() => new THREE.Vector3(), []);
  const collisionMotion = useMemo(() => new THREE.Vector3(), []);
  const collisionDirection = useMemo(() => new THREE.Vector3(), []);
  const collisionBasisU = useMemo(() => new THREE.Vector3(), []);
  const collisionBasisV = useMemo(() => new THREE.Vector3(), []);
  const collisionBoxCenter = useMemo(() => new THREE.Vector3(), []);
  const collisionSlideNormal = useMemo(() => new THREE.Vector3(), []);
  const cameraAnchor = useMemo(() => new THREE.Vector3(), []);
  const cameraDesired = useMemo(() => new THREE.Vector3(), []);
  const cameraResolved = useMemo(() => new THREE.Vector3(), []);
  const cameraMotion = useMemo(() => new THREE.Vector3(), []);
  const caveCandidate = useMemo(() => new THREE.Vector2(), []);
  const visualLateral = useMemo(() => new THREE.Vector2(), []);
  const caveViewTilt = useRef(new THREE.Vector2());
  const caveRailActive = useRef(false);
  const caveDprReduced = useRef(false);
  const collisionUp = useMemo(() => new THREE.Vector3(0, 1, 0), []);
  const collisionSide = useMemo(() => new THREE.Vector3(1, 0, 0), []);
  const prefersReducedMotion = useMemo(() => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches, []);
  const editorOrbit = useRef({ yaw: -1.12, pitch: 0.12, zoom: 1, dragging: false, pointerId: -1, x: 0, y: 0 });

  const registerCollider = useCallback((id: string, object: THREE.Group | null) => {
    if (object) {
      object.updateWorldMatrix(true, true);
      const bounds = new THREE.Box3().setFromObject(object);
      bounds.min.z -= progress.current;
      bounds.max.z -= progress.current;
      colliderObjects.current[id] = { object, bounds };
    }
    else delete colliderObjects.current[id];
  }, []);

  const normalPixelRatio = useMemo(() => {
    const devicePixelRatio = typeof window === "undefined" ? 1 : window.devicePixelRatio || 1;
    return quality === "high"
      ? THREE.MathUtils.clamp(devicePixelRatio, 0.9, 1.35)
      : THREE.MathUtils.clamp(devicePixelRatio, 0.6, 0.85);
  }, [quality]);
  const cavePixelRatio = useMemo(() => Math.max(
    quality === "high" ? 0.78 : 0.55,
    normalPixelRatio * (quality === "high" ? 0.78 : 0.8),
  ), [normalPixelRatio, quality]);

  useEffect(() => {
    caveDprReduced.current = false;
    gl.setPixelRatio(normalPixelRatio);
    return () => gl.setPixelRatio(normalPixelRatio);
  }, [gl, normalPixelRatio]);

  const findCollision = useCallback((
    origin: THREE.Vector3,
    motion: THREE.Vector3,
    excludedIds: ReadonlySet<string>,
    radius = PLAYER_COLLISION_RADIUS,
    allowEscapeFromBounds = false,
  ): CollisionHit | null => {
    const motionLength = motion.length();
    if (motionLength < 0.0001) return null;
    collisionDirection.copy(motion).multiplyScalar(1 / motionLength);
    collisionBasisU.crossVectors(
      collisionDirection,
      Math.abs(collisionDirection.dot(collisionUp)) > 0.92 ? collisionSide : collisionUp,
    ).normalize();
    collisionBasisV.crossVectors(collisionDirection, collisionBasisU).normalize();
    let closestHit: CollisionHit | null = null;
    const rayCount = quality === "high" ? 9 : 5;
    for (let rayIndex = 0; rayIndex < rayCount; rayIndex += 1) {
      collisionOrigin.copy(origin);
      let forwardExtent = radius;
      if (rayIndex > 0) {
        const angle = (rayIndex - 1) * Math.PI * 2 / (rayCount - 1);
        collisionOrigin.addScaledVector(collisionBasisU, Math.cos(angle) * radius);
        collisionOrigin.addScaledVector(collisionBasisV, Math.sin(angle) * radius);
        forwardExtent = 0;
      }
      collisionRaycaster.set(collisionOrigin, collisionDirection);
      collisionRaycaster.near = 0.001;
      collisionRaycaster.far = motionLength + forwardExtent + COLLISION_SKIN;

      for (const asset of SCENE_ASSETS) {
        if (excludedIds.has(asset.id)) continue;
        const collider = colliderObjects.current[asset.id];
        if (!collider) continue;
        const bounds = collider.bounds;
        const worldMinZ = bounds.min.z + progress.current;
        const worldMaxZ = bounds.max.z + progress.current;
        if (allowEscapeFromBounds
          && origin.x >= bounds.min.x && origin.x <= bounds.max.x
          && origin.y >= bounds.min.y && origin.y <= bounds.max.y
          && origin.z >= worldMinZ && origin.z <= worldMaxZ) {
          bounds.getCenter(collisionBoxCenter);
          collisionBoxCenter.z += progress.current;
          const nextX = origin.x + motion.x;
          const nextY = origin.y + motion.y;
          const currentDistance = Math.hypot(origin.x - collisionBoxCenter.x, origin.y - collisionBoxCenter.y);
          const nextDistance = Math.hypot(nextX - collisionBoxCenter.x, nextY - collisionBoxCenter.y);
          if (nextDistance > currentDistance + 0.0001) continue;
        }
        const nextX = origin.x + motion.x;
        const nextY = origin.y + motion.y;
        const nextZ = origin.z + motion.z;
        if (Math.max(origin.x, nextX) + radius < bounds.min.x || Math.min(origin.x, nextX) - radius > bounds.max.x) continue;
        if (Math.max(origin.y, nextY) + radius < bounds.min.y || Math.min(origin.y, nextY) - radius > bounds.max.y) continue;
        if (Math.max(origin.z, nextZ) + radius < worldMinZ || Math.min(origin.z, nextZ) - radius > worldMaxZ) continue;

        const intersection = collisionRaycaster.intersectObject(collider.object, true)[0];
        if (!intersection) continue;
        const travelDistance = Math.max(0, intersection.distance - forwardExtent);
        if (travelDistance > motionLength + COLLISION_SKIN || (closestHit && travelDistance >= closestHit.distance)) continue;
        const normal = intersection.face
          ? intersection.face.normal.clone().applyNormalMatrix(new THREE.Matrix3().getNormalMatrix(intersection.object.matrixWorld)).normalize()
          : collisionDirection.clone().negate();
        if (normal.dot(collisionDirection) > 0) normal.negate();
        closestHit = { distance: travelDistance, normal, assetId: asset.id };
      }
    }
    return closestHit;
  }, [collisionBasisU, collisionBasisV, collisionBoxCenter, collisionDirection, collisionOrigin, collisionRaycaster, collisionSide, collisionUp, quality]);

  const lockToCaveTrack = useCallback((point: THREE.Vector2, routeProgress: number) => {
    const transform = transforms.cave;
    const caveAsset = SCENE_ASSETS.find((asset) => asset.id === "cave");
    if (!transform || !caveAsset) return false;
    const modelScale = Math.max(...transform.scale.map((value) => Math.abs(value)));
    const scaleFactor = THREE.MathUtils.clamp(Math.sqrt(modelScale / 5), 0.72, 1.55);
    const centerProgress = -transform.position[2];
    const halfDepth = caveAsset.targetSize * 1.28 * modelScale * 0.58;
    const start = centerProgress - halfDepth;
    const physicalEnd = centerProgress + halfDepth;
    const unlockLead = THREE.MathUtils.clamp(halfDepth * 0.6, 40, 50);
    const lockEnd = physicalEnd - unlockLead;
    if (routeProgress < start || routeProgress > lockEnd) return false;

    const tunnelProgress = THREE.MathUtils.clamp((routeProgress - start) / Math.max(0.001, physicalEnd - start), 0, 1);
    const arch = Math.pow(Math.sin(tunnelProgress * Math.PI), 0.62);
    const middleBend = THREE.MathUtils.smoothstep(tunnelProgress, 0.4, 0.6);
    const floor = transform.position[1] + (0.18 - arch * 0.18) * scaleFactor;
    const ceiling = transform.position[1] + (7.8 + arch * 4.5) * scaleFactor;
    point.x = transform.position[0] + (CAVE_TRACK_OFFSET[0] - middleBend * 1.2) * scaleFactor;
    point.y = (floor + ceiling) * 0.5 - (7.2 + middleBend * 0.7) * scaleFactor + CAVE_TRACK_OFFSET[1] * scaleFactor;
    return true;
  }, [transforms]);

  useEffect(() => {
    if (!editing) return;
    editorOrbit.current.yaw = -1.12;
    editorOrbit.current.pitch = 0.12;
    editorOrbit.current.zoom = 1;
    editorOrbit.current.dragging = false;
  }, [editing, selectedId]);

  useEffect(() => {
    if (!editing) return;
    const canvas = gl.domElement;
    const orbit = editorOrbit.current;
    const handleWheel = (event: WheelEvent) => {
      event.preventDefault();
      orbit.zoom = THREE.MathUtils.clamp(orbit.zoom * Math.exp(event.deltaY * 0.00125), 0.32, 4.5);
    };
    const handlePointerDown = (event: PointerEvent) => {
      if (event.button !== 1) return;
      event.preventDefault();
      orbit.dragging = true;
      orbit.pointerId = event.pointerId;
      orbit.x = event.clientX;
      orbit.y = event.clientY;
      canvas.setPointerCapture?.(event.pointerId);
      canvas.style.cursor = "grabbing";
    };
    const handlePointerMove = (event: PointerEvent) => {
      if (!orbit.dragging || event.pointerId !== orbit.pointerId) return;
      const deltaX = event.clientX - orbit.x;
      const deltaY = event.clientY - orbit.y;
      orbit.x = event.clientX;
      orbit.y = event.clientY;
      orbit.yaw -= deltaX * 0.0075;
      orbit.pitch = THREE.MathUtils.clamp(orbit.pitch + deltaY * 0.006, -1.22, 1.22);
    };
    const endOrbit = (event: PointerEvent) => {
      if (event.pointerId !== orbit.pointerId) return;
      orbit.dragging = false;
      orbit.pointerId = -1;
      if (canvas.hasPointerCapture?.(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
      canvas.style.cursor = "";
    };
    canvas.addEventListener("wheel", handleWheel, { passive: false });
    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointermove", handlePointerMove);
    canvas.addEventListener("pointerup", endOrbit);
    canvas.addEventListener("pointercancel", endOrbit);
    return () => {
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", endOrbit);
      canvas.removeEventListener("pointercancel", endOrbit);
      canvas.style.cursor = "";
    };
  }, [editing, gl.domElement]);

  useEffect(() => {
    progress.current = 0;
    lateral.current.set(0, 0);
    velocity.current.set(0, 0);
    caveViewTilt.current.set(0, 0);
    caveRailActive.current = false;
    forwardMotion.current = 1;
    forwardBoost.current = 0;
    cameraCollisionDistance.current = 12;
    cameraCollisionTargetDistance.current = 12;
    cameraCollisionHold.current = 0;
    onTelemetry({ progress: 0, lateral: [0, 0], stage: 0, artifactId: null, finished: false });
  }, [resetKey, onTelemetry]);

  useFrame((state, delta) => {
    const input = controls.current;
    const isMobileViewport = state.size.width <= 720;
    const opticalCenterX = isMobileViewport ? 0 : -0.17;
    if (state.camera instanceof THREE.PerspectiveCamera) {
      const collisionCompression = THREE.MathUtils.clamp((9 - cameraCollisionDistance.current) / 6.5, 0, 1);
      const targetFov = editing ? 32 : 60 + collisionCompression * 3.2 + forwardBoost.current * 2.4;
      const nextFov = THREE.MathUtils.damp(state.camera.fov, targetFov, 7.5, delta);
      if (Math.abs(nextFov - state.camera.fov) > 0.001) {
        state.camera.fov = nextFov;
        state.camera.updateProjectionMatrix();
      }
    }
    if (started && !wasStarted.current) {
      progress.current = 0;
      lateral.current.set(0, 0);
      velocity.current.set(0, 0);
      forwardMotion.current = 1;
      forwardBoost.current = 0;
      cameraCollisionDistance.current = 12;
      cameraCollisionTargetDistance.current = 12;
      cameraCollisionHold.current = 0;
      if (world.current) world.current.position.z = 0;
      if (player.current) {
        player.current.position.x = opticalCenterX;
        player.current.position.y = 0;
        player.current.rotation.set(0, 0, 0);
      }
      state.camera.position.x = 0;
    }
    wasStarted.current = started;
    const forwardTarget = started && !paused && cruising ? 1 : 0;
    const boostTarget = forwardTarget && input.boost ? 1 : 0;
    forwardMotion.current = THREE.MathUtils.damp(forwardMotion.current, forwardTarget, forwardTarget ? 2.1 : 1.15, delta);
    forwardBoost.current = THREE.MathUtils.damp(forwardBoost.current, boostTarget, boostTarget ? 3.8 : 2.2, delta);
    const horizontalLimit = isMobileViewport ? 42 : 72;
    const verticalLimit = isMobileViewport ? 32 : 45;
    caveCandidate.copy(lateral.current);
    let caveLocked = started && lockToCaveTrack(caveCandidate, progress.current);
    caveRailActive.current = caveLocked;
    if (caveLocked) lateral.current.copy(caveCandidate);
    if (started && !paused && progress.current < ROUTE_LENGTH) {
      // Stopping must lock route progress immediately. The smoothed blend is
      // kept for the visual restart, but W/S remain vertical-only while stopped.
      const speed = cruising
        ? (prefersReducedMotion ? 3.2 : 5.8) * (1 + forwardBoost.current * 0.82) * forwardMotion.current
        : 0;
      const xAxis = THREE.MathUtils.clamp((input.right ? 1 : 0) - (input.left ? 1 : 0) + input.touchX, -1, 1);
      const yAxis = THREE.MathUtils.clamp((input.up ? 1 : 0) - (input.down ? 1 : 0) + input.touchY, -1, 1);
      caveViewTilt.current.x = THREE.MathUtils.damp(caveViewTilt.current.x, caveLocked ? xAxis : 0, caveLocked ? 5.2 : 3.8, delta);
      caveViewTilt.current.y = THREE.MathUtils.damp(caveViewTilt.current.y, caveLocked ? yAxis : 0, caveLocked ? 5.2 : 3.8, delta);

      if (caveLocked) {
        velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, 14, delta);
        velocity.current.y = THREE.MathUtils.damp(velocity.current.y, 0, 14, delta);
      } else {
        const acceleration = input.boost ? 24 : 17;
        velocity.current.x += xAxis * acceleration * delta;
        velocity.current.y += yAxis * acceleration * 0.76 * delta;
        velocity.current.x = THREE.MathUtils.damp(velocity.current.x, 0, xAxis === 0 ? 3.2 : 1.05, delta);
        velocity.current.y = THREE.MathUtils.damp(velocity.current.y, 0, yAxis === 0 ? 3.4 : 1.15, delta);
        velocity.current.x = THREE.MathUtils.clamp(velocity.current.x, input.boost ? -7.2 : -5.4, input.boost ? 7.2 : 5.4);
        velocity.current.y = THREE.MathUtils.clamp(velocity.current.y, input.boost ? -5.3 : -4.1, input.boost ? 5.3 : 4.1);
      }
      const intendedX = caveLocked ? lateral.current.x : THREE.MathUtils.clamp(lateral.current.x + velocity.current.x * delta, -horizontalLimit, horizontalLimit);
      const intendedY = caveLocked ? lateral.current.y : THREE.MathUtils.clamp(lateral.current.y + velocity.current.y * delta, -verticalLimit, verticalLimit);

      if (!caveLocked) {
        collisionOrigin.set(lateral.current.x, lateral.current.y, 0);
        collisionMotion.set(intendedX - lateral.current.x, intendedY - lateral.current.y, 0);
        for (let slidePass = 0; slidePass < 3 && collisionMotion.lengthSq() > 0.000001; slidePass += 1) {
          const hit = findCollision(collisionOrigin, collisionMotion, CAVE_COLLISION_EXCLUSIONS, PLAYER_COLLISION_RADIUS, true);
          if (!hit) {
            collisionOrigin.add(collisionMotion);
            collisionMotion.set(0, 0, 0);
            break;
          }
          const remainingLength = collisionMotion.length();
          collisionDirection.copy(collisionMotion).multiplyScalar(1 / remainingLength);
          const safeDistance = THREE.MathUtils.clamp(hit.distance - COLLISION_SKIN, 0, remainingLength);
          collisionOrigin.addScaledVector(collisionDirection, safeDistance);
          collisionSlideNormal.copy(hit.normal).setZ(0);
          if (collisionSlideNormal.lengthSq() < 0.0001) break;
          collisionSlideNormal.normalize();
          collisionOrigin.addScaledVector(collisionSlideNormal, COLLISION_SKIN * 0.45);
          collisionMotion.copy(collisionDirection).multiplyScalar(Math.max(0, remainingLength - safeDistance));
          const intoSurface = collisionMotion.dot(collisionSlideNormal);
          if (intoSurface < 0) collisionMotion.addScaledVector(collisionSlideNormal, -intoSurface);
          const velocityIntoSurface = velocity.current.x * collisionSlideNormal.x + velocity.current.y * collisionSlideNormal.y;
          if (velocityIntoSurface < 0) {
            velocity.current.x -= collisionSlideNormal.x * velocityIntoSurface;
            velocity.current.y -= collisionSlideNormal.y * velocityIntoSurface;
          }
        }
        lateral.current.set(
          THREE.MathUtils.clamp(collisionOrigin.x, -horizontalLimit, horizontalLimit),
          THREE.MathUtils.clamp(collisionOrigin.y, -verticalLimit, verticalLimit),
        );
      }

      const forwardDistance = Math.min(ROUTE_LENGTH - progress.current, Math.max(0, speed * delta));
      if (forwardDistance > 0.002) {
        if (caveLocked) progress.current += forwardDistance;
        else {
          collisionOrigin.set(lateral.current.x, lateral.current.y, 0);
          collisionMotion.set(0, 0, -forwardDistance);
          const hit = findCollision(collisionOrigin, collisionMotion, FORWARD_COLLISION_EXCLUSIONS, PLAYER_COLLISION_RADIUS);
          if (!hit) progress.current += forwardDistance;
          else {
            const safeDistance = THREE.MathUtils.clamp(hit.distance - COLLISION_SKIN, 0, forwardDistance);
            progress.current += safeDistance;
            collisionSlideNormal.copy(hit.normal).setZ(0);
            if (collisionSlideNormal.lengthSq() < 0.015) {
              const collider = colliderObjects.current[hit.assetId];
              collider?.bounds.getCenter(collisionBoxCenter);
              const preferredSide = collider
                ? Math.sign(lateral.current.x - collisionBoxCenter.x || velocity.current.x || 1)
                : Math.sign(velocity.current.x || 1);
              collisionSlideNormal.set(preferredSide, 0, 0);
            } else collisionSlideNormal.normalize();
            const blockedDistance = Math.max(0, forwardDistance - safeDistance);
            const separation = THREE.MathUtils.clamp(0.018 + blockedDistance * 0.75, 0.018, 0.11);
            lateral.current.x = THREE.MathUtils.clamp(lateral.current.x + collisionSlideNormal.x * separation, -horizontalLimit, horizontalLimit);
            lateral.current.y = THREE.MathUtils.clamp(lateral.current.y + collisionSlideNormal.y * separation, -verticalLimit, verticalLimit);
          }
        }
      }
    }
    caveCandidate.copy(lateral.current);
    caveLocked = started && lockToCaveTrack(caveCandidate, progress.current);
    caveRailActive.current = caveLocked;
    if (caveLocked) lateral.current.copy(caveCandidate);
    else {
      caveViewTilt.current.x = THREE.MathUtils.damp(caveViewTilt.current.x, 0, 3.8, delta);
      caveViewTilt.current.y = THREE.MathUtils.damp(caveViewTilt.current.y, 0, 3.8, delta);
    }
    const shouldReduceCaveDpr = started && !editing && progress.current < 155;
    if (shouldReduceCaveDpr !== caveDprReduced.current) {
      gl.setPixelRatio(shouldReduceCaveDpr ? cavePixelRatio : normalPixelRatio);
      caveDprReduced.current = shouldReduceCaveDpr;
    }
    if (world.current) {
      world.current.position.z = progress.current;
    }
    if (player.current) {
      visualLateral.set(
        THREE.MathUtils.damp(player.current.position.x - opticalCenterX, lateral.current.x, 9, delta),
        THREE.MathUtils.damp(player.current.position.y, lateral.current.y + Math.sin(state.clock.elapsedTime * 1.4) * 0.1, 9, delta),
      );
      player.current.position.x = visualLateral.x + opticalCenterX;
      player.current.position.y = visualLateral.y;
      const visualBankX = caveRailActive.current ? caveViewTilt.current.x * 0.34 : velocity.current.x;
      const visualBankY = caveRailActive.current ? caveViewTilt.current.y * 0.34 : velocity.current.y;
      player.current.rotation.z = THREE.MathUtils.damp(player.current.rotation.z, -visualBankX * 0.095, 5.2, delta);
      player.current.rotation.x = THREE.MathUtils.damp(player.current.rotation.x, -visualBankY * 0.07 - forwardBoost.current * 0.12, 5.2, delta);
      player.current.rotation.y = THREE.MathUtils.damp(player.current.rotation.y, visualBankX * 0.024, 4.2, delta);
    }
    const selectedAsset = editing && selectedId ? SCENE_ASSETS.find((asset) => asset.id === selectedId) : null;
    const selectedTransform = selectedAsset ? transforms[selectedAsset.id] : null;
    if (selectedAsset && selectedTransform) {
      const modelScale = Math.max(...selectedTransform.scale.map(Math.abs));
      const framedSize = selectedAsset.targetSize * 1.28 * modelScale;
      const orbit = editorOrbit.current;
      const baseDistance = Math.max(300, framedSize * 3.8);
      const distance = baseDistance * orbit.zoom;
      const horizontalDistance = Math.cos(orbit.pitch) * distance;
      editorFocus.target.set(selectedTransform.position[0], selectedTransform.position[1], selectedTransform.position[2] + progress.current);
      editorOrbitOffset.set(Math.sin(orbit.yaw) * horizontalDistance, Math.sin(orbit.pitch) * distance, Math.cos(orbit.yaw) * horizontalDistance);
      editorOrbitRight.set(Math.cos(orbit.yaw), 0, -Math.sin(orbit.yaw));
      editorFocus.camera.copy(editorFocus.target).add(editorOrbitOffset);
      editorFocus.lookAt.copy(editorFocus.target).addScaledVector(editorOrbitRight, framedSize * 0.35);
      state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, editorFocus.camera.x, 7.5, delta);
      state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, editorFocus.camera.y, 7.5, delta);
      state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, editorFocus.camera.z, 7.5, delta);
      state.camera.lookAt(editorFocus.lookAt);
    } else {
      const entryComposition = started ? THREE.MathUtils.smoothstep(progress.current, 3, 32) : entering ? 0 : 1;
      const cameraBaseY = THREE.MathUtils.lerp(0.35, 2.6, entryComposition);
      const movementLead = isMobileViewport ? 0.018 : 0.026;
      const cameraLeadX = caveRailActive.current ? 0 : velocity.current.x * movementLead;
      const cameraLeadY = caveRailActive.current ? 0 : velocity.current.y * movementLead * 0.72;
      cameraAnchor.set(lateral.current.x, lateral.current.y + 0.35, 0.2);
      cameraDesired.set(
        lateral.current.x + cameraLeadX,
        cameraBaseY + lateral.current.y + cameraLeadY,
        11 + forwardBoost.current * 1.6,
      );
      cameraMotion.copy(cameraDesired).sub(cameraAnchor);
      const cameraMotionLength = cameraMotion.length();
      const cameraHit = caveRailActive.current ? null : findCollision(
        cameraAnchor,
        cameraMotion,
        CAMERA_COLLISION_EXCLUSIONS,
        CAMERA_COLLISION_RADIUS,
      );
      const rawPermittedCameraDistance = cameraHit
        ? THREE.MathUtils.clamp(cameraHit.distance - COLLISION_SKIN, 0.12, cameraMotionLength)
        : cameraMotionLength;
      const permittedCameraDistance = cameraHit
        ? Math.max(rawPermittedCameraDistance, cameraMotionLength - CAMERA_MAX_COMPRESSION)
        : cameraMotionLength;
      if (cameraHit) {
        cameraCollisionTargetDistance.current = Math.min(cameraCollisionTargetDistance.current, permittedCameraDistance);
        cameraCollisionHold.current = CAMERA_COLLISION_HOLD_SECONDS;
      } else if (cameraCollisionHold.current > 0) {
        cameraCollisionHold.current = Math.max(0, cameraCollisionHold.current - delta);
      } else {
        cameraCollisionTargetDistance.current = THREE.MathUtils.damp(
          cameraCollisionTargetDistance.current,
          permittedCameraDistance,
          2.4,
          delta,
        );
      }
      cameraCollisionTargetDistance.current = THREE.MathUtils.clamp(
        cameraCollisionTargetDistance.current,
        0.12,
        cameraMotionLength,
      );
      const previousCameraDistance = cameraCollisionDistance.current;
      const distanceResponse = THREE.MathUtils.damp(
        previousCameraDistance,
        cameraCollisionTargetDistance.current,
        cameraHit ? 6.2 : 3.2,
        delta,
      );
      const maximumDistanceStep = (distanceResponse < previousCameraDistance
        ? CAMERA_MAX_APPROACH_SPEED
        : CAMERA_MAX_RELEASE_SPEED) * delta;
      cameraCollisionDistance.current = THREE.MathUtils.clamp(
        distanceResponse,
        previousCameraDistance - maximumDistanceStep,
        previousCameraDistance + maximumDistanceStep,
      );
      cameraResolved.copy(cameraAnchor);
      if (cameraMotionLength > 0.0001) cameraResolved.addScaledVector(cameraMotion, cameraCollisionDistance.current / cameraMotionLength);
      const cameraResponse = cameraHit ? 7.2 : 4.2;
      state.camera.position.x = THREE.MathUtils.damp(state.camera.position.x, cameraResolved.x, cameraResponse, delta);
      state.camera.position.y = THREE.MathUtils.damp(state.camera.position.y, cameraResolved.y, cameraResponse, delta);
      state.camera.position.z = THREE.MathUtils.damp(state.camera.position.z, cameraResolved.z, cameraHit ? 6.4 : 3.8, delta);
      flightLookTarget.set(
        lateral.current.x + (caveRailActive.current ? caveViewTilt.current.x * 0.82 : velocity.current.x * movementLead * 1.75),
        lateral.current.y + (caveRailActive.current ? caveViewTilt.current.y * 0.58 : velocity.current.y * movementLead * 1.15),
        -7,
      );
      state.camera.lookAt(flightLookTarget);
      state.camera.rotation.z = THREE.MathUtils.damp(state.camera.rotation.z, caveRailActive.current ? -caveViewTilt.current.x * 0.025 : 0, 5.2, delta);
    }

    const firstTransition = STAGES[0].range[1];
    const secondTransition = STAGES[1].range[1];
    const transitionWidth = 36;
    const stageBlend = progress.current < firstTransition - transitionWidth / 2 ? 0
      : progress.current < firstTransition + transitionWidth / 2 ? (progress.current - firstTransition + transitionWidth / 2) / transitionWidth
        : progress.current < secondTransition - transitionWidth / 2 ? 1
          : progress.current < secondTransition + transitionWidth / 2 ? 1 + (progress.current - secondTransition + transitionWidth / 2) / transitionWidth
            : 2;
    const stageIndex = Math.min(2, Math.floor(stageBlend));
    const nextIndex = Math.min(2, stageIndex + 1);
    const mix = stageBlend - stageIndex;
    backgroundTarget.copy(ATMOSPHERE_COLOR_VALUES[stageIndex]).lerp(ATMOSPHERE_COLOR_VALUES[nextIndex], mix);
    fogTarget.copy(FOG_COLOR_VALUES[stageIndex]).lerp(FOG_COLOR_VALUES[nextIndex], mix);
    if (forwardBoost.current > 0.001) backgroundTarget.offsetHSL(0, 0.04 * forwardBoost.current, 0.018 * forwardBoost.current);
    if (state.scene.background instanceof THREE.Color) state.scene.background.lerp(backgroundTarget, 1 - Math.exp(-delta * 0.65));
    if (state.scene.fog instanceof THREE.Fog) {
      state.scene.fog.color.lerp(fogTarget, 1 - Math.exp(-delta * 0.65));
      state.scene.fog.near = THREE.MathUtils.damp(state.scene.fog.near, editing ? 650 : 14, 5.5, delta);
      state.scene.fog.far = THREE.MathUtils.damp(state.scene.fog.far, editing ? 1400 : quality === "high" ? 138 : 102, 5.5, delta);
    }

    if (state.clock.elapsedTime - lastReport.current > 0.12) {
      const current = progress.current;
      const stage = current < STAGES[0].range[1] ? 0 : current < STAGES[1].range[1] ? 1 : 2;
      let nearest: SceneAsset | null = null;
      let nearestDistance = Infinity;
      let nearestTriggerDistance = 42;
      SCENE_ASSETS.forEach((asset) => {
        if (!asset.voice.trim() || !asset.caption.trim()) return;
        if (asset.id === "cave" && current < INITIAL_ARTIFACT_REVEAL_PROGRESS) return;
        const distance = Math.abs(-transforms[asset.id].position[2] - current);
        if (distance < nearestDistance) {
          const modelScale = Math.max(...transforms[asset.id].scale.map((value) => Math.abs(value)));
          nearest = asset;
          nearestDistance = distance;
          nearestTriggerDistance = THREE.MathUtils.clamp(30 + asset.targetSize * modelScale * 0.38, 44, 78);
        }
      });
      const initialCave = SCENE_ASSETS.find((asset) => asset.id === "cave");
      const artifactId = current >= INITIAL_ARTIFACT_REVEAL_PROGRESS && current < 44 && initialCave?.voice.trim() && initialCave.caption.trim()
        ? initialCave.id
        : nearestDistance < nearestTriggerDistance ? (nearest as SceneAsset | null)?.id ?? null : null;
      onTelemetry({ progress: current, lateral: [lateral.current.x, lateral.current.y], stage, artifactId, finished: current >= ROUTE_LENGTH - 0.01 });
      lastReport.current = state.clock.elapsedTime;
    }
  });

  return (
    <>
      <color attach="background" args={["#050b0d"]} />
      <fog attach="fog" args={["#071215", 14, quality === "high" ? 138 : 102]} />
      <ambientLight intensity={0.86} color="#709b94" />
      <hemisphereLight args={["#8ccbbb", "#160a05", 0.62]} />
      <directionalLight position={[5, 9, 6]} intensity={3.45} color="#ffd37a" />
      <EditorHeadlight enabled={editing} />
      <group ref={world}>
        {started && !editing && <><DepthCorridor quality={quality} /><RouteFrames transforms={transforms} /><StarField quality={quality} /></>}
        {quality === "high" && started && !editing && <>
          <pointLight position={[-8, 7, -270]} color="#65b8a4" intensity={72} distance={300} decay={2} />
          <pointLight position={[9, 5, -700]} color="#d8973e" intensity={88} distance={320} decay={2} />
          <pointLight position={[-5, 8, -1210]} color="#9c72da" intensity={82} distance={300} decay={2} />
        </>}
        <SceneAssetField
          progressRef={progress}
          transforms={transforms}
          quality={quality}
          editing={editing}
          selectedId={selectedId}
          editorMode={editorMode}
          editorLocal={editorLocal}
          editorUniformScale={editorUniformScale}
          initialPrefetchEnabled={initialPrefetchEnabled}
          onSelect={onSelect}
          onTransformChange={onTransformChange}
          onColliderRegister={registerCollider}
          onCriticalAssetReady={onCriticalAssetReady}
          onCriticalAssetError={onCriticalAssetError}
        />
        <LightDust quality={quality} />
      </group>
      {!editing && <>
        <SpeedLines quality={quality} controls={controls} cruising={cruising} />
        <Suspense fallback={null}>
          <Xiyu playerRef={player} controls={controls} started={started} entering={entering} cruising={cruising} quality={quality} onCriticalAssetReady={onCriticalAssetReady} />
        </Suspense>
        <FireflyTrail playerRef={player} quality={quality} active={started && cruising && !paused} />
      </>}
    </>
  );
}

class CoreAssetBoundary extends Component<{ children: ReactNode; onError: CriticalAssetErrorReporter }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    const message = error instanceof Error && error.message ? error.message : "未知资源";
    this.props.onError(message);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

function JinshaExperienceCore({ initialPrefetchEnabled, onCriticalAssetReady, onCriticalAssetError }: { initialPrefetchEnabled: boolean; onCriticalAssetReady: CriticalAssetReporter; onCriticalAssetError: CriticalAssetErrorReporter }) {
  const experienceRef = useRef<HTMLElement>(null);
  const [entered, setEntered] = useState(false);
  const [entering, setEntering] = useState(false);
  const [paused, setPaused] = useState(false);
  const [pauseClosing, setPauseClosing] = useState(false);
  const [quality, setQuality] = useState<Quality>(getRecommendedQuality);
  const [resetKey, setResetKey] = useState(0);
  const [boosting, setBoosting] = useState(false);
  const [cruising, setCruising] = useState(true);
  const [telemetry, setTelemetry] = useState<Telemetry>({ progress: 0, lateral: [0, 0], stage: 0, artifactId: null, finished: false });
  const [displayArtifact, setDisplayArtifact] = useState<SceneAsset | null>(null);
  const [editing, setEditing] = useState(false);
  const [selectedAssetId, setSelectedAssetId] = useState<string | null>(null);
  const [editorMode, setEditorMode] = useState<EditorMode>("translate");
  const [editorLocal, setEditorLocal] = useState(false);
  const [editorUniformScale, setEditorUniformScale] = useState(true);
  const [audioPanelOpen, setAudioPanelOpen] = useState(false);
  const [completionAction, setCompletionAction] = useState<"replay" | "intro" | null>(null);
  const [audioMix, setAudioMix] = useState<AudioMix>(() => {
    const defaults: AudioMix = { master: 1, background: 1, effects: 1 };
    if (typeof window === "undefined") return defaults;
    try {
      const saved = JSON.parse(window.localStorage.getItem(AUDIO_MIX_KEY) ?? "{}") as Partial<AudioMix>;
      return {
        master: THREE.MathUtils.clamp(Number(saved.master ?? defaults.master), 0, 1),
        background: THREE.MathUtils.clamp(Number(saved.background ?? defaults.background), 0, 1),
        effects: THREE.MathUtils.clamp(Number(saved.effects ?? defaults.effects), 0, 1),
      };
    } catch {
      return defaults;
    }
  });
  const [sceneTransforms, setSceneTransforms] = useState<Record<string, SceneTransform>>(() => {
    const defaults = createDefaultTransforms();
    if (typeof window === "undefined") return defaults;
    try {
      const saved = JSON.parse(window.localStorage.getItem(SCENE_TRANSFORMS_KEY) ?? "{}") as Record<string, SceneTransform>;
      return Object.entries(defaults).reduce<Record<string, SceneTransform>>((resolved, [id, transform]) => {
        const persisted = saved[id];
        const rotationMatches = transform.rotation.every((value, index) => persisted?.rotation?.[index] === value);
        const hasOldScale = persisted?.scale?.every((value) => value === 1);
        const knownOldPositions = [LEGACY_DEFAULT_POSITIONS[id], PREVIOUS_DEFAULT_POSITIONS[id]];
        if (id === "cave") knownOldPositions.push([0, -0.4, -24]);
        const hasOldPosition = knownOldPositions.some((position) => position?.every((value, index) => persisted?.position?.[index] === value));
        const untouchedOldTransform = hasOldPosition && rotationMatches && hasOldScale;
        resolved[id] = !persisted || untouchedOldTransform ? transform : persisted;
        return resolved;
      }, {});
    } catch {
      return defaults;
    }
  });
  const controls = useRef<Controls>({ left: false, right: false, up: false, down: false, boost: false, touchX: 0, touchY: 0 });
  const touchDrag = useRef({ pointerId: -1, startX: 0, startY: 0 });
  const audio = useAmbientSound(audioMix.master, audioMix.background);
  const effectsVolume = audioMix.master * audioMix.effects;
  const startBoostAudio = useBoostSound(boosting && cruising && entered && !paused && !editing && !telemetry.finished, audio.muted, effectsVolume);
  const spatialAudio = useSceneSpatialSounds({
    progress: telemetry.progress,
    lateral: telemetry.lateral,
    transforms: sceneTransforms,
    active: entered && !editing,
    muted: audio.muted,
    effectsVolume,
  });
  const telemetryArtifact = SCENE_ASSETS.find((artifact) => artifact.id === telemetry.artifactId) ?? null;
  const initialArtifact = SCENE_ASSETS.find((artifact) => artifact.id === "cave") ?? SCENE_ASSETS[0];
  const activeArtifact = telemetryArtifact ?? (entered && telemetry.progress >= INITIAL_ARTIFACT_REVEAL_PROGRESS && telemetry.progress < 44 ? initialArtifact : null);
  const showFlightPrompt = entered && !entering && telemetry.progress < 12 && !activeArtifact && !paused && !editing;
  const stage = STAGES[telemetry.stage];
  const renderQuality: Quality = quality;
  const progressPercent = Math.min(100, telemetry.progress / ROUTE_LENGTH * 100);
  const dialogueDistortion = telemetry.stage === 0
    ? 1
    : telemetry.stage === 1
      ? 1 - THREE.MathUtils.smoothstep(telemetry.progress, STAGES[1].range[0], STAGES[1].range[1])
      : 0;
  const dialogueStyle = { "--dialogue-distortion": dialogueDistortion } as CSSProperties;
  const renderedArtifact = activeArtifact ?? displayArtifact;
  const artifactCaptionLines = renderedArtifact ? getArtifactCaptionLines(renderedArtifact.caption) : [];

  useLayoutEffect(() => {
    if (activeArtifact) setDisplayArtifact(activeArtifact);
  }, [activeArtifact]);

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      try {
        window.localStorage.setItem(SCENE_TRANSFORMS_KEY, JSON.stringify(sceneTransforms));
      } catch {
        // Some embedded and privacy-mode mobile browsers disable storage.
      }
    }, 120);
    return () => window.clearTimeout(timeout);
  }, [sceneTransforms]);

  useEffect(() => {
    try {
      window.localStorage.setItem(AUDIO_MIX_KEY, JSON.stringify(audioMix));
    } catch {
      // Audio controls still work for the current visit without persistence.
    }
  }, [audioMix]);

  const updateAudioMix = useCallback((channel: keyof AudioMix, value: number) => {
    setAudioMix((current) => ({ ...current, [channel]: THREE.MathUtils.clamp(value, 0, 1) }));
  }, []);

  const updateSceneTransform = useCallback((id: string, transform: SceneTransform) => {
    setSceneTransforms((current) => ({ ...current, [id]: transform }));
  }, []);

  const resetSelectedTransform = useCallback(() => {
    if (!selectedAssetId) return;
    const defaults = createDefaultTransforms();
    updateSceneTransform(selectedAssetId, defaults[selectedAssetId]);
  }, [selectedAssetId, updateSceneTransform]);

  useEffect(() => {
    const toggleEditor = (event: KeyboardEvent) => {
      if (event.code !== "F2" || !entered) return;
      event.preventDefault();
      setEditing((current) => {
        const next = !current;
        if (next) {
          controls.current.boost = false;
          setBoosting(false);
          const nearest = SCENE_ASSETS.reduce((result, asset) => {
            const resultDistance = Math.abs(-sceneTransforms[result.id].position[2] - telemetry.progress);
            const assetDistance = Math.abs(-sceneTransforms[asset.id].position[2] - telemetry.progress);
            return assetDistance < resultDistance ? asset : result;
          }, SCENE_ASSETS[0]);
          setSelectedAssetId((selected) => selected && Math.abs(-sceneTransforms[selected].position[2] - telemetry.progress) < 72 ? selected : activeArtifact?.id ?? nearest.id);
        }
        return next;
      });
    };
    window.addEventListener("keydown", toggleEditor);
    return () => window.removeEventListener("keydown", toggleEditor);
  }, [activeArtifact?.id, entered, sceneTransforms, telemetry.progress]);

  const toggleCruising = useCallback(() => {
    const next = !cruising;
    setCruising(next);
    if (!next) {
      controls.current.boost = false;
      setBoosting(false);
    }
  }, [cruising]);

  useEffect(() => {
    const keyMap: Record<string, keyof Controls> = { KeyA: "left", ArrowLeft: "left", KeyD: "right", ArrowRight: "right", KeyW: "up", ArrowUp: "up", KeyS: "down", ArrowDown: "down" };
    const mapKey = (code: string): keyof Controls | null => keyMap[code] ?? null;
    const update = (event: KeyboardEvent, active: boolean) => {
      if (editing) return;
      const key = mapKey(event.code);
      if (!key) return;
      if (entered) event.preventDefault();
      controls.current[key] = active;
      if (key === "boost") setBoosting(active);
    };
    const onDown = (event: KeyboardEvent) => {
      if (editing) return;
      if (event.code === "Escape" && entered) {
        if (paused) setPauseClosing(true);
        else { setPauseClosing(false); setPaused(true); }
        return;
      }
      if (event.code === "Space" && entered && !paused) {
        event.preventDefault();
        if (!event.repeat) toggleCruising();
        return;
      }
      if ((event.code === "ShiftLeft" || event.code === "ShiftRight") && entered) {
        event.preventDefault();
        if (event.repeat) return;
        startBoostAudio();
        if (!cruising) {
          controls.current.boost = true;
          setBoosting(true);
          setCruising(true);
          return;
        }
        const next = !controls.current.boost;
        controls.current.boost = next;
        setBoosting(next);
        return;
      }
      update(event, true);
    };
    const onUp = (event: KeyboardEvent) => update(event, false);
    const releaseControls = () => {
      controls.current.left = false;
      controls.current.right = false;
      controls.current.up = false;
      controls.current.down = false;
      controls.current.touchX = 0;
      controls.current.touchY = 0;
    };
    window.addEventListener("keydown", onDown);
    window.addEventListener("keyup", onUp);
    window.addEventListener("blur", releaseControls);
    return () => { window.removeEventListener("keydown", onDown); window.removeEventListener("keyup", onUp); window.removeEventListener("blur", releaseControls); };
  }, [cruising, editing, entered, paused, startBoostAudio, toggleCruising]);

  const reportTelemetry = useCallback((value: Telemetry) => setTelemetry(value), []);
  const toggleBoost = useCallback(() => {
    if (!cruising) return;
    startBoostAudio();
    const next = !controls.current.boost;
    controls.current.boost = next;
    setBoosting(next);
  }, [cruising, startBoostAudio]);

  const releaseTouchDrag = useCallback((pointerId?: number) => {
    if (pointerId !== undefined && touchDrag.current.pointerId !== pointerId) return;
    touchDrag.current.pointerId = -1;
    controls.current.touchX = 0;
    controls.current.touchY = 0;
  }, []);

  const beginTouchDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (paused || telemetry.finished) return;
    event.preventDefault();
    touchDrag.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY };
    event.currentTarget.setPointerCapture(event.pointerId);
  }, [paused, telemetry.finished]);

  const moveTouchDrag = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (touchDrag.current.pointerId !== event.pointerId) return;
    event.preventDefault();
    const radius = Math.min(108, Math.max(72, window.innerWidth * 0.22));
    let x = (event.clientX - touchDrag.current.startX) / radius;
    let y = (touchDrag.current.startY - event.clientY) / radius;
    const magnitude = Math.hypot(x, y);
    if (magnitude > 1) { x /= magnitude; y /= magnitude; }
    const deadZone = 0.055;
    controls.current.touchX = Math.abs(x) < deadZone ? 0 : x;
    controls.current.touchY = Math.abs(y) < deadZone ? 0 : y;
  }, []);
  const enterExperience = () => {
    if (entering || entered) return;
    audio.start();
    spatialAudio.start();
    setCruising(false);
    setPauseClosing(false);
    setPaused(false);
    setEditing(false);
    setEntering(true);
  };
  const replay = () => { setResetKey((value) => value + 1); setEntering(false); setCruising(true); setPauseClosing(false); setPaused(false); setEditing(false); setEntered(true); };
  const resetToIntro = () => {
    controls.current = { left: false, right: false, up: false, down: false, boost: false, touchX: 0, touchY: 0 };
    touchDrag.current.pointerId = -1;
    setBoosting(false);
    setEntering(false);
    setCruising(true);
    setPauseClosing(false);
    setPaused(false);
    setEditing(false);
    setEntered(false);
    setResetKey((value) => value + 1);
  };
  const returnToIntro = () => {
    setCompletionAction(null);
    resetToIntro();
  };
  const requestCompletionExit = (action: "replay" | "intro") => {
    if (completionAction) return;
    setCompletionAction(action);
  };

  useGSAP((_, contextSafe) => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const duration = reduceMotion ? 0.01 : 0.72;
    const offset = reduceMotion ? 0 : 20;
    const timeline = gsap.timeline({ defaults: { duration, ease: "power3.out" } });

    if (entering && !entered) {
      const swapScene = contextSafe(() => setEntered(true));
      timeline
        .to(".intro", { autoAlpha: 0, x: reduceMotion ? 0 : -14, duration: reduceMotion ? 0.01 : 0.52, ease: "power2.inOut" }, 0)
        .to(".scene", { autoAlpha: 0, duration: reduceMotion ? 0.01 : 0.68, ease: "power2.inOut" }, 0)
        .call(swapScene, [], reduceMotion ? 0.02 : 0.7);
      return;
    }

    if (entering && entered) {
      const finishEntry = contextSafe(() => {
        setEntering(false);
        setCruising(true);
      });
      timeline
        .fromTo(".scene", { autoAlpha: 0 }, { autoAlpha: 1, duration: reduceMotion ? 0.01 : 0.9, ease: "power2.inOut" }, 0)
        .call(finishEntry, [], reduceMotion ? 0.02 : 0.92);
      return;
    }

    if (!entered) {
      timeline
        .fromTo(".scene", { autoAlpha: 0.35, scale: 1.035 }, { autoAlpha: 1, scale: 1, duration: reduceMotion ? 0.01 : 1.45 }, 0)
        .fromTo(".eyebrow", { autoAlpha: 0, x: -offset }, { autoAlpha: 1, x: 0 }, 0.28)
        .fromTo(".intro h1", { autoAlpha: 0, y: reduceMotion ? 0 : 20 }, { autoAlpha: 1, y: 0, duration: reduceMotion ? 0.01 : 0.9, ease: "power3.out" }, 0.42)
        .fromTo(".intro-subtitle", { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0 }, 1.12)
        .fromTo(".intro-entry > *", { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, stagger: 0.14 }, 1.3)
        .fromTo(".intro-route > *", { autoAlpha: 0, scaleX: 0.6 }, { autoAlpha: 1, scaleX: 1, stagger: 0.09, transformOrigin: "left center" }, 1.57);
      return;
    }

    timeline
      .fromTo(".hud-frame i", { autoAlpha: 0, scale: 0.7 }, { autoAlpha: 1, scale: 1, stagger: 0.06 }, 0)
      .fromTo([".brand-rail", ".stage-heading"], { autoAlpha: 0, y: -offset }, { autoAlpha: 1, y: 0, stagger: 0.12 }, 0.12)
      .fromTo(".stage-heading > span", { autoAlpha: 0, rotation: reduceMotion ? 0 : -42, scale: 0.75 }, { autoAlpha: 1, rotation: 0, scale: 1 }, 0.26)
      .fromTo(".stage-copy > *", { autoAlpha: 0, x: reduceMotion ? 0 : -10 }, { autoAlpha: 1, x: 0, stagger: 0.08 }, 0.3)
      .fromTo(".top-actions", { autoAlpha: 0 }, { autoAlpha: 1, duration: reduceMotion ? 0.01 : 0.3 }, 0.16)
      .fromTo(".top-actions button", { autoAlpha: 0, y: -offset, rotationX: reduceMotion ? 0 : -14 }, { autoAlpha: 1, y: 0, rotationX: 0, stagger: 0.1 }, 0.2)
      .fromTo(".flight-dock", { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0, duration: reduceMotion ? 0.01 : 0.9 }, 0.38);
    timeline.fromTo(".touch-controls", { autoAlpha: 0, y: offset }, { autoAlpha: 1, y: 0 }, 0.48);
  }, { scope: experienceRef, dependencies: [entered, entering, resetKey], revertOnUpdate: true });

  useGSAP(() => {
    const prompt = experienceRef.current?.querySelector(".flight-prompt");
    if (!prompt || !entered) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.killTweensOf(prompt);
    if (showFlightPrompt) {
      gsap.fromTo(prompt,
        { autoAlpha: 0, y: reduceMotion ? 0 : -10 },
        { autoAlpha: 1, y: 0, duration: reduceMotion ? 0.01 : 0.58, ease: "power3.out", overwrite: "auto" },
      );
      return;
    }
    gsap.to(prompt, { autoAlpha: 0, y: reduceMotion ? 0 : -14, duration: reduceMotion ? 0.01 : 0.42, ease: "power2.inOut", overwrite: "auto" });
  }, { scope: experienceRef, dependencies: [entered, showFlightPrompt] });

  useGSAP((_, contextSafe) => {
    const card = experienceRef.current?.querySelector(".artifact-card");
    const dialogue = experienceRef.current?.querySelector(".protagonist-dialogue");
    if (!card) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    gsap.killTweensOf([card, ...card.querySelectorAll("*"), dialogue]);
    if (!entered || entering) {
      gsap.set([card, dialogue], { autoAlpha: 0 });
      return;
    }
    if (!activeArtifact) {
      if (!renderedArtifact) {
        gsap.set([card, dialogue], { autoAlpha: 0 });
        return;
      }
      const clearDepartedArtifact = contextSafe(() => setDisplayArtifact(null));
      gsap.set([card, dialogue], { autoAlpha: 1 });
      const exitTimeline = gsap.timeline({ defaults: { ease: "power2.inOut" }, onComplete: clearDepartedArtifact });
      exitTimeline
        .addLabel("depart", 0)
        .to(dialogue, { autoAlpha: 0, y: reduceMotion ? 0 : -15, letterSpacing: reduceMotion ? undefined : "0.17em", duration: reduceMotion ? 0.01 : 0.72, ease: "power2.inOut" }, "depart")
        .to([".artifact-card h3", ".artifact-context", ".artifact-meta"], { autoAlpha: 0, y: reduceMotion ? 0 : -7, duration: reduceMotion ? 0.01 : 0.36, stagger: 0.045 }, "depart+=0.08")
        .to(".artifact-signal i", { autoAlpha: 0, scaleY: 0.25, duration: reduceMotion ? 0.01 : 0.24, stagger: 0.03, transformOrigin: "center bottom" }, 0.04)
        .to(card, { autoAlpha: 0, y: reduceMotion ? 0 : -12, scale: reduceMotion ? 1 : 0.985, duration: reduceMotion ? 0.01 : 0.44 }, "depart+=0.18");
      return;
    }
    if (!renderedArtifact || renderedArtifact.id !== activeArtifact.id) return;
    const duration = reduceMotion ? 0.01 : 0.62;
    const timeline = gsap.timeline({ defaults: { duration, ease: "power3.out" } });
    timeline
      .fromTo(".artifact-card", { autoAlpha: 0, x: reduceMotion ? 0 : 30, y: 0, scale: reduceMotion ? 1 : 0.965 }, { autoAlpha: 1, x: 0, y: 0, scale: 1 }, 0)
      .fromTo(".artifact-signal i", { autoAlpha: 0, scaleY: 0 }, { autoAlpha: 1, scaleY: 1, stagger: 0.11, transformOrigin: "center bottom" }, 0.12)
      .fromTo([".artifact-card h3", ".artifact-context"], { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, stagger: 0.12 }, 0.2)
      .fromTo(".protagonist-dialogue", { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: reduceMotion ? 0.01 : 0.86 }, 0.42)
      .fromTo(".artifact-meta", { autoAlpha: 0, y: 8 }, { autoAlpha: 1, y: 0 }, 0.74);
  }, { scope: experienceRef, dependencies: [entered, entering, activeArtifact?.id, renderedArtifact?.id] });

  useGSAP((_, contextSafe) => {
    if (!completionAction) return;
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const action = completionAction;
    const swapJourney = contextSafe(() => {
      if (action === "replay") replay();
      else resetToIntro();
    });
    const finishTransition = contextSafe(() => setCompletionAction(null));
    const transitionTimeline = gsap.timeline({
      defaults: { ease: "power3.inOut" },
    });

    transitionTimeline
      .addLabel("depart", 0)
      .to(".completion-actions", { autoAlpha: 0, y: reduceMotion ? 0 : 16, duration: reduceMotion ? 0.01 : 0.38 }, "depart")
      .to(".completion-stages", { autoAlpha: 0, y: reduceMotion ? 0 : 12, duration: reduceMotion ? 0.01 : 0.42 }, "depart+=0.04")
      .to([".completion-copy", ".completion-title", ".completion-kicker"], { autoAlpha: 0, y: reduceMotion ? 0 : -14, duration: reduceMotion ? 0.01 : 0.4, stagger: 0.045 }, "depart+=0.08")
      .to(".completion-seal", { autoAlpha: 0, scale: reduceMotion ? 1 : 0.68, rotation: reduceMotion ? 0 : -14, duration: reduceMotion ? 0.01 : 0.52 }, "depart+=0.13")
      .to(".completion-rings", { autoAlpha: 0, scale: reduceMotion ? 1 : 1.16, duration: reduceMotion ? 0.01 : 0.58 }, "depart+=0.15")
      .fromTo(".journey-transition", { autoAlpha: 0 }, { autoAlpha: 1, duration: reduceMotion ? 0.01 : 0.82 }, "depart+=0.2")
      .fromTo(".journey-transition__halo", { autoAlpha: 0, scale: reduceMotion ? 1 : 0.22 }, { autoAlpha: 1, scale: 1.12, duration: reduceMotion ? 0.01 : 0.92, ease: "power3.out" }, "depart+=0.12")
      .fromTo(".journey-transition__line", { autoAlpha: 0, scaleX: reduceMotion ? 1 : 0.08 }, { autoAlpha: 1, scaleX: 1, duration: reduceMotion ? 0.01 : 0.72, transformOrigin: "center center" }, "depart+=0.3")
      .to(".completion-card", { autoAlpha: 0, duration: reduceMotion ? 0.01 : 0.62 }, "depart+=0.3")
      .addLabel("covered", reduceMotion ? 0.04 : 1.08)
      .call(swapJourney, [], "covered")
      .addLabel("reveal", reduceMotion ? "covered+=0.02" : "covered+=0.18")
      .to(".journey-transition__line", { autoAlpha: 0, scaleX: reduceMotion ? 1 : 1.7, duration: reduceMotion ? 0.01 : 0.54, ease: "power2.in" }, "reveal")
      .to(".journey-transition__halo", { autoAlpha: 0, scale: reduceMotion ? 1 : 1.8, duration: reduceMotion ? 0.01 : 0.92, ease: "power3.inOut" }, "reveal")
      .to(".journey-transition", { autoAlpha: 0, duration: reduceMotion ? 0.01 : 0.92 }, "reveal+=0.08")
      .call(finishTransition);
  }, { scope: experienceRef, dependencies: [completionAction], revertOnUpdate: true });

  useGSAP(() => {
    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (telemetry.finished) {
      const completionTimeline = gsap.timeline({ defaults: { duration: reduceMotion ? 0.01 : 0.72, ease: "power3.out" } });
      completionTimeline
        .fromTo(".completion-card", { autoAlpha: 0 }, { autoAlpha: 1 }, 0)
        .fromTo(".completion-depth", { autoAlpha: 0, scale: reduceMotion ? 1 : 1.08 }, { autoAlpha: 1, scale: 1, duration: reduceMotion ? 0.01 : 1.35, ease: "power2.out" }, 0)
        .fromTo(".completion-beam", { autoAlpha: 0, scaleY: reduceMotion ? 1 : 0.35 }, { autoAlpha: 1, scaleY: 1, transformOrigin: "top center", duration: reduceMotion ? 0.01 : 1.2 }, 0.08)
        .fromTo(".completion-rings", { autoAlpha: 0, scale: reduceMotion ? 1 : 0.78, rotation: reduceMotion ? 0 : -9 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: reduceMotion ? 0.01 : 1.4, ease: "power3.out" }, 0.16)
        .fromTo(".completion-seal", { autoAlpha: 0, scale: reduceMotion ? 1 : 0.55, rotation: reduceMotion ? 0 : -18 }, { autoAlpha: 1, scale: 1, rotation: 0, duration: reduceMotion ? 0.01 : 1.05, ease: "back.out(1.25)" }, 0.38)
        .fromTo(".completion-kicker", { autoAlpha: 0, y: reduceMotion ? 0 : -14 }, { autoAlpha: 1, y: 0 }, 0.46)
        .fromTo(".completion-title", { autoAlpha: 0, y: reduceMotion ? 0 : 24, letterSpacing: reduceMotion ? "0.12em" : "0.24em" }, { autoAlpha: 1, y: 0, letterSpacing: "0.12em", duration: reduceMotion ? 0.01 : 0.92 }, 0.58)
        .fromTo(".completion-copy", { autoAlpha: 0, y: reduceMotion ? 0 : 15 }, { autoAlpha: 1, y: 0 }, 0.82)
        .fromTo(".completion-stages li", { autoAlpha: 0, y: reduceMotion ? 0 : 18, scale: reduceMotion ? 1 : 0.94 }, { autoAlpha: 1, y: 0, scale: 1, stagger: 0.13 }, 1.02)
        .fromTo(".completion-actions button", { autoAlpha: 0, y: reduceMotion ? 0 : 18 }, { autoAlpha: 1, y: 0, stagger: 0.12 }, 1.28);
      return;
    }

    if (pauseClosing && paused && !telemetry.finished) {
      const timeline = gsap.timeline({
        defaults: { duration: reduceMotion ? 0.01 : 0.34, ease: "power3.inOut" },
        onComplete: () => { setPaused(false); setPauseClosing(false); },
      });
      timeline
        .to(".pause-actions", { autoAlpha: 0, y: reduceMotion ? 0 : 14 }, 0)
        .to(".pause-card h2", { autoAlpha: 0, y: reduceMotion ? 0 : -12, scale: reduceMotion ? 1 : 0.975 }, 0.08)
        .to(".pause-card > p", { autoAlpha: 0, y: reduceMotion ? 0 : -8 }, 0.14)
        .to(".pause-card", { autoAlpha: 0, duration: reduceMotion ? 0.01 : 0.48 }, 0.22);
      return;
    }
    if (!paused) return;
    const timeline = gsap.timeline({ defaults: { duration: reduceMotion ? 0.01 : 0.62, ease: "power3.out" } });
    timeline
      .fromTo(".pause-card", { autoAlpha: 0 }, { autoAlpha: 1 }, 0)
      .fromTo(".pause-card > *", { autoAlpha: 0, y: reduceMotion ? 0 : 18 }, { autoAlpha: 1, y: 0, stagger: 0.1 }, 0.16);
  }, { scope: experienceRef, dependencies: [paused, pauseClosing, telemetry.finished], revertOnUpdate: true });

  return (
    <main ref={experienceRef} className={`experience quality-${quality} stage-${telemetry.stage + 1} ${entered ? "is-running" : "is-intro"} ${entering ? "is-entering" : ""} ${editing ? "is-editing" : ""} ${boosting && cruising && entered && !paused && !editing ? "is-boosting" : ""} ${!cruising && entered ? "is-stopped" : ""}`}>
      <div className="scene" aria-label="羽见千年三维体验场景">
        <CoreAssetBoundary onError={onCriticalAssetError}>
          <Canvas camera={{ position: [0, 2.6, 11], fov: 58, near: 0.02, far: 520 }} dpr={renderQuality === "high" ? [0.9, 1.35] : [0.6, 0.85]} gl={{ antialias: quality === "high", alpha: false, stencil: false, powerPreference: "high-performance" }} onCreated={() => onCriticalAssetReady("renderer")}>
            <FlightScene
              started={entered}
              entering={entering}
              paused={paused || telemetry.finished || editing}
              cruising={cruising}
              quality={renderQuality}
              controls={controls}
              resetKey={resetKey}
              transforms={sceneTransforms}
              editing={editing}
              selectedId={selectedAssetId}
              editorMode={editorMode}
              editorLocal={editorLocal}
              editorUniformScale={editorUniformScale}
              initialPrefetchEnabled={initialPrefetchEnabled}
              onSelect={setSelectedAssetId}
              onTransformChange={updateSceneTransform}
              onTelemetry={reportTelemetry}
              onCriticalAssetReady={onCriticalAssetReady}
              onCriticalAssetError={onCriticalAssetError}
            />
          </Canvas>
        </CoreAssetBoundary>
      </div>

      <div className="journey-transition" aria-hidden="true">
        <i className="journey-transition__halo" />
        <span className="journey-transition__line" />
      </div>

      <div className="stage-effects" aria-hidden="true">
        <div className="stage-effect stage-effect--signal"><i /><i /><i /></div>
        <div className="stage-effect stage-effect--jade"><i /><i /></div>
      </div>

      {entered && !editing && <div
        className="touch-flight-surface"
        aria-hidden="true"
        onPointerDown={beginTouchDrag}
        onPointerMove={moveTouchDrag}
        onPointerUp={(event) => releaseTouchDrag(event.pointerId)}
        onPointerCancel={(event) => releaseTouchDrag(event.pointerId)}
        onLostPointerCapture={(event) => releaseTouchDrag(event.pointerId)}
      />}

      <div className="hud-frame" aria-hidden="true"><i /><i /><i /><i /></div>

      {editing && selectedAssetId && <SceneEditorPanel
        selectedId={selectedAssetId}
        transforms={sceneTransforms}
        mode={editorMode}
        local={editorLocal}
        uniformScale={editorUniformScale}
        onSelect={setSelectedAssetId}
        onMode={setEditorMode}
        onLocal={setEditorLocal}
        onUniformScale={setEditorUniformScale}
        onTransform={updateSceneTransform}
        onReset={resetSelectedTransform}
        onClose={() => setEditing(false)}
      />}

      <header className="brand-rail">
        <span className="brand-mark">羽</span>
        <p><strong>金沙遗址博物馆</strong>Jinsha immersive archive</p>
      </header>

      {!entered && <section className="intro" aria-labelledby="experience-title">
        <p className="eyebrow">JINSHA IMMERSIVE ARCHIVE</p>
        <h1 id="experience-title">羽见千年</h1>
        <p className="intro-subtitle">金沙沉浸式数字体验</p>
        <div className="intro-entry"><p className="intro-copy">跟随曦羽穿过自然、文明与记忆，在流动的光中重新看见金沙。</p><button className="enter-button intro-enter-button" onClick={enterExperience} disabled={entering}><span className="enter-button-copy"><small>开启航迹</small><strong>进入体验</strong></span><span className="enter-button-icon" aria-hidden="true">→</span></button></div>
        <div className="intro-route" aria-hidden="true"><span>自然之源</span><i /><span>文明之光</span><i /><span>记忆重生</span></div>
      </section>}

      {entered && <>
        <section className="stage-heading" aria-live="polite">
          <span>{stage.index}</span><div className="stage-copy"><div className="stage-meta"><small>CHAPTER {telemetry.stage + 1} / 3</small><b>{Math.round(progressPercent)}%</b></div><h2>{stage.name}</h2><div className="stage-meter">{STAGES.map((item, index) => <i key={item.name} className={index <= telemetry.stage ? "is-active" : ""} />)}</div></div>
        </section>
        <div className="top-actions">
          <div className="audio-control">
            <button className={`action-audio ${!audio.muted ? "is-active" : ""}`} onClick={() => setAudioPanelOpen((open) => !open)} aria-expanded={audioPanelOpen} aria-controls="audio-mixer" aria-label="打开声音设置"><i aria-hidden="true" /><span><small>音乐</small><b>{audio.muted ? "静音" : `${Math.round(audioMix.master * 100)}%`}</b></span></button>
            {audioPanelOpen && <section id="audio-mixer" className="audio-mixer" aria-label="声音设置">
              <header><div><small>AUDIO MIXER</small><strong>声音设置</strong></div><button type="button" className={audio.muted ? "is-muted" : ""} onClick={audio.toggle}>{audio.muted ? "恢复声音" : "全部静音"}</button></header>
              {([
                ["master", "总音量"],
                ["background", "背景音乐"],
                ["effects", "场景音效"],
              ] as [keyof AudioMix, string][]).map(([channel, label]) => <label key={channel}>
                <span>{label}<b>{Math.round(audioMix[channel] * 100)}</b></span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={audioMix[channel]}
                  onInput={(event) => updateAudioMix(channel, Number(event.currentTarget.value))}
                  onChange={(event) => updateAudioMix(channel, Number(event.currentTarget.value))}
                />
              </label>)}
            </section>}
          </div>
          <button className={`action-quality ${quality === "high" ? "is-active" : ""}`} onClick={() => setQuality((value) => value === "high" ? "eco" : "high")} aria-pressed={quality === "high"} aria-label="切换画质"><i aria-hidden="true" /><span><small>画质</small><b>{quality === "high" ? "高精" : "省电"}</b></span></button>
          <button className={`action-pause ${paused ? "is-active" : ""}`} onClick={() => { if (paused) setPauseClosing(true); else { setPauseClosing(false); setPaused(true); } }} aria-pressed={paused} aria-label={paused ? "继续飞行" : "暂停飞行"}><i aria-hidden="true" /><span><small>菜单</small><b>{paused ? "继续" : "暂停"}</b></span></button>
        </div>
        <p className="flight-prompt" aria-hidden={!showFlightPrompt}>让曦羽保持前行<br /><span className="desktop-flight-instruction">A / D 横移 · W / S 升降 · Shift 疾飞 · Space 停下</span><span className="mobile-flight-instruction">在画面上拖动 · 控制飞行方向</span></p>
        <aside className={`artifact-card ${activeArtifact ? "is-visible" : ""}`} aria-live="polite">
          {renderedArtifact && <div className="artifact-voice" key={renderedArtifact.id}>
            <div className="artifact-signal" aria-hidden="true"><i /><i /><i /><i /></div>
            <h3>{renderedArtifact.name}</h3>
            <p className="artifact-context" style={getArtifactContextStyle(artifactCaptionLines)}>{artifactCaptionLines.map((line, index) => <span className="artifact-context-line" key={`${renderedArtifact.id}-${index}`}>{line}</span>)}</p>
            <div className="artifact-meta"><span>记忆节点 {String(SCENE_ASSETS.indexOf(renderedArtifact) + 1).padStart(2, "0")} / {String(SCENE_ASSETS.length).padStart(2, "0")}</span><i /><span>{STAGES[renderedArtifact.stage].name}</span></div>
          </div>}
        </aside>
        {renderedArtifact && <blockquote
          className={`protagonist-dialogue dialogue-stage-${renderedArtifact.stage + 1} ${activeArtifact ? "is-visible" : ""}`}
          data-text={`“${renderedArtifact.voice}”`}
          style={dialogueStyle}
          aria-label={`曦羽：“${renderedArtifact.voice}”`}
          aria-live="polite"
        ><span>曦羽</span><em className="dialogue-line">“{renderedArtifact.voice}”</em></blockquote>}
        <footer className="flight-dock">
          <div className="control-legend"><span><kbd>A</kbd><kbd>D</kbd> 左右</span><span><kbd>W</kbd><kbd>S</kbd> 升降</span><span><kbd className="wide-key">Shift</kbd> 疾飞</span><span><kbd className="wide-key">Space</kbd> {cruising ? "停下" : "前进"}</span></div>
          <div className="journey-progress">
            <div className="progress-meta"><span>文明航迹</span><strong>{Math.round(progressPercent)}%</strong></div>
            <div className="progress-track"><i style={{ width: `${progressPercent}%` }} />{STAGES.map((item, index) => item.range[1] / ROUTE_LENGTH * 100).map((position, index) => <b key={position} className={telemetry.stage >= index ? "is-passed" : ""} style={{ left: `${position}%` }} />)}</div>
            <div className="progress-labels"><span>自然</span><span>文明</span><span>重生</span></div>
          </div>
          <div className="flight-state"><i />{!cruising ? "停驻中" : boosting ? "疾飞中" : "巡航中"}</div>
        </footer>
        <div className="touch-controls" aria-label="触控飞行操作">
          <button className={`touch-action touch-action--boost ${boosting ? "is-active" : ""}`} aria-pressed={boosting} aria-label="切换疾飞模式" onClick={toggleBoost}><small>速度</small><b>{boosting ? "巡航" : "疾飞"}</b></button>
          <button className={`touch-action touch-action--cruise ${!cruising ? "is-active" : ""}`} aria-pressed={!cruising} aria-label={cruising ? "停止向前飞行" : "继续向前飞行"} onClick={toggleCruising}><small>前进</small><b>{cruising ? "停驻" : "继续"}</b></button>
        </div>
      </>}

      {paused && entered && !telemetry.finished && <section className="pause-card"><p>旅程暂停</p><h2>光仍停留在这里</h2><div className="pause-actions"><button className="enter-button" disabled={pauseClosing} onClick={() => setPauseClosing(true)}><span>继续飞行</span><span>→</span></button><button className="quiet-button" disabled={pauseClosing} onClick={returnToIntro}>回到开始界面</button></div></section>}
      {telemetry.finished && <section className="completion-card" aria-labelledby="completion-title" aria-busy={Boolean(completionAction)}>
        <div className="completion-depth" aria-hidden="true">
          <i className="completion-beam" />
          <div className="completion-rings">
            <i /><i /><i /><i />
            <span className="completion-orbit-glints"><b /><b /><b /></span>
          </div>
          <div className="completion-seal"><span>羽</span></div>
          <i className="completion-floor" />
        </div>
        <div className="completion-content">
          <p className="completion-kicker"><i />羽见千年 · 旅程完成<i /></p>
          <h2 id="completion-title" className="completion-title">文明从未远去</h2>
          <p className="completion-copy">金沙的记忆没有消失，只是换了一种方式，再次被看见。<br />现在，你看见了她。</p>
          <ol className="completion-stages" aria-label="已完成的三个文明阶段">
            {STAGES.map((item, index) => <li key={item.name}><i /><strong>{String(index + 1).padStart(2, "0")}</strong><span>{item.name}</span></li>)}
          </ol>
          <div className="completion-actions">
            <button type="button" className="completion-button completion-button--primary" disabled={Boolean(completionAction)} onClick={() => requestCompletionExit("replay")}><span>再次启程</span><b aria-hidden="true">↻</b></button>
            <button type="button" className="completion-button" disabled={Boolean(completionAction)} onClick={() => requestCompletionExit("intro")}><span>返回首页</span><b aria-hidden="true">→</b></button>
          </div>
        </div>
      </section>}
      <noscript><div className="no-webgl">请启用 JavaScript 以进入三维体验。</div></noscript>
    </main>
  );
}

function CriticalLoadingScreen({ progress, leaving, status, error, onRetry }: { progress: number; leaving: boolean; status: string; error: string | null; onRetry: () => void }) {
  return <main className={`critical-loading ${leaving ? "is-leaving" : ""} ${error ? "has-error" : ""}`} role={error ? "alert" : "status"} aria-live="polite" aria-label={error ? "核心场景载入失败" : `核心场景载入中，${progress}%`}>
    <div className="critical-loading-depth" aria-hidden="true"><i /><i /><i /></div>
    <section className="critical-loading-content">
      <div className="critical-loading-seal" aria-hidden="true"><i /><span>羽</span></div>
      <p>JINSHA IMMERSIVE ARCHIVE</p>
      <h1>正在唤醒金沙记忆</h1>
      <div className="critical-loading-route" aria-hidden="true">
        {Array.from({ length: 5 }, (_, index) => <i key={index} className={progress >= (index + 1) * 20 ? "is-loaded" : ""} />)}
      </div>
      <strong>{String(progress).padStart(2, "0")}<small>%</small></strong>
      <span>{status}</span>
      {error && <button type="button" className="critical-loading-retry" onClick={onRetry}>重新加载</button>}
    </section>
  </main>;
}

function CompatibilityScreen() {
  return <main className="compatibility-screen" role="alert">
    <div className="compatibility-screen__seal" aria-hidden="true">羽</div>
    <p>3D EXPERIENCE UNAVAILABLE</p>
    <h1>当前浏览器无法开启三维场景</h1>
    <span>请升级浏览器，或使用最新版 Chrome、Safari、Edge 在系统浏览器中打开。</span>
    <small>需要 WebGL 2 与后台模型解码支持</small>
  </main>;
}

export function JinshaExperience() {
  const [criticalLeaving, setCriticalLeaving] = useState(false);
  const [criticalReady, setCriticalReady] = useState(false);
  const [criticalFrameReady, setCriticalFrameReady] = useState(false);
  const [criticalError, setCriticalError] = useState<string | null>(null);
  const [criticalAssets, setCriticalAssets] = useState<Record<CriticalAssetId, boolean>>({
    renderer: false,
    character: false,
    cave: false,
  });
  const [coreMounted, setCoreMounted] = useState(false);
  const [compatibilityIssue, setCompatibilityIssue] = useState(false);

  const reportCriticalAssetReady = useCallback<CriticalAssetReporter>((id) => {
    setCriticalAssets((current) => current[id] ? current : { ...current, [id]: true });
  }, []);
  const reportCriticalAssetError = useCallback<CriticalAssetErrorReporter>((label) => {
    setCriticalError(`核心资源“${label}”加载失败，请检查网络后重试。`);
  }, []);
  const allCriticalAssetsReady = Object.values(criticalAssets).every(Boolean);
  const criticalProgress = Math.min(100,
    (coreMounted ? 5 : 0)
    + (criticalAssets.renderer ? 10 : 0)
    + (criticalAssets.character ? 35 : 0)
    + (criticalAssets.cave ? 45 : 0)
    + (criticalFrameReady ? 5 : 0));
  const criticalStatus = criticalError
    ? criticalError
    : !criticalAssets.renderer
      ? "正在初始化三维渲染器"
      : !criticalAssets.character
        ? "正在下载并解码首页人物"
        : !criticalAssets.cave
          ? "正在构筑岩层秘境"
          : "正在确认首帧画面";

  useEffect(() => {
    THREE.Cache.enabled = true;
    let graphicsSupported = false;
    try {
      const probe = document.createElement("canvas");
      const context = probe.getContext("webgl2");
      graphicsSupported = Boolean(context) && typeof Worker === "function";
      context?.getExtension("WEBGL_lose_context")?.loseContext();
    } catch {
      graphicsSupported = false;
    }
    if (!graphicsSupported) {
      setCompatibilityIssue(true);
      setCriticalReady(true);
      return;
    }
    setCoreMounted(true);
  }, []);

  useEffect(() => {
    if (!coreMounted || allCriticalAssetsReady || criticalReady) return;
    const timeout = window.setTimeout(() => {
      setCriticalError("核心场景加载时间过长，请检查网络后重试。");
    }, 60000);
    return () => window.clearTimeout(timeout);
  }, [allCriticalAssetsReady, coreMounted, criticalReady]);

  useEffect(() => {
    if (!allCriticalAssetsReady || criticalReady) return;
    setCriticalError(null);
    let secondFrame = 0;
    let exitTimer = 0;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        setCriticalFrameReady(true);
        setCriticalLeaving(true);
        exitTimer = window.setTimeout(() => setCriticalReady(true), 440);
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame) window.cancelAnimationFrame(secondFrame);
      if (exitTimer) window.clearTimeout(exitTimer);
    };
  }, [allCriticalAssetsReady, criticalReady]);

  return <>
    {compatibilityIssue
      ? <CompatibilityScreen />
      : <>
        {coreMounted && <JinshaExperienceCore initialPrefetchEnabled={allCriticalAssetsReady} onCriticalAssetReady={reportCriticalAssetReady} onCriticalAssetError={reportCriticalAssetError} />}
        {!criticalReady && <CriticalLoadingScreen progress={criticalProgress} leaving={criticalLeaving} status={criticalStatus} error={criticalError} onRetry={() => window.location.reload()} />}
      </>}
  </>;
}
