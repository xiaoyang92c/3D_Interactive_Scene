# 羽见千年 · Codex 对话工作区

本目录只用于保存 Codex 协作上下文、需求梳理、决策记录和交接说明。

## 目录边界

- Codex 对话工作区：`E:\A-Codex\3D_Interactive_Scene`
- Unity 工程：`E:\Unity Project\YujianQiannian`
- 原始概念文档：`C:\Users\pc\Desktop\羽见千年_Unity沉浸式数字体验_开发需求与落地方案.docx`

不要把 Unity 的 `Assets`、`Library`、`Packages`、`ProjectSettings`、`Builds` 或 `Logs` 复制到本目录。

## 当前方向

- 最终交付物改为可通过链接直接访问的原生 Web 3D 网站。
- 推荐技术路线：HTML/CSS/TypeScript + React + Three.js（React Three Fiber），以 WebGL 2 为广泛兼容基线。
- Unity 2022.3 LTS + URP 工程保留为已验证的白模参考，不再作为最终网站主工程。
- Web 版控制：自动前进；A/D 左右移动；W/S 上升/下降；桌面端鼠标转向；移动端提供触控控制。
- Web 版不提供运行时布景模式；开发时直接通过代码、配置或 Three.js 调试工具调整场景。

## Unity 参考工程状态

- 已生成三阶段白膜场景：自然、文明、重生。
- 已实现居中飞行主角、自动前进、第三人称跟随相机。
- 已建立金沙文化展品占位节点，后续用 AI 生成模型按稳定 Asset Key 替换。
- Windows 白膜测试版已成功构建并完成启动冒烟测试。

## 路径规则

后续 Codex 协作文档只写入本目录；所有 Unity 源码、资源、场景和构建产物只写入 `E:\Unity Project\YujianQiannian`。
