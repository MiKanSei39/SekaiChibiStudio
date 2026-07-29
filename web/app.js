/* global PIXI, spine */

(() => {
  "use strict";

  const SIZE = 768;
  const GIF_SIZE = 512;
  const DEFAULT = "__action_default";
  const NONE = "__none";

  const CHARACTERS = [
    [1, "星乃一歌", "w"], [2, "天马咲希", "w"], [3, "望月穗波", "w"], [4, "日野森志步", "w"],
    [5, "花里实乃理", "w"], [6, "桐谷遥", "w"], [7, "桃井爱莉", "w"], [8, "日野森雫", "w"],
    [9, "小豆泽心羽", "w"], [10, "白石杏", "w"], [11, "东云彰人", "m"], [12, "青柳冬弥", "m"],
    [13, "天马司", "m"], [14, "凤笑梦", "w"], [15, "草薙宁宁", "w"], [16, "神代类", "m"],
    [17, "宵崎奏", "w"], [18, "朝比奈真冬", "w"], [19, "东云绘名", "w"], [20, "晓山瑞希", "w"],
    [21, "初音未来", "w"], [22, "镜音铃", "w"], [23, "镜音连", "m"],
    [24, "巡音流歌", "w"], [25, "MEIKO", "w"], [26, "KAITO", "m"],
  ].map(([id, name, sex]) => ({ id, name, sex }));

  const ACTION_WORDS = {
    adult: "成熟", angry: "生气", cool: "冷静", cute: "可爱", doubt: "困惑", happy: "开心",
    idle: "待机", joy: "高兴", laugh: "大笑", listen: "倾听", normal: "普通", pure: "纯真",
    sad: "难过", staff: "持杖", surprise: "惊讶", talk: "说话", walk: "走路",
    general: "通用", wait: "等待", kohaneunit: "心羽服", emucloth: "笑梦服", nenecloth: "宁宁服",
  };
  const FACE_WORDS = {
    normal: "普通", half: "半睁", close: "闭眼", smile: "笑眼", kira: "闪亮", tearwhite: "泪光",
    jitome: "眯眼", noriclose: "上扬闭眼", marume: "圆眼", marume_small: "小圆眼",
    wmarume: "圆眼", wmarumes: "小圆眼", batsume: "竖眼", tare: "下垂", turi: "上挑",
    yuru: "平缓", bigsmile: "大笑", smileclose: "闭口笑", cat: "猫嘴", catclose: "闭口猫嘴",
    mimizu: "波浪嘴", mimizuclose: "闭口波浪", ievanpolkka: "葱歌", angryclose: "闭口生气",
    angry: "生气", sadclose: "闭口难过", sad: "难过", pukuu: "鼓脸", guru: "圈圈脸颊",
    shyline: "害羞线", shy: "害羞", shyline2: "害羞线 2", heart: "爱心", sweat1: "汗滴 1", sweat2: "汗滴 2",
    tear: "眼泪", waterfall: "泪瀑",
  };

  const dom = {
    character: document.querySelector("#character"),
    costumeGroup: document.querySelector("#costume-group"),
    costume: document.querySelector("#costume"),
    costumeStatus: document.querySelector("#costume-status"),
    componentGroup: document.querySelector("#component-group"),
    componentOptions: document.querySelector("#component-options"),
    crossRigMode: document.querySelector("#cross-rig-mode"),
    resetComponents: document.querySelector("#reset-components"),
    componentStatus: document.querySelector("#component-status"),
    action: document.querySelector("#action"),
    eyes: document.querySelector("#eyes"),
    brows: document.querySelector("#brows"),
    mouth: document.querySelector("#mouth"),
    cheeks: document.querySelector("#cheeks"),
    effect: document.querySelector("#effect"),
    background: document.querySelector("#background"),
    transparent: document.querySelector("#transparent"),
    gifFps: document.querySelector("#gif-fps"),
    scale: document.querySelector("#scale"),
    scaleValue: document.querySelector("#scale-value"),
    offsetY: document.querySelector("#offset-y"),
    offsetYValue: document.querySelector("#offset-y-value"),
    canvas: document.querySelector("#stage"),
    stageShell: document.querySelector(".stage-shell"),
    loading: document.querySelector("#loading"),
    characterStatus: document.querySelector("#character-status"),
    png: document.querySelector("#download-png"),
    gif: document.querySelector("#download-gif"),
    exportStatus: document.querySelector("#export-status"),
  };

  const state = {
    app: null,
    stage: null,
    backgroundGraphic: null,
    current: null,
    busy: false,
    transparent: false,
    background: "#fff8fb",
    scale: 100,
    offsetY: 0,
    costume: "",
    componentSelections: new Map(),
    componentOverrides: [],
    crossRigMode: false,
    componentSourceCache: new Map(),
    componentCatalogCache: new Map(),
    // A catalog can still be parsing while the user changes mode or costume.
    // Only the latest request is allowed to write choices back into the UI.
    componentCatalogEpoch: 0,
    componentCatalogLoading: false,
    face: { eyes: DEFAULT, brows: DEFAULT, mouth: DEFAULT, cheeks: NONE, effect: NONE },
  };

  function setLoading(message, visible = true) {
    dom.loading.textContent = message;
    dom.loading.classList.toggle("hidden", !visible);
  }

  function setExportStatus(message, isError = false) {
    dom.exportStatus.textContent = message;
    dom.exportStatus.style.color = isError ? "#b42758" : "";
  }

  function setControlsEnabled(enabled) {
    [dom.action, dom.eyes, dom.brows, dom.mouth, dom.cheeks, dom.effect, dom.png, dom.gif, dom.gifFps]
      .forEach((element) => { element.disabled = !enabled; });
    dom.costume.disabled = !enabled || (state.current?.costumes?.length || 0) < 2;
    // Cross-rig mode must remain available even if this costume itself has no
    // replacement choices; another character may still provide a safe slot.
    setComponentControlsDisabled(!enabled || state.componentCatalogLoading);
  }

  function setComponentControlsDisabled(disabled) {
    dom.componentOptions.querySelectorAll("select").forEach((select) => { select.disabled = disabled; });
    dom.crossRigMode.disabled = disabled || Boolean(state.current?.isReversed);
    dom.resetComponents.disabled = disabled || state.componentSelections.size === 0;
  }

  function option(select, value, label) {
    const item = document.createElement("option");
    item.value = value;
    item.textContent = label;
    select.append(item);
  }

  function populateCharacterList() {
    for (const character of CHARACTERS) option(dom.character, String(character.id), `${String(character.id).padStart(2, "0")} · ${character.name}`);
    dom.character.value = "1";
  }

  function clearSelect(select) {
    select.textContent = "";
  }

  function startsWithAny(value, prefixes) {
    return prefixes.some((prefix) => value.startsWith(prefix));
  }

  function normalizeAttachmentName(name, prefix) {
    return name.slice(prefix.length)
      .replace(/_(?:f|m)(?:2)?$/i, "")
      .replace(/_v2$/i, "");
  }

  function normalizeEyeKey(key) {
    // The left eye atlas calls these two variants "wmarume", while the right
    // eye uses the equivalent generic names. Present each as one eye choice.
    return key.replace(/^09_wmarumes$/, "09_marume_small").replace(/^10_wmarume$/, "10_marume");
  }

  function isUsableFaceAttachment(entry) {
    const region = entry.attachment?.region;
    // Official *_f / *_f2 entries are often 1px transparent placeholders.
    return Boolean(region && region.width > 1 && region.height > 1);
  }

  function pickVariant(entries, sex) {
    const usable = entries.filter(isUsableFaceAttachment);
    const candidates = usable.length ? usable : entries;
    const preferredSuffix = sex === "m" ? /_m2?$/i : /_f2?$/i;
    return candidates.find((entry) => preferredSuffix.test(entry.name))
      || candidates.find((entry) => !/_(?:f|m)(?:2)?$/i.test(entry.name))
      || candidates[0];
  }

  function faceLabel(key) {
    const numeric = key.match(/^(\d+)_?(.*)$/);
    const number = numeric ? `${Number(numeric[1])}. ` : "";
    const words = (numeric ? numeric[2] : key).split("_").filter(Boolean);
    const translated = words.map((word) => FACE_WORDS[word] || word).join(" · ");
    return `${number}${translated || "表情"}`;
  }

  function humanizeActionToken(token) {
    const parts = token.match(/[a-z]+|\d+/gi) || [token];
    return parts.map((part) => ACTION_WORDS[part] || (/^\d+$/.test(part) ? `#${part}` : part)).join(" ");
  }

  function actionLabel(name) {
    if (name === "pose_default") return "默认站姿";
    const stripped = name.replace(/^v2_/i, "").replace(/_v2$/i, "").replace(/_f2$/i, "_f");
    const pieces = stripped.split("_");
    const facing = pieces.at(-1) === "f" ? "正面" : pieces.at(-1) === "b" ? "背面" : "";
    const translated = pieces.slice(1, facing ? -1 : undefined).map(humanizeActionToken).join(" · ");
    return `${translated || name}${facing ? `（${facing}）` : ""}`;
  }

  function groupEntries(entries, prefix, sex) {
    const groups = new Map();
    for (const entry of entries.filter((item) => item.name.startsWith(prefix))) {
      const key = normalizeAttachmentName(entry.name, prefix);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(entry);
    }
    return [...groups.entries()].map(([key, group]) => {
      const picked = pickVariant(group, sex);
      return {
        value: key,
        label: faceLabel(key),
        targets: [{ slotName: picked.slotName, attachmentName: picked.name }],
      };
    }).sort((left, right) => left.value.localeCompare(right.value, undefined, { numeric: true }));
  }

  function buildFaceCatalog(skeletonData, sex) {
    const skin = skeletonData.skins.find((item) => item.name === "default") || skeletonData.skins[0];
    const entries = skin.getAttachments().map((entry) => ({
      slotName: skeletonData.slots[entry.slotIndex]?.name,
      name: entry.name,
      attachment: entry.attachment,
    })).filter((entry) => entry.slotName && entry.name);

    const left = groupEntries(entries, "F_eyeL", sex);
    const right = groupEntries(entries, "F_eyeR", sex);
    const leftByKey = new Map(left.map((item) => {
      const value = normalizeEyeKey(item.value);
      return [value, { ...item, value, label: faceLabel(value) }];
    }));
    const rightByKey = new Map(right.map((item) => [normalizeEyeKey(item.value), item]));
    const eyes = [...leftByKey.keys()].filter((key) => rightByKey.has(key)).map((key) => ({
      value: key,
      label: faceLabel(key),
      targets: [...leftByKey.get(key).targets, ...rightByKey.get(key).targets],
    }));

    const brows = groupEntries(entries, "F_eyebrow", sex);
    const mouth = groupEntries(entries, "F_mouth", sex);
    const cheeks = groupEntries(entries, "F_cheek", sex);
    const effects = entries.filter((entry) => startsWithAny(entry.name, ["F_ef", "F_tear"]));
    const effectGroups = new Map();
    for (const entry of effects) {
      const key = normalizeAttachmentName(entry.name, entry.name.startsWith("F_ef") ? "F_ef" : "F_");
      if (!effectGroups.has(key)) effectGroups.set(key, []);
      effectGroups.get(key).push(entry);
    }
    const effect = [...effectGroups.entries()].map(([key, group]) => {
      const picked = pickVariant(group, sex);
      return { value: key, label: faceLabel(key), targets: [{ slotName: picked.slotName, attachmentName: picked.name }] };
    }).sort((leftItem, rightItem) => leftItem.value.localeCompare(rightItem.value, undefined, { numeric: true }));

    return {
      eyes, brows, mouth, cheeks, effect,
      slots: {
        cheeks: [...new Set(cheeks.flatMap((choice) => choice.targets.map((target) => target.slotName)))],
        effect: [...new Set(effects.map((entry) => entry.slotName))],
      },
    };
  }

  function populateFaceSelect(select, choices, mode) {
    clearSelect(select);
    if (mode === "default") option(select, DEFAULT, "动作默认");
    else option(select, NONE, "无");
    for (const choice of choices) option(select, choice.value, choice.label);
    select.disabled = choices.length === 0;
  }

  function populateControls(current) {
    clearSelect(dom.costume);
    const costumes = current.costumes || [];
    for (const costume of costumes) option(dom.costume, costume.key, costume.label);
    dom.costumeGroup.classList.toggle("hidden", costumes.length < 2);
    dom.costume.value = current.costumeKey || "";
    dom.costume.disabled = state.busy || costumes.length < 2;
    dom.costumeStatus.textContent = current.costumeNote || "";

    refreshComponentControls(current, current.components || []);

    clearSelect(dom.action);
    for (const action of current.actions) option(dom.action, action.name, action.label);
    dom.action.value = current.action.name;
    dom.action.disabled = false;

    populateFaceSelect(dom.eyes, current.face.eyes, "default");
    populateFaceSelect(dom.brows, current.face.brows, "default");
    populateFaceSelect(dom.mouth, current.face.mouth, "default");
    populateFaceSelect(dom.cheeks, current.face.cheeks, "none");
    populateFaceSelect(dom.effect, current.face.effect, "none");
    dom.eyes.value = state.face.eyes;
    dom.brows.value = state.face.brows;
    dom.mouth.value = state.face.mouth;
    dom.cheeks.value = state.face.cheeks;
    dom.effect.value = state.face.effect;
  }

  function selectAnimation(actions, name) {
    return actions.find((item) => item.name === name) || actions.find((item) => item.name === "pose_default") || actions[0];
  }

  function listActions(skeletonData, sex) {
    const prefix = `${sex}_`;
    const v2Prefix = `v2_${prefix}`;
    const visible = skeletonData.animations.filter((animation) => (
      animation.name === "pose_default"
      || animation.name.startsWith(prefix)
      || animation.name.startsWith(v2Prefix)
      || animation.name.startsWith("n_")
    ) && !animation.name.endsWith("_f2")
      && !animation.name.startsWith("z_")
      // These are authored for named special costumes, not the default clothes.
      && !/_(?:emucloth|nenecloth|kohaneunit|staff)_/.test(animation.name));
    return visible.map((animation) => ({
      name: animation.name,
      duration: animation.duration,
      label: actionLabel(animation.name),
    })).sort((left, right) => {
      if (left.name === "pose_default") return -1;
      if (right.name === "pose_default") return 1;
      return left.label.localeCompare(right.label, "zh-CN", { numeric: true });
    });
  }

  function updateBackground() {
    const color = Number.parseInt(state.background.slice(1), 16);
    state.backgroundGraphic.clear();
    state.backgroundGraphic.beginFill(color, state.transparent ? 0 : 1);
    state.backgroundGraphic.drawRect(0, 0, SIZE, SIZE);
    state.backgroundGraphic.endFill();
    dom.stageShell.style.setProperty("--canvas", state.background);
    dom.stageShell.classList.toggle("transparent-preview", state.transparent);
  }

  function updateTransform() {
    if (!state.current) return;
    const { spine: display, key } = state.current;
    const baseScale = key === "miku" ? 3.49 : 3.75;
    display.x = SIZE / 2;
    display.y = 674 + state.offsetY;
    display.scale.set(baseScale * state.scale / 100);
  }

  function applyCategory(categoryName) {
    if (!state.current) return;
    const catalog = state.current.face;
    const value = state.face[categoryName];
    const choice = catalog[categoryName].find((item) => item.value === value);
    if (value === DEFAULT) return;
    if (categoryName === "cheeks" || categoryName === "effect") {
      for (const slotName of catalog.slots[categoryName]) state.current.spine.skeleton.setAttachment(slotName, null);
    }
    if (value === NONE || !choice) return;
    for (const target of choice.targets) state.current.spine.skeleton.setAttachment(target.slotName, target.attachmentName);
  }

  function applyFaceOverrides() {
    applyCategory("eyes");
    applyCategory("brows");
    applyCategory("mouth");
    applyCategory("cheeks");
    applyCategory("effect");
  }

  function applyComponentOverrides() {
    if (!state.current || !state.componentOverrides.length) return;
    for (const override of state.componentOverrides) {
      const slot = state.current.spine.skeleton.findSlot(override.slotName);
      if (slot) slot.setAttachment(override.attachment);
    }
  }

  function isPlaceholderRegion(attachment) {
    const region = attachment?.region;
    return !region || region.width <= 1 || region.height <= 1;
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

  function componentGroupForSlot(slotName, crossRigMode = false) {
    // Several Spine slots form one visible object (for example, the front and
    // back layers of a cap). Keep those layers together, but never bundle
    // unrelated objects such as a hat, glasses, and earrings into one choice.
    // Clothing and legs are multi-layer Spine meshes. They intentionally stay
    // out of normal component swapping and only appear as complete experiment
    // sets after the user explicitly enables cross-rig mode.
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

  const COMPONENT_GROUP_LABELS = {
    hat: "帽子 / 帽檐",
    headAccessory: "头饰",
    hairAccessory: "发饰",
    glasses: "眼镜",
    earrings: "耳饰",
    headphones: "耳机",
    catEars: "猫耳",
    neck: "领口 / 颈部细节",
    outfit: "衣服主体（实验）",
    legs: "腿部 / 鞋（实验）",
  };

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
    return attachment instanceof globalThis.spine.MeshAttachment
      && attachment.worldVerticesLength > 0
      && Array.isArray(attachment.triangles)
      && attachment.triangles.length >= 3;
  }

  function isUsableComponentAttachment(attachment, group) {
    if (attachment instanceof globalThis.spine.RegionAttachment) {
      // Normal accessories must be visible. Experimental full sets also carry
      // official 1px clearing layers so an old skirt or belt cannot remain.
      return EXPERIMENTAL_GROUPS.has(group)
        ? Boolean(attachment.region)
        : !isPlaceholderRegion(attachment);
    }
    return EXPERIMENTAL_GROUPS.has(group) && isUsableExperimentalMesh(attachment);
  }

  function sameSlotTarget(current, source, entry) {
    const sourceSlot = source.skeletonData.slots[entry.slotIndex];
    const targetSlot = current.skeletonData.findSlot(sourceSlot?.name || "");
    const sourceBone = sourceSlot?.boneData?.name;
    const targetBone = targetSlot?.boneData?.name;
    return Boolean(
      sourceSlot
      && targetSlot
      && targetSlot.name === sourceSlot.name
      && sourceBone
      && targetBone === sourceBone
    );
  }

  function makeComponentKey(group, sourceKey) {
    return `${group}:${sourceKey}`;
  }

  function componentGroupFromKey(key) {
    return String(key).split(":", 1)[0];
  }

  function componentsByGroup(components) {
    const grouped = new Map();
    for (const component of components) {
      const group = componentGroupFromKey(component.key);
      if (!grouped.has(group)) grouped.set(group, []);
      grouped.get(group).push(component);
    }
    return grouped;
  }

  function selectedComponentKeys() {
    return [...state.componentSelections.values()];
  }

  function rebuildComponentOverrides(current) {
    const selectedKeys = selectedComponentKeys();
    const selected = selectedKeys.map((key) => current.components.find((item) => item.key === key)).filter(Boolean);
    const bySlot = new Map();
    for (const component of selected) {
      const group = componentGroupFromKey(component.key);
      for (const target of component.targets) {
        if (!target.attachment) throw new Error(`组件槽位缺失：${target.slotName}`);
        const existing = bySlot.get(target.slotName);
        if (existing && existing.group !== group) {
          throw new Error(`配件类别冲突：${target.slotName} 不能同时由两个类别替换`);
        }
        bySlot.set(target.slotName, { slotName: target.slotName, attachment: target.attachment.copy(), group });
      }
    }
    state.componentOverrides = [...bySlot.values()].map(({ slotName, attachment }) => ({ slotName, attachment }));
  }

  function componentStatusText() {
    const selections = selectedComponentKeys();
    if (!selections.length) return "未替换任何组件；可按类别叠加官方配件。";
    const labels = selections.map((key) => state.current.components.find((item) => item.key === key)?.label).filter(Boolean);
    return `已叠加 ${labels.length} 项：${labels.join("；")}。`;
  }

  async function fetchSkeletonBytes(url) {
    return fetch(url).then((response) => {
      if (!response.ok) throw new Error("组件骨骼文件读取失败");
      return response.arrayBuffer();
    }).then((buffer) => new Uint8Array(buffer));
  }

  function costumeCharacterId(costume, fallbackId = "") {
    return costume.characterId ?? costume.characterKey ?? fallbackId;
  }

  function isReversedCostume(costume) {
    return Boolean(costume?.isReversed) || /_r$/i.test(costume?.key || "");
  }

  function isCompatibleComponentSource(current, costume) {
    return Boolean(
      costume
      && costume.runtimeFamily === current.runtimeFamily
      && !isReversedCostume(costume)
      && !(String(costumeCharacterId(costume, current.id)) === String(current.id) && costume.key === current.costumeKey)
    );
  }

  async function parseCostumeSource(costume) {
    // Bundle names are not globally unique enough to identify a source atlas.
    // Include the server-provided character identity to keep cross-role caches separate.
    const cacheKey = `${costume.runtimeFamily}:${costumeCharacterId(costume, "unknown")}:${costume.key}`;
    const cached = state.componentSourceCache.get(cacheKey);
    if (cached) return cached;
    const runtime = globalThis.spine;
    const [atlasText, texture, skeletonBytes] = await Promise.all([
      fetch(costume.atlasUrl).then((response) => {
        if (!response.ok) throw new Error("组件图集描述读取失败");
        return response.text();
      }),
      loadTexture(costume.textureUrl, true),
      fetchSkeletonBytes(costume.skeletonUrl),
    ]);
    const atlas = new runtime.TextureAtlas(atlasText);
    atlas.pages[0].setTexture(runtime.SpineTexture.from(texture.baseTexture));
    const parser = new runtime.SkeletonBinary(new runtime.AtlasAttachmentLoader(atlas));
    parser.scale = 0.31;
    const source = { atlas, skeletonData: parser.readSkeletonData(skeletonBytes) };
    state.componentSourceCache.set(cacheKey, source);
    return source;
  }

  async function buildComponentCatalog(current, crossRigMode) {
    const cacheKey = `${current.id}:${current.costumeKey}:${current.runtimeFamily || ""}:${crossRigMode ? "cross" : "safe"}`;
    const cached = state.componentCatalogCache.get(cacheKey);
    if (cached) return cached;
    // The official *_r costumes are authored as reverse-facing variants.
    // Their attachment transforms are not a safe target for a canonical
    // costume's component, so offer whole-outfit switching only there.
    if (current.isReversed) {
      state.componentCatalogCache.set(cacheKey, []);
      return [];
    }
    const sourceCostumes = crossRigMode
      ? allCrossRigCostumes(current)
      : current.costumes;
    const groups = new Map();
    for (const costume of sourceCostumes) {
      if (!isCompatibleComponentSource(current, costume)) continue;
      let source;
      try {
        source = await parseCostumeSource(costume);
      } catch (error) {
        console.warn("Skipping unreadable component source", costume.key, error);
        continue;
      }
      // Mesh vertices store skeleton-bone indexes. An exact ordered bone map is
      // required before an experimental clothing or leg mesh can cross roles.
      const canUseExperimentalMeshes = crossRigMode && hasIdenticalBoneLayout(current, source);
      const skin = source.skeletonData.defaultSkin;
      const bundles = new Map();
      for (const entry of skin.getAttachments()) {
        const slotData = source.skeletonData.slots[entry.slotIndex];
        const slotName = slotData?.name;
        const group = componentGroupForSlot(slotName || "", crossRigMode);
        if (!group || (EXPERIMENTAL_GROUPS.has(group) && !canUseExperimentalMeshes)) continue;
        // A full outfit/leg set uses each slot's setup attachment only. Extra
        // skin variants would otherwise make duplicate partial replacements.
        if (EXPERIMENTAL_GROUPS.has(group) && entry.name !== slotName) continue;
        if (!isUsableComponentAttachment(entry.attachment, group)) continue;
        if (!sameSlotTarget(current, source, entry)) continue;
        if (!bundles.has(group)) bundles.set(group, []);
        bundles.get(group).push(entry);
      }
      for (const [group, entries] of bundles) {
        const expectedSlots = group === "outfit"
          ? EXPERIMENTAL_OUTFIT_SLOTS
          : group === "legs"
            ? EXPERIMENTAL_LEG_SLOTS
            : null;
        // An experimental clothing choice must replace every correlated setup
        // slot. Partial sets leave the target costume visible underneath.
        if (expectedSlots && (entries.length !== expectedSlots.size
          || new Set(entries.map((entry) => source.skeletonData.slots[entry.slotIndex]?.name)).size !== expectedSlots.size)) {
          continue;
        }
        const groupKey = makeComponentKey(group, `${costumeCharacterId(costume, current.id)}:${costume.key}`);
        if (!groups.has(groupKey)) groups.set(groupKey, {
          key: groupKey,
          label: `${COMPONENT_GROUP_LABELS[group]}：${costume.characterName ? `${costume.characterName} · ` : ""}${costume.label}`,
          runtimeFamily: costume.runtimeFamily,
          sourceBundle: costume.bundle,
          sourceCostumeKey: costume.key,
          source,
          targets: [],
        });
        for (const entry of entries) {
          const slotName = source.skeletonData.slots[entry.slotIndex].name;
          groups.get(groupKey).targets.push({
            slotName,
            attachmentName: entry.name,
            attachment: entry.attachment.copy(),
          });
        }
      }
    }
    const built = [...groups.values()].filter((item) => item.targets.length > 0);
    state.componentCatalogCache.set(cacheKey, built);
    return built;
  }

  function allCrossRigCostumes(current) {
    // `crossRigCostumes` is a cached official catalog returned by the local
    // server. Keep the current character's summaries as a fallback so this
    // mode still includes its other outfits.
    const seen = new Set();
    return [...(current.costumes || []), ...(current.crossRigCostumes || [])].filter((costume) => {
      if (!isCompatibleComponentSource(current, costume)) return false;
      const identity = `${costumeCharacterId(costume, current.id)}:${costume.runtimeFamily}:${costume.key}`;
      if (seen.has(identity)) return false;
      seen.add(identity);
      return true;
    });
  }

  function refreshComponentControls(current, components) {
    current.components = components;
    dom.componentOptions.textContent = "";
    dom.crossRigMode.checked = state.crossRigMode;
    dom.crossRigMode.disabled = state.busy || state.componentCatalogLoading || current.isReversed;
    const grouped = componentsByGroup(components);
    const orderedGroups = [...grouped.entries()].sort(([left], [right]) => (
      Object.keys(COMPONENT_GROUP_LABELS).indexOf(left) - Object.keys(COMPONENT_GROUP_LABELS).indexOf(right)
    ));
    for (const [group, choices] of orderedGroups) {
      const row = document.createElement("label");
      row.className = "component-row";
      const name = document.createElement("span");
      name.textContent = COMPONENT_GROUP_LABELS[group] || group;
      const select = document.createElement("select");
      select.dataset.componentGroup = group;
      option(select, NONE, "保持当前");
      for (const choice of choices) option(select, choice.key, choice.label.replace(/^[^：]+：/, ""));
      select.value = state.componentSelections.get(group) || NONE;
      select.disabled = state.busy || state.componentCatalogLoading;
      select.addEventListener("change", () => applyComponentChoice(group, select.value));
      row.append(name, select);
      dom.componentOptions.append(row);
    }
    dom.componentGroup.classList.remove("hidden");
    dom.resetComponents.disabled = state.busy || state.componentCatalogLoading || state.componentSelections.size === 0;
    if (components.length) {
      dom.componentStatus.textContent = componentStatusText();
    } else {
      dom.componentStatus.textContent = state.crossRigMode
        ? "当前没有可映射到同名部位的官方组件。"
        : "当前同角色、同骨骼家族没有可安全独立替换的官方配件。";
    }
  }

  async function loadComponentCatalog(current) {
    const epoch = ++state.componentCatalogEpoch;
    const crossRigMode = state.crossRigMode;
    state.componentCatalogLoading = true;
    try {
      dom.componentGroup.classList.remove("hidden");
      setComponentControlsDisabled(true);
      dom.componentStatus.textContent = crossRigMode
        ? "正在核对同一运行家族所有角色的可映射官方组件..."
        : "正在核对同角色官方配件槽位...";
      const components = await buildComponentCatalog(current, crossRigMode);
      if (state.current !== current || state.componentCatalogEpoch !== epoch) return;
      state.componentCatalogLoading = false;
      refreshComponentControls(current, components);
    } catch (error) {
      console.error(error);
      if (state.current !== current || state.componentCatalogEpoch !== epoch) return;
      state.componentCatalogLoading = false;
      current.components = [];
      refreshComponentControls(current, []);
      dom.componentStatus.textContent = `配件目录读取失败：${error.message}`;
    }
  }

  async function onCrossRigModeChange() {
    if (!state.current || state.busy || state.componentCatalogLoading || state.current.isReversed) {
      dom.crossRigMode.checked = state.crossRigMode;
      return;
    }
    const resumeAt = state.current.entry?.trackTime || 0;
    state.crossRigMode = dom.crossRigMode.checked;
    // A selection is meaningful only in the catalog that created it. Revert to
    // the current costume before exposing sources from the other mode.
    state.componentSelections.clear();
    state.componentOverrides = [];
    seekCurrent(resumeAt);
    renderNow();
    await loadComponentCatalog(state.current);
  }

  function installFaceOverrideRenderHook(display) {
    const updateSpineTransform = display.updateSpineTransform;
    display.updateSpineTransform = function updateSpineTransformWithFaceOverrides() {
      updateSpineTransform.call(this);
      if (state.current?.spine !== this) return;
      // Animation attachments are applied during the render transform. Reapply
      // the user's choices afterward, then rebuild the meshes for this frame.
      applyFaceOverrides();
      applyComponentOverrides();
      this.updateGeometry();
      this.sortChildren();
    };
  }

  function seekCurrent(time = 0) {
    if (!state.current) return;
    const current = state.current;
    current.spine.skeleton.setToSetupPose();
    current.spine.state.clearTracks();
    const entry = current.spine.state.setAnimation(0, current.action.name, true);
    entry.trackTime = Math.max(0, time);
    current.entry = entry;
    current.spine.update(0);
    updateTransform();
  }

  function renderNow() {
    state.app.renderer.render(state.stage);
  }

  function installTestHooks() {
    // Kept deliberately small: this lets automated local verification drive
    // the same public controls without exposing file-system capabilities.
    globalThis.__sekaiChibiStudio = {
      get ready() { return Boolean(state.current) && !state.busy && !state.componentCatalogLoading; },
      async selectCharacter(id) {
        dom.character.value = String(id);
        await waitForIdle();
        return loadCharacter(Number(id));
      },
      async selectCostume(key) {
        await waitForIdle();
        if (!state.current) return;
        dom.costume.value = key;
        return onCostumeChange();
      },
      async selectComponent(group, key) {
        await waitForIdle();
        return applyComponentChoice(group, key);
      },
      resetComponents() { resetComponentChoices(); },
      selectAction(name) {
        dom.action.value = name;
        onActionChange();
      },
      async exportGif() { await exportGif(); },
      async exportPng() { await exportPng(); },
      async setCrossRigMode(enabled) {
        await waitForIdle();
        if (!state.current || state.current.isReversed) return state.crossRigMode;
        dom.crossRigMode.checked = Boolean(enabled);
        await onCrossRigModeChange();
        return state.crossRigMode;
      },
      setGifFps(fps) {
        dom.gifFps.value = String(fps);
        return dom.gifFps.value;
      },
      setTransparent(enabled) {
        state.transparent = Boolean(enabled);
        dom.transparent.checked = state.transparent;
        updateBackground();
        renderNow();
        return state.transparent;
      },
      diagnostics() {
        return {
          character: state.current?.key || null,
          costume: state.current?.costumeKey || null,
          costumeName: state.current?.costumeName || null,
          components: selectedComponentKeys(),
          crossRigMode: state.crossRigMode,
          componentCatalogLoading: state.componentCatalogLoading,
          action: state.current?.action?.name || null,
          actionDuration: state.current?.action?.duration || 0,
          actionCount: state.current?.actions?.length || 0,
          face: { ...state.face },
          transparent: state.transparent,
          gifFps: Number(dom.gifFps.value),
          exportStatus: dom.exportStatus.textContent,
        };
      },
    };
  }

  async function waitForIdle() {
    // A user cannot click a disabled selector while another character is
    // loading. The test hook mirrors that UI behavior for browser smoke tests.
    while (state.busy || state.componentCatalogLoading) await new Promise((resolve) => setTimeout(resolve, 25));
  }

  function setGifAvailability() {
    const animated = state.current && state.current.action.duration > 0;
    dom.gif.disabled = state.busy || !animated || state.current.action.name === "pose_default";
    dom.gifFps.disabled = state.busy || !animated;
    dom.png.disabled = state.busy || !state.current;
    dom.background.disabled = state.busy;
    dom.transparent.disabled = state.busy;
  }

  async function jsonFetch(url, options) {
    const response = await fetch(url, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `请求失败（${response.status}）`);
    return data;
  }

  async function loadCharacter(id, costumeKey = "") {
    if (state.busy) return;
    // Invalidate any catalog that belongs to the outgoing costume before the
    // next character request can replace it or fail.
    state.componentCatalogEpoch += 1;
    state.componentCatalogLoading = false;
    state.busy = true;
    setControlsEnabled(false);
    setGifAvailability();
    setLoading("正在准备官方 Spine 小人...");
    setExportStatus("");
    const label = CHARACTERS.find((item) => item.id === id)?.name || "角色";
    dom.characterStatus.textContent = `正在加载 ${label} 的默认服资源...`;
    try {
      const payload = await jsonFetch("/api/character-assets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ characterId: id, costumeKey }),
      });
      const resource = payload.character;
      const runtime = globalThis.spine;
      if (!runtime || !globalThis.PIXI) throw new Error("Spine 浏览器运行时没有正确加载。");

      const [skeletonBytes, atlasText] = await Promise.all([
        fetch(resource.skeletonUrl).then((response) => {
          if (!response.ok) throw new Error("骨骼文件读取失败");
          return response.arrayBuffer();
        }).then((buffer) => new Uint8Array(buffer)),
        fetch(resource.atlasUrl).then((response) => {
          if (!response.ok) throw new Error("角色图集描述读取失败");
          return response.text();
        }),
      ]);

      if (state.current) state.stage.removeChild(state.current.spine);
      const atlas = new runtime.TextureAtlas(atlasText);
      const texture = await loadTexture(resource.textureUrl, atlas.pages[0].pma);
      atlas.pages[0].setTexture(runtime.SpineTexture.from(texture.baseTexture));
      const parser = new runtime.SkeletonBinary(new runtime.AtlasAttachmentLoader(atlas));
      parser.scale = 0.31;
      const skeletonData = parser.readSkeletonData(skeletonBytes);
      const display = new runtime.Spine(skeletonData, { autoUpdate: false });
      installFaceOverrideRenderHook(display);
      const actions = listActions(skeletonData, resource.sex);
      const action = selectAnimation(actions, "pose_default");
      const current = {
        id: resource.id,
        key: resource.key,
        name: resource.name,
        sex: resource.sex,
        costumeKey: resource.costumeKey,
        costumeName: resource.costumeName,
        costumeNote: resource.costumeNote,
        runtimeFamily: resource.runtimeFamily,
        isReversed: Boolean(resource.isReversed),
        costumes: resource.costumes || [],
        crossRigCostumes: resource.crossRigCostumes || [],
        components: resource.components || [],
        spine: display,
        skeletonData,
        actions,
        action,
        entry: null,
        face: buildFaceCatalog(skeletonData, resource.sex),
      };
      state.current = current;
      state.costume = resource.costumeKey || "";
      state.componentSelections = new Map();
      state.componentOverrides = [];
      state.face = { eyes: DEFAULT, brows: DEFAULT, mouth: DEFAULT, cheeks: NONE, effect: NONE };
      state.stage.addChild(display);
      populateControls(current);
      seekCurrent(0);
      renderNow();
      dom.characterStatus.textContent = `${resource.name} · ${resource.costumeName || "默认服"}已从本地缓存载入。`;
      loadComponentCatalog(current);
      setLoading("", false);
    } catch (error) {
      console.error(error);
      state.current = null;
      dom.characterStatus.textContent = "资源加载失败。";
      setLoading(`无法加载角色：${error.message}`, true);
      setExportStatus(`加载失败：${error.message}`, true);
    } finally {
      state.busy = false;
      setControlsEnabled(Boolean(state.current));
      setGifAvailability();
    }
  }

  async function loadTexture(url, pma = false) {
    const texture = PIXI.Texture.from(url, {
      alphaMode: pma ? PIXI.ALPHA_MODES.PMA : PIXI.ALPHA_MODES.UNPACK,
    });
    if (!texture.baseTexture.valid) {
      await new Promise((resolve, reject) => {
        texture.baseTexture.once("loaded", resolve);
        texture.baseTexture.once("error", () => reject(new Error("角色图集 PNG 读取失败")));
      });
    }
    return texture;
  }

  function onActionChange() {
    if (!state.current) return;
    const trackTime = state.current.entry?.trackTime || 0;
    state.current.action = selectAnimation(state.current.actions, dom.action.value);
    seekCurrent(trackTime);
    renderNow();
    setGifAvailability();
  }

  async function onCostumeChange() {
    if (!state.current) return;
    const characterId = state.current.id;
    const actionName = state.current.action?.name;
    const face = { ...state.face };
    await loadCharacter(characterId, dom.costume.value);
    if (!state.current) return;
    state.face = face;
    for (const category of ["eyes", "brows", "mouth", "cheeks", "effect"]) {
      const select = dom[category];
      if ([...select.options].some((item) => item.value === state.face[category])) {
        select.value = state.face[category];
      } else {
        state.face[category] = (category === "cheeks" || category === "effect") ? NONE : DEFAULT;
        select.value = state.face[category];
      }
    }
    const nextAction = selectAnimation(state.current.actions, actionName);
    state.current.action = nextAction;
    dom.action.value = nextAction.name;
    seekCurrent(0);
    renderNow();
    setGifAvailability();
  }

  async function applyComponentChoice(group, key) {
    if (!state.current || state.busy || state.componentCatalogLoading) return;
    const resumeAt = state.current.entry?.trackTime || 0;
    const previousKey = state.componentSelections.get(group);
    if (key === NONE) state.componentSelections.delete(group);
    else state.componentSelections.set(group, key);
    try {
      setComponentControlsDisabled(true);
      rebuildComponentOverrides(state.current);
      seekCurrent(resumeAt);
      renderNow();
      dom.componentStatus.textContent = componentStatusText();
    } catch (error) {
      console.error(error);
      if (previousKey) state.componentSelections.set(group, previousKey);
      else state.componentSelections.delete(group);
      rebuildComponentOverrides(state.current);
      dom.componentStatus.textContent = `组件替换失败：${error.message}`;
    } finally {
      refreshComponentControls(state.current, state.current.components);
    }
  }

  function resetComponentChoices() {
    if (!state.current || state.busy || state.componentCatalogLoading) return;
    const resumeAt = state.current.entry?.trackTime || 0;
    state.componentSelections.clear();
    state.componentOverrides = [];
    seekCurrent(resumeAt);
    renderNow();
    refreshComponentControls(state.current, state.current.components);
    dom.componentStatus.textContent = "已恢复当前服装的全部原始组件。";
  }

  function onFaceChange(category, element) {
    if (!state.current) return;
    state.face[category] = element.value;
    seekCurrent(state.current.entry?.trackTime || 0);
    renderNow();
  }

  function canvasToBlob(canvas, type = "image/png") {
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

  async function exportPng() {
    if (!state.current || state.busy) return;
    try {
      renderNow();
      const blob = await canvasToBlob(dom.canvas);
      downloadBlob(blob, `sekai-chibi-${state.current.key}-${safeFilename(state.current.action.name)}.png`);
      setExportStatus("PNG 已开始下载。");
    } catch (error) {
      setExportStatus(`PNG 导出失败：${error.message}`, true);
    }
  }

  async function exportGif() {
    if (!state.current || state.busy) return;
    const action = state.current.action;
    if (!action.duration || action.duration <= 0) {
      setExportStatus("当前是静态姿势，请导出 PNG，或切换到带动作的选项。", true);
      return;
    }
    state.busy = true;
    setGifAvailability();
    const resumeAt = state.current.entry?.trackTime || 0;
    try {
      const fps = Number(dom.gifFps.value);
      const frames = Math.min(120, Math.max(2, Math.ceil(Math.min(action.duration, 4) * fps)));
      const job = await jsonFetch("/api/gif/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ width: GIF_SIZE, height: GIF_SIZE, fps, frames, transparent: state.transparent }),
      });
      const frameCanvas = document.createElement("canvas");
      frameCanvas.width = GIF_SIZE;
      frameCanvas.height = GIF_SIZE;
      const frameContext = frameCanvas.getContext("2d", { willReadFrequently: true });
      for (let index = 0; index < frames; index += 1) {
        // Set an exact Spine time for every frame. This avoids recording jitter
        // from the browser's animation clock and never repeats the end frame.
        seekCurrent(index / fps);
        renderNow();
        frameContext.clearRect(0, 0, GIF_SIZE, GIF_SIZE);
        frameContext.drawImage(dom.canvas, 0, 0, GIF_SIZE, GIF_SIZE);
        // Local raw RGBA frames avoid 120 separate PNG encodes at 30 fps. The
        // local server converts them to the GIF palette after all frames arrive.
        const pixels = frameContext.getImageData(0, 0, GIF_SIZE, GIF_SIZE).data;
        const response = await fetch(`/api/gif/jobs/${job.id}/frames/${index}`, {
          method: "PUT",
          headers: { "Content-Type": "application/x-sekai-rgba" },
          body: pixels.buffer,
        });
        if (!response.ok) {
          const data = await response.json().catch(() => ({}));
          throw new Error(data.error || `第 ${index + 1} 帧上传失败`);
        }
        setExportStatus(`正在导出 GIF：${index + 1} / ${frames}`);
      }
      const finished = await jsonFetch(`/api/gif/jobs/${job.id}/finish`, { method: "POST" });
      const link = document.createElement("a");
      link.href = finished.url;
      link.download = `sekai-chibi-${state.current.key}-${safeFilename(action.name)}.gif`;
      document.body.append(link);
      link.click();
      link.remove();
      setExportStatus(`GIF 已生成并开始下载（512 像素，${frames} 帧，${fps} fps${state.transparent ? "，透明底" : ""}）。`);
    } catch (error) {
      console.error(error);
      setExportStatus(`GIF 导出失败：${error.message}`, true);
    } finally {
      seekCurrent(resumeAt);
      renderNow();
      state.busy = false;
      setGifAvailability();
    }
  }

  function findChoice(choices, matcher) {
    return choices.find((choice) => matcher.test(choice.value)) || choices[0];
  }

  function chooseAction(matcher) {
    return state.current.actions.find((action) => matcher.test(action.name))
      || state.current.actions.find((action) => action.name === "pose_default");
  }

  function setFacePreset(category, matcher, fallback = DEFAULT) {
    const choice = findChoice(state.current.face[category], matcher);
    state.face[category] = choice ? choice.value : fallback;
    dom[category].value = state.face[category];
  }

  function applyPreset(name) {
    if (!state.current) return;
    const patterns = {
      default: /pose_default/,
      talk: /_talk\d+_f$/,
      happy: /_(joy|laugh)\d+_f$/,
      surprise: /_surprise\d+_f$/,
      sad: /_sad\d+_f$/,
    };
    const action = chooseAction(patterns[name]);
    state.current.action = action;
    dom.action.value = action.name;
    state.face = { eyes: DEFAULT, brows: DEFAULT, mouth: DEFAULT, cheeks: NONE, effect: NONE };
    if (name === "happy") {
      setFacePreset("eyes", /04_smile/);
      setFacePreset("mouth", /03_bigsmile/);
    } else if (name === "surprise") {
      setFacePreset("eyes", /10_(?:w)?marume/);
      setFacePreset("mouth", /(?:10_e|11_o)/);
    } else if (name === "sad") {
      setFacePreset("brows", /02_tare/);
      setFacePreset("mouth", /18_sad/);
    } else if (name === "talk") {
      setFacePreset("mouth", /04_smile/);
    }
    dom.eyes.value = state.face.eyes;
    dom.brows.value = state.face.brows;
    dom.mouth.value = state.face.mouth;
    dom.cheeks.value = state.face.cheeks;
    dom.effect.value = state.face.effect;
    seekCurrent(0);
    renderNow();
    setGifAvailability();
  }

  function bindEvents() {
    dom.character.addEventListener("change", () => {
      state.costume = "";
      loadCharacter(Number(dom.character.value));
    });
    dom.costume.addEventListener("change", onCostumeChange);
    dom.crossRigMode.addEventListener("change", onCrossRigModeChange);
    dom.resetComponents.addEventListener("click", resetComponentChoices);
    dom.action.addEventListener("change", onActionChange);
    dom.eyes.addEventListener("change", () => onFaceChange("eyes", dom.eyes));
    dom.brows.addEventListener("change", () => onFaceChange("brows", dom.brows));
    dom.mouth.addEventListener("change", () => onFaceChange("mouth", dom.mouth));
    dom.cheeks.addEventListener("change", () => onFaceChange("cheeks", dom.cheeks));
    dom.effect.addEventListener("change", () => onFaceChange("effect", dom.effect));
    dom.background.addEventListener("input", () => {
      state.background = dom.background.value;
      updateBackground();
      renderNow();
    });
    dom.transparent.addEventListener("change", () => {
      state.transparent = dom.transparent.checked;
      updateBackground();
      renderNow();
    });
    dom.scale.addEventListener("input", () => {
      state.scale = Number(dom.scale.value);
      dom.scaleValue.value = `${state.scale}%`;
      updateTransform();
      renderNow();
    });
    dom.offsetY.addEventListener("input", () => {
      state.offsetY = Number(dom.offsetY.value);
      dom.offsetYValue.value = String(state.offsetY);
      updateTransform();
      renderNow();
    });
    dom.png.addEventListener("click", exportPng);
    dom.gif.addEventListener("click", exportGif);
    document.querySelectorAll("[data-preset]").forEach((button) => button.addEventListener("click", () => applyPreset(button.dataset.preset)));
  }

  function startRenderer() {
    state.app = new PIXI.Application({
      view: dom.canvas,
      width: SIZE,
      height: SIZE,
      backgroundAlpha: 0,
      antialias: true,
      preserveDrawingBuffer: true,
      autoDensity: true,
      resolution: 1,
    });
    state.app.ticker.stop();
    state.stage = state.app.stage;
    state.backgroundGraphic = new PIXI.Graphics();
    state.stage.addChild(state.backgroundGraphic);
    updateBackground();
    // The rendering loop is manually controlled so PNG/GIF captures contain
    // the exact same frame as the preview.
    state.app.ticker.add(() => {
      if (!state.current || state.busy) return;
      state.current.spine.update(state.app.ticker.deltaMS / 1000);
    });
    state.app.ticker.start();
  }

  function updatePreviewStickyPosition() {
    const stageHeight = dom.stageShell?.getBoundingClientRect().height || 0;
    const top = Math.max(16, Math.round((window.innerHeight - stageHeight) / 2));
    document.documentElement.style.setProperty("--preview-sticky-top", `${top}px`);
  }

  function installPreviewStickiness() {
    updatePreviewStickyPosition();
    window.addEventListener("resize", updatePreviewStickyPosition);
    if (globalThis.ResizeObserver && dom.stageShell) {
      new ResizeObserver(updatePreviewStickyPosition).observe(dom.stageShell);
    }
  }

  function init() {
    populateCharacterList();
    bindEvents();
    startRenderer();
    installPreviewStickiness();
    installTestHooks();
    loadCharacter(1);
  }

  init();
})();
