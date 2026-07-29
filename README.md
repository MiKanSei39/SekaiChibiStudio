# Project Sekai Q版小人编辑器

这是一个本地个人使用的小工具：直接渲染 Project Sekai 官方 Q版 Spine 骨骼，而不是将散装 atlas 图硬拼在一起。

本仓库只包含编辑器源码和运行时脚本，不包含任何 Project Sekai 官方 Skeleton、atlas、
PNG、服装目录缓存、导出作品或用户提供的测试图片。

## 从源码启动

需要 Python 3.10+。在本目录执行：

```powershell
python -m pip install -r requirements.txt
python start.py
```

首次选择角色时，工具会从 Sekai.best 下载该角色的必需资源到 `assets/` 本地缓存。
如需缓存完整的官方服装目录，另行执行：

```powershell
python tools\fetch_official_costumes.py
```

这个步骤会联网、耗时较长，并只适用于个人本地使用；生成的缓存已被 Git 忽略。

## 启动

双击 `启动小人编辑器.cmd`，浏览器会自动打开编辑器。第一次选择某个角色时，工具会从 Sekai.best 下载该角色所需资源并存入 `assets/` 缓存。

也可以在本目录运行：

```powershell
python start.py
```

关闭运行窗口即可停止本地服务。

打包版可直接双击发行目录中的 EXE，无需另装 Python。它只读取包内的
`web/` 与 `assets/` 官方缓存；GIF 导出和临时帧会写入
`%LOCALAPPDATA%\ProjectSekaiChibiStudio\exports` 与
`%LOCALAPPDATA%\ProjectSekaiChibiStudio\runtime`，不会改写安装目录。打包版
缺少官方资源时会报错，不会向安装目录下载或补入资源。

## 当前功能

- 支持 26 位正式角色；本机缓存哪些官方旧版 / 新版 Q版服装，取决于用户自行取得的本地资源
- 同一角色可一键切换完整服装；不同骨骼家族会自动分开加载
- 默认只替换同角色的官方组件；“跨骨骼模式”为实验功能，可从其他角色
  选择同一骨骼家族中经验证能映射的官方组件
- 在实验模式中，可单独选择完整的“衣服主体”或“腿部 / 鞋”官方层组；它们
  保留相互关联的 Mesh 与 Region 层，不会拆成容易错位的散装衣片
- 初音未来的 Leo/need 官方单位服会明确标注，绝不会冒充魔法未来 2019
- 按角色体型过滤的官方真实动作
- 眼睛、眉毛、嘴巴、脸颊和特效切换
- 背景色、纯透明底、缩放和上下位置；实时预览在桌面浏览器滚动编辑时保持居中可见
- 768px PNG 导出
- 512px、可选 10 / 15 / 20 / 24 / 30 fps 的 GIF 动作导出；最长 4 秒、最高 120 帧

源码运行时，导出的 GIF 会保存到 `exports/`；打包版则保存到
`%LOCALAPPDATA%\ProjectSekaiChibiStudio\exports`。PNG 由浏览器直接下载。
透明 GIF 使用 GIF 本身支持的二值透明，因此半透明抗锯齿边缘会略有取舍；需要
平滑透明边缘时建议导出 PNG。

组件替换只会显示官方部件。即使开启“跨骨骼模式”，来源和当前服装仍必须属于
同一运行时家族、不是反向版本，并通过同名槽位、同名骨骼、骨骼布局和动画后
逐帧覆盖检查；它
不是任意混搭开关。普通头颈配件仍只接受真实的可见 `RegionAttachment`。衣服
主体和腿部 / 鞋是实验模式的唯一 Mesh 例外，必须通过完整层组和骨骼布局检查才
会显示，且可能因不同角色体型产生轻微穿模或露出原手脚。自定义素材和测试挂坠
已不再在编辑器中暴露。魔法未来 2019 没有可直接复用的官方 Project Sekai Spine
部件；在真实动作验收前，工具不会用 AI 或相似图替代它们。

## 素材与发布边界

Project Sekai 相关素材版权归原权利人所有。本项目仅供个人本地创作；不得将官方
Spine 资源、缓存目录或基于它们导出的内容随源码仓库重新分发。`assets/`、`exports/`、
`runtime/`、`release/` 和用户测试素材均已被忽略。

本仓库未授予源码再分发许可；在获得作者明确许可前，保留所有权利。`web/vendor/`
中的第三方运行时请分别遵循其文件头和上游许可。

## 验证本地官方缓存

以下命令离线检查目录、两个 Spine 骨骼家族和全部服装选择路径；它不会下载或改写资源：

```powershell
python tools\validate_official_costumes.py
```
