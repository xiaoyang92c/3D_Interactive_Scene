# 羽见千年

基于 WebGL 的金沙文化三维沉浸式互动白模。玩家操控中央角色“曦羽”持续向前飞行，依次穿过自然之源、文明之光与记忆重生三个章节。

## 在线体验

[打开公开体验站点](https://yujian-qiannian.xiaoyang92c.chatgpt.site/)

## 当前功能

- 三维自动前进与章节式空间叙事
- 带加速度、惯性、阻尼和边界回弹的飞行控制
- 疾飞时的漫画式金色加速线、角色姿态和镜头反馈
- 随章节持续变化的环境色彩、薄雾、粒子与环形光构
- 金沙文物白模节点及说明 UI
- 桌面键盘与移动端触控支持
- 环境声音、暂停与画质切换

## 本地预览

需要 Node.js 22.13.0 或更高版本。

首次运行：

```powershell
cd "E:\A-Codex\3D_Interactive_Scene"
npm install
npm run dev -- --host 127.0.0.1
```

之后在浏览器打开：

```text
http://localhost:3000/
```

停止本地服务时，在 PowerShell 中按 `Ctrl + C`。

依赖已经安装时，后续只需执行：

```powershell
cd "E:\A-Codex\3D_Interactive_Scene"
npm run dev -- --host 127.0.0.1
```

## 操作方式

| 操作 | 按键 |
| --- | --- |
| 左右移动 | `A` / `D` |
| 上升下降 | `W` / `S` |
| 疾飞加速 | 按住 `Shift` |
| 暂停或继续 | `Esc` |

移动设备可以使用画面底部的触控按钮。

## 正式构建

```powershell
npm run build
```

主要体验代码位于 `app/JinshaExperience.tsx`，界面样式位于 `app/globals.css`。后续完成角色或金沙文物模型后，可将模型放入 `public/models/`，再替换对应白模节点。
