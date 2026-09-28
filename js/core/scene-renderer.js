/**
 * Renders a scene: sets the background and creates clickable object elements
 * positioned on a tile grid. Also manages runtime image and text overlays.
 *
 * Both scene-defined objects and runtime entities created by `show` / `text`
 * actions are tracked in a unified entity map
 * so that `show` / `hide` actions work on any entity by id.
 */
import { Paths } from './paths.js';
import { EntityAnimator } from './entity-animator.js';

export class SceneRenderer {
  /**
   * @param {HTMLElement} sceneLayer  #scene-layer element
   * @param {import('./event-bus.js').EventBus} bus
   */
  constructor(sceneLayer, bus) {
    this.el = sceneLayer;
    this.bus = bus;
    this._cols = 16;
    this._rows = 9;

    this._backgroundLayer = document.createElement('div');
    this._backgroundLayer.className = 'scene-runtime-layer scene-runtime-layer-background';
    this._objectLayer = document.createElement('div');
    this._objectLayer.className = 'scene-object-layer';
    this._overlayLayer = document.createElement('div');
    this._overlayLayer.className = 'scene-runtime-layer scene-runtime-layer-overlay';

    this._tooltip = document.createElement('div');
    this._tooltip.className = 'object-tooltip hidden';
    this._tooltipAction = document.createElement('div');
    this._tooltipAction.className = 'object-tooltip-action hidden';
    this._tooltipLabel = document.createElement('div');
    this._tooltipLabel.className = 'object-tooltip-label';
    this._tooltip.append(this._tooltipAction, this._tooltipLabel);
    this.el.append(this._backgroundLayer, this._objectLayer, this._overlayLayer, this._tooltip);

    /**
     * Unified entity registry.
     * Scene objects and runtime entities are both tracked here.
     * @type {Map<string, { el: HTMLElement, def: object|null, runtime: boolean, visible: boolean, kind: string }>}
     */
    this._entities = new Map();
    this._sceneEntity = { el: this.el, kind: 'scene', motion: null };
    this._hoveredEntity = null;
    this._animator = new EntityAnimator(bus, {
      getEntity: (id, target) => target === 'scene' ? this._sceneEntity : this._entities.get(id),
      getState: entry => this._getMotionState(entry),
      applyState: (entry, keys) => this._applyMotionState(entry, keys),
    });

    window.addEventListener('resize', () => this._fitToContainer());

    bus.on('overlay:show',  (payload) => this._showEntity(payload));
    bus.on('overlay:hide',  (payload) => this._hideEntity(payload));
    bus.on('overlay:clear', ()        => this._clearRuntimeEntities());
  }

  /** Resize the scene layer to fit its parent while preserving the grid aspect ratio. */
  _fitToContainer() {
    const container = this.el.parentElement;
    if (!container) return;
    const sceneRatio = this._cols / this._rows;
    const availW = container.clientWidth;
    const availH = container.clientHeight;
    const containerRatio = availW / availH;

    let w, h;
    if (sceneRatio > containerRatio) {
      w = availW;
      h = availW / sceneRatio;
    } else {
      h = availH;
      w = availH * sceneRatio;
    }

    this.el.style.width  = `${Math.round(w)}px`;
    this.el.style.height = `${Math.round(h)}px`;
    if (this._hoveredEntity) this._positionTooltip(this._hoveredEntity);
  }

  /**
   * Render a scene object.
   * @param {object} scene  Parsed scene JSON
   */
  render(scene) {
    this._animator.cancelEntity(this._sceneEntity);
    this._sceneEntity.motion = null;
    // Reset any scene-level fade styles left over from the previous scene
    // (e.g. a blocking fade-out leaves opacity:0 inline, which would make
    // the next scene invisible unless it fades in itself)
    this.el.style.opacity = '';
    this.el.style.transition = '';
    // Clear all tracked entities (scene objects + runtime overlays)
    this._clearAllEntities();
    // Safety net: remove any orphaned .scene-object elements
    this._objectLayer.querySelectorAll('.scene-object').forEach(h => h.remove());

    // Background
    if (scene.background) {
      this.el.style.backgroundImage = `url('${CSS.escape(Paths.resolve(scene.background))}')`;
    } else {
      this.el.style.backgroundImage = '';
      this.el.style.backgroundColor = scene.backgroundColor || '#111';
    }

    // Grid dimensions (default 16×9)
    const cols = scene.grid?.cols ?? 16;
    const rows = scene.grid?.rows ?? 9;
    this._cols = cols;
    this._rows = rows;
    this._fitToContainer();
    const tilePctW = 100 / cols;
    const tilePctH = 100 / rows;

    const objects = scene.objects;
    if (Array.isArray(objects)) {
      for (const obj of objects) {
        const div = document.createElement('div');
        div.className = 'scene-object';
        div.dataset.objectId = obj.id;
        div.classList.toggle('scene-object-highlight-disabled', obj.highlight === false);
        div.style.left   = `${obj.x * tilePctW}%`;
        div.style.top    = `${obj.y * tilePctH}%`;
        div.style.width  = `${obj.w * tilePctW}%`;
        div.style.height = `${obj.h * tilePctH}%`;

        if (obj.texture) {
          div.classList.add('scene-object-textured');
          div.style.backgroundImage = `url('${CSS.escape(Paths.resolve(obj.texture))}')`;
        }

        if (obj.cursor) div.style.cursor = obj.cursor;
        if (obj.z != null) div.style.zIndex = obj.z;

        // Visibility: objects default to visible unless `visible: false`
        const visible = obj.visible !== false;
        if (!visible) {
          div.style.opacity = '0';
          div.style.pointerEvents = 'none';
        }

        if (obj.label) {
          div.addEventListener('mouseenter', () => {
            const defaultOptionText = obj.options?.[0]?.text || '';
            this._tooltipAction.textContent = defaultOptionText;
            this._tooltipAction.classList.toggle('hidden', !defaultOptionText);
            this._tooltipLabel.textContent = obj.label;
            this._hoveredEntity = div;
            this._positionTooltip(div);
            this._tooltip.classList.remove('hidden');
          });
          div.addEventListener('mouseleave', () => {
            this._hoveredEntity = null;
            this._tooltip.classList.add('hidden');
          });
        }

        div.addEventListener('mouseenter', () => {
          this.bus.emit('object:hover', obj);
        });
        div.addEventListener('click', () => {
          this.bus.emit('object:click', obj);
        });
        div.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          this.bus.emit('object:contextmenu', {
            obj,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        });

        this._objectLayer.appendChild(div);
        this._entities.set(obj.id, { el: div, def: obj, runtime: false, visible, kind: 'scene-object', layer: 'objects' });
      }
    }
  }

  _positionTooltip(el) {
    const sceneRect = this.el.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    // DOM rects include the container's scale; tooltip offsets use scene-local units.
    // Percentages keep the anchor on the displayed object, including its transforms.
    if (!sceneRect.width || !sceneRect.height) return;
    this._tooltip.style.left = `${(rect.left - sceneRect.left + rect.width / 2) / sceneRect.width * 100}%`;
    this._tooltip.style.top = `${(rect.top - sceneRect.top) / sceneRect.height * 100}%`;
  }

  /** Runtime geometry is separate from cached JSON, which stays reusable on re-entry. */
  _getMotionState(entry) {
    const opacity = Number(getComputedStyle(entry.el).opacity);
    if (entry.kind === 'scene') {
      entry.motion ||= {};
      entry.motion.opacity = opacity;
      return entry.motion;
    }
    if (entry.motion) {
      entry.motion.opacity = opacity;
      // Natural text/image layout can change on resize before width/height are animated.
      if (entry.runtime && !entry.resizedWidth) entry.motion.w = entry.el.offsetWidth / (this.el.clientWidth || 1) * this._cols;
      if (entry.runtime && !entry.resizedHeight) entry.motion.h = entry.el.offsetHeight / (this.el.clientHeight || 1) * this._rows;
      return entry.motion;
    }
    entry.anchorTransform = entry.el.style.transform;
    const position = entry.position || {};
    const gridOffset = (value, axis) => parseFloat(this._resolvePositionOffset(value, axis)) / 100
      * (axis === 'x' ? this._cols : this._rows);
    entry.motion = {
      x: entry.runtime ? gridOffset(position.x, 'x') : entry.def.x,
      y: entry.runtime ? gridOffset(position.y, 'y') : entry.def.y,
      w: entry.runtime ? entry.el.offsetWidth / (this.el.clientWidth || 1) * this._cols : entry.def.w,
      h: entry.runtime ? entry.el.offsetHeight / (this.el.clientHeight || 1) * this._rows : entry.def.h,
      rotation: 0, scaleX: 1, scaleY: 1, opacity,
    };
    return entry.motion;
  }

  _applyMotionState(entry, keys) {
    const { el, motion } = entry;
    if (keys.includes('opacity')) el.style.opacity = String(motion.opacity);
    if (entry.kind === 'scene') return;
    if (entry.kind === 'text-overlay' && (keys.includes('x') || keys.includes('y'))) {
      // Text x/y remain offsets from its existing anchor, just like the text action.
      entry.position = { ...entry.position, x: motion.x, y: motion.y };
      this._applyTextPosition(el, entry.position);
    } else {
      if (keys.includes('x')) {
        el.style.left = `${this._gridUnitsToPercent(motion.x, 'x')}%`;
        el.style.right = 'auto';
      }
      if (keys.includes('y')) {
        el.style.top = `${this._gridUnitsToPercent(motion.y, 'y')}%`;
        el.style.bottom = 'auto';
      }
    }
    if (keys.includes('w')) {
      entry.resizedWidth = true;
      el.style.width = `${this._gridUnitsToPercent(motion.w, 'x')}%`;
      if (entry.kind === 'text-overlay') el.style.maxWidth = 'none';
    }
    if (keys.includes('h')) {
      entry.resizedHeight = true;
      el.style.height = `${this._gridUnitsToPercent(motion.h, 'y')}%`;
    }
    if (entry.kind === 'text-overlay' && (keys.includes('x') || keys.includes('y'))) {
      entry.anchorTransform = el.style.transform;
    }
    // Anchor translation must precede rotation/scale so centered text stays anchored.
    el.style.transform = `${entry.anchorTransform || ''} rotate(${motion.rotation}deg) scale(${motion.scaleX}, ${motion.scaleY})`;
    if (this._hoveredEntity === el) this._positionTooltip(el);
  }

  /**
   * Wait for an opacity transition to complete, racing `transitionend`
   * against a timeout fallback. The fallback covers cases where the event
   * never fires (e.g. a second consecutive fade-out where opacity is
   * already at the target value, so no CSS transition runs). Resolution
   * is idempotent — whichever fires first wins and the other is cleared.
   * @param {HTMLElement} el
   * @param {number} seconds  transition duration in seconds
   * @param {function} onDone
   */
  _waitForTransition(el, seconds, onDone) {
    let settled = false;
    const settle = () => {
      if (settled) return;
      settled = true;
      el.removeEventListener('transitionend', handleEnd);
      clearTimeout(timer);
      onDone?.();
    };
    const handleEnd = event => {
      if (event.target === el && event.propertyName === 'opacity') settle();
    };
    // +50ms slack so the fallback only fires if transitionend truly never will
    const timer = setTimeout(settle, seconds * 1000 + 50);
    el.addEventListener('transitionend', handleEnd);
  }

  /* ── Unified entity show/hide ────────────────── */

  /**
   * Show an entity. If `id` matches an existing entity, reveal or update it.
   * Otherwise, create a new runtime image or text entity.
   */
  _showEntity(payload) {
    const { id, texture, effect, onDone } = payload;
    const entry = this._entities.get(id);

    if (entry) {
      this._updateRuntimeEntity(entry, payload);
      this._revealEntity(entry, effect, onDone);
      return;
    }

    const runtime = this._createRuntimeEntity(payload);
    if (runtime) {
      this._getEntityHost(runtime.layer).appendChild(runtime.el);
      this._entities.set(id, runtime);
      this._applyFadeIn(runtime.el, effect, onDone);
      return;
    }

    // No matching entity and no renderable payload — nothing to show
    onDone?.();
  }

  /**
   * Hide an entity by id. Scene objects stay in the DOM (can be re-shown).
   * Runtime entities are removed from the DOM after the transition.
   */
  _hideEntity({ id, effect, onDone }) {
    const entry = this._entities.get(id);
    if (!entry) { onDone?.(); return; }

    const el = entry.el;
    const version = entry.visibilityVersion = (entry.visibilityVersion || 0) + 1;

    const finish = () => {
      if (this._entities.get(id) !== entry || entry.visibilityVersion !== version) return;
      entry.visible = false;
      if (entry.runtime) {
        this._removeEntity(id);
      } else {
        el.style.opacity = '0';
        el.style.pointerEvents = 'none';
      }
    };

    this._applyFadeOut(el, effect, finish, onDone);
  }

  _removeEntity(id) {
    const entry = this._entities.get(id);
    if (entry) {
      this._animator.cancelEntity(entry);
      if (this._hoveredEntity === entry.el) {
        this._hoveredEntity = null;
        this._tooltip.classList.add('hidden');
      }
      entry.el.remove();
      this._entities.delete(id);
    }
  }

  /** Remove only runtime entities (used by overlay:clear). */
  _clearRuntimeEntities() {
    for (const [id, entry] of this._entities) {
      if (entry.runtime) this._removeEntity(id);
    }
  }

  /** Remove all tracked entities (scene objects + runtime overlays). */
  _clearAllEntities() {
    for (const [id] of this._entities) this._removeEntity(id);
  }

  /** Remove all scene objects, overlays, and background. */
  clear() {
    this._animator.cancelEntity(this._sceneEntity);
    this._sceneEntity.motion = null;
    this.el.style.backgroundImage = '';
    this.el.style.backgroundColor = '#111';
    this.el.style.width  = '';
    this.el.style.height = '';
    this.el.style.opacity = '';
    this.el.style.transition = '';
    this._objectLayer.querySelectorAll('.scene-object').forEach(h => h.remove());
    this._tooltip.classList.add('hidden');
    this._clearAllEntities();
  }

  _revealEntity(entry, effect, onDone) {
    entry.visibilityVersion = (entry.visibilityVersion || 0) + 1;
    const el = entry.el;
    entry.visible = true;
    el.style.pointerEvents = entry.runtime ? 'none' : '';
    this._applyFadeIn(el, effect, onDone);
  }

  _createRuntimeEntity(payload) {
    const layer = this._resolveRuntimeLayer(payload);

    if (payload.kind === 'text' || payload.text != null) {
      const el = document.createElement('div');
      el.className = 'text-overlay';
      el.dataset.objectId = payload.id;
      this._applyTextContent(el, payload);
      return { el, def: null, runtime: true, visible: true, kind: 'text-overlay', layer,
        position: payload.position || {} };
    }

    if (payload.texture) {
      const el = document.createElement('div');
      el.className = 'image-overlay';
      el.dataset.objectId = payload.id;
      this._applyImageContent(el, payload);
      return { el, def: null, runtime: true, visible: true, kind: 'image-overlay', layer };
    }

    return null;
  }

  _updateRuntimeEntity(entry, payload) {
    if (!entry.runtime) return;
    const layer = this._resolveRuntimeLayer(payload);
    if (layer !== entry.layer) {
      this._getEntityHost(layer).appendChild(entry.el);
      entry.layer = layer;
    }
    if (entry.kind === 'image-overlay') this._applyImageContent(entry.el, payload);
    if (entry.kind === 'text-overlay') {
      this._animator.cancelEntity(entry);
      this._applyTextContent(entry.el, payload);
      entry.position = payload.position || {};
      if (entry.motion) {
        const previous = entry.motion;
        entry.motion = null;
        Object.assign(this._getMotionState(entry), {
          rotation: previous.rotation, scaleX: previous.scaleX, scaleY: previous.scaleY,
        });
        this._applyMotionState(entry, []);
      }
    }
  }

  _resolveRuntimeLayer(payload = {}) {
    return payload.layer === 'background' ? 'background' : 'overlay';
  }

  _getEntityHost(layer) {
    return layer === 'background' ? this._backgroundLayer : this._overlayLayer;
  }

  _applyImageContent(el, { texture, scaling, z }) {
    if (texture) {
      el.style.backgroundImage = `url('${CSS.escape(Paths.resolve(texture))}')`;
    }

    if (scaling === 'fill' || scaling === 'cover') {
      el.style.backgroundSize = 'cover';
    } else if (scaling === 'contain') {
      el.style.backgroundSize = 'contain';
    } else {
      el.style.backgroundSize = '';
    }

    if (z != null) el.style.zIndex = z;
  }

  _applyTextContent(el, payload) {
    const {
      text,
      color,
      fontFamily,
      fontSize,
      backgroundColor,
      position,
      z,
    } = payload;

    el.innerHTML = this._renderMarkdown(text ?? '');
    el.style.color = color || '';
    el.style.fontFamily = fontFamily || '';
    el.style.fontSize = this._normalizeCssSize(fontSize);
    el.style.backgroundColor = backgroundColor || 'transparent';
    el.classList.toggle('text-overlay--with-bg', !!backgroundColor);

    if (z != null) el.style.zIndex = z;
    this._applyTextPosition(el, position);
  }

  _applyTextPosition(el, position = {}) {
    const anchor = this._normalizeAnchor(position?.anchor);
    const xOffset = this._resolvePositionOffset(position?.x, 'x');
    const yOffset = this._resolvePositionOffset(position?.y, 'y');
    const [vertical, horizontal] = anchor.split('-');
    const transforms = [];

    el.style.left = '';
    el.style.right = '';
    el.style.top = '';
    el.style.bottom = '';
    el.style.transform = '';

    if (horizontal === 'left') {
      el.style.left = xOffset;
    } else if (horizontal === 'center') {
      el.style.left = `calc(50% + ${xOffset})`;
      transforms.push('translateX(-50%)');
    } else {
      el.style.right = xOffset;
    }

    if (vertical === 'top') {
      el.style.top = yOffset;
    } else if (vertical === 'middle') {
      el.style.top = `calc(50% + ${yOffset})`;
      transforms.push('translateY(-50%)');
    } else {
      el.style.bottom = yOffset;
    }

    el.style.transform = transforms.join(' ');
  }

  _normalizeAnchor(anchor) {
    const normalized = String(anchor || 'top-left').trim().toLowerCase().replace(/\s+/g, '-');
    const valid = new Set([
      'top-left', 'top-center', 'top-right',
      'middle-left', 'middle-center', 'middle-right',
      'bottom-left', 'bottom-center', 'bottom-right',
    ]);
    return valid.has(normalized) ? normalized : 'top-left';
  }

  _resolvePositionOffset(value, axis) {
    if (value == null || value === '') return '0%';
    if (typeof value === 'number' && Number.isFinite(value)) {
      return `${this._gridUnitsToPercent(value, axis)}%`;
    }

    const text = String(value).trim();
    if (text === '') return '0%';
    if (/^-?\d*\.?\d+%$/.test(text)) return text;

    const num = Number(text);
    if (!Number.isNaN(num)) return `${this._gridUnitsToPercent(num, axis)}%`;
    return '0%';
  }

  _gridUnitsToPercent(value, axis) {
    const span = axis === 'x' ? this._cols : this._rows;
    return (value * 100) / span;
  }

  _normalizeCssSize(value) {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isFinite(value)) return `${value}px`;

    const text = String(value).trim();
    if (text === '') return '';
    if (/^-?\d*\.?\d+$/.test(text)) return `${text}px`;
    return text;
  }

  _renderMarkdown(text) {
    let html = this._escapeHtml(text);
    const replacements = [
      [/\*\*([\s\S]+?)\*\*/g, '<strong>$1</strong>'],
      [/__([\s\S]+?)__/g, '<u>$1</u>'],
      [/~~([\s\S]+?)~~/g, '<s>$1</s>'],
      [/\*([\s\S]+?)\*/g, '<em>$1</em>'],
    ];

    for (const [pattern, replacement] of replacements) {
      html = html.replace(pattern, replacement);
    }

    return html.replace(/\n/g, '<br>');
  }

  _escapeHtml(text) {
    return String(text).replace(/[&<>"']/g, (ch) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;',
    }[ch]));
  }

  _applyFadeIn(el, effect, onDone) {
    if (effect?.type === 'fade-in' && effect.seconds > 0) {
      el.style.transition = 'none';
      el.style.opacity = '0';
      el.offsetWidth; // force reflow
      el.style.transition = `opacity ${effect.seconds}s ease`;
      el.style.opacity = '1';

      if (effect.blocking) {
        this._waitForTransition(el, effect.seconds, () => onDone?.());
      } else {
        onDone?.();
      }
      return;
    }

    el.style.opacity = '';
    el.style.transition = '';
    onDone?.();
  }

  _applyFadeOut(el, effect, finish, onDone) {
    if (effect?.type === 'fade-out' && effect.seconds > 0) {
      const current = getComputedStyle(el).opacity;
      el.style.transition = 'none';
      el.style.opacity = current;
      el.offsetWidth; // force reflow

      el.style.transition = `opacity ${effect.seconds}s ease`;
      el.style.opacity = '0';
      el.style.pointerEvents = 'none';

      if (effect.blocking) {
        this._waitForTransition(el, effect.seconds, () => { finish(); onDone?.(); });
      } else {
        onDone?.();
        this._waitForTransition(el, effect.seconds, () => finish());
      }
      return;
    }

    finish();
    onDone?.();
  }
}
