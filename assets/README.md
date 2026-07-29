本目录是本地官方 Spine 资源缓存，不属于本仓库发布内容。

源码运行时，首次选择角色会从 Sekai.best 下载该角色所需的官方 atlas；基础 Spine
资源也会按需缓存。若要建立完整的本地服装目录，请在项目根目录运行：

```powershell
python tools\fetch_official_costumes.py
```

该命令会联网并写入本目录。请勿提交、发布或重新分发缓存中的官方 Skeleton、atlas、
PNG 或目录 JSON。
