export type Vector3Tuple = [number, number, number];

export type SceneTransform = {
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  scale: Vector3Tuple;
};

export type SceneAsset = {
  id: string;
  name: string;
  voice: string;
  caption: string;
  url: string;
  distance: number;
  stage: number;
  targetSize: number;
  position: Vector3Tuple;
  rotation: Vector3Tuple;
  defaultScale: Vector3Tuple;
};

export const ROUTE_LENGTH = 1480;

export const STAGES = [
  { index: "壹", name: "自然之源", range: [0, 460], color: "#78a596" },
  { index: "贰", name: "文明之光", range: [460, 1020], color: "#d8a94a" },
  { index: "叁", name: "记忆重生", range: [1020, ROUTE_LENGTH], color: "#9d79cf" },
] as const;

export const SCENE_ASSETS: SceneAsset[] = [
  { id: "cave", name: "岩层秘境", voice: "我好像听见了，三千年前的土地还在呼吸。", caption: "金沙遗址位于成都平原，文化遗存主要属于商代晚期至西周时期，是认识古蜀文明的重要遗址。", url: "/models/jinsha/01-cave.glb", distance: 60, stage: 0, targetSize: 20, position: [0, 0, -60], rotation: [0, 0, 0], defaultScale: [6, 6, 6] },
  { id: "ancient-tree", name: "千年古树", voice: "看，那棵树……它像是从千年前一直长到了这里。", caption: "金沙遗址对生态环境的研究与复原，呈现了古蜀时期成都平原温暖湿润、植物繁盛的自然环境。", url: "/models/jinsha/02-ancient-tree.glb", distance: 180, stage: 0, targetSize: 16, position: [0, -6, -180], rotation: [0, 0, 0], defaultScale: [7, 7, 7] },
  { id: "landscape-birds", name: "山河遗境", voice: "山与水，藏着这片土地最早的记忆。", caption: "金沙祭祀区沿古河道南岸分布，是古蜀王国重要的滨河祭祀场所；玉璧、玉璋等礼器也与古蜀先民对天地四方和自然山川的敬仰有关。", url: "/models/jinsha/03-landscape-birds.glb", distance: 310, stage: 0, targetSize: 10, position: [0, -20, -310], rotation: [0, Math.PI / 18, 0], defaultScale: [7, 7, 7] },
  { id: "stage-two-gate", name: "礼器之门", voice: "再往前一步，这些沉睡的器物就要醒来了。", caption: "金沙祭祀遗存出土了大量金、铜、玉、石器物，展现出古蜀先民的礼仪与信仰。", url: "/models/jinsha/04-stage-two-gate.glb", distance: 420, stage: 0, targetSize: 15, position: [0, 6, -420], rotation: [0, 0, 0], defaultScale: [6, 6, 6] },
  { id: "sunbird", name: "太阳神鸟", voice: "四只神鸟围着太阳，朝同一个方向飞去。", caption: "太阳神鸟金饰呈圆环形，内层为十二道顺时针旋转的齿状芒纹，外层由四只首尾相接、逆向环绕的飞鸟组成，是金沙最具代表性的文物之一。", url: "/models/jinsha/05-sunbird.glb", distance: 510, stage: 1, targetSize: 7.5, position: [50, 0, -510], rotation: [0, -Math.PI * 2 / 9, 0], defaultScale: [6, 6, 6] },
  { id: "golden-mask", name: "黄金面具", voice: "它一直注视着这里，也注视着我们。", caption: "金沙黄金面具为金质立体脸谱，双眼呈菱形镂空，耳部外展，面相近方，整体丰满而威严。", url: "/models/jinsha/06-mask.glb", distance: 560, stage: 1, targetSize: 8.5, position: [-50, 0.5, -560], rotation: [0, Math.PI / 3, 0], defaultScale: [6, 6, 6] },
  { id: "jade-bi", name: "环形玉璧", voice: "圆环无声，却像在告诉我们天地的方向。", caption: "金沙祭祀遗存出土了大量玉器，璧、璋等玉礼器，与古蜀先民对天地四方和自然山川的敬仰有关。", url: "/models/jinsha/07-jade-bi.glb", distance: 620, stage: 1, targetSize: 8, position: [50, 0, -620], rotation: [0, -Math.PI * 2 / 9, 0], defaultScale: [5, 5, 5] },
  { id: "bronze-pattern", name: "青铜纹样", voice: "这些纹样，是古蜀留下的另一种语言。", caption: "金沙遗址出土了铜鸟、铜铃、铜挂饰、铜牛首等青铜器，展现了古蜀独特的青铜艺术与信仰世界。", url: "/models/jinsha/08-bronze-pattern.glb", distance: 700, stage: 1, targetSize: 9.5, position: [0, 0, -700], rotation: [0, 0, 0], defaultScale: [6, 6, 6] },
  { id: "ritual", name: "古蜀祭坛", voice: "这里曾有人向天地发问，也曾把答案留在土地里。", caption: "金沙祭祀区是古蜀王国重要的滨河祭祀场所，发现60余处祭祀遗存，出土金、铜、玉、石等大量祭祀遗物。", url: "/models/jinsha/09-ritual.glb", distance: 800, stage: 1, targetSize: 12, position: [0, 0, -800], rotation: [0, -Math.PI / 10, 0], defaultScale: [8, 8, 8] },
  { id: "stage-three-gate", name: "钟铃回廊", voice: "听见了吗？那些被时间藏起来的声音，还在这里回荡。", caption: "金沙遗址出土铜铃、铜鸟等青铜器，见证着金沙先民的礼仪活动与精神世界。", url: "/models/jinsha/10-stage-three-gate.glb", distance: 950, stage: 1, targetSize: 15, position: [0, 0, -950], rotation: [0, 0, 0], defaultScale: [8, 8, 8] },
  { id: "mask-fragment", name: "黄金面具碎片", voice: "完整的面容散开了，可它的目光还在。", caption: "大金面具并非整体铸造，而是在模具上以金箔捶揲成形；眼、鼻、口、耳等部位再用剪切工艺加工，正面打磨光亮、背面较为粗糙。", url: "/models/jinsha/11-mask-fragment.glb", distance: 1080, stage: 2, targetSize: 8, position: [-40, 0, -1080], rotation: [0, Math.PI * 7 / 90, 0], defaultScale: [6, 6, 6] },
  { id: "jade-fragment", name: "环形玉璧碎片", voice: "圆环被拆开了，却没有失去它原来的方向。", caption: "金沙出土的有领玉璧以圆形璧体为主体，圆孔周缘有一圈凸起的“领”；部分器物外缘还带有规律的牙饰，是金沙玉器中具有鲜明特征的一类。", url: "/models/jinsha/12-jade-fragment.glb", distance: 1140, stage: 2, targetSize: 7.5, position: [40, 0, -1140], rotation: [0, -Math.PI * 7 / 90, 0], defaultScale: [6, 6, 6] },
  { id: "bronze-fragment", name: "青铜纹样碎片", voice: "古老的纹样，换了一条路继续向前。", caption: "金沙祭祀遗存中可见鸟、虎、蛇、龟等动物形象的文物或图案；博物馆将这些动物形象与古蜀先民对动物的喜爱和崇敬联系起来。", url: "/models/jinsha/13-bronze-fragment.glb", distance: 1210, stage: 2, targetSize: 8, position: [0, 0, -1210], rotation: [0, 0, 0], defaultScale: [7, 7, 7] },
  { id: "sunbird-fragment", name: "太阳神鸟碎片", voice: "你看，太阳正在重新聚拢，如同金沙文明碎片一般渐渐聚拢", caption: "太阳神鸟金饰重约20克、厚仅0.02厘米，以黄金薄片经捶揲、剪切、打磨等工艺制成，图案采用镂空方式表现，展现了商周古蜀高超的制金工艺。", url: "/models/jinsha/14-sunbird-fragment.glb", distance: 1280, stage: 2, targetSize: 8.5, position: [2.1, 0.8, -1280], rotation: [0, Math.PI / 6, 0], defaultScale: [8, 8, 8] },
  { id: "civilization-gate", name: "文明之门", voice: "走过这扇门，记忆就不会停在三千年前，带着这段记忆将其延续吧。", caption: "太阳神鸟是中国文化遗产标志，图案寓意追求光明、团结奋进、和谐包容，成为连接古蜀文明与当代文化的重要符号。", url: "/models/jinsha/15-civilization-gate.glb", distance: 1400, stage: 2, targetSize: 18, position: [0, 10, -1400], rotation: [0, 0, 0], defaultScale: [8, 8, 8] },
];

export const createDefaultTransforms = (): Record<string, SceneTransform> => Object.fromEntries(
  SCENE_ASSETS.map((asset) => [asset.id, { position: [...asset.position] as Vector3Tuple, rotation: [...asset.rotation] as Vector3Tuple, scale: [...asset.defaultScale] as Vector3Tuple }]),
);
