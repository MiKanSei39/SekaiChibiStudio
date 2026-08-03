# Project Sekai Chibi Studio Web

Project Sekai Chibi Studio 的 GitHub Pages 网页版 / GitHub Pages web edition
for Project Sekai Chibi Studio.

页面在浏览器中加载 Pixi/Spine 运行时和所选角色资源，可直接部署到 GitHub
Pages，无需单独准备服务器。

## 功能 / Features

- 26 位角色 / 26 canonical characters
- Legacy 与 V2 骨骼家族隔离 / Legacy and V2 Spine family isolation
- 运行时发现服装目录 / Runtime-discovered costume catalog
- 双语动作名称 / Bilingual action labels
- 眼睛、眉毛、嘴巴、脸颊与特效覆盖 / Eyes, brows, mouth, cheeks, and effect overrides
- 背景色、透明画布、缩放与垂直位置 / Background color, transparent canvas, scale, and vertical offset
- 浏览器端 PNG 与 GIF 下载 / Browser-side PNG and GIF downloads
- 右下角浏览数据面板，显示总浏览量与小时 / 日趋势 / Bottom-right view panel with total, hourly, and daily trends
- GIF 帧率选择，按完整动作周期导出、最高 240 帧 / GIF frame-rate selection, complete action cycles and up to 240 frames
- 同角色安全组件叠加 / Safe same-character component stacking
- 实验性跨骨骼组件模式，支持完整衣服主体与腿部 / 鞋层组 / Experimental cross-rig component mode with complete outfit and leg/shoe layer sets

跨骨骼模式从当前运行时家族收集可用来源。每个候选项都会校验槽位和目标骨骼；
衣服主体与腿部 / 鞋还会校验完整官方层组和有序骨骼布局。角色体型差异可能在部分
组合中产生穿插 / Character proportions can produce visible intersections in some combinations.

## 运行时资源 / Runtime Sources

资源地址位于 [config.js](config.js)。部署页面会使用：

- jsDelivr 提供的 PixiJS、Spine 运行时和 GIF 编码模块
- `https://storage.sekai.best/sekai-jp-assets` 提供的角色资源
- `https://sekai-world.github.io/sekai-master-db-diff` 提供的元数据

使用自定义域名或替换资源源站后，请从实际部署地址执行页面中的连接检查，以确认
浏览器可以访问所需资源 / Run the in-page connection check from the deployed address
after changing the domain or resource origin.

## 本地预览 / Local Preview

在本目录运行静态服务器：

```powershell
python -m http.server 8080
```

浏览器打开 `http://127.0.0.1:8080`。

## GitHub Pages 部署 / Deployment

本目录是 [MiKanSei39/SekaiChibiStudio](https://github.com/MiKanSei39/SekaiChibiStudio)
的 Pages 发布内容。仓库根目录的
`.github/workflows/deploy-pages.yml` 会在 `main` 分支更新后部署本目录。

首次发布后，在仓库 **Settings > Pages** 中将 Source 设为 **GitHub Actions**。
站点地址为：

`https://mikansei39.github.io/SekaiChibiStudio/`
