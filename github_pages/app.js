/* global PIXI, spine */

(() => {
  "use strict";

  const SIZE = 768;
  const GIF_SIZE = 512;
  const GIFENC_URL = "https://cdn.jsdelivr.net/npm/gifenc@1.0.3/+esm";
  const SKELETON_CHUNK_SIZE = 1024 * 1024;
  const DEFAULT = "__default";
  const NONE = "__none";
  const LEGACY_PREFIX = "area_sd/sd_main/";
  const V2_PREFIX = "area_sd/v2_sd_main/";
  const CHARACTERS = [
    [1, "ichika", "星乃一歌", "sd_01ichika_normal", "w"], [2, "saki", "天马咲希", "sd_02saki_normal", "w"],
    [3, "honami", "望月穗波", "sd_03honami_normal", "w"], [4, "shiho", "日野森志步", "sd_04shiho_normal", "w"],
    [5, "minori", "花里实乃理", "sd_05minori_normal", "w"], [6, "haruka", "桐谷遥", "sd_06haruka_normal", "w"],
    [7, "airi", "桃井爱莉", "sd_07airi_normal", "w"], [8, "shizuku", "日野森雫", "sd_08shizuku_normal", "w"],
    [9, "kohane", "小豆泽心羽", "sd_09kohane_normal", "w"], [10, "an", "白石杏", "sd_10an_normal", "w"],
    [11, "akito", "东云彰人", "sd_11akito_normal", "m"], [12, "touya", "青柳冬弥", "sd_12touya_normal", "m"],
    [13, "tsukasa", "天马司", "sd_13tsukasa_normal", "m"], [14, "emu", "凤笑梦", "sd_14emu_normal", "w"],
    [15, "nene", "草薙宁宁", "sd_15nene_normal", "w"], [16, "rui", "神代类", "sd_16rui_normal", "m"],
    [17, "kanade", "宵崎奏", "sd_17kanade_normal", "w"], [18, "mafuyu", "朝比奈真冬", "sd_18mafuyu_normal", "w"],
    [19, "ena", "东云绘名", "sd_19ena_normal", "w"], [20, "mizuki", "晓山瑞希", "sd_20mizuki_normal", "w"],
    [21, "miku", "初音未来", "sd_21miku_normal", "w"], [22, "rin", "镜音铃", "sd_22rin_normal", "w"],
    [23, "len", "镜音连", "sd_23len_normal", "m"], [24, "luka", "巡音流歌", "sd_24luka_normal", "w"],
    [25, "meiko", "MEIKO", "sd_25meiko_normal", "w"], [26, "kaito", "KAITO", "sd_26kaito_normal", "m"],
  ].map(([id, key, name, defaultBundle, sex]) => ({ id, key, name, defaultBundle, sex }));

  const config = window.CHIBI_WEB_CONFIG;
  const ACTION_WORDS = {
    adult: "成熟", angry: "生气", cool: "冷静", cute: "可爱", doubt: "困惑", happy: "开心",
    idle: "待机", joy: "高兴", laugh: "大笑", listen: "倾听", normal: "普通", pure: "纯真",
    sad: "难过", staff: "持杖", surprise: "惊讶", talk: "说话", walk: "走路",
    general: "通用", wait: "等待", kohaneunit: "心羽服", emucloth: "笑梦服", nenecloth: "宁宁服",
  };
  const FACE_WORDS = {
    normal: "普通", half: "半睁", close: "闭眼", smile: "笑眼", kira: "闪亮", tearwhite: "泪光",
    jitome: "眯眼", marume: "圆眼", marume_small: "小圆眼", batsume: "竖眼", tare: "下垂",
    turi: "上挑", yuru: "平缓", bigsmile: "大笑", smileclose: "闭口笑", cat: "猫嘴", catclose: "闭口猫嘴",
    mimizu: "波浪嘴", angry: "生气", angryclose: "闭口生气", sad: "难过", sadclose: "闭口难过", pukuu: "鼓脸",
    guru: "圈圈", shy: "害羞", shyline: "害羞线", heart: "爱心", sweat1: "汗滴 1", sweat2: "汗滴 2", tear: "眼泪",
  };
  const dom = {
    character: document.querySelector("#character"), costume: document.querySelector("#costume"), action: document.querySelector("#action"),
    eyes: document.querySelector("#eyes"), brows: document.querySelector("#brows"), mouth: document.querySelector("#mouth"),
    cheeks: document.querySelector("#cheeks"), effect: document.querySelector("#effect"), background: document.querySelector("#background"),
    transparent: document.querySelector("#transparent"), scale: document.querySelector("#scale"), scaleValue: document.querySelector("#scale-value"),
    offsetY: document.querySelector("#offset-y"), offsetYValue: document.querySelector("#offset-y-value"),
    origin: document.querySelector("#asset-origin"), check: document.querySelector("#check-source"), download: document.querySelector("#download-png"),
    downloadGif: document.querySelector("#download-gif"), gifFps: document.querySelector("#gif-fps"),
    componentGroup: document.querySelector("#component-group"), componentOptions: document.querySelector("#component-options"),
    crossRigMode: document.querySelector("#cross-rig-mode"), resetComponents: document.querySelector("#reset-components"), componentStatus: document.querySelector("#component-status"),
    result: document.querySelector("#check-result"), state: document.querySelector("#origin-state"), status: document.querySelector(".preview-status"),
    title: document.querySelector("#preview-title"), detail: document.querySelector("#preview-detail"), canvas: document.querySelector("#stage"),
  };
  const state = {
    app: null, current: null, loading: false, request: 0, catalog: new Map(), skeletons: new Map(), backgroundGraphic: null,
    componentSelections: new Map(), componentOverrides: [], componentSourceCache: new Map(), componentCatalogCache: new Map(),
    componentCatalogEpoch: 0, componentCatalogLoading: false, crossRigMode: false,
    face: { eyes: DEFAULT, brows: DEFAULT, mouth: DEFAULT, cheeks: NONE, effect: NONE }, background: "#ffffff", transparent: false, scale: 100, offsetY: 0,
  };
  let gifencModulePromise = null;
  let canvasResizeObserver = null;
  let canvasResizeListenerInstalled = false;

  function assetUrl(path) { return `${config.assetOrigin}/${path}`; }
  function familyFor(bundle) { return bundle.startsWith("v2_") ? "v2" : "legacy"; }
  function prefixFor(family) { return family === "v2" ? V2_PREFIX : LEGACY_PREFIX; }
  function costumeUrl(costume, file) { return assetUrl(`${prefixFor(costume.family)}${costume.bundle}/${file}`); }
  function skeletonUrl(family) {
    return family === "v2"
      ? assetUrl(`${V2_PREFIX}v2_base_model/v2_sd_main.skel`)
      : assetUrl(`${LEGACY_PREFIX}base_model/sd_main.skel`);
  }
  function probeUrl() {
    const url = new URL(skeletonUrl("legacy"));
    // Avoid a stale CDN/proxy response while keeping the real asset URL cacheable.
    url.searchParams.set("probe", Date.now().toString());
    return url.href;
  }

  function option(select, value, label) {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    select.append(item);
  }

  function setState(kind, title, detail) {
    dom.state.className = `state-pill ${kind}`;
    dom.state.textContent = kind === "ok" ? "已就绪 / Ready" : kind === "fail" ? "加载失败 / Load failed" : "正在加载 / Loading";
    dom.status.className = `preview-status ${kind}`;
    dom.title.textContent = title;
    dom.detail.textContent = detail;
  }

  function setBusy(busy) {
    state.loading = busy;
    dom.character.disabled = busy;
    dom.costume.disabled = busy || !state.catalog.size;
    dom.action.disabled = busy || !state.current;
    [dom.eyes, dom.brows, dom.mouth, dom.cheeks, dom.effect]
      .forEach((element) => { element.disabled = busy || !state.current || element.options.length <= 1; });
    [dom.background, dom.transparent, dom.scale, dom.offsetY]
      .forEach((element) => { element.disabled = busy || !state.current; });
    dom.check.disabled = busy;
    dom.download.disabled = busy || !state.current;
    dom.downloadGif.disabled = busy || !state.current;
    dom.gifFps.disabled = busy || !state.current;
    setComponentControlsDisabled(busy || state.componentCatalogLoading);
  }

  async function fetchJson(path) {
    const response = await fetch(`${config.catalogOrigin}/${path}`, {
      mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    });
    if (!response.ok) throw new Error(`${path} HTTP ${response.status}`);
    return response.json();
  }

  async function listBundles(prefix) {
    const query = new URLSearchParams({ prefix, delimiter: "/" });
    const response = await fetch(`${config.assetOrigin}/?${query}`, {
      mode: "cors", credentials: "omit", referrerPolicy: "no-referrer", cache: "no-store",
    });
    if (!response.ok) throw new Error(`Asset listing HTTP ${response.status}`);
    const xml = new DOMParser().parseFromString(await response.text(), "application/xml");
    return new Set([...xml.getElementsByTagName("Prefix")]
      .map((node) => node.textContent.trim())
      .filter((value) => value.startsWith(prefix) && value.endsWith("/"))
      .map((value) => value.slice(prefix.length, -1)));
  }

  function labelForCostume(bundle, groupId) {
    const name = bundle.replace(/^v2_/, "").replace(/^sd_\d{2}[a-z0-9]+_/, "").replace(/_/g, " ");
    const reverse = name.endsWith(" r") ? " · 反向版本 / Reverse" : "";
    return `${String(groupId).padStart(2, "0")} · ${name.replace(/ r$/, "")}${reverse}`;
  }

  function startsWithAny(value, prefixes) { return prefixes.some((prefix) => value.startsWith(prefix)); }

  function normalizeAttachmentName(name, prefix) {
    return name.slice(prefix.length).replace(/_(?:f|m)(?:2)?$/i, "").replace(/_v2$/i, "");
  }

  function normalizeEyeKey(key) {
    return key.replace(/^09_wmarumes$/, "09_marume_small").replace(/^10_wmarume$/, "10_marume");
  }

  function isUsableFaceAttachment(entry) {
    const region = entry.attachment?.region;
    return Boolean(region && region.width > 1 && region.height > 1);
  }

  function pickVariant(entries, sex) {
    const usable = entries.filter(isUsableFaceAttachment);
    const candidates = usable.length ? usable : entries;
    const preferred = sex === "m" ? /_m2?$/i : /_f2?$/i;
    return candidates.find((entry) => preferred.test(entry.name))
      || candidates.find((entry) => !/_(?:f|m)(?:2)?$/i.test(entry.name))
      || candidates[0];
  }

  function faceLabel(key) {
    const match = key.match(/^(\d+)_?(.*)$/);
    const number = match ? `${Number(match[1])}. ` : "";
    const words = (match ? match[2] : key).split("_").filter(Boolean);
    return `${number}${words.map((word) => FACE_WORDS[word] || word).join(" · ") || "表情 / Face"}`;
  }

  function humanizeActionToken(token) {
    const parts = token.match(/[a-z]+|\d+/gi) || [token];
    return parts.map((part) => ACTION_WORDS[part] || (/^\d+$/.test(part) ? `#${part}` : part)).join(" ");
  }

  function actionLabel(name) {
    if (name === "pose_default") return "默认站姿 / Default pose";
    const stripped = name.replace(/^v2_/i, "").replace(/_v2$/i, "").replace(/_f2$/i, "_f");
    const pieces = stripped.split("_");
    const facing = pieces.at(-1) === "f" ? "正面 / Front" : pieces.at(-1) === "b" ? "背面 / Back" : "";
    const translated = pieces.slice(1, facing ? -1 : undefined).map(humanizeActionToken).join(" · ");
    return `${translated || name}${facing ? `（${facing}）` : ""}`;
  }

  function groupFaceEntries(entries, prefix, sex) {
    const grouped = new Map();
    for (const entry of entries.filter((item) => item.name.startsWith(prefix))) {
      const key = normalizeAttachmentName(entry.name, prefix);
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(entry);
    }
    return [...grouped.entries()].map(([value, group]) => {
      const picked = pickVariant(group, sex);
      return { value, label: faceLabel(value), targets: [{ slotName: picked.slotName, attachmentName: picked.name }] };
    }).sort((left, right) => left.value.localeCompare(right.value, undefined, { numeric: true }));
  }

  function buildFaceCatalog(skeletonData, sex) {
    const skin = skeletonData.skins.find((item) => item.name === "default") || skeletonData.skins[0];
    const entries = skin.getAttachments().map((entry) => ({
      slotName: skeletonData.slots[entry.slotIndex]?.name, name: entry.name, attachment: entry.attachment,
    })).filter((entry) => entry.slotName && entry.name);
    const left = groupFaceEntries(entries, "F_eyeL", sex);
    const right = groupFaceEntries(entries, "F_eyeR", sex);
    const leftByKey = new Map(left.map((item) => [normalizeEyeKey(item.value), { ...item, value: normalizeEyeKey(item.value), label: faceLabel(normalizeEyeKey(item.value)) }]));
    const rightByKey = new Map(right.map((item) => [normalizeEyeKey(item.value), item]));
    const eyes = [...leftByKey.keys()].filter((key) => rightByKey.has(key)).map((key) => ({
      value: key, label: faceLabel(key), targets: [...leftByKey.get(key).targets, ...rightByKey.get(key).targets],
    }));
    const cheeks = groupFaceEntries(entries, "F_cheek", sex);
    const effects = entries.filter((entry) => startsWithAny(entry.name, ["F_ef", "F_tear"]));
    const effectGroups = new Map();
    for (const entry of effects) {
      const prefix = entry.name.startsWith("F_ef") ? "F_ef" : "F_";
      const key = normalizeAttachmentName(entry.name, prefix);
      if (!effectGroups.has(key)) effectGroups.set(key, []);
      effectGroups.get(key).push(entry);
    }
    const effect = [...effectGroups.entries()].map(([value, group]) => {
      const picked = pickVariant(group, sex);
      return { value, label: faceLabel(value), targets: [{ slotName: picked.slotName, attachmentName: picked.name }] };
    }).sort((left, right) => left.value.localeCompare(right.value, undefined, { numeric: true }));
    return {
      eyes, brows: groupFaceEntries(entries, "F_eyebrow", sex), mouth: groupFaceEntries(entries, "F_mouth", sex), cheeks, effect,
      slots: { cheeks: [...new Set(cheeks.flatMap((choice) => choice.targets.map((target) => target.slotName)))], effect: [...new Set(effects.map((entry) => entry.slotName))] },
    };
  }

  function populateFaceSelect(select, choices, mode, selected) {
    select.textContent = "";
    option(select, mode === "default" ? DEFAULT : NONE, mode === "default" ? "动作默认 / Action default" : "无 / None");
    for (const choice of choices) option(select, choice.value, choice.label);
    select.value = selected;
    select.disabled = state.loading || choices.length === 0;
  }

  function populateFaceControls(current) {
    populateFaceSelect(dom.eyes, current.face.eyes, "default", state.face.eyes);
    populateFaceSelect(dom.brows, current.face.brows, "default", state.face.brows);
    populateFaceSelect(dom.mouth, current.face.mouth, "default", state.face.mouth);
    populateFaceSelect(dom.cheeks, current.face.cheeks, "none", state.face.cheeks);
    populateFaceSelect(dom.effect, current.face.effect, "none", state.face.effect);
  }

  function applyFaceCategory(category) {
    if (!state.current) return;
    const catalog = state.current.face;
    const value = state.face[category];
    const choice = catalog[category].find((item) => item.value === value);
    if (value === DEFAULT) return;
    if (category === "cheeks" || category === "effect") {
      for (const slotName of catalog.slots[category]) state.current.display.skeleton.setAttachment(slotName, null);
    }
    if (value === NONE || !choice) return;
    for (const target of choice.targets) state.current.display.skeleton.setAttachment(target.slotName, target.attachmentName);
  }

  function applyFaceOverrides() {
    applyFaceCategory("eyes");
    applyFaceCategory("brows");
    applyFaceCategory("mouth");
    applyFaceCategory("cheeks");
    applyFaceCategory("effect");
  }

  const EXPERIMENTAL_OUTFIT_SLOTS = new Set([
    "B_belt_b", "B_skirt_b", "B_shoulderL", "B_armL", "B_crotch", "B_belt_f", "B_body",
    "B_shoulderR", "B_armR", "F_belt_b", "F_body_b", "F_shoulderR", "F_shoulderR02",
    "F_armR", "F_crotch", "F_belt_f", "F_body", "F_shoulderL", "F_armL02", "F_armL", "F_armL_sode",
  ]);
  const EXPERIMENTAL_LEG_SLOTS = new Set([
    "B_legL", "B_footL", "B_legR", "B_footR", "F_legR", "F_footR", "F_legL_b", "F_legL", "F_footL",
  ]);
  const EXPERIMENTAL_GROUPS = new Set(["outfit", "legs"]);
  const COMPONENT_GROUP_LABELS = {
    hat: "帽子 / Hat", headAccessory: "头饰 / Head accessory", hairAccessory: "发饰 / Hair accessory",
    glasses: "眼镜 / Glasses", earrings: "耳饰 / Earrings", headphones: "耳机 / Headphones",
    catEars: "猫耳 / Cat ears", neck: "领口 / Neck detail", outfit: "衣服主体 / Outfit", legs: "腿部与鞋 / Legs and shoes",
  };

  function applyComponentOverrides() {
    if (!state.current || !state.componentOverrides.length) return;
    for (const override of state.componentOverrides) {
      const slot = state.current.display.skeleton.findSlot(override.slotName);
      if (slot) slot.setAttachment(override.attachment);
    }
  }

  function componentGroupForSlot(slotName, crossRigMode = false) {
    if (crossRigMode && EXPERIMENTAL_OUTFIT_SLOTS.has(slotName)) return "outfit";
    if (crossRigMode && EXPERIMENTAL_LEG_SLOTS.has(slotName)) return "legs";
    if (/^(?:B_|F_)(?:hat\d*|cap)(?:_|$)/i.test(slotName)) return "hat";
    if (/^(?:B_headacce\d*|F_head_headacce(?:_[a-z0-9]+)*)$/i.test(slotName)) return "headAccessory";
    if (/^(?:B_|F_).*accehair/i.test(slotName)) return "hairAccessory";
    if (/^(?:B_|F_)glass/i.test(slotName)) return "glasses";
    if (/^(?:B_|F_)(?:earing|acceea)/i.test(slotName)) return "earrings";
    if (/^(?:B_|F_)headphone/i.test(slotName)) return "headphones";
    if (/^(?:B_|F_)catear/i.test(slotName)) return "catEars";
    if (/^(?:B_|F_)neck/i.test(slotName)) return "neck";
    return null;
  }

  function componentGroupFromKey(key) { return String(key).split(":", 1)[0]; }

  function componentsByGroup(components) {
    const grouped = new Map();
    for (const component of components) {
      const group = componentGroupFromKey(component.key);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(component);
    }
    return grouped;
  }

  function selectedComponentKeys() { return [...state.componentSelections.values()]; }

  function isPlaceholderRegion(attachment) {
    const region = attachment?.region;
    return !region || region.width <= 1 || region.height <= 1;
  }

  function hasIdenticalBoneLayout(current, source) {
    const currentBones = current.skeletonData?.bones || [];
    const sourceBones = source.skeletonData?.bones || [];
    return currentBones.length > 0
      && currentBones.length === sourceBones.length
      && currentBones.every((bone, index) => (
        bone.name === sourceBones[index]?.name
        && (bone.parent?.name || "") === (sourceBones[index]?.parent?.name || "")
      ));
  }

  function isUsableExperimentalMesh(attachment) {
    return attachment instanceof spine.MeshAttachment
      && attachment.worldVerticesLength > 0
      && Array.isArray(attachment.triangles)
      && attachment.triangles.length >= 3;
  }

  function isUsableComponentAttachment(attachment, group) {
    if (attachment instanceof spine.RegionAttachment) {
      return EXPERIMENTAL_GROUPS.has(group) ? Boolean(attachment.region) : !isPlaceholderRegion(attachment);
    }
    return EXPERIMENTAL_GROUPS.has(group) && isUsableExperimentalMesh(attachment);
  }

  function isReversedCostume(costume) { return /_r$/i.test(costume?.bundle || ""); }

  function sourceCostume(character, costume) {
    return { ...costume, characterId: character.id, characterName: character.name };
  }

  function isCompatibleComponentSource(current, costume) {
    return Boolean(
      costume
      && costume.family === current.costume.family
      && !isReversedCostume(costume)
      && !(costume.characterId === current.character.id && costume.bundle === current.costume.bundle)
    );
  }

  function allCrossRigCostumes(current) {
    const sources = [];
    for (const character of CHARACTERS) {
      for (const costume of state.catalog.get(character.id) || []) sources.push(sourceCostume(character, costume));
    }
    return sources.filter((costume) => isCompatibleComponentSource(current, costume));
  }

  function sameSlotTarget(current, source, entry) {
    const sourceSlot = source.skeletonData.slots[entry.slotIndex];
    const targetSlot = current.skeletonData.findSlot(sourceSlot?.name || "");
    const sourceBone = sourceSlot?.boneData?.name;
    const targetBone = targetSlot?.boneData?.name;
    return Boolean(sourceSlot && targetSlot && targetSlot.name === sourceSlot.name && sourceBone && targetBone === sourceBone);
  }

  async function ensureComponentTexture(source) {
    if (source.texture) return source.texture;
    if (!source.texturePromise) {
      source.texturePromise = loadTexture(costumeUrl(source.costume, "sekai_atlas.png"), source.atlas.pages[0].pma)
        .then((texture) => {
          source.atlas.pages[0].setTexture(spine.SpineTexture.from(texture.baseTexture));
          source.texture = texture;
          return texture;
        });
    }
    return source.texturePromise;
  }

  async function parseComponentSource(costume) {
    const cacheKey = `${costume.characterId}:${costume.family}:${costume.bundle}`;
    const cached = state.componentSourceCache.get(cacheKey);
    if (cached) return cached;
    const [atlasText, skeletonBytes] = await Promise.all([
      fetch(costumeUrl(costume, "sekai_atlas.atlas.txt"), { mode: "cors" }).then((response) => {
        if (!response.ok) throw new Error(`组件图集 HTTP ${response.status}`);
        return response.text();
      }),
      fetchSkeleton(costume.family),
    ]);
    const atlas = new spine.TextureAtlas(atlasText);
    const source = { costume, atlas, texture: null, texturePromise: null, skeletonData: null };
    const parseSkeleton = () => {
      const parser = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
      parser.scale = 0.31;
      return parser.readSkeletonData(skeletonBytes);
    };
    try {
      source.skeletonData = parseSkeleton();
    } catch (error) {
      await ensureComponentTexture(source);
      source.skeletonData = parseSkeleton();
    }
    state.componentSourceCache.set(cacheKey, source);
    return source;
  }

  function componentChoicesFromSource(current, costume, source, crossRigMode) {
    const canUseExperimentalMeshes = crossRigMode && hasIdenticalBoneLayout(current, source);
    const skin = source.skeletonData.defaultSkin || source.skeletonData.skins.find((item) => item.name === "default") || source.skeletonData.skins[0];
    const bundles = new Map();
    for (const entry of skin.getAttachments()) {
      const slotName = source.skeletonData.slots[entry.slotIndex]?.name || "";
      const group = componentGroupForSlot(slotName, crossRigMode);
      if (!group || (EXPERIMENTAL_GROUPS.has(group) && !canUseExperimentalMeshes)) continue;
      if (EXPERIMENTAL_GROUPS.has(group) && entry.name !== slotName) continue;
      if (!isUsableComponentAttachment(entry.attachment, group) || !sameSlotTarget(current, source, entry)) continue;
      if (!bundles.has(group)) bundles.set(group, []);
      bundles.get(group).push(entry);
    }
    const choices = [];
    for (const [group, entries] of bundles) {
      const expectedSlots = group === "outfit" ? EXPERIMENTAL_OUTFIT_SLOTS : group === "legs" ? EXPERIMENTAL_LEG_SLOTS : null;
      const presentSlots = new Set(entries.map((entry) => source.skeletonData.slots[entry.slotIndex]?.name));
      if (expectedSlots && (entries.length !== expectedSlots.size || presentSlots.size !== expectedSlots.size)) continue;
      choices.push({
        key: `${group}:${costume.characterId}:${costume.bundle}`,
        label: `${costume.characterName} · ${costume.label}`,
        source,
        targets: entries.map((entry) => ({
          slotName: source.skeletonData.slots[entry.slotIndex].name,
          attachmentName: entry.name,
          attachment: entry.attachment,
        })),
      });
    }
    return choices;
  }

  async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let nextIndex = 0;
    async function worker() {
      while (nextIndex < items.length) {
        const index = nextIndex;
        nextIndex += 1;
        results[index] = await mapper(items[index], index);
      }
    }
    await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
    return results;
  }

  async function buildComponentCatalog(current, crossRigMode) {
    const cacheKey = `${current.character.id}:${current.costume.bundle}:${current.costume.family}:${crossRigMode ? "cross" : "safe"}`;
    const cached = state.componentCatalogCache.get(cacheKey);
    if (cached) return cached;
    if (isReversedCostume(current.costume)) {
      state.componentCatalogCache.set(cacheKey, []);
      return [];
    }
    const sourceCostumes = crossRigMode
      ? allCrossRigCostumes(current)
      : (state.catalog.get(current.character.id) || []).map((costume) => sourceCostume(current.character, costume)).filter((costume) => isCompatibleComponentSource(current, costume));
    let completed = 0;
    const choices = await mapWithConcurrency(sourceCostumes, 6, async (costume) => {
      try {
        const source = await parseComponentSource(costume);
        return componentChoicesFromSource(current, costume, source, crossRigMode);
      } catch (error) {
        console.warn("Skipping unreadable component source", costume.bundle, error);
        return [];
      } finally {
        completed += 1;
        if (state.current === current && completed < sourceCostumes.length) {
          dom.componentStatus.textContent = `正在核对组件：${completed} / ${sourceCostumes.length}`;
        }
      }
    });
    const built = choices.flat();
    state.componentCatalogCache.set(cacheKey, built);
    return built;
  }

  function setComponentControlsDisabled(disabled) {
    dom.componentOptions.querySelectorAll("select").forEach((select) => { select.disabled = disabled; });
    dom.crossRigMode.disabled = disabled || !state.current || isReversedCostume(state.current.costume);
    dom.resetComponents.disabled = disabled || state.componentSelections.size === 0;
  }

  function componentStatusText() {
    const selections = selectedComponentKeys();
    if (!selections.length) return "可按类别叠加已校验的官方组件。";
    const labels = selections.map((key) => state.current.components.find((item) => item.key === key)?.label).filter(Boolean);
    return `已叠加 ${labels.length} 项：${labels.join("；")}。`;
  }

  function refreshComponentControls(current, components) {
    current.components = components;
    dom.componentGroup.hidden = false;
    dom.componentOptions.textContent = "";
    dom.crossRigMode.checked = state.crossRigMode;
    if (isReversedCostume(current.costume)) {
      dom.componentStatus.textContent = "反向版本会保持完整服装显示。";
      setComponentControlsDisabled(true);
      return;
    }
    const orderedGroups = [...componentsByGroup(components).entries()].sort(([left], [right]) => (
      Object.keys(COMPONENT_GROUP_LABELS).indexOf(left) - Object.keys(COMPONENT_GROUP_LABELS).indexOf(right)
    ));
    for (const [group, choices] of orderedGroups) {
      const row = document.createElement("label");
      row.className = "component-row";
      const name = document.createElement("span");
      name.textContent = COMPONENT_GROUP_LABELS[group] || group;
      const select = document.createElement("select");
      option(select, NONE, "保持当前 / Keep current");
      for (const choice of choices) option(select, choice.key, choice.label);
      select.value = state.componentSelections.get(group) || NONE;
      select.disabled = state.loading || state.componentCatalogLoading;
      select.addEventListener("change", () => applyComponentChoice(group, select.value));
      row.append(name, select);
      dom.componentOptions.append(row);
    }
    dom.componentStatus.textContent = components.length
      ? componentStatusText()
      : state.crossRigMode ? "当前范围内没有通过槽位校验的组件。" : "当前角色的服装中没有可单独叠加的组件。";
    setComponentControlsDisabled(state.loading || state.componentCatalogLoading);
  }

  async function loadComponentCatalog(current) {
    const epoch = ++state.componentCatalogEpoch;
    const crossRigMode = state.crossRigMode;
    state.componentCatalogLoading = true;
    dom.componentGroup.hidden = false;
    setComponentControlsDisabled(true);
    dom.componentStatus.textContent = crossRigMode ? "正在核对同运行家族的组件..." : "正在核对当前角色的组件...";
    try {
      const components = await buildComponentCatalog(current, crossRigMode);
      if (state.current !== current || state.componentCatalogEpoch !== epoch) return;
      state.componentCatalogLoading = false;
      refreshComponentControls(current, components);
    } catch (error) {
      console.error(error);
      if (state.current !== current || state.componentCatalogEpoch !== epoch) return;
      state.componentCatalogLoading = false;
      refreshComponentControls(current, []);
      dom.componentStatus.textContent = `组件目录读取失败：${error.message}`;
    }
  }

  async function rebuildComponentOverrides(current) {
    const selected = selectedComponentKeys().map((key) => current.components.find((item) => item.key === key)).filter(Boolean);
    for (const component of selected) await ensureComponentTexture(component.source);
    const bySlot = new Map();
    for (const component of selected) {
      const group = componentGroupFromKey(component.key);
      for (const target of component.targets) {
        const existing = bySlot.get(target.slotName);
        if (existing && existing.group !== group) throw new Error(`${target.slotName} 同时属于两个组件类别`);
        bySlot.set(target.slotName, { slotName: target.slotName, attachment: target.attachment.copy(), group });
      }
    }
    state.componentOverrides = [...bySlot.values()].map(({ slotName, attachment }) => ({ slotName, attachment }));
  }

  async function applyComponentChoice(group, key) {
    if (!state.current || state.loading || state.componentCatalogLoading) return;
    const previousKey = state.componentSelections.get(group);
    if (key === NONE) state.componentSelections.delete(group);
    else state.componentSelections.set(group, key);
    try {
      setComponentControlsDisabled(true);
      await rebuildComponentOverrides(state.current);
      seekCurrent(state.current.entry?.trackTime || 0);
      renderNow();
      dom.componentStatus.textContent = componentStatusText();
    } catch (error) {
      console.error(error);
      if (previousKey) state.componentSelections.set(group, previousKey);
      else state.componentSelections.delete(group);
      await rebuildComponentOverrides(state.current);
      dom.componentStatus.textContent = `组件替换失败：${error.message}`;
    } finally {
      refreshComponentControls(state.current, state.current.components);
    }
  }

  function resetComponentChoices() {
    if (!state.current || state.loading || state.componentCatalogLoading) return;
    state.componentSelections.clear();
    state.componentOverrides = [];
    seekCurrent(state.current.entry?.trackTime || 0);
    renderNow();
    refreshComponentControls(state.current, state.current.components || []);
    dom.componentStatus.textContent = "已恢复当前服装的全部组件。";
  }

  async function onCrossRigModeChange() {
    if (!state.current || state.loading || state.componentCatalogLoading || isReversedCostume(state.current.costume)) {
      dom.crossRigMode.checked = state.crossRigMode;
      return;
    }
    state.crossRigMode = dom.crossRigMode.checked;
    state.componentSelections.clear();
    state.componentOverrides = [];
    seekCurrent(state.current.entry?.trackTime || 0);
    renderNow();
    await loadComponentCatalog(state.current);
  }

  function installFaceOverrideRenderHook(display) {
    const original = display.updateSpineTransform;
    display.updateSpineTransform = function updateSpineTransformWithFaceOverrides() {
      original.call(this);
      if (state.current?.display !== this) return;
      applyFaceOverrides();
      applyComponentOverrides();
      this.updateGeometry();
      this.sortChildren();
    };
  }

  function updateBackground() {
    if (!state.backgroundGraphic) return;
    state.backgroundGraphic.clear();
    state.backgroundGraphic.beginFill(Number.parseInt(state.background.slice(1), 16), state.transparent ? 0 : 1);
    state.backgroundGraphic.drawRect(0, 0, SIZE, SIZE);
    state.backgroundGraphic.endFill();
  }

  function updateTransform() {
    if (!state.current) return;
    const baseScale = state.current.character.key === "miku" ? 3.49 : 3.75;
    state.current.display.x = SIZE / 2;
    state.current.display.y = 674 + state.offsetY;
    state.current.display.scale.set(baseScale * state.scale / 100);
  }

  function fallbackCostumes() {
    const map = new Map();
    for (const character of CHARACTERS) {
      map.set(character.id, [{ bundle: character.defaultBundle, family: "legacy", label: "01 · normal" }]);
    }
    return map;
  }

  async function loadCatalog() {
    const [costume2ds, character2ds, legacyBundles, v2Bundles] = await Promise.all([
      fetchJson("costume2ds.json"), fetchJson("character2ds.json"), listBundles(LEGACY_PREFIX), listBundles(V2_PREFIX),
    ]);
    const characterBy2d = new Map(character2ds.map((entry) => [entry.id, entry.characterId]));
    const canonical = new Set(CHARACTERS.map((character) => character.id));
    const catalog = new Map(CHARACTERS.map((character) => [character.id, []]));
    const seen = new Set();
    for (const record of costume2ds) {
      const bundle = record.spineAssetbundleName;
      if (!bundle) continue;
      const characterId = characterBy2d.get(record.character2dId);
      const family = familyFor(bundle);
      const present = family === "v2" ? v2Bundles.has(bundle) : legacyBundles.has(bundle);
      if (!canonical.has(characterId) || !present || seen.has(`${characterId}:${bundle}`)) continue;
      seen.add(`${characterId}:${bundle}`);
      catalog.get(characterId).push({
        bundle, family, label: labelForCostume(bundle, record.costume2dGroupId || 0), groupId: record.costume2dGroupId || 0,
      });
    }
    for (const character of CHARACTERS) {
      const choices = catalog.get(character.id);
      if (!choices.some((choice) => choice.bundle === character.defaultBundle)) {
        choices.push({ bundle: character.defaultBundle, family: "legacy", label: "01 · normal", groupId: 1 });
      }
      choices.sort((left, right) => left.groupId - right.groupId || left.label.localeCompare(right.label));
    }
    state.catalog = catalog;
  }

  function populateCostumes(characterId, selectedBundle) {
    const choices = state.catalog.get(characterId) || [];
    dom.costume.textContent = "";
    for (const choice of choices) option(dom.costume, choice.bundle, choice.label);
    dom.costume.value = selectedBundle || choices[0]?.bundle || "";
    dom.costume.disabled = choices.length < 2 || state.loading;
  }

  async function checkSource() {
    dom.check.disabled = true;
    dom.result.textContent = "正在检查资源连接 / Checking source…";
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 15000);
    try {
      // Some browser proxies reject cross-origin HEAD even though the GET used by
      // the renderer is allowed. A single-byte GET verifies the real code path
      // without downloading the entire skeleton.
      const response = await fetch(probeUrl(), {
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: { Range: "bytes=0-0" },
        signal: controller.signal,
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      response.body?.cancel().catch(() => {});
      dom.result.textContent = `资源连接正常 / Source reachable: ${response.status} ${response.statusText || "OK"}`;
    } catch (error) {
      const detail = error?.name === "AbortError"
        ? "请求超时 / Request timed out"
        : error?.message || "Network request failed";
      dom.result.textContent = `资源连接失败 / Source blocked: ${detail}`;
    } finally {
      window.clearTimeout(timeout);
      dom.check.disabled = state.loading;
    }
  }

  async function fetchSkeleton(family) {
    if (state.skeletons.has(family)) return state.skeletons.get(family);
    const url = new URL(skeletonUrl(family));
    url.searchParams.set("range", "1");
    const chunks = [];
    let offset = 0;

    // The official skeletons are several megabytes. Fetching them in bounded
    // ranges avoids failures from browser proxies that stall large responses.
    for (let attempt = 0; attempt < 64; attempt += 1) {
      const end = offset + SKELETON_CHUNK_SIZE - 1;
      const response = await fetch(url.href, {
        mode: "cors",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        cache: "no-store",
        headers: { Range: `bytes=${offset}-${end}` },
      });
      if (response.status === 416 && chunks.length) break;
      if (!response.ok) throw new Error(`Skeleton HTTP ${response.status}`);
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (response.status === 200) {
        state.skeletons.set(family, bytes);
        return bytes;
      }
      if (response.status !== 206 || bytes.length === 0) {
        throw new Error(`Skeleton range HTTP ${response.status}`);
      }
      chunks.push(bytes);
      offset += bytes.length;
      if (bytes.length < SKELETON_CHUNK_SIZE) break;
    }

    if (!chunks.length) throw new Error("Skeleton response was empty");
    const combined = new Uint8Array(offset);
    let cursor = 0;
    for (const chunk of chunks) {
      combined.set(chunk, cursor);
      cursor += chunk.length;
    }
    state.skeletons.set(family, combined);
    return combined;
  }

  async function loadTexture(url, pma) {
    const texture = PIXI.Texture.from(url, { alphaMode: pma ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK });
    if (!texture.baseTexture.valid) {
      await new Promise((resolve, reject) => {
        texture.baseTexture.once("loaded", resolve);
        texture.baseTexture.once("error", () => reject(new Error("Texture request failed")));
      });
    }
    return texture;
  }

  function listActions(skeletonData) {
    return skeletonData.animations.map((animation) => ({
      name: animation.name, duration: animation.duration, label: actionLabel(animation.name),
    }));
  }

  function chooseDefaultAction(actions) { return actions.find((item) => item.name.endsWith("pose_default")) || actions[0]; }

  function selectedAction(actions, name) {
    return actions.find((item) => item.name === name) || chooseDefaultAction(actions);
  }

  function populateActions(actions, selectedName) {
    dom.action.textContent = "";
    for (const action of actions) option(dom.action, action.name, action.label);
    dom.action.value = selectedName;
  }

  function selectedCostume(characterId, bundle) {
    const choices = state.catalog.get(characterId) || [];
    return choices.find((choice) => choice.bundle === bundle) || choices[0];
  }

  async function loadCharacter(id, bundle) {
    const character = CHARACTERS.find((item) => item.id === Number(id));
    const costume = character && selectedCostume(character.id, bundle || character.defaultBundle);
    if (!character || !costume || state.loading) return;
    const request = ++state.request;
    setBusy(true);
    setState("", `正在加载 ${character.name} / Loading ${character.name}`, "正在直接从资源来源加载所选 Spine 图集与纹理。 / Fetching the selected Spine atlas and texture in this browser.");
    try {
      if (!window.PIXI || !window.spine) throw new Error("浏览器运行时未加载 / The browser runtime did not load");
      const [skeletonBytes, atlasText] = await Promise.all([
        fetchSkeleton(costume.family),
        fetch(costumeUrl(costume, "sekai_atlas.atlas.txt"), {
          mode: "cors", credentials: "omit", referrerPolicy: "no-referrer",
        }).then((response) => {
          if (!response.ok) throw new Error(`Atlas HTTP ${response.status}`);
          return response.text();
        }),
      ]);
      const atlas = new spine.TextureAtlas(atlasText);
      const texture = await loadTexture(costumeUrl(costume, "sekai_atlas.png"), atlas.pages[0].pma);
      if (request !== state.request) return;
      atlas.pages[0].setTexture(spine.SpineTexture.from(texture.baseTexture));
      const parser = new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas));
      parser.scale = 0.31;
      const skeletonData = parser.readSkeletonData(skeletonBytes);
      const display = new spine.Spine(skeletonData, { autoUpdate: false });
      installFaceOverrideRenderHook(display);
       const actions = listActions(skeletonData);
       const action = chooseDefaultAction(actions);
       if (!action) throw new Error("No animation was found in this skeleton");
       if (state.current) state.app.stage.removeChild(state.current.display);
       state.face = { eyes: DEFAULT, brows: DEFAULT, mouth: DEFAULT, cheeks: NONE, effect: NONE };
       state.componentSelections = new Map();
       state.componentOverrides = [];
       state.crossRigMode = false;
       state.current = {
         character, costume, display, skeletonData, face: buildFaceCatalog(skeletonData, character.sex),
         actions, action, entry: null, components: [],
       };
       updateTransform();
       state.app.stage.addChild(display);
       seekCurrent(0);
       populateActions(actions, action.name);
       populateCostumes(character.id, costume.bundle);
       populateFaceControls(state.current);
       loadComponentCatalog(state.current);
      dom.status.classList.add("hidden");
      dom.state.className = "state-pill ok";
      dom.state.textContent = "已就绪 / Ready";
      dom.result.textContent = `${character.name} · ${costume.label}`;
    } catch (error) {
      console.error(error);
      if (request === state.request) {
        setState("fail", "无法加载所选小人 / Unable to load the selected character", error.message);
        dom.result.textContent = `加载失败 / Load failed: ${error.message}`;
      }
    } finally {
      if (request === state.request) setBusy(false);
    }
  }

  function chooseAction() {
    if (!state.current || state.loading) return;
    state.current.action = selectedAction(state.current.actions, dom.action.value);
    seekCurrent(0);
    renderNow();
  }

  function changeFace(category, select) {
    if (!state.current || state.loading) return;
    state.face[category] = select.value;
    applyFaceOverrides();
    state.current.display.updateGeometry();
  }

  function seekCurrent(time = 0) {
    if (!state.current) return;
    const current = state.current;
    current.display.skeleton.setToSetupPose();
    current.display.state.clearTracks();
    const entry = current.display.state.setAnimation(0, current.action.name, true);
    entry.trackTime = Math.max(0, time);
    current.entry = entry;
    current.display.update(0);
    updateTransform();
    applyFaceOverrides();
    applyComponentOverrides();
    current.display.updateGeometry();
  }

  function renderNow() {
    if (state.app) state.app.renderer.render(state.app.stage);
  }

  function fitCanvasToPreview() {
    const grid = dom.canvas.closest(".preview-grid");
    if (!grid) return;
    const size = Math.max(1, Math.floor(Math.min(grid.clientWidth, grid.clientHeight, SIZE)));
    dom.canvas.style.setProperty("width", `${size}px`, "important");
    dom.canvas.style.setProperty("height", `${size}px`, "important");
  }

  function watchPreviewSize() {
    fitCanvasToPreview();
    if (typeof ResizeObserver !== "undefined") {
      canvasResizeObserver?.disconnect();
      canvasResizeObserver = new ResizeObserver(fitCanvasToPreview);
      canvasResizeObserver.observe(dom.canvas.closest(".preview-grid"));
    } else if (!canvasResizeListenerInstalled) {
      window.addEventListener("resize", fitCanvasToPreview, { passive: true });
      canvasResizeListenerInstalled = true;
    }
  }

  function canvasToBlob(canvas, type) {
    return new Promise((resolve, reject) => canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("浏览器未能读取画布内容"));
    }, type));
  }

  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function safeFilename(text) {
    return text.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "") || "pose";
  }

  async function downloadPng() {
    if (!state.current || state.loading) return;
    try {
      state.app.renderer.render(state.app.stage);
      const blob = await canvasToBlob(dom.canvas, "image/png");
      downloadBlob(blob, `sekai-chibi-${state.current.character.key}-${safeFilename(state.current.action.name)}.png`);
      dom.result.textContent = "PNG 已开始下载 / PNG download started";
    } catch (error) {
      dom.result.textContent = `PNG 导出失败 / PNG export failed: ${error.message}`;
    }
  }

  async function loadGifEncoder() {
    if (!gifencModulePromise) gifencModulePromise = import(GIFENC_URL);
    return gifencModulePromise;
  }

  function nextPaint() {
    return new Promise((resolve) => requestAnimationFrame(resolve));
  }

  function normalizeGifPalette(palette, transparent) {
    if (!transparent) return { palette, transparentIndex: -1 };
    const normalized = palette.slice();
    const transparentIndex = normalized.findIndex((color) => color.length === 4 && color[3] === 0);
    if (transparentIndex >= 0) {
      const [clear] = normalized.splice(transparentIndex, 1);
      normalized.unshift(clear);
    } else {
      // Keep a deterministic transparent entry even if the sampled frames had no clear pixels.
      normalized.unshift([0, 0, 0, 0]);
      if (normalized.length > 256) normalized.pop();
    }
    return { palette: normalized, transparentIndex: 0 };
  }

  async function downloadGif() {
    if (!state.current || state.loading) return;
    const current = state.current;
    const action = current.action;
    const fps = Number(dom.gifFps.value);
    const duration = Math.min(action.duration || 0, 4);
    const frameCount = duration > 0 ? Math.min(120, Math.max(2, Math.ceil(duration * fps))) : 1;
    const resumeAt = current.entry?.trackTime || 0;
    const ticker = state.app?.ticker;
    const tickerWasStarted = Boolean(ticker?.started);
    setBusy(true);
    if (tickerWasStarted) ticker.stop();
    try {
      const { GIFEncoder, quantize, applyPalette } = await loadGifEncoder();
      const encoder = GIFEncoder();
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = GIF_SIZE;
      frameCanvas.height = GIF_SIZE;
      const context = frameCanvas.getContext("2d", { willReadFrequently: true });
      const paletteFormat = state.transparent ? "rgba4444" : "rgb565";
      const delay = Math.round(1000 / fps);

      const captureFrame = () => {
        context.clearRect(0, 0, GIF_SIZE, GIF_SIZE);
        context.drawImage(dom.canvas, 0, 0, GIF_SIZE, GIF_SIZE);
        return new Uint8ClampedArray(context.getImageData(0, 0, GIF_SIZE, GIF_SIZE).data);
      };

      // A global palette keeps stable colors and one transparent index across frames.
      const sampleCount = Math.min(8, frameCount);
      const frameBytes = GIF_SIZE * GIF_SIZE * 4;
      const palettePixels = new Uint8ClampedArray(sampleCount * frameBytes);
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const index = sampleCount === 1
          ? 0
          : Math.round(sample * (frameCount - 1) / (sampleCount - 1));
        seekCurrent(duration > 0 ? index / fps : 0);
        renderNow();
        palettePixels.set(captureFrame(), sample * frameBytes);
      }
      dom.result.textContent = "正在准备 GIF 调色板 / Preparing GIF palette";
      const quantizedPalette = quantize(palettePixels, 256, state.transparent
          ? { format: paletteFormat, oneBitAlpha: 127, clearAlpha: true, clearAlphaThreshold: 127 }
          : { format: paletteFormat });
      const { palette, transparentIndex } = normalizeGifPalette(quantizedPalette, state.transparent);

      for (let index = 0; index < frameCount; index += 1) {
        seekCurrent(duration > 0 ? index / fps : 0);
        renderNow();
        const indexed = applyPalette(captureFrame(), palette, paletteFormat);
        encoder.writeFrame(indexed, GIF_SIZE, GIF_SIZE, {
          ...(index === 0 ? { palette, repeat: 0 } : {}),
          delay,
          dispose: state.transparent ? 2 : 0,
          transparent: transparentIndex >= 0, transparentIndex,
        });
        dom.result.textContent = `正在生成 GIF：${index + 1} / ${frameCount}`;
        await nextPaint();
      }
      encoder.finish();
      const blob = new Blob([encoder.bytes()], { type: "image/gif" });
      downloadBlob(blob, `sekai-chibi-${current.character.key}-${safeFilename(action.name)}.gif`);
      dom.result.textContent = `GIF 已开始下载 / GIF download started (${frameCount} frames, ${fps} fps)`;
    } catch (error) {
      console.error(error);
      dom.result.textContent = `GIF 导出失败 / GIF export failed: ${error.message}`;
    } finally {
      seekCurrent(resumeAt);
      renderNow();
      if (tickerWasStarted) ticker.start();
      setBusy(false);
    }
  }

  function populateCharacterList() {
    for (const character of CHARACTERS) option(dom.character, String(character.id), `${String(character.id).padStart(2, "0")} · ${character.name}`);
  }

  async function startRenderer() {
    if (!window.PIXI || !window.spine) {
      setState("fail", "浏览器运行时不可用 / Browser runtime is unavailable", "请检查 Pixi 与 Spine 运行时网址的网络访问，然后刷新页面。 / Check the configured runtime URLs, then reload.");
      return;
    }
    state.app = new PIXI.Application({
      view: dom.canvas, width: SIZE, height: SIZE, backgroundAlpha: 0, antialias: true, preserveDrawingBuffer: true, autoDensity: true, resolution: 1,
    });
    watchPreviewSize();
    dom.origin.textContent = config.assetOrigin;
    state.backgroundGraphic = new PIXI.Graphics();
    state.app.stage.addChild(state.backgroundGraphic);
    updateBackground();
    state.app.ticker.add(() => {
      if (state.current) state.current.display.update(state.app.ticker.deltaMS / 1000);
    });
    populateCharacterList();
    dom.character.addEventListener("change", () => loadCharacter(dom.character.value));
    dom.costume.addEventListener("change", () => loadCharacter(dom.character.value, dom.costume.value));
    dom.crossRigMode.addEventListener("change", onCrossRigModeChange);
    dom.resetComponents.addEventListener("click", resetComponentChoices);
    dom.action.addEventListener("change", chooseAction);
    dom.eyes.addEventListener("change", () => changeFace("eyes", dom.eyes));
    dom.brows.addEventListener("change", () => changeFace("brows", dom.brows));
    dom.mouth.addEventListener("change", () => changeFace("mouth", dom.mouth));
    dom.cheeks.addEventListener("change", () => changeFace("cheeks", dom.cheeks));
    dom.effect.addEventListener("change", () => changeFace("effect", dom.effect));
    dom.background.addEventListener("input", () => { state.background = dom.background.value; updateBackground(); });
    dom.transparent.addEventListener("change", () => { state.transparent = dom.transparent.checked; updateBackground(); });
    dom.scale.addEventListener("input", () => { state.scale = Number(dom.scale.value); dom.scaleValue.value = `${state.scale}%`; updateTransform(); });
    dom.offsetY.addEventListener("input", () => { state.offsetY = Number(dom.offsetY.value); dom.offsetYValue.value = String(state.offsetY); updateTransform(); });
    dom.check.addEventListener("click", checkSource);
    dom.download.addEventListener("click", downloadPng);
    dom.downloadGif.addEventListener("click", downloadGif);
    window.__sekaiChibiWeb = {
      get ready() { return Boolean(state.current) && !state.loading; },
      get character() { return state.current?.character.key || null; },
      get costume() { return state.current?.costume.bundle || null; },
      get costumeCount() { return state.current ? (state.catalog.get(state.current.character.id) || []).length : 0; },
      diagnostics() {
        return {
          character: state.current?.character.key || null,
          costume: state.current?.costume.bundle || null,
          action: state.current?.action?.name || null,
          actionDuration: state.current?.action?.duration || 0,
          crossRigMode: state.crossRigMode,
          componentCatalogLoading: state.componentCatalogLoading,
          componentGroups: [...new Set((state.current?.components || []).map((item) => componentGroupFromKey(item.key)))],
          components: selectedComponentKeys(),
        };
      },
      async setCrossRigMode(enabled) {
        dom.crossRigMode.checked = Boolean(enabled);
        await onCrossRigModeChange();
        return state.crossRigMode;
      },
      async selectComponent(group, key) { await applyComponentChoice(group, key); },
      async exportGif() { await downloadGif(); },
    };
    try {
      await loadCatalog();
    } catch (error) {
      console.warn("Catalog metadata unavailable; using default costumes.", error);
      state.catalog = fallbackCostumes();
      dom.result.textContent = `服装目录回退 / Catalog fallback: ${error.message}`;
    }
    const first = CHARACTERS[0];
    populateCostumes(first.id, first.defaultBundle);
    checkSource();
    loadCharacter(first.id, first.defaultBundle);
  }

  startRenderer();
})();
